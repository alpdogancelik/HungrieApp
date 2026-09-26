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
  buildCleanupDisposition,
  buildExpectedFinalAliasReference,
  buildSourceManifest,
  beginSingleDeploymentAttempt,
  createHostedReaders,
  createFirebaseAppLease,
  finalizeRun,
  initializeResourceInventory,
  prepareAuthorityArtifacts,
  prepareFreshRollbackRecapture,
  produceDeploymentReconciliationEvidence,
  readProgressSnapshot,
  recordTerminalState,
  recordDeploymentUncertainty,
  reconcileDeploymentObservation,
  registerSingleDeployment,
  runSupport,
  sanitizeSupportError,
  validateOwnerAuthorization,
  verifyAcceptedCheckpointLineage,
  verifyAcceptedDiagnosticExecutables,
  verifyFreshRollbackRecapture,
  verifyLocalDiagnosticPrerequisites,
  verifyReviewedCandidateCheckpoint,
} from "./restaurant-alias-diagnostic-execution-support.mjs";
import { DIAGNOSTIC_OPERATOR, rollbackContractDigest } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { verifyExactProductionExportReadiness } from "./verify-restaurant-alias-production-export-readiness.mjs";

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

test("actual diagnostic execution context resolves exact locked local dependencies", () => {
  const result = verifyLocalDiagnosticPrerequisites({ root });
  assert.equal(result.passed, true);
  assert.equal(result.firebaseAdminVersion, "13.8.0");
  assert.equal(result.firebaseFunctionsVersion, "7.2.5");
  assert.match(result.firebaseAdminApp, /functions\/node_modules\/firebase-admin\/lib\/app\/index\.js$/);
});

test("local prerequisite verification rejects a missing or mismatched lockfile installation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-prerequisites-"));
  try {
    const functionsRoot = path.join(directory, "functions"), installedRoot = path.join(functionsRoot, "node_modules/firebase-admin");
    fs.mkdirSync(installedRoot, { recursive: true });
    fs.writeFileSync(path.join(directory, "chrome"), "fixture");
    fs.writeFileSync(path.join(functionsRoot, "package.json"), canonical({ dependencies: { "firebase-admin": "^13.8.0", "firebase-functions": "^7.2.5" } }));
    fs.writeFileSync(path.join(functionsRoot, "package-lock.json"), canonical({ lockfileVersion: 3, packages: { "": { dependencies: { "firebase-admin": "^13.8.0", "firebase-functions": "^7.2.5" } }, "node_modules/firebase-admin": { version: "13.8.0" }, "node_modules/firebase-functions": { version: "7.2.5" } } }));
    fs.writeFileSync(path.join(installedRoot, "package.json"), canonical({ version: "13.7.0" }));
    assert.throws(() => verifyLocalDiagnosticPrerequisites({ root: directory, chromePath: path.join(directory, "chrome"), requireFactory: () => { throw new Error("must not resolve mismatched installation"); } }), /lockfile-defined installation/i);
    fs.rmSync(path.join(installedRoot, "package.json"));
    assert.throws(() => verifyLocalDiagnosticPrerequisites({ root: directory, chromePath: path.join(directory, "chrome") }), /missing/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("pre-authority readiness runs the exact production diagnostic export path twice", () => {
  const calls = [];
  const result = verifyExactProductionExportReadiness({
    root,
    run(command, args, options) {
      calls.push({ command, args, cwd: options.cwd });
      return { status: 0, stdout: "", stderr: "" };
    },
    outputVerifier() {
      return {
        files: Array.from({ length: 74 }, (_, index) => ({ path: String(index) })),
        artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
        archive: { sha256: DIAGNOSTIC_OPERATOR.archiveSha256, bytes: 1 },
      };
    },
  });
  assert.equal(result.passed, true);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.command, "npx");
    assert.deepEqual(call.args, ["eas-cli@16.32.0", "env:exec", "preview", "node ../../scripts/restaurant-alias-staging-public-build-inputs.mjs && npm run prepare:web && npx expo export --platform web --clear", "--non-interactive"]);
    assert.equal(call.cwd, path.join(root, "apps/restaurant"));
  }
});

test("pre-authority readiness rejects any exact-path artifact mismatch", () => {
  assert.throws(() => verifyExactProductionExportReadiness({
    root,
    run: () => ({ status: 0, stdout: "", stderr: "" }),
    outputVerifier: () => ({ files: Array.from({ length: 74 }), artifactManifestSha256: "0".repeat(64), archive: { sha256: DIAGNOSTIC_OPERATOR.archiveSha256 } }),
  }), /differs from the accepted artifact/i);
});

test("authority preparation cannot consume approval before prerequisite readiness passes", async () => {
  let calls = 0;
  await assert.rejects(
    () => runSupport(["prepare-authority", "--approval=/not-read.json", "--output=/not-written"], { prerequisiteVerifier: () => { calls += 1; throw new Error("synthetic local prerequisite failure"); } }),
    /synthetic local prerequisite failure/,
  );
  assert.equal(calls, 1);
});

