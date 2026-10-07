/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { URL } from "node:url";
import { passwordResetPresentation, requestPasswordReset } from "./passwordResetFlow.ts";
import { classifyPublicSignInFailure } from "./credentialPrivacy.ts";

const existing = "existing@example.test";
const missing = "missing@example.test";

test("existing and missing accounts have the same public reset result and presentation", async () => {
    const existingResult = await requestPasswordReset({ email: existing, send: async () => undefined });
    const missingResult = await requestPasswordReset({
        email: missing,
        send: async () => { throw Object.assign(new Error("synthetic missing account"), { code: "auth/user-not-found" }); },
    });
    assert.equal(existingResult, "accepted");
    assert.equal(missingResult, "accepted");
    assert.deepEqual(passwordResetPresentation(existingResult), passwordResetPresentation(missingResult));
});

test("wrong-password and nonexistent-account sign-in failures share one public class", () => {
    assert.equal(classifyPublicSignInFailure("auth/wrong-password"), "invalid_credentials");
    assert.equal(classifyPublicSignInFailure("auth/user-not-found"), "invalid_credentials");
    assert.equal(classifyPublicSignInFailure("auth/invalid-credential"), "invalid_credentials");
});

test("disabled account state is privacy-normalized without exposing account metadata", async () => {
    const result = await requestPasswordReset({
        email: existing,
        send: async () => { throw Object.assign(new Error("synthetic disabled"), { code: "auth/user-disabled" }); },
    });
    assert.equal(result, "accepted");
    assert.deepEqual(Object.keys(passwordResetPresentation(result)).sort(), ["copy", "tone"]);
});

test("invalid input, rate limits, network failures, and provider failures remain truthful", async () => {
    assert.equal(await requestPasswordReset({ email: "not-an-email", send: async () => undefined }), "invalid_input");
    for (const [code, expected] of [
        ["auth/too-many-requests", "rate_limited"],
        ["auth/network-request-failed", "network_failure"],
        ["auth/internal-error", "technical_failure"],
        ["auth/operation-not-allowed", "technical_failure"],
    ]) {
        const result = await requestPasswordReset({
            email: existing,
            send: async () => { throw Object.assign(new Error("synthetic provider failure"), { code }); },
        });
        assert.equal(result, expected);
        assert.equal(passwordResetPresentation(result).tone, "error");
    }
});

test("the public return contract contains no email, account, provider, or recovery material", async () => {
    const marker = "synthetic-secret@example.test";
    const result = await requestPasswordReset({ email: marker, send: async () => undefined });
    const serialized = JSON.stringify({ result, presentation: passwordResetPresentation(result) });
    for (const forbidden of [marker, "oobCode", "reset-url", "firebase-token", "userExists", "accountType", "providerType"]) {
        assert.equal(serialized.includes(forbidden), false);
    }
});

test("reset source emits no console, raw telemetry, reset URL, or action code", () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
    const firebaseAuth = fs.readFileSync(path.join(root, "lib/firebaseAuth.ts"), "utf8");
    const resetBoundary = firebaseAuth.slice(
        firebaseAuth.indexOf("export const sendPasswordReset"),
        firebaseAuth.indexOf("export const updateUserProfile"),
    );
    const sources = [
        path.join(root, "app/(auth)/forgot-password.tsx"),
        path.join(root, "src/features/auth/passwordResetFlow.ts"),
    ].map((file) => fs.readFileSync(file, "utf8")).concat(resetBoundary).join("\n");
    assert.doesNotMatch(sources, /console\.(?:log|warn|error)/);
    assert.doesNotMatch(sources, /oobCode|continueUrl|https?:\/\/[^\s"']*reset/i);
    assert.doesNotMatch(sources, /resetUserNotFound|No account was found|hesap bulunamadı/i);
    const signInSource = fs.readFileSync(path.join(root, "app/(auth)/sign-in.tsx"), "utf8");
    assert.doesNotMatch(signInSource, /pathname:\s*["']\/forgot-password["'][\s\S]{0,160}params:/);
});
