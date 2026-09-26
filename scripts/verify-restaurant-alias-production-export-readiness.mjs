#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DIAGNOSTIC_OPERATOR, verifyLocalExportOutput } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";

export const READ_ONLY_EAS_EXPORT_CHECK = Object.freeze({
  decision: "AUTHORIZE_READ_ONLY_STAGING_EAS_EXPORT_CHECK",
  environment: "staging",
  easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
  command: Object.freeze(["eas-cli@16.32.0", "env:exec", "preview", "npm run prepare:web && npx expo export --platform web --clear", "--non-interactive"]),
  maximumAuthorizationMs: 2 * 60 * 60_000,
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";
const iso = value => new Date(value).toISOString();

function exactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} fields differ from the reviewed schema.`);
}

function safeError(error) {
  const name = typeof error?.name === "string" ? error.name.slice(0, 80) : "Error";
  const message = typeof error?.message === "string" ? error.message.replace(/(?:Bearer|token|password|cookie|authorization|api[-_]?key)\s*[=:]?\s*[^\s,;]+/gi, "[redacted]").slice(0, 300) : "Read-only export check failed.";
  return { name, message };
}

function atomicWrite(file, value, fileSystem = fs) {
  fileSystem.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fileSystem.chmodSync(path.dirname(file), 0o700);
  const temporary = `${file}.${process.pid}.tmp`;
  fileSystem.writeFileSync(temporary, canonical(value), { mode: 0o600 });
  fileSystem.renameSync(temporary, file);
  fileSystem.chmodSync(file, 0o600);
}

export function initializeExclusiveEvidenceDirectory({ evidenceRoot, outputDirectory, checkId, initializedAt, fileSystem = fs }) {
  const trustedRoot = path.resolve(evidenceRoot);
  const expectedOutput = path.join(trustedRoot, checkId);
  if (path.resolve(outputDirectory) !== expectedOutput) throw new Error("Read-only EAS export evidence path is outside the trusted check directory.");
  fileSystem.mkdirSync(trustedRoot, { recursive: true, mode: 0o700 });
  fileSystem.chmodSync(trustedRoot, 0o700);
  fileSystem.mkdirSync(expectedOutput, { recursive: false, mode: 0o700 });
  fileSystem.chmodSync(expectedOutput, 0o700);
  atomicWrite(path.join(expectedOutput, "read-only-eas-export-initialization.json"), {
    schemaVersion: 1,
    checkId,
    initializedAt,
    state: "INITIALIZED",
  }, fileSystem);
  return expectedOutput;
}

export function validateReadOnlyEasExportAuthorization(input, { now = Date.now() } = {}) {
  exactKeys(input, [
    "contractVersion", "decision", "approvedForReadOnlyHostedAccess", "hostedMutationsAuthorized", "diagnosticRunAuthorized",
    "environment", "checkId", "easProjectId", "sourceCommit", "sourceManifestSha256", "applicationTree",
    "artifactManifestSha256", "archiveSha256", "authorizationText", "authorizationTextSha256", "issuedAt", "expiresAt",
  ], "Read-only EAS export authorization");
  if (input.contractVersion !== 1 || input.decision !== READ_ONLY_EAS_EXPORT_CHECK.decision || input.approvedForReadOnlyHostedAccess !== true || input.hostedMutationsAuthorized !== false || input.diagnosticRunAuthorized !== false) throw new Error("Explicit read-only EAS export authorization is required.");
  if (input.environment !== READ_ONLY_EAS_EXPORT_CHECK.environment || input.easProjectId !== READ_ONLY_EAS_EXPORT_CHECK.easProjectId) throw new Error("Read-only EAS export environment identity mismatch.");
  if (!/^ruip6ae_[a-z0-9]{8,24}$/.test(input.checkId || "")) throw new Error("A fresh canonical read-only export check ID is required.");
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit || "") || !/^[a-f0-9]{64}$/.test(input.sourceManifestSha256 || "") || input.applicationTree !== DIAGNOSTIC_OPERATOR.applicationTree || input.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || input.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Read-only EAS export source or artifact binding mismatch.");
  if (typeof input.authorizationText !== "string" || input.authorizationText.length < 80 || input.authorizationTextSha256 !== sha256(Buffer.from(input.authorizationText)) || !/read-only/i.test(input.authorizationText) || !/staging/i.test(input.authorizationText) || !input.authorizationText.includes(input.checkId) || !/no deployment/i.test(input.authorizationText)) throw new Error("Read-only EAS export authorization text is incomplete or has the wrong digest.");
  const issued = Date.parse(input.issuedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > READ_ONLY_EAS_EXPORT_CHECK.maximumAuthorizationMs || now < issued || now >= expires) throw new Error("Read-only EAS export authorization is not currently valid.");
  return input;
}

export function verifyExactProductionExportReadiness({ root, run = spawnSync, outputVerifier = verifyLocalExportOutput, onAttempt = () => {}, clock = { now: () => Date.now() } } = {}) {
  if (!root) throw new Error("Repository root is required for exact export readiness verification.");
  const appRoot = path.join(root, "apps/restaurant");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-diagnostic-export-readiness-"));
  const results = [];
  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = iso(clock.now());
      try {
        const exported = run("npx", [...READ_ONLY_EAS_EXPORT_CHECK.command], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        const completedAt = iso(clock.now());
        if (exported.status !== 0) throw new Error(`Exact production diagnostic export readiness attempt ${attempt} failed.`);
        const verified = outputVerifier({ distDirectory: path.join(appRoot, "dist"), archivePath: path.join(temporary, `restaurant-static-export-${attempt}.tar`), spawn: run });
        const result = { attempt, startedAt, completedAt, command: ["npx", ...READ_ONLY_EAS_EXPORT_CHECK.command], files: verified.files, fileCount: verified.files.length, artifactManifestSha256: verified.artifactManifestSha256, archiveSha256: verified.archive.sha256, archiveBytes: verified.archive.bytes, passed: true };
        results.push(result);
        onAttempt({ attempts: results, terminal: false });
      } catch (error) {
        const failed = { attempt, startedAt, completedAt: iso(clock.now()), command: ["npx", ...READ_ONLY_EAS_EXPORT_CHECK.command], passed: false, error: safeError(error) };
        results.push(failed);
        onAttempt({ attempts: results, terminal: true, disposition: "FAIL" });
        throw error;
      }
    }
    if (results.some(value => value.fileCount !== 74 || value.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || value.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256)) throw new Error("Exact production diagnostic export differs from the accepted artifact.");
    if (JSON.stringify(results[0].files) !== JSON.stringify(results[1].files) || results[0].archiveSha256 !== results[1].archiveSha256) throw new Error("Exact production diagnostic export is not reproducible.");
    const result = { passed: true, attempts: 2, artifactManifestSha256: results[0].artifactManifestSha256, archiveSha256: results[0].archiveSha256, observations: results };
    onAttempt({ attempts: results, terminal: true, disposition: "PASS" });
    return result;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function verifyReadOnlyEasExportEvidence(value, { sourceCommit, sourceManifestSha256, now = Date.now(), maximumAgeMs = 30 * 60_000 } = {}) {
  if (value?.schemaVersion !== 1 || value?.disposition !== "PASS" || value?.environment !== "staging" || value?.easProjectId !== DIAGNOSTIC_OPERATOR.easProjectId || value?.sourceCommit !== sourceCommit || value?.sourceManifestSha256 !== sourceManifestSha256 || value?.applicationTree !== DIAGNOSTIC_OPERATOR.applicationTree || value?.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || value?.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || value?.attempts?.length !== 2 || value.attempts.some(row => row.passed !== true || row.fileCount !== 74 || row.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || row.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || row.files?.length !== 74) || JSON.stringify(value.attempts[0].files) !== JSON.stringify(value.attempts[1].files)) throw new Error("Complete passing read-only EAS export evidence is required.");
  const completed = Date.parse(value.completedAt);
  if (!Number.isFinite(completed) || completed > now || now - completed > maximumAgeMs) throw new Error("Read-only EAS export evidence is stale.");
  return { passed: true, checkId: value.checkId, completedAt: value.completedAt, evidenceSha256: sha256(Buffer.from(canonical(value))) };
}

export function runReadOnlyEasExportCheck(argv = process.argv.slice(2), dependencies = {}) {
  const values = Object.fromEntries(argv.filter(value => value.startsWith("--") && value.includes("=")).map(value => { const index = value.indexOf("="); return [value.slice(2, index), value.slice(index + 1)]; }));
  const root = path.resolve(import.meta.dirname, "..");
  const authorizationPath = path.resolve(values.authorization || "");
  const sourceManifestPath = path.resolve(values["source-manifest"] || "");
  const outputDirectory = path.resolve(values.output || "");
  if (!values.authorization || !values["source-manifest"] || !values.output || !values.confirm) throw new Error("Authorization, source manifest, output, and confirmation are required.");
  const now = dependencies.now?.() ?? Date.now();
  const authorization = validateReadOnlyEasExportAuthorization(JSON.parse(fs.readFileSync(authorizationPath, "utf8")), { now });
  if (values.confirm !== `staging:restaurant-alias:read-only-eas-export:${authorization.checkId}`) throw new Error("Read-only EAS export confirmation mismatch.");
  if (fs.existsSync(outputDirectory)) throw new Error("Read-only EAS export evidence directory already exists.");
  const spawn = dependencies.spawnSync || spawnSync;
  if (spawn("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() !== authorization.sourceCommit || spawn("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim() !== authorization.applicationTree) throw new Error("Reviewed read-only export checkpoint is not checked out.");
  if (!fs.existsSync(sourceManifestPath) || sha256(fs.readFileSync(sourceManifestPath)) !== authorization.sourceManifestSha256) throw new Error("Reviewed source manifest is required for the read-only export check.");
  const evidenceRoot = path.resolve(dependencies.evidenceRoot || path.join(root, "secure/restaurant-alias-export-readiness"));
  initializeExclusiveEvidenceDirectory({ evidenceRoot, outputDirectory, checkId: authorization.checkId, initializedAt: iso(now), fileSystem: dependencies.fileSystem || fs });
  const progressPath = path.join(outputDirectory, "read-only-eas-export-progress.json");
  try {
    const result = verifyExactProductionExportReadiness({ root, run: dependencies.run || spawnSync, outputVerifier: dependencies.outputVerifier || verifyLocalExportOutput, clock: dependencies.clock, onAttempt(progress) { atomicWrite(progressPath, { schemaVersion: 1, checkId: authorization.checkId, environment: authorization.environment, easProjectId: authorization.easProjectId, sourceCommit: authorization.sourceCommit, sourceManifestSha256: authorization.sourceManifestSha256, applicationTree: authorization.applicationTree, artifactManifestSha256: authorization.artifactManifestSha256, archiveSha256: authorization.archiveSha256, authorizationTextSha256: authorization.authorizationTextSha256, ...progress }); } });
    const evidence = { schemaVersion: 1, checkId: authorization.checkId, disposition: "PASS", completedAt: iso(now), environment: authorization.environment, easProjectId: authorization.easProjectId, sourceCommit: authorization.sourceCommit, sourceManifestSha256: authorization.sourceManifestSha256, applicationTree: authorization.applicationTree, artifactManifestSha256: result.artifactManifestSha256, archiveSha256: result.archiveSha256, authorizationTextSha256: authorization.authorizationTextSha256, attempts: result.observations };
    atomicWrite(path.join(outputDirectory, "read-only-eas-export-evidence.json"), evidence);
    return evidence;
  } catch (error) {
    atomicWrite(path.join(outputDirectory, "read-only-eas-export-terminal.json"), { schemaVersion: 1, checkId: authorization.checkId, disposition: "FAIL", completedAt: iso(now), error: safeError(error) });
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = runReadOnlyEasExportCheck();
    process.stdout.write(canonical({ disposition: result.disposition, checkId: result.checkId, completedAt: result.completedAt, artifactManifestSha256: result.artifactManifestSha256, archiveSha256: result.archiveSha256 }));
  } catch (error) {
    process.stderr.write(canonical({ disposition: "FAIL", error: safeError(error) }));
    process.exitCode = 1;
  }
}
