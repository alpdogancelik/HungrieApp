import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EarningsPageStack, EarningsRangeError, RequestGeneration, earningsBucketForRange, earningsRangeForPreset, localDateAt, validateEarningsRange } from "../apps/restaurant/src/earningsModel.ts";
import { isActiveRestaurantOwner, parseRestaurantAccessContext } from "../apps/restaurant/src/RestaurantAccessContext.ts";
import { EarningsRepositoryError, classifyEarningsError, createEarningsRepository, parseEarningsPage, parseEarningsSeries, parseEarningsSummary, validateEarningsBundle } from "../apps/restaurant/src/earningsRepository.ts";

const breakdown = (gross, commission, count) => ({ eligibleGrossKurus: gross, commissionKurus: commission, estimatedNetKurus: gross - commission, deliveredOrderCount: count });
const identity = { restaurantId: "restaurant-1", from: "2026-09-01", to: "2026-09-30", reportingTimezone: "Asia/Famagusta", currencyCode: "TRY" };
const summary = { ...identity, ...breakdown(30_000, 2_400, 2), paymentBreakdown: { cash: breakdown(10_000, 800, 1), pos: breakdown(20_000, 1_600, 1) } };
const points = [
  { bucketStart: "2026-09-10", ...breakdown(10_000, 800, 1), paymentBreakdown: { cash: breakdown(10_000, 800, 1), pos: breakdown(0, 0, 0) } },
  { bucketStart: "2026-09-11", ...breakdown(20_000, 1_600, 1), paymentBreakdown: { cash: breakdown(0, 0, 0), pos: breakdown(20_000, 1_600, 1) } },
];
const series = { ...identity, bucket: "day", points };
const items = [
  { orderReference: "ABCDEF12", deliveredAt: "2026-09-11T10:00:00Z", paymentMethod: "pos", currencyCode: "TRY", eligibleGrossKurus: 20_000, commissionRateBps: 800, commissionKurus: 1_600, estimatedNetKurus: 18_400 },
  { orderReference: "1234ABCD", deliveredAt: "2026-09-10T10:00:00Z", paymentMethod: "cash", currencyCode: "TRY", eligibleGrossKurus: 10_000, commissionRateBps: 800, commissionKurus: 800, estimatedNetKurus: 9_200 },
];
const page = { ...identity, limit: 25, items, nextCursor: "opaque-next-value" };
const owner = { state: "resolved", profileId: "profile-1", accountType: "restaurant", accountStatus: "active", onboardingStep: "none", restaurantId: "restaurant-1", restaurantRole: "owner", restaurantStatus: "active", acceptingOrders: true };

test("range validation accepts one and 366 inclusive local dates and rejects reversed, 367, and invalid dates", () => {
  assert.equal(validateEarningsRange({ from: "2026-09-22", to: "2026-09-22" }), 1);
  assert.equal(validateEarningsRange({ from: "2024-03-01", to: "2025-03-01" }), 366);
  assert.throws(() => validateEarningsRange({ from: "2026-09-23", to: "2026-09-22" }), EarningsRangeError);
  assert.throws(() => validateEarningsRange({ from: "2024-02-29", to: "2025-03-01" }), EarningsRangeError);
  assert.throws(() => validateEarningsRange({ from: "2026-02-30", to: "2026-03-01" }), EarningsRangeError);
});

