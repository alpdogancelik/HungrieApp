#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateStagingPublicBuildInputs } from "./restaurant-alias-staging-public-build-inputs.mjs";
import { VERCEL_STAGING_ARTIFACT } from "./restaurant-vercel-staging-artifact-contract.mjs";

export const VERCEL_STAGING_DEPLOYMENT = Object.freeze({
  actionId: "restaurant-vercel-staging-evaluation-20260928i",
  consumedActionId: "restaurant-vercel-staging-evaluation-20260928h",
  previousActionId: "restaurant-vercel-staging-evaluation-20260928g",
  priorActionId: "restaurant-vercel-staging-evaluation-20260927f",
  earlierActionId: "restaurant-vercel-staging-evaluation-20260927e",
  legacyActionId: "restaurant-vercel-staging-evaluation-20260927d",
  predecessorActionId: "restaurant-vercel-staging-evaluation-20260927c",
  originalActionId: "restaurant-vercel-staging-evaluation-20260927a",
  containmentRecordId: "restaurant-vercel-unexpected-production-alias-containment-20260928a",
  project: "hungrie-restaurant-web-staging-eval-20260927a",
  scope: "nurlan-ildirimli-s-projects",
  account: "nurlanildirimli00-3449",
  cliVersion: "60.1.3",
  confirmation: "continue-explicit-preview-target-restaurant-vercel-preview",
  environment: "preview",
  artifactManifestSha256: VERCEL_STAGING_ARTIFACT.artifactManifestSha256,
  archiveSha256: VERCEL_STAGING_ARTIFACT.archiveSha256,
  buildInputContractSha256: "f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e",
  originalProgressSha256: "eef7fea0705809035b4ace7c49c1a366512280397e42068c9a7fef4fe6b8297c",
  predecessorProgressSha256: "0f34c3dd73db0ddb8493ba60cf17a9cb3eeca8df03814115c02af6c75733632f",
  predecessorManifestSha256: "2a9bd1a393eff2a2a97e5984299c876d80d0e5acbb3449f943b2c2f8cc5b46bc",
  legacyProgressSha256: "6f85a5c61f8973d6d739b429575185696b41733af4e24d808893618625c67cab",
  legacyManifestSha256: "87cab7e473a3be51108b0062f34349cdb647c5f02ec5312bebd3dbbd668a4a66",
  earlierProgressSha256: "d738b62419514f3e079477a29f745c215ad01362498819963371705955b515ef",
  earlierManifestSha256: "1a96c5b712e6b4fe5a49ef969638c18c716931ea2ff0f80312382cb0c07068c9",
  priorProgressSha256: "1a81de2f712d54c0b262c7f651b5671e05d84b3e69ef39c4576cdd80c6082558",
  priorManifestSha256: "47ee7b605f13f46d0363fc89198757982082f02087e5472b9f29684d927fa721",
  previousProgressSha256: "674b6f14bb5ca2eae20ef16fa927a0660d06593fb35c890fd00fb99cc08482f8",
  previousManifestSha256: "0b1206849a0fa03fd88d493dbabbc9dad41b1daf81a3611cce9a606ed4477c80",
  consumedProgressSha256: "efd709491813dff93c4af70c23e5bb6244c586eb44435e0942bbe1ac00156f00",
  consumedManifestSha256: "4a32ed8d41e3a6e41f1a504216e69fb9ece5d79175841fbf945f448d7990e052",
  containmentProgressSha256: "443dc2be27f76f96a62f050f80dcea60c1087534b46ba23167bf869d5a4a24d3",
  containmentResultSha256: "028b4180df2e93df358eb4cdf379ad12fe99b81e8d1513701dda98a9c5cedcba",
  containmentHttpSha256: "e3a3c98d16f6e0c6df3e082a598cbfe6c79cf2045b4da4c7ea75584d9cbe60a8",
  containmentManifestSha256: "d194cf792581361e6b9f0d7eafe1ab67783619b59e9f93a099a5b494de8e55bd",
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
const priorRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.priorActionId);
const earlierRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.earlierActionId);
const legacyRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.legacyActionId);
const predecessorRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.predecessorActionId);
const originalRoot = path.join(evidenceParent, VERCEL_STAGING_DEPLOYMENT.originalActionId);
const containmentRoot = path.join(root, "secure/restaurant-vercel-staging-containment", VERCEL_STAGING_DEPLOYMENT.containmentRecordId);
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
  if (args[0] === "deploy") validatePreviewDeploymentCommand(args, VERCEL_STAGING_DEPLOYMENT.scope);
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
  if (progress?.continuationOf !== VERCEL_STAGING_DEPLOYMENT.previousActionId || progress?.schemaVersion !== 2 || progress?.terminal !== "FAIL" || progress?.error !== "Vercel classified the deployment outside Preview; hosted qualification is prohibited." || progress?.limits?.productionDeployments !== 0 || progress?.limits?.deployments !== 1 || progress?.limits?.retries !== 0) throw new Error("Consumed continuation terminal state mismatch.");
  const prefixes = ["verify-authenticated-account", "verify-scope-organization-mapping", "verify-existing-project", "inspect-preview-environment", "pull-effective-preview-environment"];
  if (!Array.isArray(progress.steps) || progress.steps.length !== 16 || progress.steps.slice(0, 5).some((step, index) => step?.action !== prefixes[index] || step?.status !== 0) || progress.steps.slice(5, 14).some(step => step?.action !== "reconcile-preview-build-input" || step?.status !== 0 || step?.disposition !== "already-exact") || progress.steps[14]?.action !== "verify-preview-environment" || progress.steps[14]?.status !== 0 || progress.steps[15]?.action !== "verify-effective-preview-environment" || progress.steps[15]?.status !== 0) throw new Error("Consumed continuation progress is not the reviewed null-target Preview attempt.");
  return { deploymentCommands: 1, immediateTargetRepresentationRejected: "NULL", hostedQualificationStarted: false };
}

