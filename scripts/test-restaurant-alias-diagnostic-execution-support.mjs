import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  SUPPORT,
  buildBaselinePreflight,
  buildEvidenceManifest,
  buildFinalPreflight,
  buildSourceManifest,
  createHostedReaders,
  finalizeRun,
  prepareAuthorityArtifacts,
  readProgressSnapshot,
  recordTerminalState,
  sanitizeSupportError,
  validateOwnerAuthorization,
} from "./restaurant-alias-diagnostic-execution-support.mjs";
import { DIAGNOSTIC_OPERATOR } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";

const root = path.resolve(import.meta.dirname, "..");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";
const nowMs = Date.parse("2026-09-25T12:00:00.000Z");
const capturedAt = new Date(nowMs - 10_000).toISOString();
const fakeSourceCommit = "1".repeat(40);
const fakeBlob = Buffer.from("fixture\n");
const fakeManifestBytes = Buffer.from(hash(fakeBlob) + "\t" + fakeBlob.length + "\tsupport.txt\n");
const fakeSourceManifestSha256 = hash(fakeManifestBytes);
const protectedRows = DIAGNOSTIC_OPERATOR.protectedEvidence.map(value => ({ ...value, passed: true }));

function approval(overrides = {}) {
  const authorizationText = "I authorize the one-run Staging diagnostic ruip6ad_20260925a, including independent rollback, while Earnings remains disabled and Development and Production remain prohibited.";
  return {
    contractVersion: 1,
    decision: "APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC",
    approvedForHostedExecution: true,
    environment: "staging",
    runId: SUPPORT.runId,
    proposalSha256: SUPPORT.proposalSha256,
    checkpointParent: SUPPORT.baseCheckpoint,
    sourceCommit: fakeSourceCommit,
    sourceManifestSha256: fakeSourceManifestSha256,
    applicationTree: SUPPORT.applicationTree,
    authorizedActions: [...SUPPORT.actions],
    authorizationText,
    authorizationTextSha256: hash(Buffer.from(authorizationText)),
    issuedAt: "2026-09-25T11:00:00.000Z",
    ...overrides,
  };
}

function authority() {
  return {
    contractVersion: 1,
    approvedForHostedExecution: true,
    environment: "staging",
    planSha256: DIAGNOSTIC_OPERATOR.planSha256,
    applicationTree: SUPPORT.applicationTree,
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
    easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
    supabaseProjectRef: DIAGNOSTIC_OPERATOR.supabaseProjectRef,
    firebaseProjectId: DIAGNOSTIC_OPERATOR.firebaseProjectId,
    aliasId: DIAGNOSTIC_OPERATOR.aliasId,
    aliasName: DIAGNOSTIC_OPERATOR.aliasName,
    aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
    runId: SUPPORT.runId,
    sourceCommit: fakeSourceCommit,
    sourceManifestSha256: fakeSourceManifestSha256,
    ownerAuthorizationSha256: "a".repeat(64),
  };
}

function observed(source, payload, index, status = 200, stage = "baseline-preflight") {
  const sources = { supabaseProject: "supabase-project", firebaseProject: "firebase-project", alias: "expo-alias", migrationHistory: "supabase-migrations", functionCatalog: "supabase-function-catalog", earnings: "supabase-earnings-capability" };
  return {
    runId: SUPPORT.runId,
    stage,
    source: sources[source],
    requestId: SUPPORT.runId + ":" + source + ":" + index,
    startedAt: "2026-09-25T11:59:00.000Z",
    completedAt: "2026-09-25T11:59:01.000Z",
    status,
    payloadSha256: hash(Buffer.from(canonical(payload))),
    payload,
  };
}

function reads(overrides = {}, stage = "baseline-preflight") {
  const catalog = Object.entries(SUPPORT.migrationFunctions).map(([identity, expected]) => ({
    identity,
    definition_sha256: expected.sha256,
    owner: expected.owner,
    security_definer: expected.securityDefiner,
    volatility: expected.volatility,
    config: expected.config,
    acl: expected.acl,
  }));
  const payloads = {
    supabaseProject: { id: DIAGNOSTIC_OPERATOR.supabaseProjectRef, status: "ACTIVE_HEALTHY" },
    firebaseProject: { projectId: DIAGNOSTIC_OPERATOR.firebaseProjectId },
    alias: {
      easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
      aliasId: DIAGNOSTIC_OPERATOR.aliasId,
      aliasName: DIAGNOSTIC_OPERATOR.aliasName,
      aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
      deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment,
      deploymentUrl: "https://rollback.example.invalid",
      updatedAt: "2026-09-25T11:00:00.000Z",
    },
    migrationHistory: {
      applied: ["20260924140000"],
      pending: [],
      localMigrationSha256: DIAGNOSTIC_OPERATOR.conflictMigration.sha256,
    },
    functionCatalog: { rows: catalog },
    earnings: { capability: "restaurant_earnings_v1", enabled: false },
    ...overrides,
  };
  return Object.fromEntries(Object.entries(payloads).map(([name, payload], index) => [name, observed(name, payload, index + 1, 200, stage)]));
}

