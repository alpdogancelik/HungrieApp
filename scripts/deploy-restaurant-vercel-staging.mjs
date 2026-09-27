#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateStagingPublicBuildInputs } from "./restaurant-alias-staging-public-build-inputs.mjs";

export const VERCEL_STAGING_DEPLOYMENT = Object.freeze({
  actionId: "restaurant-vercel-staging-evaluation-20260927d",
  consumedActionId: "restaurant-vercel-staging-evaluation-20260927c",
  previousActionId: "restaurant-vercel-staging-evaluation-20260927b",
  originalActionId: "restaurant-vercel-staging-evaluation-20260927a",
  project: "hungrie-restaurant-web-staging-eval-20260927a",
  scope: "nurlan-ildirimli-s-projects",
  account: "nurlanildirimli00-3449",
  cliVersion: "60.1.3",
  confirmation: "continue-fully-verified-restaurant-vercel-staging-preview",
  environment: "preview",
  artifactManifestSha256: "d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89",
  archiveSha256: "b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862",
  buildInputContractSha256: "f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e",
  originalProgressSha256: "eef7fea0705809035b4ace7c49c1a366512280397e42068c9a7fef4fe6b8297c",
  previousProgressSha256: "94709e5228f9233fb2f7c14a124273591f38f070ee5df5731b172ed11e6d43d5",
  previousManifestSha256: "64f47c26808d6a6594d74adfe4c2ac29ddd5b3e60df3f0a4bd869c3c52143aff",
  consumedProgressSha256: "0f34c3dd73db0ddb8493ba60cf17a9cb3eeca8df03814115c02af6c75733632f",
  consumedManifestSha256: "2a9bd1a393eff2a2a97e5984299c876d80d0e5acbb3449f943b2c2f8cc5b46bc",
  linkedOrgIdSha256: "8928fd7f108505fa35d1906b2926cbee6c4f240bc029a715ff25b5c498407951",
  linkedProjectIdSha256: "b4845746ef4b9dc3a66dd84b7de8e4f57814f1273bf137c244614e9141d04a8f",
  expectedVariables: [
    "EXPO_PUBLIC_FIREBASE_API_KEY", "EXPO_PUBLIC_FIREBASE_APP_ID", "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "EXPO_PUBLIC_FIREBASE_PROJECT_ID", "EXPO_PUBLIC_FIREBASE_VAPID_KEY",
    "EXPO_PUBLIC_RESTAURANT_POLL_MS", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_SUPABASE_URL",
  ],
});

const root = path.resolve(import.meta.dirname, "..");
const localConfig = "apps/restaurant/vercel.json";
const secureInputPath = path.join(root, "secure/restaurant-alias-build-inputs/staging-preview.json");
const evidenceParent = path.join(root, "secure/restaurant-vercel-staging-deployment");
const evidenceRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.actionId);
const consumedRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.consumedActionId);
const previousRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.previousActionId);
const originalRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.originalActionId);
const linkPath = path.join(root, ".vercel/project.json");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const options = Object.fromEntries(process.argv.slice(2).filter(value => value.startsWith("--") && value.includes("=")).map(value => { const i = value.indexOf("="); return [value.slice(2, i), value.slice(i + 1)]; }));

function safeResult(result, includeTail = true) {
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  const sanitized = combined.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").replace(/(?:token|password|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]");
  return { status: result.status, outputSha256: sha256(combined), tail: result.status !== 0 && includeTail ? sanitized.slice(-1000) : undefined };
}

