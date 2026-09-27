#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DIAGNOSTIC_OPERATOR } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { SUPPORT, buildSourceManifest, validateOwnerAuthorization, verifyLocalDiagnosticPrerequisites, verifyReviewedCandidateCheckpoint } from "./restaurant-alias-diagnostic-execution-support.mjs";
import { validateReadOnlyEasExportAuthorization, verifyReadOnlyEasExportEvidence } from "./verify-restaurant-alias-production-export-readiness.mjs";

export const SINGLE_APPROVAL_WORKFLOW = Object.freeze({
  contractVersion: 1,
  decision: "AUTHORIZE_ONE_COMPLETE_STAGING_ALIAS_WORKFLOW",
  checkId: "ruip6ae_20260927p",
  runId: "ruip6ad_20260927n",
  parentCheckpoint: "d657ef6f20af98c1fd2674d098b0f2906a3abe70",
  maximumAuthorityMs: 2 * 60 * 60_000,
  minimumExecutionRemainderMs: 30 * 60_000,
  exportFreshnessMs: 30 * 60_000,
  limits: Object.freeze({ exportAttempts: 2, deploymentAttempts: 1, promotionAttempts: 1, rollbackAssignments: 1, accountConcurrency: 1, aliasObservationMs: 600_000, retries: 0 }),
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";
const iso = value => new Date(value).toISOString();
const placeholder = value => typeof value !== "string" || !value.trim() || /<[^>]+>|placeholder|todo|replace[_ -]?me/i.test(value);

function exactKeys(value, expected, label) {
  if (JSON.stringify(Object.keys(value || {}).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields differ from the reviewed schema.`);
}

export function validateComprehensiveApproval(input, { now = Date.now() } = {}) {
  exactKeys(input, ["contractVersion", "decision", "approvedForCompleteHostedWorkflow", "environment", "checkId", "runId", "checkpointParent", "sourceCommit", "sourceManifestSha256", "applicationTree", "proposalSha256", "artifactManifestSha256", "archiveSha256", "buildInputContractSha256", "readOnlyAuthorizationText", "readOnlyAuthorizationTextSha256", "authorizationText", "authorizationTextSha256", "issuedAt", "expiresAt", "limits"], "Comprehensive workflow approval");
  if (input.contractVersion !== SINGLE_APPROVAL_WORKFLOW.contractVersion || input.decision !== SINGLE_APPROVAL_WORKFLOW.decision || input.approvedForCompleteHostedWorkflow !== true || input.environment !== "staging") throw new Error("Explicit comprehensive Staging workflow approval is required.");
  if (input.checkId !== SINGLE_APPROVAL_WORKFLOW.checkId || input.runId !== SINGLE_APPROVAL_WORKFLOW.runId || input.checkpointParent !== SINGLE_APPROVAL_WORKFLOW.parentCheckpoint || input.applicationTree !== DIAGNOSTIC_OPERATOR.applicationTree || input.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || input.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || input.buildInputContractSha256 !== DIAGNOSTIC_OPERATOR.buildInputContractSha256) throw new Error("Comprehensive workflow identity mismatch.");
  if (input.proposalSha256 !== SUPPORT.proposalSha256 || !/^[a-f0-9]{40}$/.test(input.sourceCommit || "") || !/^[a-f0-9]{64}$/.test(input.sourceManifestSha256 || "")) throw new Error("Reviewed checkpoint and proposal binding required.");
  if (JSON.stringify(input.limits) !== JSON.stringify(SINGLE_APPROVAL_WORKFLOW.limits)) throw new Error("Comprehensive workflow limits differ from the reviewed contract.");
  if (placeholder(input.readOnlyAuthorizationText) || input.readOnlyAuthorizationTextSha256 !== sha256(Buffer.from(input.readOnlyAuthorizationText)) || !/read-only/i.test(input.readOnlyAuthorizationText) || !/no deployment/i.test(input.readOnlyAuthorizationText) || !input.readOnlyAuthorizationText.includes(input.checkId)) throw new Error("Read-only sub-authorization is invalid.");
  if (placeholder(input.authorizationText) || input.authorizationTextSha256 !== sha256(Buffer.from(input.authorizationText)) || !input.authorizationText.includes(input.runId) || !/exactly one immutable/i.test(input.authorizationText) || !/rollback/i.test(input.authorizationText) || !/earnings remains disabled/i.test(input.authorizationText) || !/one uninterrupted hosted execution/i.test(input.authorizationText)) throw new Error("Comprehensive owner authorization text is invalid.");
  const issued = Date.parse(input.issuedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued !== SINGLE_APPROVAL_WORKFLOW.maximumAuthorityMs || now < issued || now >= expires) throw new Error("Comprehensive authority lifetime is invalid or expired.");
  return input;
}

export function deriveChildAuthorizations(approval, { startedAt }) {
  const started = Date.parse(startedAt), expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(started) || started < Date.parse(approval.issuedAt) || expires - started < SINGLE_APPROVAL_WORKFLOW.minimumExecutionRemainderMs) throw new Error("Insufficient comprehensive authority remains for observation and verified rollback.");
  const readOnly = {
    contractVersion: 1, decision: "AUTHORIZE_READ_ONLY_STAGING_EAS_EXPORT_CHECK", approvedForReadOnlyHostedAccess: true, hostedMutationsAuthorized: false, diagnosticRunAuthorized: false,
    environment: "staging", checkId: approval.checkId, easProjectId: DIAGNOSTIC_OPERATOR.easProjectId, sourceCommit: approval.sourceCommit, sourceManifestSha256: approval.sourceManifestSha256,
    applicationTree: DIAGNOSTIC_OPERATOR.applicationTree, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256,
    authorizationText: approval.readOnlyAuthorizationText, authorizationTextSha256: approval.readOnlyAuthorizationTextSha256, issuedAt: approval.issuedAt, expiresAt: approval.expiresAt,
  };
  const diagnostic = {
    contractVersion: 1, decision: "APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC", approvedForHostedExecution: true, environment: "staging", runId: approval.runId,
    proposalSha256: SUPPORT.proposalSha256, checkpointParent: SUPPORT.baseCheckpoint, sourceCommit: approval.sourceCommit, sourceManifestSha256: approval.sourceManifestSha256,
    applicationTree: SUPPORT.applicationTree, buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256, authorizedActions: [...SUPPORT.actions], authorizedSupportActions: [...SUPPORT.supportActions],
    authorizationText: approval.authorizationText, authorizationTextSha256: approval.authorizationTextSha256, issuedAt: approval.issuedAt, maintenanceWindowStart: iso(started), maintenanceWindowEnd: approval.expiresAt,
  };
  validateReadOnlyEasExportAuthorization(readOnly, { now: started });
  validateOwnerAuthorization(diagnostic);
  return { readOnly, diagnostic };
}

export async function executeWorkflowStateMachine({ operations, clock = { now: () => Date.now() } }) {
  const completed = [];
  let aliasMutationPossible = false;
  const invoke = async name => { const result = await operations[name](); completed.push({ name, result }); return result; };
  try {
    await invoke("readOnlyExports");
    await invoke("verifyFreshness");
    for (const name of ["baseline", "captureRollback", "exportArtifact", "initializeResources", "reserveDeployment", "deploy", "registerDeployment", "verifyImmutable", "qualifyAccounts", "prepareRecapture", "recaptureRollback", "verifyRecapture", "finalPreflight", "confirmRollbackReady"]) await invoke(name);
    aliasMutationPossible = true; await invoke("promote");
    await invoke("observe");
    await invoke("rollback"); aliasMutationPossible = false;
    await invoke("verifyRollback");
    await invoke("finalize");
    return { classification: "PASS", completed, completedAt: iso(clock.now()) };
  } catch (error) {
    const failure = { name: error?.name || "Error", message: String(error?.message || error).slice(0, 500) };
    try { await operations.recordTerminal?.(failure, completed); } catch (terminalError) { completed.push({ name: "recordTerminal", error: String(terminalError?.message || terminalError).slice(0, 500) }); }
    if (aliasMutationPossible) {
      try {
        await operations.rollback(); completed.push({ name: "rollback", result: "RECOVERY" }); aliasMutationPossible = false;
        await operations.verifyRollback(); completed.push({ name: "verifyRollback", result: "RECOVERY" });
      } catch (recoveryError) { completed.push({ name: "recovery", error: String(recoveryError?.message || recoveryError).slice(0, 500) }); }
    }
    try { await operations.finalize?.(failure, completed); } catch (finalizationError) { completed.push({ name: "finalize", error: String(finalizationError?.message || finalizationError).slice(0, 500) }); }
    return { classification: "FAIL", failure, completed, completedAt: iso(clock.now()) };
  }
}

export function createHostedWorkflowOperations({ repoRoot, approval, authorityPath, sourceManifestPath, accountsPath, chromePath, run = runChecked }) {
  const runDirectory = path.join(repoRoot, DIAGNOSTIC_OPERATOR.evidenceRoot, approval.runId);
  const common = [`--environment=staging`, `--authority=${authorityPath}`, `--source-manifest=${sourceManifestPath}`, `--run-id=${approval.runId}`, `--expect-commit=${approval.sourceCommit}`, `--expect-source-sha256=${approval.sourceManifestSha256}`];
  const diagnostic = action => run("node", ["scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs", action, ...common, `--confirm=staging:restaurant-alias-diagnostic:${action}:${approval.runId}`], { cwd: repoRoot });
  const support = (action, extra = []) => run("node", ["scripts/restaurant-alias-diagnostic-execution-support.mjs", action, `--authority=${authorityPath}`, `--source-manifest=${sourceManifestPath}`, `--expect-commit=${approval.sourceCommit}`, `--expect-source-sha256=${approval.sourceManifestSha256}`, `--confirm=staging:restaurant-alias-support:${action}:${approval.runId}`, ...extra], { cwd: repoRoot });
  const qualify = () => run("node", ["scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs", `--environment=staging`, `--authority=${authorityPath}`, `--source-manifest=${sourceManifestPath}`, `--run-id=${approval.runId}`, `--expect-commit=${approval.sourceCommit}`, `--expect-source-sha256=${approval.sourceManifestSha256}`, `--accounts=${accountsPath}`, `--chrome=${chromePath}`, `--confirm=staging:restaurant-alias-diagnostic:qualify-immutable-access:${approval.runId}`], { cwd: repoRoot });
  return {
    baseline: () => support("baseline-preflight"), captureRollback: () => diagnostic("capture-rollback"), exportArtifact: () => diagnostic("export"),
    initializeResources: () => support("initialize-resources"), reserveDeployment: () => support("begin-deployment"), deploy: () => diagnostic("deploy"), registerDeployment: () => support("register-deployment"),
    verifyImmutable: () => diagnostic("verify-immutable"), qualifyAccounts: qualify, prepareRecapture: () => support("prepare-recapture"), recaptureRollback: () => diagnostic("capture-rollback"), verifyRecapture: () => support("verify-recapture"),
    finalPreflight: () => support("final-preflight"), confirmRollbackReady: async () => ({ ready: true, independentlyOperable: true }), promote: () => diagnostic("promote"), observe: () => diagnostic("observe-alias"),
    rollback: () => diagnostic("rollback"), verifyRollback: () => diagnostic("verify-rollback"),
    recordTerminal: failure => support("record-abort", [`--classification=FAIL`, `--reason=${encodeURIComponent(failure.message)}`]),
    finalize: () => {
      support("prepare-expected-alias"); support("prepare-cleanup");
      return support("finalize", [`--expected=${path.join(runDirectory, "expected-final-alias.json")}`, `--cleanup=${path.join(runDirectory, "cleanup-disposition.json")}`]);
    },
  };
}

function writeExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.chmodSync(path.dirname(file), 0o700);
  fs.writeFileSync(file, Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2)), { flag: "wx", mode: 0o600 });
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`Reviewed workflow command failed: ${command} ${args[1] || args[0] || ""}.`);
  return result;
}

export function prepareSingleApprovalExecution({ repoRoot, approval, startedAt = iso(Date.now()) }) {
  validateComprehensiveApproval(approval, { now: Date.parse(startedAt) });
  verifyLocalDiagnosticPrerequisites({ root: repoRoot });
  const children = deriveChildAuthorizations(approval, { startedAt });
  verifyReviewedCandidateCheckpoint({ repoRoot, approval: children.diagnostic });
  const manifest = buildSourceManifest(repoRoot, approval.sourceCommit);
  if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Comprehensive source manifest mismatch.");
  const authorityRoot = path.join(repoRoot, "secure/restaurant-alias-comprehensive-authority");
  const authorityPath = path.join(authorityRoot, `${approval.runId}.json`), manifestPath = path.join(authorityRoot, `${approval.runId}-source-manifest.tsv`);
  const readOnlyAuthorityPath = path.join(repoRoot, "secure/restaurant-alias-export-readiness-authority", `${approval.checkId}.json`);
  const readOnlyManifestPath = path.join(repoRoot, "secure/restaurant-alias-export-readiness-source-manifests", `${approval.sourceCommit}.tsv`);
  for (const file of [authorityPath, manifestPath, readOnlyAuthorityPath, readOnlyManifestPath, path.join(repoRoot, DIAGNOSTIC_OPERATOR.evidenceRoot, approval.runId), path.join(repoRoot, "secure/restaurant-alias-export-readiness", approval.checkId)]) if (fs.existsSync(file)) throw new Error(`Exclusive workflow path already exists: ${path.relative(repoRoot, file)}.`);
  writeExclusive(authorityPath, approval); writeExclusive(manifestPath, manifest.bytes); writeExclusive(readOnlyAuthorityPath, children.readOnly); writeExclusive(readOnlyManifestPath, manifest.bytes);
  return { ...children, manifest, authorityPath, manifestPath, readOnlyAuthorityPath, readOnlyManifestPath };
}

export async function runSingleApprovalWorkflow(argv = process.argv.slice(2)) {
  const values = Object.fromEntries(argv.filter(value => value.startsWith("--") && value.includes("=")).map(value => { const index = value.indexOf("="); return [value.slice(2, index), value.slice(index + 1)]; }));
  const repoRoot = path.resolve(import.meta.dirname, "..");
  if (!values.approval || !values.accounts || !values.chrome || values.confirm !== `staging:restaurant-alias:complete-workflow:${SINGLE_APPROVAL_WORKFLOW.runId}`) throw new Error("Approval, accounts, Chrome, and exact complete-workflow confirmation are required.");
  const approval = JSON.parse(fs.readFileSync(path.resolve(values.approval), "utf8"));
  const prepared = prepareSingleApprovalExecution({ repoRoot, approval });
  const readOnlyOutput = path.join(repoRoot, "secure/restaurant-alias-export-readiness", approval.checkId);
  runChecked("node", ["scripts/verify-restaurant-alias-production-export-readiness.mjs", `--authorization=${prepared.readOnlyAuthorityPath}`, `--source-manifest=${prepared.readOnlyManifestPath}`, `--output=${readOnlyOutput}`, `--confirm=staging:restaurant-alias:read-only-eas-export:${approval.checkId}`], { cwd: repoRoot });
  const readOnlyEvidencePath = path.join(readOnlyOutput, "read-only-eas-export-evidence.json");
  const readOnlyEvidence = JSON.parse(fs.readFileSync(readOnlyEvidencePath, "utf8"));
  verifyReadOnlyEasExportEvidence(readOnlyEvidence, { sourceCommit: approval.sourceCommit, sourceManifestSha256: approval.sourceManifestSha256, now: Date.now(), maximumAgeMs: SINGLE_APPROVAL_WORKFLOW.exportFreshnessMs });
  const derivedAt = iso(Date.now());
  const children = deriveChildAuthorizations(approval, { startedAt: derivedAt });
  const diagnosticApprovalPath = path.join(repoRoot, SUPPORT.authorityDirectory, `${approval.runId}-owner-approval.json`);
  writeExclusive(diagnosticApprovalPath, children.diagnostic);
  runChecked("node", ["scripts/restaurant-alias-diagnostic-execution-support.mjs", "prepare-authority", `--approval=${diagnosticApprovalPath}`, `--export-readiness-evidence=${readOnlyEvidencePath}`, `--output=${path.join(repoRoot, SUPPORT.authorityDirectory)}`], { cwd: repoRoot });
  const authorityPath = path.join(repoRoot, SUPPORT.authorityDirectory, `${approval.runId}-authority.json`);
  const sourceManifestPath = path.join(repoRoot, SUPPORT.authorityDirectory, `${approval.runId}-source-manifest.tsv`);
  const operations = createHostedWorkflowOperations({ repoRoot, approval, authorityPath, sourceManifestPath, accountsPath: path.resolve(values.accounts), chromePath: path.resolve(values.chrome) });
  operations.readOnlyExports = async () => ({ passed: true, evidenceSha256: sha256(fs.readFileSync(readOnlyEvidencePath)) });
  operations.verifyFreshness = async () => verifyReadOnlyEasExportEvidence(readOnlyEvidence, { sourceCommit: approval.sourceCommit, sourceManifestSha256: approval.sourceManifestSha256, now: Date.now(), maximumAgeMs: SINGLE_APPROVAL_WORKFLOW.exportFreshnessMs });
  const terminal = await executeWorkflowStateMachine({ operations });
  return { ...terminal, checkId: approval.checkId, runId: approval.runId, derivedMaintenanceWindowStart: derivedAt, maintenanceWindowEnd: approval.expiresAt, readOnlyEvidenceSha256: sha256(fs.readFileSync(readOnlyEvidencePath)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSingleApprovalWorkflow().then(result => process.stdout.write(canonical(result))).catch(error => { process.stderr.write(canonical({ classification: "ABORTED", error: String(error?.message || error).slice(0, 500) })); process.exitCode = 1; });
}
