import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DIAGNOSTIC_OPERATOR,
  REJECTED_DEPLOYMENTS,
  classifyVerificationNextAction,
  createDeterministicArchive,
  consumeDeploymentReservation,
  executePromotionBoundary,
  performSinglePromotion,
  promotionCommand,
  requireActionConfirmation,
  requireMaintenanceWindow,
  rollbackCommand,
  rollbackContractDigest,
  validateAuthority,
  validateRollbackReference,
  validateImmediateRollbackRecheck,
  validatePromotionPrerequisites,
  verifyImmutableArtifactParity,
  verifyLocalExportOutput,
  verifyProtectedEvidence,
  verifyRollbackParity,
} from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { sanitizeRequest } from "./qualify-restaurant-alias-diagnostic-access-staging.mjs";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const candidateHtml = Buffer.from('<!doctype html><link href="/app.css" rel="stylesheet"><script src="/app.js"></script>');
const candidateJs = Buffer.from("globalThis.APP=true;");
const candidateCss = Buffer.from("body{color:#123456}");
const expected = {
  deploymentIdentifier: "rollback-deployment",
  routes: Array.from({ length: 6 }, (_, index) => ({ route: `/route-${index + 1}`, sha256: hash(candidateHtml) })),
  criticalAssets: [{ asset: "/app.js", sha256: hash(candidateJs) }, { asset: "/app.css", sha256: hash(candidateCss) }],
};
const evidenceHash = character => character.repeat(64);

test("reviewed candidate artifact evidence is complete and matches the fixed identity", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const evidence = path.join(root, "docs/restaurant-expo-alias-artifact-remediation-evidence");
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, "candidate-artifact-manifest.json"), "utf8"));
  const rows = manifest.files.map(row => `${row.sha256}\t${row.bytes}\t${row.path}`).join("\n") + "\n";
  assert.equal(manifest.fileCount, 74);
  assert.equal(hash(rows), DIAGNOSTIC_OPERATOR.artifactManifestSha256);
  assert.equal(manifest.artifactManifestSha256, DIAGNOSTIC_OPERATOR.artifactManifestSha256);
  assert.equal(manifest.criticalAssets.length, 5);
  assert.equal(manifest.routes.length, 20);
  assert.deepEqual(Object.keys(manifest.runtimeFiles).sort(), [...DIAGNOSTIC_OPERATOR.runtimeFiles].map(value => value.slice(1)).sort());
  assert.equal(hash(fs.readFileSync(path.join(evidence, "restaurant-static-export.tar"))), DIAGNOSTIC_OPERATOR.archiveSha256);
});

function authority(overrides = {}) {
  return {
    contractVersion: 1,
    approvedForHostedExecution: true,
    environment: "staging",
    planSha256: DIAGNOSTIC_OPERATOR.planSha256,
    applicationTree: DIAGNOSTIC_OPERATOR.applicationTree,
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
    easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
    supabaseProjectRef: DIAGNOSTIC_OPERATOR.supabaseProjectRef,
    firebaseProjectId: DIAGNOSTIC_OPERATOR.firebaseProjectId,
    aliasId: DIAGNOSTIC_OPERATOR.aliasId,
    aliasName: DIAGNOSTIC_OPERATOR.aliasName,
    aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
    runId: "ruip6ad_localtest",
    sourceCommit: "a".repeat(40),
    sourceManifestSha256: "b".repeat(64),
    ownerAuthorizationSha256: "c".repeat(64),
    maintenanceWindowStart: "2026-09-25T10:00:00.000Z",
    maintenanceWindowEnd: "2026-09-25T12:00:00.000Z",
    ...overrides,
  };
}

function fakeClock() {
  let current = Date.parse("2026-09-24T12:00:00.000Z");
  return { now: () => current, sleep: async milliseconds => { current += milliseconds; }, advance: milliseconds => { current += milliseconds; } };
}

function responseFor(url, state) {
  const pathname = new URL(url).pathname;
  const body = pathname === "/app.js" ? candidateJs : pathname === "/app.css" ? candidateCss : candidateHtml;
  return new Response(state.status === 200 ? body : `status-${state.status}`, {
    status: state.status,
    headers: { "cache-control": "public,max-age=60", age: "3", etag: `\"${state.status}\"`, "cf-ray": "local-test" },
  });
}