function runVercel(args, input) {
  const prohibited = new Set(["alias", "promote", "domains", "domain", "rollback", "remove"]);
  if (args.includes("--prod") || args.some(value => prohibited.has(value))) throw new Error("Production, alias, domain, rollback, and removal actions are prohibited.");
  return spawnSync("npx", ["--yes", `vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion}`, ...args, "--local-config", localConfig], { cwd: root, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

export function classifyReviewedVariables(names) {
  if (JSON.stringify(names) !== JSON.stringify(VERCEL_STAGING_DEPLOYMENT.expectedVariables)) throw new Error("Reviewed Preview variable inventory mismatch.");
  return names.map(name => {
    if (!name.startsWith("EXPO_PUBLIC_")) throw new Error(`Unreviewed server-side value classification: ${name}.`);
    return { name, target: "preview", type: "config", browserVisible: true };
  });
}

export function validateConsumedProgress(progress, bytes) {
  if (sha256(bytes) !== VERCEL_STAGING_DEPLOYMENT.consumedProgressSha256) throw new Error("Consumed attempt evidence hash mismatch.");
  if (progress?.actionId !== VERCEL_STAGING_DEPLOYMENT.consumedActionId || progress?.scope !== VERCEL_STAGING_DEPLOYMENT.scope || progress?.project !== VERCEL_STAGING_DEPLOYMENT.project || progress?.environment !== "preview") throw new Error("Consumed attempt identity mismatch.");
  if (progress?.continuationOf !== VERCEL_STAGING_DEPLOYMENT.previousActionId || progress?.schemaVersion !== 2 || progress?.terminal !== "FAIL" || progress?.error !== "Reviewed local value fingerprint mismatch: EXPO_PUBLIC_FIREBASE_API_KEY.") throw new Error("Consumed continuation terminal state mismatch.");
  const expected = ["verify-authenticated-account", "verify-scope-organization-mapping", "verify-existing-project", "inspect-preview-environment"];
  if (!Array.isArray(progress.steps) || progress.steps.length !== expected.length || progress.steps.some((step, index) => step?.action !== expected[index] || step?.status !== 0)) throw new Error("Consumed continuation progress is not the reviewed read-only state.");
  if (progress.steps.some(step => /reconcile|deploy-preview/.test(step.action))) throw new Error("Consumed continuation contains an unexpected environment mutation or deployment action.");
  return { completedProjectCreationInOriginalAttempt: true, successfulEnvironmentWrites: 0, deploymentCommands: 0 };
}

export function validateLocalProjectLink(link) {
  if (link?.projectName !== VERCEL_STAGING_DEPLOYMENT.project) throw new Error("Local Vercel project link name mismatch.");
  if (sha256(String(link?.orgId || "")) !== VERCEL_STAGING_DEPLOYMENT.linkedOrgIdSha256 || sha256(String(link?.projectId || "")) !== VERCEL_STAGING_DEPLOYMENT.linkedProjectIdSha256) throw new Error("Local Vercel project link identity mismatch.");
  return true;
}

export function validateRemoteProject(remote, link) {
  const project = remote?.project || remote;
  if (project?.name !== VERCEL_STAGING_DEPLOYMENT.project || project?.id !== link.projectId) throw new Error("Remote Vercel project identity mismatch.");
  if (!project?.owner || typeof project.owner.name !== "string" || !project.owner.name || project.owner.slug !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("Remote Vercel project owner scope mismatch.");
  if (["accountId", "orgId", "teamId"].some(key => key in project && project[key] !== link.orgId)) throw new Error("Remote Vercel project returned a conflicting opaque scope identity.");
  if (![null, undefined, "", "npm --workspace @hungrie/restaurant run export:web"].includes(project?.buildCommand) || ![null, undefined, "", "apps/restaurant/dist"].includes(project?.outputDirectory) || ![null, undefined, ""].includes(project?.rootDirectory)) throw new Error("Remote Vercel project configuration conflicts with the reviewed local configuration.");
  return true;
}

export function validateAuthenticatedAccount(payload) {
  const username = typeof payload === "string" ? payload.trim() : payload?.username;
  if (username !== VERCEL_STAGING_DEPLOYMENT.account) throw new Error("Authenticated Vercel account mismatch.");
  return true;
}

export function validateTeamInventory(payload, link) {
  const teams = Array.isArray(payload) ? payload : payload?.teams;
  if (!Array.isArray(teams)) throw new Error("Vercel team inventory response was malformed.");
  const matches = teams.filter(team => team?.slug === VERCEL_STAGING_DEPLOYMENT.scope);
  if (matches.length !== 1) throw new Error("Approved Vercel scope is missing or ambiguous.");
  const team = matches[0];
  if (typeof team.name !== "string" || !team.name || team.id !== link.orgId) throw new Error("Approved Vercel scope does not map to the locally linked organization.");
  return true;
}

export function normalizeEnvironmentInventory(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.envs || payload?.environmentVariables;
  if (!Array.isArray(rows)) throw new Error("Vercel Preview environment inventory response was malformed.");
  return rows.map(row => ({ name: row?.key || row?.name, type: row?.type, targets: Array.isArray(row?.target) ? row.target : Array.isArray(row?.targets) ? row.targets : row?.target ? [row.target] : [], value: row?.value }));
}

export function validateBuildInputObservations(observations) {
  if (!Array.isArray(observations) || observations.length !== VERCEL_STAGING_DEPLOYMENT.expectedVariables.length) throw new Error("Build-input observation set is incomplete.");
  for (const [index, row] of observations.entries()) {
    const keys = Object.keys(row || {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["name", "passed", "sha256", "utf8Bytes"])) throw new Error("Build-input observation schema mismatch.");
    if (row.name !== VERCEL_STAGING_DEPLOYMENT.expectedVariables[index] || row.passed !== true || !Number.isSafeInteger(row.utf8Bytes) || row.utf8Bytes < 1 || !/^[a-f0-9]{64}$/.test(row.sha256 || "")) throw new Error(`Build-input observation is invalid: ${row.name || "unknown"}.`);
  }
  return observations;
}

export function planEnvironmentReconciliation(payload, observations, values) {
  validateBuildInputObservations(observations);
  const reviewed = classifyReviewedVariables(observations.map(row => row.name));
  const rows = normalizeEnvironmentInventory(payload);
  const actions = [];
  for (const expected of reviewed) {
    const matches = rows.filter(row => row.name === expected.name && row.targets.includes("preview"));
    if (matches.length > 1) throw new Error(`Duplicate Preview variable identity: ${expected.name}.`);
    const actual = matches[0];
    const value = String(values[expected.name]);
    const observation = observations.find(row => row.name === expected.name);
    if (sha256(value) !== observation.sha256 || Buffer.byteLength(value, "utf8") !== observation.utf8Bytes) throw new Error(`Reviewed local value fingerprint mismatch: ${expected.name}.`);
    if (!actual) actions.push({ action: "add", name: expected.name, type: "config" });
    else if (["config", "plain", "encrypted"].includes(actual.type) && typeof actual.value === "string" && sha256(actual.value) === observation.sha256 && Buffer.byteLength(actual.value, "utf8") === observation.utf8Bytes) actions.push({ action: "skip", name: expected.name, type: "config" });
    else actions.push({ action: "replace", name: expected.name, type: "config" });
  }
  if (rows.some(row => row.targets.includes("preview") && !VERCEL_STAGING_DEPLOYMENT.expectedVariables.includes(row.name))) throw new Error("Unexpected Preview environment variable inventory; automatic deletion is prohibited.");
  return actions;
}

export function environmentMutationArgs(name, scope) {
  if (!VERCEL_STAGING_DEPLOYMENT.expectedVariables.includes(name) || scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("Environment mutation command identity mismatch.");
  return ["env", "add", name, "preview", "--force", "--type", "config", "--scope", scope];
}

export function previewDeploymentArgs(scope) {
  if (scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("Deployment command scope mismatch.");
  return ["deploy", "--yes", "--archive=tgz", "--scope", scope];
}

export function evidenceManifestBytes(progressBytes) {
  return Buffer.from(`path\tbytes\tsha256\nprogress.json\t${progressBytes.length}\t${sha256(progressBytes)}\n`);
}

export function finalizeEvidence(evidenceDirectory) {
  const progressPath = path.join(evidenceDirectory, "progress.json");
  const bytes = fs.readFileSync(progressPath);
  const manifest = evidenceManifestBytes(bytes);
  fs.writeFileSync(path.join(evidenceDirectory, "evidence-manifest.tsv"), manifest, { mode: 0o600 });
  return { progressSha256: sha256(bytes), manifestSha256: sha256(manifest) };
}

export function evaluateContinuationDecisionPath({ scope, link, account, teams, project, inventory, observations, values }) {
  deploymentPlan(scope);
  validateLocalProjectLink(link);
  validateAuthenticatedAccount(account);
  validateTeamInventory(teams, link);
  validateRemoteProject(project, link);
  const actions = planEnvironmentReconciliation(inventory, observations, values);
  const commands = actions.filter(row => row.action !== "skip").map(row => environmentMutationArgs(row.name, scope));
  const reconciled = VERCEL_STAGING_DEPLOYMENT.expectedVariables.map(name => ({ key: name, type: "encrypted", target: ["preview"], value: String(values[name]) }));
  if (planEnvironmentReconciliation({ envs: reconciled }, observations, values).some(row => row.action !== "skip")) throw new Error("Dry-run environment reconciliation did not converge.");
  return { terminal: "DRY_RUN_READY", actions, environmentCommands: commands, deploymentCommand: previewDeploymentArgs(scope), networkRequests: 0, mutations: 0, evidenceDirectoriesCreated: 0 };
}

export function deploymentPlan(scope) {
  if (scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("The exact reviewed Vercel scope is required.");
  return [
    { action: "verify-consumed-attempt-and-local-link", hosted: false },
    { action: "verify-authenticated-account", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} whoami --json --local-config ${localConfig}` },
    { action: "verify-scope-to-organization-mapping", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} teams ls --json --local-config ${localConfig}` },
    { action: "inspect-existing-project", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} project inspect ${VERCEL_STAGING_DEPLOYMENT.project} --json --scope ${scope} --local-config ${localConfig}` },
    { action: "inspect-and-reconcile-nine-preview-config-values", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} env ls preview --json --scope ${scope} --local-config ${localConfig}`, valuesPrinted: false },
    { action: "deploy-preview-once", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} deploy --yes --archive=tgz --scope ${scope} --local-config ${localConfig}` },
  ];
}

function parseJsonOutput(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed.`);
  try { return JSON.parse(result.stdout); } catch { throw new Error(`${label} returned malformed JSON.`); }
}

async function main() {
  const scope = options.scope;
  const plan = deploymentPlan(scope);
  if (options.execute !== "true") return process.stdout.write(canonical({ executable: false, approvalRequired: true, action: VERCEL_STAGING_DEPLOYMENT, plan }));
  if (options.confirm !== VERCEL_STAGING_DEPLOYMENT.confirmation) throw new Error("Exact continuation confirmation is required.");
  if (fs.existsSync(evidenceRoot)) throw new Error("The exclusive continuation evidence path already exists; retry is prohibited.");

  const consumedBytes = fs.readFileSync(path.join(consumedRoot, "progress.json"));
  validateConsumedProgress(JSON.parse(consumedBytes), consumedBytes);
  if (sha256(fs.readFileSync(path.join(consumedRoot, "evidence-manifest.tsv"))) !== VERCEL_STAGING_DEPLOYMENT.consumedManifestSha256) throw new Error("Consumed continuation evidence manifest mismatch.");
  if (sha256(fs.readFileSync(path.join(previousRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.previousProgressSha256 || sha256(fs.readFileSync(path.join(previousRoot, "evidence-manifest.tsv"))) !== VERCEL_STAGING_DEPLOYMENT.previousManifestSha256) throw new Error("Previous continuation evidence mismatch.");
  if (sha256(fs.readFileSync(path.join(originalRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.originalProgressSha256) throw new Error("Original attempt evidence mismatch.");
  const link = JSON.parse(fs.readFileSync(linkPath, "utf8"));
  validateLocalProjectLink(link);
  const stat = fs.statSync(secureInputPath);
  if ((stat.mode & 0o077) !== 0) throw new Error("The reviewed build-input file must be mode 0600 or stricter.");
  const secure = JSON.parse(fs.readFileSync(secureInputPath, "utf8"));
  const validation = validateStagingPublicBuildInputs({ root, environment: { ...process.env, ...secure.values } });
  if (validation.contractSha256 !== VERCEL_STAGING_DEPLOYMENT.buildInputContractSha256) throw new Error("Reviewed Vercel Preview build-input contract mismatch.");
  classifyReviewedVariables(validation.observations.map(row => row.name));

  const localReport = path.join(root, "docs/restaurant-vercel-staging-local-qualification.json");
  const qualified = spawnSync("node", ["scripts/qualify-restaurant-vercel-staging-local.mjs", `--output=${localReport}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (qualified.status !== 0) throw new Error("Mandatory local Vercel qualification failed.");
  const report = JSON.parse(fs.readFileSync(localReport, "utf8"));
  if (!report.passed || report.acceptedArtifact.manifestSha256 !== VERCEL_STAGING_DEPLOYMENT.artifactManifestSha256 || report.acceptedArtifact.archiveSha256 !== VERCEL_STAGING_DEPLOYMENT.archiveSha256) throw new Error("Local artifact qualification identity mismatch.");

  fs.mkdirSync(evidenceParent, { recursive: true, mode: 0o700 });
  fs.mkdirSync(evidenceRoot, { recursive: false, mode: 0o700 });
  const progressPath = path.join(evidenceRoot, "progress.json");
  const progress = { schemaVersion: 2, actionId: VERCEL_STAGING_DEPLOYMENT.actionId, continuationOf: VERCEL_STAGING_DEPLOYMENT.consumedActionId, startedAt: new Date().toISOString(), scope, account: VERCEL_STAGING_DEPLOYMENT.account, project: VERCEL_STAGING_DEPLOYMENT.project, environment: "preview", limits: { projectCreates: 0, deployments: 1, productionDeployments: 0, aliasAssignments: 0, retries: 0 }, steps: [], credentialsPersisted: false };
  const persist = () => fs.writeFileSync(progressPath, canonical(progress), { mode: 0o600 });
  persist();
  try {
    const account = runVercel(["whoami", "--json"]);
    progress.steps.push({ action: "verify-authenticated-account", completedAt: new Date().toISOString(), ...safeResult(account) }); persist();
    validateAuthenticatedAccount(parseJsonOutput(account, "Authenticated Vercel account"));
    const teams = runVercel(["teams", "ls", "--json"]);
    progress.steps.push({ action: "verify-scope-organization-mapping", completedAt: new Date().toISOString(), ...safeResult(teams) }); persist();
    validateTeamInventory(parseJsonOutput(teams, "Vercel team inventory"), link);
    const inspected = runVercel(["project", "inspect", VERCEL_STAGING_DEPLOYMENT.project, "--json", "--scope", scope]);
    progress.steps.push({ action: "verify-existing-project", completedAt: new Date().toISOString(), ...safeResult(inspected) }); persist();
    validateRemoteProject(parseJsonOutput(inspected, "Existing Vercel project inspection"), link);
    const listed = runVercel(["env", "ls", "preview", "--json", "--scope", scope]);
    progress.steps.push({ action: "inspect-preview-environment", completedAt: new Date().toISOString(), ...safeResult(listed, false) }); persist();
    const actions = planEnvironmentReconciliation(parseJsonOutput(listed, "Preview environment inventory"), validation.observations, secure.values);
    for (const action of actions) {
      if (action.action === "skip") {
        progress.steps.push({ action: "reconcile-preview-build-input", disposition: "already-exact", name: action.name, type: "config", completedAt: new Date().toISOString(), status: 0 }); persist();
      } else {
        const added = runVercel(environmentMutationArgs(action.name, scope), `${secure.values[action.name]}\n`);
        progress.steps.push({ action: "reconcile-preview-build-input", disposition: action.action, name: action.name, type: "config", completedAt: new Date().toISOString(), ...safeResult(added, false) }); persist();
        if (added.status !== 0) throw new Error(`Vercel Preview config input could not be reconciled: ${action.name}.`);
      }
    }
    const verified = runVercel(["env", "ls", "preview", "--json", "--scope", scope]);
    progress.steps.push({ action: "verify-preview-environment", completedAt: new Date().toISOString(), ...safeResult(verified, false) }); persist();
    if (planEnvironmentReconciliation(parseJsonOutput(verified, "Verified Preview environment inventory"), validation.observations, secure.values).some(row => row.action !== "skip")) throw new Error("Preview environment reconciliation did not converge to the exact reviewed values.");
    const deployed = runVercel(previewDeploymentArgs(scope));
    const deploymentUrl = deployed.status === 0 ? String(deployed.stdout || "").trim().split(/\s+/).at(-1) : null;
    progress.steps.push({ action: "deploy-preview-once", completedAt: new Date().toISOString(), deploymentUrl, ...safeResult(deployed) });
    progress.completedAt = new Date().toISOString(); progress.terminal = deployed.status === 0 ? "DEPLOYED_PENDING_HOSTED_QUALIFICATION" : "FAIL"; persist();
    if (deployed.status !== 0) throw new Error("The single Vercel Preview deployment attempt failed.");
    process.stdout.write(canonical({ terminal: progress.terminal, deploymentUrl, evidenceRoot }));
  } catch (error) {
    progress.completedAt = new Date().toISOString(); progress.terminal = "FAIL"; progress.error = String(error?.message || error).slice(0, 500); persist(); throw error;
  } finally {
    finalizeEvidence(evidenceRoot);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(canonical({ terminal: "FAIL", error: String(error?.message || error).slice(0, 500) })); process.exitCode = 1; });
