#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CONTINUATION,
  buildSourceManifest,
  canonical,
  createFirebaseAuthorizedDomainTransport,
  inspectFirebaseAuthorizedDomains,
  sha256,
} from "./restaurant-vercel-preview-browser-notification-continuation.mjs";

export const INSPECTION = Object.freeze({
  schemaVersion: 1,
  kind: "restaurant_vercel_firebase_authorized_domain_inspection",
  inspectionId: "restaurant-vercel-firebase-domain-inspection-20260928a",
  projectId: "hungrieapp-a2288",
  requiredDomain: CONTINUATION.firebaseAuthorizedDomain,
  authorityDirectory: "secure/restaurant-vercel-firebase-domain-inspection-authority",
  evidenceDirectory: "secure/restaurant-vercel-firebase-domain-inspection/restaurant-vercel-firebase-domain-inspection-20260928a",
  credentialRegistry: "secure/phase7/firebase-credential-candidates.json",
  limits: Object.freeze({ getRequests: 1, retries: 0, configurationMutations: 0, accountMutations: 0, vercelActions: 0, authorityValidityMs: 2 * 60 * 60 * 1000 }),
});

const exactKeys = (value, keys, label) => {
  if (JSON.stringify(Object.keys(value || {}).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields differ from the reviewed schema.`);
};

const pathsFor = repoRoot => ({
  authorityDirectory: path.join(repoRoot, INSPECTION.authorityDirectory),
  authorityPath: path.join(repoRoot, INSPECTION.authorityDirectory, `${INSPECTION.inspectionId}.json`),
  sourceManifestPath: path.join(repoRoot, INSPECTION.authorityDirectory, `${INSPECTION.inspectionId}-source-manifest.tsv`),
  evidenceDirectory: path.join(repoRoot, INSPECTION.evidenceDirectory),
});

const atomicJson = (target, value, flag = "wx") => {
  if (fs.existsSync(target)) throw new Error("Exclusive Firebase inspection evidence file already exists.");
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, canonical(value), { mode: 0o600, flag });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
};

export function buildInspectionAuthorizationText({ sourceCommit, sourceManifestSha256, operatorSha256, inspectorSha256 }) {
  return `I authorize one strictly read-only Firebase Authentication configuration inspection for inspection ${INSPECTION.inspectionId}, bound to checkpoint ${sourceCommit}, complete source-manifest SHA-256 ${sourceManifestSha256}, inspection operator SHA-256 ${operatorSha256}, Firebase inspection implementation SHA-256 ${inspectorSha256}, Firebase project ${INSPECTION.projectId}, and required Preview hostname ${INSPECTION.requiredDomain}. I authorize exactly one authenticated HTTPS GET to https://identitytoolkit.googleapis.com/admin/v2/projects/${INSPECTION.projectId}/config using the documented https://www.googleapis.com/auth/identitytoolkit OAuth scope and existing approved operator credentials. I authorize zero retries, zero request body, zero Firebase configuration mutation, zero authorized-domain change, zero account or identity mutation, zero Vercel action, zero browser session, zero bypass creation, zero FCM registration, and zero notification send. The operator may persist only sanitized request identity, HTTP status, provider error code, response and error-message byte lengths and SHA-256 fingerprints, exact project validation, authorized-domain count and set SHA-256, required-hostname presence, terminal classification, and evidence integrity. It must never persist the raw response body, OAuth token, API key, service-account material, account credentials, or unrelated Firebase configuration values. Any authority, checkpoint, executable, project, method, endpoint, scope, credential identity, request-count, response-schema, evidence-path, or evidence-integrity mismatch must stop without retry. This authorization does not authorize browser or notification qualification and does not constitute Phase 6 acceptance.`;
}

export function validateInspectionApproval(approval, { now = Date.now() } = {}) {
  exactKeys(approval, ["schemaVersion", "kind", "decision", "inspectionId", "issuedAt", "expiresAt", "authorizationText", "authorizationTextSha256", "sourceCommit", "sourceManifestSha256", "operatorSha256", "inspectorSha256", "projectId", "requiredDomain", "evidenceDirectory", "limits"], "Inspection approval");
  if (approval.schemaVersion !== 1 || approval.kind !== INSPECTION.kind || approval.decision !== "APPROVE_READ_ONLY_FIREBASE_AUTH_CONFIG_INSPECTION" || approval.inspectionId !== INSPECTION.inspectionId) throw new Error("Exact Firebase inspection approval is required.");
  if (!/^[a-f0-9]{40}$/.test(approval.sourceCommit || "")) throw new Error("Inspection checkpoint is invalid.");
  for (const key of ["sourceManifestSha256", "operatorSha256", "inspectorSha256", "authorizationTextSha256"]) if (!/^[a-f0-9]{64}$/.test(approval[key] || "")) throw new Error(`Invalid ${key}.`);
  if (approval.projectId !== INSPECTION.projectId || approval.requiredDomain !== INSPECTION.requiredDomain || approval.evidenceDirectory !== INSPECTION.evidenceDirectory || JSON.stringify(approval.limits) !== JSON.stringify(INSPECTION.limits)) throw new Error("Inspection identity or limits mismatch.");
  const text = buildInspectionAuthorizationText(approval);
  if (approval.authorizationText !== text || sha256(Buffer.from(text)) !== approval.authorizationTextSha256) throw new Error("Inspection authorization text or digest mismatch.");
  const issued = Date.parse(approval.issuedAt), expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires - issued !== INSPECTION.limits.authorityValidityMs || now < issued || now >= expires) throw new Error("Inspection approval is not valid for exactly two hours.");
  return approval;
}

function verifyBindings({ repoRoot, approval, spawn = spawnSync }) {
  const head = spawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (head.status !== 0 || head.stdout.trim() !== approval.sourceCommit) throw new Error("Inspection checkpoint mismatch.");
  const manifest = buildSourceManifest(repoRoot, approval.sourceCommit, spawn);
  if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Inspection source manifest mismatch.");
  const committed = relative => {
    const result = spawn("git", ["show", `${approval.sourceCommit}:${relative}`], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Missing inspection binding: ${relative}.`);
    return result.stdout;
  };
  if (sha256(committed("scripts/inspect-restaurant-vercel-firebase-authorized-domain.mjs")) !== approval.operatorSha256 || sha256(committed("scripts/restaurant-vercel-preview-browser-notification-continuation.mjs")) !== approval.inspectorSha256) throw new Error("Inspection executable binding mismatch.");
  return { head: approval.sourceCommit, manifest };
}

export function prepareInspectionAuthority({ repoRoot, approval, now = Date.now(), spawn = spawnSync }) {
  validateInspectionApproval(approval, { now });
  const verified = verifyBindings({ repoRoot, approval, spawn }), paths = pathsFor(repoRoot);
  for (const target of [paths.authorityPath, paths.sourceManifestPath, paths.evidenceDirectory]) if (fs.existsSync(target)) throw new Error("Exclusive Firebase inspection path already exists.");
  fs.mkdirSync(paths.authorityDirectory, { recursive: true, mode: 0o700 }); fs.chmodSync(paths.authorityDirectory, 0o700);
  const authority = { ...approval, ownerApprovalSha256: sha256(Buffer.from(canonical(approval))) };
  atomicJson(paths.authorityPath, authority);
  fs.writeFileSync(paths.sourceManifestPath, verified.manifest.bytes, { flag: "wx", mode: 0o600 }); fs.chmodSync(paths.sourceManifestPath, 0o600);
  return { authorityPath: paths.authorityPath, sourceManifestPath: paths.sourceManifestPath, authoritySha256: sha256(fs.readFileSync(paths.authorityPath)) };
}

function validatePreparedAuthority({ repoRoot, now = Date.now(), spawn = spawnSync }) {
  const paths = pathsFor(repoRoot);
  if (!fs.existsSync(paths.authorityPath) || !fs.existsSync(paths.sourceManifestPath) || fs.existsSync(paths.evidenceDirectory)) throw new Error("Prepared Firebase inspection authority or exclusive path is invalid.");
  const authority = JSON.parse(fs.readFileSync(paths.authorityPath, "utf8"));
  const approval = { ...authority }; delete approval.ownerApprovalSha256;
  validateInspectionApproval(approval, { now });
  if (authority.ownerApprovalSha256 !== sha256(Buffer.from(canonical(approval)))) throw new Error("Inspection owner-approval digest mismatch.");
  const verified = verifyBindings({ repoRoot, approval, spawn }), manifest = fs.readFileSync(paths.sourceManifestPath);
  if (!manifest.equals(verified.manifest.bytes) || sha256(manifest) !== approval.sourceManifestSha256) throw new Error("Prepared inspection source manifest mismatch.");
  return { approval, paths };
}

export function selectInspectionCredential({ repoRoot }) {
  const registryPath = path.join(repoRoot, INSPECTION.credentialRegistry), registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.paths)) throw new Error("Firebase credential registry shape is invalid.");
  const eligible = [];
  for (const candidate of registry.paths) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate) || !fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate); if ((stat.mode & 0o777) !== 0o600) continue;
    const credential = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (credential.type === "service_account" && credential.project_id === INSPECTION.projectId && typeof credential.client_email === "string" && typeof credential.private_key === "string") eligible.push({ candidate, credential });
  }
  if (eligible.length !== 1) throw new Error("Exactly one mode-0600 approved Firebase inspection credential is required.");
  return eligible[0].credential;
}

const terminalClassification = evidence => evidence.status === "PASS"
  ? evidence.domainState === "AUTHORIZED_DOMAIN_PRESENT" ? "PASS_AUTHORIZED_DOMAIN_PRESENT" : "PASS_AUTHORIZED_DOMAIN_ABSENT"
  : ({ AUTHENTICATION_FAILURE: "FAIL_AUTHENTICATION", PERMISSION_FAILURE: "FAIL_PERMISSION", TRANSPORT_FAILURE: "FAIL_TRANSPORT", HTTP_OR_PROVIDER_FAILURE: "FAIL_HTTP_OR_PROVIDER", RESPONSE_SCHEMA: "FAIL_SCHEMA", PROJECT_SELECTION: "ABORTED_WRONG_PROJECT", AUTHORIZED_DOMAIN_STATE_UNEXPECTED: "FAIL_UNEXPECTED_DOMAIN_STATE" }[evidence.failureKind] || "ABORTED");

function writeEvidenceManifest(evidenceDirectory) {
  const target = path.join(evidenceDirectory, "evidence-manifest.tsv");
  if (fs.existsSync(target)) return sha256(fs.readFileSync(target));
  const files = fs.readdirSync(evidenceDirectory).filter(name => name !== "evidence-manifest.tsv").sort(), manifest = Buffer.from(`path\tbytes\tsha256\n${files.map(name => { const bytes = fs.readFileSync(path.join(evidenceDirectory, name)); return `${name}\t${bytes.length}\t${sha256(bytes)}`; }).join("\n")}\n`);
  fs.writeFileSync(target, manifest, { flag: "wx", mode: 0o600 });
  return sha256(manifest);
}

export async function executeInspection({ repoRoot, now = Date.now(), spawn = spawnSync, transport, credentialLoader = selectInspectionCredential, validatePrepared = validatePreparedAuthority }) {
  const prepared = validatePrepared({ repoRoot, now, spawn }), paths = prepared.paths;
  fs.mkdirSync(path.dirname(paths.evidenceDirectory), { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.evidenceDirectory, { mode: 0o700 }); fs.chmodSync(paths.evidenceDirectory, 0o700);
  let requestCount = 0;
  try {
    let effectiveTransport = transport;
    if (!effectiveTransport) {
      const require = createRequire(import.meta.url), { GoogleAuth } = require("../functions/node_modules/google-auth-library");
      effectiveTransport = createFirebaseAuthorizedDomainTransport({ GoogleAuth, credentials: credentialLoader({ repoRoot }) });
    }
    const counted = async request => {
      requestCount += 1;
      if (requestCount > INSPECTION.limits.getRequests) throw Object.assign(new Error("Firebase inspection request ceiling exceeded."), { code: "AUTHORIZATION" });
      return effectiveTransport(request);
    };
    const evidence = await inspectFirebaseAuthorizedDomains({ transport: counted });
    atomicJson(path.join(paths.evidenceDirectory, "firebase-authorized-domain-inspection.json"), { ...evidence, requestCount, retries: 0 });
    const terminal = { schemaVersion: 1, inspectionId: INSPECTION.inspectionId, completedAt: new Date().toISOString(), classification: terminalClassification(evidence), requestCount, retries: 0, configurationMutations: 0, accountMutations: 0, vercelActions: 0, retryEligible: false };
    atomicJson(path.join(paths.evidenceDirectory, "terminal-result.json"), terminal);
    return { terminal, evidenceManifestSha256: writeEvidenceManifest(paths.evidenceDirectory) };
  } catch (error) {
    const terminalPath = path.join(paths.evidenceDirectory, "terminal-result.json");
    if (!fs.existsSync(terminalPath)) atomicJson(terminalPath, { schemaVersion: 1, inspectionId: INSPECTION.inspectionId, completedAt: new Date().toISOString(), classification: "ABORTED", requestCount, retries: 0, configurationMutations: 0, accountMutations: 0, vercelActions: 0, retryEligible: false, errorClass: String(error?.code || error?.name || "ERROR").replace(/[^A-Z0-9_.-]/gi, "").slice(0, 80) });
    writeEvidenceManifest(paths.evidenceDirectory);
    throw error;
  }
}

function parseArgs(argv) { return Object.fromEntries(argv.slice(2).map(value => { const index = value.indexOf("="); return index < 0 ? [value.replace(/^--/, ""), true] : [value.slice(0, index).replace(/^--/, ""), value.slice(index + 1)]; })); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(process.argv);
  if (args["prepare-authority"] === true && typeof args.approval === "string") {
    console.log(JSON.stringify(prepareInspectionAuthority({ repoRoot, approval: JSON.parse(fs.readFileSync(path.resolve(args.approval), "utf8")) })));
  } else if (args.execute === "true" && args.confirm === "execute-one-read-only-firebase-auth-config-inspection") {
    executeInspection({ repoRoot }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(JSON.stringify({ error: String(error?.code || error?.name || "ERROR") })); process.exitCode = 1; });
  } else {
    console.error("Usage: --prepare-authority --approval=<approved-json> OR --execute=true --confirm=execute-one-read-only-firebase-auth-config-inspection"); process.exitCode = 2;
  }
}
