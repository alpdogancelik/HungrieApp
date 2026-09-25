#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ALIAS_PARITY_DIAGNOSTIC_POLICY,
  observeRequest,
  sanitizeError,
  verifyAliasParity,
} from "./restaurant-alias-parity-verifier.mjs";

export const DIAGNOSTIC_OPERATOR = Object.freeze({
  planSha256: "47611c6cd93ab7d9595649db77589198d8d3f7bf4969c45062ae767d036d01fc",
  applicationTree: "ae03238ac8c34f4ef11365b5a5c51dee81187812",
  artifactManifestSha256: "a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae",
  archiveSha256: "952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135",
  easProjectId: "a2d5538b-bd0c-4205-8153-ba08a3a9b2b1",
  supabaseProjectRef: "rlrfvqskzvpysewdxqcr",
  firebaseProjectId: "hungrieapp-a2288",
  aliasId: "01a09ada-0ac3-74bf-8361-3c803e655af9",
  aliasName: "staging",
  aliasUrl: "https://hungrie-restaurant--staging.expo.app",
  lastVerifiedRollbackDeployment: "6jki82fy0u",
  conflictMigration: Object.freeze({ version: "20260924140000", sha256: "750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641" }),
  protectedEvidence: Object.freeze([
    Object.freeze({ runId: "ruip6a_20260924b", files: 35, manifestSha256: "4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44" }),
    Object.freeze({ runId: "ruip6a_20260924c", files: 42, manifestSha256: "85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538" }),
  ]),
  freshnessMs: Object.freeze({ preflight: 10 * 60_000, rollbackReference: 5 * 60_000, immutable: 2 * 60 * 60_000, access: 30 * 60_000, rollbackRecheck: 30_000 }),
  runtimeFiles: Object.freeze(["/manifest.webmanifest", "/sw.js", "/firebase-config.js"]),
  externalRuntime: Object.freeze([
    Object.freeze({ url: "https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js", sha256: "16fc846e94d74deed335af1fa0edef0b744f62cbcf6b797449e77de7ef161054" }),
    Object.freeze({ url: "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js", sha256: "f9b3a80d491a02739e8e44877e4124dea5e2d9b7313fa5bdd986913840d4c091" }),
  ]),
  evidenceRoot: "secure/restaurant-alias-diagnostic",
});

export const REJECTED_DEPLOYMENTS = Object.freeze([
  "8qserom2qp",
  "mn77ek9rg5",
  "bfh8u5a0dh",
  "ipcij64k47",
]);

const ACTIONS = new Set([
  "export",
  "deploy",
  "verify-immutable",
  "capture-rollback",
  "promote",
  "observe-alias",
  "rollback",
  "verify-rollback",
  "reconcile-deployment-read",
]);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const now = () => new Date().toISOString();
const ROUTE_ARTIFACTS = Object.freeze([
  Object.freeze({ route: "/login", path: "login.html" }),
  Object.freeze({ route: "/dashboard", path: "dashboard.html" }),
  Object.freeze({ route: "/orders/detail?orderId=phase6", path: "orders/detail.html" }),
  Object.freeze({ route: "/menu", path: "menu.html" }),
  Object.freeze({ route: "/reviews", path: "reviews.html" }),
  Object.freeze({ route: "/earnings", path: "earnings.html" }),
]);

export function validateAuthority(authority, options = {}) {
  const required = {
    contractVersion: 1,
    approvedForHostedExecution: true,
    environment: "staging",
    planSha256: DIAGNOSTIC_OPERATOR.planSha256,
    applicationTree: DIAGNOSTIC_OPERATOR.applicationTree,
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
    easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
    supabaseProjectRef: DIAGNOSTIC_OPERATOR.supabaseProjectRef,
    firebaseProjectId: DIAGNOSTIC_OPERATOR.firebaseProjectId,
    aliasId: DIAGNOSTIC_OPERATOR.aliasId,
    aliasName: DIAGNOSTIC_OPERATOR.aliasName,
    aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
  };
  for (const [key, value] of Object.entries(required)) if (authority?.[key] !== value) throw new Error(`Execution authority mismatch: ${key}.`);
  if (!/^ruip6ad_[a-z0-9]{8,24}$/.test(authority.runId || "")) throw new Error("Canonical diagnostic run ID required.");
  if (!/^[a-f0-9]{40}$/.test(authority.sourceCommit || "") || !/^[a-f0-9]{64}$/.test(authority.sourceManifestSha256 || "")) throw new Error("Reviewed source identity required.");
  if (!authority.ownerAuthorizationSha256?.match(/^[a-f0-9]{64}$/)) throw new Error("Owner authorization digest required.");
  const windowStart = Date.parse(authority.maintenanceWindowStart || ""), windowEnd = Date.parse(authority.maintenanceWindowEnd || "");
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart || windowEnd - windowStart > 2 * 60 * 60_000) throw new Error("A valid maximum two-hour maintenance window is required.");
  if (options.runId && options.runId !== authority.runId) throw new Error("Run ID differs from authority.");
  if (options.sourceCommit && options.sourceCommit !== authority.sourceCommit) throw new Error("Source commit differs from authority.");
  if (options.sourceManifestSha256 && options.sourceManifestSha256 !== authority.sourceManifestSha256) throw new Error("Source manifest differs from authority.");
  return authority;
}


export function requireMaintenanceWindow(authority, action, currentMs = Date.now()) {
  const start = Date.parse(authority.maintenanceWindowStart || "");
  const end = Date.parse(authority.maintenanceWindowEnd || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || currentMs < start) throw new Error("Hosted action is outside the approved maintenance window.");
  const recovery = ["rollback", "verify-rollback"].includes(action);
  if (!recovery && currentMs >= end) throw new Error("Hosted action is outside the approved maintenance window.");
  if (["deploy", "promote"].includes(action) && end - currentMs < 720_000) throw new Error("Insufficient maintenance window remains for observation and rollback verification.");
  return { start, end, recoveryAfterDeadline: recovery && currentMs >= end };
}

export function rollbackContractDigest(reference) {
  const contract = { deploymentIdentifier: reference.deploymentIdentifier, deploymentUrl: reference.deploymentUrl, routes: reference.routes, criticalAssets: reference.criticalAssets, runtimeFiles: reference.runtimeFiles, externalRuntime: reference.externalRuntime };
  return sha256(Buffer.from(canonical(contract)));
}

export function validateRollbackReference(reference, runId = reference?.runId) {
  if (reference?.passed !== true || reference.runId !== runId || reference.deploymentIdentifier !== DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment || reference.routes?.length !== 6 || !reference.criticalAssets?.length || reference.runtimeFiles?.length !== DIAGNOSTIC_OPERATOR.runtimeFiles.length || reference.externalRuntime?.length !== DIAGNOSTIC_OPERATOR.externalRuntime.length) throw new Error("Complete deployment-derived rollback contract required.");
  const unique = (rows, key) => Array.isArray(rows) && new Set(rows.map(row => row[key])).size === rows.length;
  const exact = row => Number.isSafeInteger(row.bytes) && row.bytes > 0 && /^[a-f0-9]{64}$/.test(row.sha256 || "");
  if (!unique(reference.routes, "route") || !unique(reference.criticalAssets, "asset") || !unique(reference.runtimeFiles, "path") || !unique(reference.externalRuntime, "url") || reference.routes.some(row => !exact(row) || !Array.isArray(row.referencedAssets) || row.referencedAssets.some(asset => !reference.criticalAssets.some(value => value.asset === asset))) || reference.criticalAssets.some(row => !exact(row)) || reference.runtimeFiles.some(row => !exact(row) || !DIAGNOSTIC_OPERATOR.runtimeFiles.includes(row.path)) || reference.externalRuntime.some(row => !exact(row) || !DIAGNOSTIC_OPERATOR.externalRuntime.some(value => value.url === row.url && value.sha256 === row.sha256))) throw new Error("Rollback contract is incomplete, duplicated, or inconsistent.");
  if (reference.contractSha256 !== rollbackContractDigest(reference)) throw new Error("Rollback contract digest mismatch.");
  return true;
}