test("authority preparation requires separately persisted read-only EAS export evidence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-missing-export-evidence-"));
  const approvalPath = path.join(directory, "approval.json");
  fs.writeFileSync(approvalPath, "{}\n");
  try {
    await assert.rejects(
      () => runSupport(["prepare-authority", `--approval=${approvalPath}`, `--output=${path.join(directory, "authority")}`], { prerequisiteVerifier: () => ({ passed: true }) }),
      /read-only EAS export evidence path/i,
    );
    assert.equal(fs.existsSync(path.join(directory, "authority")), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("authority preparation verifies read-only export evidence before creating authority artifacts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-export-evidence-gate-"));
  const approvalPath = path.join(directory, "approval.json"), evidencePath = path.join(directory, "export-evidence.json"), output = path.join(directory, "authority");
  fs.writeFileSync(approvalPath, canonical({ sourceCommit: fakeSourceCommit, sourceManifestSha256: fakeSourceManifestSha256 }));
  fs.writeFileSync(evidencePath, "{}\n");
  let calls = 0;
  try {
    await assert.rejects(
      () => runSupport(["prepare-authority", `--approval=${approvalPath}`, `--export-readiness-evidence=${evidencePath}`, `--output=${output}`], { prerequisiteVerifier: () => ({ passed: true }), exportEvidenceVerifier: (_value, binding) => { calls += 1; assert.equal(binding.sourceCommit, fakeSourceCommit); assert.equal(binding.sourceManifestSha256, fakeSourceManifestSha256); throw new Error("synthetic export evidence rejection"); } }),
      /synthetic export evidence rejection/,
    );
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(output), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

function approval(overrides = {}) {
  const authorizationText = `I authorize the one-run Staging diagnostic ${SUPPORT.runId}, including independent rollback, while Earnings remains disabled and Development and Production remain prohibited.`;
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
    buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256,
    authorizedActions: [...SUPPORT.actions],
    authorizedSupportActions: [...SUPPORT.supportActions],
    authorizationText,
    authorizationTextSha256: hash(Buffer.from(authorizationText)),
    issuedAt: "2026-09-25T09:55:00.000Z",
    maintenanceWindowStart: "2026-09-25T10:00:00.000Z",
    maintenanceWindowEnd: "2026-09-25T12:00:00.000Z",
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
    buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256,
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
    maintenanceWindowStart: "2026-09-25T10:00:00.000Z",
    maintenanceWindowEnd: "2026-09-25T12:00:00.000Z",
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

function reads(overrides = {}, stage = "baseline-preflight", statuses = {}) {
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
  return Object.fromEntries(Object.entries(payloads).map(([name, payload], index) => [name, observed(name, payload, index + 1, statuses[name] ?? 200, stage)]));
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

function hostedReaderFixture({ metadataFailure = false, preflightFailure = false, failedPath = null, missingPath = null, omitAssetReferences = false, mismatchedAsset = false, sqlStatus = 200, malformedSql = null, evidencePrefix = "finalization", directoryOverride = null } = {}) {
  const directory = directoryOverride || fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-hosted-reader-"));
  const routeBodies = new Map();
  const assets = Array.from({ length: 3 }, (_, index) => ({ asset: `/assets/critical-${index}.js`, body: Buffer.from(`asset-${index}\n`) }));
  const references = assets.map(row => `<script src="${row.asset}"></script>`).join("");
  const routes = Array.from({ length: 6 }, (_, index) => {
    const route = index === 0 ? "/" : `/route-${index}`;
    const body = Buffer.from(`<html><body>route-${index}${omitAssetReferences ? "" : references}</body></html>\n`);
    routeBodies.set(route, body);
    return { route, bytes: body.length, sha256: hash(body), referencedAssets: assets.map(row => row.asset) };
  });
  const expected = {
    deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment,
    routes,
    criticalAssets: assets.map((row, index) => ({ asset: row.asset, bytes: row.body.length, sha256: mismatchedAsset && index === 0 ? "0".repeat(64) : hash(row.body) })),
    runtimeFiles: DIAGNOSTIC_OPERATOR.runtimeFiles.map((runtimePath, index) => { const body = Buffer.from(`runtime-${index}`); return { path: runtimePath, bytes: body.length, sha256: hash(body) }; }),
    externalRuntime: DIAGNOSTIC_OPERATOR.externalRuntime.map((row, index) => ({ url: row.url, bytes: index ? 37024 : 31766, sha256: row.sha256 })),
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
      if (statement.includes("schema_migrations")) return json(malformedSql === "migration" ? {} : [{ version: DIAGNOSTIC_OPERATOR.conflictMigration.version }], sqlStatus);
      if (statement.includes("pg_proc")) return json(malformedSql === "catalog" ? null : Object.entries(SUPPORT.migrationFunctions).map(([identity, value]) => ({ identity, definition_sha256: value.sha256, owner: value.owner, security_definer: value.securityDefiner, volatility: value.volatility, config: value.config, acl: value.acl })), sqlStatus);
      if (statement.includes("restaurant_earnings_capabilities")) return json(malformedSql === "earnings" ? {} : [{ capability: "restaurant_earnings_v1", enabled: false }], sqlStatus);
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
      const runtime = expected.runtimeFiles.find(row => row.path === url.pathname);
      if (runtime) return new Response(Buffer.from(`runtime-${expected.runtimeFiles.indexOf(runtime)}`), { status: 200, headers: { "cache-control": "no-store", "cf-ray": "local-runtime" } });
      return new Response("missing", { status: 404 });
    }
    if (url.origin === "https://www.gstatic.com") { const file = url.pathname.includes("messaging") ? "firebase-messaging-compat.js" : "firebase-app-compat.js"; return new Response(fs.readFileSync(path.join(root, "node_modules/firebase", file)), { status: 200 }); }
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
    evidencePrefix,
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

function rollbackEvidence(at, suffix = "fresh") {
  const criticalAssets = Array.from({ length: 3 }, (_, i) => { const body = Buffer.from(`${suffix}-asset-${i}`); return { asset: `/assets/${suffix}-${i}.js`, bytes: body.length, sha256: hash(body) }; });
  const routes = Array.from({ length: 6 }, (_, i) => { const body = Buffer.from(`${suffix}-route-${i}`); return { route: "/route-" + i, bytes: body.length, sha256: hash(body), referencedAssets: criticalAssets.map(row => row.asset) }; });
  const runtimeFiles = DIAGNOSTIC_OPERATOR.runtimeFiles.map((runtimePath, i) => { const body = Buffer.from(`${suffix}-runtime-${i}`); return { path: runtimePath, bytes: body.length, sha256: hash(body) }; });
  const externalRuntime = DIAGNOSTIC_OPERATOR.externalRuntime.map((row, i) => ({ url: row.url, bytes: i ? 37024 : 31766, sha256: row.sha256 }));
  const reference = { passed: true, capturedAt: at, runId: SUPPORT.runId, deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment, deploymentUrl: "https://rollback.example.invalid", routes, criticalAssets, runtimeFiles, externalRuntime };
  reference.contractSha256 = rollbackContractDigest(reference);
  const progress = { schemaVersion: 2, runId: SUPPORT.runId, capturedAt: at, metadata: { deploymentIdentifier: reference.deploymentIdentifier, deploymentUrl: reference.deploymentUrl }, observations: [], routes: routes.map(row => ({ ...row, parity: true })), criticalAssets: criticalAssets.map(row => ({ ...row, parity: true })), runtimeFiles: runtimeFiles.map(row => ({ ...row, parity: true })), externalRuntime: externalRuntime.map(row => ({ ...row, passed: true })), passed: true, completedAt: at };
  return { reference, progress };
}

function installVerifiedFreshRecapture(directory, auth, freshAt = capturedAt, referenceOverride = null) {
  const historicalAt = new Date(Date.parse(freshAt) - 60_000).toISOString();
  const historical = rollbackEvidence(historicalAt, "historical");
  writeJson(directory, "rollback-reference.json", historical.reference);
  writeJson(directory, "rollback-capture-progress.json", historical.progress);
  writeJson(directory, "rollback-capture-initial-attempt.json", { schemaVersion: 1, runId: auth.runId, phase: "initial", state: "COMPLETE", contractSha256: historical.reference.contractSha256 });
  prepareFreshRollbackRecapture({ runDirectory: directory, authority: auth, capturedAt: new Date(Date.parse(historicalAt) + 1_000).toISOString() });
  let fresh = rollbackEvidence(freshAt, "fresh");
  if (referenceOverride) {
    fresh.reference = { ...fresh.reference, ...referenceOverride };
    fresh.reference.contractSha256 = rollbackContractDigest(fresh.reference);
    fresh.progress = { ...fresh.progress, metadata: { deploymentIdentifier: fresh.reference.deploymentIdentifier, deploymentUrl: fresh.reference.deploymentUrl }, routes: fresh.reference.routes.map(row => ({ ...row, parity: true })), criticalAssets: fresh.reference.criticalAssets.map(row => ({ ...row, parity: true })), runtimeFiles: fresh.reference.runtimeFiles.map(row => ({ ...row, parity: true })), externalRuntime: fresh.reference.externalRuntime.map(row => ({ ...row, passed: true })) };
  }
  writeJson(directory, "rollback-reference.json", fresh.reference);
  writeJson(directory, "rollback-capture-progress.json", fresh.progress);
  writeJson(directory, "rollback-capture-fresh-attempt.json", { schemaVersion: 1, runId: auth.runId, phase: "fresh", state: "COMPLETE", contractSha256: fresh.reference.contractSha256 });
  const verification = verifyFreshRollbackRecapture({ runDirectory: directory, authority: auth, capturedAt: freshAt, currentMs: Date.parse(freshAt) + 1_000 });
  return { ...fresh, verification };
}

function installInitialRollback(directory, auth, at = capturedAt, suffix = "initial") {
  const rollback = rollbackEvidence(at, suffix);
  writeJson(directory, "rollback-reference.json", rollback.reference);
  writeJson(directory, "rollback-capture-progress.json", rollback.progress);
  writeJson(directory, "rollback-capture-initial-attempt.json", { schemaVersion: 1, runId: auth.runId, phase: "initial", state: "COMPLETE", contractSha256: rollback.reference.contractSha256 });
  return rollback;
}

function installRegisteredDeployment(directory, auth, deployment) {
  initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:00:00.000Z" });
  beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:01:00.000Z" });
  writeJson(directory, "immutable-deployment.json", deployment);
  registerSingleDeployment({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:02:00.000Z" });
}

function finalFixture({ rollbackCapturedAt = capturedAt } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-final-"));
  const auth = authority();
  const artifact = {
    runId: auth.runId,
    sourceCommit: auth.sourceCommit,
    sourceManifestSha256: auth.sourceManifestSha256,
    applicationTree: SUPPORT.applicationTree,
    buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256,
    buildInputs: Array.from({ length: 9 }, (_, index) => ({ name: `EXPO_PUBLIC_FIXTURE_${index}`, passed: true })),
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
  };
  const deployment = { capturedAt, deploymentIdentifier: "new-candidate", url: "https://candidate.example.invalid", sourceCommit: auth.sourceCommit, sourceManifestSha256: auth.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, aliasAssigned: false };
  const immutable = { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url };
  const immutableRecord = writeJson(directory, "immutable-smoke.json", immutable);
  const access = { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, immutableUrl: deployment.url, immutableEvidenceSha256: immutableRecord.sha256 };
  writeJson(directory, "artifact-manifest.json", artifact);
  installRegisteredDeployment(directory, auth, deployment);
  writeJson(directory, "immutable-access-qualification.json", access);
  const rollback = installVerifiedFreshRecapture(directory, auth, rollbackCapturedAt).reference;
  return { directory, auth, deployment, immutable, access, rollback };
}

test("source manifest exactly reproduces the audited checkpoint", () => {
  const result = buildSourceManifest(root, SUPPORT.baseCheckpoint);
  assert.equal(result.commit, SUPPORT.baseCheckpoint);
  assert.equal(result.files, SUPPORT.baseSourceManifestFiles);
  assert.equal(result.sha256, SUPPORT.baseSourceManifestSha256);
});

test("accepted checkpoint lineage reproduces exact parents, inventories, hashes, manifests, and Restaurant trees", () => {
  const result = verifyAcceptedCheckpointLineage({ repoRoot: root });
  assert.equal(result.passed, true);
  assert.deepEqual(result.checkpoints, SUPPORT.acceptedLineage.map(value => value.commit));
});

test("accepted checkpoint lineage rejects every parent, inventory, file, manifest, and Restaurant-tree bypass", () => {
  const manifestBuilder = (_root, commit) => {
    const expected = SUPPORT.acceptedLineage.find(value => value.commit === commit);
    return { commit, files: expected.sourceManifestFiles, sha256: expected.sourceManifestSha256 };
  };
  const delegated = (mutation) => (program, args, options) => {
    assert.equal(program, "git");
    const altered = mutation(args);
    if (altered) return altered;
    return spawnSync(program, args, options);
  };
  const latest = SUPPORT.acceptedLineage.at(-1);
  assert.throws(() => verifyAcceptedCheckpointLineage({
    repoRoot: root,
    manifestBuilder,
    spawn: delegated(args => args[0] === "rev-parse" && args[1] === latest.commit + "^" ? { status: 0, stdout: "0".repeat(40) + "\n" } : null),
  }), /parent mismatch/i);
  assert.throws(() => verifyAcceptedCheckpointLineage({
    repoRoot: root,
    manifestBuilder,
    spawn: delegated(args => args[0] === "diff-tree" && args.at(-1) === latest.commit ? { status: 0, stdout: "unexpected-file\n" } : null),
  }), /inventory mismatch/i);
  const firstFile = Object.keys(latest.files)[0];
  assert.throws(() => verifyAcceptedCheckpointLineage({
    repoRoot: root,
    manifestBuilder,
    spawn: delegated(args => args[0] === "show" && args[1] === latest.commit + ":" + firstFile ? { status: 0, stdout: Buffer.from("altered\n") } : null),
  }), /file hash mismatch/i);
  assert.throws(() => verifyAcceptedCheckpointLineage({
    repoRoot: root,
    manifestBuilder: (_root, commit) => ({ commit, files: SUPPORT.acceptedLineage.find(value => value.commit === commit).sourceManifestFiles, sha256: commit === latest.commit ? "0".repeat(64) : SUPPORT.acceptedLineage.find(value => value.commit === commit).sourceManifestSha256 }),
  }), /source manifest mismatch/i);
  assert.throws(() => verifyAcceptedCheckpointLineage({
    repoRoot: root,
    manifestBuilder,
    spawn: delegated(args => args[0] === "rev-parse" && args[1] === latest.commit + ":apps/restaurant" ? { status: 0, stdout: "0".repeat(40) + "\n" } : null),
  }), /Restaurant tree mismatch/i);
});

test("future compatibility checkpoint must retain diagnostic executables and reviewed proposal", () => {
  const sourceCommit = fakeSourceCommit;
  const source = (program, args) => {
    assert.equal(program, "git");
    if (args[0] !== "show" || !args[1].startsWith(sourceCommit + ":")) throw new Error("Unexpected command");
    return { status: 0, stdout: fs.readFileSync(path.join(root, args[1].slice(sourceCommit.length + 1))) };
  };
  assert.equal(verifyAcceptedDiagnosticExecutables({ repoRoot: root, commit: sourceCommit, spawn: source }).passed, true);
  for (const relative of [...Object.keys(SUPPORT.diagnosticExecutableFiles), SUPPORT.proposalPath]) {
    assert.throws(() => verifyAcceptedDiagnosticExecutables({
      repoRoot: root,
      commit: sourceCommit,
      spawn: (program, args) => args[1] === sourceCommit + ":" + relative ? { status: 0, stdout: Buffer.from("altered\n") } : source(program, args),
    }), /executable changed|proposal hash mismatch/i, relative);
  }
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
    const result = prepareAuthorityArtifacts({ repoRoot: root, approval: approval(), outputDirectory: directory, spawn, lineageVerifier: () => ({ passed: true }), executableVerifier: () => ({ passed: true }) });
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
  assert.throws(() => validateOwnerAuthorization(approval({ environment: "development" })), /approval|identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ environment: "production" })), /approval|identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ authorizationText: "<OWNER AUTHORIZATION>", authorizationTextSha256: hash(Buffer.from("<OWNER AUTHORIZATION>")) })), /placeholder/i);
  assert.throws(() => validateOwnerAuthorization(approval({ authorizationTextSha256: "0".repeat(64) })), /digest/i);
  assert.throws(() => validateOwnerAuthorization(approval({ authorizedActions: ["promote"] })), /actions/i);
  assert.throws(() => validateOwnerAuthorization(approval({ checkpointParent: SUPPORT.acceptedLineage[1].commit })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ proposalSha256: "0".repeat(64) })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260925a" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260925b" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260925c" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260925d" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260925e" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260926f" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260926g" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260926h" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260926i" })), /identity/i);
  assert.throws(() => validateOwnerAuthorization(approval({ runId: "ruip6ad_20260926j" })), /identity/i);
});

test("new run owns isolated authority and evidence identities", () => {
  assert.equal(SUPPORT.runId, "ruip6ad_20260926k");
  assert.equal(SUPPORT.evidenceDirectory, "secure/restaurant-alias-diagnostic/ruip6ad_20260926k");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260925a");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260925b");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260925c");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260925d");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260925e");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260926f");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260926g");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260926h");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260926i");
  assert.notEqual(SUPPORT.runId, "ruip6ad_20260926j");
  for (const suffix of ["20260925a", "20260925b", "20260925c", "20260925d", "20260925e", "20260926f", "20260926g", "20260926h", "20260926i", "20260926j"]) assert.ok(!SUPPORT.evidenceDirectory.includes(suffix));
});

