#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildSourceManifest, canonical, sha256 } from "./restaurant-vercel-preview-browser-notification-continuation.mjs";
export { sha256 };

export const INSPECTION = Object.freeze({
  schemaVersion: 1,
  kind: "restaurant_vercel_project_protection_read_only_inspection",
  inspectionId: "restaurant-vercel-project-protection-inspection-20260928a",
  projectId: "prj_PrVORzWTAxmAHL0SqNcA9WXJppS4",
  projectName: "hungrie-restaurant-web-staging-eval-20260927a",
  scope: "nurlan-ildirimli-s-projects",
  teamId: "team_799flI3SHCD8C2AXbbQ6NlBX",
  deploymentId: "dpl_8CM3s16BZRwK9Ls1eMMJCVKmWyYt",
  deploymentHostname: "hungrie-restaurant-web-staging-eval-20260927a-h9m8zpwol.vercel.app",
  expectedTarget: "preview",
  expectedReadyState: "READY",
  expectedProtection: "all_except_custom_domains",
  authorityDirectory: "secure/restaurant-vercel-project-protection-inspection-authority",
  evidenceDirectory: "secure/restaurant-vercel-project-protection-inspection/restaurant-vercel-project-protection-inspection-20260928a",
  limits: Object.freeze({ projectGets: 1, deploymentGets: 1, retries: 0, mutations: 0, authorityValidityMs: 2 * 60 * 60 * 1000 }),
  consumedQualification: Object.freeze({
    id: "restaurant-vercel-browser-notification-qualification-20260928f",
    authoritySha256: "bdd9415ee191f025b7e0568340b77af9c7b94a3715131db4aecc51acc744ad10",
    sourceManifestSha256: "794e388e5c2f81927f29df7ea0e143fb2d2405944bbd5872c9bd085e8a7014b8",
    evidenceManifestSha256: "91a91d1d44b431dfa6906b101c262cb45b3e18962462af86c10ff1b3f3ec2de7",
    terminalSha256: "7af1edbebd9ce5034947761d711d0bea4fb6e1819c717e2133392a6e5de73e4b",
  }),
});

