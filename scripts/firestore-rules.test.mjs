import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const projectId = "demo-hungrie-firestore";
const rules = fs.readFileSync(new URL("../mobile/firestore.rules", import.meta.url), "utf8");

const identities = [
  ["Customer", "customer-uid", { account_type: "customer", account_status: "active" }],
  ["suspended Customer", "suspended-customer-uid", { account_type: "customer", account_status: "suspended" }],
  ["Restaurant Manager", "manager-uid", { account_type: "restaurant", restaurant_role: "manager", restaurant_id: "restaurant-a" }],
  ["Restaurant Owner", "owner-uid", { account_type: "restaurant", restaurant_role: "owner", restaurant_id: "restaurant-a" }],
  ["suspended Restaurant member", "suspended-manager-uid", { account_type: "restaurant", account_status: "suspended", restaurant_role: "manager", restaurant_id: "restaurant-a" }],
  ["Admin", "admin-uid", { account_type: "admin", admin_role: "admin" }],
  ["Super Admin", "super-admin-uid", { account_type: "admin", admin_role: "super_admin" }],
];

const privatePaths = (uid) => [
  "orders/fabricated-order",
  `users/${uid}`,
  `users/${uid}/addresses/fabricated-address`,
  `users/${uid}/pushTokens/fabricated-token`,
  `restaurantStaff/${uid}`,
  "restaurants/restaurant-b/pushTokens/fabricated-token",
  "orderReviews/unpublished-review",
  "notifications/fabricated-notification",
  "payments/fabricated-payment",
  "restaurantSettings/restaurant-b",
  "privateReviews/fabricated-review",
];

test("deployable Firestore rules deny private business authority and preserve public read-only compatibility", async () => {
  const environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "restaurants/restaurant-a"), { name: "Public Restaurant" }),
        setDoc(doc(db, "menus/menu-a"), { name: "Public Menu Item" }),
        setDoc(doc(db, "categories/category-a"), { name: "Public Category" }),
        setDoc(doc(db, "reviews/review-a"), { rating: 5 }),
        setDoc(doc(db, "orderReviews/published-review"), { status: "published" }),
        setDoc(doc(db, "orderReviews/hidden-review"), { status: "hidden" }),
        setDoc(doc(db, "orders/existing-order"), { userId: "customer-uid", restaurantId: "restaurant-a", status: "pending" }),
      ]);
    });

    const anonymous = environment.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonymous, "orders/anonymous-order"), { status: "pending" }));
    await assertFails(getDoc(doc(anonymous, "orders/existing-order")));

    for (const [label, uid, claims] of identities) {
      const db = environment.authenticatedContext(uid, claims).firestore();
      for (const path of privatePaths(uid)) {
        await assertFails(setDoc(doc(db, path), { actor: label, restaurantId: "restaurant-b", status: "pending" }));
      }
      await assertFails(getDoc(doc(db, "orders/existing-order")));
      await assertFails(updateDoc(doc(db, "orders/existing-order"), { status: "delivered" }));
      await assertFails(deleteDoc(doc(db, "orders/existing-order")));
    }

    for (const path of ["restaurants/restaurant-a", "menus/menu-a", "categories/category-a", "reviews/review-a", "orderReviews/published-review"]) {
      const snapshot = await assertSucceeds(getDoc(doc(anonymous, path)));
      assert.equal(snapshot.exists(), true, `${path} remains publicly readable`);
      await assertFails(setDoc(doc(anonymous, path), { attacker: true }));
    }
    await assertFails(getDoc(doc(anonymous, "orderReviews/hidden-review")));

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await assertSucceeds(setDoc(doc(db, "orders/admin-sdk-order"), { status: "pending", userId: "customer-uid" }));
      await assertSucceeds(updateDoc(doc(db, "orders/admin-sdk-order"), { userId: "deleted:admin-sdk-order" }));
      const snapshot = await assertSucceeds(getDoc(doc(db, "orders/admin-sdk-order")));
      assert.equal(snapshot.data()?.userId, "deleted:admin-sdk-order", "trusted server context can perform account-deletion scrubbing");
    });
  } finally {
    await environment.cleanup();
  }
});
