import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BASELINE_FIREBASE_AUTHORIZED_DOMAINS, CONTINUATION, EXPECTED_FIREBASE_AUTHORIZED_DOMAINS, sha256 } from "./restaurant-vercel-preview-browser-notification-continuation.mjs";
import { INSPECTION, buildInspectionAuthorizationText, executeInspection, selectInspectionCredential, validateInspectionApproval } from "./inspect-restaurant-vercel-firebase-authorized-domain.mjs";

const bindings = { sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64), operatorSha256: "c".repeat(64), inspectorSha256: "d".repeat(64) };
const approval = (overrides = {}) => { const authorizationText = buildInspectionAuthorizationText(bindings); return { schemaVersion: 1, kind: INSPECTION.kind, decision: "APPROVE_READ_ONLY_FIREBASE_AUTH_CONFIG_INSPECTION", inspectionId: INSPECTION.inspectionId, issuedAt: "2026-09-28T00:00:00.000Z", expiresAt: "2026-09-28T02:00:00.000Z", authorizationText, authorizationTextSha256: sha256(Buffer.from(authorizationText)), ...bindings, projectId: INSPECTION.projectId, requiredDomain: INSPECTION.requiredDomain, evidenceDirectory: INSPECTION.evidenceDirectory, limits: INSPECTION.limits, ...overrides }; };

test("exact inspection approval is required and expires after exactly two hours", () => {
  assert.equal(validateInspectionApproval(approval(), { now: Date.parse("2026-09-28T01:00:00Z") }).inspectionId, INSPECTION.inspectionId);
  assert.throws(() => validateInspectionApproval(approval({ limits: { ...INSPECTION.limits, getRequests: 2 } }), { now: Date.parse("2026-09-28T01:00:00Z") }));
  assert.throws(() => validateInspectionApproval(approval(), { now: Date.parse("2026-09-28T02:00:00Z") }));
});

test("authorization text permits one GET and prohibits every mutation and retry", () => {
  const text = buildInspectionAuthorizationText(bindings);
  assert.match(text, /exactly one authenticated HTTPS GET/); assert.match(text, /zero retries/); assert.match(text, /zero Firebase configuration mutation/); assert.match(text, /zero Vercel action/); assert.match(text, /never persist the raw response body/);
});

test("credential selection requires exactly one mode-0600 service account for the exact project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-inspection-credential-")), secure = path.join(root, "secure/phase7"); fs.mkdirSync(secure, { recursive: true });
  const credential = path.join(root, "credential.json"); fs.writeFileSync(credential, JSON.stringify({ type: "service_account", project_id: INSPECTION.projectId, client_email: "fixture@example.invalid", private_key: "fixture" }), { mode: 0o600 }); fs.chmodSync(credential, 0o600);
  fs.writeFileSync(path.join(secure, "firebase-credential-candidates.json"), JSON.stringify({ paths: [credential] }));
  assert.equal(selectInspectionCredential({ repoRoot: root }).project_id, INSPECTION.projectId);
  fs.chmodSync(credential, 0o644); assert.throws(() => selectInspectionCredential({ repoRoot: root }), /Exactly one mode-0600/);
});

function executionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-inspection-execute-")), evidenceDirectory = path.join(root, INSPECTION.evidenceDirectory);
  return { root, evidenceDirectory, validatePrepared: () => ({ paths: { evidenceDirectory } }) };
}

const config = domains => ({ status: 200, data: { name: `projects/${CONTINUATION.firebaseProjectId}/config`, authorizedDomains: domains } });

test("execution performs exactly one GET and classifies present and absent without mutation", async () => {
  for (const [domains, classification] of [[EXPECTED_FIREBASE_AUTHORIZED_DOMAINS, "PASS_AUTHORIZED_DOMAIN_PRESENT"], [BASELINE_FIREBASE_AUTHORIZED_DOMAINS, "PASS_AUTHORIZED_DOMAIN_ABSENT"]]) {
    const fixture = executionFixture(); let requests = 0;
    const result = await executeInspection({ repoRoot: fixture.root, now: Date.parse("2026-09-28T01:00:00Z"), validatePrepared: fixture.validatePrepared, transport: async request => { requests++; assert.equal(request.method, "GET"); return config(domains); } });
    assert.equal(requests, 1); assert.equal(result.terminal.classification, classification); assert.equal(result.terminal.configurationMutations, 0); assert.equal(fs.existsSync(path.join(fixture.evidenceDirectory, "evidence-manifest.tsv")), true);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("terminal mapping fixtures distinguish all provider and schema outcomes", async () => {
  const cases = [
    [async () => ({ status: 401, data: {} }), "FAIL_AUTHENTICATION"],
    [async () => ({ status: 403, data: {} }), "FAIL_PERMISSION"],
    [async () => ({ status: 429, data: {} }), "FAIL_HTTP_OR_PROVIDER"],
    [async () => { throw new Error("transport unavailable"); }, "FAIL_TRANSPORT"],
    [async () => ({ status: 200, data: [] }), "FAIL_SCHEMA"],
    [async () => config(["unexpected.example"]), "FAIL_UNEXPECTED_DOMAIN_STATE"],
    [async () => ({ status: 200, data: { name: "projects/wrong/config", authorizedDomains: EXPECTED_FIREBASE_AUTHORIZED_DOMAINS } }), "ABORTED_WRONG_PROJECT"],
  ];
  for (const [transport, classification] of cases) {
    const fixture = executionFixture();
    const result = await executeInspection({ repoRoot: fixture.root, validatePrepared: fixture.validatePrepared, transport });
    assert.equal(result.terminal.classification, classification); assert.equal(result.terminal.requestCount, 1); assert.equal(result.terminal.retryEligible, false);
    const persisted = fs.readFileSync(path.join(fixture.evidenceDirectory, "firebase-authorized-domain-inspection.json"), "utf8");
    assert.doesNotMatch(persisted, /access_token|private_key|apiKey|Bearer /i);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