export function validateContainmentEvidence(directory) {
  const files = {
    "progress.json": VERCEL_STAGING_DEPLOYMENT.containmentProgressSha256,
    "terminal-result.json": VERCEL_STAGING_DEPLOYMENT.containmentResultSha256,
    "post-containment-http-verification.json": VERCEL_STAGING_DEPLOYMENT.containmentHttpSha256,
    "evidence-manifest.tsv": VERCEL_STAGING_DEPLOYMENT.containmentManifestSha256,
  };
  for (const [name, expected] of Object.entries(files)) if (sha256(fs.readFileSync(path.join(directory, name))) !== expected) throw new Error(`Containment evidence mismatch: ${name}.`);
  const result = JSON.parse(fs.readFileSync(path.join(directory, "terminal-result.json"), "utf8"));
  if (result?.terminal !== "PASS" || result?.recordId !== VERCEL_STAGING_DEPLOYMENT.containmentRecordId || result?.deploymentId !== "dpl_G56jfAJQZVKHPrYAFuL7usTyrW4z" || result?.project !== VERCEL_STAGING_DEPLOYMENT.project || result?.scope !== VERCEL_STAGING_DEPLOYMENT.scope || result?.deploymentPreserved !== true || result?.retries !== 0 || result?.summary?.authoritativeAliasInventoryAssignments !== 0 || result?.summary?.remainingAuthorizedAliases?.length !== 0) throw new Error("Containment terminal identity mismatch.");
  return true;
}