test("new-run checkpoint contract passes only the exact reviewed synthetic child", () => {
  const spawn = (program, args) => {
    assert.equal(program, "git");
    if (args[0] === "ls-tree") return { status: 0, stdout: Buffer.from("support.txt\0") };
    if (args[0] === "show") return { status: 0, stdout: fakeBlob };
    if (args[0] === "diff-tree") return { status: 0, stdout: SUPPORT.checkpointFiles.join("\n") + "\n" };
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: fakeSourceCommit + "\n" };
    if (args[0] === "rev-parse" && args[1] === fakeSourceCommit + "^") return { status: 0, stdout: SUPPORT.baseCheckpoint + "\n" };
    if (args[0] === "rev-parse" && args[1] === fakeSourceCommit + ":apps/restaurant") return { status: 0, stdout: SUPPORT.applicationTree + "\n" };
    throw new Error("Unexpected local git command: " + args.join(" "));
  };
  const result = verifyReviewedCandidateCheckpoint({ repoRoot: root, approval: approval(), spawn, lineageVerifier: () => ({ passed: true }), executableVerifier: () => ({ passed: true }) });
  assert.equal(result.passed, true);
  assert.equal(result.commit, fakeSourceCommit);
  assert.deepEqual(result.inventory, [...SUPPORT.checkpointFiles].sort());
});

