import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const contract = await import(pathToFileURL(new URL("apps/restaurant/src/orders/orderContract.ts", root).pathname));
const model = await import(pathToFileURL(new URL("apps/restaurant/src/orders/orderModel.ts", root).pathname));
const acknowledgement = await import(pathToFileURL(new URL("apps/restaurant/src/orders/orderAcknowledgementModel.ts", root).pathname));
const read = path => fs.readFileSync(new URL(path, root), "utf8");

const item = { id: "line-1", menu_item_id: "menu-1", source_menu_item_id: "menu-1", name: "Soup", image_url: null, unit_price_kurus: 1200, customization_total_kurus: 100, quantity: 2, customizations: [] };
const order = { id: "order-1", restaurant_id: "restaurant-1", restaurant_name: "Restaurant", status: "pending", payment_method: "cash", subtotal_kurus: 2600, delivery_fee_kurus: 200, service_fee_kurus: 0, discount_kurus: 0, tip_kurus: 0, total_kurus: 2800, eta_minutes: 25, approval_deadline_at: "2026-09-23T20:00:00.000Z", reminder_pending: false, created_at: "2026-09-23T19:50:00.000Z", updated_at: "2026-09-23T19:51:00.000Z", items: [item] };

test("exact order and page parsing accepts the backend projection", () => {
  const parsed = contract.parseRestaurantOrder(order);
  assert.equal(parsed.id, order.id);
  assert.equal(parsed.status, order.status);
  assert.deepEqual(parsed.items, order.items);
  assert.deepEqual(contract.parseActiveOrderPage({ items: [order], has_more: true, next_cursor: "opaque" }).next_cursor, "opaque");
});

test("order parsing rejects unknown fields, malformed values, duplicates, and inactive rows", () => {
  for (const invalid of [
    { ...order, invented: true },
    { ...order, status: "invented" },
    { ...order, total_kurus: 1.5 },
    { ...order, updated_at: "yesterday" },
    { ...order, payment_method: "card" },
    { ...order, items: [item, item] },
  ]) assert.throws(() => contract.parseRestaurantOrder(invalid), contract.RestaurantOrderContractError);
  assert.throws(() => contract.parseActiveOrderPage({ items: [{ ...order, status: "delivered" }], has_more: false, next_cursor: null }));
  assert.throws(() => contract.parseActiveOrderPage({ items: [order, order], has_more: false, next_cursor: null }));
});

test("monotonic replacement retains newer local versions and deduplicates by page identity", () => {
  const older = { ...order, updated_at: "2026-09-23T19:50:00.000Z" };
  const newer = { ...order, status: "preparing", updated_at: "2026-09-23T19:52:00.000Z" };
  assert.equal(model.replaceOrdersMonotonically([newer], [older])[0], newer);
  assert.equal(model.replaceOrdersMonotonically([older], [newer])[0], newer);
});

test("mutation intents keep operation IDs for explicit retry and classify authoritative reloads", () => {
  const input = { orderId: order.id, expectedVersion: order.updated_at, target: "preparing", reason: null, message: "" };
  const first = model.getMutationIntent(input), retry = model.getMutationIntent(input);
  assert.equal(first.operationId, retry.operationId);
  assert.equal(model.classifyMutationResult(order, { ...order, status: "preparing", updated_at: "2026-09-23T19:52:00.000Z" }, "preparing"), "success");
  assert.equal(model.classifyMutationResult(order, { ...order, status: "canceled", updated_at: "2026-09-23T19:52:00.000Z" }, "preparing"), "conflict");
  assert.equal(model.classifyMutationResult(order, order, "preparing"), "unknown");
  assert.equal(model.mutationFailureKind({ code: "40001" }), "conflict");
  assert.equal(model.mutationFailureKind({ code: "42501" }), "denied");
  assert.equal(model.mutationFailureKind({ code: "22023" }), "known");
  assert.equal(model.mutationFailureKind(new TypeError("network")), "unknown");
});

test("deadline countdown advances from the latest dashboard server-time offset", () => {
  const reconciledAt = Date.parse("2026-09-23T19:00:05Z");
  const first = model.deadlineRemainingMs("2026-09-23T19:01:00Z", reconciledAt, "2026-09-23T19:00:00Z", reconciledAt);
  const second = model.deadlineRemainingMs("2026-09-23T19:01:00Z", reconciledAt + 1000, "2026-09-23T19:00:00Z", reconciledAt);
  assert.equal(first, 60_000);
  assert.equal(second, 59_000);
});

test("cancellation normalization trims and rejects unsafe or oversized messages", () => {
  assert.equal(contract.normalizeCancellationMessage("  hello  "), "hello");
  assert.throws(() => contract.normalizeCancellationMessage("x".repeat(501)));
  assert.throws(() => contract.normalizeCancellationMessage("bad\u0001value"));
  assert.deepEqual(contract.CANCELLATION_REASONS, ["too_busy", "item_unavailable", "closing", "equipment_issue", "delivery_unavailable", "other"]);
});

test("visibility dwell requires 50 percent for one continuous visible second", () => {
  const dwell = new acknowledgement.VisibilityDwell();
  assert.equal(dwell.update(.5, true, 0), false);
  assert.equal(dwell.update(.5, true, 999), false);
  assert.equal(dwell.update(.49, true, 1000), false);
  assert.equal(dwell.update(.8, true, 1500), false);
  assert.equal(dwell.update(.8, false, 2500), false);
  assert.equal(dwell.update(1, true, 3000), false);
  assert.equal(dwell.update(1, true, 4000), true);
  dwell.reset(); assert.equal(dwell.update(1, true, 5000), false);
});