export function validateVercelProjectConfiguration(config) {
  const noStore = "private, no-cache, no-store, max-age=0, must-revalidate";
  const routeSources = ["/\\+not-found", "/_sitemap", "/dashboard", "/earnings", "/forgot-password", "/history", "/invite", "/login", "/menu", "/more", "/orders", "/pending", "/restaurant", "/reviews", "/security", "/settings", "/suspended"];
  if (config?.$schema !== "https://openapi.vercel.sh/vercel.json" || config?.buildCommand !== "npm --workspace @hungrie/restaurant run export:web" || config?.outputDirectory !== "apps/restaurant/dist" || config?.cleanUrls !== true || config?.trailingSlash !== false) throw new Error("Vercel project configuration identity mismatch.");
  if (!Array.isArray(config.headers) || !Array.isArray(config.rewrites) || config.rewrites.length !== 1 || config.rewrites[0]?.source !== "/orders/:orderId" || config.rewrites[0]?.destination !== "/orders/[orderId]") throw new Error("Vercel route configuration mismatch.");
  const cache = source => config.headers.filter(row => row?.source === source).flatMap(row => row.headers || []).find(row => row?.key === "Cache-Control")?.value;
  if (cache("/") !== noStore || cache("/firebase-config.js") !== noStore || cache("/_expo/static/(.*)") !== "public, max-age=31536000, immutable" || cache("/assets/(.*)") !== "public, max-age=31536000, immutable") throw new Error("Vercel cache-control contract mismatch.");
  if (routeSources.some(source => config.headers.filter(row => row?.source === source).length !== 1 || cache(source) !== noStore) || cache("/orders/:orderId") !== noStore) throw new Error("Vercel HTML route cache-control contract mismatch.");
  const worker = config.headers.find(row => row?.source === "/sw.js")?.headers || [];
  if (worker.find(row => row?.key === "Service-Worker-Allowed")?.value !== "/" || worker.find(row => row?.key === "Cache-Control")?.value !== "public, max-age=0, must-revalidate") throw new Error("Vercel service-worker delivery contract mismatch.");
  if (config.headers.some(row => row?.source === "/:route(+not-found|_sitemap|dashboard|earnings|forgot-password|history|invite|login|menu|more|orders|pending|restaurant|reviews|security|settings|suspended)")) throw new Error("Rejected Vercel route expression remains present.");
  return true;
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
  return rows.map(row => ({ name: row?.key || row?.name, type: row?.type, visibility: row?.visibility, targets: Array.isArray(row?.target) ? row.target : Array.isArray(row?.targets) ? row.targets : row?.target ? [row.target] : [], gitBranch: row?.gitBranch ?? null, recordId: row?.configurationId || row?.id || null, encryptedValuePresent: typeof row?.value === "string" }));
}

