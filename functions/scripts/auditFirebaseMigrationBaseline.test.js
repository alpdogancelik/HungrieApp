const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFirestoreBaseline,
  classifyField,
  collectionPattern,
  createCollectionSummary,
  finalizeSchema,
  normalizeStatus,
  recordDocumentShape,
  toKurus,
} = require("./auditFirebaseMigrationBaseline");

test("normalizes legacy order statuses", () => {
  assert.equal(normalizeStatus("accepted"), "preparing");
  assert.equal(normalizeStatus("rejected"), "canceled");
  assert.equal(normalizeStatus("cancelled"), "canceled");
  assert.equal(normalizeStatus("teslim edildi"), "delivered");
});

test("converts valid TRY values to integer kurus", () => {
  assert.equal(toKurus(12.5), 1250);
  assert.equal(toKurus("12.50"), 1250);
  assert.equal(toKurus("not-money"), null);
});

test("normalizes discovered subcollection paths without retaining document IDs", () => {
  assert.equal(collectionPattern("users/private-user-id/addresses"), "users/{document}/addresses");
});

test("tracks document-level presence for nested array fields", () => {
  const summary = createCollectionSummary();
  recordDocumentShape(summary, { items: [{ name: "One" }, { name: "Two" }] });
  recordDocumentShape(summary, { items: [] });
  const schema = finalizeSchema({ orders: summary });

  assert.equal(schema.orders.fields["items[].name"].present, 1);
  assert.equal(schema.orders.fields["items[].name"].presencePercent, 50);
  assert.equal(schema.orders.fields["items"].present, 2);
});

test("classifies sensitive and financial fields conservatively", () => {
  assert.deepEqual(classifyField("users/{document}/pushTokens", "token"), ["credential/token"]);
  assert.ok(classifyField("users/{document}/addresses", "line1").includes("sensitive personal"));
  assert.ok(classifyField("orders", "total").includes("financial"));
  assert.ok(!classifyField("restaurants", "ownerEmail").includes("public"));
});

test("builds aggregate baselines without serializing source values or IDs", () => {
  const records = {
    users: [
      {
        id: "private-user-id",
        data: {
          email: "private@example.com",
          favoriteIds: ["restaurant-1"],
          defaultAddress: { line1: "Private address" },
        },
      },
    ],
    restaurants: [{ id: "restaurant-1", data: { ownerId: "private-user-id", isActive: true } }],
    restaurantStaff: [{ id: "private-user-id", data: { restaurantId: "restaurant-1" } }],
    categories: [{ id: "category-1", data: { restaurantId: "restaurant-1" } }],
    menus: [{ id: "menu-1", data: { restaurantId: "restaurant-1", price: 10 } }],
    orders: [
      {
        id: "order-1",
        data: {
          userId: "private-user-id",
          restaurantId: "restaurant-1",
          status: "accepted",
          subtotal: 10,
          deliveryFee: 2,
          serviceFee: 1,
          discount: 1,
          tip: 0,
          total: 12,
        },
      },
    ],
    reviews: [
      {
        id: "review-1",
        data: {
          orderId: "order-1",
          restaurantId: "restaurant-1",
          menuItemId: "menu-1",
          userId: "private-user-id",
          rating: 5,
        },
      },
    ],
    orderReviews: [],
    "users/{document}/addresses": [
      { id: "address-1", parentId: "private-user-id", data: { isDefault: true, line1: "Private address" } },
    ],
    "users/{document}/pushTokens": [
      { id: "token-id", parentId: "private-user-id", data: { token: "private-token", provider: "fcm", platform: "android" } },
    ],
  };

  const baseline = buildFirestoreBaseline(records);
  const serialized = JSON.stringify(baseline);

  assert.equal(baseline.orders.total, 1);
  assert.equal(baseline.orders.active, 1);
  assert.equal(baseline.orders.inconsistentFinancialEquation, 0);
  assert.equal(baseline.orders.financialTotalsKurus.total, 1200);
  assert.equal(baseline.reviews.productRating.average, 5);
  assert.equal(baseline.pushTokens.total, 1);
  assert.ok(!serialized.includes("private@example.com"));
  assert.ok(!serialized.includes("Private address"));
  assert.ok(!serialized.includes("private-token"));
  assert.ok(!serialized.includes("private-user-id"));
});
