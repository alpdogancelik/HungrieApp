/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { URL } from "node:url";
import { setFirebaseUserForTests } from "@/lib/firebase";
import { setBoundSupabaseClientFactoryForTests } from "@/lib/supabase";
import { setSupabaseClientForTests } from "./supabase/utils.ts";
import * as addresses from "./supabase/addressRepository.ts";
import { supabaseFavoritesRepository } from "./supabase/favoritesRepository.ts";

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};
const row = (id, label) => ({ id, label, line1: `${label} Street`, city: "Test City", country: "Test", is_default: true, created_at: "2026-01-01T00:00:00Z" });
const result = (data) => ({ data, error: null });
let activeUid = "fixture";
const switchUser = (uid) => {
    activeUid = uid;
    setFirebaseUserForTests(uid);
};

test("direct A to B subscription is empty until B's authoritative addresses arrive", async () => {
    const rows = { "customer-a": [row("address-a", "A")], "customer-b": [row("address-b", "B")] };
    setBoundSupabaseClientFactoryForTests(() => {
        const boundUid = activeUid;
        return { rpc: async () => result(rows[boundUid]) };
    });
    setSupabaseClientForTests({ rpc: async () => result([]) });
    switchUser("customer-a");
    addresses.clearSessionCache();
    assert.equal((await addresses.list())[0].id, "address-a");
    switchUser("customer-b");
    const observed = [];
    const unsubscribe = addresses.subscribe((value) => observed.push(value.map((item) => item.id)));
    assert.deepEqual(observed[0], []);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(observed.at(-1), ["address-b"]);
    unsubscribe();
});

test("delayed A hydration is discarded after B becomes active", async () => {
    const aRead = deferred();
    setBoundSupabaseClientFactoryForTests(() => {
        const boundUid = activeUid;
        return { rpc: async () => boundUid === "customer-a" ? aRead.promise : result([row("address-b", "B")]) };
    });
    switchUser("customer-a");
    addresses.clearSessionCache();
    const pendingA = addresses.list();
    switchUser("customer-b");
    addresses.clearSessionCache();
    assert.deepEqual(await addresses.list().then((items) => items.map((item) => item.id)), ["address-b"]);
    aRead.resolve(result([row("address-a", "A")]));
    assert.deepEqual(await pendingA, []);
});

test("delayed A mutation stays bound to A and cannot mutate or replace B cache", async () => {
    const aCreate = deferred();
    const calls = [];
    setBoundSupabaseClientFactoryForTests(() => {
        const uid = activeUid;
        return { rpc: async (name) => {
            calls.push([uid, name]);
            if (uid === "customer-a" && name === "create_my_customer_address_v1") return aCreate.promise;
            if (name === "list_my_customer_addresses_v1") return result([row(`address-${uid.at(-1)}`, uid)]);
            return result(null);
        } };
    });
    switchUser("customer-a");
    addresses.clearSessionCache();
    const lateA = addresses.create({ id: "new-a", label: "A", line1: "A Street", city: "Test City", country: "Test", isDefault: true });
    await new Promise((resolve) => setImmediate(resolve));
    switchUser("customer-b");
    addresses.clearSessionCache();
    assert.deepEqual(await addresses.list().then((items) => items.map((item) => item.id)), ["address-b"]);
    aCreate.resolve(result("new-a"));
    await assert.rejects(lateA, /identity changed|invalidated/i);
    assert.ok(calls.some(([uid, name]) => uid === "customer-a" && name === "create_my_customer_address_v1"));
    assert.ok(!calls.some(([uid, name]) => uid === "customer-b" && name === "create_my_customer_address_v1"));
});

test("delayed A favorites persistence remains bound to A after direct switch to B", async () => {
    const aReplace = deferred();
    const calls = [];
    setBoundSupabaseClientFactoryForTests(() => {
        const boundUid = activeUid;
        return { rpc: async (name, args) => {
            calls.push([boundUid, name, args]);
            if (boundUid === "customer-a") return aReplace.promise;
            return result(args.p_restaurant_ids.length);
        } };
    });
    switchUser("customer-a");
    const lateA = supabaseFavoritesRepository.persistFavorites("customer-a", ["restaurant-a"]);
    await new Promise((resolve) => setImmediate(resolve));
    switchUser("customer-b");
    await supabaseFavoritesRepository.persistFavorites("customer-b", ["restaurant-b"]);
    aReplace.resolve(result(1));
    await assert.rejects(lateA, /identity changed/i);
    assert.deepEqual(calls.map(([uid, , args]) => [uid, args.p_restaurant_ids]), [
        ["customer-a", ["restaurant-a"]],
        ["customer-b", ["restaurant-b"]],
    ]);
});

test("ownerless legacy Firebase addresses are discarded and never assigned to current user", () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
    const source = fs.readFileSync(path.join(root, "src/data/firebase/addressRepository.ts"), "utf8");
    assert.match(source, /discardOwnerlessLegacyAddresses/);
    assert.match(source, /AsyncStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);
    assert.doesNotMatch(source, /writeAllToFirestore\(userId,\s*legacyAddresses\)/);
    assert.doesNotMatch(source, /legacy-claimed-by/);
});

test("root identity transition clears address UI synchronously with other private stores", () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
    const source = fs.readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
    const boundary = source.slice(source.indexOf("onIdTokenChanged"), source.indexOf("const appStateSubscription"));
    assert.match(boundary, /invalidateCartIdentity\(\)/);
    assert.match(boundary, /invalidateRecentSearchIdentity\(\)/);
    assert.match(boundary, /clearAddressSessionCache\(\)/);
});