function writeJson(directory, name, value) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, canonical(value));
  return { file, sha256: hash(fs.readFileSync(file)) };
}

function writeReadProgress(directory, stage, readSet, options = {}) {
  const file = path.join(directory, stage + "-reads-progress.json");
  const value = {
    schemaVersion: 2,
    runId: options.runId || SUPPORT.runId,
    stage: options.stage || stage,
    capturedAt: options.capturedAt || capturedAt,
    readsSha256: hash(Buffer.from(canonical(readSet))),
    reads: readSet,
    errors: options.errors || [],
  };
  fs.writeFileSync(file, canonical(value));
  return { file, value };
}

function hostedReaderFixture({ metadataFailure = false, preflightFailure = false, failedPath = null, missingPath = null, omitAssetReferences = false, mismatchedAsset = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-hosted-reader-"));
  const routeBodies = new Map();
  const assets = Array.from({ length: 5 }, (_, index) => ({ asset: `/assets/critical-${index}.js`, body: Buffer.from(`asset-${index}\n`) }));
  const references = assets.map(row => `<script src="${row.asset}"></script>`).join("");
  const routes = Array.from({ length: 6 }, (_, index) => {
    const route = index === 0 ? "/" : `/route-${index}`;
    const body = Buffer.from(`<html><body>route-${index}${omitAssetReferences ? "" : references}</body></html>\n`);
    routeBodies.set(route, body);
    return { route, sha256: hash(body) };
  });
  const expected = {
    deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment,
    routes,
    criticalAssets: assets.map((row, index) => ({ asset: row.asset, sha256: mismatchedAsset && index === 0 ? "0".repeat(64) : hash(row.body) })),
  };
  let milliseconds = Date.parse("2026-09-25T12:00:00.000Z");
  let aliasReads = 0;
  const persisted = [];
  const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", "cf-ray": "local-fixture" } });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href.startsWith("https://api.supabase.com/v1/projects/")) {
      if (!url.pathname.endsWith("/database/query")) return json({ id: DIAGNOSTIC_OPERATOR.supabaseProjectRef, status: "ACTIVE_HEALTHY" });
      const statement = JSON.parse(init.body || "{}").query || "";
      if (statement.includes("schema_migrations")) return json([{ version: DIAGNOSTIC_OPERATOR.conflictMigration.version }]);
      if (statement.includes("pg_proc")) return json(Object.entries(SUPPORT.migrationFunctions).map(([identity, value]) => ({ identity, definition_sha256: value.sha256, owner: value.owner, security_definer: value.securityDefiner, volatility: value.volatility, config: value.config, acl: value.acl })));
      if (statement.includes("restaurant_earnings_capabilities")) return json([{ capability: "restaurant_earnings_v1", enabled: false }]);
      throw new Error("Unexpected local SQL fixture request.");
    }
    if (url.hostname === "firebase.googleapis.com") {
      if (preflightFailure) throw new Error("synthetic preflight transport failure");
      return json({ projectId: DIAGNOSTIC_OPERATOR.firebaseProjectId });
    }
    if (url.hostname === "api.expo.dev") {
      aliasReads += 1;
      if (metadataFailure && aliasReads > 1) throw new Error("synthetic metadata transport failure");
      return json({ data: { app: { byId: { id: DIAGNOSTIC_OPERATOR.easProjectId, workerDeploymentAliases: { edges: [{ node: { id: DIAGNOSTIC_OPERATOR.aliasId, aliasName: DIAGNOSTIC_OPERATOR.aliasName, url: DIAGNOSTIC_OPERATOR.aliasUrl, updatedAt: capturedAt, workerDeployment: { id: "rollback-id", deploymentIdentifier: expected.deploymentIdentifier, url: "https://rollback.example.invalid", createdAt: capturedAt } } }] } } } } });
    }
    if (url.origin === new URL(DIAGNOSTIC_OPERATOR.aliasUrl).origin) {
      if (url.pathname === failedPath) return new Response("failure", { status: 503, headers: { "cf-ray": "local-failure" } });
      if (url.pathname === missingPath) return new Response("missing", { status: 404, headers: { "cf-ray": "local-missing" } });
      if (routeBodies.has(url.pathname)) return new Response(routeBodies.get(url.pathname), { status: 200, headers: { "cache-control": "no-store", "cf-ray": "local-route" } });
      const asset = assets.find(row => row.asset === url.pathname);
      if (asset) return new Response(asset.body, { status: 200, headers: { "cache-control": "no-store", "cf-ray": "local-asset" } });
      return new Response("missing", { status: 404 });
    }
    throw new Error("Unexpected local HTTP fixture: " + url.origin + url.pathname);
  };
  const clock = { now: () => milliseconds, sleep: async delay => { milliseconds += delay; } };
  const firebaseApp = { options: { credential: { getAccessToken: async () => ({ access_token: "synthetic-local-access" }) } }, delete: async () => {} };
  const persistEvidence = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, canonical(value));
    persisted.push({ file: path.basename(file), value: structuredClone(value) });
  };
  const readers = createHostedReaders({
    root: directory,
    runId: SUPPORT.runId,
    runDirectory: directory,
    evidencePrefix: "finalization",
    fetchImpl,
    now: clock.now,
    parityClock: clock,
    deadlineSignal: () => undefined,
    persistEvidence,
    testConfiguration: {
      registry: { projects: { staging: { ref: DIAGNOSTIC_OPERATOR.supabaseProjectRef }, development: { ref: "different-local-project" } } },
      managementToken: "synthetic-local-management",
      operator: { firebaseProjectId: DIAGNOSTIC_OPERATOR.firebaseProjectId, firebaseAdminCredentialPath: "/not-read.json" },
      firebaseCredential: { project_id: DIAGNOSTIC_OPERATOR.firebaseProjectId },
      firebaseApp,
      expoSession: "synthetic-local-session",
      migrationNames: [DIAGNOSTIC_OPERATOR.conflictMigration.version + "_restaurant_order_conflict_transport.sql"],
      localMigrationSha256: DIAGNOSTIC_OPERATOR.conflictMigration.sha256,
    },
  });
  return { directory, expected, readers, persisted };
}