const exactKeys = (value, keys, label) => { if (JSON.stringify(Object.keys(value || {}).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields differ from the reviewed schema.`); };
const pathsFor = repoRoot => { const authorityDirectory = path.join(repoRoot, INSPECTION.authorityDirectory); return { authorityDirectory, authorityPath: path.join(authorityDirectory, `${INSPECTION.inspectionId}.json`), sourceManifestPath: path.join(authorityDirectory, `${INSPECTION.inspectionId}-source-manifest.tsv`), evidenceDirectory: path.join(repoRoot, INSPECTION.evidenceDirectory) }; };
const atomic = (target, bytes) => { if (fs.existsSync(target)) throw new Error("Exclusive Vercel inspection file already exists."); const temporary = `${target}.${process.pid}.tmp`; fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" }); fs.renameSync(temporary, target); fs.chmodSync(target, 0o600); };

export function buildAuthorizationText({ sourceCommit, sourceManifestSha256, operatorSha256 }) {
  return `I authorize one strictly read-only Vercel project/protection inspection for inspection ${INSPECTION.inspectionId}, bound to checkpoint ${sourceCommit}, complete source-manifest SHA-256 ${sourceManifestSha256}, and inspection operator SHA-256 ${operatorSha256}. I authorize exactly one authenticated GET of project ${INSPECTION.projectId} and exactly one authenticated GET of immutable deployment ${INSPECTION.deploymentId}, both scoped to ${INSPECTION.scope}, solely to record sanitized project, team, deployment, target, READY-state, Vercel Authentication/protection, Preview Toolbar, and automation-bypass capability metadata needed to diagnose consumed qualification ${INSPECTION.consumedQualification.id}. I authorize zero retries, zero bypass creation or revocation, zero configuration mutation, zero deployment, zero alias or domain action, zero browser or account access, zero Firebase or FCM action, and zero Production mutation. Raw provider bodies, authentication tokens, bypass secrets, environment values, and unrelated configuration must never be persisted. Any authority, checkpoint, executable, project, team, deployment, scope, method, request-count, evidence-path, sanitation, or integrity mismatch must stop without retry. This authorization does not authorize another browser/notification qualification and does not constitute Phase 6 acceptance.`;
}

export function validateApproval(approval, { now = Date.now() } = {}) {
  exactKeys(approval, ["schemaVersion", "kind", "decision", "inspectionId", "issuedAt", "expiresAt", "authorizationText", "authorizationTextSha256", "sourceCommit", "sourceManifestSha256", "operatorSha256", "projectId", "deploymentId", "scope", "evidenceDirectory", "limits"], "Vercel inspection approval");
  if (approval.schemaVersion !== 1 || approval.kind !== INSPECTION.kind || approval.decision !== "APPROVE_READ_ONLY_VERCEL_PROJECT_PROTECTION_INSPECTION" || approval.inspectionId !== INSPECTION.inspectionId) throw new Error("Exact Vercel inspection approval is required.");
  if (!/^[a-f0-9]{40}$/.test(approval.sourceCommit || "")) throw new Error("Inspection checkpoint is invalid.");
  for (const key of ["sourceManifestSha256", "operatorSha256", "authorizationTextSha256"]) if (!/^[a-f0-9]{64}$/.test(approval[key] || "")) throw new Error(`Invalid ${key}.`);
  if (approval.projectId !== INSPECTION.projectId || approval.deploymentId !== INSPECTION.deploymentId || approval.scope !== INSPECTION.scope || approval.evidenceDirectory !== INSPECTION.evidenceDirectory || JSON.stringify(approval.limits) !== JSON.stringify(INSPECTION.limits)) throw new Error("Vercel inspection identity or limits mismatch.");
  const text = buildAuthorizationText(approval); if (approval.authorizationText !== text || sha256(Buffer.from(text)) !== approval.authorizationTextSha256) throw new Error("Vercel inspection authorization text or digest mismatch.");
  const issued = Date.parse(approval.issuedAt), expires = Date.parse(approval.expiresAt); if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires - issued !== INSPECTION.limits.authorityValidityMs || now < issued || now >= expires) throw new Error("Vercel inspection approval is not valid for exactly two hours.");
  return approval;
}

function verifyBindings({ repoRoot, approval, spawn = spawnSync }) {
  const head = spawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }); if (head.status !== 0 || head.stdout.trim() !== approval.sourceCommit) throw new Error("Vercel inspection checkpoint mismatch.");
  const manifest = buildSourceManifest(repoRoot, approval.sourceCommit, spawn); if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Vercel inspection source manifest mismatch.");
  const operator = spawn("git", ["show", `${approval.sourceCommit}:scripts/inspect-restaurant-vercel-project-protection.mjs`], { cwd: repoRoot, encoding: null, maxBuffer: 16 * 1024 * 1024 }); if (operator.status !== 0 || sha256(operator.stdout) !== approval.operatorSha256) throw new Error("Vercel inspection executable mismatch.");
  const consumed = INSPECTION.consumedQualification, authorityRoot = path.join(repoRoot, "secure/restaurant-vercel-browser-notification-qualification-authority"), evidenceRoot = path.join(repoRoot, "secure/restaurant-vercel-browser-notification-qualification", consumed.id);
  const checked = [[path.join(authorityRoot, `${consumed.id}.json`), consumed.authoritySha256], [path.join(authorityRoot, `${consumed.id}-source-manifest.tsv`), consumed.sourceManifestSha256], [path.join(evidenceRoot, "evidence-manifest.tsv"), consumed.evidenceManifestSha256], [path.join(evidenceRoot, "terminal-result.json"), consumed.terminalSha256]];
  for (const [file, expected] of checked) if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== expected) throw new Error("Consumed qualification-F evidence changed.");
  return { manifest };
}

export function prepareAuthority({ repoRoot, approval, now = Date.now(), spawn = spawnSync }) {
  validateApproval(approval, { now }); const verified = verifyBindings({ repoRoot, approval, spawn }), paths = pathsFor(repoRoot); for (const target of [paths.authorityPath, paths.sourceManifestPath, paths.evidenceDirectory]) if (fs.existsSync(target)) throw new Error("Exclusive Vercel inspection path already exists.");
  fs.mkdirSync(paths.authorityDirectory, { recursive: true, mode: 0o700 }); fs.chmodSync(paths.authorityDirectory, 0o700); const authority = { ...approval, ownerApprovalSha256: sha256(Buffer.from(canonical(approval))) }; atomic(paths.authorityPath, Buffer.from(canonical(authority))); atomic(paths.sourceManifestPath, verified.manifest.bytes); return { authorityPath: paths.authorityPath, sourceManifestPath: paths.sourceManifestPath, authoritySha256: sha256(fs.readFileSync(paths.authorityPath)) };
}

function validatePrepared({ repoRoot, now = Date.now(), spawn = spawnSync }) {
  const paths = pathsFor(repoRoot); if (!fs.existsSync(paths.authorityPath) || !fs.existsSync(paths.sourceManifestPath) || fs.existsSync(paths.evidenceDirectory)) throw new Error("Prepared Vercel inspection authority or exclusive path is invalid.");
  const authority = JSON.parse(fs.readFileSync(paths.authorityPath, "utf8")), approval = { ...authority }; delete approval.ownerApprovalSha256; validateApproval(approval, { now }); if (authority.ownerApprovalSha256 !== sha256(Buffer.from(canonical(approval)))) throw new Error("Vercel inspection owner-approval digest mismatch."); const verified = verifyBindings({ repoRoot, approval, spawn }); const manifest = fs.readFileSync(paths.sourceManifestPath); if (!manifest.equals(verified.manifest.bytes) || sha256(manifest) !== approval.sourceManifestSha256) throw new Error("Prepared Vercel inspection source manifest mismatch."); return { paths };
}

const safeKeys = value => value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().slice(0, 200) : [];
export function sanitizeProjectResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { schema: "MALFORMED", topLevelKeys: safeKeys(payload) };
  const p = payload.project && typeof payload.project === "object" && !Array.isArray(payload.project) ? payload.project : payload;
  const bypass = p.protectionBypass;
  return { schema: payload.project ? "WRAPPED_PROJECT" : "DIRECT_PROJECT", topLevelKeys: safeKeys(payload), projectKeys: safeKeys(p), id: typeof p.id === "string" ? p.id : null, name: typeof p.name === "string" ? p.name : null, accountId: typeof p.accountId === "string" ? p.accountId : null, teamId: typeof p.teamId === "string" ? p.teamId : null, previewToolbar: typeof p.enablePreviewFeedback === "boolean" ? p.enablePreviewFeedback : null, protectionType: typeof p.ssoProtection?.deploymentType === "string" ? p.ssoProtection.deploymentType : null, protectionKeys: safeKeys(p.ssoProtection), automationBypassRepresentation: bypass && typeof bypass === "object" && !Array.isArray(bypass) ? "OBJECT" : bypass === undefined ? "ABSENT" : Array.isArray(bypass) ? "ARRAY" : typeof bypass, automationBypassCount: bypass && typeof bypass === "object" && !Array.isArray(bypass) ? Object.keys(bypass).length : null };
}
export function sanitizeDeploymentResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { schema: "MALFORMED", topLevelKeys: safeKeys(payload) };
  const d = payload.deployment && typeof payload.deployment === "object" && !Array.isArray(payload.deployment) ? payload.deployment : payload;
  return { schema: payload.deployment ? "WRAPPED_DEPLOYMENT" : "DIRECT_DEPLOYMENT", topLevelKeys: safeKeys(payload), deploymentKeys: safeKeys(d), id: typeof d.id === "string" ? d.id : null, name: typeof d.name === "string" ? d.name : null, projectId: typeof d.projectId === "string" ? d.projectId : null, teamId: typeof d.teamId === "string" ? d.teamId : null, target: typeof d.target === "string" || d.target === null ? d.target : null, readyState: typeof d.readyState === "string" ? d.readyState : null, url: typeof d.url === "string" ? d.url : null };
}

export function classifyInspection(project, deployment) {
  const assertions = [
    ["project.id", INSPECTION.projectId, project.id], ["project.name", INSPECTION.projectName, project.name], ["project.accountId", INSPECTION.teamId, project.accountId],
    ["project.previewToolbar", false, project.previewToolbar], ["project.protectionType", INSPECTION.expectedProtection, project.protectionType], ["project.automationBypassRepresentation", "OBJECT", project.automationBypassRepresentation],
    ["deployment.id", INSPECTION.deploymentId, deployment.id], ["deployment.name", INSPECTION.projectName, deployment.name], ["deployment.target", INSPECTION.expectedTarget, deployment.target], ["deployment.readyState", INSPECTION.expectedReadyState, deployment.readyState], ["deployment.url", INSPECTION.deploymentHostname, deployment.url],
  ].map(([field, expected, observed]) => ({ field, expected, observed, passed: observed === expected }));
  const firstFailure = assertions.find(row => !row.passed) || null;
  let classification = "PASS_REVIEWED_STATE";
  if (firstFailure) {
    if (["project.id", "project.name", "project.accountId"].includes(firstFailure.field)) classification = firstFailure.observed == null ? "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE" : "REAL_WRONG_PROJECT_OR_SCOPE";
    else if (["deployment.id", "deployment.name", "deployment.url"].includes(firstFailure.field)) classification = firstFailure.observed == null ? "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE" : "REAL_DEPLOYMENT_IDENTITY_DRIFT";
    else if (["deployment.target", "deployment.readyState"].includes(firstFailure.field)) classification = firstFailure.observed == null ? "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE" : "REAL_DEPLOYMENT_IDENTITY_DRIFT";
    else if (["project.previewToolbar", "project.protectionType"].includes(firstFailure.field)) classification = firstFailure.observed == null ? "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE" : "REAL_PROTECTION_STATE_DRIFT";
    else classification = "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE";
  }
  return { classification, firstFailure, assertions };
}

export function buildReadRequest(resource) {
  if (!['project', 'deployment'].includes(resource)) throw new Error('Unexpected Vercel inspection resource.');
  const endpoint = resource === "project" ? `/v9/projects/${INSPECTION.projectId}` : `/v13/deployments/${INSPECTION.deploymentId}`;
  return { command: 'npx', args: ["--yes", "vercel@60.1.3", "api", endpoint, "--raw", "--scope", INSPECTION.scope, "--local-config", "apps/restaurant/vercel.json"], method: 'GET', body: null };
}

function cliTransport({ repoRoot, resource }) {
  const request = buildReadRequest(resource);
  const result = spawnSync(request.command, request.args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) { const stderr = Buffer.from(result.stderr || ""); throw Object.assign(new Error("Authenticated Vercel read failed."), { safe: { exitCode: result.status, stderrBytes: stderr.length, stderrSha256: sha256(stderr) } }); }
  try { return JSON.parse(result.stdout); } catch { const stdout = Buffer.from(result.stdout || ""); throw Object.assign(new Error("Vercel read returned malformed JSON."), { safe: { exitCode: 0, stdoutBytes: stdout.length, stdoutSha256: sha256(stdout) } }); }
}

function writeManifest(directory) { const names = fs.readdirSync(directory).filter(name => name !== "evidence-manifest.tsv").sort(); const bytes = Buffer.from(`path\tbytes\tsha256\n${names.map(name => { const value = fs.readFileSync(path.join(directory, name)); return `${name}\t${value.length}\t${sha256(value)}`; }).join("\n")}\n`); atomic(path.join(directory, "evidence-manifest.tsv"), bytes); return sha256(bytes); }

export async function collectInspection({ repoRoot, transport = cliTransport, clock = () => new Date().toISOString() }) {
  let projectGets = 0, deploymentGets = 0;
  try {
    projectGets += 1; const projectRaw = await transport({ repoRoot, resource: "project" }); deploymentGets += 1; const deploymentRaw = await transport({ repoRoot, resource: "deployment" });
    const project = sanitizeProjectResponse(projectRaw), deployment = sanitizeDeploymentResponse(deploymentRaw), decision = classifyInspection(project, deployment); const evidence = { schemaVersion: 1, inspectionId: INSPECTION.inspectionId, capturedAt: clock(), requestedScope: INSPECTION.scope, project, deployment, ...decision, projectGets, deploymentGets, retries: 0, mutations: 0, rawBodiesPersisted: false, credentialsPersisted: false }; const terminal = { schemaVersion: 1, inspectionId: INSPECTION.inspectionId, completedAt: clock(), classification: decision.classification, projectGets, deploymentGets, retries: 0, mutations: 0, retryEligible: false }; return { evidence, terminal };
  } catch (error) {
    const terminal = { schemaVersion: 1, inspectionId: INSPECTION.inspectionId, completedAt: clock(), classification: "INSPECTION_READ_FAILED", failure: error.safe || { category: "LOCAL_OPERATOR_FAILURE" }, projectGets, deploymentGets, retries: 0, mutations: 0, retryEligible: false }; return { evidence: null, terminal };
  }
}

export async function executeInspection({ repoRoot, now = Date.now(), spawn = spawnSync, transport = cliTransport }) {
  const prepared = validatePrepared({ repoRoot, now, spawn }), directory = prepared.paths.evidenceDirectory; fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 }); fs.mkdirSync(directory, { mode: 0o700 }); fs.chmodSync(directory, 0o700);
  const result = await collectInspection({ repoRoot, transport });
  if (result.evidence) atomic(path.join(directory, "inspection.json"), Buffer.from(canonical(result.evidence)));
  atomic(path.join(directory, "terminal-result.json"), Buffer.from(canonical(result.terminal)));
  return { terminal: result.terminal, evidenceManifestSha256: writeManifest(directory) };
}

async function main(argv = process.argv.slice(2)) { const values = Object.fromEntries(argv.filter(value => value.startsWith("--") && value.includes("=")).map(value => { const index = value.indexOf("="); return [value.slice(2, index), value.slice(index + 1)]; })); const repoRoot = path.resolve(import.meta.dirname, ".."); if (argv.includes("--prepare-authority")) { if (!values.approval) throw new Error("Approval path required."); process.stdout.write(`${JSON.stringify(prepareAuthority({ repoRoot, approval: JSON.parse(fs.readFileSync(path.resolve(values.approval), "utf8")) }))}\n`); return; } if (values.execute === "true") { if (values.confirm !== "execute-one-read-only-vercel-project-protection-inspection") throw new Error("Action-specific confirmation mismatch."); process.stdout.write(`${JSON.stringify(await executeInspection({ repoRoot }))}\n`); return; } throw new Error("No Vercel inspection action selected."); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
