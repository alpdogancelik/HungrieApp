#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DIAGNOSTIC_OPERATOR,
  validateAuthority,
  verifyProtectedEvidence,
  verifyRollbackParity,
} from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { sanitizeError } from "./restaurant-alias-parity-verifier.mjs";

export const SUPPORT = Object.freeze({
  proposalSha256: "90ebc57b3b07dc0f0a87e252d026b1f62bda6bacbd4edce439d8a0f543fe803b",
  baseCheckpoint: "267b9bc5bbe888431d864963890f73c7092ededc",
  baseSourceManifestSha256: "617c8a75b8fa2e2cf4003e7b22a730afcca98c8cc3da5e30bbfae4eb4ea53d9b",
  checkpointFiles: Object.freeze([
    "docs/restaurant-alias-diagnostic-execution-support-implementation-review.md",
    "docs/restaurant-alias-diagnostic-execution-support-implementation.diff",
    "scripts/restaurant-alias-diagnostic-execution-support.mjs",
    "scripts/test-restaurant-alias-diagnostic-execution-support.mjs",
  ]),
  applicationTree: DIAGNOSTIC_OPERATOR.applicationTree,
  runId: "ruip6ad_20260925a",
  evidenceDirectory: "secure/restaurant-alias-diagnostic/ruip6ad_20260925a",
  authorityDirectory: "secure/restaurant-alias-diagnostic-authority",
  migrationFunctions: Object.freeze({
    "private.raise_restaurant_order_conflict_v1(text)": Object.freeze({
      sha256: "7f381cd2857ebeb5bd24cb6f55edcc897eeb7d73d45a12d790c24f70656c0c9c",
      owner: "hungrie_api_owner", securityDefiner: true, volatility: "v", config: "search_path=\"\"",
      acl: "{hungrie_api_owner=X/hungrie_api_owner}",
    }),
    "public.restaurant_acknowledge_order_seen_v1(text,timestamp with time zone,uuid)": Object.freeze({
      sha256: "5229df80acf9bd1546c5c13bfbd62874426c0953e8126f8345dacb4fcf69e843",
      owner: "hungrie_api_owner", securityDefiner: true, volatility: "v", config: "search_path=\"\"",
      acl: "{=X/hungrie_api_owner,hungrie_api_owner=X/hungrie_api_owner,service_role=X/hungrie_api_owner,authenticated=X/hungrie_api_owner}",
    }),
    "public.restaurant_transition_order_v1(text,timestamp with time zone,text,text,text,uuid)": Object.freeze({
      sha256: "a5cd9f921b678df1092c0d26b2e1350e02fec1a80cb726792e7d9c46a23d2797",
      owner: "hungrie_api_owner", securityDefiner: true, volatility: "v", config: "search_path=\"\"",
      acl: "{=X/hungrie_api_owner,hungrie_api_owner=X/hungrie_api_owner,service_role=X/hungrie_api_owner,authenticated=X/hungrie_api_owner}",
    }),
  }),
  actions: Object.freeze([
    "export", "capture-rollback", "deploy", "verify-immutable",
    "qualify-immutable-access", "promote", "observe-alias", "rollback", "verify-rollback",
  ]),
  freshnessMs: Object.freeze({ baseline: 10 * 60_000, final: 10 * 60_000, rollback: 5 * 60_000 }),
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";
const placeholder = value => typeof value !== "string" || !value.trim() || /<[^>]+>|placeholder|todo|replace[_ -]?me|example authorization/i.test(value);
const iso = milliseconds => new Date(milliseconds).toISOString();

export function sanitizeSupportError(error) {
  return sanitizeError(error);
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  const temporary = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, Buffer.isBuffer(value) ? value : canonical(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function parseOptions(argv) {
  const [action, ...rest] = argv;
  const values = Object.fromEntries(rest.filter(value => value.startsWith("--") && value.includes("=")).map(value => {
    const index = value.indexOf("=");
    return [value.slice(2, index), value.slice(index + 1)];
  }));
  return { action, values };
}

function required(value, label) {
  if (placeholder(value)) throw new Error(label + " is missing or contains a placeholder.");
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(label + " fields differ from the reviewed schema.");
}

export function buildSourceManifest(repoRoot, commit = SUPPORT.baseCheckpoint, spawn = spawnSync) {
  const tree = spawn("git", ["ls-tree", "-r", "--name-only", "-z", commit], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (tree.status !== 0) throw new Error("Unable to enumerate accepted checkpoint.");
  const paths = tree.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  const lines = [];
  for (const relative of paths) {
    const blob = spawn("git", ["show", commit + ":" + relative], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (blob.status !== 0) throw new Error("Unable to read checkpoint blob: " + relative);
    lines.push(sha256(blob.stdout) + "\t" + blob.stdout.length + "\t" + relative + "\n");
  }
  const bytes = Buffer.from(lines.join(""));
  return { commit, files: paths.length, bytes, sha256: sha256(bytes) };
}

export function validateOwnerAuthorization(input) {
  const fields = [
    "contractVersion", "decision", "approvedForHostedExecution", "environment", "runId",
    "proposalSha256", "checkpointParent", "sourceCommit", "sourceManifestSha256", "applicationTree", "authorizedActions",
    "authorizationText", "authorizationTextSha256", "issuedAt",
  ];
  exactKeys(input, fields, "Owner authorization");
  if (input.contractVersion !== 1 || input.decision !== "APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC" || input.approvedForHostedExecution !== true || input.environment !== "staging") throw new Error("Explicit one-run Staging approval is required.");
  if (input.runId !== SUPPORT.runId || input.proposalSha256 !== SUPPORT.proposalSha256 || input.checkpointParent !== SUPPORT.baseCheckpoint || !/^[a-f0-9]{40}$/.test(input.sourceCommit || "") || input.sourceCommit === SUPPORT.baseCheckpoint || !/^[a-f0-9]{64}$/.test(input.sourceManifestSha256 || "") || input.applicationTree !== SUPPORT.applicationTree) throw new Error("Owner authorization identity mismatch.");
  if (JSON.stringify(input.authorizedActions) !== JSON.stringify(SUPPORT.actions)) throw new Error("Owner authorization actions are incomplete or contradictory.");
  required(input.authorizationText, "Owner authorization text");
  if (input.authorizationText.length < 80 || input.authorizationTextSha256 !== sha256(Buffer.from(input.authorizationText))) throw new Error("Owner authorization text digest mismatch.");
  if (!/authorize/i.test(input.authorizationText) || !/staging/i.test(input.authorizationText) || !/ruip6ad_20260925a/i.test(input.authorizationText) || !/rollback/i.test(input.authorizationText) || !/earnings.+disabled/i.test(input.authorizationText)) throw new Error("Owner authorization text lacks required explicit boundaries.");
  if (!Number.isFinite(Date.parse(input.issuedAt))) throw new Error("Owner authorization timestamp is invalid.");
  return input;
}

export function prepareAuthorityArtifacts({ repoRoot, approval, outputDirectory, spawn = spawnSync }) {
  validateOwnerAuthorization(approval);
  const manifest = buildSourceManifest(repoRoot, approval.sourceCommit, spawn);
  if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Approved support-checkpoint source manifest was not reproduced.");
  if (spawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() !== approval.sourceCommit) throw new Error("Repository HEAD is not the approved support checkpoint.");
  if (spawn("git", ["rev-parse", approval.sourceCommit + "^"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() !== SUPPORT.baseCheckpoint) throw new Error("Support checkpoint is not a direct child of the accepted diagnostic checkpoint.");
  const inventory = spawn("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", approval.sourceCommit], { cwd: repoRoot, encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean).sort();
  if (JSON.stringify(inventory) !== JSON.stringify([...SUPPORT.checkpointFiles].sort())) throw new Error("Support checkpoint inventory differs from the reviewed four-file scope.");
  if (spawn("git", ["rev-parse", approval.sourceCommit + ":apps/restaurant"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() !== SUPPORT.applicationTree) throw new Error("Restaurant application tree changed.");
  const authority = {
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
    sourceCommit: approval.sourceCommit,
    sourceManifestSha256: approval.sourceManifestSha256,
    ownerAuthorizationSha256: approval.authorizationTextSha256,
  };
  const manifestPath = path.join(outputDirectory, SUPPORT.runId + "-source-manifest.tsv");
  const authorityPath = path.join(outputDirectory, SUPPORT.runId + "-authority.json");
  if (fs.existsSync(manifestPath) || fs.existsSync(authorityPath)) throw new Error("Authority artifacts already exist; overwrite prohibited.");
  atomicWrite(manifestPath, manifest.bytes);
  atomicWrite(authorityPath, authority);
  return { authority, authorityPath, manifestPath, authoritySha256: sha256(fs.readFileSync(authorityPath)), sourceManifestSha256: manifest.sha256, files: manifest.files };
}

function observation(value, label, binding = {}) {
  const keys = ["runId", "stage", "source", "requestId", "startedAt", "completedAt", "status", "payloadSha256", "payload"];
  exactKeys(value, keys, label + " observation");
  if (binding.runId && value.runId !== binding.runId) throw new Error(label + " observation run binding mismatch.");
  if (binding.stage && value.stage !== binding.stage) throw new Error(label + " observation stage binding mismatch.");
  if (binding.source && value.source !== binding.source) throw new Error(label + " observation source binding mismatch.");
  required(value.source, label + " source");
  required(value.requestId, label + " request ID");
  if (!Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.completedAt)) || Date.parse(value.completedAt) < Date.parse(value.startedAt)) throw new Error(label + " timestamps are invalid.");
  if (binding.capturedAt) {
    const age = Date.parse(binding.capturedAt) - Date.parse(value.completedAt);
    if (age < 0 || age > binding.maximumAgeMs) throw new Error(label + " observation is stale or future-dated.");
  }
  if (value.status !== 200 || !/^[a-f0-9]{64}$/.test(value.payloadSha256) || value.payloadSha256 !== sha256(Buffer.from(canonical(value.payload)))) throw new Error(label + " independent read is incomplete or unverified.");
  return value;
}

function validateCatalog(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) throw new Error("Exact function catalog required.");
  for (const [identity, expected] of Object.entries(SUPPORT.migrationFunctions)) {
    const row = rows.find(value => value.identity === identity);
    if (!row || row.definition_sha256 !== expected.sha256 || row.owner !== expected.owner || row.security_definer !== expected.securityDefiner || row.volatility !== expected.volatility || row.config !== expected.config || row.acl !== expected.acl) throw new Error("Function or ACL state mismatch: " + identity);
  }
}

function validateSnapshotReads(reads, stage, binding) {
  const names = ["supabaseProject", "firebaseProject", "alias", "migrationHistory", "functionCatalog", "earnings"];
  const sources = { supabaseProject: "supabase-project", firebaseProject: "firebase-project", alias: "expo-alias", migrationHistory: "supabase-migrations", functionCatalog: "supabase-function-catalog", earnings: "supabase-earnings-capability" };
  exactKeys(reads, names, stage + " read set");
  const validated = Object.fromEntries(names.map(name => [name, observation(reads[name], name, { ...binding, source: sources[name] })]));
  const ids = validated;
  if (ids.supabaseProject.payload.id !== DIAGNOSTIC_OPERATOR.supabaseProjectRef || ids.supabaseProject.payload.status !== "ACTIVE_HEALTHY") throw new Error("Wrong or unhealthy Staging Supabase project.");
  if (ids.firebaseProject.payload.projectId !== DIAGNOSTIC_OPERATOR.firebaseProjectId) throw new Error("Wrong Firebase project.");
  const alias = ids.alias.payload;
  if (alias.easProjectId !== DIAGNOSTIC_OPERATOR.easProjectId || alias.aliasId !== DIAGNOSTIC_OPERATOR.aliasId || alias.aliasName !== DIAGNOSTIC_OPERATOR.aliasName || alias.aliasUrl !== DIAGNOSTIC_OPERATOR.aliasUrl || !alias.deploymentIdentifier) throw new Error("Wrong or incomplete EAS alias identity.");
  const history = ids.migrationHistory.payload;
  if (!Array.isArray(history.applied) || history.applied.filter(value => value === DIAGNOSTIC_OPERATOR.conflictMigration.version).length !== 1 || !Array.isArray(history.pending) || history.pending.length !== 0 || history.localMigrationSha256 !== DIAGNOSTIC_OPERATOR.conflictMigration.sha256) throw new Error("Migration parity or zero-pending requirement failed.");
  validateCatalog(ids.functionCatalog.payload.rows);
  if (ids.earnings.payload.capability !== "restaurant_earnings_v1" || ids.earnings.payload.enabled !== false) throw new Error("Earnings must remain disabled.");
  const requestIds = names.map(name => validated[name].requestId);
  if (new Set(requestIds).size !== requestIds.length) throw new Error("Every hosted assertion requires an independent recorded read.");
  return {
    stage,
    observations: validated,
    identities: {
      supabaseProjectRef: ids.supabaseProject.payload.id,
      firebaseProjectId: ids.firebaseProject.payload.projectId,
      easProjectId: alias.easProjectId,
      aliasId: alias.aliasId,
      aliasName: alias.aliasName,
      aliasUrl: alias.aliasUrl,
    },
    alias,
    migration: {
      version: DIAGNOSTIC_OPERATOR.conflictMigration.version,
      sha256: history.localMigrationSha256,
      appliedExactlyOnce: true,
      pendingCount: 0,
    },
    earnings: { capability: "restaurant_earnings_v1", enabled: false },
  };
}

function requireRunEvidence(file, label) {
  if (!fs.existsSync(file)) throw new Error(label + " evidence is missing.");
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes), sha256: sha256(bytes), file };
}

export function buildBaselinePreflight({ authority, reads, protectedEvidence, capturedAt }) {
  if (authority.runId !== SUPPORT.runId || !/^[a-f0-9]{40}$/.test(authority.sourceCommit || "") || !/^[a-f0-9]{64}$/.test(authority.sourceManifestSha256 || "") || authority.applicationTree !== SUPPORT.applicationTree) throw new Error("Baseline authority mismatch.");
  const snapshot = validateSnapshotReads(reads, "baseline", { runId: authority.runId, stage: "baseline-preflight", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.baseline });
  if (!Array.isArray(protectedEvidence) || protectedEvidence.some(value => value.passed !== true) || protectedEvidence.length !== 2) throw new Error("Protected evidence verification required.");
  return {
    schemaVersion: 1, stage: "baseline", passed: true, capturedAt, runId: authority.runId,
    source: { commit: authority.sourceCommit, manifestSha256: authority.sourceManifestSha256, applicationTree: SUPPORT.applicationTree },
    artifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256 },
    protectedEvidence, ...snapshot,
  };
}

export function buildFinalPreflight({ authority, reads, protectedEvidence, runDirectory, capturedAt, currentMs = Date.now() }) {
  const snapshot = validateSnapshotReads(reads, "final", { runId: authority.runId, stage: "promotion-preflight", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.final });
  const artifact = requireRunEvidence(path.join(runDirectory, "artifact-manifest.json"), "Artifact");
  const deployment = requireRunEvidence(path.join(runDirectory, "immutable-deployment.json"), "Deployment");
  const immutable = requireRunEvidence(path.join(runDirectory, "immutable-smoke.json"), "Immutable parity");
  const access = requireRunEvidence(path.join(runDirectory, "immutable-access-qualification.json"), "Immutable access");
  const rollback = requireRunEvidence(path.join(runDirectory, "rollback-reference.json"), "Rollback reference");
  if (artifact.value.runId !== authority.runId || artifact.value.sourceCommit !== authority.sourceCommit || artifact.value.sourceManifestSha256 !== authority.sourceManifestSha256 || artifact.value.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || artifact.value.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Final artifact binding mismatch.");
  if (!deployment.value.deploymentIdentifier || deployment.value.url !== immutable.value.url || immutable.value.passed !== true || immutable.value.deploymentIdentifier !== deployment.value.deploymentIdentifier) throw new Error("Final immutable candidate mismatch.");
  if (access.value.passed !== true || access.value.deploymentIdentifier !== deployment.value.deploymentIdentifier || access.value.immutableUrl !== deployment.value.url || access.value.immutableEvidenceSha256 !== immutable.sha256) throw new Error("Final access evidence mismatch.");
  if (rollback.value.passed !== true || rollback.value.deploymentIdentifier !== DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment) throw new Error("Final rollback identity mismatch.");
  const rollbackMs = Date.parse(rollback.value.capturedAt || "");
  if (!Number.isFinite(rollbackMs) || rollbackMs > currentMs + 5_000 || currentMs - rollbackMs > SUPPORT.freshnessMs.rollback) {
    const error = new Error("Rollback reference is stale; fresh independent recapture is required before final preflight.");
    error.code = "ROLLBACK_RECAPTURE_REQUIRED";
    throw error;
  }
  if (snapshot.alias.deploymentIdentifier !== rollback.value.deploymentIdentifier) throw new Error("Live alias no longer matches the frozen rollback reference.");
  if (!Array.isArray(protectedEvidence) || protectedEvidence.some(value => value.passed !== true) || protectedEvidence.length !== 2) throw new Error("Protected evidence verification required.");
  return {
    schemaVersion: 1,
    passed: true,
    capturedAt,
    runId: authority.runId,
    environment: "staging",
    identities: snapshot.identities,
    source: { commit: authority.sourceCommit, manifestSha256: authority.sourceManifestSha256, applicationTree: SUPPORT.applicationTree },
    artifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256 },
    migration: snapshot.migration,
    earnings: snapshot.earnings,
    protectedEvidence,
    candidate: { deploymentIdentifier: deployment.value.deploymentIdentifier, url: deployment.value.url, immutableEvidenceSha256: immutable.sha256, accessEvidenceSha256: access.sha256 },
    rollback: { deploymentIdentifier: rollback.value.deploymentIdentifier, referenceSha256: rollback.sha256, parityPassed: true },
    observationEvidence: Object.fromEntries(Object.entries(snapshot.observations).map(([name, row]) => [name, { requestId: row.requestId, payloadSha256: row.payloadSha256, completedAt: row.completedAt }])),
  };
}

export function recordTerminalState({ runDirectory, authority, classification, reason, capturedAt, write = atomicWrite }) {
  if (!["FAIL", "INCONCLUSIVE", "ABORTED"].includes(classification)) throw new Error("Terminal failure classification required.");
  required(reason, "Terminal reason");
  const promotionAttempt = path.join(runDirectory, "promotion-attempt.json");
  const promotionResult = path.join(runDirectory, "promotion-result.json");
  const rollbackResult = path.join(runDirectory, "rollback-result.json");
  const rollbackVerification = path.join(runDirectory, "rollback-verification-result.json");
  const assignment = fs.existsSync(promotionResult) ? "confirmed" : fs.existsSync(promotionAttempt) ? "uncertain" : "not-attempted";
  const rollbackRequired = assignment !== "not-attempted";
  if (!fs.existsSync(promotionAttempt)) atomicWrite(promotionAttempt, { blockedAt: capturedAt, runId: authority.runId, providerCommandInvoked: false, promotionPermanentlyProhibited: true, reason: classification + ": " + reason });
  const value = {
    schemaVersion: 1, capturedAt, runId: authority.runId, classification, reason,
    aliasAssignment: assignment, rollbackRequired, promotionRetryPermitted: false,
    rollbackCommand: rollbackRequired ? "node scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs rollback --environment=staging --run-id=" + authority.runId + " --confirm=staging:restaurant-alias-diagnostic:rollback:" + authority.runId + " <reviewed authority/source arguments>" : null,
    restorationVerified: fs.existsSync(rollbackVerification) ? JSON.parse(fs.readFileSync(rollbackVerification, "utf8")).passed === true : fs.existsSync(rollbackResult) ? false : null,
    preservedEvidence: fs.readdirSync(runDirectory).sort(),
  };
  const output = path.join(runDirectory, "terminal-record.json");
  if (fs.existsSync(output)) throw new Error("Terminal record already exists; overwrite prohibited.");
  write(output, value);
  return value;
}

function credentialFindings(directory) {
  const patterns = [
    /bearer\s+[a-z0-9._~+/=-]{12,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./,
    /"(?:password|cookie|sessionSecret|apiKey|authorization)"\s*:\s*"(?!(?:\[REDACTED\]|<REDACTED>))[^"]+"/i,
  ];
  const findings = [];
  for (const file of walk(directory)) {
    if (path.basename(file) === "evidence-manifest.tsv") continue;
    const body = fs.readFileSync(file);
    if (body.includes(0)) continue;
    const text = body.toString("utf8");
    if (patterns.some(pattern => pattern.test(text))) findings.push(path.relative(directory, file).split(path.sep).join("/"));
  }
  return findings;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

export function buildEvidenceManifest(directory) {
  const files = walk(directory).filter(file => path.basename(file) !== "evidence-manifest.tsv").sort();
  const bytes = Buffer.from(files.map(file => {
    const data = fs.readFileSync(file);
    return sha256(data) + "\t" + data.length + "\t" + path.relative(directory, file).split(path.sep).join("/") + "\n";
  }).join(""));
  return { files: files.length, bytes, sha256: sha256(bytes) };
}

function reconcileProtectedEvidence(rows, error = null) {
  const expected = DIAGNOSTIC_OPERATOR.protectedEvidence;
  const issues = [];
  if (error) issues.push("VERIFICATION_ERROR");
  if (!Array.isArray(rows) || rows.length !== expected.length) issues.push("INCOMPLETE_RESULT_SET");
  for (const reference of expected) {
    const matches = Array.isArray(rows) ? rows.filter(row => row?.runId === reference.runId) : [];
    if (matches.length !== 1) { issues.push("RUN_RESULT_MISSING_OR_DUPLICATED:" + reference.runId); continue; }
    const row = matches[0];
    if (row.passed !== true || row.files !== reference.files || row.manifestSha256 !== reference.manifestSha256) issues.push("RUN_RESULT_MISMATCH:" + reference.runId);
  }
  return { passed: issues.length === 0, expectedFiles: expected.reduce((sum, row) => sum + row.files, 0), results: Array.isArray(rows) ? rows : [], issues, error: error ? sanitizeSupportError(error) : null };
}

function resourceIdentity(value) {
  return value && typeof value.type === "string" && value.type && typeof value.id === "string" && value.id ? value.type + ":" + value.id : null;
}

function reconcileCleanup(runDirectory, authority, cleanup) {
  const issues = [];
  let inventory = null;
  try { inventory = JSON.parse(fs.readFileSync(path.join(runDirectory, "created-resources.json"), "utf8")); }
  catch (error) { issues.push("CREATED_RESOURCE_INVENTORY_MISSING_OR_INVALID"); }
  const resources = Array.isArray(inventory?.resources) ? inventory.resources : [];
  const unexpected = Array.isArray(inventory?.unexpectedResources) ? inventory.unexpectedResources : [];
  if (inventory?.schemaVersion !== 1 || inventory?.runId !== authority.runId || !Array.isArray(inventory?.resources) || !Array.isArray(inventory?.unexpectedResources)) issues.push("CREATED_RESOURCE_INVENTORY_BINDING_INVALID");
  const inventoryIds = resources.map(resourceIdentity);
  if (inventoryIds.some(value => !value) || new Set(inventoryIds).size !== inventoryIds.length) issues.push("CREATED_RESOURCE_INVENTORY_DUPLICATE_OR_INVALID");
  const cleanupRows = Array.isArray(cleanup?.createdResources) ? cleanup.createdResources : [];
  const cleanupIds = cleanupRows.map(resourceIdentity);
  if (cleanupIds.some(value => !value) || new Set(cleanupIds).size !== cleanupIds.length) issues.push("CLEANUP_RESOURCE_DUPLICATE_OR_INVALID");
  const supported = new Set(["retained-provider-record", "deleted-and-verified", "unregistered-and-verified"]);
  if (cleanupRows.some(row => !supported.has(row?.disposition))) issues.push("CLEANUP_DISPOSITION_UNSUPPORTED_OR_INCOMPLETE");
  for (const row of cleanupRows.filter(value => ["deleted-and-verified", "unregistered-and-verified"].includes(value?.disposition))) {
    const relative = row.verificationEvidence?.path;
    const expectedSha256 = row.verificationEvidence?.sha256;
    const evidencePath = typeof relative === "string" ? path.resolve(runDirectory, relative) : "";
    if (!relative || !/^[a-f0-9]{64}$/.test(expectedSha256 || "") || !evidencePath.startsWith(path.resolve(runDirectory) + path.sep) || !fs.existsSync(evidencePath) || sha256(fs.readFileSync(evidencePath)) !== expectedSha256) issues.push("CLEANUP_DELETION_CLAIM_UNVERIFIED:" + (resourceIdentity(row) || "invalid"));
  }
  if (JSON.stringify([...inventoryIds].sort()) !== JSON.stringify([...cleanupIds].sort())) issues.push("CLEANUP_RESOURCE_SET_MISMATCH");
  const persistedUnexpected = unexpected.map(resourceIdentity);
  const declaredUnexpected = Array.isArray(cleanup?.unexpectedResources) ? cleanup.unexpectedResources.map(resourceIdentity) : [];
  if (persistedUnexpected.some(value => !value) || new Set(persistedUnexpected).size !== persistedUnexpected.length || declaredUnexpected.some(value => !value) || new Set(declaredUnexpected).size !== declaredUnexpected.length || JSON.stringify([...persistedUnexpected].sort()) !== JSON.stringify([...declaredUnexpected].sort())) issues.push("UNEXPECTED_RESOURCE_RECONCILIATION_MISMATCH");
  if (unexpected.length) issues.push("UNEXPECTED_RESOURCES_REMAIN");
  if (cleanup?.manifestScoped !== true || !Array.isArray(cleanup?.incomplete) || cleanup.incomplete.length) issues.push("CLEANUP_INCOMPLETE");
  try {
    const deployment = JSON.parse(fs.readFileSync(path.join(runDirectory, "immutable-deployment.json"), "utf8"));
    if (!deployment.deploymentIdentifier || !resources.some(row => row.type === "immutable-deployment" && row.id === deployment.deploymentIdentifier) || !cleanupRows.some(row => row.type === "immutable-deployment" && row.id === deployment.deploymentIdentifier && row.disposition === "retained-provider-record")) issues.push("IMMUTABLE_PROVIDER_DEPLOYMENT_UNACCOUNTED");
  } catch (error) { issues.push("IMMUTABLE_DEPLOYMENT_EVIDENCE_INVALID"); }
  return { passed: issues.length === 0, inventory, cleanup, issues };
}

export async function finalizeRun({ root, runDirectory, authority, expectedAlias, readers, cleanup, capturedAt, persist = atomicWrite, verifyProtectedEvidenceImpl = verifyProtectedEvidence }) {
  if (!expectedAlias?.deploymentIdentifier || expectedAlias.routes?.length !== 6 || expectedAlias.criticalAssets?.length !== 5) throw new Error("Complete final alias reference required.");
  let protectedRows = [], protectedError = null;
  try { protectedRows = verifyProtectedEvidenceImpl(root); } catch (error) { protectedError = error; }
  const protectedEvidence = reconcileProtectedEvidence(protectedRows, protectedError);
  const reads = await readers.collect();
  persist(path.join(runDirectory, "finalization-reads.json"), { schemaVersion: 1, runId: authority.runId, reads });
  const snapshot = validateSnapshotReads(reads, "finalization", { runId: authority.runId, stage: "finalization", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.final });
  const aliasParity = await readers.verifyAliasParity(expectedAlias);
  const findings = credentialFindings(runDirectory);
  const cleanupReconciliation = reconcileCleanup(runDirectory, authority, cleanup);
  const required = ["baseline-preflight.json", "rollback-reference.json"];
  const promotionAttempted = fs.existsSync(path.join(runDirectory, "promotion-attempt.json"));
  const terminalExists = fs.existsSync(path.join(runDirectory, "terminal-record.json"));
  if (promotionAttempted) required.push("artifact-manifest.json", "immutable-deployment.json", "immutable-smoke.json", "immutable-access-qualification.json", "promotion-preflight.json");
  if (promotionAttempted && !terminalExists) required.push("promotion-result.json", "alias-observation-result.json");
  if (!promotionAttempted) required.push("terminal-record.json");
  const missingEvidence = required.filter(name => !fs.existsSync(path.join(runDirectory, name)));
  let result = "PASS";
  const blockers = [];
  if (!aliasParity?.passed || aliasParity.deploymentIdentifier !== expectedAlias.deploymentIdentifier || aliasParity.selectedAttempts?.length < 2) { result = "FAIL"; blockers.push("FINAL_ALIAS_PARITY_FAILED"); }
  if (!protectedEvidence.passed) { result = "FAIL"; blockers.push("PROTECTED_EVIDENCE_FAILED"); }
  if (terminalExists) { result = "FAIL"; blockers.push("TERMINAL_NON_PASS_RUN"); }
  if (missingEvidence.length) { if (result === "PASS") result = "BLOCKED"; blockers.push("MANDATORY_EVIDENCE_MISSING"); }
  if (!cleanupReconciliation.passed) { if (result === "PASS") result = "BLOCKED"; blockers.push("CLEANUP_INVENTORY_MISMATCH"); }
  if (findings.length) { result = "FAIL"; blockers.push("CREDENTIAL_SHAPED_EVIDENCE"); }
  const final = {
    schemaVersion: 1, capturedAt, runId: authority.runId, result, blockers,
    finalAlias: aliasParity, migration: snapshot.migration, earnings: snapshot.earnings,
    protectedEvidence, cleanupReconciliation, credentialFindings: findings, missingEvidence,
    createdResources: cleanupReconciliation.inventory?.resources || [],
  };
  persist(path.join(runDirectory, "final-reconciliation.json"), final);
  const manifest = buildEvidenceManifest(runDirectory);
  persist(path.join(runDirectory, "evidence-manifest.tsv"), manifest.bytes);
  const verified = buildEvidenceManifest(runDirectory);
  if (verified.sha256 !== manifest.sha256 || verified.files !== manifest.files) throw new Error("Final evidence manifest verification failed.");
  return { ...final, evidenceManifestSha256: manifest.sha256, evidenceFiles: manifest.files };
}

function recorded(payload, runId, stage, source, requestId, startedAt, completedAt, status = 200) {
  return { runId, stage, source, requestId, startedAt, completedAt, status, payloadSha256: sha256(Buffer.from(canonical(payload))), payload };
}

export function readProgressSnapshot(progressPath, { runId, stage, capturedAt, maximumAgeMs }) {
  const bytes = fs.readFileSync(progressPath);
  const value = JSON.parse(bytes);
  exactKeys(value, ["schemaVersion", "runId", "stage", "capturedAt", "readsSha256", "reads", "errors"], "Hosted read progress");
  if (value.schemaVersion !== 2 || value.runId !== runId || value.stage !== stage || value.readsSha256 !== sha256(Buffer.from(canonical(value.reads)))) throw new Error("Hosted read progress binding or digest mismatch.");
  if (value.capturedAt !== capturedAt || !Array.isArray(value.errors) || value.errors.length) throw new Error("Hosted read progress is incomplete or unsuccessful.");
  validateSnapshotReads(value.reads, stage, { runId, stage, capturedAt, maximumAgeMs });
  return value.reads;
}

export function createHostedReaders({ root, runId, runDirectory, evidencePrefix, fetchImpl = fetch, now = () => Date.now(), testConfiguration = null, parityClock, deadlineSignal, persistEvidence = atomicWrite }) {
  const registry = testConfiguration?.registry || JSON.parse(fs.readFileSync(path.join(root, "secure/supabase-projects.local.json"), "utf8"));
  const project = registry.projects?.staging;
  if (project?.ref !== DIAGNOSTIC_OPERATOR.supabaseProjectRef || project.ref === registry.projects?.development?.ref) throw new Error("Exact isolated Staging Supabase registry entry required.");
  const managementToken = testConfiguration?.managementToken || fs.readFileSync(path.join(root, "secure/supabase-cli-hungrie/access-token"), "utf8").trim();
  const operator = testConfiguration?.operator || JSON.parse(fs.readFileSync(path.join(root, "secure/phase7/operator-config.json"), "utf8"));
  const credentialPath = path.resolve(operator.firebaseAdminCredentialPath || "");
  const firebaseCredential = testConfiguration?.firebaseCredential || JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (firebaseCredential.project_id !== DIAGNOSTIC_OPERATOR.firebaseProjectId || operator.firebaseProjectId !== DIAGNOSTIC_OPERATOR.firebaseProjectId) throw new Error("Exact non-production Firebase credential required.");
  const expoState = testConfiguration ? { auth: { sessionSecret: testConfiguration.expoSession } } : JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".expo/state.json"), "utf8"));
  const expoSession = expoState.auth?.sessionSecret;
  if (!expoSession) throw new Error("Expo session is unavailable.");
  let sequence = 0;
  const capturedReads = {};
  const progressPath = path.join(runDirectory, required(evidencePrefix, "Hosted read evidence prefix") + "-reads-progress.json");
  const persistReadProgress = errors => {
    const capturedAt = iso(now());
    persistEvidence(progressPath, { schemaVersion: 2, runId, stage: evidencePrefix, capturedAt, readsSha256: sha256(Buffer.from(canonical(capturedReads))), reads: capturedReads, errors });
    return capturedAt;
  };
  const capture = async (key, source, operation) => {
    const requestId = runId + ":" + source + ":" + (++sequence);
    const started = now();
    try {
      const response = await operation();
      const completed = now();
      const row = recorded(response.payload, runId, evidencePrefix, source, requestId, iso(started), iso(completed), response.status);
      capturedReads[key] = row;
      persistReadProgress([]);
      return row;
    } catch (error) {
      capturedReads[key] = { runId, stage: evidencePrefix, source, requestId, startedAt: iso(started), completedAt: iso(now()), status: null, payloadSha256: null, payload: null, error: sanitizeSupportError(error) };
      persistReadProgress([source]);
      throw error;
    }
  };
  const supabaseFetch = async (url, init = {}) => {
    const response = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), authorization: "Bearer " + managementToken } });
    const payload = await response.json();
    return { status: response.status, payload };
  };
  const query = statement => supabaseFetch("https://api.supabase.com/v1/projects/" + project.ref + "/database/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: statement }) });
  const migrationNames = testConfiguration?.migrationNames || fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  const catalogSql = "begin transaction read only; select case when strpos(p.oid::regprocedure::text,'.')>0 then p.oid::regprocedure::text else n.nspname||'.'||p.oid::regprocedure::text end identity, encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_sha256, pg_get_userbyid(p.proowner) owner, p.prosecdef security_definer, p.provolatile volatility, coalesce(array_to_string(p.proconfig,','),'') config, coalesce(p.proacl::text,'') acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('restaurant_transition_order_v1','restaurant_acknowledge_order_seen_v1')) or (n.nspname='private' and p.proname='raise_restaurant_order_conflict_v1') order by identity; rollback;";
  const aliasRead = async ({ signal } = {}) => {
    const document = "query Alias($appId:String!){app{byId(appId:$appId){id workerDeploymentAliases(first:50){edges{node{id aliasName url updatedAt workerDeployment{id deploymentIdentifier url createdAt}}}}}}}";
    const response = await fetchImpl("https://api.expo.dev/graphql", { method: "POST", headers: { "content-type": "application/json", "expo-session": expoSession }, body: JSON.stringify({ query: document, variables: { appId: DIAGNOSTIC_OPERATOR.easProjectId } }), signal });
    const body = await response.json();
    const app = body.data?.app?.byId;
    const alias = app?.workerDeploymentAliases?.edges?.map(edge => edge.node).find(node => node.id === DIAGNOSTIC_OPERATOR.aliasId && node.aliasName === DIAGNOSTIC_OPERATOR.aliasName);
    return { status: response.status, payload: { easProjectId: app?.id, aliasId: alias?.id, aliasName: alias?.aliasName, aliasUrl: alias?.url, deploymentIdentifier: alias?.workerDeployment?.deploymentIdentifier, deploymentUrl: alias?.workerDeployment?.url, updatedAt: alias?.updatedAt || null } };
  };
  let firebaseApp = testConfiguration?.firebaseApp;
  if (!firebaseApp) {
    const require = createRequire(import.meta.url);
    const admin = require(path.join(root, "functions/node_modules/firebase-admin"));
    firebaseApp = admin.initializeApp({ credential: admin.credential.cert(firebaseCredential), projectId: DIAGNOSTIC_OPERATOR.firebaseProjectId }, "alias-support-" + runId + "-" + Date.now());
  }
  return {
    async collect() {
      const supabaseProject = await capture("supabaseProject", "supabase-project", () => supabaseFetch("https://api.supabase.com/v1/projects/" + project.ref));
      const token = await firebaseApp.options.credential.getAccessToken();
      const firebaseProject = await capture("firebaseProject", "firebase-project", async () => {
        const response = await fetchImpl("https://firebase.googleapis.com/v1beta1/projects/" + DIAGNOSTIC_OPERATOR.firebaseProjectId, { headers: { authorization: "Bearer " + token.access_token } });
        const payload = await response.json();
        return { status: response.status, payload: { projectId: payload.projectId } };
      });
      const alias = await capture("alias", "expo-alias", aliasRead);
      const migrationHistory = await capture("migrationHistory", "supabase-migrations", async () => {
        const result = await query("begin transaction read only; select version from supabase_migrations.schema_migrations order by version; rollback;");
        const applied = result.payload.map(row => String(row.version));
        return { status: result.status, payload: { applied, pending: migrationNames.map(name => name.slice(0, 14)).filter(version => !applied.includes(version)), localMigrationSha256: testConfiguration?.localMigrationSha256 || sha256(fs.readFileSync(path.join(root, "supabase/migrations/20260924140000_restaurant_order_conflict_transport.sql"))) } };
      });
      const functionCatalog = await capture("functionCatalog", "supabase-function-catalog", async () => {
        const result = await query(catalogSql);
        return { status: result.status, payload: { rows: result.payload } };
      });
      const earnings = await capture("earnings", "supabase-earnings-capability", async () => {
        const result = await query("begin transaction read only; select capability,enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1'; rollback;");
        return { status: result.status, payload: result.payload[0] || null };
      });
      const completedAt = persistReadProgress([]);
      return readProgressSnapshot(progressPath, { runId, stage: evidencePrefix, capturedAt: completedAt, maximumAgeMs: evidencePrefix === "baseline-preflight" ? SUPPORT.freshnessMs.baseline : SUPPORT.freshnessMs.final });
    },
    async verifyAliasParity(expected) {
      const evidence = await verifyRollbackParity({
        aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
        runId,
        expected,
        retrieveMetadata: async ({ attempt, record: persistObservation, signal }) => {
          if (typeof persistObservation !== "function") throw new Error("Verifier metadata persistence interface is unavailable.");
          const started = now();
          const requestId = runId + ":expo-alias-final-parity:" + attempt + ":" + (++sequence);
          try {
            const result = await aliasRead({ signal });
            const completed = now();
            const row = recorded(result.payload, runId, "final-alias-parity", "expo-alias-final-parity", requestId, iso(started), iso(completed), result.status);
            await persistObservation({ type: "metadata", ...row });
            return result.payload;
          } catch (error) {
            await persistObservation({ type: "metadata", runId, stage: "final-alias-parity", source: "expo-alias-final-parity", requestId, startedAt: iso(started), completedAt: iso(now()), status: null, payloadSha256: null, payload: null, error: sanitizeSupportError(error) });
            throw error;
          }
        },
        persist: value => persistEvidence(path.join(runDirectory, "final-alias-verification-progress.json"), value),
        fetchImpl,
        ...(parityClock ? { clock: parityClock } : {}),
        ...(deadlineSignal ? { deadlineSignal } : {}),
      });
      persistEvidence(path.join(runDirectory, "final-alias-verification.json"), evidence);
      return { ...evidence, deploymentIdentifier: expected.deploymentIdentifier };
    },
    async close() { await firebaseApp.delete(); },
  };
}

