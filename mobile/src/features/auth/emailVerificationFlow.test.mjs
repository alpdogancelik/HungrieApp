/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

import {
    classifyVerificationFailure,
    createAccountAndRequestVerification,
    createEmailVerificationCoordinator,
} from "./emailVerificationFlow.ts";
import { classifyPublicSignupFailure, signupFailureCopyKey } from "./signupPrivacy.ts";
import { getAuthErrorMessage } from "./authCopy.ts";

const deferred = () => {
    let resolve;
    const promise = new Promise((next) => { resolve = next; });
    return { promise, resolve };
};

test("account creation and successful verification request remain distinct states", async () => {
    const user = { uid: "customer-1", email: "customer@example.test", emailVerified: false };
    let preparedUser;
    let verificationUser;
    const result = await createAccountAndRequestVerification({
        createAccount: async () => user,
        prepareAccount: async (createdUser) => { preparedUser = createdUser; },
        requestVerification: async (createdUser) => { verificationUser = createdUser; return { state: "requested" }; },
    });
    assert.equal(preparedUser, user);
    assert.equal(verificationUser, user);
    assert.deepEqual(result, {
        state: "account_created_unverified",
        email: user.email,
        verificationRequest: { state: "requested" },
    });
});

test("delivery failure preserves the created account in a recoverable unverified state", async () => {
    let created = false;
    const result = await createAccountAndRequestVerification({
        createAccount: async () => {
            created = true;
            return { uid: "customer-1", email: "customer@example.test", emailVerified: false };
        },
        prepareAccount: async () => undefined,
        requestVerification: async () => ({ state: "failed", category: "network" }),
    });
    assert.equal(created, true);
    assert.equal(result.state, "account_created_unverified");
    assert.deepEqual(result.verificationRequest, { state: "failed", category: "network" });
});

test("account creation failure never enters the unverified-account state", async () => {
    let currentUid = "customer-other";
    let prepares = 0;
    let verificationRequests = 0;
    await assert.rejects(() => createAccountAndRequestVerification({
        createAccount: async () => { throw new Error("create failed"); },
        prepareAccount: async () => { prepares += 1; currentUid = "unexpected"; },
        requestVerification: async () => { verificationRequests += 1; return { state: "requested" }; },
    }), /create failed/);
    assert.equal(currentUid, "customer-other", "a failed create does not replace an existing session");
    assert.equal(prepares, 0);
    assert.equal(verificationRequests, 0);
});

test("signup failures are truthful, centralized, and privacy-normalized", () => {
    const cases = [
        ["auth/email-already-in-use", "registration_unavailable", "signupUnavailable"],
        ["auth/invalid-email", "invalid_email", "invalidEmail"],
        ["auth/weak-password", "weak_password", "weakPassword"],
        ["auth/too-many-requests", "rate_limited", "tooManyRequests"],
        ["auth/network-request-failed", "network_failure", "signupNetwork"],
        ["auth/internal-error", "technical_failure", "signupUnavailable"],
        ["auth/operation-not-allowed", "technical_failure", "signupUnavailable"],
    ];
    for (const [code, expected, copyKey] of cases) {
        const classification = classifyPublicSignupFailure({ code, message: "raw provider details" });
        assert.equal(classification, expected);
        assert.equal(signupFailureCopyKey(classification), copyKey);
    }
    const existingCopy = getAuthErrorMessage("en", signupFailureCopyKey(classifyPublicSignupFailure({ code: "auth/email-already-in-use" })));
    const internalCopy = getAuthErrorMessage("en", signupFailureCopyKey(classifyPublicSignupFailure({ code: "auth/internal-error" })));
    assert.equal(existingCopy, internalCopy);
    assert.doesNotMatch(existingCopy, /already exists|is registered|account exists/i);
    assert.doesNotMatch(getAuthErrorMessage("tr", "signupUnavailable"), /zaten bir hesap var|kayıtlıdır/i);
});

test("signup privacy output and source contain no identity or credential disclosure", () => {
    const marker = "existing@example.test";
    const password = "SyntheticPassword!123";
    const token = "synthetic-token";
    const failure = classifyPublicSignupFailure({ code: "auth/email-already-in-use", message: `${marker} ${password} ${token}` });
    const serialized = JSON.stringify({ failure, copy: getAuthErrorMessage("en", signupFailureCopyKey(failure)) });
    for (const forbidden of [marker, password, token, "accountType", "providerType", "mfa", "suspended", "email_verified"]) {
        assert.equal(serialized.includes(forbidden), false);
    }
    const repository = readFileSync(new URL("../../../lib/firebaseAuth.ts", import.meta.url), "utf8");
    const signupBoundary = repository.slice(repository.indexOf("export const createUser"), repository.indexOf("export const getCurrentUser"));
    assert.doesNotMatch(signupBoundary, /console\.(?:log|warn|error)/);
    assert.doesNotMatch(signupBoundary, /fetchSignInMethodsForEmail|accountType|providerData|multiFactor/);
    assert.match(signupBoundary, /normalizeSignupErrorMessage/);
});

