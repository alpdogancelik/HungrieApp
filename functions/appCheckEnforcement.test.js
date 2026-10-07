const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const { getAppCheck } = require("firebase-admin/app-check");
const { getAuth } = require("firebase-admin/auth");
const functions = require("./index");

const call = async (handler, headers = {}) => {
    const app = express();
    app.use(express.json());
    app.post("/", handler);
    const server = await new Promise((resolve) => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify({ data: { profileId: "target", status: "suspended", operationId: crypto.randomUUID() } }),
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

test("Admin callable rejects missing and invalid App Check before business logic", { concurrency: false }, async () => {
    const handler = functions.setAdminAccountStatusProduction;
    const missing = await call(handler);
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.status, "UNAUTHENTICATED");

    const invalid = await call(handler, { "x-firebase-appcheck": "invalid" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.status, "UNAUTHENTICATED");
});

test("Restaurant media callable rejects missing and invalid App Check before parsing bytes", { concurrency: false }, async () => {
    const handler = functions.uploadRestaurantMediaProduction;
    const missing = await call(handler);
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.status, "UNAUTHENTICATED");

    const invalid = await call(handler, { "x-firebase-appcheck": "invalid" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.status, "UNAUTHENTICATED");
});

test("App Check remains independent from authentication and Admin authorization", { concurrency: false }, async () => {
    const appCheck = getAppCheck();
    const auth = getAuth();
    const originalVerifyAppCheck = appCheck.verifyToken;
    const originalVerifyIdToken = auth.verifyIdToken;
    appCheck.verifyToken = async () => ({ appId: "test-web-app" });
    auth.verifyIdToken = async () => ({ uid: "signed-in-user", email_verified: true });
    try {
        const validAppNoAuth = await call(functions.setAdminAccountStatusStaging, {
            "x-firebase-appcheck": "valid-test-token",
        });
        assert.equal(validAppNoAuth.status, 403);
        assert.equal(validAppNoAuth.body.error.status, "PERMISSION_DENIED");

        const validAuthMissingApp = await call(functions.setAdminAccountStatusStaging, {
            authorization: "Bearer valid-test-id-token",
        });
        assert.equal(validAuthMissingApp.status, 401);

        const validBothWrongRole = await call(functions.setAdminAccountStatusStaging, {
            authorization: "Bearer valid-test-id-token",
            "x-firebase-appcheck": "valid-test-token",
        });
        assert.equal(validBothWrongRole.status, 403);
        assert.equal(validBothWrongRole.body.error.status, "PERMISSION_DENIED");
    } finally {
        appCheck.verifyToken = originalVerifyAppCheck;
        auth.verifyIdToken = originalVerifyIdToken;
    }
});
