/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";
import {
    clearOwnedOrderStatusMap,
    loadOwnedOrderStatusMap,
    ORDER_STATUS_LEGACY_KEY,
    orderStatusStorageKey,
    parseOwnedOrderStatusMap,
    saveOwnedOrderStatusMap,
} from "./orderStatusPersistence.ts";
import { createOrderStatusWatcher } from "./orderStatusWatcher.ts";

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

const createStorage = () => {
    const values = new Map();
    return {
        values,
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => { values.set(key, value); },
        removeItem: async (key) => { values.delete(key); },
    };
};

test("same Customer restores only their owned order-status baseline", async () => {
    const storage = createStorage();
    await saveOwnedOrderStatusMap(storage, "customer-a", { "order-a": "preparing" });
    assert.deepEqual(await loadOwnedOrderStatusMap(storage, "customer-a"), { "order-a": "preparing" });
    assert.deepEqual(await loadOwnedOrderStatusMap(storage, "customer-b"), {});
});

test("ownerless legacy and malformed or mismatched envelopes fail closed", async () => {
    const storage = createStorage();
    storage.values.set(ORDER_STATUS_LEGACY_KEY, JSON.stringify({ "order-a": "delivered" }));
    assert.deepEqual(await loadOwnedOrderStatusMap(storage, "customer-b"), {});
    assert.equal(storage.values.has(ORDER_STATUS_LEGACY_KEY), false);
    for (const value of [
        "not-json",
        JSON.stringify({ version: 2, statuses: { "order-a": "ready" } }),
        JSON.stringify({ version: 2, ownerUid: "customer-a", statuses: { "order-a": "ready" } }),
        JSON.stringify({ version: 1, ownerUid: "customer-b", statuses: { "order-a": "ready" } }),
        JSON.stringify({ version: 2, ownerUid: "customer-b", statuses: { "order-a": "private-unknown" } }),
    ]) assert.deepEqual(parseOwnedOrderStatusMap(value, "customer-b"), {});
});

test("delayed A write cannot overwrite or suppress B state", async () => {
    const values = new Map();
    const gate = deferred();
    const storage = {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => {
            if (key === orderStatusStorageKey("customer-a")) await gate.promise;
            values.set(key, value);
        },
        removeItem: async (key) => { values.delete(key); },
    };
    const lateA = saveOwnedOrderStatusMap(storage, "customer-a", { "order-a": "delivered" });
    await saveOwnedOrderStatusMap(storage, "customer-b", { "order-b": "pending" });
    gate.resolve();
    await lateA;
    assert.deepEqual(await loadOwnedOrderStatusMap(storage, "customer-b"), { "order-b": "pending" });
});

test("delayed A cleanup and account deletion cannot erase B state", async () => {
    const storage = createStorage();
    const removeGate = deferred();
    const removeItem = storage.removeItem;
    storage.removeItem = async (key) => {
        if (key === orderStatusStorageKey("customer-a")) await removeGate.promise;
        await removeItem(key);
    };
    await saveOwnedOrderStatusMap(storage, "customer-a", { "order-a": "ready" });
    await saveOwnedOrderStatusMap(storage, "customer-b", { "order-b": "pending" });
    const lateADeletionCleanup = clearOwnedOrderStatusMap(storage, "customer-a");
    await saveOwnedOrderStatusMap(storage, "customer-b", { "order-b": "preparing" });
    removeGate.resolve();
    await lateADeletionCleanup;
    assert.deepEqual(await loadOwnedOrderStatusMap(storage, "customer-b"), { "order-b": "preparing" });
});

test("storage failures fail closed without restoring ownerless or cross-owner state", async () => {
    const failingStorage = {
        getItem: async () => { throw new Error("synthetic read failure"); },
        setItem: async () => { throw new Error("synthetic write failure"); },
        removeItem: async () => { throw new Error("synthetic remove failure"); },
    };
    assert.deepEqual(await loadOwnedOrderStatusMap(failingStorage, "customer-b"), {});
    await assert.rejects(saveOwnedOrderStatusMap(failingStorage, "customer-a", { "order-a": "ready" }), /synthetic write failure/);
    await assert.rejects(clearOwnedOrderStatusMap(failingStorage, "customer-a"), /synthetic remove failure/);
});

test("late A callback after direct switch cannot notify or mutate B baseline", async () => {
    const storage = createStorage();
    const callbacks = new Map();
    const notifications = [];
    const start = createOrderStatusWatcher({
        storage,
        subscribe: (uid, callback) => { callbacks.set(uid, callback); return () => undefined; },
        backend: () => "supabase",
        autoCancel: async () => undefined,
        remotePushSupported: () => false,
        notify: async (...args) => { notifications.push(args); },
    });
    const stopA = start("customer-a");
    await new Promise((resolve) => setImmediate(resolve));
    callbacks.get("customer-a")({ id: "order-a", status: "pending", restaurantName: "A" });
    stopA();
    const stopB = start("customer-b");
    await new Promise((resolve) => setImmediate(resolve));
    callbacks.get("customer-b")({ id: "order-b", status: "pending", restaurantName: "B" });
    callbacks.get("customer-a")({ id: "order-a", status: "delivered", restaurantName: "A" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 0, "A's late event is discarded");
    callbacks.get("customer-b")({ id: "order-b", status: "delivered", restaurantName: "B" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 1, "A's cache does not suppress B's notification");
    assert.equal(notifications[0][2].data.orderId, "order-b");
    assert.deepEqual(await loadOwnedOrderStatusMap(storage, "customer-b"), { "order-b": "delivered" });
    stopB();
});