test("resend success does not mark the account verified", async () => {
    const user = { uid: "customer-1", emailVerified: false };
    const coordinator = createEmailVerificationCoordinator({
        send: async () => undefined,
        reload: async () => undefined,
        forceTokenRefresh: async () => undefined,
    });
    assert.deepEqual(await coordinator.request(user), { state: "requested" });
    assert.equal(user.emailVerified, false);
});

test("provider, throttle, and network resend failures are observable and recoverable", async () => {
    for (const [code, category] of [
        ["auth/too-many-requests", "too_many_requests"],
        ["auth/network-request-failed", "network"],
        ["auth/operation-not-allowed", "configuration"],
        ["auth/unknown", "provider"],
    ]) {
        const coordinator = createEmailVerificationCoordinator({
            send: async () => { throw Object.assign(new Error("provider details"), { code }); },
            reload: async () => undefined,
            forceTokenRefresh: async () => undefined,
        });
        assert.deepEqual(await coordinator.request({ uid: code, emailVerified: false }), { state: "failed", category });
    }
});

test("a failed request can be retried without recreating the account", async () => {
    let attempts = 0;
    const coordinator = createEmailVerificationCoordinator({
        send: async () => {
            attempts += 1;
            if (attempts === 1) throw Object.assign(new Error("offline"), { code: "auth/network-request-failed" });
        },
        reload: async () => undefined,
        forceTokenRefresh: async () => undefined,
    });
    const user = { uid: "customer-1", emailVerified: false };
    assert.deepEqual(await coordinator.request(user), { state: "failed", category: "network" });
    assert.deepEqual(await coordinator.request(user), { state: "requested" });
    assert.equal(attempts, 2);
});

test("concurrent resend requests for one authenticated user share one provider request", async () => {
    const pending = deferred();
    let sends = 0;
    const coordinator = createEmailVerificationCoordinator({
        send: async () => { sends += 1; await pending.promise; },
        reload: async () => undefined,
        forceTokenRefresh: async () => undefined,
    });
    const user = { uid: "customer-1", emailVerified: false };
    const first = coordinator.request(user);
    const second = coordinator.request(user);
    assert.equal(first, second);
    assert.equal(sends, 1);
    pending.resolve();
    assert.deepEqual(await first, { state: "requested" });
});

test("trusted refresh distinguishes unverified, external verification, and stale-token refresh", async () => {
    const user = { uid: "customer-1", emailVerified: false };
    let refreshes = 0;
    const coordinator = createEmailVerificationCoordinator({
        send: async () => undefined,
        reload: async (target) => { target.emailVerified = true; },
        forceTokenRefresh: async () => { refreshes += 1; },
    });
    assert.deepEqual(await coordinator.refresh(user), { state: "verified" });
    assert.equal(refreshes, 1);

    const stillUnverified = createEmailVerificationCoordinator({
        send: async () => undefined,
        reload: async () => undefined,
        forceTokenRefresh: async () => { throw new Error("must not refresh"); },
    });
    assert.deepEqual(await stillUnverified.refresh({ uid: "customer-2", emailVerified: false }), { state: "unverified" });
});

test("refresh failures never produce a verified state and a missing session is explicit", async () => {
    const coordinator = createEmailVerificationCoordinator({
        send: async () => undefined,
        reload: async () => { throw Object.assign(new Error("offline"), { code: "auth/network-request-failed" }); },
        forceTokenRefresh: async () => undefined,
    });
    assert.deepEqual(await coordinator.refresh({ uid: "customer-1", emailVerified: false }), { state: "failed", category: "network" });
    assert.deepEqual(await coordinator.refresh(null), { state: "no_session" });
    assert.equal(classifyVerificationFailure({ code: "auth/user-disabled" }), "invalid_session");
});

test("an already verified session does not request another email", async () => {
    let sends = 0;
    const coordinator = createEmailVerificationCoordinator({
        send: async () => { sends += 1; },
        reload: async () => undefined,
        forceTokenRefresh: async () => undefined,
    });
    assert.deepEqual(await coordinator.request({ uid: "customer-1", emailVerified: true }), { state: "already_verified" });
    assert.equal(sends, 0);
});

test("Customer integration awaits delivery and exposes resend, refresh, and recovery controls", () => {
    const repository = readFileSync(new URL("../../../lib/firebaseAuth.ts", import.meta.url), "utf8");
    const signup = readFileSync(new URL("../../../app/(auth)/sign-up.tsx", import.meta.url), "utf8");
    const checkEmail = readFileSync(new URL("../../../app/(auth)/check-email.tsx", import.meta.url), "utf8");
    const signIn = readFileSync(new URL("../../../app/(auth)/sign-in.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(repository, /sendEmailVerification\([^)]*\)\.catch\(\(\) => null\)/);
    assert.match(repository, /requestVerification: \(user\) => emailVerificationCoordinator\.request\(user\)/);
    assert.match(signup, /result\.verificationRequest\.state === "requested"/);
    assert.match(signIn, /signInResult\?\.verificationRequired/);
    assert.match(checkEmail, /await resendEmailVerification\(\)/);
    assert.match(checkEmail, /await refreshEmailVerification\(\)/);
    assert.match(checkEmail, /await signOutVerificationSession\(\)/);
});
