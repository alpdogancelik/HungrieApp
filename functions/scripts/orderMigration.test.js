const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrderImportSql, normalizeOrder, normalizeStatus, toKurusExact, transformOrders } = require("./orderMigration");

const order = (overrides = {}) => ({ id: "order_1", data: {
  userId: "uid_1", restaurantId: "restaurant_1", status: "delivered", paymentMethod: "pos",
  customer: { name: "Test User", email: "test@example.invalid" },
  deliveryAddress: { label: "Home", line1: "Example 1", city: "Test City", country: "Test Country" },
  items: [{ menuItemId: "menu_1", name: "Meal", price: 10, quantity: 2, customizations: [] }],
  subtotal: 20, deliveryFee: 0, serviceFee: 1, discount: 0, tip: 0, total: 21,
  etaMinutes: 25, createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T11:00:00.000Z",
  deliveredAt: "2026-01-01T10:45:00.000Z", ...overrides,
} });

test("normalizes statuses and exact money", () => {
  assert.equal(normalizeStatus("accepted"), "preparing");
  assert.equal(normalizeStatus("cancelled"), "canceled");
  assert.equal(normalizeStatus("Teslim Edildi"), "delivered");
  assert.equal(toKurusExact("12.34"), 1234);
  assert.throws(() => toKurusExact("1.234"), /MONEY_INVALID_PRECISION/);
});

test("creates deterministic items and preserves legacy menu identity", () => {
  const first = normalizeOrder(order());
  const second = normalizeOrder(order());
  assert.equal(first.items[0].id, second.items[0].id);
  assert.equal(first.items[0].source_menu_item_id, "menu_1");
  assert.equal(first.items[0].unit_price_kurus, 1000);
});

test("validates header and item financial equations", () => {
  assert.throws(() => normalizeOrder(order({ total: 22 })), /ORDER_TOTAL_EQUATION_INVALID/);
  assert.throws(() => normalizeOrder(order({ subtotal: 19, total: 20 })), /ORDER_ITEM_SUBTOTAL_MISMATCH/);
  assert.throws(() => normalizeOrder(order({ items: [{ menuItemId: "m", name: "Meal", price: 10, quantity: 0 }] })), /ORDER_ITEM_QUANTITY_INVALID/);
});

test("blocks active, malformed snapshot, enum and timestamp records", () => {
  assert.throws(() => normalizeOrder(order({ status: "pending" })), /ACTIVE_ORDER_PRESENT/);
  assert.throws(() => normalizeOrder(order({ paymentMethod: "card" })), /PAYMENT_METHOD_INVALID/);
  assert.throws(() => normalizeOrder(order({ deliveryAddress: null })), /DELIVERY_ADDRESS_SNAPSHOT_MISSING/);
  assert.throws(() => normalizeOrder(order({ updatedAt: "2025-01-01T00:00:00Z" })), /TIMESTAMP_ORDER_INVALID/);
});

test("customizations are immutable snapshots included in subtotal", () => {
  const normalized = normalizeOrder(order({
    items: [{ menuItemId: "menu_1", name: "Meal", price: 10, quantity: 2, customizations: [{ id: "extra", name: "Extra", price: 2 }] }],
    subtotal: 24, total: 25,
  }));
  assert.equal(normalized.items[0].customization_total_kurus, 200);
  assert.deepEqual(normalized.items[0].customizations_snapshot, [{ id: "extra", name: "Extra", price_kurus: 200 }]);
});

test("normalizes Firebase cart prices that already include selected extras", () => {
  const entry = order({
    items: [{ menuItemId: "menu_1", name: "Meal", price: 12, quantity: 2, customizations: [{ id: "extra", name: "Extra", price: 2 }] }],
    subtotal: 24,
    total: 25,
  });
  entry.id = "order-inclusive";
  const normalized = normalizeOrder(entry);
  assert.equal(normalized.items[0].unit_price_kurus, 1000);
  assert.equal(normalized.items[0].customization_total_kurus, 200);
});

test("source order and staging checksums are stable across source ordering", () => {
  const a = order(); const b = order({ status: "canceled", deliveredAt: null, canceledAt: "2026-01-01T10:30:00Z" }); b.id = "order_2";
  const first = transformOrders({ documents: { orders: [a, b], relationshipEvidence: {} } });
  const second = transformOrders({ documents: { orders: [b, a], relationshipEvidence: {} } });
  assert.equal(first.sourceChecksum, second.sourceChecksum);
  assert.equal(first.stagedChecksum, second.stagedChecksum);
  assert.deepEqual(first.statusCounts, { canceled: 1, delivered: 1 });
});

test("generated SQL is deterministic and malformed records block promotion", () => {
  const valid = transformOrders({ documents: { orders: [order()], relationshipEvidence: {} } });
  const generated1 = buildOrderImportSql(valid, "hungrieapp-a2288");
  const generated2 = buildOrderImportSql(valid, "hungrieapp-a2288");
  assert.equal(generated1.sql, generated2.sql);
  assert.match(generated1.sql, /promote_order_import/);
  const invalid = transformOrders({ documents: { orders: [order({ paymentMethod: "unknown" })], relationshipEvidence: {} } });
  assert.equal(invalid.rejections.length, 1);
  assert.doesNotMatch(buildOrderImportSql(invalid, "hungrieapp-a2288").sql, /perform migration\.promote_order_import/);
});

test("only the explicitly approved missing-address exception can quarantine instead of blocking", () => {
  const missingAddress = transformOrders({ documents: { orders: [order({ deliveryAddress: null, updatedAt: 1767265200000 })], relationshipEvidence: {} } });
  const approved = buildOrderImportSql(missingAddress, "hungrieapp-a2288", ["DELIVERY_ADDRESS_SNAPSHOT_MISSING"]);
  assert.match(approved.sql, /approved_exception/);
  assert.match(approved.sql, /perform migration\.promote_order_import/);
  assert.doesNotMatch(approved.sql, /insert into migration\.import_rejections/);
  assert.match(approved.sql, /2026-01-01T11:00:00\.000Z/);
  assert.throws(
    () => buildOrderImportSql(missingAddress, "hungrieapp-a2288", ["ORDER_TOTAL_EQUATION_INVALID"]),
    /QUARANTINE_CODE_NOT_APPROVABLE/,
  );
});
