const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    buildOperationalEvent,
    logOperationalEvent,
    opaqueIdentifier,
    operationalErrorCode,
} = require("./operationalLogging");

test("operational events retain only allowlisted correlation and classification fields", () => {
    const payload = buildOperationalEvent("account.delete.reconciliation_required", {
        component: "account-deletion",
        environment: "production",
        operationId: "00000000-0000-4000-8000-000000000001",
        errorCode: "database_unavailable",
        pendingCount: 2,
        retryable: true,
        authorization: "Bearer synthetic-secret-token",
        appCheckToken: "synthetic-app-check-token",
        serviceRoleKey: "synthetic-service-role-key",
        pushToken: "ExpoPushToken[synthetic-push-token]",
        email: "customer@example.test",
        address: "Synthetic Street 1",
        totpSecret: "SYNTHETICTOTPSECRET",
        recoveryCode: "SYNTHETIC-RECOVERY",
        recentSearch: "private-search-query",
        mediaBytes: "synthetic-base64-media",
    });
    assert.deepEqual(payload, {
        event: "account.delete.reconciliation_required",
        component: "account-deletion",
        environment: "production",
        operationId: "00000000-0000-4000-8000-000000000001",
        errorCode: "database_unavailable",
        pendingCount: 2,
        retryable: true,
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["Bearer", "app-check", "service-role", "ExpoPushToken", "@example", "Street", "TOTP", "RECOVERY", "private-search", "base64"]) {
        assert.equal(serialized.includes(forbidden), false);
    }
});

test("logging uses a stable event name and safe payload", () => {
    const calls = [];
    const logger = { error: (...args) => calls.push(args) };
    const payload = logOperationalEvent(logger, "error", "push.delivery.failure", {
        component: "push-worker",
        deliveryId: "00000000-0000-4000-8000-000000000002",
        errorCode: "HTTP_503",
        retryable: true,
        rawError: new Error("Bearer synthetic-secret"),
    });
    assert.deepEqual(calls, [["push.delivery.failure", payload]]);
    assert.equal(JSON.stringify(calls).includes("synthetic-secret"), false);
});

test("opaque identifiers and error classification never echo their inputs", () => {
    const tokenDocumentId = "ExpoPushToken[synthetic-secret-token]";
    const opaque = opaqueIdentifier(tokenDocumentId);
    assert.match(opaque, /^[a-f0-9]{16}$/);
    assert.equal(opaque.includes("synthetic"), false);
    assert.equal(operationalErrorCode({ code: "messaging/unavailable", message: tokenDocumentId }), "messaging/unavailable");
    assert.equal(operationalErrorCode({ code: "unsafe code with spaces", message: tokenDocumentId }), "unknown");
});

test("direct push logging cannot emit raw token bindings or provider response text", () => {
    const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    assert.doesNotMatch(source, /logger\.(?:warn|error|info)\([^\n]*tokenDocId/);
    assert.doesNotMatch(source, /errorMessage:\s*String\(result\.error/);
    assert.doesNotMatch(source, /body:\s*parsed\s*\|\|\s*responseBody/);
    assert.match(source, /tokenBindingId:\s*opaqueIdentifier\(/);
});
