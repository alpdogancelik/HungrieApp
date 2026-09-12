/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthHydration } from "./authHydration.ts";

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
        },
    });
});

test("reports signed out only when neither profile nor persisted Firebase identity exists", () => {
    assert.deepEqual(resolveAuthHydration(null, null), {
        isAuthenticated: false,
        user: null,
    });
});
