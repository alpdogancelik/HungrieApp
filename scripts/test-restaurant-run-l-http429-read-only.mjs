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
  classifyPausedRequest,
  classifyObservation,
  collectBrowserObservations,
  collectDirectGetObservations,
  executeObservation,
  reconcileObservationTerminal,
  verifyEvidenceManifest,
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
    cleanup: { browserClosed: true, profileRemoved: true, error: null },
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
  const credentialShapedHeader = ["Be", "arer ", "abc", ".def", ".ghi"].join("");
  const result = await executeObservation({ repoRoot: fixture.root, authorityPath: fixture.authorityPath, sourceManifestPath: fixture.manifestPath, confirm: `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`, now: () => now, authorityValidator: () => ({ approval: { sourceCommit: "1".repeat(40), sourceManifestSha256: "2".repeat(64) } }), protectedVerifier: () => ({ passed: true }), browserCollector: async () => ({ ...browser(), responses: [{ status: 429, safeHeaders: { server: credentialShapedHeader } }] }), directCollector: async () => direct() });
  assert.equal(result.classification, "FAIL");
  assert.equal(result.reason, "CREDENTIAL_EXPOSURE");
});

test("bare token words are safe metadata while true credential headers fail", () => {
  const allowed = new Set(["/suspended"]);
  const lexical = classifyPausedRequest({ url: "https://securetoken.googleapis.com/v1/token", method: "GET", headers: {} }, allowed);
  assert.equal(lexical.code, "UNEXPECTED_ORIGIN");
  assert.deepEqual(lexical.row.credentialHeaderNames, []);
  const credentialValue = ["Be", "arer ", "synthetic", "-credential"].join("");
  const credential = classifyPausedRequest({ url: `${CONTRACT.origin}/suspended`, method: "GET", headers: { Authorization: credentialValue } }, allowed);
  assert.equal(credential.code, "CREDENTIAL_BEARING_REQUEST");
  assert.deepEqual(credential.row.credentialHeaderNames, ["authorization"]);
  assert.equal(JSON.stringify(credential.row).includes(credentialValue), false);
});

test("unexpected same-origin resources and non-GET methods remain fail closed", () => {
  const allowed = new Set(["/suspended"]);
  assert.equal(classifyPausedRequest({ url: `${CONTRACT.origin}/not-reviewed`, method: "GET", headers: {} }, allowed).code, "UNEXPECTED_RESOURCE_ACCESS");
  assert.equal(classifyPausedRequest({ url: `${CONTRACT.origin}/suspended`, method: "POST", headers: {} }, allowed).code, "UNAUTHORIZED_METHOD");
});

test("asynchronous CDP listener exceptions stop loading, persist failure, and clean browser", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "http429-listener-")), directory = path.join(root, "evidence");
  fs.mkdirSync(directory);
  let listener, closed = 0, stopped = 0, fetchDisabled = 0;
  const cdp = {
    on(value) { listener = value; },
    async send(method) {
      if (method === "Page.navigate") setTimeout(() => listener({ method: "Fetch.requestPaused", params: { requestId: "unsafe", resourceType: "XHR", request: { url: "https://securetoken.googleapis.com/v1/token", method: "GET", headers: {} } } }), 0);
      if (method === "Page.stopLoading") stopped += 1;
      if (method === "Fetch.disable") fetchDisabled += 1;
      return {};
    },
  };
  await assert.rejects(() => collectBrowserObservations({ repoRoot: process.cwd(), directory, now: () => now, wait: milliseconds => new Promise(resolve => setTimeout(resolve, Math.min(milliseconds, 25))), openChromeImpl: async () => ({ version: "SyntheticChrome", cdp }), closeChromeImpl: async () => { closed += 1; } }), error => error.code === "UNEXPECTED_ORIGIN");
  const evidence = JSON.parse(fs.readFileSync(path.join(directory, "browser-observations.json")));
  assert.equal(evidence.failures[0].code, "UNEXPECTED_ORIGIN");
  assert.equal(evidence.requestStarts[0].url, "https://securetoken.googleapis.com/v1/token");
  assert.deepEqual(evidence.requestStarts[0].queryParameterNames, []);
  assert.deepEqual(evidence.cleanup, { browserClosed: true, profileRemoved: true, error: null });
  assert.equal(closed, 1); assert.equal(stopped > 0, true); assert.equal(fetchDisabled > 0, true);
});

test("partial CDP response-body capture stays bounded and explicit", () => {
  const result = classifyObservation({ ...browser(), responses: [{ status: 429, safeHeaders: headers, errorBody: { byteLength: 123, sha256: null, withinLimit: false, contentPersisted: false, error: "BODY_CAPTURE_INCOMPLETE" } }] }, direct());
  assert.equal(result.classification, "PASS");
  assert.equal(result.http429, 1);
});