export function parsePulledEnvironment(bytes) {
  const result = {};
  for (const line of Buffer.from(bytes).toString("utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) throw new Error("Pulled Preview environment contains a malformed line.");
    const name = line.slice(0, index);
    let value = line.slice(index + 1);
    try { value = JSON.parse(value); } catch { /* unquoted dotenv values remain literal */ }
    if (typeof value !== "string" || Object.hasOwn(result, name)) throw new Error("Pulled Preview environment contains an invalid or duplicate value.");
    result[name] = value;
  }
  return result;
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

export function planEnvironmentReconciliation(payload, observations, values, effectiveValues) {
  validateBuildInputObservations(observations);
  if (!effectiveValues || typeof effectiveValues !== "object" || Array.isArray(effectiveValues)) throw new Error("Effective Preview environment values are required.");
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
    const effectivePresent = Object.hasOwn(effectiveValues, expected.name);
    if (!actual && effectivePresent) throw new Error(`Preview metadata/effective-value inconsistency: ${expected.name}.`);
    if (!actual) actions.push({ action: "add", name: expected.name, type: "config" });
    else if (actual.type === "encrypted" && actual.visibility === "config" && actual.targets.length === 1 && actual.targets[0] === "preview" && actual.gitBranch === null && actual.encryptedValuePresent && effectivePresent && sha256(effectiveValues[expected.name]) === observation.sha256 && Buffer.byteLength(effectiveValues[expected.name], "utf8") === observation.utf8Bytes) actions.push({ action: "skip", name: expected.name, type: "config" });
    else actions.push({ action: "replace", name: expected.name, type: "config" });
  }
  if (rows.some(row => row.targets.includes("preview") && !VERCEL_STAGING_DEPLOYMENT.expectedVariables.includes(row.name))) throw new Error("Unexpected Preview environment variable inventory; automatic deletion is prohibited.");
  return actions;
}

export function verifyEffectivePreviewValues(observations, effectiveValues) {
  validateBuildInputObservations(observations);
  for (const row of observations) {
    const value = effectiveValues?.[row.name];
    if (typeof value !== "string" || Buffer.byteLength(value, "utf8") !== row.utf8Bytes || sha256(value) !== row.sha256) throw new Error(`Effective Preview value differs from the reviewed contract: ${row.name}.`);
  }
  return true;
}

export function environmentMutationArgs(name, scope) {
  if (!VERCEL_STAGING_DEPLOYMENT.expectedVariables.includes(name) || scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("Environment mutation command identity mismatch.");
  return ["env", "add", name, "preview", "--force", "--type", "config", "--scope", scope];
}

export function previewDeploymentArgs(scope) {
  if (scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("Deployment command scope mismatch.");
  const args = ["deploy", "--yes", "--archive=tgz", "--target=preview", "--json", "--scope", scope];
  validatePreviewDeploymentCommand(args, scope);
  return args;
}

export function validatePreviewDeploymentCommand(args, scope) {
  if (!Array.isArray(args) || args[0] !== "deploy") throw new Error("A Vercel deployment command is required.");
  const targets = args.filter(value => typeof value === "string" && value.startsWith("--target="));
  if (targets.length !== 1 || targets[0] !== "--target=preview") throw new Error("The deployment must explicitly target Preview exactly once.");
  if (args.includes("--prod") || args.includes("--skip-domain")) throw new Error("Production targeting and Production-only domain controls are prohibited.");
  if (!args.includes("--yes") || !args.includes("--archive=tgz") || !args.includes("--json")) throw new Error("The reviewed structured Preview deployment arguments are incomplete.");
  const scopeIndexes = args.flatMap((value, index) => value === "--scope" ? [index] : []);
  if (scopeIndexes.length !== 1 || args[scopeIndexes[0] + 1] !== scope || scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("The deployment command scope is missing or mismatched.");
  return true;
}

export function parsePreviewDeploymentSubmission(result) {
  if (result?.status !== 0) throw new Error("The single Vercel Preview deployment attempt failed.");
  let payload;
  try { payload = JSON.parse(String(result.stdout || "")); } catch { throw new Error("Vercel deployment returned malformed structured output."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Vercel deployment returned an invalid result.");
  if (!["preview", "staging", null, "production"].includes(payload.target)) throw new Error("Vercel returned an unknown deployment target representation.");
  if (payload.readyState !== "READY") throw new Error("Vercel Preview deployment is not ready for hosted qualification.");
  if (!/^dpl_[A-Za-z0-9]+$/.test(payload.id || "")) throw new Error("Vercel deployment identity is missing or malformed.");
  let url;
  try { url = new URL(payload.url); } catch { throw new Error("Vercel deployment URL is missing or malformed."); }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") || !url.hostname.startsWith(`${VERCEL_STAGING_DEPLOYMENT.project}-`) || url.pathname !== "/") throw new Error("Vercel deployment URL does not identify the reviewed isolated project.");
  return { id: payload.id, url: url.href.replace(/\/$/, ""), target: payload.target, readyState: payload.readyState };
}

export function validateInspectedPreviewDeployment(submitted, payload) {
  const deployment = payload?.deployment && typeof payload.deployment === "object" ? payload.deployment : payload;
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) throw new Error("Independent Vercel deployment inspection is malformed.");
  const expectedHost = new URL(submitted.url).hostname;
  if (deployment.id !== submitted.id || deployment.projectId !== "prj_PrVORzWTAxmAHL0SqNcA9WXJppS4" || deployment.name !== VERCEL_STAGING_DEPLOYMENT.project || deployment.url !== expectedHost || deployment.readyState !== "READY") throw new Error("Independent Vercel deployment identity or readiness mismatch.");
  if (deployment.target !== "preview" && deployment.target !== null) throw new Error("Independent Vercel deployment inspection identified a non-Preview target.");
  if (Array.isArray(deployment.alias) && deployment.alias.length !== 0) throw new Error("Independent Preview inspection found an unexpected alias assignment.");
  if (["preview", "staging", null, "production"].includes(submitted.target)) return { ...submitted, submissionTarget: submitted.target, target: deployment.target, targetRepresentation: deployment.target === "preview" ? "LITERAL_PREVIEW" : "REVIEWED_NULL_PREVIEW", independentlyInspected: true };
  throw new Error("Immediate and independently inspected deployment target representations conflict.");
}

export function parsePreviewDeploymentOutput(result, inspectedPayload) {
  const submitted = parsePreviewDeploymentSubmission(result);
  if (inspectedPayload === undefined) {
    if (submitted.target !== "preview") throw new Error("A null deployment target requires independent Preview inspection.");
    return submitted;
  }
  return validateInspectedPreviewDeployment(submitted, inspectedPayload);
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

export function evaluateContinuationDecisionPath({ scope, link, account, teams, project, inventory, observations, values, effectiveValues }) {
  deploymentPlan(scope);
  validateLocalProjectLink(link);
  validateAuthenticatedAccount(account);
  validateTeamInventory(teams, link);
  validateRemoteProject(project, link);
  const actions = planEnvironmentReconciliation(inventory, observations, values, effectiveValues);
  const commands = actions.filter(row => row.action !== "skip").map(row => environmentMutationArgs(row.name, scope));
  const reconciled = VERCEL_STAGING_DEPLOYMENT.expectedVariables.map(name => ({ key: name, type: "encrypted", visibility: "config", target: ["preview"], configurationId: null, value: "encrypted-metadata" }));
  if (planEnvironmentReconciliation({ envs: reconciled }, observations, values, values).some(row => row.action !== "skip")) throw new Error("Dry-run environment reconciliation did not converge.");
  return { terminal: "DRY_RUN_READY", actions, environmentCommands: commands, deploymentCommand: previewDeploymentArgs(scope), networkRequests: 0, mutations: 0, evidenceDirectoriesCreated: 0 };
}

function pullEffectivePreviewEnvironment(scope) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-vercel-preview-env-"));
  const output = path.join(directory, ".env.preview");
  try {
    const result = runVercel(["env", "pull", output, "--environment=preview", "--yes", "--scope", scope]);
    if (result.status !== 0 || !fs.existsSync(output)) return { result, values: null };
    fs.chmodSync(output, 0o600);
    return { result, values: parsePulledEnvironment(fs.readFileSync(output)) };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

export function deploymentPlan(scope) {
  if (scope !== VERCEL_STAGING_DEPLOYMENT.scope) throw new Error("The exact reviewed Vercel scope is required.");
  return [
    { action: "verify-consumed-attempt-and-local-link", hosted: false },
    { action: "verify-authenticated-account", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} whoami --json --local-config ${localConfig}` },
    { action: "verify-scope-to-organization-mapping", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} teams ls --json --local-config ${localConfig}` },
    { action: "inspect-existing-project", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} project inspect ${VERCEL_STAGING_DEPLOYMENT.project} --json --scope ${scope} --local-config ${localConfig}` },
    { action: "inspect-and-reconcile-nine-preview-config-values", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} env ls preview --json --scope ${scope} --local-config ${localConfig}`, valuesPrinted: false },
    { action: "deploy-preview-once", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} deploy --yes --archive=tgz --target=preview --json --scope ${scope} --local-config ${localConfig}` },
    { action: "inspect-submitted-preview", command: `npx --yes vercel@${VERCEL_STAGING_DEPLOYMENT.cliVersion} api /v13/deployments/DEPLOYMENT_ID --raw --scope ${scope} --local-config ${localConfig}` },
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
  if (sha256(fs.readFileSync(path.join(priorRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.priorProgressSha256 || sha256(fs.readFileSync(path.join(priorRoot, "evidence-manifest.tsv"))) !== VERCEL_STAGING_DEPLOYMENT.priorManifestSha256) throw new Error("Prior continuation evidence mismatch.");
  if (sha256(fs.readFileSync(path.join(earlierRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.earlierProgressSha256 || sha256(fs.readFileSync(path.join(earlierRoot, "evidence-manifest.tsv"))) !== VERCEL_STAGING_DEPLOYMENT.earlierManifestSha256) throw new Error("Earlier continuation evidence mismatch.");
  if (sha256(fs.readFileSync(path.join(legacyRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.legacyProgressSha256 || sha256(fs.readFileSync(path.join(legacyRoot, "evidence-manifest.tsv"))) !== VERCEL_STAGING_DEPLOYMENT.legacyManifestSha256) throw new Error("Legacy continuation evidence mismatch.");
  if (sha256(fs.readFileSync(path.join(predecessorRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.predecessorProgressSha256 || sha256(fs.readFileSync(path.join(predecessorRoot, "evidence-manifest.tsv"))) !== VERCEL_STAGING_DEPLOYMENT.predecessorManifestSha256) throw new Error("Predecessor continuation evidence mismatch.");
  if (sha256(fs.readFileSync(path.join(originalRoot, "progress.json"))) !== VERCEL_STAGING_DEPLOYMENT.originalProgressSha256) throw new Error("Original attempt evidence mismatch.");
  validateContainmentEvidence(containmentRoot);
  const link = JSON.parse(fs.readFileSync(linkPath, "utf8"));
  validateLocalProjectLink(link);
  validateVercelProjectConfiguration(JSON.parse(fs.readFileSync(path.join(root, localConfig), "utf8")));
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
    const pulled = pullEffectivePreviewEnvironment(scope);
    progress.steps.push({ action: "pull-effective-preview-environment", completedAt: new Date().toISOString(), ...safeResult(pulled.result, false) }); persist();
    if (pulled.result.status !== 0 || !pulled.values) throw new Error("Effective Preview environment could not be retrieved.");
    const actions = planEnvironmentReconciliation(parseJsonOutput(listed, "Preview environment inventory"), validation.observations, secure.values, pulled.values);
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
    const verifiedPull = pullEffectivePreviewEnvironment(scope);
    progress.steps.push({ action: "verify-effective-preview-environment", completedAt: new Date().toISOString(), ...safeResult(verifiedPull.result, false) }); persist();
    if (verifiedPull.result.status !== 0 || !verifiedPull.values || !verifyEffectivePreviewValues(validation.observations, verifiedPull.values) || planEnvironmentReconciliation(parseJsonOutput(verified, "Verified Preview environment inventory"), validation.observations, secure.values, verifiedPull.values).some(row => row.action !== "skip")) throw new Error("Preview environment reconciliation did not converge to the exact reviewed values.");
    const deployed = runVercel(previewDeploymentArgs(scope));
    const submitted = parsePreviewDeploymentSubmission(deployed);
    const inspectedDeployment = runVercel(["api", `/v13/deployments/${submitted.id}`, "--raw", "--scope", scope]);
    const deployment = validateInspectedPreviewDeployment(submitted, parseJsonOutput(inspectedDeployment, "Independent Preview deployment inspection"));
    const deploymentUrl = deployment.url;
    progress.steps.push({ action: "deploy-preview-once", completedAt: new Date().toISOString(), deploymentId: deployment.id, deploymentUrl, target: deployment.target, readyState: deployment.readyState, ...safeResult(deployed) });
    progress.steps.push({ action: "inspect-submitted-preview", completedAt: new Date().toISOString(), deploymentId: deployment.id, targetRepresentation: deployment.targetRepresentation, status: inspectedDeployment.status, outputSha256: safeResult(inspectedDeployment, false).outputSha256 });
    progress.completedAt = new Date().toISOString(); progress.terminal = "DEPLOYED_PENDING_HOSTED_QUALIFICATION"; persist();
    process.stdout.write(canonical({ terminal: progress.terminal, deploymentUrl, evidenceRoot }));
  } catch (error) {
    progress.completedAt = new Date().toISOString(); progress.terminal = "FAIL"; progress.error = String(error?.message || error).slice(0, 500); persist(); throw error;
  } finally {
    finalizeEvidence(evidenceRoot);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(canonical({ terminal: "FAIL", error: String(error?.message || error).slice(0, 500) })); process.exitCode = 1; });
