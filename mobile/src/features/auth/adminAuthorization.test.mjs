/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";

import {
    checkAdminAuthorization,
    createAdminAuthorizationCoordinator,
    resolveAdminRouteAction,
    shouldMountAdminChildren,
    shouldRevalidateAdminOnForeground,
} from "./adminAuthorization.ts";

const canonicalClaims = (role = "admin") => ({ role: "authenticated", platform_role: role });
const rpcData = (role = "admin") => ({
    profile_id: "profile-1",
    platform_role: role,
    is_admin: true,
    is_super_admin: role === "super_admin",
});

const createHarness = (overrides = {}) => {
    const calls = [];
    const user = {
        uid: "firebase-user-1",
        async getIdTokenResult(forceRefresh) {
            calls.push(["firebase-token", forceRefresh]);
            return { token: "fresh-token", claims: canonicalClaims() };
        },
    };
    const dependencies = {
        supabaseEnabled: true,
        async waitForAuthReady() { calls.push(["auth-ready"]); },
        getFirebaseUser() { calls.push(["firebase-user"]); return user; },
        async readSupabaseAuthorization(signal) {
            calls.push(["supabase-rpc", signal instanceof globalThis.AbortSignal]);
            return { data: rpcData(), error: null };
        },
        ...overrides,
    };
    return { calls, dependencies, user };
};

test("denies signed-out callers before touching Firebase or Supabase", async () => {
    const harness = createHarness();
    assert.deepEqual(await checkAdminAuthorization(false, harness.dependencies), {
        status: "denied",
        reason: "signed_out",
    });
    assert.deepEqual(harness.calls, []);
});

test("denies when the authenticated store has no Firebase user", async () => {
    const harness = createHarness({ getFirebaseUser: () => null });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "firebase_user_missing",
    });
});

test("fails closed when Supabase is disabled", async () => {
    const harness = createHarness({ supabaseEnabled: false });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "supabase_disabled",
    });
    assert.equal(harness.calls.some(([name]) => name === "firebase-token" || name === "supabase-rpc"), false);
});

for (const role of ["admin", "super_admin"]) {
    test(`allows an exact canonical ${role} match`, async () => {
        const harness = createHarness({
            getFirebaseUser: () => ({
                ...createHarness().user,
                getIdTokenResult: async (forceRefresh) => {
                    harness.calls.push(["firebase-token", forceRefresh]);
                    return { token: "fresh-token", claims: canonicalClaims(role) };
                },
            }),
            readSupabaseAuthorization: async () => ({ data: rpcData(role), error: null }),
        });
        assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
            status: "allowed",
            role,
            profileId: "profile-1",
        });
        assert.deepEqual(harness.calls.find(([name]) => name === "firebase-token"), ["firebase-token", true]);
    });
}

test("rejects a non-canonical Firebase transport role before the RPC", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async () => ({ token: "token", claims: { role: "admin", platform_role: "admin" } }),
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "transport_role_invalid",
    });
    assert.equal(harness.calls.some(([name]) => name === "supabase-rpc"), false);
});

test("denies a Supabase-only admin before calling Supabase", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async () => ({ token: "token", claims: { role: "authenticated" } }),
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "firebase_admin_role_missing",
    });
    assert.equal(harness.calls.some(([name]) => name === "supabase-rpc"), false);
});

test("rejects an unknown scalar platform role before calling Supabase", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async () => ({ token: "token", claims: canonicalClaims("owner") }),
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "firebase_admin_role_missing",
    });
    assert.equal(harness.calls.some(([name]) => name === "supabase-rpc"), false);
});

test("role arrays cannot replace the canonical scalar platform role", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async () => ({
                token: "token",
                claims: { role: "authenticated", roles: ["courier"] },
            }),
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "firebase_admin_role_missing",
    });
});

test("an unrelated courier role can coexist with exact canonical admin authorization", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async (forceRefresh) => {
                harness.calls.push(["firebase-token", forceRefresh]);
                return { token: "token", claims: { ...canonicalClaims(), roles: ["courier"] } };
            },
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "allowed",
        role: "admin",
        profileId: "profile-1",
    });
});

for (const [name, claim] of [
    ["admin", { admin: true }],
    ["admin=false", { admin: false }],
    ["platformRole", { platformRole: "admin" }],
    ["platformRole=non-admin", { platformRole: "courier" }],
    ["adminRole", { adminRole: "super_admin" }],
    ["adminRole=null", { adminRole: null }],
    ["roles", { roles: ["admin"] }],
    ["platformRoles", { platformRoles: ["super_admin"] }],
    ["platform_roles", { platform_roles: ["admin"] }],
]) {
    test(`rejects the legacy ${name} admin alias`, async () => {
        const harness = createHarness({
            getFirebaseUser: () => ({
                uid: "firebase-user-1",
                getIdTokenResult: async () => ({ token: "token", claims: { ...canonicalClaims(), ...claim } }),
            }),
        });
        assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
            status: "denied",
            reason: "legacy_admin_claim",
        });
    });
}