async function runRollback(scenario) {
  const clock = fakeClock();
  const snapshots = [];
  const fetchImpl = async input => { const state = scenario(Math.floor((clock.now() - Date.parse("2026-09-24T12:00:00.000Z")) / 10_000) + 1, new URL(input).pathname); const response = responseFor(input, state); Object.defineProperty(response, "url", { value: String(input) }); clock.advance(state.elapsedMs ?? 2); return response; };
  const evidence = await verifyRollbackParity({
    aliasUrl: "https://alias.example.invalid",
    runId: "ruip6ad_localtest",
    expected,
    retrieveMetadata: async ({ attempt }) => ({ deploymentIdentifier: scenario(attempt, "/metadata").metadata, updatedAt: null }),
    persist: async value => snapshots.push(structuredClone(value)),
    fetchImpl,
    clock,
    deadlineSignal: () => new AbortController().signal,
  });
  return { evidence, snapshots };
}

function validPromotionEvidence() {
  const currentMs = Date.parse("2026-09-25T10:00:00.000Z"), capturedAt = new Date(currentMs - 10_000).toISOString();
  const approved = authority(), deployment = { deploymentIdentifier: "new-candidate", url: "https://new-candidate.expo.app", sourceCommit: approved.sourceCommit, sourceManifestSha256: approved.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256 };
  const artifact = { runId: approved.runId, sourceCommit: approved.sourceCommit, sourceManifestSha256: approved.sourceManifestSha256, applicationTree: DIAGNOSTIC_OPERATOR.applicationTree, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, files: Array.from({ length: 74 }, (_, index) => ({ path: `file-${index}`, bytes: 1, sha256: evidenceHash("a") })) };
  const immutableEvidenceSha256 = evidenceHash("d"), accessEvidenceSha256 = evidenceHash("e"), rollbackEvidenceSha256 = evidenceHash("f");
  const immutable = { passed: true, completedAt: capturedAt, runId: approved.runId, deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url, sourceCommit: approved.sourceCommit, sourceManifestSha256: approved.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, artifactFiles: 74, routes: Array.from({ length: 6 }, () => ({ passed: true })), criticalAssets: Array.from({ length: 5 }, () => ({ passed: true })), publishedFiles: Array.from({ length: 73 }, () => ({ passed: true })), deploymentControls: [{ path: "_expo/.routes.json", publicUrlExpected: false, disposition: "consumed-as-static-routing-configuration", passed: true }], externalRuntime: Array.from({ length: 2 }, () => ({ passed: true })) };
  const access = { passed: true, capturedAt, runId: approved.runId, qualificationId: `${approved.runId}:${deployment.deploymentIdentifier}:immutable-access`, deploymentIdentifier: deployment.deploymentIdentifier, immutableUrl: deployment.url, sourceCommit: approved.sourceCommit, sourceManifestSha256: approved.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, immutableEvidenceSha256, results: [["pending", "/pending"], ["suspended", "/suspended"], ["owner", "/dashboard"], ["manager", "/dashboard"]].map(([account, expectedPath]) => ({ passed: true, account, expectedPath })) };
  const rollbackAssets = [{ asset: "/old.js", bytes: 1, sha256: evidenceHash("2") }];
  const rollback = { passed: true, capturedAt, runId: approved.runId, deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment, deploymentUrl: "https://rollback.invalid", routes: Array.from({ length: 6 }, (_, index) => ({ route: `/route-${index}`, bytes: 1, sha256: evidenceHash("1"), referencedAssets: rollbackAssets.map(row => row.asset) })), criticalAssets: rollbackAssets, runtimeFiles: DIAGNOSTIC_OPERATOR.runtimeFiles.map((runtimePath, i) => ({ path: runtimePath, bytes: 1, sha256: hash("runtime" + i) })), externalRuntime: DIAGNOSTIC_OPERATOR.externalRuntime.map((row, i) => ({ url: row.url, bytes: i ? 37024 : 31766, sha256: row.sha256 })) };
  rollback.contractSha256 = rollbackContractDigest(rollback);
  const preflight = { passed: true, capturedAt, runId: approved.runId, environment: "staging", identities: { supabaseProjectRef: DIAGNOSTIC_OPERATOR.supabaseProjectRef, firebaseProjectId: DIAGNOSTIC_OPERATOR.firebaseProjectId, easProjectId: DIAGNOSTIC_OPERATOR.easProjectId, aliasId: DIAGNOSTIC_OPERATOR.aliasId, aliasName: DIAGNOSTIC_OPERATOR.aliasName, aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl }, source: { commit: approved.sourceCommit, manifestSha256: approved.sourceManifestSha256, applicationTree: DIAGNOSTIC_OPERATOR.applicationTree }, artifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256 }, migration: { ...DIAGNOSTIC_OPERATOR.conflictMigration, appliedExactlyOnce: true, pendingCount: 0 }, earnings: { capability: "restaurant_earnings_v1", enabled: false }, protectedEvidence: DIAGNOSTIC_OPERATOR.protectedEvidence.map(row => ({ ...row, passed: true })), candidate: { deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url, immutableEvidenceSha256, accessEvidenceSha256 }, rollback: { deploymentIdentifier: rollback.deploymentIdentifier, referenceSha256: rollbackEvidenceSha256, parityPassed: true } };
  return { authority: approved, artifact, artifactEntriesSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveEvidenceSha256: DIAGNOSTIC_OPERATOR.archiveSha256, deployment, immutable, immutableEvidenceSha256, access, accessEvidenceSha256, rollback, rollbackEvidenceSha256, preflight, protectedEvidenceVerification: DIAGNOSTIC_OPERATOR.protectedEvidence.map(row => ({ ...row, passed: true })), currentMs };
}