test("authority preparation rejects an unreviewed future parent, inventory, source manifest, Restaurant tree, executable, or lineage", () => {
  function attempt({ parent = SUPPORT.baseCheckpoint, inventory = SUPPORT.checkpointFiles, applicationTree = SUPPORT.applicationTree, approvedManifest = fakeSourceManifestSha256, lineageVerifier = () => ({ passed: true }), executableVerifier = () => ({ passed: true }) } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-authority-negative-"));
    const spawn = (program, args) => {
      assert.equal(program, "git");
      if (args[0] === "ls-tree") return { status: 0, stdout: Buffer.from("support.txt\0") };
      if (args[0] === "show") return { status: 0, stdout: fakeBlob };
      if (args[0] === "diff-tree") return { status: 0, stdout: inventory.join("\n") + "\n" };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: fakeSourceCommit + "\n" };
      if (args[0] === "rev-parse" && args[1] === fakeSourceCommit + "^") return { status: 0, stdout: parent + "\n" };
      if (args[0] === "rev-parse" && args[1] === fakeSourceCommit + ":apps/restaurant") return { status: 0, stdout: applicationTree + "\n" };
      throw new Error("Unexpected local git command: " + args.join(" "));
    };
    try {
      return () => prepareAuthorityArtifacts({ repoRoot: root, approval: approval({ sourceManifestSha256: approvedManifest }), outputDirectory: directory, spawn, lineageVerifier, executableVerifier });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  assert.throws(attempt({ parent: SUPPORT.acceptedLineage[1].commit }), /direct child/i);
  assert.throws(attempt({ inventory: [...SUPPORT.checkpointFiles, "unexpected"] }), /inventory/i);
  assert.throws(attempt({ approvedManifest: "0".repeat(64) }), /manifest/i);
  assert.throws(attempt({ applicationTree: "0".repeat(40) }), /Restaurant (?:application )?tree/i);
  assert.throws(attempt({ executableVerifier: () => { throw new Error("Accepted diagnostic executable changed"); } }), /executable changed/i);
  assert.throws(attempt({ lineageVerifier: () => { throw new Error("Accepted checkpoint lineage changed"); } }), /lineage changed/i);
});

test("baseline preflight is independent from candidate evidence", () => {
  const result = buildBaselinePreflight({ authority: authority(), reads: reads(), protectedEvidence: protectedRows, capturedAt });
  assert.equal(result.stage, "baseline");
  assert.equal(result.passed, true);
  assert.equal("candidate" in result, false);
  assert.equal(result.alias.deploymentIdentifier, DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment);
});

test("baseline preflight accepts documented HTTP 200 and endpoint-scoped SQL 201 responses", () => {
  const statuses = { migrationHistory: 201, functionCatalog: 201, earnings: 201 };
  const result = buildBaselinePreflight({ authority: authority(), reads: reads({}, "baseline-preflight", statuses), protectedEvidence: protectedRows, capturedAt });
  assert.equal(result.passed, true);
  assert.equal(result.observations.migrationHistory.status, 201);
  assert.equal(result.observations.functionCatalog.status, 201);
  assert.equal(result.observations.earnings.status, 201);
});

test("HTTP 201 remains rejected for every non-SQL hosted observation", () => {
  for (const name of ["supabaseProject", "firebaseProject", "alias"]) {
    assert.throws(
      () => buildBaselinePreflight({ authority: authority(), reads: reads({}, "baseline-preflight", { [name]: 201 }), protectedEvidence: protectedRows, capturedAt }),
      /incomplete or unverified/,
    );
  }
});

test("SQL responses reject malformed 201 bodies and unexpected status codes", () => {
  const malformed = [
    { migrationHistory: { applied: null, pending: [], localMigrationSha256: DIAGNOSTIC_OPERATOR.conflictMigration.sha256 } },
    { functionCatalog: { rows: [] } },
    { earnings: { capability: "restaurant_earnings_v1" } },
  ];
  for (const payload of malformed) {
    assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: reads(payload, "baseline-preflight", { migrationHistory: 201, functionCatalog: 201, earnings: 201 }), protectedEvidence: protectedRows, capturedAt }));
  }
  for (const status of [199, 202, 204, 400, 500]) {
    assert.throws(() => buildBaselinePreflight({ authority: authority(), reads: reads({}, "baseline-preflight", { migrationHistory: status }), protectedEvidence: protectedRows, capturedAt }), /incomplete or unverified/);
  }
});

