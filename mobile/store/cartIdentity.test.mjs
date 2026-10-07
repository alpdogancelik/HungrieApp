/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

import {
    createCartHydrationGuard,
    decodeOwnedCart,
    encodeOwnedCart,
} from "./cartIdentity.ts";

const item = { id: "meal-a", quantity: 1, restaurantId: "restaurant-a" };
const rawFor = (uid, items = [item]) => JSON.stringify(encodeOwnedCart(uid, items));

test("same Customer restores only their owned cart after restart", () => {
    assert.deepEqual(decodeOwnedCart(rawFor("uid-a"), "uid-a"), {
        status: "restore", ownerUid: "uid-a", items: [item],
    });
});

test("A cart cannot hydrate for B", () => {
    assert.deepEqual(decodeOwnedCart(rawFor("uid-a"), "uid-b"), {
        status: "reject", reason: "owner_mismatch",
    });
});

test("legacy global, missing-owner, malformed-owner, and corrupt state fail closed", () => {
    assert.deepEqual(decodeOwnedCart(JSON.stringify({ state: { items: [item] }, version: 0 }), "uid-a"), { status: "reject", reason: "legacy" });
    assert.deepEqual(decodeOwnedCart(JSON.stringify({ version: 2, state: { items: [item] } }), "uid-a"), { status: "reject", reason: "missing_owner" });
    assert.deepEqual(decodeOwnedCart(JSON.stringify({ version: 2, state: { ownerUid: {}, items: [item] } }), "uid-a"), { status: "reject", reason: "missing_owner" });
    assert.deepEqual(decodeOwnedCart("not-json", "uid-a"), { status: "reject", reason: "malformed" });
});

test("owned envelopes with malformed cart rows remain unavailable", () => {
    const store = readFileSync(new URL("./cart.store.ts", import.meta.url), "utf8");
    const malformedRows = JSON.stringify({ version: 2, state: { ownerUid: "uid-a", items: [null] } });
    assert.equal(decodeOwnedCart(malformedRows, "uid-a").status, "restore");
    assert.match(store, /rawItems\.some\(\(item\) => !item \|\| typeof item !== "object"\)/);
    assert.match(store, /catch \{\s*return \[\];\s*\}/);
});

test("logged-out binding removes persistence and exposes only an empty ready cart", async () => {
    let raw = rawFor("uid-a");
    const events = [];
    const guard = createCartHydrationGuard({
        read: async () => raw,
        remove: async () => { raw = null; },
        lock: () => events.push({ ready: false, items: [] }),
        commit: (value) => events.push({ ready: true, ...value }),
    });
    await guard.bind(null);
    assert.equal(raw, null);
    assert.deepEqual(events.at(-1), { ready: true, ownerUid: null, items: [] });
});

test("direct A to B switch locks synchronously and rejects A persistence", async () => {
    let raw = rawFor("uid-a");
    const events = [];
    const guard = createCartHydrationGuard({
        read: async () => raw,
        remove: async () => { raw = null; },
        lock: () => events.push({ type: "lock", items: [] }),
        commit: (value) => events.push({ type: "commit", ...value }),
    });
    await guard.bind("uid-b");
    assert.equal(events[0].type, "lock");
    assert.deepEqual(events.at(-1), { type: "commit", ownerUid: "uid-b", items: [] });
    assert.equal(raw, null);
});

test("stale A hydration cannot commit after identity switches to B", async () => {
    let releaseA;
    const events = [];
    const guard = createCartHydrationGuard({
        read: () => new Promise((resolve) => { releaseA = resolve; }),
        remove: async () => undefined,
        lock: () => events.push({ type: "lock", items: [] }),
        commit: (value) => events.push({ type: "commit", ...value }),
    });
    const hydrationA = guard.bind("uid-a");
    guard.invalidate();
    releaseA(rawFor("uid-a"));
    await hydrationA;
    assert.equal(events.some((event) => event.type === "commit" && event.ownerUid === "uid-a"), false);
});

test("application integration locks before auth hydration and has no automatic global-cart hydration", () => {
    const store = readFileSync(new URL("./cart.store.ts", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
    const checkout = readFileSync(new URL("../src/features/cartCheckout/CheckoutScreen.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(store, /persist\(/);
    assert.match(store, /identityReady: false/);
    assert.match(store, /cart\.identityReady && cart\.ownerUid === uid/);
    assert.match(store, /state\.ownerUid !== currentUid/);
    assert.match(layout, /invalidateCartIdentity\(\);[\s\S]*syncAuthenticatedUser\(false\)/);
    assert.match(layout, /bindCartToIdentity\(ownerUid\)/);
    assert.match(checkout, /const items = useCartStore\(\(state\) => state\.items\)/);
    const authRepository = readFileSync(new URL("../src/data/authRepository.ts", import.meta.url), "utf8");
    assert.match(authRepository, /destroyCartForSessionBoundary/);
});