function finalFixture({ rollbackCapturedAt = capturedAt } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-final-"));
  const auth = authority();
  const artifact = {
    runId: auth.runId,
    sourceCommit: auth.sourceCommit,
    sourceManifestSha256: auth.sourceManifestSha256,
    applicationTree: SUPPORT.applicationTree,
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
  };
  const deployment = { deploymentIdentifier: "new-candidate", url: "https://candidate.example.invalid" };
  const immutable = { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url };
  const immutableRecord = writeJson(directory, "immutable-smoke.json", immutable);
  const access = { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, immutableUrl: deployment.url, immutableEvidenceSha256: immutableRecord.sha256 };
  const rollback = { passed: true, capturedAt: rollbackCapturedAt, runId: auth.runId, deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment, deploymentUrl: "https://rollback.example.invalid", routes: Array.from({ length: 6 }, (_, i) => ({ route: "/route-" + i, sha256: "b".repeat(64) })), criticalAssets: [{ asset: "/old.js", sha256: "c".repeat(64) }] };
  writeJson(directory, "artifact-manifest.json", artifact);
  writeJson(directory, "immutable-deployment.json", deployment);
  writeJson(directory, "immutable-access-qualification.json", access);
  writeJson(directory, "rollback-reference.json", rollback);
  return { directory, auth, deployment, immutable, access, rollback };
}

test("source manifest exactly reproduces the audited checkpoint", () => {
  const result = buildSourceManifest(root, SUPPORT.baseCheckpoint);
  assert.equal(result.commit, SUPPORT.baseCheckpoint);
  assert.equal(result.files, 1490);
  assert.equal(result.sha256, SUPPORT.baseSourceManifestSha256);
});