test("complete hosted baseline sequence accepts valid SQL 201 and persists exact observations", async () => {
  const fixture = hostedReaderFixture({ sqlStatus: 201, evidencePrefix: "baseline-preflight" });
  try {
    const collected = await fixture.readers.collect();
    const result = buildBaselinePreflight({ authority: authority(), reads: collected, protectedEvidence: protectedRows, capturedAt: collected.migrationHistory.completedAt });
    assert.equal(result.passed, true);
    assert.deepEqual([collected.migrationHistory.status, collected.functionCatalog.status, collected.earnings.status], [201, 201, 201]);
    assert.equal(fixture.persisted.at(-1).value.readsSha256, hash(Buffer.from(canonical(collected))));
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("hosted SQL 201 collection rejects malformed result arrays after persisting failure", async () => {
  for (const malformedSql of ["migration", "catalog", "earnings"]) {
    const fixture = hostedReaderFixture({ sqlStatus: 201, malformedSql, evidencePrefix: "baseline-preflight" });
    try {
      await assert.rejects(() => fixture.readers.collect(), /invalid Supabase SQL response/);
      const progress = fixture.persisted.at(-1).value;
      assert.equal(progress.errors.length, 1);
      assert.equal(Object.values(progress.reads).some(row => row.status === null && /invalid Supabase SQL response/.test(row.error)), true);
    } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

test("hosted SQL collection rejects unexpected status even with a valid-looking array", async () => {
  const fixture = hostedReaderFixture({ sqlStatus: 202, evidencePrefix: "baseline-preflight" });
  try {
    await assert.rejects(() => fixture.readers.collect(), /invalid Supabase SQL response/);
    assert.equal(fixture.persisted.at(-1).value.errors[0], "supabase-migrations");
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
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
      assert.throws(() => buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }), /mismatch|identity|contract/i);
    } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

test("stale verified rollback cannot be refreshed by rewriting only the canonical reference", () => {
  const fixture = finalFixture({ rollbackCapturedAt: new Date(nowMs - SUPPORT.freshnessMs.rollback - 1).toISOString() });
  try {
    assert.throws(
      () => buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }),
      /stale/i,
    );
    fixture.rollback.capturedAt = capturedAt;
    writeJson(fixture.directory, "rollback-reference.json", fixture.rollback);
    assert.throws(() => buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }), /changed|progress/i);
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
  for (const [records, expected, rollbackRequired] of [
    [{}, "not-attempted", false],
    [{ "promotion-attempt.json": { providerCommandInvoked: false, blockedAt: capturedAt } }, "not-attempted", false],
    [{ "promotion-attempt.json": { providerCommandInvoked: true, attemptedAt: capturedAt, deploymentIdentifier: "candidate" } }, "uncertain", true],
    [{ "promotion-attempt.json": { attemptedAt: capturedAt, deploymentIdentifier: "candidate" }, "promotion-result.json": { passed: true } }, "confirmed", true],
  ]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-"));
    try {
      for (const [name, value] of Object.entries(records)) writeJson(directory, name, value);
      const result = recordTerminalState({ runDirectory: directory, authority: authority(), classification: "ABORTED", reason: "local deterministic failure", capturedAt });
      assert.equal(result.aliasAssignment, expected);
      assert.equal(result.rollbackRequired, rollbackRequired);
      assert.equal(result.promotionRetryPermitted, false);
      if (expected === "not-attempted") assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "promotion-attempt.json"), "utf8")).providerCommandInvoked, false);
      if (rollbackRequired) assert.match(result.rollbackCommand, new RegExp(`:rollback:${SUPPORT.runId}`));
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

test("real hosted-reader alias callback verifies stable metadata, six routes, and deployment-derived assets", async () => {
  const fixture = hostedReaderFixture();
  try {
    const collected = await fixture.readers.collect();
    assert.equal(Object.keys(collected).length, 6);
    const result = await fixture.readers.verifyAliasParity(fixture.expected);
    assert.equal(result.passed, true, JSON.stringify(result.attempts[0], null, 2));
    assert.equal(result.deploymentIdentifier, DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment);
    assert.equal(result.selectedAttempts.length, 2);
    assert.equal(result.attempts[0].routes.length, 6);
    assert.equal(result.attempts[0].criticalAssets.length, 3);
    assert.equal(result.attempts[0].observations.some(row => row.type === "metadata" && row.requestId && row.payloadSha256 && row.startedAt && row.completedAt), true);
    const progress = fixture.persisted.filter(row => row.file === "final-alias-verification-progress.json");
    assert.equal(progress.length > 20, true);
    assert.equal(progress.some(row => row.value.attempts?.[0]?.observations?.length > 0 && row.value.attempts[0].completeParity === false), true);
  } finally { await fixture.readers.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("final reconciliation executes the real hosted-reader parity integration", async () => {
  const fixture = hostedReaderFixture();
  try {
    const evidence = writeSuccessfulRunEvidence(fixture.directory, fixture.expected);
    const result = await finalizeRun({ root, runDirectory: fixture.directory, authority: authority(), expectedAlias: evidence.expected, readers: fixture.readers, cleanup: evidence.cleanup, capturedAt: new Date(Date.parse("2026-09-25T12:00:00.000Z") + 30_000).toISOString() });
    assert.equal(result.result, "PASS");
    assert.equal(result.finalAlias.selectedAttempts.length, 2);
    assert.equal(result.finalAlias.attempts[0].routes.length, 6);
    assert.equal(result.finalAlias.attempts[0].criticalAssets.length, 3);
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
    assert.match(failedMetadata.requestId, new RegExp(`^${SUPPORT.runId}:expo-alias-final-parity:1:`));
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



function writeSuccessfulRunEvidence(directory, expectedOverride = null) {
  const auth = authority();
  writeJson(directory, "baseline-preflight.json", { passed: true, runId: SUPPORT.runId });
  writeJson(directory, "artifact-manifest.json", { passed: true, runId: SUPPORT.runId });
  const deployment = { capturedAt, deploymentIdentifier: "new-candidate", url: "https://candidate.example.invalid", sourceCommit: auth.sourceCommit, sourceManifestSha256: auth.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, aliasAssigned: false };
  installRegisteredDeployment(directory, auth, deployment);
  writeJson(directory, "immutable-smoke.json", { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url });
  writeJson(directory, "immutable-access-qualification.json", { passed: true, deploymentIdentifier: deployment.deploymentIdentifier });
  writeJson(directory, "promotion-preflight.json", { passed: true, runId: SUPPORT.runId });
  writeJson(directory, "promotion-attempt.json", { attemptedAt: capturedAt, deploymentIdentifier: deployment.deploymentIdentifier });
  writeJson(directory, "promotion-result.json", { passed: true, deploymentIdentifier: deployment.deploymentIdentifier });
  writeJson(directory, "alias-observation-result.json", { passed: true, classification: "PASS" });
  writeJson(directory, "alias-full-artifact-result.json", { passed: true, publishedFiles: Array.from({ length: 74 }, () => ({ passed: true })) });
  writeJson(directory, "rollback-attempt.json", { attemptedAt: capturedAt, deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment });
  writeJson(directory, "rollback-result.json", { completedAt: capturedAt, deploymentIdentifier: DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment });
  const fresh = installVerifiedFreshRecapture(directory, auth, capturedAt, expectedOverride);
  writeJson(directory, "rollback-verification-result.json", { passed: true, classification: "PASS", expected: { deploymentIdentifier: fresh.reference.deploymentIdentifier, routes: fresh.reference.routes, criticalAssets: fresh.reference.criticalAssets, runtimeFiles: fresh.reference.runtimeFiles, externalRuntime: fresh.reference.externalRuntime }, selectedAttempts: [{ number: 1 }, { number: 4 }] });
  const expected = buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt });
  const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
  return { expected, cleanup };
}

function finalReaders(aliasPassed = true) {
  return {
    collect: async () => reads({}, "finalization"),
    verifyAliasParity: async expected => ({ passed: aliasPassed, deploymentIdentifier: aliasPassed ? expected.deploymentIdentifier : "other", selectedAttempts: aliasPassed ? [{ number: 1 }, { number: 4 }] : [] }),
  };
}

test("final reconciliation passes only with exact alias, clean manifest scope, and complete evidence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-finalize-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt });
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
      const evidence = writeSuccessfulRunEvidence(directory);
      const mismatched = mutate(protectedRows.map(row => ({ ...row })));
      const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt, verifyProtectedEvidenceImpl: () => mismatched });
      assert.equal(result.result, "FAIL");
      assert.ok(result.blockers.includes("PROTECTED_EVIDENCE_FAILED"));
      assert.equal(result.protectedEvidence.passed, false);
      const persisted = JSON.parse(fs.readFileSync(path.join(directory, "final-reconciliation.json"), "utf8"));
      assert.equal(persisted.protectedEvidence.passed, false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("cleanup must exactly reconcile every persisted created and unexpected resource", async () => {
  const mutations = [
    value => { value.createdResources = []; },
    value => { value.createdResources.push({ type: "database-row", id: "extra", disposition: "deleted-and-verified" }); },
    value => { value.createdResources.push({ ...value.createdResources[0] }); },
    value => { value.createdResources[0].id = "other"; },
    value => { delete value.createdResources[0].disposition; },
    value => { value.createdResources[0].disposition = "deleted"; },
    value => { value.createdResources[0].disposition = "deleted-and-verified"; },
    value => { value.incomplete = ["pending-token-cleanup"]; value.passed = false; },
  ];
  for (const mutate of mutations) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-cleanup-negative-"));
    try {
      const evidence = writeSuccessfulRunEvidence(directory);
      const cleanup = structuredClone(evidence.cleanup); mutate(cleanup);
      writeJson(directory, "cleanup-disposition.json", cleanup);
      const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup, capturedAt });
      assert.notEqual(result.result, "PASS");
      assert.ok(result.blockers.includes("CLEANUP_INVENTORY_MISMATCH"));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("final alias mismatch fails", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-finalize-negative-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(false), cleanup: evidence.cleanup, capturedAt });
    assert.equal(result.result, "FAIL");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("missing mandatory evidence blocks final reconciliation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-missing-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    fs.rmSync(path.join(directory, "promotion-result.json"));
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt });
    assert.equal(result.result, "BLOCKED");
    assert.ok(result.missingEvidence.includes("promotion-result.json"));
    assert.ok(result.blockers.includes("MANDATORY_EVIDENCE_MISSING"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("fresh recapture durable states fail closed at every interruption boundary", () => {
  for (const interruptAt of ["after-initiation", "after-preservation", "before-reference-movement", "after-reference-movement", "after-progress-movement", "before-capture"]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-recapture-interrupt-"));
    try {
      const prior = rollbackEvidence("2026-09-25T11:40:00.000Z", "prior");
      writeJson(directory, "rollback-reference.json", prior.reference);
      writeJson(directory, "rollback-capture-progress.json", prior.progress);
      assert.throws(() => prepareFreshRollbackRecapture({ runDirectory: directory, authority: authority(), capturedAt: "2026-09-25T11:50:00.000Z", interruptAt }), /Synthetic interruption/);
      assert.equal(fs.existsSync(path.join(directory, "fresh-recapture-verification.json")), false);
      assert.throws(() => verifyFreshRollbackRecapture({ runDirectory: directory, authority: authority(), capturedAt, currentMs: nowMs }), /not ready|missing/i);
      assert.throws(() => prepareFreshRollbackRecapture({ runDirectory: directory, authority: authority(), capturedAt }), /exist|already/i);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test("final preflight requires verified fresh recapture and rejects altered evidence", () => {
  for (const mutate of [
    directory => fs.rmSync(path.join(directory, "fresh-recapture-attempt.json")),
    directory => fs.rmSync(path.join(directory, "fresh-recapture-verification.json")),
    directory => { const file = path.join(directory, "fresh-recapture-attempt.json"); const value = JSON.parse(fs.readFileSync(file)); value.state = "READY_FOR_RECAPTURE"; fs.writeFileSync(file, canonical(value)); },
    directory => fs.appendFileSync(path.join(directory, "rollback-history", `${SUPPORT.runId}_fresh-rollback-recapture`, "rollback-reference.json"), " "),
    directory => { const file = path.join(directory, "rollback-reference.json"); const value = JSON.parse(fs.readFileSync(file)); value.criticalAssets.pop(); fs.writeFileSync(file, canonical(value)); },
  ]) {
    const fixture = finalFixture();
    try {
      mutate(fixture.directory);
      assert.throws(() => buildFinalPreflight({ authority: fixture.auth, reads: reads({}, "promotion-preflight"), protectedEvidence: protectedRows, runDirectory: fixture.directory, capturedAt, currentMs: nowMs }), /fresh|historical|changed|five|missing|mandatory|completed/i);
    } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

test("resource inventory records exactly one deployment and prohibits a second attempt", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-resource-"));
  try {
    const auth = authority();
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt });
    beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt });
    assert.throws(() => beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt }), /terminal|promotion-prohibited|clean initialized|exist/i);
    const deployment = { capturedAt, deploymentIdentifier: "new-candidate", url: "https://candidate.example.invalid", sourceCommit: auth.sourceCommit, sourceManifestSha256: auth.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, aliasAssigned: false };
    writeJson(directory, "immutable-deployment.json", deployment);
    const inventory = registerSingleDeployment({ runDirectory: directory, authority: auth, capturedAt });
    assert.equal(inventory.resources.length, 1);
    assert.equal(inventory.resources[0].id, deployment.deploymentIdentifier);
    assert.equal(fs.readdirSync(path.join(directory, "resource-inventory-history")).length >= 2, true);
    assert.throws(() => registerSingleDeployment({ runDirectory: directory, authority: auth, capturedAt }), /state is invalid/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("uncertain deployment never fabricates an identifier and only an independent provider observation can reconcile it", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-resource-uncertain-"));
  try {
    const auth = authority();
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:50:00.000Z" });
    beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:55:00.000Z" });
    const uncertain = recordDeploymentUncertainty({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:56:00.000Z", reason: "provider response interrupted token=synthetic-secret" });
    assert.equal(uncertain.resources.length, 0);
    assert.equal(uncertain.unexpectedResources[0].id, SUPPORT.runId + ":single-attempt");
    assert.throws(() => beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt }), /clean initialized/);
    const payload = { attemptId: SUPPORT.runId + ":single-deployment-attempt", easProjectId: DIAGNOSTIC_OPERATOR.easProjectId, endpoint: "https://api.expo.dev/graphql", deployments: [{ deploymentIdentifier: "provider-observed-id", url: "https://hungrie-restaurant--provider-observed-id.expo.app", createdAt: "2026-09-25T11:55:10.000Z" }] };
    const observation = { schemaVersion: 2, runId: SUPPORT.runId, stage: "deployment-reconciliation", requestId: "provider-read-1", startedAt: "2026-09-25T11:56:10.000Z", completedAt: "2026-09-25T11:56:11.000Z", status: 200, payloadSha256: hash(Buffer.from(canonical(payload))), payload, error: null };
    const observationFile = writeJson(directory, "provider-deployment-reconciliation.json", observation).file;
    const reconciled = reconcileDeploymentObservation({ runDirectory: directory, authority: auth, observationPath: observationFile, capturedAt: "2026-09-25T11:56:12.000Z" });
    assert.equal(reconciled.resources[0].id, "provider-observed-id");
    assert.equal(reconciled.unexpectedResources.length, 0);
    assert.throws(() => reconcileDeploymentObservation({ runDirectory: directory, authority: auth, observationPath: observationFile, capturedAt }), /uncertain/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("ambiguous deployment reconciliation remains blocked and preserves every observed resource", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-resource-ambiguous-"));
  try {
    const auth = authority();
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:50:00.000Z" });
    beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:55:00.000Z" });
    recordDeploymentUncertainty({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:56:00.000Z", reason: "uncertain" });
    const payload = { attemptId: SUPPORT.runId + ":single-deployment-attempt", easProjectId: DIAGNOSTIC_OPERATOR.easProjectId, endpoint: "https://api.expo.dev/graphql", deployments: ["one", "two"].map((id, index) => ({ deploymentIdentifier: id, url: `https://hungrie-restaurant--${id}.expo.app`, createdAt: `2026-09-25T11:55:1${index}.000Z` })) };
    const row = { schemaVersion: 2, runId: SUPPORT.runId, stage: "deployment-reconciliation", requestId: "provider-read-many", startedAt: "2026-09-25T11:56:10.000Z", completedAt: "2026-09-25T11:56:11.000Z", status: 200, payloadSha256: hash(Buffer.from(canonical(payload))), payload, error: null };
    const file = writeJson(directory, "provider-deployment-reconciliation.json", row).file;
    const reconciled = reconcileDeploymentObservation({ runDirectory: directory, authority: auth, observationPath: file, capturedAt });
    assert.equal(reconciled.state, "DEPLOYMENT_RECONCILIATION_AMBIGUOUS");
    assert.deepEqual(reconciled.unexpectedResources.map(value => value.id), ["one", "two"]);
    const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
    assert.equal(cleanup.passed, false);
    assert.equal(cleanup.unexpectedResources.length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("expected final alias is exact, run-bound, and preserves the original rollback evidence", () => {
  const fixture = finalFixture();
  try {
    const before = JSON.parse(fs.readFileSync(path.join(fixture.directory, "fresh-recapture-verification.json"), "utf8"));
    const expected = buildExpectedFinalAliasReference({ runDirectory: fixture.directory, authority: fixture.auth, capturedAt });
    assert.equal(expected.deploymentIdentifier, DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment);
    assert.equal(expected.routes.length, 6);
    assert.equal(expected.criticalAssets.length, 3);
    assert.equal(expected.source.originalHistoricalReferenceSha256, before.historical.reference.sha256);
    assert.throws(() => buildExpectedFinalAliasReference({ runDirectory: fixture.directory, authority: fixture.auth, capturedAt }), /exist/);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("terminal abort before deployment finalizes from the preserved initial rollback without recapture", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-before-deploy-"));
  try {
    const auth = authority();
    writeJson(directory, "baseline-preflight.json", { passed: true, runId: SUPPORT.runId });
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt });
    const initial = installInitialRollback(directory, auth);
    recordTerminalState({ runDirectory: directory, authority: auth, classification: "ABORTED", reason: "pre-deployment stop", capturedAt });
    assert.throws(() => prepareFreshRollbackRecapture({ runDirectory: directory, authority: auth, capturedAt }), /Terminal runs.*preserved rollback/i);
    assert.equal(fs.existsSync(path.join(directory, "fresh-recapture-attempt.json")), false);
    const expectedAlias = buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt });
    assert.equal(expectedAlias.source.mode, "terminal-preserved");
    assert.equal(expectedAlias.source.freshRecaptureVerificationSha256, null);
    assert.equal(expectedAlias.source.rollbackReferenceSha256, hash(Buffer.from(canonical(initial.reference))));
    const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
    assert.equal(cleanup.passed, true);
    assert.deepEqual(cleanup.createdResources, []);
    const result = await finalizeRun({ root, runDirectory: directory, authority: auth, expectedAlias, readers: finalReaders(), cleanup, capturedAt });
    assert.equal(result.result, "FAIL");
    assert.deepEqual(result.blockers, ["TERMINAL_NON_PASS_RUN"]);
    assert.equal(result.missingEvidence.length, 0);
    await assert.rejects(() => finalizeRun({ root, runDirectory: directory, authority: auth, expectedAlias, readers: finalReaders(), cleanup, capturedAt }), /cannot be retried/i);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "promotion-attempt.json"), "utf8")).promotionPermanentlyProhibited, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("terminal abort after deployment uses preserved rollback history and completes reconciliation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-after-deploy-"));
  try {
    const auth = authority();
    writeJson(directory, "baseline-preflight.json", { passed: true, runId: SUPPORT.runId });
    const initial = installInitialRollback(directory, auth, "2026-09-25T11:40:00.000Z");
    const deployment = { capturedAt, deploymentIdentifier: "rejected-candidate", url: "https://candidate.example.invalid", sourceCommit: auth.sourceCommit, sourceManifestSha256: auth.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, aliasAssigned: false };
    installRegisteredDeployment(directory, auth, deployment);
    recordTerminalState({ runDirectory: directory, authority: auth, classification: "ABORTED", reason: "immutable publication failed", capturedAt });
    const terminalBefore = fs.readFileSync(path.join(directory, "terminal-record.json"));
    const referenceBefore = fs.readFileSync(path.join(directory, "rollback-reference.json"));
    assert.throws(() => prepareFreshRollbackRecapture({ runDirectory: directory, authority: auth, capturedAt }), /Terminal runs.*preserved rollback/i);
    assert.deepEqual(fs.readFileSync(path.join(directory, "rollback-reference.json")), referenceBefore);
    assert.deepEqual(fs.readFileSync(path.join(directory, "terminal-record.json")), terminalBefore);
    const expectedAlias = buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt });
    assert.equal(expectedAlias.source.mode, "terminal-preserved");
    assert.equal(expectedAlias.contractSha256, initial.reference.contractSha256);
    const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
    let closes = 0;
    const readers = { ...finalReaders(), close: async () => ({ state: "CLOSED", passed: true, calls: ++closes }) };
    const result = await finalizeRun({ root, runDirectory: directory, authority: auth, expectedAlias, readers, cleanup, capturedAt });
    assert.equal(result.result, "FAIL");
    assert.deepEqual(result.blockers, ["TERMINAL_NON_PASS_RUN"]);
    assert.equal(result.cleanupReconciliation.passed, true);
    assert.equal(result.firebaseAdminLifecycle.passed, true);
    assert.equal(closes, 1);
    assert.equal(result.createdResources[0].id, "rejected-candidate");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("terminal reconciliation timestamps asynchronous reads after their completion without reopening the run", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-async-observations-"));
  try {
    const auth = authority();
    writeJson(directory, "baseline-preflight.json", { passed: true, runId: SUPPORT.runId });
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt });
    installInitialRollback(directory, auth);
    recordTerminalState({ runDirectory: directory, authority: auth, classification: "FAIL", reason: "access qualification failed", capturedAt });
    const expectedAlias = buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt });
    const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
    const completed = "2026-09-25T11:59:01.000Z";
    const delayed = reads({}, "finalization");
    for (const value of Object.values(delayed)) value.completedAt = completed;
    const result = await finalizeRun({ root, runDirectory: directory, authority: auth, expectedAlias, readers: { collect: async () => delayed, verifyAliasParity: finalReaders().verifyAliasParity }, cleanup, capturedAt: "2026-09-25T11:59:00.000Z" });
    assert.equal(result.result, "FAIL");
    assert.deepEqual(result.blockers, ["TERMINAL_NON_PASS_RUN"]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "finalization-reads.json"), "utf8")).capturedAt, completed);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "promotion-attempt.json"), "utf8")).promotionPermanentlyProhibited, true);
    assert.throws(() => beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt }), /terminal|promotion-prohibited|clean initialized|exist/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("final reconciliation still rejects a completed observation outside the strict freshness boundary", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-final-stale-observation-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    const stale = reads({}, "finalization");
    stale.supabaseProject.startedAt = "2026-09-25T11:48:58.999Z";
    stale.supabaseProject.completedAt = "2026-09-25T11:48:59.999Z";
    await assert.rejects(
      () => finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: { collect: async () => stale, verifyAliasParity: finalReaders().verifyAliasParity }, cleanup: evidence.cleanup, capturedAt }),
      /stale/i,
    );
    assert.equal(fs.existsSync(path.join(directory, "final-reconciliation.json")), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "finalization-attempt.json"), "utf8")).state, "STARTED");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("terminal finalization consumes immutable historical rollback bytes after an interrupted recapture", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-interrupted-recapture-"));
  try {
    const auth = authority();
    writeJson(directory, "baseline-preflight.json", { passed: true, runId: SUPPORT.runId });
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt });
    installInitialRollback(directory, auth, "2026-09-25T11:40:00.000Z");
    prepareFreshRollbackRecapture({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T11:45:00.000Z" });
    const attemptBefore = fs.readFileSync(path.join(directory, "fresh-recapture-attempt.json"));
    const attempt = JSON.parse(attemptBefore);
    const historicalBefore = fs.readFileSync(path.join(directory, attempt.historical.reference.path));
    recordTerminalState({ runDirectory: directory, authority: auth, classification: "ABORTED", reason: "recapture interrupted", capturedAt });
    const expectedAlias = buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt });
    assert.equal(expectedAlias.source.mode, "terminal-preserved");
    assert.equal(expectedAlias.source.originalHistoricalReferenceSha256, hash(historicalBefore));
    assert.deepEqual(fs.readFileSync(path.join(directory, attempt.historical.reference.path)), historicalBefore);
    assert.deepEqual(fs.readFileSync(path.join(directory, "fresh-recapture-attempt.json")), attemptBefore);
    const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
    const result = await finalizeRun({ root, runDirectory: directory, authority: auth, expectedAlias, readers: finalReaders(), cleanup, capturedAt });
    assert.equal(result.result, "FAIL");
    assert.deepEqual(result.blockers, ["TERMINAL_NON_PASS_RUN"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("uncertain alias assignment cannot finalize without independently verified rollback", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-terminal-uncertain-alias-"));
  try {
    const auth = authority();
    writeJson(directory, "baseline-preflight.json", { passed: true, runId: SUPPORT.runId });
    writeJson(directory, "artifact-manifest.json", { passed: true, runId: SUPPORT.runId });
    const deployment = { capturedAt, deploymentIdentifier: "candidate", url: "https://candidate.example.invalid", sourceCommit: auth.sourceCommit, sourceManifestSha256: auth.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, aliasAssigned: false };
    installRegisteredDeployment(directory, auth, deployment);
    writeJson(directory, "immutable-smoke.json", { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url });
    writeJson(directory, "immutable-access-qualification.json", { passed: true, deploymentIdentifier: deployment.deploymentIdentifier });
    writeJson(directory, "promotion-preflight.json", { passed: true, runId: SUPPORT.runId });
    const rollback = installInitialRollback(directory, auth);
    writeJson(directory, "promotion-attempt.json", { runId: auth.runId, attemptedAt: capturedAt, deploymentIdentifier: "candidate", providerCommandInvoked: true });
    const terminal = recordTerminalState({ runDirectory: directory, authority: auth, classification: "INCONCLUSIVE", reason: "assignment response uncertain", capturedAt });
    assert.equal(terminal.rollbackRequired, true);
    assert.throws(() => buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt }), /requires independent rollback verification/i);
    writeJson(directory, "rollback-attempt.json", { attemptedAt: capturedAt, deploymentIdentifier: rollback.reference.deploymentIdentifier });
    writeJson(directory, "rollback-result.json", { completedAt: capturedAt, deploymentIdentifier: rollback.reference.deploymentIdentifier });
    writeJson(directory, "rollback-verification-result.json", { passed: true, classification: "PASS", expected: { deploymentIdentifier: rollback.reference.deploymentIdentifier, routes: rollback.reference.routes, criticalAssets: rollback.reference.criticalAssets, runtimeFiles: rollback.reference.runtimeFiles, externalRuntime: rollback.reference.externalRuntime }, selectedAttempts: [{ number: 1 }, { number: 4 }] });
    const expectedAlias = buildExpectedFinalAliasReference({ runDirectory: directory, authority: auth, capturedAt });
    const cleanup = buildCleanupDisposition({ runDirectory: directory, authority: auth, capturedAt });
    const result = await finalizeRun({ root, runDirectory: directory, authority: auth, expectedAlias, readers: finalReaders(), cleanup, capturedAt });
    assert.equal(result.result, "FAIL");
    assert.deepEqual(result.blockers, ["TERMINAL_NON_PASS_RUN"]);
    assert.equal(result.missingEvidence.length, 0);
    assert.throws(() => beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt }), /terminal|promotion-prohibited|clean initialized|exist/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("interrupted finalization cannot produce PASS evidence and a completed promotion always requires rollback evidence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-finalization-interrupt-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    fs.rmSync(path.join(directory, "rollback-result.json"));
    let writes = 0;
    await assert.rejects(() => finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt, persist: (file, value) => { writes += 1; if (writes === 2) throw new Error("synthetic finalization interruption"); fs.writeFileSync(file, Buffer.isBuffer(value) ? value : canonical(value)); } }), /synthetic finalization interruption/);
    assert.equal(fs.existsSync(path.join(directory, "final-reconciliation.json")), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "finalization-attempt.json"), "utf8")).state, "STARTED");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Firebase Admin cleanup failure prevents terminal reconciliation from being written", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-firebase-cleanup-failure-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    const readers = { ...finalReaders(), close: async () => { throw new Error("synthetic Firebase cleanup failure"); } };
    await assert.rejects(() => finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers, cleanup: evidence.cleanup, capturedAt }), /synthetic Firebase cleanup failure/);
    assert.equal(fs.existsSync(path.join(directory, "final-reconciliation.json")), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "finalization-attempt.json"), "utf8")).state, "STARTED");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("interrupted finalization resumes from preserved evidence exactly once", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-finalization-resume-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    let writes = 0;
    await assert.rejects(
      () => finalizeRun({
        root,
        runDirectory: directory,
        authority: authority(),
        expectedAlias: evidence.expected,
        readers: finalReaders(),
        cleanup: evidence.cleanup,
        capturedAt,
        persist: (file, value) => {
          writes += 1;
          if (writes === 2) throw new Error("synthetic resumable finalization interruption");
          fs.writeFileSync(file, Buffer.isBuffer(value) ? value : canonical(value));
        },
      }),
      /synthetic resumable finalization interruption/,
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "finalization-attempt.json"), "utf8")).state, "STARTED");
    const resumed = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt });
    assert.equal(resumed.result, "PASS");
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "finalization-attempt.json"), "utf8")).state, "COMPLETE");
    await assert.rejects(
      () => finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt }),
      /cannot be retried or rebound/i,
    );
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("credential-shaped persistent evidence causes final failure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-credential-"));
  try {
    const evidence = writeSuccessfulRunEvidence(directory);
    fs.writeFileSync(path.join(directory, "leak.json"), canonical({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz" }));
    const result = await finalizeRun({ root, runDirectory: directory, authority: authority(), expectedAlias: evidence.expected, readers: finalReaders(), cleanup: evidence.cleanup, capturedAt });
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

test("owned Firebase Admin lease deletes once and verifies registry absence", async () => {
  const app = { name: "temporary-app" };
  const registry = [app], evidence = [];
  let deletions = 0;
  const lease = createFirebaseAppLease({ app, appName: app.name, owned: true, deleteApp: async () => { deletions += 1; registry.splice(0); }, listApps: () => registry, persist: value => evidence.push(structuredClone(value)), now: () => Date.parse(capturedAt) });
  const first = await lease.close(), second = await lease.close();
  assert.equal(first.passed, true);
  assert.equal(second, first);
  assert.equal(deletions, 1);
  assert.deepEqual(evidence.map(row => row.state), ["ACTIVE", "CLOSED"]);
});

test("Firebase Admin lease records already-deleted error only after independent absence verification", async () => {
  const evidence = [];
  const lease = createFirebaseAppLease({ app: {}, appName: "temporary-app", owned: true, deleteApp: async () => { throw new Error('Firebase app named "temporary-app" has already been deleted.'); }, listApps: () => [], persist: value => evidence.push(structuredClone(value)), now: () => Date.parse(capturedAt) });
  const result = await lease.close();
  assert.equal(result.passed, true);
  assert.match(result.deletionError, /already been deleted/);
  assert.equal(result.registeredAfterClose, false);
  assert.equal(evidence.at(-1).state, "CLOSED");
});

test("Firebase Admin lease fails when deletion leaves the temporary app registered", async () => {
  const app = { name: "temporary-app" }, evidence = [];
  const lease = createFirebaseAppLease({ app, appName: app.name, owned: true, deleteApp: async () => { throw new Error("synthetic deletion failure"); }, listApps: () => [app], persist: value => evidence.push(structuredClone(value)), now: () => Date.parse(capturedAt) });
  await assert.rejects(() => lease.close(), /could not be independently verified/i);
  assert.equal(evidence.at(-1).state, "CLEANUP_FAILED");
  assert.equal(evidence.at(-1).passed, false);
  assert.match(evidence.at(-1).deletionError, /synthetic deletion failure/);
});

test("borrowed Firebase Admin app is never deleted", async () => {
  let deletions = 0;
  const result = await createFirebaseAppLease({ app: {}, appName: "injected", owned: false, deleteApp: async () => { deletions += 1; } }).close();
  assert.equal(result.state, "BORROWED");
  assert.equal(result.passed, true);
  assert.equal(deletions, 0);
});

test("Firebase Admin lifecycle evidence preserves earlier process observations", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alias-support-firebase-lifecycle-history-"));
  try {
    const first = hostedReaderFixture({ directoryOverride: directory });
    await first.readers.close();
    const second = hostedReaderFixture({ directoryOverride: directory });
    await second.readers.close();
    const evidence = JSON.parse(fs.readFileSync(path.join(directory, "finalization-firebase-admin-lifecycle.json"), "utf8"));
    assert.equal(evidence.runId, SUPPORT.runId);
    assert.deepEqual(evidence.events.map(row => row.state), ["ACTIVE", "BORROWED", "ACTIVE", "BORROWED"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
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


test("independent provider reconciliation producer persists exact project-bound evidence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "provider-reconciliation-producer-"));
  const auth = authority();
  try {
    initializeResourceInventory({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T10:00:00Z" });
    beginSingleDeploymentAttempt({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T10:01:00Z" });
    recordDeploymentUncertainty({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T10:02:00Z", reason: "synthetic uncertain response" });
    const id = "observed-only";
    const fetchImpl = async (_url, init) => { const body = JSON.parse(init.body); assert.equal(body.variables.appId, DIAGNOSTIC_OPERATOR.easProjectId); return new Response(JSON.stringify({ data: { app: { byId: { id: DIAGNOSTIC_OPERATOR.easProjectId, workerDeployments: { edges: [{ node: { id: "provider-id", deploymentIdentifier: id, url: `https://hungrie-restaurant--${id}.expo.app`, createdAt: "2026-09-25T10:01:10Z" } }] } } } } }), { status: 200 }); };
    const result = await produceDeploymentReconciliationEvidence({ runDirectory: directory, authority: auth, capturedAt: "2026-09-25T10:02:10Z", fetchImpl, expoSession: "synthetic-local-session" });
    const row = JSON.parse(fs.readFileSync(result.path));
    assert.equal(row.payload.easProjectId, DIAGNOSTIC_OPERATOR.easProjectId);
    assert.equal(row.payload.deployments[0].deploymentIdentifier, id);
    assert.equal(row.error, null);
    await assert.rejects(() => produceDeploymentReconciliationEvidence({ runDirectory: directory, authority: auth, fetchImpl, expoSession: "synthetic" }), /exists|uncertain/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
