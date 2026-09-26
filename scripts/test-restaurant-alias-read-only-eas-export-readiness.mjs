import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DIAGNOSTIC_OPERATOR } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import {
  READ_ONLY_EAS_EXPORT_CHECK,
  initializeExclusiveEvidenceDirectory,
  runReadOnlyEasExportCheck,
  validateReadOnlyEasExportAuthorization,
  verifyExactProductionExportReadiness,
  verifyReadOnlyEasExportEvidence,
} from "./verify-restaurant-alias-production-export-readiness.mjs";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const now = Date.parse("2026-09-26T15:00:00.000Z");
const sourceCommit = "a".repeat(40);
const manifestBytes = Buffer.from("reviewed source manifest\n");
const sourceManifestSha256 = hash(manifestBytes);
const files = Array.from({ length: 74 }, (_, index) => ({ path: `file-${String(index).padStart(2, "0")}`, bytes: index + 1, sha256: hash(Buffer.from(String(index))) }));

function authorization(overrides = {}) {
  const authorizationText = `I authorize the read-only Staging EAS export check ruip6ae_20260926j. It permits two environment-wrapped exports and no deployment, diagnostic, alias, rollback, or mutation.`;
  return {
    contractVersion: 1,
    decision: READ_ONLY_EAS_EXPORT_CHECK.decision,
    approvedForReadOnlyHostedAccess: true,
    hostedMutationsAuthorized: false,
    diagnosticRunAuthorized: false,
    environment: "staging",
    checkId: "ruip6ae_20260926j",
    easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
    sourceCommit,
    sourceManifestSha256,
    applicationTree: DIAGNOSTIC_OPERATOR.applicationTree,
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
    buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256,
    authorizationText,
    authorizationTextSha256: hash(Buffer.from(authorizationText)),
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    ...overrides,
  };
}

function output() {
  return { files, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archive: { sha256: DIAGNOSTIC_OPERATOR.archiveSha256, bytes: 123 } };
}

test("read-only authorization is exact, short-lived, Staging-only, and prohibits mutations", () => {
  assert.equal(validateReadOnlyEasExportAuthorization(authorization(), { now }).checkId, "ruip6ae_20260926j");
  for (const mutation of [
    { approvedForReadOnlyHostedAccess: false }, { hostedMutationsAuthorized: true }, { diagnosticRunAuthorized: true },
    { environment: "production" }, { easProjectId: "wrong" }, { artifactManifestSha256: "0".repeat(64) },
    { buildInputContractSha256: "0".repeat(64) },
    { authorizationTextSha256: "0".repeat(64) }, { expiresAt: new Date(now).toISOString() },
  ]) assert.throws(() => validateReadOnlyEasExportAuthorization(authorization(mutation), { now }));
});

test("exact wrapper runs twice in fresh processes and retains full 74-file observations", () => {
  const calls = [], progress = [];
  const result = verifyExactProductionExportReadiness({ root: path.resolve(import.meta.dirname, ".."), run(command, args, options) { calls.push({ command, args, cwd: options.cwd }); return { status: 0, stdout: "", stderr: "" }; }, outputVerifier: output, onAttempt: value => progress.push(structuredClone(value)), clock: { now: () => now } });
  assert.equal(result.passed, true);
  assert.equal(result.observations.length, 2);
  assert.ok(result.observations.every(row => row.files.length === 74));
  assert.equal(progress.at(-1).disposition, "PASS");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.command === "npx" && JSON.stringify(call.args) === JSON.stringify(READ_ONLY_EAS_EXPORT_CHECK.command)));
  assert.ok(calls.every(call => !call.args.some(value => /^(?:deploy|alias|rollback|promote)$/i.test(value))));
});

test("mismatch or wrapper failure persists a failed observation and cannot pass", () => {
  const progress = [];
  assert.throws(() => verifyExactProductionExportReadiness({ root: path.resolve(import.meta.dirname, ".."), run: () => ({ status: 1 }), outputVerifier: output, onAttempt: value => progress.push(structuredClone(value)), clock: { now: () => now } }), /attempt 1 failed/i);
  assert.equal(progress.at(-1).disposition, "FAIL");
  assert.equal(progress.at(-1).attempts[0].passed, false);
  assert.throws(() => verifyExactProductionExportReadiness({ root: path.resolve(import.meta.dirname, ".."), run: () => ({ status: 0 }), outputVerifier: () => ({ ...output(), artifactManifestSha256: "0".repeat(64) }), clock: { now: () => now } }), /differs/i);
});