test("authority preparation binds exact owner authorization and writes protected artifacts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-authority-"));
  const calls = [];
  const spawn = (program, args) => {
    calls.push([program, args]);
    assert.equal(program, "git");
    if (args[0] === "ls-tree") return { status: 0, stdout: Buffer.from("support.txt\0") };
    if (args[0] === "show") return { status: 0, stdout: fakeBlob };
    if (args[0] === "diff-tree") return { status: 0, stdout: SUPPORT.checkpointFiles.join("\n") + "\n" };
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: fakeSourceCommit + "\n" };
    if (args[0] === "rev-parse" && args[1] === fakeSourceCommit + "^") return { status: 0, stdout: SUPPORT.baseCheckpoint + "\n" };
    if (args[0] === "rev-parse" && args[1] === fakeSourceCommit + ":apps/restaurant") return { status: 0, stdout: SUPPORT.applicationTree + "\n" };
    throw new Error("Unexpected local git command: " + args.join(" "));
  };
  try {
    const result = prepareAuthorityArtifacts({ repoRoot: root, approval: approval(), outputDirectory: directory, spawn });
    assert.equal(result.sourceManifestSha256, fakeSourceManifestSha256);
    assert.equal(result.authority.ownerAuthorizationSha256, approval().authorizationTextSha256);
    assert.equal(result.authority.sourceCommit, fakeSourceCommit);
    assert.equal(fs.statSync(result.authorityPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(result.manifestPath).mode & 0o777, 0o600);
    assert.ok(calls.every(([program]) => program === "git"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("authority rejects missing, placeholder, contradictory, and unapproved input", () => {
  assert.throws(() => validateOwnerAuthorization(approval({ approvedForHostedExecution: false })), /approval/i);
  assert.throws(() => validateOwnerAuthorization(approval({ environment: "production" })), /approval|identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ authorizationText: "<OWNER AUTHORIZATION>", authorizationTextSha256: hash(Buffer.from("<OWNER AUTHORIZATION>")) })), /placeholder/i);
  assert.throws(() => validateOwnerAuthorization(approval({ authorizationTextSha256: "0".repeat(64) })), /digest/i);
  assert.throws(() => validateOwnerAuthorization(approval({ authorizedActions: ["promote"] })), /actions/i);
});

test("baseline preflight is independent from candidate evidence", () => {
  const result = buildBaselinePreflight({ authority: authority(), reads: reads(), protectedEvidence: protectedRows, capturedAt });
  assert.equal(result.stage, "baseline");
  assert.equal(result.passed, true);
  assert.equal("candidate" in result, false);
  assert.equal(result.alias.deploymentIdentifier, DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment);
});

test("every hosted assertion requires a unique independently recorded read", () => {
  const value = reads();
  value.firebaseProject.requestId = value.supabaseProject.requestId;
  assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: value, protectedEvidence: protectedRows, capturedAt }), /independent recorded read/i);
});

test("persisted hosted reads reject missing, stale, duplicated, tampered, and differently bound evidence", () => {
  const mutations = [
    value => { delete value.reads.earnings; },
    value => { value.reads.firebaseProject.requestId = value.reads.supabaseProject.requestId; },
    value => { value.reads.alias.payload.deploymentIdentifier = "tampered"; },
    value => { value.reads.alias.runId = "other-run"; },
    value => { value.reads.alias.stage = "other-stage"; },
    value => { value.reads.alias.completedAt = "2026-09-25T10:00:00.000Z"; },
  ];
  for (const mutate of mutations) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-read-integrity-"));
    try {
      const progress = writeReadProgress(directory, "baseline-preflight", reads());
      const value = JSON.parse(fs.readFileSync(progress.file));
      mutate(value);
      if (value.reads.alias?.payload?.deploymentIdentifier === "tampered") value.readsSha256 = hash(Buffer.from(canonical(value.reads)));
      fs.writeFileSync(progress.file, canonical(value));
      assert.throws(() => readProgressSnapshot(progress.file, { runId: SUPPORT.runId, stage: "baseline-preflight", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.baseline }), /read set|digest|independent|binding|stale/i);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("persisted unsuccessful hosted reads survive before collection fails", async () => {
  const fixture = hostedReaderFixture({ preflightFailure: true });
  try {
    await assert.rejects(() => fixture.readers.collect(), /synthetic preflight transport failure/);
    const progress = fixture.persisted.filter(row => row.file === "finalization-reads-progress.json");
    assert.equal(progress.length >= 2, true);
    assert.deepEqual(progress.at(-1).value.errors, ["firebase-project"]);
    assert.match(progress.at(-1).value.reads.firebaseProject.error, /synthetic preflight transport failure/);
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("wrong environment identity and migration state fail closed", () => {
  assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: reads({ supabaseProject: { id: "development", status: "ACTIVE_HEALTHY" } }), protectedEvidence: protectedRows, capturedAt }), /Supabase/);
  assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: reads({ migrationHistory: { applied: [], pending: [], localMigrationSha256: DIAGNOSTIC_OPERATOR.conflictMigration.sha256 } }), protectedEvidence: protectedRows, capturedAt }), /Migration/);
  assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: reads({ migrationHistory: { applied: ["20260924140000"], pending: ["20260925120000"], localMigrationSha256: DIAGNOSTIC_OPERATOR.conflictMigration.sha256 } }), protectedEvidence: protectedRows, capturedAt }), /Migration/);
});

