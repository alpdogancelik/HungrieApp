import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createCommissionRepository } from "../apps/admin-web/lib/commissionRepository.ts";
import { StableVirtualPosCommissionOperation } from "../apps/admin-web/lib/commissionManagementModel.ts";

const restaurantId = "fixture_restaurant_a";
const rule = { id: "d1000000-0000-4000-8000-000000000001", rateBps: 300, financialContractVersion: 1, providerContractVersion: "provisional-v1", effectiveFrom: "2030-01-01T00:00:00.000Z", createdAt: "2026-10-07T00:00:00.000Z", reason: "Foundation fixture" };
const foundation = { restaurantId, activationState: "unconfigured", customerAvailable: false, providerConfigured: false, currentRule: null, nextScheduledRule: rule, history: [rule], historyHasMore: false };
const result = { ruleId: rule.id, restaurantId, rateBps: 300, financialContractVersion: 1, providerContractVersion: "provisional-v1", effectiveFrom: rule.effectiveFrom, reason: rule.reason, operationId: "d2000000-0000-4000-8000-000000000001", replayed: false };

test("Admin repository maps disabled readiness and sends only provider-neutral commission metadata", async () => {
  const calls = [];
  const repository = createCommissionRepository({ rpc(name, args) { calls.push({ name, args }); return Promise.resolve({ data: name.includes("schedule_virtual") ? result : foundation, error: null }); } });
  assert.deepEqual(await repository.getVirtualPosFoundation(restaurantId), foundation);
  assert.deepEqual(await repository.scheduleVirtualPos({ restaurantId, rateBps: 300, effectiveFrom: rule.effectiveFrom, providerContractVersion: rule.providerContractVersion, reason: rule.reason, operationId: result.operationId }), result);
  assert.deepEqual(calls.map((entry) => entry.name), ["admin_get_virtual_pos_foundation_v1", "admin_schedule_virtual_pos_commission_v1"]);
  assert.equal(JSON.stringify(calls).match(/card|pan|cvv|secret/gi), null);
});

test("Virtual POS commission retry identity changes with commercial metadata", () => {
  let sequence = 0;
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` } });
  try {
    const operations = new StableVirtualPosCommissionOperation();
    const draft = { restaurantId, rateBps: 300, effectiveFromUtc: rule.effectiveFrom, reason: rule.reason, providerContractVersion: "provisional-v1" };
    assert.equal(operations.prepare(draft), operations.prepare(draft));
    assert.notEqual(operations.prepare(draft), operations.prepare({ ...draft, providerContractVersion: "provisional-v2" }));
  } finally { Object.defineProperty(globalThis, "crypto", { configurable: true, value: original }); }
});

test("Customer checkout exposes cash and physical POS only", () => {
  const checkout = readFileSync(new URL("../mobile/src/features/cartCheckout/CheckoutScreen.tsx", import.meta.url), "utf8");
  const types = readFileSync(new URL("../mobile/src/domain/types.ts", import.meta.url), "utf8");
  assert.match(checkout, /setPaymentMethod\("pos"\)/);
  assert.match(checkout, /setPaymentMethod\("cash"\)/);
  assert.doesNotMatch(checkout, /virtual_pos|pay online|online card/i);
  assert.match(types, /PaymentMethod = "cash" \| "pos"/);
});

test("Admin and Restaurant copy are explicit about disabled and estimated status", () => {
  const admin = readFileSync(new URL("../apps/admin-web/components/AdminRestaurantCommissionPage.tsx", import.meta.url), "utf8");
  const earnings = readFileSync(new URL("../apps/restaurant/src/EarningsPage.tsx", import.meta.url), "utf8");
  assert.match(admin, /Online payments: Disabled/);
  assert.doesNotMatch(admin, /setActivation|customerAvailable:\s*true/);
  assert.match(earnings, /Estimated Virtual POS commission/);
  assert.match(earnings, /Provider fee not yet reconciled/);
});