export function classifyVerificationNextAction(evidence) {
  if (evidence?.classification === "PASS" && evidence.passed === true && evidence.rollbackRequired === false) return "post-parity-qualification";
  if (["FAIL", "INCONCLUSIVE", "ABORTED"].includes(evidence?.classification) && evidence.rollbackRequired === true) return "rollback-required";
  return "stop-unexpected-verification-state";
}

export function promotionCommand(deploymentIdentifier) {
  if (!deploymentIdentifier || REJECTED_DEPLOYMENTS.includes(deploymentIdentifier)) throw new Error("A new non-rejected immutable deployment is required.");
  return ["eas-cli@16.32.0", "deploy:alias", "--alias", DIAGNOSTIC_OPERATOR.aliasName, "--id", deploymentIdentifier, "--json", "--non-interactive"];
}

export function rollbackCommand(deploymentIdentifier) {
  if (!deploymentIdentifier) throw new Error("Captured rollback deployment required.");
  return ["eas-cli@16.32.0", "deploy:alias", "--alias", DIAGNOSTIC_OPERATOR.aliasName, "--id", deploymentIdentifier, "--json", "--non-interactive"];
}

export function reserveSinglePromotion(runDirectory, record) {
  fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const marker = path.join(runDirectory, "promotion-attempt.json");
  const descriptor = fs.openSync(marker, "wx", 0o600);
  try { fs.writeFileSync(descriptor, canonical(record)); } finally { fs.closeSync(descriptor); }
  return marker;
}