function clone(value) { return structuredClone(value); }

function passingRollbackRecheck(value) {
  return { evidence: { passed: true, classification: "PASS", rollbackRequired: false, runId: value.rollback.runId, completedAt: new Date(value.currentMs - 1_000).toISOString(), expected: clone(value.rollback), selectedAttempts: [{ number: 1 }, { number: 4 }] }, sha256: evidenceHash("a"), currentMs: value.currentMs };
}

async function immutableFixture(mutate = () => {}) {
  const base = "https://candidate.example.invalid";
  const routesConfiguration = { headers: { "Cache-Control": "private, no-cache", "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" }, redirects: [] };
  const html = Buffer.from('<!doctype html><link href="/_expo/static/a.css"><link href="/_expo/static/b.css"><link href="/_expo/static/c.css"><link href="/_expo/static/d.css"><script src="/_expo/static/e.js"></script>');
  const assets = new Map([["/_expo/static/a.css", Buffer.from("a")], ["/_expo/static/b.css", Buffer.from("b")], ["/_expo/static/c.css", Buffer.from("c")], ["/_expo/static/d.css", Buffer.from("d")], ["/_expo/static/e.js", Buffer.from("e")]]);
  const routePaths = [["/login", "login.html"], ["/dashboard", "dashboard.html"], ["/orders/detail?orderId=phase6", "orders/detail.html"], ["/menu", "menu.html"], ["/reviews", "reviews.html"], ["/earnings", "earnings.html"]];
  const appCompat = fs.readFileSync(path.resolve(import.meta.dirname, "../node_modules/firebase/firebase-app-compat.js"));
  const messagingCompat = fs.readFileSync(path.resolve(import.meta.dirname, "../node_modules/firebase/firebase-messaging-compat.js"));
  const sw = Buffer.from(`importScripts("${DIAGNOSTIC_OPERATOR.externalRuntime[0].url}","${DIAGNOSTIC_OPERATOR.externalRuntime[1].url}")`);
  const fileBodies = new Map(routePaths.map(([, file]) => [file, html]));
  for (const [asset, body] of assets) fileBodies.set(asset.slice(1), body);
  fileBodies.set("_expo/.routes.json", Buffer.from(JSON.stringify(routesConfiguration)));
  fileBodies.set("manifest.webmanifest", Buffer.from("{}")); fileBodies.set("sw.js", sw); fileBodies.set("firebase-config.js", Buffer.from("config"));
  while (fileBodies.size < 74) fileBodies.set(`other-${fileBodies.size}.txt`, Buffer.from("x"));
  const files = [...fileBodies].map(([file, body]) => ({ path: file, bytes: body.length, sha256: hash(body) }));
  const controlFile = files.find(row => row.path === "_expo/.routes.json");
  const artifact = { artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, files, deploymentControls: [{ path: controlFile.path, bytes: controlFile.bytes, sha256: controlFile.sha256, provider: "eas-cli@16.32.0", disposition: "consumed-as-static-routing-configuration", configuration: routesConfiguration }] };
  const state = { status: 200, finalUrl: null, body: null, omitHeaders: false }; mutate({ state, html, assets, artifact, fileBodies });
  const snapshots = [];
  const requestedPaths = [];
  const fetchImpl = async input => {
    const url = new URL(input);
    requestedPaths.push(url.pathname);
    const body = state.body || (url.origin === "https://www.gstatic.com" ? (url.pathname.includes("messaging") ? messagingCompat : appCompat) : assets.get(url.pathname) || fileBodies.get(url.pathname.slice(1)) || html);
    const headers = url.origin === base && !state.omitHeaders ? { "cache-control": "no-cache, private", "content-security-policy": routesConfiguration.headers["Content-Security-Policy"], "x-content-type-options": "nosniff" } : {};
    const response = new Response(body, { status: state.status, headers }); Object.defineProperty(response, "url", { value: state.finalUrl || url.href }); return response;
  };
  const evidence = await verifyImmutableArtifactParity({ base, deploymentIdentifier: "new-candidate", artifact, fetchImpl, persist: async value => snapshots.push(clone(value)), clock: { now: () => Date.parse("2026-09-25T10:00:00Z") } });
  return { evidence, snapshots, requestedPaths };
}

