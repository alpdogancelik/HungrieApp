/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { checkoutOperationKey, clearCheckoutOperation, discardCheckoutOperationAfterCartChange, resolveCheckoutOperation } from "./checkoutOperation.ts";

const memoryStorage = () => {
    const values = new Map();
    return {
        values,
        getItem: async (key) => values.get(key) || null,
        setItem: async (key, value) => { values.set(key, value); },
        removeItem: async (key) => { values.delete(key); },
    };
};

test("checkout operation key is valid for native SecureStore", () => {
    const key = checkoutOperationKey("2db1180a-3c68-44f7-b21f-cde92787524f");
    assert.match(key, /^[\w.-]+$/);
    assert.doesNotMatch(key, /:/);
});

test("checkout reuses its operation ID after a lost response and screen remount", async () => {
    const target = memoryStorage();
    const first = await resolveCheckoutOperation("customer-1", "request-a", "cart-a", target);
    const retry = await resolveCheckoutOperation("customer-1", "request-a", "cart-a", target);
    assert.equal(retry, first);
    assert.equal(target.values.size, 1);
});

test("changed request receives a new operation ID", async () => {
    const target = memoryStorage();
    const first = await resolveCheckoutOperation("customer-1", "request-a", "cart-a", target);
    const changed = await resolveCheckoutOperation("customer-1", "request-b", "cart-a", target);
    assert.notEqual(changed, first);
});

test("cart changes and successful completion clear persisted operations", async () => {
    const target = memoryStorage();
    const first = await resolveCheckoutOperation("customer-1", "request-a", "cart-a", target);
    await discardCheckoutOperationAfterCartChange("customer-1", "cart-b", target);
    assert.equal(target.values.size, 0);
    const second = await resolveCheckoutOperation("customer-1", "request-b", "cart-b", target);
    await clearCheckoutOperation("customer-1", second, target);
    assert.equal(target.values.size, 0);
    assert.notEqual(first, second);
});