export function performSinglePromotion({ runDirectory, record, appRoot, spawn = spawnSync }) {
  const marker = reserveSinglePromotion(runDirectory, record);
  const result = spawn("npx", promotionCommand(record.deploymentIdentifier), { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`Single promotion attempt failed; retry prohibited; marker retained at ${marker}.`);
  return { marker, raw: parseJsonOutput(result.stdout) };
}

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, canonical(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function parseOptions(argv) {
  const [action, ...rest] = argv;
  const values = Object.fromEntries(rest.filter(value => value.startsWith("--") && value.includes("=")).map(value => {
    const index = value.indexOf("="); return [value.slice(2, index), value.slice(index + 1)];
  }));
  return { action, values };
}

function parseJsonOutput(output) {
  const lines = String(output || "").trim().split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    try { return JSON.parse(lines.slice(index).join("\n")); } catch {}
  }
  throw new Error("Provider JSON output was not parseable.");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

function canonicalFiles(directory) {
  return walk(directory).sort().map(file => ({ path: path.relative(directory, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) }));
}

function manifestDigest(entries) {
  return sha256(`${entries.map(entry => `${entry.sha256}\t${entry.bytes}\t${entry.path}`).join("\n")}\n`);
}

export function createDeterministicArchive(sourceDirectory, archivePath, spawn = spawnSync) {
  const program = [
    "import io, pathlib, sys, tarfile",
    "root=pathlib.Path(sys.argv[1]); output=pathlib.Path(sys.argv[2])",
    "paths=sorted((p for p in root.rglob('*') if p.is_file()), key=lambda p:p.relative_to(root).as_posix())",
    "with tarfile.open(output, 'w', format=tarfile.USTAR_FORMAT) as archive:",
    "  for file in paths:",
    "    data=file.read_bytes(); info=tarfile.TarInfo(file.relative_to(root).as_posix())",
    "    info.size=len(data); info.mode=0o644; info.uid=0; info.gid=0; info.mtime=0; info.uname=''; info.gname=''",
    "    archive.addfile(info, io.BytesIO(data))",
  ].join("\n");
  const result = spawn("python3", ["-c", program, sourceDirectory, archivePath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0 || !fs.existsSync(archivePath)) throw new Error("Deterministic artifact archive creation failed; output withheld.");
  return { sha256: sha256(fs.readFileSync(archivePath)), bytes: fs.statSync(archivePath).size };
}

export function verifyProtectedEvidence(root) {
  return DIAGNOSTIC_OPERATOR.protectedEvidence.map(expected => {
    const directory = path.join(root, "secure/restaurant-authgate-staging-retry", expected.runId), manifestPath = path.join(directory, "evidence-manifest.tsv");
    if (!fs.existsSync(manifestPath) || sha256(fs.readFileSync(manifestPath)) !== expected.manifestSha256) throw new Error(`Protected evidence manifest mismatch: ${expected.runId}.`);
    const rows = fs.readFileSync(manifestPath, "utf8").trim().split("\n").map(line => { const [digest, bytes, name] = line.split("\t"); return { digest, bytes: Number(bytes), name }; });
    if (rows.length !== expected.files || rows.some(row => !row.name || !Number.isSafeInteger(row.bytes) || !fs.existsSync(path.join(directory, row.name)) || fs.statSync(path.join(directory, row.name)).size !== row.bytes || sha256(fs.readFileSync(path.join(directory, row.name))) !== row.digest)) throw new Error(`Protected evidence content mismatch: ${expected.runId}.`);
    return { ...expected, passed: true };
  });
}

export async function verifyImmutableArtifactParity({ base, deploymentIdentifier, artifact, fetchImpl = fetch, persist = async () => {}, clock = { now: () => Date.now() } }) {
  const files = artifact?.files || [];
  const fileByPath = new Map(files.map(file => [file.path, file]));
  const expectedRoutes = ROUTE_ARTIFACTS.map(({ route, path: artifactPath }) => ({ route, artifactPath, ...fileByPath.get(artifactPath) }));
  const expectedAssets = files.filter(file => /^(?:_expo\/static\/).+\.(?:js|css)$/.test(file.path)).map(file => ({ asset: `/${file.path}`, ...file }));
  if (artifact?.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || artifact?.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || files.length !== 74 || expectedRoutes.some(row => !row.sha256 || !Number.isSafeInteger(row.bytes)) || expectedAssets.length !== 5 || files.some(row => !row.path || !Number.isSafeInteger(row.bytes) || !/^[a-f0-9]{64}$/.test(row.sha256 || ""))) throw new Error("Complete fixed accepted artifact evidence required.");
  const publishedBodies = new Map();
  const evidence = { schemaVersion: 2, capturedAt: new Date(clock.now()).toISOString(), passed: false, deploymentIdentifier, url: base, artifactManifestSha256: artifact.artifactManifestSha256, archiveSha256: artifact.archiveSha256, routes: [], criticalAssets: [], publishedFiles: [], externalRuntime: [], errors: [] };
  await persist(evidence);
  const observeExpected = async (requestedUrl, expected, stage) => {
    try {
      const response = await fetchImpl(requestedUrl, { redirect: "follow", headers: { "cache-control": "no-cache", pragma: "no-cache" } });
      const body = Buffer.from(await response.arrayBuffer());
      const actual = { status: response.status, finalUrl: response.url || requestedUrl.href, byteLength: body.length, sha256: sha256(body) };
      const comparison = { status: actual.status === 200, finalUrl: actual.finalUrl === requestedUrl.href, byteLength: actual.byteLength === expected.bytes, sha256: actual.sha256 === expected.sha256 };
      return { actual, comparison, passed: Object.values(comparison).every(Boolean), body };
    } catch (error) { evidence.errors.push({ stage, error: sanitizeError(error) }); await persist(evidence); return null; }
  };
  for (const expected of expectedRoutes) {
    const requestedUrl = new URL(expected.route, base), result = await observeExpected(requestedUrl, expected, `route:${expected.route}`);
    if (result) { const refs = assetsReferenced(result.body, expectedAssets); const row = { route: expected.route, artifactPath: expected.artifactPath, expected: { status: 200, finalUrl: requestedUrl.href, byteLength: expected.bytes, sha256: expected.sha256, assets: expectedAssets.map(asset => asset.asset) }, actual: result.actual, comparison: { ...result.comparison, assetReferences: refs }, passed: result.passed && refs }; evidence.routes.push(row); await persist(evidence); }
  }
  for (const expected of files) {
    const requestedUrl = new URL(`/${expected.path}`, base), result = await observeExpected(requestedUrl, expected, `file:${expected.path}`);
    if (result) { publishedBodies.set(expected.path, result.body); evidence.publishedFiles.push({ path: expected.path, expected: { bytes: expected.bytes, sha256: expected.sha256 }, actual: result.actual, comparison: result.comparison, passed: result.passed }); await persist(evidence); }
  }
  evidence.criticalAssets = expectedAssets.map(expected => { const file = evidence.publishedFiles.find(row => row.path === expected.path); return { asset: expected.asset, artifactPath: expected.path, expected: file?.expected, actual: file?.actual, comparison: file?.comparison, passed: file?.passed === true }; });
  const sw = evidence.publishedFiles.find(row => row.path === "sw.js"), swText = publishedBodies.get("sw.js")?.toString("utf8") || "";
  if (sw?.passed) for (const required of DIAGNOSTIC_OPERATOR.externalRuntime) {
    if (!swText.includes(required.url)) { evidence.errors.push({ stage: `external-reference:${required.url}`, error: "Service worker external runtime reference missing." }); await persist(evidence); continue; }
    const requestedUrl = new URL(required.url); const result = await observeExpected(requestedUrl, { bytes: required.url.includes("messaging") ? 37024 : 31766, sha256: required.sha256 }, `external:${required.url}`);
    if (result) { evidence.externalRuntime.push({ url: required.url, expectedSha256: required.sha256, actual: result.actual, passed: result.passed }); await persist(evidence); }
  }
  evidence.passed = evidence.errors.length === 0 && evidence.routes.length === 6 && evidence.routes.every(row => row.passed) && evidence.criticalAssets.length === 5 && evidence.criticalAssets.every(row => row.passed) && evidence.publishedFiles.length === 74 && evidence.publishedFiles.every(row => row.passed) && evidence.externalRuntime.length === DIAGNOSTIC_OPERATOR.externalRuntime.length && evidence.externalRuntime.every(row => row.passed);
  evidence.completedAt = new Date(clock.now()).toISOString(); await persist(evidence); return evidence;
}

async function retrieveAliasMetadata({ attempt, record, signal, sessionSecret }) {
  const query = `query Alias($appId:String!){app{byId(appId:$appId){id workerDeploymentAliases(first:50){edges{node{id aliasName url updatedAt workerDeployment{id deploymentIdentifier url createdAt}}}}}}}`;
  const result = await observeRequest({
    url: "https://api.expo.dev/graphql",
    init: { method: "POST", headers: { "content-type": "application/json", "expo-session": sessionSecret }, body: JSON.stringify({ query, variables: { appId: DIAGNOSTIC_OPERATOR.easProjectId } }) },
    attempt,
    resourceKind: "alias-metadata",
    clock: { now: () => Date.now() },
    record,
    deadlineSignal: signal,
  });
  const payload = JSON.parse(result.body.toString("utf8"));
  if (!result.response.ok || payload.errors) throw new Error("Live Expo alias metadata query failed.");
  const alias = payload.data?.app?.byId?.workerDeploymentAliases?.edges?.map(edge => edge.node).find(node => node.id === DIAGNOSTIC_OPERATOR.aliasId && node.aliasName === DIAGNOSTIC_OPERATOR.aliasName);
  if (!alias?.workerDeployment?.deploymentIdentifier || alias.url !== DIAGNOSTIC_OPERATOR.aliasUrl) throw new Error("Staging alias metadata is incomplete or mismatched.");
  return { deploymentIdentifier: alias.workerDeployment.deploymentIdentifier, deploymentUrl: alias.workerDeployment.url, updatedAt: alias.updatedAt || null };
}

function sameRequestedAndFinal(observation) {
  if (!observation.finalUrl) return false;
  const requested = new URL(observation.requestedUrl), final = new URL(observation.finalUrl);
  return requested.origin === final.origin && requested.pathname === final.pathname && requested.search === final.search;
}

function assetsReferenced(body, expectedAssets) {
  const found = new Set([...body.toString("utf8").matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)].map(match => new URL(match[1], DIAGNOSTIC_OPERATOR.aliasUrl).pathname));
  return expectedAssets.every(asset => found.has(asset.asset));
}

export async function verifyRollbackParity({
  aliasUrl,
  runId,
  expected,
  retrieveMetadata,
  persist,
  fetchImpl = fetch,
  clock = { now: () => Date.now(), sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) },
  deadlineSignal = remainingMs => AbortSignal.timeout(Math.max(1, remainingMs)),
}) {
  const policy = { maximumAttempts: 12, pollingIntervalMs: 10_000, maximumObservationMs: 120_000, requiredCompleteObservations: 2, stabilitySpacingMs: 30_000 };
  if (!expected?.deploymentIdentifier || expected.routes?.length !== 6 || !expected.criticalAssets?.length) throw new Error("Complete captured rollback reference required.");
  const startedMs = clock.now(), deadlineMs = startedMs + policy.maximumObservationMs;
  const evidence = { schemaVersion: 1, runId, aliasUrl, expected, policy, startedAt: new Date(startedMs).toISOString(), deadlineAt: new Date(deadlineMs).toISOString(), attempts: [], selectedAttempts: [], passed: false, classification: "RUNNING", rollbackRequired: true, completedAt: null };
  await persist(evidence);
  const finish = async (classification, reason) => { evidence.classification = classification; evidence.reason = reason; evidence.passed = classification === "PASS"; evidence.rollbackRequired = classification !== "PASS"; evidence.completedAt = new Date(clock.now()).toISOString(); await persist(evidence); return evidence; };
  for (let number = 1; number <= policy.maximumAttempts; number += 1) {
    const target = startedMs + (number - 1) * policy.pollingIntervalMs;
    if (clock.now() < target) await clock.sleep(target - clock.now());
    if (clock.now() >= deadlineMs) break;
    const attempt = { number, startedAt: new Date(clock.now()).toISOString(), metadata: null, routes: [], criticalAssets: [], runtimeFiles: [], externalRuntime: [], observations: [], errors: [], completeParity: false, completedAt: null };
    evidence.attempts.push(attempt); await persist(evidence);
    const record = async observation => { attempt.observations.push(observation); await persist(evidence); };
    const signal = () => deadlineSignal(Math.max(1, deadlineMs - clock.now()));
    try {
      const metadata = await retrieveMetadata({ attempt: number, record, signal: signal() });
      attempt.metadata = { deploymentIdentifier: metadata.deploymentIdentifier || null, updatedAt: metadata.updatedAt || null, retrievedAt: new Date(clock.now()).toISOString() };
      await persist(evidence);
    } catch (error) { attempt.errors.push({ stage: "metadata", error: sanitizeError(error) }); await persist(evidence); }
    for (const reference of expected.routes) {
      if (clock.now() >= deadlineMs) { attempt.errors.push({ stage: "deadline", error: "Rollback route set incomplete before deadline." }); await persist(evidence); break; }
      try {
        const result = await observeRequest({ fetchImpl, url: new URL(reference.route, aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: number, resourceKind: `rollback-route:${reference.route}`, cacheBust: { runId, attempt: number, resourceKind: "rollback-route" }, clock, record, deadlineSignal: signal() });
        attempt.routes.push({ route: reference.route, observation: result.observation, finalUrlMatched: sameRequestedAndFinal(result.observation), expectedAssetsReferenced: assetsReferenced(result.body, expected.criticalAssets) }); await persist(evidence);
      } catch (error) { attempt.errors.push({ stage: `route:${reference.route}`, error: sanitizeError(error) }); await persist(evidence); }
    }
    for (const reference of expected.criticalAssets) {
      if (clock.now() >= deadlineMs) { attempt.errors.push({ stage: "deadline", error: "Rollback asset set incomplete before deadline." }); await persist(evidence); break; }
      try {
        const result = await observeRequest({ fetchImpl, url: new URL(reference.asset, aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: number, resourceKind: `rollback-asset:${reference.asset}`, cacheBust: { runId, attempt: number, resourceKind: "rollback-asset" }, clock, record, deadlineSignal: signal() });
        attempt.criticalAssets.push({ asset: reference.asset, observation: result.observation, finalUrlMatched: sameRequestedAndFinal(result.observation) }); await persist(evidence);
      } catch (error) { attempt.errors.push({ stage: `asset:${reference.asset}`, error: sanitizeError(error) }); await persist(evidence); }
    }
    for (const reference of expected.runtimeFiles || []) {
      if (clock.now() >= deadlineMs) { attempt.errors.push({ stage: "deadline", error: "Rollback runtime set incomplete before deadline." }); await persist(evidence); break; }
      try { const result = await observeRequest({ fetchImpl, url: new URL(reference.path, aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: number, resourceKind: `rollback-runtime:${reference.path}`, cacheBust: { runId, attempt: number, resourceKind: "rollback-runtime" }, clock, record, deadlineSignal: signal() }); attempt.runtimeFiles.push({ path: reference.path, observation: result.observation, finalUrlMatched: sameRequestedAndFinal(result.observation) }); await persist(evidence); }
      catch (error) { attempt.errors.push({ stage: `runtime:${reference.path}`, error: sanitizeError(error) }); await persist(evidence); }
    }
    for (const reference of expected.externalRuntime || []) {
      if (clock.now() >= deadlineMs) { attempt.errors.push({ stage: "deadline", error: "External runtime set incomplete before deadline." }); await persist(evidence); break; }
      try { const result = await observeRequest({ fetchImpl, url: reference.url, init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: number, resourceKind: `rollback-external:${reference.url}`, cacheBust: null, clock, record, deadlineSignal: signal() }); attempt.externalRuntime.push({ url: reference.url, observation: result.observation, finalUrlMatched: sameRequestedAndFinal(result.observation) }); await persist(evidence); }
      catch (error) { attempt.errors.push({ stage: `external:${reference.url}`, error: sanitizeError(error) }); await persist(evidence); }
    }
    const metadataMatches = attempt.metadata?.deploymentIdentifier === expected.deploymentIdentifier;
    const routesMatch = attempt.routes.length === expected.routes.length && expected.routes.every(reference => { const row = attempt.routes.find(value => value.route === reference.route); return row?.observation.status === 200 && row.observation.responseSha256 === reference.sha256 && row.finalUrlMatched && row.expectedAssetsReferenced; });
    const assetsMatch = attempt.criticalAssets.length === expected.criticalAssets.length && expected.criticalAssets.every(reference => { const row = attempt.criticalAssets.find(value => value.asset === reference.asset); return row?.observation.status === 200 && row.observation.responseSha256 === reference.sha256 && row.finalUrlMatched; });
    const runtimeMatches = (expected.runtimeFiles || []).length === attempt.runtimeFiles.length && (expected.runtimeFiles || []).every(reference => { const row = attempt.runtimeFiles.find(value => value.path === reference.path); return row?.observation.status === 200 && row.observation.responseSha256 === reference.sha256 && row.observation.byteLength === reference.bytes && row.finalUrlMatched; });
    const externalMatches = (expected.externalRuntime || []).length === attempt.externalRuntime.length && (expected.externalRuntime || []).every(reference => { const row = attempt.externalRuntime.find(value => value.url === reference.url); return row?.observation.status === 200 && row.observation.responseSha256 === reference.sha256 && row.observation.byteLength === reference.bytes && row.finalUrlMatched; });
    attempt.completeParity = metadataMatches && routesMatch && assetsMatch && runtimeMatches && externalMatches && clock.now() <= deadlineMs;
    attempt.completedAt = new Date(clock.now()).toISOString(); await persist(evidence);
    if (attempt.completeParity) {
      const prior = evidence.selectedAttempts.at(-1);
      if (!prior || Date.parse(attempt.startedAt) - Date.parse(prior.startedAt) >= policy.stabilitySpacingMs) { evidence.selectedAttempts.push({ number, startedAt: attempt.startedAt, completedAt: attempt.completedAt }); await persist(evidence); }
      if (evidence.selectedAttempts.length === policy.requiredCompleteObservations) return finish("PASS", "ROLLBACK_METADATA_AND_CONTENT_STABLE");
    } else if (evidence.selectedAttempts.length) return finish("FAIL", "ROLLBACK_PARITY_REGRESSED");
  }
  return finish("FAIL", "ROLLBACK_PARITY_NOT_VERIFIED");
}

async function captureRollbackReference({ runId, sessionSecret, persist, fetchImpl = fetch }) {
  const evidence = { schemaVersion: 2, runId, capturedAt: now(), metadata: null, observations: [], routes: [], criticalAssets: [], runtimeFiles: [], externalRuntime: [], passed: false };
  await persist(evidence);
  const record = async observation => { evidence.observations.push(observation); await persist(evidence); };
  const clock = { now: () => Date.now() }, signal = () => AbortSignal.timeout(15_000);
  const metadata = await retrieveAliasMetadata({ attempt: 0, record, signal: signal(), sessionSecret });
  evidence.metadata = { ...metadata, retrievedAt: now() }; await persist(evidence);
  if (REJECTED_DEPLOYMENTS.includes(metadata.deploymentIdentifier) || metadata.deploymentIdentifier !== DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment) throw new Error("Current alias is not the frozen accepted rollback deployment.");
  const routeNames = ROUTE_ARTIFACTS.map(row => row.route), routeBodies = new Map(), assetPaths = new Set();
  for (const route of routeNames) {
    const immutable = await observeRequest({ fetchImpl, url: new URL(route, metadata.deploymentUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-immutable-route:${route}`, cacheBust: { runId, attempt: 0, resourceKind: "rollback-immutable-route" }, clock, record, deadlineSignal: signal() });
    const alias = await observeRequest({ fetchImpl, url: new URL(route, DIAGNOSTIC_OPERATOR.aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-alias-route:${route}`, cacheBust: { runId, attempt: 0, resourceKind: "rollback-alias-route" }, clock, record, deadlineSignal: signal() });
    const referencedAssets = [...new Set([...immutable.body.toString("utf8").matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)].map(match => new URL(match[1], metadata.deploymentUrl).pathname))].sort();
    referencedAssets.forEach(value => assetPaths.add(value)); routeBodies.set(route, immutable.body);
    const parity = immutable.observation.status === 200 && alias.observation.status === 200 && immutable.observation.responseSha256 === alias.observation.responseSha256 && immutable.observation.byteLength === alias.observation.byteLength;
    evidence.routes.push({ route, bytes: immutable.observation.byteLength, sha256: immutable.observation.responseSha256, referencedAssets, immutable: immutable.observation, alias: alias.observation, parity }); await persist(evidence);
  }
  if (!assetPaths.size || evidence.routes.some(row => !row.referencedAssets.length)) throw new Error("Rollback routes do not expose a complete JS/CSS contract.");
  for (const asset of [...assetPaths].sort()) {
    const immutable = await observeRequest({ fetchImpl, url: new URL(asset, metadata.deploymentUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-immutable-asset:${asset}`, cacheBust: { runId, attempt: 0, resourceKind: "rollback-immutable-asset" }, clock, record, deadlineSignal: signal() });
    const alias = await observeRequest({ fetchImpl, url: new URL(asset, DIAGNOSTIC_OPERATOR.aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-alias-asset:${asset}`, cacheBust: { runId, attempt: 0, resourceKind: "rollback-alias-asset" }, clock, record, deadlineSignal: signal() });
    const parity = immutable.observation.status === 200 && alias.observation.status === 200 && immutable.observation.responseSha256 === alias.observation.responseSha256 && immutable.observation.byteLength === alias.observation.byteLength;
    evidence.criticalAssets.push({ asset, bytes: immutable.observation.byteLength, sha256: immutable.observation.responseSha256, immutable: immutable.observation, alias: alias.observation, parity }); await persist(evidence);
  }
  let serviceWorkerBody = null;
  for (const runtimePath of DIAGNOSTIC_OPERATOR.runtimeFiles) {
    const immutable = await observeRequest({ fetchImpl, url: new URL(runtimePath, metadata.deploymentUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-immutable-runtime:${runtimePath}`, cacheBust: { runId, attempt: 0, resourceKind: "rollback-immutable-runtime" }, clock, record, deadlineSignal: signal() });
    const alias = await observeRequest({ fetchImpl, url: new URL(runtimePath, DIAGNOSTIC_OPERATOR.aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-alias-runtime:${runtimePath}`, cacheBust: { runId, attempt: 0, resourceKind: "rollback-alias-runtime" }, clock, record, deadlineSignal: signal() });
    if (runtimePath === "/sw.js") serviceWorkerBody = immutable.body;
    const parity = immutable.observation.status === 200 && alias.observation.status === 200 && immutable.observation.responseSha256 === alias.observation.responseSha256 && immutable.observation.byteLength === alias.observation.byteLength;
    evidence.runtimeFiles.push({ path: runtimePath, bytes: immutable.observation.byteLength, sha256: immutable.observation.responseSha256, immutable: immutable.observation, alias: alias.observation, parity }); await persist(evidence);
  }
  const imported = new Set([...(serviceWorkerBody?.toString("utf8") || "").matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[^"'\s,)]+/g)].map(row => row[0]));
  for (const required of DIAGNOSTIC_OPERATOR.externalRuntime) {
    if (!imported.has(required.url)) throw new Error("Service worker external runtime contract is incomplete.");
    const response = await observeRequest({ fetchImpl, url: required.url, init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: 0, resourceKind: `rollback-external-runtime:${required.url}`, cacheBust: null, clock, record, deadlineSignal: signal() });
    const passed = response.observation.status === 200 && response.observation.responseSha256 === required.sha256;
    evidence.externalRuntime.push({ url: required.url, bytes: response.observation.byteLength, sha256: response.observation.responseSha256, passed }); await persist(evidence);
  }
  evidence.passed = evidence.routes.length === 6 && evidence.routes.every(row => row.parity) && evidence.criticalAssets.length === assetPaths.size && evidence.criticalAssets.every(row => row.parity) && evidence.runtimeFiles.length === 3 && evidence.runtimeFiles.every(row => row.parity) && evidence.externalRuntime.length === 2 && evidence.externalRuntime.every(row => row.passed);
  evidence.completedAt = now(); await persist(evidence);
  if (!evidence.passed) throw new Error("Current alias metadata and rollback content do not have exact complete parity.");
  const reference = { passed: true, runId, deploymentIdentifier: metadata.deploymentIdentifier, deploymentUrl: metadata.deploymentUrl, capturedAt: evidence.completedAt, routes: evidence.routes.map(({ route, bytes, sha256, referencedAssets }) => ({ route, bytes, sha256, referencedAssets })), criticalAssets: evidence.criticalAssets.map(({ asset, bytes, sha256 }) => ({ asset, bytes, sha256 })), runtimeFiles: evidence.runtimeFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), externalRuntime: evidence.externalRuntime.map(({ url, bytes, sha256 }) => ({ url, bytes, sha256 })) };
  reference.contractSha256 = rollbackContractDigest(reference); validateRollbackReference(reference, runId); return reference;
}

export function requireActionConfirmation(action, authority, value) {
  if (value !== `staging:restaurant-alias-diagnostic:${action}:${authority.runId}`) throw new Error("Action-specific confirmation mismatch.");
}

function requireFresh(label, timestamp, maximumAgeMs, currentMs) {
  const capturedMs = Date.parse(timestamp || "");
  if (!Number.isFinite(capturedMs) || capturedMs > currentMs + 5_000 || currentMs - capturedMs > maximumAgeMs) throw new Error(`${label} is missing or stale.`);
}

function exactProtectedEvidence(rows) {
  return Array.isArray(rows) && rows.length === DIAGNOSTIC_OPERATOR.protectedEvidence.length && DIAGNOSTIC_OPERATOR.protectedEvidence.every(expected => {
    const row = rows.find(value => value.runId === expected.runId);
    return row?.passed === true && row.files === expected.files && row.manifestSha256 === expected.manifestSha256;
  });
}

export function validatePromotionPrerequisites({ authority, artifact, artifactEntriesSha256, archiveEvidenceSha256, deployment, immutable, immutableEvidenceSha256, access, accessEvidenceSha256, rollback, rollbackEvidenceSha256, preflight, protectedEvidenceVerification, currentMs = Date.now() }) {
  if (artifact?.runId !== authority.runId || artifact?.sourceCommit !== authority.sourceCommit || artifact?.sourceManifestSha256 !== authority.sourceManifestSha256 || artifact?.applicationTree !== DIAGNOSTIC_OPERATOR.applicationTree || artifact?.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || artifact?.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || artifact?.files?.length !== 74 || artifactEntriesSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || archiveEvidenceSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Accepted run-bound artifact evidence required.");
  if (!deployment?.deploymentIdentifier || REJECTED_DEPLOYMENTS.includes(deployment.deploymentIdentifier) || deployment.url !== immutable?.url || deployment.sourceCommit !== authority.sourceCommit || deployment.sourceManifestSha256 !== authority.sourceManifestSha256 || deployment.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256) throw new Error("Candidate deployment identity mismatch.");
  requireFresh("Immutable qualification", immutable?.completedAt, DIAGNOSTIC_OPERATOR.freshnessMs.immutable, currentMs);
  if (immutable?.passed !== true || immutable.runId !== authority.runId || immutable.deploymentIdentifier !== deployment.deploymentIdentifier || immutable.sourceCommit !== authority.sourceCommit || immutable.sourceManifestSha256 !== authority.sourceManifestSha256 || immutable.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || immutable.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || immutable.routes?.length !== 6 || !immutable.routes.every(row => row.passed) || immutable.criticalAssets?.length !== 5 || !immutable.criticalAssets.every(row => row.passed) || immutable.publishedFiles?.length !== 74 || !immutable.publishedFiles.every(row => row.passed) || immutable.externalRuntime?.length !== 2 || !immutable.externalRuntime.every(row => row.passed) || !/^[a-f0-9]{64}$/.test(immutableEvidenceSha256 || "")) throw new Error("Complete passing immutable-to-artifact qualification required.");
  requireFresh("Immutable access qualification", access?.capturedAt, DIAGNOSTIC_OPERATOR.freshnessMs.access, currentMs);
  const expectedAccess = new Map([["pending", "/pending"], ["suspended", "/suspended"], ["owner", "/dashboard"], ["manager", "/dashboard"]]);
  if (access?.passed !== true || access.runId !== authority.runId || access.qualificationId !== `${authority.runId}:${deployment.deploymentIdentifier}:immutable-access` || deployment.deploymentIdentifier !== access.deploymentIdentifier || access.immutableUrl !== deployment.url || access.sourceCommit !== authority.sourceCommit || access.sourceManifestSha256 !== authority.sourceManifestSha256 || access.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || access.immutableEvidenceSha256 !== immutableEvidenceSha256 || access.results?.length !== 4 || !/^[a-f0-9]{64}$/.test(accessEvidenceSha256 || "") || ![...expectedAccess].every(([name, expectedPath]) => { const row = access.results.find(value => value.account === name); return row?.passed === true && row.expectedPath === expectedPath; })) throw new Error("Complete candidate-bound four-state immutable access qualification required.");
  requireFresh("Rollback reference", rollback?.capturedAt, DIAGNOSTIC_OPERATOR.freshnessMs.rollbackReference, currentMs);
  try { validateRollbackReference(rollback, authority.runId); } catch { throw new Error("Complete expected rollback reference required."); }
  if (!/^[a-f0-9]{64}$/.test(rollbackEvidenceSha256 || "")) throw new Error("Hashed rollback reference required.");
  requireFresh("Staging promotion preflight", preflight?.capturedAt, DIAGNOSTIC_OPERATOR.freshnessMs.preflight, currentMs);
  if (preflight?.passed !== true || preflight.runId !== authority.runId || preflight.environment !== "staging" || preflight.identities?.supabaseProjectRef !== DIAGNOSTIC_OPERATOR.supabaseProjectRef || preflight.identities?.firebaseProjectId !== DIAGNOSTIC_OPERATOR.firebaseProjectId || preflight.identities?.easProjectId !== DIAGNOSTIC_OPERATOR.easProjectId || preflight.identities?.aliasId !== DIAGNOSTIC_OPERATOR.aliasId || preflight.identities?.aliasName !== DIAGNOSTIC_OPERATOR.aliasName || preflight.identities?.aliasUrl !== DIAGNOSTIC_OPERATOR.aliasUrl) throw new Error("Exact Staging identity preflight required.");
  if (preflight.source?.commit !== authority.sourceCommit || preflight.source?.manifestSha256 !== authority.sourceManifestSha256 || preflight.source?.applicationTree !== DIAGNOSTIC_OPERATOR.applicationTree || preflight.artifact?.manifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || preflight.artifact?.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Preflight source or artifact identity mismatch.");
  if (preflight.migration?.version !== DIAGNOSTIC_OPERATOR.conflictMigration.version || preflight.migration?.sha256 !== DIAGNOSTIC_OPERATOR.conflictMigration.sha256 || preflight.migration?.appliedExactlyOnce !== true || preflight.migration?.pendingCount !== 0) throw new Error("Accepted migration state with zero pending migrations required.");
  if (preflight.earnings?.capability !== "restaurant_earnings_v1" || preflight.earnings?.enabled !== false) throw new Error("Earnings-disabled preflight required.");
  if (!exactProtectedEvidence(preflight.protectedEvidence)) throw new Error("Unchanged protected prior-run evidence required.");
  if (!exactProtectedEvidence(protectedEvidenceVerification)) throw new Error("Independent protected prior-run evidence verification required.");
  if (preflight.candidate?.deploymentIdentifier !== deployment.deploymentIdentifier || preflight.candidate?.url !== deployment.url || preflight.candidate?.immutableEvidenceSha256 !== immutableEvidenceSha256 || preflight.candidate?.accessEvidenceSha256 !== accessEvidenceSha256 || preflight.rollback?.deploymentIdentifier !== rollback.deploymentIdentifier || preflight.rollback?.referenceSha256 !== rollbackEvidenceSha256 || preflight.rollback?.parityPassed !== true) throw new Error("Preflight candidate or rollback evidence binding mismatch.");
  return true;
}

export function validateImmediateRollbackRecheck({ evidence, rollback, completedEvidenceSha256, currentMs = Date.now() }) {
  requireFresh("Immediate rollback parity recheck", evidence?.completedAt, DIAGNOSTIC_OPERATOR.freshnessMs.rollbackRecheck, currentMs);
  if (evidence?.passed !== true || evidence.classification !== "PASS" || evidence.rollbackRequired !== false || evidence.runId !== rollback.runId || evidence.expected?.deploymentIdentifier !== rollback.deploymentIdentifier || JSON.stringify(evidence.expected?.routes) !== JSON.stringify(rollback.routes) || JSON.stringify(evidence.expected?.criticalAssets) !== JSON.stringify(rollback.criticalAssets) || JSON.stringify(evidence.expected?.runtimeFiles) !== JSON.stringify(rollback.runtimeFiles) || JSON.stringify(evidence.expected?.externalRuntime) !== JSON.stringify(rollback.externalRuntime) || evidence.selectedAttempts?.length !== 2 || !/^[a-f0-9]{64}$/.test(completedEvidenceSha256 || "")) throw new Error("Immediate independent rollback parity recheck required.");
  return true;
}

export async function executePromotionBoundary({ authority, artifact, artifactEntriesSha256, archiveEvidenceSha256, deployment, immutable, immutableEvidenceSha256, access, accessEvidenceSha256, rollback, rollbackEvidenceSha256, preflight, preflightEvidenceSha256, protectedEvidenceVerification, currentMs = Date.now(), recheckRollback, runDirectory, appRoot, spawn = spawnSync }) {
  if (!/^[a-f0-9]{64}$/.test(preflightEvidenceSha256 || "")) throw new Error("Hashed promotion preflight evidence required.");
  validatePromotionPrerequisites({ authority, artifact, artifactEntriesSha256, archiveEvidenceSha256, deployment, immutable, immutableEvidenceSha256, access, accessEvidenceSha256, rollback, rollbackEvidenceSha256, preflight, protectedEvidenceVerification, currentMs });
  const recheck = await recheckRollback();
  const promotionMs = recheck.currentMs ?? Date.now();
  validateImmediateRollbackRecheck({ evidence: recheck.evidence, rollback, completedEvidenceSha256: recheck.sha256, currentMs: promotionMs });
  validatePromotionPrerequisites({ authority, artifact, artifactEntriesSha256, archiveEvidenceSha256, deployment, immutable, immutableEvidenceSha256, access, accessEvidenceSha256, rollback, rollbackEvidenceSha256, preflight, protectedEvidenceVerification, currentMs: promotionMs });
  const record = { attemptedAt: new Date(promotionMs).toISOString(), runId: authority.runId, aliasId: DIAGNOSTIC_OPERATOR.aliasId, aliasName: DIAGNOSTIC_OPERATOR.aliasName, deploymentIdentifier: deployment.deploymentIdentifier, preflightSha256: preflightEvidenceSha256, rollbackReferenceSha256: rollbackEvidenceSha256, rollbackRecheckSha256: recheck.sha256, immutableEvidenceSha256, accessEvidenceSha256 };
  const promoted = performSinglePromotion({ runDirectory, record, appRoot, spawn });
  return { promoted, record, rollbackRecheck: recheck.evidence };
}

function loadContext(values) {
  if (values.environment !== "staging") throw new Error("Explicit Staging environment required.");
  if (!values.authority) throw new Error("Reviewed execution authority file required.");
  const authorityPath = path.resolve(values.authority);
  const authority = validateAuthority(JSON.parse(fs.readFileSync(authorityPath, "utf8")), {
    runId: values["run-id"], sourceCommit: values["expect-commit"], sourceManifestSha256: values["expect-source-sha256"],
  });
  if (!values["source-manifest"]) throw new Error("Reviewed source manifest file required.");
  const sourceManifestPath = path.resolve(values["source-manifest"]);
  if (!fs.existsSync(sourceManifestPath) || sha256(fs.readFileSync(sourceManifestPath)) !== authority.sourceManifestSha256) throw new Error("Reviewed source manifest mismatch.");
  const root = path.resolve(import.meta.dirname, "..");
  const runDirectory = path.join(root, DIAGNOSTIC_OPERATOR.evidenceRoot, authority.runId);
  if (path.resolve(runDirectory) !== path.join(root, DIAGNOSTIC_OPERATOR.evidenceRoot, authority.runId)) throw new Error("Unsafe run directory.");
  requireActionConfirmation(values.action, authority, values.confirm);
  requireMaintenanceWindow(authority, values.action, Number(values["current-time-ms"] || Date.now()));
  if (spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() !== authority.sourceCommit) throw new Error("Audited operator checkpoint mismatch.");
  if (spawnSync("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim() !== DIAGNOSTIC_OPERATOR.applicationTree) throw new Error("Restaurant application tree changed.");
  return { authority, root, runDirectory, sourceManifestPath };
}

function expoSessionSecret() {
  const statePath = path.join(process.env.HOME, ".expo/state.json");
  const value = JSON.parse(fs.readFileSync(statePath, "utf8")).auth?.sessionSecret;
  if (!value) throw new Error("Authenticated Expo session required.");
  return value;
}

export function consumeDeploymentReservation({ runDirectory, authority, capturedAt = now() }) {
  const attemptPath = path.join(runDirectory, "deployment-attempt.json"), resourcePath = path.join(runDirectory, "created-resources.json");
  if (!fs.existsSync(attemptPath) || !fs.existsSync(resourcePath) || fs.existsSync(path.join(runDirectory, "immutable-deployment.json"))) throw new Error("Exclusive deployment reservation is required and cannot be reused.");
  const attempt = JSON.parse(fs.readFileSync(attemptPath, "utf8")), inventory = JSON.parse(fs.readFileSync(resourcePath, "utf8"));
  if (attempt.runId !== authority.runId || attempt.state !== "PROVIDER_COMMAND_AUTHORIZED" || attempt.providerCommandInvoked !== true || attempt.deploymentRetryPermitted !== false || inventory.runId !== authority.runId || inventory.state !== "DEPLOYMENT_IN_PROGRESS" || inventory.deploymentAttemptCount !== 1) throw new Error("Exclusive deployment reservation is invalid or consumed.");
  atomicWrite(attemptPath, { ...attempt, state: "PROVIDER_COMMAND_STARTED", commandStartedAt: capturedAt });
  return { attemptPath, attempt, inventory };
}

export async function runDiagnosticOperator(argv = process.argv.slice(2), dependencies = {}) {
  const { action, values } = parseOptions(argv);
  values.action = action;
  if (!ACTIONS.has(action)) throw new Error("Unsupported diagnostic operator action.");
  const { authority, root, runDirectory } = loadContext(values);
  fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const sourceRoot = values["source-checkout"] ? path.resolve(values["source-checkout"]) : root;
  const appRoot = path.join(sourceRoot, "apps/restaurant");
  const run = dependencies.spawnSync || spawnSync;
  if (run("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).stdout.trim() !== authority.sourceCommit) throw new Error("Isolated source checkout commit mismatch.");
  if (run("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: sourceRoot, encoding: "utf8" }).stdout.trim() !== DIAGNOSTIC_OPERATOR.applicationTree) throw new Error("Isolated Restaurant application tree changed.");
  const app = JSON.parse(fs.readFileSync(path.join(appRoot, "app.json"), "utf8"));
  if (app.expo?.extra?.eas?.projectId !== DIAGNOSTIC_OPERATOR.easProjectId) throw new Error("Restaurant EAS project identity mismatch.");

  if (action === "export") {
    const result = run("npx", ["eas-cli@16.32.0", "env:exec", "preview", "npm run prepare:web && npx expo export --platform web --clear", "--non-interactive"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error("Restaurant preview export failed; output withheld.");
    const files = canonicalFiles(path.join(appRoot, "dist"));
    if (files.length !== 74 || files.filter(file => file.path.endsWith(".html")).length !== 20 || manifestDigest(files) !== DIAGNOSTIC_OPERATOR.artifactManifestSha256) throw new Error("Export differs from the accepted artifact manifest.");
    const bundle = files.filter(file => /\.(?:html|js|css)$/.test(file.path)).map(file => fs.readFileSync(path.join(appRoot, "dist", file.path), "utf8")).join("\n");
    if (!bundle.includes(DIAGNOSTIC_OPERATOR.firebaseProjectId) || !bundle.includes(DIAGNOSTIC_OPERATOR.supabaseProjectRef) || /phase5Adapter|MockProvider|restaurant-ui-mock/.test(bundle)) throw new Error("Exported configuration or production boundary mismatch.");
    const archive = createDeterministicArchive(path.join(appRoot, "dist"), path.join(runDirectory, "restaurant-static-export.tar"), run);
    if (archive.sha256 !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Deterministic archive differs from the accepted artifact.");
    atomicWrite(path.join(runDirectory, "artifact-manifest.json"), { capturedAt: now(), runId: authority.runId, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256, applicationTree: DIAGNOSTIC_OPERATOR.applicationTree, files, artifactManifestSha256: manifestDigest(files), archiveSha256: archive.sha256, archiveBytes: archive.bytes });
    return { passed: true, action, files: files.length, routes: 20 };
  }

  if (action === "deploy") {
    const { attemptPath, attempt } = consumeDeploymentReservation({ runDirectory, authority });
    const artifact = JSON.parse(fs.readFileSync(path.join(runDirectory, "artifact-manifest.json"), "utf8"));
    const archivePath = path.join(runDirectory, "restaurant-static-export.tar");
    if (artifact.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || artifact.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || !fs.existsSync(archivePath) || sha256(fs.readFileSync(archivePath)) !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Accepted artifact and deterministic archive evidence required.");
    const result = run("npx", ["eas-cli@16.32.0", "deploy", "--environment", "preview", "--export-dir", "dist", "--json", "--non-interactive"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error("Immutable deployment failed; output withheld.");
    const raw = parseJsonOutput(result.stdout), deploymentIdentifier = raw.identifier || raw.deploymentIdentifier, url = raw.url;
    const expectedUrl = `https://hungrie-restaurant--${deploymentIdentifier}.expo.app`;
    if (!deploymentIdentifier || url !== expectedUrl || REJECTED_DEPLOYMENTS.includes(deploymentIdentifier)) throw new Error("Provider did not return a project-bound acceptable immutable deployment.");
    atomicWrite(attemptPath, { ...attempt, state: "PROVIDER_COMMAND_RETURNED", commandStartedAt: JSON.parse(fs.readFileSync(attemptPath, "utf8")).commandStartedAt, commandCompletedAt: now(), deploymentIdentifier });
    atomicWrite(path.join(runDirectory, "immutable-deployment.json"), { capturedAt: now(), easProjectId: DIAGNOSTIC_OPERATOR.easProjectId, deploymentIdentifier, url, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256, artifactManifestSha256: artifact.artifactManifestSha256, aliasAssigned: false });
    return { passed: true, action, deploymentIdentifier, url };
  }

  if (action === "verify-immutable") {
    const deployment = JSON.parse(fs.readFileSync(path.join(runDirectory, "immutable-deployment.json"), "utf8"));
    const artifact = JSON.parse(fs.readFileSync(path.join(runDirectory, "artifact-manifest.json"), "utf8"));
    if (REJECTED_DEPLOYMENTS.includes(deployment.deploymentIdentifier)) throw new Error("Rejected deployment cannot be verified for promotion.");
    const progressPath = path.join(runDirectory, "immutable-smoke-progress.json");
    const evidence = await verifyImmutableArtifactParity({ base: deployment.url, deploymentIdentifier: deployment.deploymentIdentifier, artifact, fetchImpl: dependencies.fetchImpl || fetch, persist: value => atomicWrite(progressPath, value) });
    const qualified = { ...evidence, runId: authority.runId, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256 };
    atomicWrite(path.join(runDirectory, "immutable-smoke.json"), qualified);
    if (!qualified.passed) throw new Error("Immutable deployment differs from the fixed accepted local artifact.");
    return { passed: true, action, routes: qualified.routes.length, criticalAssets: qualified.criticalAssets.length };
  }

  if (action === "capture-rollback") {
    if (fs.existsSync(path.join(runDirectory, "promotion-attempt.json"))) throw new Error("Rollback reference must be captured before promotion.");
    const referencePath = path.join(runDirectory, "rollback-reference.json"), recapturePath = path.join(runDirectory, "fresh-recapture-attempt.json");
    const phase = fs.existsSync(recapturePath) ? "fresh" : "initial";
    if (phase === "initial" && fs.existsSync(referencePath)) throw new Error("Initial rollback reference already exists; overwrite prohibited.");
    if (phase === "fresh") { const recapture = JSON.parse(fs.readFileSync(recapturePath, "utf8")); if (recapture.state !== "READY_FOR_RECAPTURE" || fs.existsSync(referencePath)) throw new Error("Fresh rollback recapture phase is not exclusively ready."); }
    const phaseMarker = path.join(runDirectory, `rollback-capture-${phase}-attempt.json`); const descriptor = fs.openSync(phaseMarker, "wx", 0o600);
    try { fs.writeFileSync(descriptor, canonical({ schemaVersion: 1, runId: authority.runId, phase, startedAt: now(), state: "STARTED" })); } finally { fs.closeSync(descriptor); }
    const progress = path.join(runDirectory, "rollback-capture-progress.json");
    const reference = await captureRollbackReference({ runId: authority.runId, sessionSecret: dependencies.retrieveAliasMetadata ? null : expoSessionSecret(), persist: value => atomicWrite(progress, value), fetchImpl: dependencies.fetchImpl || fetch });
    atomicWrite(referencePath, reference); atomicWrite(phaseMarker, { schemaVersion: 1, runId: authority.runId, phase, startedAt: JSON.parse(fs.readFileSync(phaseMarker, "utf8")).startedAt, completedAt: now(), state: "COMPLETE", contractSha256: reference.contractSha256 });
    return { passed: true, action, phase, deploymentIdentifier: reference.deploymentIdentifier, routes: reference.routes.length, criticalAssets: reference.criticalAssets.length, runtimeFiles: reference.runtimeFiles.length };
  }

  if (action === "promote") {
    const readEvidence = name => { const file = path.join(runDirectory, name); if (!fs.existsSync(file)) throw new Error(`Mandatory promotion evidence missing: ${name}.`); return { file, value: JSON.parse(fs.readFileSync(file, "utf8")), sha256: sha256(fs.readFileSync(file)) }; };
    const artifactRecord = readEvidence("artifact-manifest.json"), deploymentRecord = readEvidence("immutable-deployment.json"), immutableRecord = readEvidence("immutable-smoke.json"), accessRecord = readEvidence("immutable-access-qualification.json"), rollbackRecord = readEvidence("rollback-reference.json"), preflightRecord = readEvidence("promotion-preflight.json");
    const artifact = artifactRecord.value;
    const deployment = deploymentRecord.value;
    const smoke = immutableRecord.value;
    const access = accessRecord.value;
    const rollback = rollbackRecord.value;
    const preflight = preflightRecord.value;
    const archivePath = path.join(runDirectory, "restaurant-static-export.tar");
    if (!fs.existsSync(archivePath)) throw new Error("Mandatory accepted artifact archive missing.");
    const protectedEvidenceVerification = verifyProtectedEvidence(root);
    const sessionSecret = dependencies.retrieveAliasMetadata ? null : expoSessionSecret();
    const boundary = await executePromotionBoundary({
      authority, artifact, artifactEntriesSha256: manifestDigest(artifact.files || []), archiveEvidenceSha256: sha256(fs.readFileSync(archivePath)), deployment, immutable: smoke, immutableEvidenceSha256: immutableRecord.sha256, access, accessEvidenceSha256: accessRecord.sha256, rollback, rollbackEvidenceSha256: rollbackRecord.sha256, preflight, preflightEvidenceSha256: preflightRecord.sha256, protectedEvidenceVerification, currentMs: Date.now(), runDirectory, appRoot, spawn: run,
      recheckRollback: async () => {
        const rollbackRecheck = await verifyRollbackParity({
          aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
          runId: authority.runId,
          expected: rollback,
          retrieveMetadata: dependencies.retrieveAliasMetadata || (args => retrieveAliasMetadata({ ...args, sessionSecret })),
          persist: value => atomicWrite(path.join(runDirectory, "rollback-prepromotion-verification-progress.json"), value),
          fetchImpl: dependencies.fetchImpl || fetch,
          clock: dependencies.clock,
          deadlineSignal: dependencies.deadlineSignal,
        });
        const file = path.join(runDirectory, "rollback-prepromotion-verification.json"); atomicWrite(file, rollbackRecheck);
        return { evidence: rollbackRecheck, sha256: sha256(fs.readFileSync(file)), currentMs: dependencies.clock?.now?.() || Date.now() };
      },
    });
    atomicWrite(path.join(runDirectory, "promotion-result.json"), { completedAt: now(), deploymentIdentifier: deployment.deploymentIdentifier, evidence: { preflightSha256: preflightRecord.sha256, rollbackReferenceSha256: rollbackRecord.sha256, rollbackRecheckSha256: boundary.record.rollbackRecheckSha256, immutableEvidenceSha256: immutableRecord.sha256, accessEvidenceSha256: accessRecord.sha256 }, response: boundary.promoted.raw });
    return { passed: true, action, deploymentIdentifier: deployment.deploymentIdentifier };
  }

  if (action === "observe-alias") {
    const promotion = JSON.parse(fs.readFileSync(path.join(runDirectory, "promotion-result.json"), "utf8"));
    const immutable = JSON.parse(fs.readFileSync(path.join(runDirectory, "immutable-smoke.json"), "utf8"));
    if (promotion.deploymentIdentifier !== immutable.deploymentIdentifier) throw new Error("Promotion and immutable reference differ.");
    const sessionSecret = expoSessionSecret();
    const evidence = await verifyAliasParity({
      aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
      runId: authority.runId,
      expected: { deploymentIdentifier: immutable.deploymentIdentifier, routes: immutable.routes, criticalAssets: immutable.criticalAssets },
      retrieveMetadata: args => retrieveAliasMetadata({ ...args, sessionSecret }),
      persist: value => atomicWrite(path.join(runDirectory, "alias-observation-progress.json"), value),
      policy: ALIAS_PARITY_DIAGNOSTIC_POLICY,
    });
    atomicWrite(path.join(runDirectory, "alias-observation-result.json"), evidence);
    const nextAction = classifyVerificationNextAction(evidence);
    if (nextAction !== "post-parity-qualification") throw new Error(`Alias diagnostic ${evidence.classification}; ${nextAction}.`);
    const artifact = JSON.parse(fs.readFileSync(path.join(runDirectory, "artifact-manifest.json"), "utf8"));
    const fullParity = await verifyImmutableArtifactParity({ base: DIAGNOSTIC_OPERATOR.aliasUrl, deploymentIdentifier: immutable.deploymentIdentifier, artifact, fetchImpl: dependencies.fetchImpl || fetch, persist: value => atomicWrite(path.join(runDirectory, "alias-full-artifact-progress.json"), value), clock: dependencies.clock || { now: () => Date.now() } });
    atomicWrite(path.join(runDirectory, "alias-full-artifact-result.json"), fullParity);
    if (!fullParity.passed) throw new Error("Promoted alias does not publish the complete accepted 74-file artifact and PWA runtime.");
    return { passed: true, action, classification: evidence.classification, selectedAttempts: evidence.stability.selectedAttempts.map(row => row.number), publishedFiles: fullParity.publishedFiles.length };
  }

  if (action === "rollback") {
    const rollback = JSON.parse(fs.readFileSync(path.join(runDirectory, "rollback-reference.json"), "utf8"));
    const marker = path.join(runDirectory, "rollback-attempt.json");
    const descriptor = fs.openSync(marker, "wx", 0o600);
    try { fs.writeFileSync(descriptor, canonical({ attemptedAt: now(), deploymentIdentifier: rollback.deploymentIdentifier, explicitlyConfirmed: true })); } finally { fs.closeSync(descriptor); }
    const result = run("npx", rollbackCommand(rollback.deploymentIdentifier), { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error("Explicit rollback assignment failed; output withheld.");
    atomicWrite(path.join(runDirectory, "rollback-result.json"), { completedAt: now(), deploymentIdentifier: rollback.deploymentIdentifier, response: parseJsonOutput(result.stdout) });
    return { passed: true, action, deploymentIdentifier: rollback.deploymentIdentifier };
  }

  if (action === "verify-rollback") {
    const rollback = JSON.parse(fs.readFileSync(path.join(runDirectory, "rollback-reference.json"), "utf8"));
    const assigned = JSON.parse(fs.readFileSync(path.join(runDirectory, "rollback-result.json"), "utf8"));
    if (assigned.deploymentIdentifier !== rollback.deploymentIdentifier) throw new Error("Rollback assignment and fixed reference differ.");
    const sessionSecret = expoSessionSecret();
    const evidence = await verifyRollbackParity({
      aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
      runId: authority.runId,
      expected: rollback,
      retrieveMetadata: args => retrieveAliasMetadata({ ...args, sessionSecret }),
      persist: value => atomicWrite(path.join(runDirectory, "rollback-verification-progress.json"), value),
      fetchImpl: dependencies.fetchImpl || fetch,
    });
    atomicWrite(path.join(runDirectory, "rollback-verification-result.json"), evidence);
    if (!evidence.passed) throw new Error("Rollback metadata and exact content parity were not independently verified.");
    return { passed: true, action, deploymentIdentifier: rollback.deploymentIdentifier, selectedAttempts: evidence.selectedAttempts.map(row => row.number) };
  }

  throw new Error("Unreachable diagnostic operator action.");
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  runDiagnosticOperator().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