test("standalone check writes separate exclusive sanitized evidence without run authority or attempt markers", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "read-only-eas-export-test-"));
  const approvalPath = path.join(directory, "approval.json"), manifestPath = path.join(directory, "source-manifest.tsv"), evidenceRoot = path.join(directory, "evidence"), outputPath = path.join(evidenceRoot, "ruip6ae_20260926j");
  fs.writeFileSync(approvalPath, JSON.stringify(authorization()));
  fs.writeFileSync(manifestPath, manifestBytes);
  const spawn = (_command, args) => ({ status: 0, stdout: args[1] === "HEAD" ? `${sourceCommit}\n` : `${DIAGNOSTIC_OPERATOR.applicationTree}\n` });
  try {
    const result = runReadOnlyEasExportCheck([`--authorization=${approvalPath}`, `--source-manifest=${manifestPath}`, `--output=${outputPath}`, "--confirm=staging:restaurant-alias:read-only-eas-export:ruip6ae_20260926j"], { now: () => now, clock: { now: () => now }, evidenceRoot, spawnSync: spawn, run: () => ({ status: 0 }), outputVerifier: output });
    assert.equal(result.disposition, "PASS");
    assert.deepEqual(fs.readdirSync(outputPath).sort(), ["read-only-eas-export-evidence.json", "read-only-eas-export-initialization.json", "read-only-eas-export-progress.json"]);
    assert.doesNotMatch(fs.readFileSync(path.join(outputPath, "read-only-eas-export-evidence.json"), "utf8"), /Bearer|password|cookie/i);
    assert.equal(verifyReadOnlyEasExportEvidence(result, { sourceCommit, sourceManifestSha256, now }).passed, true);
    assert.throws(() => runReadOnlyEasExportCheck([`--authorization=${approvalPath}`, `--source-manifest=${manifestPath}`, `--output=${outputPath}`, "--confirm=staging:restaurant-alias:read-only-eas-export:ruip6ae_20260926j"], { now: () => now, evidenceRoot, spawnSync: spawn }), /already exists/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("missing trusted parent is created before the exclusive check directory without contacting EAS", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "read-only-eas-export-parent-"));
  const evidenceRoot = path.join(directory, "missing", "trusted-root");
  const outputDirectory = path.join(evidenceRoot, "ruip6ae_20260926k");
  try {
    initializeExclusiveEvidenceDirectory({ evidenceRoot, outputDirectory, checkId: "ruip6ae_20260926k", initializedAt: new Date(now).toISOString() });
    assert.equal(fs.statSync(evidenceRoot).mode & 0o777, 0o700);
    assert.equal(fs.statSync(outputDirectory).mode & 0o777, 0o700);
    assert.equal(JSON.parse(fs.readFileSync(path.join(outputDirectory, "read-only-eas-export-initialization.json"), "utf8")).state, "INITIALIZED");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("an existing check directory fails closed without overwriting its evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "read-only-eas-export-existing-"));
  const outputDirectory = path.join(directory, "ruip6ae_20260926k");
  fs.mkdirSync(outputDirectory);
  const preserved = path.join(outputDirectory, "preserved.json");
  fs.writeFileSync(preserved, "preserved\n");
  try {
    assert.throws(() => initializeExclusiveEvidenceDirectory({ evidenceRoot: directory, outputDirectory, checkId: "ruip6ae_20260926k", initializedAt: new Date(now).toISOString() }), /exist/i);
    assert.equal(fs.readFileSync(preserved, "utf8"), "preserved\n");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("trusted-parent permission errors fail before a check directory is created", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "read-only-eas-export-permission-"));
  const evidenceRoot = path.join(directory, "trusted-root"), outputDirectory = path.join(evidenceRoot, "ruip6ae_20260926k");
  const denied = { ...fs, mkdirSync(target, options) { if (path.resolve(target) === path.resolve(evidenceRoot)) { const error = new Error("permission denied"); error.code = "EACCES"; throw error; } return fs.mkdirSync(target, options); } };
  try {
    assert.throws(() => initializeExclusiveEvidenceDirectory({ evidenceRoot, outputDirectory, checkId: "ruip6ae_20260926k", initializedAt: new Date(now).toISOString(), fileSystem: denied }), /permission denied/i);
    assert.equal(fs.existsSync(outputDirectory), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("interrupted initialization preserves the exclusive directory and prohibits reuse", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "read-only-eas-export-interrupted-"));
  const outputDirectory = path.join(directory, "ruip6ae_20260926k");
  let interrupted = false;
  const failing = { ...fs, writeFileSync(target, value, options) { if (!interrupted && String(target).includes("read-only-eas-export-initialization.json")) { interrupted = true; throw new Error("synthetic initialization interruption"); } return fs.writeFileSync(target, value, options); } };
  try {
    assert.throws(() => initializeExclusiveEvidenceDirectory({ evidenceRoot: directory, outputDirectory, checkId: "ruip6ae_20260926k", initializedAt: new Date(now).toISOString(), fileSystem: failing }), /interruption/i);
    assert.equal(fs.existsSync(outputDirectory), true);
    assert.throws(() => initializeExclusiveEvidenceDirectory({ evidenceRoot: directory, outputDirectory, checkId: "ruip6ae_20260926k", initializedAt: new Date(now).toISOString() }), /exist/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("passing evidence rejects tampering, staleness, wrong source, and incomplete equality", () => {
  const evidence = { schemaVersion: 1, checkId: "ruip6ae_20260926j", disposition: "PASS", completedAt: new Date(now - 1_000).toISOString(), environment: "staging", easProjectId: DIAGNOSTIC_OPERATOR.easProjectId, sourceCommit, sourceManifestSha256, applicationTree: DIAGNOSTIC_OPERATOR.applicationTree, buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, authorizationTextSha256: authorization().authorizationTextSha256, attempts: [1, 2].map(attempt => ({ attempt, passed: true, fileCount: 74, files, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256 })) };
  assert.equal(verifyReadOnlyEasExportEvidence(evidence, { sourceCommit, sourceManifestSha256, now }).passed, true);
  assert.throws(() => verifyReadOnlyEasExportEvidence({ ...evidence, completedAt: new Date(now - 31 * 60_000).toISOString() }, { sourceCommit, sourceManifestSha256, now }), /stale/i);
  assert.throws(() => verifyReadOnlyEasExportEvidence(evidence, { sourceCommit: "b".repeat(40), sourceManifestSha256, now }), /required/i);
  assert.throws(() => verifyReadOnlyEasExportEvidence({ ...evidence, attempts: [evidence.attempts[0], { ...evidence.attempts[1], files: evidence.attempts[1].files.slice(1) }] }, { sourceCommit, sourceManifestSha256, now }), /required/i);
});
