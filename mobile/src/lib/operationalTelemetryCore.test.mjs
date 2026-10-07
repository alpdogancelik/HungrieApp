/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import {
    classifyOperationalFailure,
    safeTelemetryErrorCode,
    sanitizeSentryEvent,
} from "./operationalTelemetryCore.ts";

test("expected business/security rejections and connectivity are not internal incidents", () => {
    assert.equal(classifyOperationalFailure({ code: "22023", message: "minimum order" }), "expected");
    assert.equal(classifyOperationalFailure({ code: "42501", message: "forbidden" }), "expected");
    assert.equal(classifyOperationalFailure({ status: 429 }), "expected");
    assert.equal(classifyOperationalFailure({ code: "auth/invalid-credential" }), "expected");
    assert.equal(classifyOperationalFailure({ code: "auth/network-request-failed" }), "connectivity");
    assert.equal(classifyOperationalFailure(new Error("Network request failed")), "connectivity");
    assert.equal(classifyOperationalFailure({ status: 503, code: "HTTP_503" }), "server");
    assert.equal(classifyOperationalFailure({ code: "XX000" }), "server");
    assert.equal(classifyOperationalFailure(new TypeError("synthetic bug")), "unexpected");
});

test("telemetry error codes cannot contain raw messages or credentials", () => {
    const error = Object.assign(new Error("Bearer synthetic-token customer@example.test"), { code: "XX000" });
    assert.equal(safeTelemetryErrorCode(error), "XX000");
    assert.equal(safeTelemetryErrorCode({ code: "Bearer synthetic-token" }), "unknown");
});

test("Sentry event sanitization removes payload, identity, breadcrumb, and exception text", () => {
    const synthetic = "customer@example.test Bearer synthetic-token ExpoPushToken[secret] Synthetic Street";
    const sanitized = sanitizeSentryEvent({
        user: { email: "customer@example.test" },
        message: synthetic,
        logentry: { message: synthetic },
        extra: { recentSearch: "private-query", address: "Synthetic Street" },
        request: { url: `https://example.test/?email=${synthetic}`, headers: { authorization: synthetic }, cookies: synthetic, data: synthetic, query_string: synthetic },
        breadcrumbs: [{ category: "fetch", message: synthetic, data: { body: synthetic }, level: "error" }],
        exception: { values: [{ type: "TypeError", value: synthetic, stacktrace: { frames: [] } }] },
    });
    const serialized = JSON.stringify(sanitized);
    for (const forbidden of ["@example", "Bearer", "ExpoPushToken", "Synthetic Street", "private-query"]) {
        assert.equal(serialized.includes(forbidden), false);
    }
    assert.equal(sanitized.exception.values[0].value, "redacted");
});
