#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { observeRequest, verifyAliasParity } from "./restaurant-alias-parity-verifier.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = "/tmp/hungrie-ruip6a_20260924b";
const appRoot = path.join(sourceRoot, "apps/restaurant");
const action = process.argv[2];
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = option("--run-id"), environment = option("--environment");
const commit = "69498f3225ebd86316b44ee1b87c8a03794c659e", sourceSha = "f54392a13790b9a8b064bbedb81064f220dafe79645f49711ca409c37836af8c";
const expectedProject = "a2d5538b-bd0c-4205-8153-ba08a3a9b2b1", expectedSupabase = "rlrfvqskzvpysewdxqcr", expectedFirebase = "hungrieapp-a2288";
const aliasUrl = "https://hungrie-restaurant--staging.expo.app";
if (!new Set(["export", "deploy", "verify-immutable", "promote", "verify-alias", "rollback"]).has(action)) throw new Error("Use export|deploy|verify-immutable|promote|verify-alias|rollback.");
if (!/^ruip6a_[a-z0-9]{8,24}$/.test(runId || "") || environment !== "staging") throw new Error("Canonical run ID and explicit Staging environment required.");
if (option("--confirm") !== `staging:restaurant-authgate-retry:${action}:${runId}`) throw new Error("Action confirmation mismatch.");
if (option("--expect-commit") !== commit || option("--expect-source-sha256") !== sourceSha) throw new Error("Accepted source identity required.");
if (spawnSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).stdout.trim() !== commit) throw new Error("AuthGate remediation checkpoint mismatch.");
const sourceManifest = path.join(root, "secure/restaurant-authgate-staging-retry", runId, "source-manifest.tsv");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
if (sha256(fs.readFileSync(sourceManifest)) !== sourceSha) throw new Error("Source manifest mismatch.");
const app = JSON.parse(fs.readFileSync(path.join(appRoot, "app.json"), "utf8"));
if (app.expo?.extra?.eas?.projectId !== expectedProject) throw new Error("Restaurant EAS project mismatch.");
const runDirectory = path.join(root, "secure/restaurant-authgate-staging-retry", runId);
const preflightPath = path.join(runDirectory, "preflight.json"), artifactPath = path.join(runDirectory, "artifact-manifest.json"), deploymentPath = path.join(runDirectory, "immutable-deployment.json");
if (!fs.existsSync(preflightPath)) throw new Error("Protected Staging preflight required.");
const preflight = JSON.parse(fs.readFileSync(preflightPath, "utf8"));
if (preflight.sourceCommit !== commit || preflight.sourceManifestSha256 !== sourceSha || preflight.supabase.projectRef !== expectedSupabase || preflight.firebaseProjectId !== expectedFirebase || preflight.easProjectId !== expectedProject) throw new Error("Preflight identity mismatch.");
const migrationVerification = JSON.parse(fs.readFileSync(path.join(runDirectory, "migration-verification.json"), "utf8"));
const conflictQualification = JSON.parse(fs.readFileSync(path.join(runDirectory, "hosted-conflict-qualification.json"), "utf8"));
const apiQualification = JSON.parse(fs.readFileSync(path.join(runDirectory, "api-qualification.json"), "utf8"));
if (!migrationVerification.passed || !conflictQualification.passed || !apiQualification.passed || migrationVerification.state?.earnings_enabled !== false) throw new Error("Passing database, conflict, API, and Earnings-disabled gates are required before web deployment.");
const write = (name, value) => { const file = path.join(runDirectory, name); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.chmodSync(file, 0o600); return file; };
const writeAtomic = (name, value) => { const file = path.join(runDirectory, name), temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file); fs.chmodSync(file, 0o600); return file; };
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const canonicalFiles = directory => walk(directory).sort().map(file => ({ path: path.relative(directory, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) }));
const digestManifest = entries => sha256(entries.map(entry => `${entry.sha256}\t${entry.bytes}\t${entry.path}`).join("\n") + "\n");
const parseJsonOutput = output => { const lines = output.trim().split("\n"); for (let index = 0; index < lines.length; index++) { const candidate = lines.slice(index).join("\n"); try { return JSON.parse(candidate); } catch {} } throw new Error("EAS JSON output was not parseable."); };
const deploymentIdentity = value => ({ id: value.id || value.deployment?.id || null, deploymentIdentifier: value.identifier || value.deploymentIdentifier || value.deployment?.deploymentIdentifier, url: value.url || value.deployment?.url, projectId: value.projectId || expectedProject });
const validateArtifact = () => {
  const saved = JSON.parse(fs.readFileSync(artifactPath, "utf8")), entries = canonicalFiles(path.join(appRoot, "dist"));
  if (saved.sourceCommit !== commit || saved.sourceManifestSha256 !== sourceSha || saved.artifactManifestSha256 !== digestManifest(entries) || saved.files.length !== entries.length) throw new Error("Export artifact drifted.");
  return saved;
};
const fetchAssetEvidence = async base => {
  const routes = ["/login", "/dashboard", "/orders/detail?orderId=phase6", "/menu", "/reviews", "/earnings"];
  const responses = [];
  for (const route of routes) { const response = await fetch(new URL(route, base), { redirect: "follow" }); const body = Buffer.from(await response.arrayBuffer()); if (!response.ok || !body.length) throw new Error(`Route smoke failed: ${route} (${response.status}).`); responses.push({ route, finalUrl: response.url, status: response.status, sha256: sha256(body), etag: response.headers.get("etag"), cacheControl: response.headers.get("cache-control"), contentType: response.headers.get("content-type") }); }
  const home = await fetch(base); const html = await home.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  const criticalAssets = [];
  for (const asset of assets) { const response = await fetch(new URL(asset, base)); const body = Buffer.from(await response.arrayBuffer()); if (!response.ok) throw new Error(`Critical asset failed: ${asset}`); criticalAssets.push({ asset, status: response.status, sha256: sha256(body), etag: response.headers.get("etag"), cacheControl: response.headers.get("cache-control") }); }
  return { base, capturedAt: new Date().toISOString(), routes: responses, criticalAssets };
};

