/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthHydration, resolveAuthSessionHydration, resolveAuthSyncHydration } from "./authHydration.ts";

test("uses the complete repository profile when it is available", () => {
    const result = resolveAuthHydration({
        accountId: "profile-1",
        name: "Profile Name",
        email: "profile@example.test",
        whatsappNumber: "555",
    }, {
        uid: "firebase-1",
        name: "Firebase Name",
        email: "firebase@example.test",
    });

    assert.equal(result.isAuthenticated, true);
    assert.equal(result.user?.accountId, "profile-1");
    assert.equal(result.user?.firebaseUid, "firebase-1");
    assert.equal(result.user?.name, "Profile Name");
    assert.equal(result.user?.whatsappNumber, "555");
});

test("preserves authentication from a persisted Firebase identity when profile hydration is unavailable", () => {
    const result = resolveAuthHydration(null, {
        uid: "firebase-1",
        name: "Firebase Name",
        email: "firebase@example.test",
        avatar: "https://example.test/avatar.png",
    });

    assert.deepEqual(result, {
        isAuthenticated: true,
        user: {
            id: "firebase-1",
            $id: "firebase-1",
            accountId: "firebase-1",
            name: "Firebase Name",
            email: "firebase@example.test",
            avatar: "https://example.test/avatar.png",
            whatsappNumber: undefined,
            firebaseUid: "firebase-1",
        },
    });
});

test("reports signed out only when neither profile nor persisted Firebase identity exists", () => {
    assert.deepEqual(resolveAuthHydration(null, null), {
        isAuthenticated: false,
        user: null,
    });
});

test("restores an authenticated unverified Firebase session into verification recovery", () => {
    assert.deepEqual(resolveAuthSessionHydration(null, {
        email: "unverified@example.test",
        emailVerified: false,
    }), {
        isAuthenticated: false,
        user: null,
        verificationRequired: { email: "unverified@example.test" },
    });
});

test("verified and signed-out sessions cannot be mistaken for verification recovery", () => {
    assert.equal(resolveAuthSessionHydration(null, { email: "verified@example.test", emailVerified: true }).verificationRequired, null);
    assert.equal(resolveAuthSessionHydration(null, null).verificationRequired, null);
});

test("cold-start token hydration releases loading and preserves the Supabase profile", () => {
    const result = resolveAuthSyncHydration({
        user: {
            id: "profile-1",
            $id: "profile-1",
            accountId: "profile-1",
            firebaseUid: "firebase-1",
            name: "Customer",
            email: "customer@example.test",
        },
    }, {
        uid: "firebase-1",
        name: "Firebase Customer",
        email: "customer@example.test",
    });

    assert.equal(result.isLoading, false);
    assert.equal(result.isAuthenticated, true);
    assert.equal(result.user?.accountId, "profile-1");
    assert.equal(result.user?.firebaseUid, "firebase-1");
});
