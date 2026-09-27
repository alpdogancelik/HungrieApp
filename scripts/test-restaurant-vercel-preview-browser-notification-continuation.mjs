import assert from "node:assert/strict";
import test from "node:test";
import { CONTINUATION, buildAuthorizationText, classifySafetyError, executeControlledContinuation, sha256, validateApproval } from "./restaurant-vercel-preview-browser-notification-continuation.mjs";

const bindings = { sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64), operatorSha256: "c".repeat(64), qualifierSha256: "d".repeat(64) };
const approval = (overrides = {}) => {
  const authorizationText = buildAuthorizationText(bindings);
  return { schemaVersion: 1, kind: CONTINUATION.kind, decision: "APPROVE_CONTROLLED_VERCEL_BROWSER_NOTIFICATION_CONTINUATION", qualificationId: CONTINUATION.qualificationId, issuedAt: "2026-09-28T00:00:00.000Z", expiresAt: "2026-09-28T02:00:00.000Z", authorizationText, authorizationTextSha256: sha256(Buffer.from(authorizationText)), ...bindings, deploymentId: CONTINUATION.deploymentId, origin: CONTINUATION.origin, evidenceDirectory: CONTINUATION.evidenceDirectory, limits: CONTINUATION.limits, ...overrides };
};

test("exact comprehensive approval validates", () => assert.equal(validateApproval(approval(), { now: Date.parse("2026-09-28T01:00:00Z") }).qualificationId, CONTINUATION.qualificationId));
test("expired approval fails", () => assert.throws(() => validateApproval(approval(), { now: Date.parse("2026-09-28T02:00:00Z") }), /not currently valid/));
test("changed text, deployment, origin, limits, or evidence path fails", () => {
  for (const changed of [
    { authorizationText: approval().authorizationText + " changed" },
    { deploymentId: "wrong" }, { origin: "https://wrong.invalid" }, { evidenceDirectory: "secure/wrong" },
    { limits: { ...CONTINUATION.limits, foregroundFcmSends: 2 } },
  ]) assert.throws(() => validateApproval(approval(changed), { now: Date.parse("2026-09-28T01:00:00Z") }));
});
test("safety errors are distinct from ordinary qualification failures", () => {
  assert.equal(classifySafetyError(Object.assign(new Error(), { code: "UNEXPECTED_ORIGIN" })), true);
  assert.equal(classifySafetyError(Object.assign(new Error(), { code: "HTTP_429" })), false);
});

function operations(overrides = {}) {
  const calls = [];
  const op = {
    calls,
    verifyPrerequisites: async () => calls.push("verify"), createBypass: async () => calls.push("create-bypass"),
    verifyParityEvidence: async () => calls.push("parity"),
    qualifyAccounts: async () => (calls.push("accounts"), { pending: "PASS", suspended: "PASS", owner: "PASS", manager: "PASS" }),
    verifyServiceWorker: async () => (calls.push("worker"), true), openOwnerNotificationContext: async () => (calls.push("open"), { id: 1 }),
    registerToken: async () => calls.push("register"), sendForeground: async () => calls.push("foreground"), sendBackground: async () => calls.push("background"),
    verifyRealClick: async () => (calls.push("click"), true), unregisterToken: async () => calls.push("unregister"), closeBrowser: async () => calls.push("close"), revokeBypass: async () => calls.push("revoke"),
    ...overrides,
  };
  return op;
}

test("complete workflow passes and always cleans token, browser, and bypass", async () => {
  const op = operations(), result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "PASS");
  assert.deepEqual(op.calls, ["verify", "create-bypass", "parity", "accounts", "worker", "open", "register", "foreground", "background", "click", "unregister", "close", "revoke"]);
});
test("unsupported real click is inconclusive without weakening delivery requirements", async () => {
  const result = await executeControlledContinuation({ operations: operations({ verifyRealClick: async () => false }) });
  assert.equal(result.classification, "INCONCLUSIVE"); assert.equal(result.notifications.background, "PASS"); assert.equal(result.notifications.click, "NOT_EXECUTED");
});
test("ordinary account failure preserves exhaustive matrix and blocks notification mutations", async () => {
  const op = operations({ qualifyAccounts: async () => ({ pending: "PASS", suspended: "FAIL", owner: "PASS", manager: "PASS" }) });
  const result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "FAIL"); assert.equal(result.notifications.registration, "NOT_EXECUTED"); assert.equal(op.calls.includes("register"), false); assert.equal(op.calls.at(-1), "revoke");
});
test("notification failure triggers scoped cleanup without retry", async () => {
  let sends = 0; const op = operations({ sendForeground: async () => { sends += 1; throw new Error("delivery failed"); } });
  const result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "FAIL"); assert.equal(sends, 1); assert.equal(result.cleanup.token, "PASS"); assert.equal(result.cleanup.bypass, "PASS");
});
test("safety failure aborts and cleanup failure remains terminal", async () => {
  const error = Object.assign(new Error("origin mismatch"), { code: "UNEXPECTED_ORIGIN" });
  const result = await executeControlledContinuation({ operations: operations({ verifyParityEvidence: async () => { throw error; }, revokeBypass: async () => { throw new Error("cleanup failed"); } }) });
  assert.equal(result.classification, "ABORTED"); assert.equal(result.cleanup.bypass, "FAIL");
});