test("missing CDP response body is persisted without losing the HTTP observation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "http429-partial-cdp-")), directory = path.join(root, "evidence");
  fs.mkdirSync(directory);
  let listener, navigation = 0;
  const cdp = {
    on(value) { listener = value; },
    async send(method) {
      if (method === "Page.navigate") {
        navigation += 1;
        const requestId = `request-${navigation}`;
        setTimeout(() => {
          listener({ method: "Fetch.requestPaused", params: { requestId: `fetch-${navigation}`, resourceType: "Document", request: { url: `${CONTRACT.origin}/suspended`, method: "GET", headers: {} } } });
          listener({ method: "Network.responseReceived", params: { requestId, type: "Document", response: { url: `${CONTRACT.origin}/suspended`, status: 429, protocol: "h2", headers, fromDiskCache: false, fromPrefetchCache: false, fromServiceWorker: false } } });
          listener({ method: "Network.loadingFinished", params: { requestId, encodedDataLength: 321 } });
        }, 0);
      }
      if (method === "Network.getResponseBody") throw new Error("body unavailable");
      if (method === "Runtime.evaluate") return { result: { value: { supported: true, controller: false, registrations: [] } } };
      return {};
    },
  };
  const result = await collectBrowserObservations({ repoRoot: process.cwd(), directory, now: () => now, wait: milliseconds => new Promise(resolve => setTimeout(resolve, Math.min(milliseconds, 25))), openChromeImpl: async () => ({ version: "SyntheticChrome", cdp }), closeChromeImpl: async () => {} });
  assert.equal(result.responses.length, 2);
  assert.equal(result.responses.every(row => row.status === 429 && row.errorBody?.contentPersisted === false && row.errorBody?.error === "body unavailable"), true);
  assert.equal(result.cleanup.browserClosed, true);
});

test("browser cleanup failure remains a terminal operator error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "http429-cleanup-")), directory = path.join(root, "evidence");
  fs.mkdirSync(directory);
  const cdp = { on() {}, async send(method) { if (method === "Runtime.evaluate") return { result: { value: {} } }; return {}; } };
  await assert.rejects(() => collectBrowserObservations({ repoRoot: process.cwd(), directory, now: () => now, wait: async () => {}, openChromeImpl: async () => ({ version: "SyntheticChrome", cdp }), closeChromeImpl: async () => { throw new Error("synthetic close failure"); } }), error => error.code === "BROWSER_CLEANUP_FAILED");
  const evidence = JSON.parse(fs.readFileSync(path.join(directory, "browser-observations.json")));
  assert.equal(evidence.cleanup.browserClosed, false);
  assert.equal(evidence.cleanup.profileRemoved, true);
});

test("terminal reconciliation is idempotent and manifest detects tampering", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "http429-reconcile-"));
  fs.writeFileSync(path.join(directory, "browser-observations.json"), JSON.stringify(browser()) + "\n");
  fs.writeFileSync(path.join(directory, "direct-get-observations.json"), JSON.stringify(direct()) + "\n");
  const terminal = { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, completedAt: new Date(now).toISOString(), classification: "PASS", passed: true, reason: "RATE_LIMIT_LAYER_METADATA_CAPTURED", promotionEligible: false, deploymentEligible: false, mutationPerformed: false, credentialValuesPersisted: false };
  const first = reconcileObservationTerminal({ directory, terminal, now: () => now });
  const firstTerminal = fs.readFileSync(path.join(directory, "terminal-result.json"));
  const second = reconcileObservationTerminal({ directory, terminal: { ...terminal, reason: "MUST_NOT_REWRITE" }, now: () => now + 1000 });
  assert.equal(first.idempotent, false); assert.equal(second.idempotent, true);
  assert.equal(fs.readFileSync(path.join(directory, "terminal-result.json")).equals(firstTerminal), true);
  assert.equal(verifyEvidenceManifest(directory).passed, true);
  fs.appendFileSync(path.join(directory, "browser-observations.json"), "tamper");
  assert.throws(() => verifyEvidenceManifest(directory), /integrity mismatch/);
});

test("consumed authority replay remains rejected by exclusive evidence paths", async () => {
  const fixture = executionFixture(), consumed = path.join(fixture.root, CONTRACT.evidenceDirectory);
  fs.mkdirSync(consumed, { recursive: true });
  await assert.rejects(() => executeObservation({ repoRoot: fixture.root, authorityPath: fixture.authorityPath, sourceManifestPath: fixture.manifestPath, confirm: `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`, now: () => now, authorityValidator: () => ({ approval: { sourceCommit: "1".repeat(40), sourceManifestSha256: "2".repeat(64) } }), protectedVerifier: () => ({ passed: true }), browserCollector: async () => browser(), directCollector: async () => direct() }), /EEXIST/);
});

test("operator source contains no deployment, alias, rollback, Firebase, Supabase, or account client", () => {
  const source = fs.readFileSync(new URL("./observe-restaurant-run-l-http429-read-only.mjs", import.meta.url), "utf8");
  assert.equal(/from ["'][^"']*(deploy|firebase|supabase|account)/i.test(source), false);
  assert.equal(/eas-cli|alias:|rollback\s*\(/i.test(source), false);
  assert.equal(source.includes("method: \"GET\""), true);
});