test("presets implement today, trailing seven dates, full month, leap day, and year rollover in the Restaurant timezone", () => {
  const instant = new Date("2026-01-01T00:30:00Z");
  assert.deepEqual(earningsRangeForPreset("day", "Asia/Famagusta", instant), { from: "2026-01-01", to: "2026-01-01" });
  assert.deepEqual(earningsRangeForPreset("week", "Asia/Famagusta", instant), { from: "2025-12-26", to: "2026-01-01" });
  assert.deepEqual(earningsRangeForPreset("month", "Asia/Famagusta", instant), { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual(earningsRangeForPreset("month", "Asia/Famagusta", new Date("2024-02-29T12:00:00Z")), { from: "2024-02-01", to: "2024-02-29" });
  assert.equal(localDateAt(new Date("2026-03-28T22:30:00Z"), "Asia/Famagusta"), "2026-03-29");
});

test("automatic series density changes exactly at 31/32 and 180/181 without expanding the requested range", () => {
  assert.equal(earningsBucketForRange({ from: "2026-01-01", to: "2026-01-31" }), "day");
  assert.equal(earningsBucketForRange({ from: "2026-01-01", to: "2026-02-01" }), "week");
  assert.equal(earningsBucketForRange({ from: "2026-01-01", to: "2026-06-29" }), "week");
  assert.equal(earningsBucketForRange({ from: "2026-01-01", to: "2026-06-30" }), "month");
  const partialIdentity = { ...identity, from: "2026-09-01", to: "2026-09-07" };
  const partialSummary = { ...summary, ...partialIdentity };
  const partialSeries = { ...series, ...partialIdentity, bucket: "week", points: [{ bucketStart: "2026-08-31", ...breakdown(30_000, 2_400, 2), paymentBreakdown: partialSummary.paymentBreakdown }] };
  const partialPage = { ...page, ...partialIdentity, items: [{ ...items[0], deliveredAt: "2026-09-02T10:00:00Z" }, { ...items[1], deliveredAt: "2026-09-01T10:00:00Z" }] };
  validateEarningsBundle(partialSummary, partialSeries, partialPage, { restaurantId: identity.restaurantId, from: partialIdentity.from, to: partialIdentity.to, bucket: "week" });
});

test("summary, series, and page parsers enforce exact contracts and reconciliation", () => {
  const parsedSummary = parseEarningsSummary(summary), parsedSeries = parseEarningsSeries(series), parsedPage = parseEarningsPage(page);
  validateEarningsBundle(parsedSummary, parsedSeries, parsedPage, { restaurantId: identity.restaurantId, from: identity.from, to: identity.to, bucket: "day" });
  for (const invalid of [
    { ...summary, extra: true },
    { ...summary, currencyCode: "EUR" },
    { ...summary, reportingTimezone: "Invalid/Zone" },
    { ...summary, from: "2026-02-30" },
    { ...summary, estimatedNetKurus: 1 },
    { ...summary, paymentBreakdown: { ...summary.paymentBreakdown, cash: { ...summary.paymentBreakdown.cash, deliveredOrderCount: 2 } } },
  ]) assert.throws(() => parseEarningsSummary(invalid), EarningsRepositoryError);
  assert.throws(() => parseEarningsSeries({ ...series, bucket: "quarter" }), EarningsRepositoryError);
  assert.throws(() => parseEarningsSeries({ ...series, points: [...points].reverse() }), EarningsRepositoryError);
  assert.throws(() => parseEarningsPage({ ...page, items: [{ ...items[0], orderReference: "unsafe-ref" }] }), EarningsRepositoryError);
  assert.throws(() => parseEarningsPage({ ...page, items: [{ ...items[0], paymentMethod: "card" }] }), EarningsRepositoryError);
  assert.throws(() => parseEarningsPage({ ...page, nextCursor: "" }), EarningsRepositoryError);
  assert.throws(() => parseEarningsPage({ ...page, items: [{ ...items[0], deliveredAt: "2026-09-11" }] }), EarningsRepositoryError);
});

test("page contract accepts server limits 1, 25, and 50 while bundle requires explicit Phase 3 size 25", () => {
  assert.equal(parseEarningsPage({ ...page, limit: 1, items: [items[0]] }).limit, 1);
  assert.equal(parseEarningsPage(page).limit, 25);
  assert.equal(parseEarningsPage({ ...page, limit: 50 }).limit, 50);
  assert.throws(() => parseEarningsPage({ ...page, limit: 0 }), EarningsRepositoryError);
  assert.throws(() => parseEarningsPage({ ...page, limit: 51 }), EarningsRepositoryError);
  assert.throws(() => validateEarningsBundle(summary, series, { ...page, limit: 50 }, { restaurantId: identity.restaurantId, from: identity.from, to: identity.to, bucket: "day" }), EarningsRepositoryError);
});

test("opaque cursors are forwarded unchanged, null ends pagination, previous pages remain in memory, and reset clears them", () => {
  const stack = new EarningsPageStack();
  stack.reset(page); stack.push({ ...page, nextCursor: null });
  assert.equal(stack.pageNumber(), 2); assert.equal(stack.previous(), page); assert.equal(stack.nextLoaded().nextCursor, null);
  stack.reset({ ...page, nextCursor: "different-opaque" }); assert.equal(stack.pageNumber(), 1); assert.equal(stack.size(), 1); assert.equal(stack.nextLoaded(), null);
});

test("request generations reject older range results", () => {
  const requests = new RequestGeneration(), first = requests.begin(), pagination = requests.capture(), second = requests.begin();
  assert.equal(first, pagination); assert.equal(requests.current(first), false); assert.equal(requests.current(pagination), false); assert.equal(requests.current(second), true);
});

test("repository invokes only approved owner-scoped RPCs with exact arguments and forwards opaque cursor", async () => {
  const calls = [];
  const client = { rpc(name, args) { calls.push({ name, args }); const data = name.includes("summary") ? summary : name.includes("series") ? series : page; return Promise.resolve({ data, error: null }); } };
  const repository = createEarningsRepository(client);
  await repository.summary(identity.from, identity.to); await repository.series(identity.from, identity.to, "day"); await repository.page(identity.from, identity.to, "opaque-next-value");
  assert.deepEqual(calls, [
    { name: "restaurant_get_earnings_summary_v1", args: { p_from: identity.from, p_to: identity.to } },
    { name: "restaurant_get_earnings_series_v1", args: { p_from: identity.from, p_to: identity.to, p_bucket: "day" } },
    { name: "restaurant_get_earnings_orders_page_v1", args: { p_from: identity.from, p_to: identity.to, p_cursor: "opaque-next-value", p_limit: 25 } },
  ]);
});

test("repository classifies permission, validation, network, service, and malformed responses without leaking messages", async () => {
  assert.equal(classifyEarningsError({ code: "42501", message: "Restaurant owner required" }), "permission_denied");
  assert.equal(classifyEarningsError({ code: "22023" }), "validation"); assert.equal(classifyEarningsError({ status: 0 }), "network"); assert.equal(classifyEarningsError({ status: 503 }), "service_unavailable");
  const repository = createEarningsRepository({ rpc() { return Promise.resolve({ data: null, error: { status: 503, message: "private database detail" } }); } });
  await assert.rejects(() => repository.summary(identity.from, identity.to), (error) => error instanceof EarningsRepositoryError && error.message === "service_unavailable" && !error.message.includes("database"));
});

test("Restaurant access parsing retains one validated provider context and owner gating denies every other branch", () => {
  assert.deepEqual(parseRestaurantAccessContext(owner), owner); assert.equal(isActiveRestaurantOwner(owner), true);
  for (const value of [{ ...owner, restaurantRole: "manager" }, { ...owner, accountStatus: "pending" }, { ...owner, accountStatus: "suspended" }, { ...owner, accountStatus: "revoked" }, { ...owner, restaurantStatus: "pending" }, { ...owner, restaurantStatus: "suspended" }, { ...owner, restaurantStatus: "closed" }, null]) assert.equal(isActiveRestaurantOwner(value), false);
  assert.deepEqual(parseRestaurantAccessContext({ state: "unmapped" }), { state: "unmapped" });
  assert.equal(isActiveRestaurantOwner(parseRestaurantAccessContext({ state: "resolved", accountType: "customer" })), false);
  assert.equal(isActiveRestaurantOwner(parseRestaurantAccessContext({ state: "resolved", accountType: "admin" })), false);
  assert.throws(() => parseRestaurantAccessContext({ ...owner, extra: true })); assert.throws(() => parseRestaurantAccessContext({ ...owner, restaurantRole: "finance" }));
  const gate = readFileSync(new URL("../apps/restaurant/src/AuthGate.tsx", import.meta.url), "utf8"); assert.match(gate, /instanceof RestaurantAccessContextError/); assert.match(gate, /setAccessContext\(null\)/);
});

test("real route source preserves offline data in memory, exposes bilingual states, and never calculates commission", () => {
  const source = readFileSync(new URL("../apps/restaurant/src/EarningsPage.tsx", import.meta.url), "utf8");
  assert.match(source, /navigator\.onLine/); assert.match(source, /setStale\(Boolean\(bundle\)\)/); assert.match(source, /reconnecting/); assert.match(source, /estimatedNetKurus/);
  assert.match(source, /Calculated estimate/); assert.match(source, /Hesaplanan tahmini değer/); assert.match(source, /not payouts/); assert.match(source, /ödeme/);
  assert.doesNotMatch(source, /commissionRateBps\s*\*|eligibleGrossKurus\s*\*|localStorage|sessionStorage|caches\.|serviceWorker.*earnings/i);
});