export async function runSupport(argv = process.argv.slice(2), dependencies = {}) {
  const { action, values } = parseOptions(argv);
  const root = path.resolve(import.meta.dirname, "..");
  if (action === "prepare-authority") {
    const approval = JSON.parse(fs.readFileSync(path.resolve(required(values.approval, "Approval path")), "utf8"));
    const output = path.resolve(required(values.output, "Authority output directory"));
    return prepareAuthorityArtifacts({ repoRoot: root, approval, outputDirectory: output, spawn: dependencies.spawnSync || spawnSync });
  }
  if (!["baseline-preflight", "final-preflight", "record-abort", "finalize"].includes(action)) throw new Error("Unsupported execution-support action.");
  const authorityPath = path.resolve(required(values.authority, "Authority path"));
  const expectedCommit = required(values["expect-commit"], "Expected support checkpoint");
  const expectedSourceSha256 = required(values["expect-source-sha256"], "Expected source manifest SHA-256");
  const authority = validateAuthority(JSON.parse(fs.readFileSync(authorityPath, "utf8")), { runId: SUPPORT.runId, sourceCommit: expectedCommit, sourceManifestSha256: expectedSourceSha256 });
  if (spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() !== expectedCommit || spawnSync("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim() !== SUPPORT.applicationTree) throw new Error("Approved support checkpoint is not checked out.");
  const sourceManifestPath = path.resolve(required(values["source-manifest"], "Source manifest path"));
  if (!fs.existsSync(sourceManifestPath) || sha256(fs.readFileSync(sourceManifestPath)) !== expectedSourceSha256) throw new Error("Approved support source manifest file required.");
  const runDirectory = path.join(root, SUPPORT.evidenceDirectory);
  fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const confirmation = "staging:restaurant-alias-support:" + action + ":" + SUPPORT.runId;
  if (values.confirm !== confirmation) throw new Error("Action-specific execution-support confirmation mismatch.");
  if (action === "record-abort") return recordTerminalState({ runDirectory, authority, classification: values.classification || "ABORTED", reason: required(values.reason, "Abort reason"), capturedAt: new Date().toISOString() });
  const evidencePrefix = action === "baseline-preflight" ? "baseline-preflight" : action === "final-preflight" ? "promotion-preflight" : "finalization";
  const readers = dependencies.readers || createHostedReaders({ root, runId: SUPPORT.runId, runDirectory, evidencePrefix });
  try {
    if (action === "baseline-preflight") {
      const reads = await readers.collect();
      atomicWrite(path.join(runDirectory, "baseline-preflight-reads.json"), { schemaVersion: 1, runId: SUPPORT.runId, reads });
      const result = buildBaselinePreflight({ authority, reads, protectedEvidence: verifyProtectedEvidence(root), capturedAt: new Date().toISOString() });
      atomicWrite(path.join(runDirectory, "baseline-preflight.json"), result);
      return result;
    }
    if (action === "final-preflight") {
      const reads = await readers.collect();
      atomicWrite(path.join(runDirectory, "promotion-preflight-reads.json"), { schemaVersion: 1, runId: SUPPORT.runId, reads });
      const result = buildFinalPreflight({ authority, reads, protectedEvidence: verifyProtectedEvidence(root), runDirectory, capturedAt: new Date().toISOString() });
      atomicWrite(path.join(runDirectory, "promotion-preflight.json"), result);
      return result;
    }
    const expectedPath = path.resolve(required(values.expected, "Expected final alias reference"));
    const cleanupPath = path.resolve(required(values.cleanup, "Cleanup disposition"));
    const expectedAlias = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    const cleanup = JSON.parse(fs.readFileSync(cleanupPath, "utf8"));
    if (!readers.verifyAliasParity) throw new Error("Independent final alias parity reader required.");
    return finalizeRun({ root, runDirectory, authority, expectedAlias, readers, cleanup, capturedAt: new Date().toISOString() });
  } finally {
    if (readers.close) await readers.close();
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) runSupport().then(result => process.stdout.write(canonical(result))).catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
