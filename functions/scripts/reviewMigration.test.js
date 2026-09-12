const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewImportSql, normalizeProductReview, relationshipReasonCodes, resolveMenuItemId, transformReviews } = require("./reviewMigration");

const product = (overrides = {}) => ({ id: "review_1", data: { orderId: "order_1", restaurantId: "restaurant_1", itemId: "menu_1", userId: "uid_1", userName: "Test User", itemName: "Meal", rating: 4, status: "published", createdAt: "2026-01-02T03:04:05.000Z", ...overrides } });

test("normalizes aliases and stable timestamps", () => {
  assert.equal(resolveMenuItemId({ itemId: "menu_1" }), "menu_1");
  assert.equal(resolveMenuItemId({ menuItemId: "menu_1" }), "menu_1");
  assert.equal(resolveMenuItemId({ itemId: "menu_1", menuItemId: "menu_1" }), "menu_1");
  assert.throws(() => resolveMenuItemId({ itemId: "a", menuItemId: "b" }), /MENU_ITEM_ID_CONFLICT/);
  assert.equal(normalizeProductReview(product()).comment, "");
});

test("rejects malformed ratings, timestamps, snapshots and text limits", () => {
  for (const [field, value, code] of [["rating", 6, "RATING_INVALID"], ["createdAt", "bad", "TIMESTAMP_INVALID"], ["userName", "", "USER_SNAPSHOT_MISSING"], ["comment", "x".repeat(501), "COMMENT_TOO_LONG"]]) {
    assert.throws(() => normalizeProductReview(product({ [field]: value })), new RegExp(code));
  }
});

test("relationship reasons are deterministic and never use email", () => {
  const row = normalizeProductReview(product());
  assert.deepEqual(relationshipReasonCodes({ review: row }), ["MENU_ITEM_NOT_IMPORTED", "ORDER_ITEM_NOT_FOUND", "ORDER_NOT_IMPORTED", "PROFILE_NOT_IMPORTED", "RESTAURANT_NOT_IMPORTED"]);
  assert.deepEqual(relationshipReasonCodes({ review: row, profileIds: new Set(["uid_1"]), orders: new Map([["order_1", { profile_id: "uid_1", restaurant_id: "restaurant_1", status: "delivered" }]]), restaurantIds: new Set(["restaurant_1"]), menuItems: new Map([["menu_1", { restaurant_id: "restaurant_1" }]]), orderItems: new Set(["order_1\0menu_1"]) }), []);
});

test("transform and generated import are checksum-stable and idempotent", () => {
  const documents = { reviews: [product()], orderReviews: [], relationshipEvidence: { orders: [{ id: "order_1", status: "missing" }] } };
  const first = transformReviews({ documents });
  const second = transformReviews({ documents });
  assert.equal(first.sourceChecksum, second.sourceChecksum);
  assert.equal(first.stagedChecksum, second.stagedChecksum);
  const sql1 = buildReviewImportSql(first, "hungrieapp-a2288");
  const sql2 = buildReviewImportSql(second, "hungrieapp-a2288");
  assert.equal(sql1.runId, sql2.runId);
  assert.equal(sql1.sql, sql2.sql);
  assert.match(sql1.sql, /promote_review_import/);
});