test("denies exact Firebase and Supabase role mismatches", async () => {
    const harness = createHarness({
        readSupabaseAuthorization: async () => ({ data: rpcData("super_admin"), error: null }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "role_mismatch",
    });
});

test("denies a Firebase-only admin when Supabase has no role", async () => {
    const harness = createHarness({
        readSupabaseAuthorization: async () => ({
            data: { profile_id: "profile-1", platform_role: null, is_admin: false, is_super_admin: false },
            error: null,
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "supabase_admin_role_missing",
    });
});

test("a stale Firebase admin claim is denied immediately after Supabase revocation", async () => {
    const harness = createHarness({
        readSupabaseAuthorization: async () => ({
            data: { profile_id: "profile-1", platform_role: null, is_admin: false, is_super_admin: false },
            error: null,
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "supabase_admin_role_missing",
    });
    assert.deepEqual(harness.calls.find(([name]) => name === "firebase-token"), ["firebase-token", true]);
});

for (const malformed of [
    null,
    [],
    { profile_id: "", platform_role: "admin", is_admin: true, is_super_admin: false },
    { profile_id: "profile-1", platform_role: "admin", is_admin: false, is_super_admin: false },
    { profile_id: "profile-1", platform_role: "super_admin", is_admin: true, is_super_admin: false },
]) {
    test("fails closed for malformed or inconsistent RPC data", async () => {
        const harness = createHarness({
            readSupabaseAuthorization: async () => ({ data: malformed, error: null }),
        });
        const result = await checkAdminAuthorization(true, harness.dependencies);
        assert.equal(result.status, "denied");
        assert.ok(["invalid_authorization_response", "supabase_profile_missing"].includes(result.reason));
    });
}

test("classifies the caller-bound missing-profile error as denied", async () => {
    const harness = createHarness({
        readSupabaseAuthorization: async () => ({
            data: null,
            error: { code: "42501", message: "No application profile is mapped to this authenticated identity" },
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "denied",
        reason: "supabase_profile_missing",
    });
});

test("classifies Supabase service errors as unavailable", async () => {
    const harness = createHarness({
        readSupabaseAuthorization: async () => ({ data: null, error: { code: "PGRST000", message: "offline" } }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "unavailable",
        reason: "supabase_unavailable",
    });
});

test("classifies Firebase token failures as unavailable without calling Supabase", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async () => { throw new Error("offline"); },
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies), {
        status: "unavailable",
        reason: "firebase_token_unavailable",
    });
    assert.equal(harness.calls.some(([name]) => name === "supabase-rpc"), false);
});

test("applies the timeout to Firebase token refresh", async () => {
    const harness = createHarness({
        getFirebaseUser: () => ({
            uid: "firebase-user-1",
            getIdTokenResult: async () => await new Promise(() => undefined),
        }),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies, 5), {
        status: "unavailable",
        reason: "authorization_timeout",
    });
});

test("times out an authorization RPC", async () => {
    const harness = createHarness({
        readSupabaseAuthorization: async () => await new Promise(() => undefined),
    });
    assert.deepEqual(await checkAdminAuthorization(true, harness.dependencies, 5), {
        status: "unavailable",
        reason: "authorization_timeout",
    });
});

test("route actions mount the admin stack only for allowed results", () => {
    assert.equal(resolveAdminRouteAction(false, null), "sign_in");
    assert.equal(resolveAdminRouteAction(true, null), "loading");
    assert.equal(resolveAdminRouteAction(true, { status: "unavailable", reason: "supabase_unavailable" }), "retry");
    assert.equal(resolveAdminRouteAction(true, { status: "denied", reason: "role_mismatch" }), "home");
    assert.equal(resolveAdminRouteAction(true, { status: "denied", reason: "firebase_user_missing" }), "sign_in");
    assert.equal(resolveAdminRouteAction(true, { status: "allowed", role: "admin", profileId: "profile-1" }), "allow");
    for (const action of ["loading", "sign_in", "home", "retry"]) {
        assert.equal(shouldMountAdminChildren(action), false);
    }
    assert.equal(shouldMountAdminChildren("allow"), true);
});

test("each authorization request force-refreshes Firebase before calling Supabase", async () => {
    const harness = createHarness();
    await checkAdminAuthorization(true, harness.dependencies);
    await checkAdminAuthorization(true, harness.dependencies);
    assert.deepEqual(
        harness.calls.filter(([name]) => name === "firebase-token" || name === "supabase-rpc"),
        [
            ["firebase-token", true],
            ["supabase-rpc", true],
            ["firebase-token", true],
            ["supabase-rpc", true],
        ],
    );
});

test("coordinator coalesces concurrent checks", async () => {
    const coordinator = createAdminAuthorizationCoordinator();
    let calls = 0;
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const check = async () => {
        calls += 1;
        await pending;
        return { status: "allowed", role: "admin", profileId: "profile-1" };
    };
    const first = coordinator.run(check);
    const second = coordinator.run(check);
    assert.equal(first, second);
    assert.equal(calls, 1);
    release();
    assert.equal((await first).current, true);
});

test("coordinator marks invalidated asynchronous results as stale", async () => {
    const coordinator = createAdminAuthorizationCoordinator();
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const stale = coordinator.run(async () => {
        await pending;
        return { status: "allowed", role: "admin", profileId: "old-profile" };
    });
    coordinator.invalidate();
    const current = coordinator.run(async () => ({ status: "denied", reason: "firebase_admin_role_missing" }));
    release();
    assert.equal((await stale).current, false);
    assert.deepEqual(await current, {
        current: true,
        result: { status: "denied", reason: "firebase_admin_role_missing" },
    });
});

test("foreground revalidation runs only on a transition back to active", () => {
    assert.equal(shouldRevalidateAdminOnForeground("background", "active"), true);
    assert.equal(shouldRevalidateAdminOnForeground("inactive", "active"), true);
    assert.equal(shouldRevalidateAdminOnForeground("active", "active"), false);
    assert.equal(shouldRevalidateAdminOnForeground("active", "background"), false);
});
