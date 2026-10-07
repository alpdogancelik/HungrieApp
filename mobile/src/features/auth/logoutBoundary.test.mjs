/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

import {
    classifyPushCleanupFailure,
    createSingleFlightLogout,
    runLogoutBoundary,
} from "./logoutBoundary.ts";

const failureCases = [
    ["network failure", new Error("network offline"), "network"],
    ["401 cleanup", { status: 401 }, "unauthorized"],
    ["403 cleanup", { status: 403 }, "unauthorized"],
    ["429 cleanup", { status: 429 }, "rate_limited"],
    ["5xx cleanup", { status: 503 }, "server"],
    ["expired cleanup auth", { code: "401" }, "unauthorized"],
    ["suspended cleanup denial", { code: "403" }, "unauthorized"],
];

for (const [name, failure, category] of failureCases) {
    test(`${name} cannot prevent Firebase logout or local privacy cleanup`, async () => {
        const state = { firebaseUser: "customer-a", authenticated: true, cartVisible: true, privateUi: true };
        const observed = [];
        const result = await runLogoutBoundary({
            attemptPushCleanup: async () => { throw failure; },
            terminateFirebaseSession: async () => {
                state.firebaseUser = null;
                state.authenticated = false;
                state.privateUi = false;
                return "signed-out";
            },
            protectLocalState: async () => { state.cartVisible = false; },
            reportPushCleanupFailure: (value) => observed.push(value),
            timeoutMs: 20,
        });
        assert.equal(result, "signed-out");
        assert.deepEqual(state, { firebaseUser: null, authenticated: false, cartVisible: false, privateUi: false });
        assert.deepEqual(observed, [category]);
    });
}

test("successful cleanup and no-token cleanup both complete logout", async () => {
    for (const cleanup of [async () => "removed", async () => undefined]) {
        let terminated = false;
        let protectedLocally = false;
        await runLogoutBoundary({
            attemptPushCleanup: cleanup,
            terminateFirebaseSession: async () => { terminated = true; },
            protectLocalState: async () => { protectedLocally = true; },
        });
        assert.equal(terminated, true);
        assert.equal(protectedLocally, true);
    }
});

test("push subsystem initialization failure cannot prevent logout", async () => {
    let firebaseUser = "customer-a";
    await runLogoutBoundary({
        attemptPushCleanup: async () => { throw new Error("push subsystem unavailable"); },
        terminateFirebaseSession: async () => { firebaseUser = null; },
        protectLocalState: async () => undefined,
    });
    assert.equal(firebaseUser, null);
});

test("unverified recovery logout uses the same safe session boundary", () => {
    const repository = readFileSync(new URL("../../data/authRepository.ts", import.meta.url), "utf8");
    const verification = readFileSync(new URL("../../../app/(auth)/check-email.tsx", import.meta.url), "utf8");
    assert.match(repository, /export const signOutVerificationSession = signOut/);
    assert.match(verification, /await signOutVerificationSession\(\)/);
});

test("hanging push cleanup is bounded and late rejection cannot resurrect the session", async () => {
    let rejectCleanup;
    const cleanup = new Promise((_resolve, reject) => { rejectCleanup = reject; });
    const state = { firebaseUser: "customer-a", cartVisible: true };
    const observed = [];
    await runLogoutBoundary({
        attemptPushCleanup: () => cleanup,
        terminateFirebaseSession: async () => { state.firebaseUser = null; },
        protectLocalState: async () => { state.cartVisible = false; },
        reportPushCleanupFailure: (value) => observed.push(value),
        timeoutMs: 5,
    });
    rejectCleanup(new Error("late network rejection"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(state, { firebaseUser: null, cartVisible: false });
    assert.deepEqual(observed, ["timeout"]);
});

test("Firebase sign-out failure remains truthful while local state fails closed", async () => {
    let protectedLocally = false;
    await assert.rejects(runLogoutBoundary({
        attemptPushCleanup: async () => undefined,
        terminateFirebaseSession: async () => { throw new Error("firebase signout failed"); },
        protectLocalState: async () => { protectedLocally = true; },
    }), /firebase signout failed/);
    assert.equal(protectedLocally, true);
});

test("repeated logout calls share one security-boundary execution", async () => {
    let executions = 0;
    let release;
    const logout = createSingleFlightLogout(async () => {
        executions += 1;
        await new Promise((resolve) => { release = resolve; });
        return "done";
    });
    const first = logout();
    const second = logout();
    assert.equal(first, second);
    release();
    assert.equal(await first, "done");
    assert.equal(executions, 1);
});

test("failure categories never include raw token or credential material", () => {
    assert.equal(classifyPushCleanupFailure(new Error("offline ExpoPushToken[secret]")), "network");
});

test("application logout wires bounded cleanup before Firebase termination and central local protection", () => {
    const repository = readFileSync(new URL("../../data/authRepository.ts", import.meta.url), "utf8");
    const verification = readFileSync(new URL("../../../app/(auth)/check-email.tsx", import.meta.url), "utf8");
    const accessGate = readFileSync(new URL("./CustomerAccessGate.tsx", import.meta.url), "utf8");
    assert.match(repository, /runLogoutBoundary/);
    assert.match(repository, /attemptPushCleanup: async \(\) =>/);
    assert.match(repository, /terminateFirebaseSession: authRepository\.signOut/);
    assert.match(repository, /destroyCartForSessionBoundary/);
    assert.match(repository, /destroyRecentSearchesForSessionBoundary/);
    assert.match(verification, /signOutVerificationSession/);
    assert.match(accessGate, /terminateCustomerSession/);
});
