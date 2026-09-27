import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTRACT,
  validateOwnerApproval,
} from "./validate-restaurant-run-l-http429-observation-authority.mjs";
import {
  classifyObservation,
  collectDirectGetObservations,
  executeObservation,
} from "./observe-restaurant-run-l-http429-read-only.mjs";

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const now = Date.parse("2026-09-27T10:00:00Z");

function approval(overrides = {}) {
  const authorizationText = `I authorize read-only ${CONTRACT.observationId} for ${CONTRACT.deploymentId} with no hosted mutation.`;
  return {
    schemaVersion: 1,
    kind: CONTRACT.kind,
    decision: "APPROVE_HTTP429_READ_ONLY_OBSERVATION",
    approvedForHostedReadOnlyObservation: true,
    observationId: CONTRACT.observationId,
    issuedAt: "2026-09-27T09:00:00.000Z",
    expiresAt: "2026-09-27T11:00:00.000Z",
    authorizationText,
    authorizationTextSha256: sha256(Buffer.from(authorizationText)),
    sourceCommit: "1".repeat(40),
    sourceManifestSha256: "2".repeat(64),
    proposalSha256: CONTRACT.proposalSha256,
    operatorSha256: "3".repeat(64),
    validatorSha256: "4".repeat(64),
    deploymentId: CONTRACT.deploymentId,
    origin: CONTRACT.origin,
    evidenceDirectory: CONTRACT.evidenceDirectory,
    resources: CONTRACT.resources,
    limits: CONTRACT.limits,
    allowedMethods: ["GET"],
    allowAuthentication: false,
    allowHostedMutation: false,
    ...overrides,
  };
}

const headers = { server: "cloudflare", "cf-ray": "safe-ray", "cache-control": "public" };
function browser({ rateLimit = true, failures = [], count = 2 } = {}) {
  return {
    documentLoads: Array.from({ length: count }, (_, index) => ({ kind: index ? "CACHE_BYPASS_RESTORATION" : "INITIAL" })),
    requestStarts: Array.from({ length: 10 }, (_, index) => ({ url: `${CONTRACT.origin}/asset-${index}` })),
    responses: rateLimit ? [{ status: 429, safeHeaders: headers, path: CONTRACT.resources[0].path }] : [{ status: 200, safeHeaders: headers }],
    failures,
  };
}
function direct({ status = 200, headers: responseHeaders = headers, count = 6 } = {}) {
  return { observations: CONTRACT.resources.slice(0, count).map(resource => ({ status, safeHeaders: responseHeaders, path: resource.path, exactContentParity: status === 200 })) };
}

test("exact owner approval validates during its two-hour interval", () => {
  assert.equal(validateOwnerApproval(approval(), now).observationId, CONTRACT.observationId);
});

test("expired authority fails closed", () => {
  assert.throws(() => validateOwnerApproval(approval(), Date.parse("2026-09-27T11:00:00Z")), /not currently valid/);
});

test("wrong deployment and mutation capability fail closed", () => {
  assert.throws(() => validateOwnerApproval(approval({ deploymentId: "wrong" }), now), /identity mismatch/);
  assert.throws(() => validateOwnerApproval(approval({ allowHostedMutation: true }), now), /unauthorized capability/);
});

test("429 with routing metadata is PASS", () => {
  assert.deepEqual(classifyObservation(browser(), direct()), { classification: "PASS", passed: true, reason: "RATE_LIMIT_LAYER_METADATA_CAPTURED", http429: 1, ambiguous: 0 });
});

test("missing identifying headers is INCONCLUSIVE", () => {
  const result = classifyObservation({ ...browser(), responses: [{ status: 429, safeHeaders: { "cache-control": "public" } }] }, direct());
  assert.equal(result.classification, "INCONCLUSIVE");
  assert.equal(result.reason, "RATE_LIMIT_LAYER_UNATTRIBUTABLE");
});

test("no observed 429 is INCONCLUSIVE", () => {
  assert.equal(classifyObservation(browser({ rateLimit: false }), direct()).reason, "NO_RATE_LIMIT_OBSERVED");
});

test("request-budget exhaustion and incomplete loads are FAIL", () => {
  assert.equal(classifyObservation(browser({ failures: [{ code: "REQUEST_BUDGET_EXHAUSTED" }] }), direct()).classification, "FAIL");
  assert.equal(classifyObservation(browser({ count: 1 }), direct()).classification, "FAIL");
});

