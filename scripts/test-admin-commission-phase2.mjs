import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CommissionValidationError, StableCommissionOperation, canonicalCommissionDraft, isRecentAuthentication, parsePercentageToBasisPoints, restaurantLocalToUtc, schedulingAccess, validateCommissionReason } from "../apps/admin-web/lib/commissionManagementModel.ts";
import { CommissionRepositoryError, classifyCommissionError, createCommissionRepository } from "../apps/admin-web/lib/commissionRepository.ts";

const ids = {
  rule: "11111111-1111-4111-8111-111111111111",
  next: "22222222-2222-4222-8222-222222222222",
  warning: "33333333-3333-4333-8333-333333333333",
  operation: "44444444-4444-4444-8444-444444444444",
};
const currentRule = { id: ids.rule, rateBps: 800, contractVersion: 1, effectiveFrom: "2026-01-02T00:00:00+00:00", createdAt: "2026-01-01T12:00:00+00:00", reason: "Initial rule" };
const commission = { restaurantId: "restaurant-1", reportingTimezone: "Asia/Famagusta", capabilityEnabled: false, currentRule, nextScheduledRule: { ...currentRule, id: ids.next, rateBps: 950, effectiveFrom: "2026-10-01T06:00:00+00:00", reason: "Autumn rate" }, history: [currentRule], historyHasMore: true, warnings: [{ id: ids.warning, type: "missing_order_terms", details: { orderReference: "abcdef123456" }, firstDetectedAt: "2026-09-22T06:00:00+00:00", lastDetectedAt: "2026-09-22T06:05:00+00:00", occurrenceCount: 2 }] };
const restaurant = { id: "restaurant-1", name: "Fixture Restaurant", description: "Description", cuisine: "Local", address: "Address", phone: null, image_url: null, lifecycle_status: "active", accepting_orders: true, suspension_reason_code: null, delivery_eta_min_minutes: 20, delivery_eta_max_minutes: 30, delivery_fee_kurus: 15000, minimum_order_kurus: 40000, opening_hours: {}, preferred_language: "tr", created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-09-22T00:00:00+00:00", accounts: [{ profileId: "profile-1", name: "Owner", maskedEmail: "o***@example.test", role: "owner", status: "active", onboardingStep: "none" }] };
const superAdmin = { state: "resolved", profileId: "admin-1", accountType: "admin", accountStatus: "active", onboardingStep: "none", adminRole: "super_admin", emailVerified: true, currentSessionMfaVerified: true };

const fakeClient = (resolver) => {
  const calls = [];
  return { calls, rpc(name, args) { calls.push({ name, args }); return Promise.resolve(resolver(name, args)); } };
};

test("percentage parsing converts accepted English and Turkish text to exact integer basis points", () => {
  assert.deepEqual(["0", "0.00", "8", "8.5", "8.50", "8,50", "100", "100.00"].map(parsePercentageToBasisPoints), [0, 0, 800, 850, 850, 850, 10000, 10000]);
});

test("percentage parsing rejects boundaries and non-canonical formats", () => {
  for (const value of ["", "-1", "+1", "100.01", "101", "1.001", "1,000", "1.2.3", "1,2.3", "1e2", ".5", "01"]) {
    assert.throws(() => parsePercentageToBasisPoints(value), CommissionValidationError, value);
  }
});

test("reason validation mirrors Phase 1 trimming and 1-500 character limit", () => {
  assert.equal(validateCommissionReason(" reason "), "reason");
  assert.equal(validateCommissionReason("a"), "a");
  assert.equal(validateCommissionReason("a".repeat(500)).length, 500);
  assert.throws(() => validateCommissionReason("   "), CommissionValidationError);
  assert.throws(() => validateCommissionReason("a".repeat(501)), CommissionValidationError);
});

test("Restaurant-local conversion returns exact UTC and rejects DST gaps and overlaps", () => {
  assert.equal(restaurantLocalToUtc("2026-09-22T09:00", "Asia/Famagusta"), "2026-09-22T06:00:00.000Z");
  assert.throws(() => restaurantLocalToUtc("2026-03-29T03:30", "Asia/Famagusta"), /nonexistent/);
  assert.throws(() => restaurantLocalToUtc("2026-10-25T03:30", "Asia/Famagusta"), /ambiguous/);
  assert.throws(() => restaurantLocalToUtc("2026-09-22T09:00", "Invalid\/Zone"), /timezone/);
});

test("canonical drafts retain operation IDs for exact retry and replace them only after input changes", () => {
  let sequence = 0; const stable = new StableCommissionOperation(() => `operation-${++sequence}`);
  const draft = { restaurantId: "restaurant-1", rateBps: 850, effectiveFromUtc: "2026-09-22T06:00:00.000Z", reason: "Reason" };
  assert.equal(canonicalCommissionDraft(draft), '["restaurant-1",850,"2026-09-22T06:00:00.000Z","Reason"]');
  const first = stable.prepare(draft); assert.equal(stable.prepare({ ...draft }), first); assert.equal(stable.current(), first);
  assert.notEqual(stable.prepare({ ...draft, reason: "Changed" }), first);
  stable.clear(); assert.equal(stable.current(), null); assert.equal(stable.prepare(draft), "operation-3");
});

test("authorization is actionable only for active MFA super-admins and non-closed Restaurants", () => {
  assert.equal(schedulingAccess(superAdmin, "active"), "allowed");
  assert.equal(schedulingAccess({ ...superAdmin, adminRole: "admin" }, "active"), "read_only");
  assert.equal(schedulingAccess(superAdmin, "closed"), "lifecycle_restricted");
  for (const context of [{ ...superAdmin, accountStatus: "suspended" }, { ...superAdmin, accountStatus: "revoked" }, { ...superAdmin, currentSessionMfaVerified: false }, { state: "unmapped" }, { state: "configuration_error", referenceId: "ref" }, null]) assert.equal(schedulingAccess(context, "active"), "unauthorized");
  assert.equal(schedulingAccess(superAdmin, "pending"), "allowed"); assert.equal(schedulingAccess(superAdmin, "suspended"), "allowed");
});

test("four-minute recent-auth preflight is conservative and non-authoritative", () => {
  const now = Date.UTC(2026, 8, 22, 12, 0, 0);
  assert.equal(isRecentAuthentication(now / 1000 - 239, now), true);
  assert.equal(isRecentAuthentication(now / 1000 - 241, now), false);
  assert.equal(isRecentAuthentication(undefined, now), false);
});

test("repository strictly maps all four RPC responses and sends exact scheduling arguments", async () => {
  const client = fakeClient((name, args) => {
    if (name === "admin_get_restaurant_v1") return { data: restaurant, error: null };
    if (name === "get_my_access_context_v1") return { data: superAdmin, error: null };
    if (name === "admin_get_restaurant_commission_v1") return { data: commission, error: null };
    return { data: { ruleId: ids.next, restaurantId: args.p_restaurant_id, rateBps: args.p_rate_bps, contractVersion: 1, effectiveFrom: "2026-09-22T06:00:00+00:00", reason: args.p_reason, operationId: args.p_operation_id, replayed: true }, error: null };
  });
  const repository = createCommissionRepository(client);
  assert.equal((await repository.getRestaurant("restaurant-1")).lifecycleStatus, "active");
  assert.equal((await repository.getAccessContext()).state, "resolved");
  const loaded = await repository.getCommission("restaurant-1"); assert.equal(loaded.historyHasMore, true); assert.equal(loaded.warnings[0].details.orderReference, "abcdef123456");
  const input = { restaurantId: "restaurant-1", rateBps: 850, effectiveFrom: "2026-09-22T06:00:00.000Z", reason: "Reason", operationId: ids.operation };
  const result = await repository.schedule(input); assert.equal(result.replayed, true);
  assert.deepEqual(client.calls.at(-1), { name: "admin_schedule_restaurant_commission_v1", args: { p_restaurant_id: "restaurant-1", p_rate_bps: 850, p_effective_from: "2026-09-22T06:00:00.000Z", p_reason: "Reason", p_operation_id: ids.operation } });
});

test("repository rejects malformed responses, unsafe warnings, identity mismatches, and unknown fields", async () => {
  const malformed = async (payload, method = "getCommission") => {
    const repository = createCommissionRepository(fakeClient(() => ({ data: payload, error: null })));
    await assert.rejects(() => repository[method]("restaurant-1"), (error) => error instanceof CommissionRepositoryError && error.code === "malformed_response");
  };
  await malformed({ ...commission, reportingTimezone: "Invalid/Zone" });
  await malformed({ ...commission, warnings: [{ ...commission.warnings[0], details: { orderReference: "full-order-id", customerEmail: "unsafe@example.test" } }] });
  await malformed({ ...commission, restaurantId: "restaurant-2" });
  await malformed({ ...commission, unexpected: true });
  await malformed({ ...restaurant, lifecycle_status: "deleted" }, "getRestaurant");
});

test("repository classifies permission, freshness, conflicts, validation, network, and service failures without raw messages", async () => {
  assert.equal(classifyCommissionError({ code: "42501", message: "Recent authentication required" }), "recent_auth_required");
  assert.equal(classifyCommissionError({ code: "42501", message: "Active MFA-authenticated Admin required" }), "permission_denied");
  assert.equal(classifyCommissionError({ code: "22023", message: "Operation ID was already used for another request" }), "operation_conflict");
  assert.equal(classifyCommissionError({ code: "22023", message: "Commission rule already exists at this effective time" }), "duplicate_effective_time");
  assert.equal(classifyCommissionError({ code: "22023", message: "Effective time would change an existing order rule" }), "retroactive_rule");
  assert.equal(classifyCommissionError({ code: "22023", message: "bad input" }), "validation");
  assert.equal(classifyCommissionError({ status: 0 }), "network");
  assert.equal(classifyCommissionError({ status: 503, message: "database unavailable" }), "service_unavailable");
  const repository = createCommissionRepository(fakeClient(() => ({ data: null, error: { status: 503, message: "sensitive database unavailable" } })));
  await assert.rejects(() => repository.getCommission("restaurant-1"), (error) => error instanceof CommissionRepositoryError && error.message === "service_unavailable" && !error.message.includes("database"));
});

test("Admin component exposes accessible confirmation and never renders actionable controls for denied access branches", () => {
  const source = readFileSync(new URL("../apps/admin-web/components/AdminRestaurantCommissionPage.tsx", import.meta.url), "utf8");
  assert.match(source, /role="dialog"/); assert.match(source, /aria-modal="true"/); assert.match(source, /event\.key === "Escape"/); assert.match(source, /access === "allowed" \? <form/);
  assert.match(source, /active `super_admin`|active, MFA-verified Admin|etkin ve MFA doğrulanmış bir Yönetici/);
  assert.doesNotMatch(source, /window\.confirm|\bconfirm\(/);
});