test("function and ACL drift fail closed", () => {
  const value = reads();
  value.functionCatalog.payload.rows[0].acl = "{public=X/owner}";
  value.functionCatalog.payloadSha256 = hash(Buffer.from(canonical(value.functionCatalog.payload)));
  assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: value, protectedEvidence: protectedRows, capturedAt }), /Function or ACL/);
});

test("Earnings enabled fails both preflight stages", () => {
  const enabled = reads({ earnings: { capability: "restaurant_earnings_v1", enabled: true } });
  assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: enabled, protectedEvidence: protectedRows, capturedAt }), /disabled/);
  const fixture = finalFixture();
  try { assert.throws(() => buildFinalPreflight({ authority: fixture.auth, reads: reads({ earnings: { capability: "restaurant_earnings_v1", enabled: true } }, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }), /disabled/); }
  finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("final preflight emits the exact candidate-bound operator schema", () => {
  const fixture = finalFixture();
  try {
    const result = buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs });
    assert.equal(result.environment, "staging");
    assert.equal(result.candidate.deploymentIdentifier, fixture.deployment.deploymentIdentifier);
    assert.equal(result.rollback.deploymentIdentifier, DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment);
    assert.equal(result.migration.pendingCount, 0);
    assert.equal(result.earnings.enabled, false);
    assert.equal(Object.keys(result.observationEvidence).length, 6);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("final preflight rejects mismatched candidate, access, and rollback evidence", () => {
  for (const mutation of [
    directory => { const p = path.join(directory, "immutable-deployment.json"); const v = JSON.parse(fs.readFileSync(p)); v.url = "https://wrong.invalid"; fs.writeFileSync(p, canonical(v)); },
    directory => { const p = path.join(directory, "immutable-access-qualification.json"); const v = JSON.parse(fs.readFileSync(p)); v.deploymentIdentifier = "other"; fs.writeFileSync(p, canonical(v)); },
    directory => { const p = path.join(directory, "rollback-reference.json"); const v = JSON.parse(fs.readFileSync(p)); v.deploymentIdentifier = "other"; fs.writeFileSync(p, canonical(v)); },
  ]) {
    const fixture = finalFixture();
    try {
      mutation(fixture.directory);
      assert.throws(() => buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }), /mismatch|identity/i);
    } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

test("stale rollback requires recapture and a fresh replacement passes", () => {
  const fixture = finalFixture({ rollbackCapturedAt: new Date(nowMs - SUPPORT.freshnessMs.rollback - 1).toISOString() });
  try {
    assert.throws(
      () => buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }),
      error => error.code === "ROLLBACK_RECAPTURE_REQUIRED",
    );
    fixture.rollback.capturedAt = capturedAt;
    writeJson(fixture.directory, "rollback-reference.json", fixture.rollback);
    assert.equal(buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }).passed, true);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("final preflight rejects live alias drift from the rollback target", () => {
  const fixture = finalFixture();
  try {
    const drift = reads({ alias: { ...reads().alias.payload, deploymentIdentifier: "other" } }, "promotion-preflight");
    assert.throws(() => buildFinalPreflight({ authority: fixture.auth, reads: drift, protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }), /Live alias/);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("terminal recording distinguishes no assignment, uncertain assignment, and confirmed assignment", () => {
  for (const [files, expected, rollbackRequired] of [
    [[], "not-attempted", false],
    [["promotion-attempt.json"], "uncertain", true],
    [["promotion-attempt.json", "promotion-result.json"], "confirmed", true],
  ]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-"));
    try {
      for (const name of files) writeJson(directory, name, { present: true });
      const result = recordTerminalState({ runDirectory: directory, authority: authority(), classification: "ABORTED", reason: "local deterministic failure", capturedAt });
      assert.equal(result.aliasAssignment, expected);
      assert.equal(result.rollbackRequired, rollbackRequired);
      assert.equal(result.promotionRetryPermitted, false);
      if (expected === "not-attempted") assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "promotion-attempt.json"), "utf8")).providerCommandInvoked, false);
      if (rollbackRequired) assert.match(result.rollbackCommand, /:rollback:ruip6ad_20260925a/);
      assert.throws(() => recordTerminalState({ runDirectory: directory, authority: authority(), classification: "ABORTED", reason: "again", capturedAt }), /overwrite prohibited/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("rollback assignment response alone never claims restoration", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-recovery-"));
  try {
    writeJson(directory, "promotion-attempt.json", {});
    writeJson(directory, "promotion-result.json", {});
    writeJson(directory, "rollback-result.json", { passed: true });
    const pending = recordTerminalState({ runDirectory: directory, authority: authority(), classification: "FAIL", reason: "parity failed", capturedAt });
    assert.equal(pending.restorationVerified, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("real hosted-reader alias callback verifies stable metadata, six routes, and five assets", async () => {
  const fixture = hostedReaderFixture();
  try {
    const collected = await fixture.readers.collect();
    assert.equal(Object.keys(collected).length, 6);
    const result = await fixture.readers.verifyAliasParity(fixture.expected);
    assert.equal(result.passed, true, JSON.stringify(result.attempts[0], null, 2));
    assert.equal(result.deploymentIdentifier, DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment);
    assert.equal(result.selectedAttempts.length, 2);
    assert.equal(result.attempts[0].routes.length, 6);
    assert.equal(result.attempts[0].criticalAssets.length, 5);
    assert.equal(result.attempts[0].observations.some(row => row.type === "metadata" && row.requestId && row.payloadSha256 && row.startedAt && row.completedAt), true);
    const progress = fixture.persisted.filter(row => row.file === "final-alias-verification-progress.json");
    assert.equal(progress.length > 20, true);
    assert.equal(progress.some(row => row.value.attempts?.[0]?.observations?.length > 0 && row.value.attempts[0].completeParity === false), true);
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("final reconciliation executes the real hosted-reader parity integration", async () => {
  const fixture = hostedReaderFixture();
  try {
    writeSuccessfulRunEvidence(fixture.directory);
    const cleanup = { manifestScoped: true, createdResources: [{ type: "immutable-deployment", id: "new-candidate", disposition: "retained-provider-record" }], unexpectedResources: [], incomplete: [] };
    const result = await finalizeRun({ root, runDirectory: fixture.directory, authority: authority(), expectedAlias: fixture.expected, readers: fixture.readers, cleanup, capturedAt: new Date(Date.parse("2026-09-25T12:00:00.000Z") + 30_000).toISOString() });
    assert.equal(result.result, "PASS");
    assert.equal(result.finalAlias.selectedAttempts.length, 2);
    assert.equal(result.finalAlias.attempts[0].routes.length, 6);
    assert.equal(result.finalAlias.attempts[0].criticalAssets.length, 5);
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("real hosted-reader alias callback persists metadata failures without runtime exceptions", async () => {
  const fixture = hostedReaderFixture({ metadataFailure: true });
  try {
    await fixture.readers.collect();
    const result = await fixture.readers.verifyAliasParity(fixture.expected);
    assert.equal(result.passed, false);
    assert.equal(result.rollbackRequired, true);
    assert.equal(result.attempts.every(attempt => attempt.errors.some(row => row.stage === "metadata")), true);
    assert.equal(result.attempts.some(attempt => attempt.errors.some(row => /synthetic metadata transport failure/.test(row.error))), true, JSON.stringify(result.attempts[0], null, 2));
    const failedMetadata = result.attempts[0].observations.find(row => row.type === "metadata");
    assert.match(failedMetadata.requestId, /^ruip6ad_20260925a:expo-alias-final-parity:1:/);
    assert.equal(failedMetadata.status, null);
    assert.match(failedMetadata.error, /synthetic metadata transport failure/);
    assert.ok(failedMetadata.startedAt && failedMetadata.completedAt);
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("real hosted-reader alias callback rejects HTTP failures and missing critical assets", async () => {
  for (const options of [{ failedPath: "/assets/critical-0.js" }, { missingPath: "/assets/critical-1.js" }]) {
    const fixture = hostedReaderFixture(options);
    try {
      await fixture.readers.collect();
      const result = await fixture.readers.verifyAliasParity(fixture.expected);
      assert.equal(result.passed, false);
      assert.equal(result.rollbackRequired, true);
      assert.equal(result.attempts.every(attempt => attempt.criticalAssets.some(row => [404, 503].includes(row.observation.status))), true);
    } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

test("real hosted-reader alias callback rejects missing references and exact hash mismatches", async () => {
  for (const options of [{ omitAssetReferences: true }, { mismatchedAsset: true }]) {
    const fixture = hostedReaderFixture(options);
    try {
      await fixture.readers.collect();
      const result = await fixture.readers.verifyAliasParity(fixture.expected);
      assert.equal(result.passed, false);
      assert.equal(result.rollbackRequired, true);
      assert.equal(result.attempts.some(attempt => attempt.completeParity), false);
    } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});



function completeExpectedAlias() {
  return {
    deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment,
    routes: Array.from({ length: 6 }, (_, i) => ({ route: "/route-" + i, sha256: "b".repeat(64) })),
    criticalAssets: Array.from({ length: 5 }, (_, i) => ({ asset: "/old-" + i + ".js", sha256: "c".repeat(64) })),
  };
}

function writeSuccessfulRunEvidence(directory) {
  for (const name of [
    "baseline-preflight.json", "rollback-reference.json", "promotion-attempt.json",
    "artifact-manifest.json", "immutable-deployment.json", "immutable-smoke.json",
    "immutable-access-qualification.json", "promotion-preflight.json",
    "promotion-result.json", "alias-observation-result.json",
  ]) writeJson(directory, name, name === "immutable-deployment.json" ? { passed: true, name, deploymentIdentifier: "new-candidate" } : { passed: true, name });
  writeJson(directory, "created-resources.json", { schemaVersion: 1, runId: SUPPORT.runId, resources: [{ type: "immutable-deployment", id: "new-candidate" }], unexpectedResources: [] });
}

function finalReaders(aliasPassed = true) {
  return {
    collect: async () => reads({}, "finalization"),
    verifyAliasParity: async expected => ({ passed: aliasPassed, deploymentIdentifier: aliasPassed ? expected.deploymentIdentifier : "other", selectedAttempts: aliasPassed ? [{ number: 1 }, { number: 4 }] : [] }),
  };
}

test("final reconciliation passes only with exact alias, clean manifest scope, and complete evidence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-finalize-"));
  const expected = completeExpectedAlias();
  try {
    writeSuccessfulRunEvidence(directory);
    const cleanup = { manifestScoped: true, createdResources: [{ type: "immutable-deployment", id: "new-candidate", disposition: "retained-provider-record" }], unexpectedResources: [], incomplete: [] };
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: expected, readers: finalReaders(), cleanup, capturedAt });
    assert.equal(result.result, "PASS");
    assert.equal(result.evidenceFiles >= 2, true);
    assert.match(result.evidenceManifestSha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(directory, "evidence-manifest.tsv")), true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("protected evidence mismatch is persisted and cannot produce final PASS", async () => {
  const variants = [
    rows => rows.slice(1),
    rows => { rows[0].passed = false; return rows; },
    rows => { rows[0].files = 34; return rows; },
    rows => { rows[0].manifestSha256 = "0".repeat(64); return rows; },
  ];
  for (const mutate of variants) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-protected-negative-"));
    try {
      writeSuccessfulRunEvidence(directory);
      const cleanup = { manifestScoped: true, createdResources: [{ type: "immutable-deployment", id: "new-candidate", disposition: "retained-provider-record" }], unexpectedResources: [], incomplete: [] };
      const mismatched = mutate(protectedRows.map(row => ({ ...row })));
      const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: completeExpectedAlias(), readers: finalReaders(), cleanup, capturedAt, verifyProtectedEvidenceImpl: () => mismatched });
      assert.equal(result.result, "FAIL");
      assert.ok(result.blockers.includes("PROTECTED_EVIDENCE_FAILED"));
      assert.equal(result.protectedEvidence.passed, false);
      const persisted = JSON.parse(fs.readFileSync(path.join(directory, "final-reconciliation.json"), "utf8"));
      assert.equal(persisted.protectedEvidence.passed, false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("cleanup must exactly reconcile every persisted created and unexpected resource", async () => {
  const valid = { manifestScoped: true, createdResources: [{ type: "immutable-deployment", id: "new-candidate", disposition: "retained-provider-record" }], unexpectedResources: [], incomplete: [] };
  const cases = [
    { name: "empty declaration", cleanup: { ...valid, createdResources: [] } },
    { name: "additional unrecorded resource", cleanup: { ...valid, createdResources: [...valid.createdResources, { type: "database-row", id: "extra", disposition: "deleted-and-verified" }] } },
    { name: "duplicate cleanup identity", cleanup: { ...valid, createdResources: [...valid.createdResources, { ...valid.createdResources[0] }] } },
    { name: "mismatched resource id", cleanup: { ...valid, createdResources: [{ type: "immutable-deployment", id: "other", disposition: "retained-provider-record" }] } },
    { name: "incomplete disposition", cleanup: { ...valid, createdResources: [{ type: "immutable-deployment", id: "new-candidate" }] } },
    { name: "unsupported deletion claim", cleanup: { ...valid, createdResources: [{ type: "immutable-deployment", id: "new-candidate", disposition: "deleted" }] } },
    { name: "unverified supported deletion claim", cleanup: { ...valid, createdResources: [{ type: "immutable-deployment", id: "new-candidate", disposition: "deleted-and-verified" }] } },
    { name: "incomplete list", cleanup: { ...valid, incomplete: ["pending-token-cleanup"] } },
    { name: "duplicate inventory identity", inventory: { schemaVersion: 1, runId: SUPPORT.runId, resources: [{ type: "immutable-deployment", id: "new-candidate" }, { type: "immutable-deployment", id: "new-candidate" }], unexpectedResources: [] }, cleanup: valid },
    { name: "persisted unexpected resource omitted", inventory: { schemaVersion: 1, runId: SUPPORT.runId, resources: [{ type: "immutable-deployment", id: "new-candidate" }], unexpectedResources: [{ type: "database-row", id: "concurrent-unexpected" }] }, cleanup: valid },
  ];
  for (const value of cases) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-cleanup-negative-"));
    try {
      writeSuccessfulRunEvidence(directory);
      if (value.inventory) writeJson(directory, "created-resources.json", value.inventory);
      const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: completeExpectedAlias(), readers: finalReaders(), cleanup: value.cleanup, capturedAt });
      assert.notEqual(result.result, "PASS", value.name);
      assert.ok(result.blockers.includes("CLEANUP_INVENTORY_MISMATCH"), value.name);
      assert.equal(result.cleanupReconciliation.passed, false, value.name);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("final alias mismatch fails and incomplete cleanup blocks", async () => {
  for (const [reader, cleanup, expectedResult] of [
    [finalReaders(false), { manifestScoped: true, createdResources: [], unexpectedResources: [], incomplete: [] }, "FAIL"],
    [finalReaders(true), { manifestScoped: true, createdResources: [], unexpectedResources: ["unknown-row"], incomplete: [] }, "BLOCKED"],
    [finalReaders(true), { manifestScoped: false, createdResources: [], unexpectedResources: [], incomplete: ["missing-final-read"] }, "BLOCKED"],
  ]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-finalize-negative-"));
    try {
      writeSuccessfulRunEvidence(directory);
      const expected = completeExpectedAlias();
      const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: expected, readers: reader, cleanup, capturedAt });
      assert.equal(result.result, expectedResult);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("missing mandatory evidence blocks final reconciliation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-missing-"));
  try {
    writeJson(directory, "baseline-preflight.json", { passed: true });
    writeJson(directory, "rollback-reference.json", { passed: true });
    writeJson(directory, "promotion-attempt.json", { providerCommandInvoked: true });
    const cleanup = { manifestScoped: true, createdResources: [], unexpectedResources: [], incomplete: [] };
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: completeExpectedAlias(), readers: finalReaders(), cleanup, capturedAt });
    assert.equal(result.result, "BLOCKED");
    assert.ok(result.missingEvidence.includes("promotion-result.json"));
    assert.ok(result.blockers.includes("MANDATORY_EVIDENCE_MISSING"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("credential-shaped persistent evidence causes final failure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-credential-"));
  try {
    writeSuccessfulRunEvidence(directory);
    fs.writeFileSync(path.join(directory, "leak.json"), canonical({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz" }));
    const expected = completeExpectedAlias();
    const cleanup = { manifestScoped: true, createdResources: [], unexpectedResources: [], incomplete: [] };
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: expected, readers: finalReaders(), cleanup, capturedAt });
    assert.equal(result.result, "FAIL");
    assert.deepEqual(result.credentialFindings, ["leak.json"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("credential-shaped errors are sanitized before evidence persistence", () => {
  const secret = crypto.randomUUID();
  const output = sanitizeSupportError(new Error("request token=" + secret + " failed with Bearer " + secret));
  assert.equal(output.includes(secret), false);
  assert.match(output, /REDACTED/);
});

test("evidence manifest is sorted and detects later mutation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-manifest-"));
  try {
    fs.writeFileSync(path.join(directory, "z.json"), "{}\n");
    fs.writeFileSync(path.join(directory, "a.json"), "[]\n");
    const first = buildEvidenceManifest(directory);
    const rows = first.bytes.toString("utf8").trim().split("\n");
    assert.deepEqual(rows.map(row => row.split("\t")[2]), ["a.json", "z.json"]);
    fs.writeFileSync(path.join(directory, "a.json"), "[1]\n");
    assert.notEqual(buildEvidenceManifest(directory).sha256, first.sha256);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("support tooling contains no provider deployment, promotion, rollback, or retry command", () => {
  const source = fs.readFileSync(path.join(root, "scripts/restaurant-alias-diagnostic-execution-support.mjs"), "utf8");
  assert.doesNotMatch(source, /eas-cli|deploy:alias|\bnpx\b/);
  assert.doesNotMatch(source, /automatic.{0,20}(?:promotion|rollback)|retry.{0,20}promotion/i);
});