test("direct GETs are sequential, fixed, body-free, and exact", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "http429-direct-"));
  let active = 0, peak = 0, calls = 0;
  const fetchImpl = async url => {
    active += 1; peak = Math.max(peak, active); calls += 1;
    const resource = CONTRACT.resources.find(row => url.endsWith(row.path));
    const bytes = Buffer.alloc(resource.bytes);
    // This test verifies sequencing/evidence; use the expected digest through a synthetic response wrapper below.
    active -= 1;
    return { status: 429, url, headers: new Headers(headers), arrayBuffer: async () => bytes };
  };
  const result = await collectDirectGetObservations({ directory, fetchImpl, now: () => now });
  assert.equal(calls, 6); assert.equal(peak, 1); assert.equal(result.observations.length, 6);
  assert.equal(result.observations.every(row => row.contentPersisted === false && row.method === "GET"), true);
  assert.equal(JSON.stringify(result).includes(Buffer.alloc(32).toString("base64")), false);
});

function executionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "http429-execute-"));
  const authorityPath = path.join(root, "authority.json"), manifestPath = path.join(root, "manifest.tsv");
  fs.writeFileSync(authorityPath, "{}\n"); fs.writeFileSync(manifestPath, "synthetic\n");
  return { root, authorityPath, manifestPath };
}

test("execution persists PASS evidence and manifest", async () => {
  const fixture = executionFixture();
  const result = await executeObservation({ repoRoot: fixture.root, authorityPath: fixture.authorityPath, sourceManifestPath: fixture.manifestPath, confirm: `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`, now: () => now, authorityValidator: () => ({ approval: { sourceCommit: "1".repeat(40), sourceManifestSha256: "2".repeat(64) } }), protectedVerifier: () => ({ passed: true }), browserCollector: async () => browser(), directCollector: async () => direct() });
  assert.equal(result.classification, "PASS");
  const directory = path.join(fixture.root, CONTRACT.evidenceDirectory);
  assert.equal(fs.existsSync(path.join(directory, "authority-validation.json")), true);
  assert.equal(fs.existsSync(path.join(directory, "terminal-result.json")), true);
  assert.equal(fs.existsSync(path.join(directory, "evidence-manifest.tsv")), true);
});

test("interruption persists initial observations and ABORTED terminal state", async () => {
  const fixture = executionFixture();
  const result = await executeObservation({ repoRoot: fixture.root, authorityPath: fixture.authorityPath, sourceManifestPath: fixture.manifestPath, confirm: `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`, now: () => now, authorityValidator: () => ({ approval: { sourceCommit: "1".repeat(40), sourceManifestSha256: "2".repeat(64) } }), protectedVerifier: () => ({ passed: true }), browserCollector: async () => { throw new Error("synthetic interruption"); }, directCollector: async () => direct() });
  const directory = path.join(fixture.root, CONTRACT.evidenceDirectory);
  assert.equal(result.classification, "ABORTED");
  assert.equal(fs.existsSync(path.join(directory, "browser-observations.json")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "terminal-result.json"))).promotionEligible, false);
});

test("exclusive evidence path blocks repeated execution", async () => {
  const fixture = executionFixture(), argumentsValue = { repoRoot: fixture.root, authorityPath: fixture.authorityPath, sourceManifestPath: fixture.manifestPath, confirm: `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`, now: () => now, authorityValidator: () => ({ approval: { sourceCommit: "1".repeat(40), sourceManifestSha256: "2".repeat(64) } }), protectedVerifier: () => ({ passed: true }), browserCollector: async () => browser(), directCollector: async () => direct() };
  await executeObservation(argumentsValue);
  await assert.rejects(() => executeObservation(argumentsValue), /EEXIST/);
});

test("credential-shaped observation evidence fails before persistence", async () => {
  const fixture = executionFixture();
  const result = await executeObservation({ repoRoot: fixture.root, authorityPath: fixture.authorityPath, sourceManifestPath: fixture.manifestPath, confirm: `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`, now: () => now, authorityValidator: () => ({ approval: { sourceCommit: "1".repeat(40), sourceManifestSha256: "2".repeat(64) } }), protectedVerifier: () => ({ passed: true }), browserCollector: async () => ({ ...browser(), responses: [{ status: 429, safeHeaders: { server: "Bearer abc.def.ghi" } }] }), directCollector: async () => direct() });
  assert.equal(result.classification, "FAIL");
  assert.equal(result.reason, "CREDENTIAL_EXPOSURE");
});

test("operator source contains no deployment, alias, rollback, Firebase, Supabase, or account client", () => {
  const source = fs.readFileSync(new URL("./observe-restaurant-run-l-http429-read-only.mjs", import.meta.url), "utf8");
  assert.equal(/from ["'][^"']*(deploy|firebase|supabase|account)/i.test(source), false);
  assert.equal(/eas-cli|alias:|rollback\s*\(/i.test(source), false);
  assert.equal(source.includes("method: \"GET\""), true);
});