if (action === "export") {
  const exported = spawnSync("npx", ["eas-cli@16.32.0", "env:exec", "preview", "npm run prepare:web && npx expo export --platform web --clear", "--non-interactive"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (exported.status !== 0) throw new Error("Restaurant preview export failed; output withheld.");
  const csp = spawnSync(process.execPath, [path.join(sourceRoot, "scripts/check-restaurant-export-csp.mjs")], { cwd: root, encoding: "utf8" }); if (csp.status !== 0) throw new Error("Export CSP check failed.");
  const inspect = spawnSync("npx", ["eas-cli@16.32.0", "env:exec", "preview", "node -e 'console.log(JSON.stringify({firebase:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,supabase:process.env.EXPO_PUBLIC_SUPABASE_URL}))'", "--non-interactive"], { cwd: appRoot, encoding: "utf8" });
  if (inspect.status !== 0) throw new Error("Preview environment inspection failed.");
  const config = JSON.parse(inspect.stdout.trim().split("\n").findLast(line => line.startsWith("{")) || "{}");
  if (config.firebase !== expectedFirebase || config.supabase !== `https://${expectedSupabase}.supabase.co`) throw new Error("Preview export configuration mismatch.");
  const files = canonicalFiles(path.join(appRoot, "dist")), bundle = files.filter(entry => /\.(?:js|css|html)$/.test(entry.path)).map(entry => fs.readFileSync(path.join(appRoot, "dist", entry.path), "utf8")).join("\n");
  if (!bundle.includes(expectedFirebase) || !bundle.includes(expectedSupabase) || bundle.includes("rgjlsjwsitbnwoetmidb")) throw new Error("Exported runtime configuration failed.");
  const routes = files.filter(entry => entry.path.endsWith(".html")).map(entry => entry.path);
  if (routes.length !== 20 || /phase5Adapter|MockProvider|restaurant-ui-mock/.test(bundle)) throw new Error("Production route or bundle boundary failed.");
  const manifest = { generatedAt: new Date().toISOString(), environment, runId, sourceCommit: commit, sourceManifestSha256: sourceSha, easProjectId: expectedProject, firebaseProjectId: expectedFirebase, supabaseProjectRef: expectedSupabase, routes, files, artifactManifestSha256: digestManifest(files) };
  write("artifact-manifest.json", manifest); console.log(JSON.stringify({ passed: true, sourceCommit: commit, sourceManifestSha256: sourceSha, files: files.length, routes: manifest.routes.length, artifactManifestSha256: manifest.artifactManifestSha256 }));
}

if (action === "deploy") {
  const artifact = validateArtifact();
  const result = spawnSync("npx", ["eas-cli@16.32.0", "deploy", "--environment", "preview", "--export-dir", "dist", "--json", "--non-interactive"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("Immutable Restaurant deployment failed; output withheld.");
  const raw = parseJsonOutput(result.stdout), identity = deploymentIdentity(raw);
  if (!identity.deploymentIdentifier || !identity.url || identity.projectId && identity.projectId !== expectedProject) throw new Error("Immutable deployment identity missing or mismatched.");
  const evidence = { capturedAt: new Date().toISOString(), ...identity, sourceCommit: commit, sourceManifestSha256: sourceSha, artifactManifestSha256: artifact.artifactManifestSha256, aliasAssigned: false, raw };
  write("immutable-deployment.json", evidence); console.log(JSON.stringify({ passed: true, ...identity, artifactManifestSha256: artifact.artifactManifestSha256, aliasAssigned: false }));
}

if (action === "verify-immutable") {
  validateArtifact(); const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")), local = new Map(artifact.files.map(row => [row.path, row.sha256]));
  const evidence = await fetchAssetEvidence(deployment.url);
  const htmlParity = evidence.routes.every(row => row.sha256 === local.get("index.html"));
  const assetParity = evidence.criticalAssets.every(row => row.sha256 === local.get(row.asset.replace(/^\//, "")));
  if (!htmlParity || !assetParity) throw new Error("Immutable deployment content differs from the exact export artifact.");
  evidence.localArtifactParity = { html: htmlParity, criticalAssets: assetParity, artifactManifestSha256: artifact.artifactManifestSha256 };
  write("immutable-smoke.json", evidence); console.log(JSON.stringify({ passed: true, deploymentIdentifier: deployment.deploymentIdentifier, url: deployment.url, routes: evidence.routes.length, criticalAssets: evidence.criticalAssets.length, localArtifactParity: evidence.localArtifactParity }));
}

if (action === "promote") {
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")); if (!fs.existsSync(path.join(runDirectory, "immutable-smoke.json"))) throw new Error("Passing immutable smoke evidence required.");
  const result = spawnSync("npx", ["eas-cli@16.32.0", "deploy:alias", "--alias", "staging", "--id", deployment.deploymentIdentifier, "--json", "--non-interactive"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("Staging alias promotion failed; output withheld.");
  const raw = parseJsonOutput(result.stdout); write("alias-promotion.json", { promotedAt: new Date().toISOString(), alias: "staging", deploymentIdentifier: deployment.deploymentIdentifier, raw }); console.log(JSON.stringify({ passed: true, alias: "staging", deploymentIdentifier: deployment.deploymentIdentifier }));
}

if (action === "verify-alias") {
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")); if (!fs.existsSync(path.join(runDirectory, "alias-promotion.json"))) throw new Error("Alias promotion evidence required.");
  const immutable = JSON.parse(fs.readFileSync(path.join(runDirectory, "immutable-smoke.json"), "utf8"));
  if (!immutable.localArtifactParity?.html || !immutable.localArtifactParity?.criticalAssets || deployment.deploymentIdentifier !== JSON.parse(fs.readFileSync(path.join(runDirectory, "alias-promotion.json"), "utf8")).deploymentIdentifier) throw new Error("Fixed immutable parity evidence and matching promotion identity are required.");
  const expoState = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".expo/state.json"), "utf8"));
  const sessionSecret = expoState.auth?.sessionSecret;
  if (!sessionSecret) throw new Error("Authenticated Expo session required for independent alias metadata verification.");
  const retrieveMetadata = async ({ attempt, record, signal }) => {
    const document = `query Alias($appId:String!){app{byId(appId:$appId){id workerDeploymentAliases(first:50){edges{node{id aliasName url updatedAt workerDeployment{id deploymentIdentifier url createdAt}}}}}}}`;
    const result = await observeRequest({
      url: "https://api.expo.dev/graphql",
      init: { method: "POST", headers: { "content-type": "application/json", "expo-session": sessionSecret }, body: JSON.stringify({ query: document, variables: { appId: expectedProject } }) },
      attempt,
      resourceKind: "alias-metadata",
      clock: { now: () => Date.now() },
      record,
      deadlineSignal: signal,
    });
    const payload = JSON.parse(result.body.toString("utf8"));
    if (!result.response.ok || payload.errors) throw new Error("Live Expo alias metadata query failed.");
    const alias = payload.data?.app?.byId?.workerDeploymentAliases?.edges?.map(edge => edge.node).find(node => node.aliasName === "staging");
    if (!alias?.workerDeployment?.deploymentIdentifier) throw new Error("Staging alias metadata is incomplete.");
    return { deploymentIdentifier: alias.workerDeployment.deploymentIdentifier, updatedAt: alias.updatedAt || null };
  };
  const evidence = await verifyAliasParity({
    aliasUrl,
    runId,
    expected: { deploymentIdentifier: deployment.deploymentIdentifier, routes: immutable.routes, criticalAssets: immutable.criticalAssets },
    retrieveMetadata,
    persist: value => writeAtomic("alias-verification-progress.json", value),
  });
  if (!evidence.passed) {
    writeAtomic("alias-verification-failure.json", evidence);
    throw new Error("Alias metadata and exact content parity did not converge inside the reviewed observation window; rollback is required.");
  }
  writeAtomic("alias-verification.json", evidence);
  console.log(JSON.stringify({ passed: true, deploymentIdentifier: deployment.deploymentIdentifier, contentParity: true, metadataParity: true, attempts: evidence.attempts.length, routes: immutable.routes.length, criticalAssets: new Set(immutable.criticalAssets.map(row => row.asset)).size }));
}

if (action === "rollback") {
  const rollback = preflight.rollback; if (!rollback?.deploymentIdentifier) throw new Error("Captured rollback deployment is missing.");
  const result = spawnSync("npx", ["eas-cli@16.32.0", "deploy:alias", "--alias", "staging", "--id", rollback.deploymentIdentifier, "--json", "--non-interactive"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("Rollback alias assignment failed; output withheld.");
  const assignment = parseJsonOutput(result.stdout), observations = []; let restored = false;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await fetch(`${aliasUrl}/?rollback_check=${runId}-${attempt}`, { headers: { "cache-control": "no-cache", pragma: "no-cache" } }), body = Buffer.from(await response.arrayBuffer()), observed = sha256(body);
    observations.push({ attempt, capturedAt: new Date().toISOString(), status: response.status, htmlSha256: observed, etag: response.headers.get("etag"), age: response.headers.get("age") });
    if (response.ok && observed === rollback.htmlSha256) { restored = true; break; }
    if (attempt < 10) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const rollbackEvidence = { rolledBackAt: new Date().toISOString(), deploymentIdentifier: rollback.deploymentIdentifier, url: rollback.url, aliasUrl, expectedHtmlSha256: rollback.htmlSha256, assignment, observations, metadataReassigned: assignment.identifier === rollback.deploymentIdentifier, verified: restored };
  write(restored ? "rollback.json" : "rollback-attempt.json", rollbackEvidence);
  if (!restored) throw new Error("Rollback metadata was reassigned but CDN content restoration is not verified.");
  console.log(JSON.stringify({ passed: true, restoredDeploymentIdentifier: rollback.deploymentIdentifier, htmlSha256: observations.at(-1).htmlSha256 }));
}