test("authority is exact and fail-closed", () => {
  assert.equal(validateAuthority(authority()).environment, "staging");
  for (const [field, value] of [["environment", "production"], ["easProjectId", "wrong"], ["planSha256", "0".repeat(64)], ["approvedForHostedExecution", false]]) {
    assert.throws(() => validateAuthority(authority({ [field]: value })), new RegExp(field, "i"));
  }
});

test("all rejected deployments, including retained aborted candidates, are denied", () => {
  assert.equal(DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment, "6jki82fy0u");
  assert.ok(REJECTED_DEPLOYMENTS.includes("ipcij64k47"));
  assert.ok(REJECTED_DEPLOYMENTS.includes("tnc8x1kw9w"));
  for (const identifier of REJECTED_DEPLOYMENTS) assert.throws(() => promotionCommand(identifier), /new non-rejected/);
  assert.deepEqual(promotionCommand("new-candidate"), ["eas-cli@16.32.0", "deploy:alias", "--alias", "staging", "--id", "new-candidate", "--json", "--non-interactive"]);
});

test("artifact archives use canonical UTF-8 path order and deterministic USTAR bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-archive-test-"));
  const source = path.join(directory, "source"), reversed = path.join(directory, "reversed");
  const entries = [["z.txt", "last\n"], ["orders/detail.html", "detail\n"], ["orders/[orderId].html", "dynamic\n"], ["orders.html", "orders\n"], ["nested/a.txt", "first\n"]];
  for (const root of [source, reversed]) fs.mkdirSync(root, { recursive: true });
  for (const [name, content] of entries) { const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  for (const [name, content] of [...entries].reverse()) { const file = path.join(reversed, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  const first = path.join(directory, "first.tar"), second = path.join(directory, "second.tar");
  try {
    const firstResult = createDeterministicArchive(source, first), secondResult = createDeterministicArchive(reversed, second);
    assert.deepEqual(firstResult, secondResult);
    assert.deepEqual(fs.readFileSync(first), fs.readFileSync(second));
    const listing = spawnSync("python3", ["-c", "import json,sys,tarfile; print(json.dumps([m.name for m in tarfile.open(sys.argv[1]).getmembers()]))", first], { encoding: "utf8" });
    assert.equal(listing.status, 0);
    assert.deepEqual(JSON.parse(listing.stdout), ["nested/a.txt", "orders.html", "orders/[orderId].html", "orders/detail.html", "z.txt"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("the complete local export gate accepts the reviewed 74-file artifact and canonical archive", () => {
  const root = path.resolve(import.meta.dirname, ".."), directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-export-gate-"));
  const artifact = path.join(root, "docs/restaurant-expo-alias-artifact-remediation-evidence/restaurant-static-export.tar"), dist = path.join(directory, "dist"), archive = path.join(directory, "rebuilt.tar");
  fs.mkdirSync(dist);
  try {
    const extracted = spawnSync("tar", ["-xf", artifact, "-C", dist], { encoding: "utf8" });
    assert.equal(extracted.status, 0);
    const result = verifyLocalExportOutput({ distDirectory: dist, archivePath: archive });
    assert.equal(result.files.length, 74);
    assert.equal(result.deploymentControls.length, 1);
    assert.equal(result.deploymentControls[0].path, "_expo/.routes.json");
    assert.equal(result.deploymentControls[0].configuration.headers["Content-Security-Policy"].includes("frame-ancestors 'none'"), true);
    assert.equal(result.artifactManifestSha256, DIAGNOSTIC_OPERATOR.artifactManifestSha256);
    assert.equal(result.archive.sha256, DIAGNOSTIC_OPERATOR.archiveSha256);
    assert.deepEqual(fs.readFileSync(archive), fs.readFileSync(artifact));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("protected prior-run evidence is independently verified", () => {
  const rows = verifyProtectedEvidence(path.resolve(import.meta.dirname, ".."));
  assert.deepEqual(rows, DIAGNOSTIC_OPERATOR.protectedEvidence.map(row => ({ ...row, passed: true })));
});

test("promotion and rollback require separate action confirmations", () => {
  const approved = authority();
  assert.doesNotThrow(() => requireActionConfirmation("promote", approved, `staging:restaurant-alias-diagnostic:promote:${approved.runId}`));
  assert.doesNotThrow(() => requireActionConfirmation("rollback", approved, `staging:restaurant-alias-diagnostic:rollback:${approved.runId}`));
  assert.throws(() => requireActionConfirmation("rollback", approved, `staging:restaurant-alias-diagnostic:promote:${approved.runId}`), /mismatch/);
  assert.deepEqual(rollbackCommand("captured-rollback"), ["eas-cli@16.32.0", "deploy:alias", "--alias", "staging", "--id", "captured-rollback", "--json", "--non-interactive"]);
});

test("the atomic marker permits one promotion and blocks automatic retry", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-promotion-test-"));
  let calls = 0;
  const spawn = () => { calls += 1; return { status: 0, stdout: '{"ok":true}\n' }; };
  const record = { deploymentIdentifier: "new-candidate" };
  try {
    const first = performSinglePromotion({ runDirectory: directory, record, appRoot: process.cwd(), spawn });
    assert.equal(first.raw.ok, true);
    assert.equal(calls, 1);
    assert.throws(() => performSinglePromotion({ runDirectory: directory, record, appRoot: process.cwd(), spawn }), /EEXIST/);
    assert.equal(calls, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("a failed promotion retains its marker and cannot be retried", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-promotion-failure-test-"));
  let calls = 0;
  const spawn = () => { calls += 1; return { status: 1, stdout: "" }; };
  const record = { deploymentIdentifier: "new-candidate" };
  try {
    assert.throws(() => performSinglePromotion({ runDirectory: directory, record, appRoot: process.cwd(), spawn }), /retry prohibited/);
    assert.throws(() => performSinglePromotion({ runDirectory: directory, record, appRoot: process.cwd(), spawn }), /EEXIST/);
    assert.equal(calls, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("terminal verification decisions never trigger promotion", () => {
  assert.equal(classifyVerificationNextAction({ classification: "PASS", passed: true, rollbackRequired: false }), "post-parity-qualification");
  for (const classification of ["FAIL", "INCONCLUSIVE", "ABORTED"]) assert.equal(classifyVerificationNextAction({ classification, rollbackRequired: true }), "rollback-required");
  assert.equal(classifyVerificationNextAction({ classification: "RUNNING" }), "stop-unexpected-verification-state");
});

test("rollback verification requires two exact observations thirty seconds apart", async () => {
  const { evidence, snapshots } = await runRollback(() => ({ metadata: "rollback-deployment", status: 200 }));
  assert.equal(evidence.passed, true);
  assert.deepEqual(evidence.selectedAttempts.map(row => row.number), [1, 4]);
  assert.equal(evidence.attempts.length, 4);
  assert.ok(snapshots.some(row => row.attempts[0]?.observations?.length));
});

test("rollback mismatch exhausts the bound and remains rollback-required", async () => {
  const { evidence } = await runRollback(() => ({ metadata: "other-deployment", status: 200 }));
  assert.equal(evidence.passed, false);
  assert.equal(evidence.rollbackRequired, true);
  assert.equal(evidence.attempts.length, 12);
});

test("rollback stability regression is a hard failure", async () => {
  const { evidence } = await runRollback(attempt => ({ metadata: attempt === 1 ? "rollback-deployment" : "other-deployment", status: 200 }));
  assert.equal(evidence.classification, "FAIL");
  assert.equal(evidence.reason, "ROLLBACK_PARITY_REGRESSED");
  assert.equal(evidence.attempts.length, 2);
});

test("rollback HTTP failures and exact asset mismatches cannot pass", async () => {
  const httpFailure = await runRollback((_attempt, pathname) => ({ metadata: "rollback-deployment", status: pathname === "/app.js" ? 503 : 200 }));
  assert.equal(httpFailure.evidence.passed, false);
  assert.ok(httpFailure.evidence.attempts.every(row => row.criticalAssets.find(value => value.asset === "/app.js").observation.status === 503));
});

test("immutable access evidence retains request shape without credential values", () => {
  const secret = crypto.randomUUID();
  const sanitized = sanitizeRequest({
    method: "POST",
    url: `https://staging.example.invalid/rest/v1/rpc/get_my_access_context_v1?token=${secret}&safe=yes`,
    headers: { authorization: `Bearer ${secret}`, cookie: `session=${secret}`, "x-client-info": "qualification" },
  });
  assert.equal(JSON.stringify(sanitized).includes(secret), false);
  assert.deepEqual(sanitized.queryParameterNames, ["safe", "token"]);
  assert.deepEqual(sanitized.credentialHeaderNames, ["authorization", "cookie"]);
});

test("immutable qualification requires exact accepted route and asset bytes", async () => {
  const passing = await immutableFixture();
  assert.equal(passing.evidence.passed, true);
  assert.equal(passing.evidence.routes.length, 6);
  assert.equal(passing.evidence.criticalAssets.length, 5);
  assert.equal(passing.evidence.artifactFiles, 74);
  assert.equal(passing.evidence.publishedFiles.length, 73);
  assert.deepEqual(passing.evidence.deploymentControls.map(row => ({ path: row.path, publicUrlExpected: row.publicUrlExpected, passed: row.passed })), [{ path: "_expo/.routes.json", publicUrlExpected: false, passed: true }]);
  assert.equal(passing.requestedPaths.includes("/_expo/.routes.json"), false);
  assert.ok(passing.snapshots.some(snapshot => snapshot.routes.length > 0 && snapshot.passed === false));
  assert.equal(passing.snapshots.at(-1).passed, true);

  await assert.rejects(
    () => immutableFixture(({ artifact }) => { artifact.deploymentControls = []; }),
    /artifact evidence/i,
  );

  for (const [name, mutation] of [
    ["status", ({ state }) => { state.status = 503; }],
    ["final URL", ({ state }) => { state.finalUrl = "https://other.example.invalid/wrong"; }],
    ["byte length and hash", ({ state }) => { state.body = Buffer.from("different"); }],
    ["asset references", ({ state, assets }) => { state.body = Buffer.from(`<script src="${[...assets.keys()][0]}"></script>`); }],
    ["deployment control headers", ({ state }) => { state.omitHeaders = true; }],
  ]) {
    const result = await immutableFixture(mutation);
    assert.equal(result.evidence.passed, false, name);
  }
});

test("promotion prerequisites accept only the complete fresh bound evidence set", () => {
  const evidence = validPromotionEvidence();
  assert.equal(validatePromotionPrerequisites(evidence), true);
});

test("promotion rejects every missing, stale, failed, or mismatched immutable prerequisite", () => {
  const cases = [
    value => { value.immutable = null; },
    value => { value.immutable.passed = false; },
    value => { value.immutable.completedAt = "2026-09-25T07:00:00.000Z"; },
    value => { value.immutable.deploymentIdentifier = "other"; },
    value => { value.immutable.routes.pop(); },
    value => { value.immutable.criticalAssets[0].passed = false; },
    value => { value.immutableEvidenceSha256 = "bad"; },
    value => { value.artifact.files.pop(); },
    value => { value.artifactEntriesSha256 = evidenceHash("0"); },
    value => { value.archiveEvidenceSha256 = evidenceHash("0"); },
    value => { value.deployment.artifactManifestSha256 = evidenceHash("0"); },
  ];
  for (const mutate of cases) { const value = validPromotionEvidence(); mutate(value); assert.throws(() => validatePromotionPrerequisites(value)); }
});

test("promotion rejects every missing, stale, failed, mismatched, or incomplete access qualification", () => {
  const cases = [
    value => { value.access = null; },
    value => { value.access.passed = false; },
    value => { value.access.capturedAt = "2026-09-25T09:00:00.000Z"; },
    value => { value.access.deploymentIdentifier = "other"; },
    value => { value.access.immutableUrl = "https://other.invalid"; },
    value => { value.access.immutableEvidenceSha256 = evidenceHash("0"); },
    value => { value.access.qualificationId = "other"; },
    value => { value.access.results = value.access.results.filter(row => row.account !== "pending"); },
    value => { value.access.results.find(row => row.account === "suspended").passed = false; },
    value => { value.access.results.find(row => row.account === "owner").expectedPath = "/login"; },
    value => { value.access.results.find(row => row.account === "manager").passed = false; },
    value => { value.accessEvidenceSha256 = "bad"; },
  ];
  for (const mutate of cases) { const value = validPromotionEvidence(); mutate(value); assert.throws(() => validatePromotionPrerequisites(value)); }
});

test("promotion rejects missing, stale, incomplete, or unexpected rollback evidence", () => {
  const cases = [
    value => { value.rollback = null; },
    value => { value.rollback.passed = false; },
    value => { value.rollback.capturedAt = "2026-09-25T09:50:00.000Z"; },
    value => { value.rollback.deploymentIdentifier = "unexpected"; },
    value => { value.rollback.routes.pop(); },
    value => { value.rollback.criticalAssets = []; },
    value => { value.rollbackEvidenceSha256 = "bad"; },
    value => { value.preflight.rollback.referenceSha256 = evidenceHash("0"); },
    value => { value.preflight.rollback.parityPassed = false; },
  ];
  for (const mutate of cases) { const value = validPromotionEvidence(); mutate(value); assert.throws(() => validatePromotionPrerequisites(value)); }
});

test("promotion rejects every missing, stale, failed, or mismatched Staging preflight gate", () => {
  const cases = [
    value => { value.preflight = null; },
    value => { value.preflight.passed = false; },
    value => { value.preflight.capturedAt = "2026-09-25T09:40:00.000Z"; },
    value => { value.preflight.environment = "production"; },
    value => { value.preflight.identities.supabaseProjectRef = "wrong"; },
    value => { value.preflight.identities.firebaseProjectId = "wrong"; },
    value => { value.preflight.identities.easProjectId = "wrong"; },
    value => { value.preflight.identities.aliasId = "wrong"; },
    value => { value.preflight.source.commit = "0".repeat(40); },
    value => { value.preflight.artifact.manifestSha256 = evidenceHash("0"); },
    value => { value.preflight.migration.sha256 = evidenceHash("0"); },
    value => { value.preflight.migration.appliedExactlyOnce = false; },
    value => { value.preflight.migration.pendingCount = 1; },
    value => { value.preflight.earnings.enabled = true; },
    value => { value.preflight.protectedEvidence[0].passed = false; },
    value => { value.preflight.protectedEvidence[1].manifestSha256 = evidenceHash("0"); },
    value => { value.protectedEvidenceVerification[0].passed = false; },
    value => { value.preflight.candidate.deploymentIdentifier = "other"; },
    value => { value.preflight.candidate.accessEvidenceSha256 = evidenceHash("0"); },
  ];
  for (const mutate of cases) { const value = validPromotionEvidence(); mutate(value); assert.throws(() => validatePromotionPrerequisites(value)); }
});

test("promotion requires a fresh independently passing rollback recheck", () => {
  const value = validPromotionEvidence();
  const evidence = passingRollbackRecheck(value).evidence;
  assert.equal(validateImmediateRollbackRecheck({ evidence, rollback: value.rollback, completedEvidenceSha256: evidenceHash("a"), currentMs: value.currentMs }), true);
  for (const mutate of [
    row => { row.evidence.passed = false; },
    row => { row.evidence.completedAt = "2026-09-25T09:59:00.000Z"; },
    row => { row.evidence.expected.deploymentIdentifier = "other"; },
    row => { row.evidence.selectedAttempts.pop(); },
    row => { row.completedEvidenceSha256 = "bad"; },
  ]) {
    const row = { evidence: clone(evidence), rollback: value.rollback, completedEvidenceSha256: evidenceHash("a"), currentMs: value.currentMs }; mutate(row); assert.throws(() => validateImmediateRollbackRecheck(row));
  }
});

test("the promotion boundary performs no provider call when any mandatory gate fails", async () => {
  const mutations = [
    value => { value.artifact = null; },
    value => { value.immutable.passed = false; },
    value => { value.access.results.find(row => row.account === "pending").passed = false; },
    value => { value.rollback.routes.pop(); },
    value => { value.preflight.earnings.enabled = true; },
  ];
  for (const mutate of mutations) {
    const value = validPromotionEvidence(), directory = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-boundary-reject-")); let rechecks = 0, promotions = 0;
    mutate(value);
    try {
      await assert.rejects(executePromotionBoundary({ ...value, preflightEvidenceSha256: evidenceHash("9"), recheckRollback: async () => { rechecks += 1; return passingRollbackRecheck(value); }, runDirectory: directory, appRoot: process.cwd(), spawn: () => { promotions += 1; return { status: 0, stdout: '{"ok":true}' }; } }));
      assert.equal(rechecks, 0); assert.equal(promotions, 0);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("the promotion boundary requires the immediate rollback recheck and invokes promotion once", async () => {
  const rejected = validPromotionEvidence(), rejectedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-boundary-recheck-")); let rejectedPromotions = 0;
  try {
    await assert.rejects(executePromotionBoundary({ ...rejected, preflightEvidenceSha256: evidenceHash("9"), recheckRollback: async () => ({ ...passingRollbackRecheck(rejected), evidence: { ...passingRollbackRecheck(rejected).evidence, passed: false } }), runDirectory: rejectedDirectory, appRoot: process.cwd(), spawn: () => { rejectedPromotions += 1; return { status: 0, stdout: '{"ok":true}' }; } }));
    assert.equal(rejectedPromotions, 0);
  } finally { fs.rmSync(rejectedDirectory, { recursive: true, force: true }); }

  const accepted = validPromotionEvidence(), acceptedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-boundary-pass-")); let acceptedPromotions = 0;
  try {
    const result = await executePromotionBoundary({ ...accepted, preflightEvidenceSha256: evidenceHash("9"), recheckRollback: async () => passingRollbackRecheck(accepted), runDirectory: acceptedDirectory, appRoot: process.cwd(), spawn: () => { acceptedPromotions += 1; return { status: 0, stdout: '{"ok":true}' }; } });
    assert.equal(result.promoted.raw.ok, true); assert.equal(acceptedPromotions, 1);
    await assert.rejects(executePromotionBoundary({ ...accepted, preflightEvidenceSha256: evidenceHash("9"), recheckRollback: async () => passingRollbackRecheck(accepted), runDirectory: acceptedDirectory, appRoot: process.cwd(), spawn: () => { acceptedPromotions += 1; return { status: 0, stdout: '{"ok":true}' }; } }), /EEXIST/);
    assert.equal(acceptedPromotions, 1);
  } finally { fs.rmSync(acceptedDirectory, { recursive: true, force: true }); }
});


test("maintenance window gates mutation time and preserves authorized recovery", () => {
  const approved = authority();
  assert.throws(() => requireMaintenanceWindow(approved, "deploy", Date.parse("2026-09-25T09:59:59Z")), /outside/);
  assert.doesNotThrow(() => requireMaintenanceWindow(approved, "deploy", Date.parse("2026-09-25T11:40:00Z")));
  assert.throws(() => requireMaintenanceWindow(approved, "promote", Date.parse("2026-09-25T11:49:00Z")), /Insufficient/);
  assert.throws(() => requireMaintenanceWindow(approved, "observe-alias", Date.parse("2026-09-25T12:00:00Z")), /outside/);
  assert.equal(requireMaintenanceWindow(approved, "rollback", Date.parse("2026-09-25T12:01:00Z")).recoveryAfterDeadline, true);
});

test("deployment-derived rollback contract accepts three assets and rejects incomplete runtime", () => {
  const at = "2026-09-25T10:10:00Z", assets = Array.from({ length: 3 }, (_, i) => ({ asset: `/a${i}.js`, bytes: 1, sha256: evidenceHash(String(i + 1)) }));
  const reference = { passed: true, runId: "ruip6ad_localtest", deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment, deploymentUrl: "https://rollback.invalid", capturedAt: at, routes: Array.from({ length: 6 }, (_, i) => ({ route: `/r${i}`, bytes: 1, sha256: hash("r" + i), referencedAssets: assets.map(row => row.asset) })), criticalAssets: assets, runtimeFiles: DIAGNOSTIC_OPERATOR.runtimeFiles.map((runtimePath, i) => ({ path: runtimePath, bytes: 1, sha256: hash("p" + i) })), externalRuntime: DIAGNOSTIC_OPERATOR.externalRuntime.map((row, i) => ({ url: row.url, bytes: i ? 37024 : 31766, sha256: row.sha256 })) };
  reference.contractSha256 = rollbackContractDigest(reference);
  assert.equal(validateRollbackReference(reference, reference.runId), true);
  assert.throws(() => validateRollbackReference({ ...reference, runtimeFiles: reference.runtimeFiles.slice(1) }, reference.runId), /complete/i);
});

test("actual deployment boundary consumes one exclusive reservation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-boundary-"));
  const approved = authority();
  try {
    fs.writeFileSync(path.join(directory, "deployment-attempt.json"), JSON.stringify({ runId: approved.runId, state: "PROVIDER_COMMAND_AUTHORIZED", providerCommandInvoked: true, deploymentRetryPermitted: false }));
    fs.writeFileSync(path.join(directory, "created-resources.json"), JSON.stringify({ runId: approved.runId, state: "DEPLOYMENT_IN_PROGRESS", deploymentAttemptCount: 1 }));
    assert.equal(consumeDeploymentReservation({ runDirectory: directory, authority: approved, capturedAt: "2026-09-25T10:01:00Z" }).attempt.state, "PROVIDER_COMMAND_AUTHORIZED");
    assert.throws(() => consumeDeploymentReservation({ runDirectory: directory, authority: approved }), /invalid|consumed/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
