/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { getFirebaseTransportIdentity, getFirebaseTransportToken } from "./firebaseTransportToken.ts";

test("returns an existing authenticated transport token without refreshing", async () => {
    const calls = [];
    const token = await getFirebaseTransportToken({
        getIdTokenResult: async (forceRefresh) => {
            calls.push(forceRefresh);
            return { token: "ready-token", claims: { role: "authenticated" } };
        },
    }, { retryDelays: [], wait: async () => undefined });

    assert.equal(token, "ready-token");
    assert.deepEqual(calls, [undefined]);
});

test("force-refreshes a new user's cached token until the transport claim arrives", async () => {
    const calls = [];
    const waits = [];
    const results = [
        { token: "initial-token", claims: {} },
        { token: "still-pending", claims: {} },
        { token: "ready-token", claims: { role: "authenticated" } },
    ];
    const token = await getFirebaseTransportToken({
        getIdTokenResult: async (forceRefresh) => {
            calls.push(forceRefresh);
            return results.shift();
        },
    }, { retryDelays: [10, 20, 30], wait: async (delay) => { waits.push(delay); } });

    assert.equal(token, "ready-token");
    assert.deepEqual(calls, [undefined, true, true]);
    assert.deepEqual(waits, [10, 20]);
});

test("force-refreshes first and validates verified email for Customer bootstrap", async () => {
    const calls = [];
    const identity = await getFirebaseTransportIdentity({
        getIdTokenResult: async (forceRefresh) => {
            calls.push(forceRefresh);
            return {
                token: "fresh-token",
                claims: { role: "authenticated", email: "Customer@Example.com", email_verified: true },
            };
        },
    }, { forceRefreshFirst: true, requireVerifiedEmail: true, retryDelays: [] });

    assert.deepEqual(calls, [true]);
    assert.deepEqual(identity, { token: "fresh-token", email: "customer@example.com", emailVerified: true });
});

test("accepts the fresh token issued by sign-in without an unnecessary refresh", async () => {
    const calls = [];
    const identity = await getFirebaseTransportIdentity({
        getIdTokenResult: async (forceRefresh) => {
            calls.push(forceRefresh);
            return {
                token: "sign-in-token",
                claims: { role: "authenticated", email: "customer@example.com", email_verified: true },
            };
        },
    }, { requireVerifiedEmail: true, retryDelays: [] });

    assert.deepEqual(calls, [undefined]);
    assert.equal(identity.token, "sign-in-token");
});

test("bounds a stalled Firebase token request", async () => {
    await assert.rejects(getFirebaseTransportIdentity({
        getIdTokenResult: async () => new Promise(() => undefined),
    }, { requestTimeoutMs: 10, retryDelays: [] }), /timed out/i);
});

test("rejects incomplete Customer identity claims", async () => {
    await assert.rejects(getFirebaseTransportIdentity({
        getIdTokenResult: async () => ({ token: "token", claims: { role: "authenticated", email_verified: false } }),
    }, { requireVerifiedEmail: true, retryDelays: [] }), (error) => error.code === "identity_claims_invalid");
});

test("fails closed after bounded transport-claim retries", async () => {
    let calls = 0;
    await assert.rejects(getFirebaseTransportToken({
        getIdTokenResult: async () => {
            calls += 1;
            return { token: `token-${calls}`, claims: {} };
        },
    }, { retryDelays: [10, 20], wait: async () => undefined }), /still being prepared/i);
    assert.equal(calls, 3);
});