test("acknowledgement intents are shared by order/version and reset for a new version", () => {
  const first = acknowledgement.getAcknowledgementIntent("order-a", "2026-09-23T19:00:00Z");
  const card = acknowledgement.getAcknowledgementIntent("order-a", "2026-09-23T19:00:00Z");
  const next = acknowledgement.getAcknowledgementIntent("order-a", "2026-09-23T19:01:00Z");
  assert.equal(first.operationId, card.operationId);
  assert.notEqual(first.operationId, next.operationId);
  acknowledgement.resetAcknowledgementIntents();
  assert.notEqual(first.operationId, acknowledgement.getAcknowledgementIntent("order-a", "2026-09-23T19:00:00Z").operationId);
});

test("repository is caller-bound and sends exact RPC arguments", () => {
  const source = read("apps/restaurant/src/orders/orderRepository.ts");
  assert.match(source, /p_queue: "active", p_cursor: cursor, p_limit:/);
  assert.match(source, /p_order_id: orderId, p_order_version: version, p_operation_id: operationId/);
  assert.match(source, /p_expected_version: expectedVersion, p_new_status: target/);
  assert.match(source, /restaurant_cancel_order_v2/);
  assert.doesNotMatch(source, /p_restaurant_id|restaurantId/);
});

test("one shared private channel dispatches invalidation while pages retain bounded recovery", () => {
  const runtime = read("apps/restaurant/src/RestaurantRuntimeContext.tsx");
  const allProduction = fs.readdirSync(new URL("apps/restaurant/src", root), { recursive: true }).filter(x => String(x).endsWith(".tsx") || String(x).endsWith(".ts")).map(x => read(`apps/restaurant/src/${x}`)).join("\n");
  assert.equal((allProduction.match(/restaurant-orders:v1:/g) || []).length, 1);
  assert.match(runtime, /orderEventRevision/);
  for (const path of ["apps/restaurant/src/orders/useActiveOrders.ts", "apps/restaurant/src/orders/useOrderDetail.ts"]) {
    const source = read(path);
    assert.match(source, /setInterval\(recover, pollMs\)/);
    assert.match(source, /addEventListener\("focus", recover\)/);
    assert.match(source, /addEventListener\("online", recover\)/);
    assert.match(source, /visibilitychange/);
    assert.match(source, /generation\.current/);
  }
});

test("UI keeps canonical deep links, truthful freshness, and no dashboard finance", () => {
  const orders = read("apps/restaurant/src/OrdersPage.tsx");
  const card = read("apps/restaurant/src/orders/OrderCard.tsx");
  const dashboard = read("apps/restaurant/src/DashboardPage.tsx");
  const acceptance = read("apps/restaurant/src/useRestaurantAcceptance.ts");
  assert.match(card, /\/orders\/detail\?orderId=/);
  assert.match(orders, /lastReconciledAt/);
  assert.match(dashboard, /data\.counts\.pending/);
  assert.match(dashboard, /data\.counts\.active/);
  assert.match(dashboard, /data\.counts\.unreadReviews/);
  assert.doesNotMatch(dashboard, /earnings|commission|sales|total_kurus/i);
  assert.match(dashboard, /useRestaurantAcceptance/);
  assert.match(acceptance, /target && runtime\.status !== "connected"/);
  assert.match(acceptance, /!target && !runtime\.online/);
  assert.match(acceptance, /const intents = new Map/);
});

test("visibility acknowledgement and mutation code never fire from fetch or realtime", () => {
  const active = read("apps/restaurant/src/orders/useActiveOrders.ts");
  const runtime = read("apps/restaurant/src/RestaurantRuntimeContext.tsx");
  const detail = read("apps/restaurant/src/orders/OrderDetailView.tsx");
  assert.doesNotMatch(active, /acknowledge|transition|cancel_order/);
  assert.doesNotMatch(runtime, /acknowledge_order_seen|transition_order|cancel_order/);
  assert.match(detail, /classifyMutationResult/);
  assert.match(detail, /never retried automatically/);
});

test("production sources and exported bundle contain no mock runtime, fixtures, secrets, or environment additions", () => {
  const production = ["apps/restaurant/app", "apps/restaurant/src"].flatMap(directory => fs.readdirSync(new URL(directory, root), { recursive: true }).filter(name => /\.(ts|tsx|css|json)$/.test(String(name))).map(name => read(`${directory}/${name}`))).join("\n");
  const forbiddenValues = ["restaurant-ui" + "-mock", "Mock" + "Provider", "fixture" + "-secrets", "restaurant-test" + "-passwords", "UI " + "STATE"];
  for (const forbidden of forbiddenValues) assert.doesNotMatch(production, new RegExp(forbidden, "i"));
  const diff = fs.existsSync(new URL("apps/restaurant/dist", root)) ? fs.readdirSync(new URL("apps/restaurant/dist", root), { recursive: true }).filter(name => /\.(js|css|html)$/.test(String(name))).map(name => read(`apps/restaurant/dist/${name}`)).join("\n") : "";
  for (const forbidden of forbiddenValues.slice(0, 4)) assert.doesNotMatch(diff, new RegExp(forbidden, "i"));
});
