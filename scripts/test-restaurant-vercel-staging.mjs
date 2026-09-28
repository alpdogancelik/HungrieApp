#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import crypto from "node:crypto";
import os from "node:os";
import {
  classifyReviewedVariables,
  deploymentPlan,
  environmentMutationArgs,
  evaluateContinuationDecisionPath,
  finalizeEvidence,
  parsePulledEnvironment,
  parsePreviewDeploymentSubmission,
  parsePreviewDeploymentOutput,
  planEnvironmentReconciliation,
  previewDeploymentArgs,
  validateAuthenticatedAccount,
  validateConsumedProgress,
  validateContainmentEvidence,
  validateLocalProjectLink,
  validateInspectedPreviewDeployment,
  validateRemoteProject,
  validateTeamInventory,
  validatePreviewDeploymentCommand,
  validateVercelProjectConfiguration,
  verifyEffectivePreviewValues,
  VERCEL_STAGING_DEPLOYMENT,
} from "./deploy-restaurant-vercel-staging.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/restaurant");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const config = JSON.parse(read("apps/restaurant/vercel.json"));
const artifact = JSON.parse(read("docs/restaurant-expo-alias-staging-public-build-input-evidence/candidate-artifact-manifest.json"));
const htmlRoutes = artifact.files.filter(row => row.path.endsWith(".html")).map(row => row.path);

test("Vercel config exports the Restaurant static app without a production alias", () => {
  assert.equal(config.buildCommand, "npm --workspace @hungrie/restaurant run export:web");
  assert.equal(config.outputDirectory, "apps/restaurant/dist");
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  assert.equal("redirects" in config, false);
  assert.equal("alias" in config, false);
  assert.equal("functions" in config, false);
});

test("all twenty static HTML entries resolve through clean URLs", () => {
  assert.equal(htmlRoutes.length, 20);
  assert.deepEqual(htmlRoutes, artifact.routes);
  assert.ok(config.rewrites.some(row => row.source === "/orders/:orderId" && row.destination === "/orders/[orderId]"));
  assert.equal(config.rewrites.length, 1);
});

test("all extensionless HTML paths use supported literal header sources", () => {
  const literalSources = ["/\\+not-found", "/_sitemap", "/dashboard", "/earnings", "/forgot-password", "/history", "/invite", "/login", "/menu", "/more", "/orders", "/pending", "/restaurant", "/reviews", "/security", "/settings", "/suspended"];
  assert.equal(validateVercelProjectConfiguration(config), true);
  for (const source of literalSources) {
    const matches = config.headers.filter(row => row.source === source);
    assert.equal(matches.length, 1, source);
    assert.match(matches[0].headers.find(row => row.key === "Cache-Control").value, /no-store/);
  }
  assert.ok(config.headers.findIndex(row => row.source === "/_expo/static/(.*)") < config.headers.findIndex(row => row.source === "/\\+not-found"));
  assert.ok(config.headers.findIndex(row => row.source === "/assets/(.*)") < config.headers.findIndex(row => row.source === "/\\+not-found"));
  assert.equal(config.headers.some(row => row.source.includes(":route(")), false);
});

test("pinned Vercel CLI schema and route transformer accept the complete project configuration", async () => {
  const npxRoot = path.join(os.homedir(), ".npm/_npx");
  const installations = fs.readdirSync(npxRoot).map(name => path.join(npxRoot, name, "node_modules/vercel")).filter(directory => fs.existsSync(path.join(directory, "package.json")) && JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")).version === VERCEL_STAGING_DEPLOYMENT.cliVersion);
  assert.ok(installations.length > 0, "pinned Vercel CLI must be locally installed");
  const installation = installations[0];
  const schema = await import(path.join(installation, "dist/chunks/chunk-LAYFSD5A.js"));
  const routeChunk = await import(path.join(installation, "dist/chunks/chunk-OCWSKPV4.js"));
  assert.equal(schema.validateConfig(config), null);
  const transformed = routeChunk.require_dist().getTransformedRoutes(config);
  assert.equal(transformed.error, null);
  assert.ok(transformed.routes.length > config.headers.length);
  const rejected = structuredClone(config);
  rejected.headers.find(row => row.source === "/\\+not-found").source = "/:route(+not-found|dashboard)";
  assert.match(routeChunk.require_dist().getTransformedRoutes(rejected).error.message, /invalid `source` regular expression/);
});

test("security headers preserve the Expo hosting policy", () => {
  const global = config.headers.find(row => row.source === "/(.*)");
  const headers = Object.fromEntries(global.headers.map(row => [row.key, row.value]));
  assert.match(headers["Content-Security-Policy"], /worker-src 'self'/);
  assert.match(headers["Content-Security-Policy"], /manifest-src 'self'/);
  assert.match(headers["Content-Security-Policy"], /fcmregistrations\.googleapis\.com/);
  assert.match(headers["Content-Security-Policy"], /firebaseinstallations\.googleapis\.com/);
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
});

test("cache policy separates HTML, runtime configuration, worker, and hashed assets", () => {
  const header = source => Object.fromEntries(config.headers.find(row => row.source === source).headers.map(row => [row.key, row.value]));
  assert.match(header("/")["Cache-Control"], /no-store/);
  assert.match(header("/firebase-config.js")["Cache-Control"], /no-store/);
  assert.equal(header("/sw.js")["Service-Worker-Allowed"], "/");
  assert.match(header("/sw.js")["Cache-Control"], /max-age=0/);
  assert.match(header("/_expo/static/(.*)")["Cache-Control"], /immutable/);
  assert.match(header("/assets/(.*)")["Cache-Control"], /immutable/);
});

test("service worker remains root-scoped and has no fetch/cache interception", () => {
  const authGate = read("apps/restaurant/src/AuthGate.tsx");
  const worker = read("apps/restaurant/public/sw.js");
  assert.match(authGate, /serviceWorker\.register\("\/sw\.js",\s*\{\s*scope:\s*"\/"\s*\}\)/);
  assert.match(worker, /importScripts\("\/firebase-config\.js"\)/);
  assert.match(worker, /firebase\.messaging\(\)\.onBackgroundMessage/);
  assert.doesNotMatch(worker, /addEventListener\(["']fetch/);
  assert.doesNotMatch(worker, /caches\./);
});

test("web registration uses FCM, the ready service worker, and Restaurant RPC storage", () => {
  const card = read("apps/restaurant/src/NotificationCard.tsx");
  const push = read("apps/restaurant/src/push.ts");
  assert.match(card, /navigator\.serviceWorker\.ready/);
  assert.match(card, /getToken\(getMessaging\(firebaseApp\),\s*\{\s*serviceWorkerRegistration:\s*registration,\s*vapidKey:/);
  assert.match(card, /restaurant_register_web_push_v1/);
  assert.match(push, /restaurant_unregister_web_push_v1/);
  assert.match(push, /deleteToken/);
});

test("Restaurant web delivery remains separate from native Expo Push", () => {
  const migration = read("supabase/migrations/20260913141000_phase5_restaurant_contracts.sql");
  const firebaseFunction = read("functions/index.js");
  const nativeWorker = read("supabase/functions/notification-worker/worker.ts");
  assert.match(migration, /t\.provider='fcm' and t\.platform='web' and t\.app='restaurant'/);
  assert.match(firebaseFunction, /server_claim_restaurant_web_push_v1/);
  assert.match(firebaseFunction, /admin\.messaging\(\)\.send/);
  assert.match(nativeWorker, /https:\/\/exp\.host\/--\/api\/v2\/push\/send/);
});

test("background notification and click handling keep same-origin relative navigation", async () => {
  const listeners = new Map();
  const notifications = [];
  const navigations = [];
  let background;
  const existing = { navigate: async url => { navigations.push(url); }, focus: async () => undefined };
  const context = {
    importScripts: () => undefined,
    firebase: { initializeApp: () => undefined, messaging: () => ({ onBackgroundMessage: callback => { background = callback; } }) },
    self: {
      HUNGRIE_FIREBASE_CONFIG: {},
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting: () => undefined,
      registration: { showNotification: async (title, options) => { notifications.push({ title, options }); } },
      clients: { claim: () => undefined, matchAll: async () => [existing], openWindow: async url => { navigations.push(url); } },
    },
    String,
    encodeURIComponent,
  };
  vm.runInNewContext(read("apps/restaurant/public/sw.js"), context);
  await background({ data: { orderId: "order/42", eventId: "event-1", title: "New order", body: "Ready" } });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].options.data.url, "/orders/detail?orderId=order%2F42");
  let waited;
  listeners.get("notificationclick")({ notification: { data: notifications[0].options.data, close() {} }, waitUntil(value) { waited = value; } });
  await waited;
  assert.deepEqual(navigations, ["/orders/detail?orderId=order%2F42"]);
});

test("manifest keeps root identity, start URL, and scope", () => {
  const manifest = JSON.parse(read("apps/restaurant/public/manifest.webmanifest"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
});

test("web manifest sends the protected Preview cookie without forwarding automation headers", () => {
  const document = read("apps/restaurant/app/+html.tsx");
  assert.match(document, /rel="manifest" href="\/manifest\.webmanifest" crossOrigin="use-credentials"/);
  assert.doesNotMatch(document, /x-vercel-(?:protection-bypass|skip-toolbar)/);
});

test("accepted artifact includes routes, critical assets, fonts, worker, and runtime config", () => {
  assert.equal(artifact.files.length, 74);
  assert.equal(artifact.criticalAssets.length, 5);
  assert.ok(artifact.files.some(row => /\.ttf$/.test(row.path)));
  for (const required of ["sw.js", "firebase-config.js", "manifest.webmanifest"]) assert.ok(artifact.files.some(row => row.path === required));
});

test("deployment continuation is isolated, preview-only, one-shot, and exactly scope-bound", () => {
  const plan = deploymentPlan("nurlan-ildirimli-s-projects");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.project, "hungrie-restaurant-web-staging-eval-20260927a");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.actionId, "restaurant-vercel-staging-evaluation-20260928i");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.environment, "preview");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.expectedVariables.length, 9);
  assert.equal(plan.length, 7);
  const serialized = plan.map(row => row.command || "").join("\n");
  assert.doesNotMatch(serialized, /--prod|\s(?:alias|promote|domains?)\s/i);
  assert.match(serialized, /--target=preview/);
  assert.match(serialized, /--json/);
  assert.match(serialized, /--archive=tgz/);
  assert.match(serialized, /--scope nurlan-ildirimli-s-projects/);
  assert.match(serialized, /--local-config apps\/restaurant\/vercel\.json/);
  assert.match(serialized, /project inspect hungrie-restaurant-web-staging-eval-20260927a --json/);
  assert.doesNotMatch(serialized, /project ls|vercel@60\.1\.3 link/);
  assert.throws(() => deploymentPlan("reviewed-team"), /exact reviewed Vercel scope/);
});

test("deployment submission requires an explicit Preview target", () => {
  const args = previewDeploymentArgs(VERCEL_STAGING_DEPLOYMENT.scope);
  assert.deepEqual(args, ["deploy", "--yes", "--archive=tgz", "--target=preview", "--json", "--scope", VERCEL_STAGING_DEPLOYMENT.scope]);
  assert.equal(validatePreviewDeploymentCommand(args, VERCEL_STAGING_DEPLOYMENT.scope), true);
  assert.throws(() => validatePreviewDeploymentCommand(["deploy", "--yes", "--archive=tgz", "--json", "--scope", VERCEL_STAGING_DEPLOYMENT.scope], VERCEL_STAGING_DEPLOYMENT.scope), /explicitly target Preview/);
  assert.throws(() => validatePreviewDeploymentCommand(["deploy", "--yes", "--archive=tgz", "--target=production", "--json", "--scope", VERCEL_STAGING_DEPLOYMENT.scope], VERCEL_STAGING_DEPLOYMENT.scope), /explicitly target Preview/);
  assert.throws(() => validatePreviewDeploymentCommand([...args, "--target=preview"], VERCEL_STAGING_DEPLOYMENT.scope), /exactly once/);
  assert.throws(() => validatePreviewDeploymentCommand([...args, "--prod"], VERCEL_STAGING_DEPLOYMENT.scope), /Production targeting/);
  assert.throws(() => validatePreviewDeploymentCommand([...args, "--skip-domain"], VERCEL_STAGING_DEPLOYMENT.scope), /Production-only/);
});

test("pinned Vercel CLI leaves an omitted deployment target undefined", async () => {
  const npxRoot = path.join(os.homedir(), ".npm/_npx");
  const installation = fs.readdirSync(npxRoot).map(name => path.join(npxRoot, name, "node_modules/vercel")).find(directory => fs.existsSync(path.join(directory, "package.json")) && JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")).version === VERCEL_STAGING_DEPLOYMENT.cliVersion);
  assert.ok(installation, "pinned Vercel CLI must be locally installed");
  const targetChunk = await import(path.join(installation, "dist/chunks/chunk-R3B67TKQ.js"));
  assert.equal(targetChunk.parseTarget({ flagName: "target", flags: {} }), undefined);
  assert.equal(targetChunk.parseTarget({ flagName: "target", flags: { "--target": "preview" } }), "preview");
  assert.equal(targetChunk.parseTarget({ flagName: "target", flags: { "--prod": true } }), "production");
});

test("structured deployment output requires independent inspection for the CLI staging representation", () => {
  const preview = { id: "dpl_Example123", url: `https://${VERCEL_STAGING_DEPLOYMENT.project}-abc123.vercel.app`, readyState: "READY", target: "preview" };
  assert.deepEqual(parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify(preview) }), preview);
  const nullTarget = { ...preview, target: null };
  assert.deepEqual(parsePreviewDeploymentSubmission({ status: 0, stdout: JSON.stringify(nullTarget) }), nullTarget);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify(nullTarget) }), /requires independent/);
  const inspected = { id: preview.id, projectId: "prj_PrVORzWTAxmAHL0SqNcA9WXJppS4", name: VERCEL_STAGING_DEPLOYMENT.project, url: new URL(preview.url).hostname, readyState: "READY", target: null };
  assert.deepEqual(validateInspectedPreviewDeployment(nullTarget, inspected), { ...nullTarget, submissionTarget: null, targetRepresentation: "REVIEWED_NULL_PREVIEW", independentlyInspected: true });
  assert.deepEqual(parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify(nullTarget) }, inspected), { ...nullTarget, submissionTarget: null, targetRepresentation: "REVIEWED_NULL_PREVIEW", independentlyInspected: true });
  const stagingTarget = { ...preview, target: "staging" };
  assert.deepEqual(parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify(stagingTarget) }, { ...inspected, target: "preview" }), { ...stagingTarget, submissionTarget: "staging", target: "preview", targetRepresentation: "LITERAL_PREVIEW", independentlyInspected: true });
  assert.throws(() => validateInspectedPreviewDeployment(nullTarget, { ...inspected, target: "production" }), /non-Preview/);
  assert.throws(() => validateInspectedPreviewDeployment(nullTarget, { ...inspected, projectId: "wrong" }), /identity/);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify({ ...preview, target: "production" }) }), /outside Preview/);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify({ ...preview, readyState: "BUILDING" }) }), /not ready/);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 0, stdout: "}" }), /malformed structured output/);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify({ ...preview, id: "bad" }) }), /identity.*malformed/);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 0, stdout: JSON.stringify({ ...preview, url: "https://other-project.vercel.app" }) }), /reviewed isolated project/);
  assert.throws(() => parsePreviewDeploymentOutput({ status: 1, stdout: "" }), /attempt failed/);
});

const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const values = Object.fromEntries(VERCEL_STAGING_DEPLOYMENT.expectedVariables.map((name, index) => [name, `public-${index}`]));
values.EXPO_PUBLIC_FIREBASE_APP_ID = "public-ü";
const observations = VERCEL_STAGING_DEPLOYMENT.expectedVariables.map(name => ({ name, utf8Bytes: Buffer.byteLength(values[name], "utf8"), sha256: digest(values[name]), passed: true }));
const inventoryRow = row => ({ key: row.name, type: "encrypted", visibility: "config", target: ["preview"], configurationId: null, value: "encrypted-metadata" });

test("all nine EXPO_PUBLIC inputs use Vercel config type and never sensitive/secret type", () => {
  const classified = classifyReviewedVariables(VERCEL_STAGING_DEPLOYMENT.expectedVariables);
  assert.equal(classified.length, 9);
  assert.ok(classified.every(row => row.type === "config" && row.target === "preview" && row.browserVisible));
  assert.throws(() => classifyReviewedVariables([...VERCEL_STAGING_DEPLOYMENT.expectedVariables.slice(0, 8), "SERVER_SECRET"]), /inventory mismatch|server-side/);
  const source = read("scripts/deploy-restaurant-vercel-staging.mjs");
  assert.match(source, /"--type", "config"/);
  assert.doesNotMatch(source, /--sensitive|"secret"/);
});

test("missing and partial Preview variables reconcile without duplicates", () => {
  const empty = planEnvironmentReconciliation([], observations, values, {});
  assert.ok(empty.every(row => row.action === "add"));
  const one = [inventoryRow(observations[0])];
  const partial = planEnvironmentReconciliation({ envs: one }, observations, values, { [observations[0].name]: values[observations[0].name] });
  assert.equal(partial[0].action, "skip");
  assert.ok(partial.slice(1).every(row => row.action === "add"));
  const mismatch = planEnvironmentReconciliation({ envs: [{ ...one[0], visibility: "secret" }] }, observations, values, { [observations[0].name]: values[observations[0].name] });
  assert.equal(mismatch[0].action, "replace");
  assert.throws(() => planEnvironmentReconciliation({ envs: [one[0], one[0]] }, observations, values, { [observations[0].name]: values[observations[0].name] }), /Duplicate/);
  assert.throws(() => planEnvironmentReconciliation({ envs: [{ ...one[0], key: "UNREVIEWED" }] }, observations, values, {}), /Unexpected/);
});

test("canonical utf8Bytes observation schema reproduces and fixes the consumed field mismatch", () => {
  const obsolete = observations.map(({ name, utf8Bytes, sha256, passed }) => ({ name, bytes: utf8Bytes, sha256, passed }));
  assert.throws(() => planEnvironmentReconciliation([], obsolete, values, {}), /observation schema mismatch/);
  assert.equal(planEnvironmentReconciliation([], observations, values, {}).length, 9);
  assert.equal(observations[1].utf8Bytes, Buffer.byteLength(values[observations[1].name], "utf8"));
  assert.notEqual(observations[1].utf8Bytes, values[observations[1].name].length);
  assert.throws(() => planEnvironmentReconciliation([], observations.map((row, index) => index === 0 ? { ...row, utf8Bytes: row.utf8Bytes + 1 } : row), values, {}), /fingerprint mismatch/);
  assert.throws(() => planEnvironmentReconciliation([], observations.map((row, index) => index === 0 ? { ...row, extra: true } : row), values, {}), /schema mismatch/);
});

test("all nine Preview variables cover missing, exact, conflicting, duplicate, malformed, and unexpected states", () => {
  const exact = observations.map(inventoryRow);
  assert.ok(planEnvironmentReconciliation({ envs: exact }, observations, values, values).every(row => row.action === "skip"));
  const conflictingValues = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, `${value}-wrong`]));
  assert.ok(planEnvironmentReconciliation({ envs: exact }, observations, values, conflictingValues).every(row => row.action === "replace"));
  assert.throws(() => planEnvironmentReconciliation({ envs: [exact[0], exact[0], ...exact.slice(1)] }, observations, values, values), /Duplicate/);
  assert.throws(() => planEnvironmentReconciliation({ invalid: [] }, observations, values, values), /malformed/);
  assert.throws(() => planEnvironmentReconciliation({ envs: [...exact, { ...exact[0], key: "OTHER" }] }, observations, values, values), /Unexpected/);
});

test("actual Vercel metadata is encrypted config while pulled effective values are independently verifiable", () => {
  const metadata = observations.map(inventoryRow);
  assert.ok(metadata.every(row => row.type === "encrypted" && row.visibility === "config" && row.target[0] === "preview" && row.configurationId === null && row.value === "encrypted-metadata"));
  assert.ok(planEnvironmentReconciliation({ envs: metadata }, observations, values, values).every(row => row.action === "skip"));
  assert.equal(verifyEffectivePreviewValues(observations, values), true);
  assert.throws(() => verifyEffectivePreviewValues(observations, { ...values, [observations[0].name]: "wrong" }), /differs/);
  const pulled = parsePulledEnvironment(Buffer.from('EXPO_PUBLIC_FIREBASE_API_KEY="abc\\nvalue"\nVERCEL="1"\n'));
  assert.deepEqual(pulled, { EXPO_PUBLIC_FIREBASE_API_KEY: "abc\nvalue", VERCEL: "1" });
  assert.throws(() => parsePulledEnvironment(Buffer.from("DUP=x\nDUP=y\n")), /duplicate/);
});

test("full no-network decision path constructs only Preview config writes and one Preview deployment", () => {
  const link = JSON.parse(read(".vercel/project.json"));
  const project = { name: VERCEL_STAGING_DEPLOYMENT.project, id: link.projectId, owner: { name: "Nurlan Ildirimli's projects", slug: VERCEL_STAGING_DEPLOYMENT.scope }, buildCommand: "npm --workspace @hungrie/restaurant run export:web", outputDirectory: "apps/restaurant/dist", rootDirectory: null };
  const result = evaluateContinuationDecisionPath({ scope: VERCEL_STAGING_DEPLOYMENT.scope, link, account: { username: VERCEL_STAGING_DEPLOYMENT.account }, teams: { teams: [{ id: link.orgId, slug: VERCEL_STAGING_DEPLOYMENT.scope, name: "Nurlan Ildirimli's projects" }] }, project, inventory: { envs: [] }, observations, values, effectiveValues: {} });
  assert.equal(result.terminal, "DRY_RUN_READY");
  assert.equal(result.environmentCommands.length, 9);
  assert.ok(result.environmentCommands.every(args => args.includes("preview") && args.includes("--type") && args.includes("config") && !args.includes("secret") && !args.includes("--sensitive")));
  assert.deepEqual(result.deploymentCommand, previewDeploymentArgs(VERCEL_STAGING_DEPLOYMENT.scope));
  assert.deepEqual(environmentMutationArgs(observations[0].name, VERCEL_STAGING_DEPLOYMENT.scope), ["env", "add", observations[0].name, "preview", "--force", "--type", "config", "--scope", VERCEL_STAGING_DEPLOYMENT.scope]);
  assert.deepEqual({ networkRequests: result.networkRequests, mutations: result.mutations, evidenceDirectoriesCreated: result.evidenceDirectoriesCreated }, { networkRequests: 0, mutations: 0, evidenceDirectoriesCreated: 0 });
});

test("dry-run evidence finalization is deterministic and contains no values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-continuation-dry-run-"));
  try {
    fs.writeFileSync(path.join(directory, "progress.json"), JSON.stringify({ terminal: "DRY_RUN_READY", networkRequests: 0, mutations: 0 }) + "\n", { mode: 0o600 });
    const first = finalizeEvidence(directory);
    const bytes = fs.readFileSync(path.join(directory, "evidence-manifest.tsv"));
    assert.match(bytes.toString(), /^path\tbytes\tsha256\nprogress\.json\t/);
    assert.doesNotMatch(bytes.toString(), /EXPO_PUBLIC|public-/);
    fs.rmSync(path.join(directory, "evidence-manifest.tsv"));
    assert.deepEqual(finalizeEvidence(directory), first);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("actual project-inspect response shape maps owner slug without conflating opaque IDs", () => {
  const link = { projectName: VERCEL_STAGING_DEPLOYMENT.project, orgId: "org", projectId: "project" };
  const remote = { name: VERCEL_STAGING_DEPLOYMENT.project, id: "project", owner: { name: "Nurlan Ildirimli's projects", slug: "nurlan-ildirimli-s-projects" }, buildCommand: "npm --workspace @hungrie/restaurant run export:web", outputDirectory: "apps/restaurant/dist", rootDirectory: null };
  assert.equal(validateRemoteProject(remote, link), true);
  assert.equal(validateRemoteProject({ ...remote, buildCommand: null, outputDirectory: null }, link), true);
  assert.throws(() => validateRemoteProject({ ...remote, id: "wrong" }, link), /identity mismatch/);
  assert.throws(() => validateRemoteProject({ ...remote, owner: { ...remote.owner, slug: "wrong-scope" } }, link), /owner scope mismatch/);
  assert.throws(() => validateRemoteProject({ ...remote, orgId: "wrong" }, link), /conflicting opaque scope/);
  assert.throws(() => validateRemoteProject({ ...remote, outputDirectory: "dist" }, link), /configuration conflicts/);
  assert.throws(() => validateLocalProjectLink({ projectName: "wrong", orgId: "x", projectId: "y" }), /name mismatch/);
});

test("authenticated username, team slug, and opaque org ID are validated independently", () => {
  const link = { orgId: "team-id" };
  const team = { id: "team-id", slug: "nurlan-ildirimli-s-projects", name: "Nurlan Ildirimli's projects" };
  assert.equal(validateAuthenticatedAccount({ username: "nurlanildirimli00-3449" }), true);
  assert.throws(() => validateAuthenticatedAccount({ username: "wrong-user" }), /account mismatch/);
  assert.equal(validateTeamInventory({ teams: [team] }, link), true);
  assert.throws(() => validateTeamInventory({ teams: [{ ...team, id: "wrong" }] }, link), /does not map/);
  assert.throws(() => validateTeamInventory({ teams: [team, { ...team }] }, link), /ambiguous/);
  assert.throws(() => validateTeamInventory({ teams: [] }, link), /missing or ambiguous/);
});

test("latest consumed attempt records the null-target Preview deployment that was rejected before qualification", () => {
  const evidencePath = path.join(root, "secure/restaurant-vercel-staging-deployment/restaurant-vercel-staging-evaluation-20260928h/progress.json");
  const bytes = fs.readFileSync(evidencePath);
  assert.deepEqual(validateConsumedProgress(JSON.parse(bytes), bytes), { deploymentCommands: 1, immediateTargetRepresentationRejected: "NULL", hostedQualificationStarted: false });
  const changed = Buffer.from(bytes.toString().replace('"terminal": "FAIL"', '"terminal": "PASS"'));
  assert.throws(() => validateConsumedProgress(JSON.parse(changed), changed), /hash mismatch/);
});

test("exclusive containment evidence is complete and bound to the preserved deployment", () => {
  const directory = path.join(root, "secure/restaurant-vercel-staging-containment", VERCEL_STAGING_DEPLOYMENT.containmentRecordId);
  assert.equal(validateContainmentEvidence(directory), true);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-containment-tamper-"));
  try {
    for (const name of ["progress.json", "terminal-result.json", "post-containment-http-verification.json", "evidence-manifest.tsv"]) fs.copyFileSync(path.join(directory, name), path.join(temporary, name));
    fs.appendFileSync(path.join(temporary, "terminal-result.json"), " ");
    assert.throws(() => validateContainmentEvidence(temporary), /evidence mismatch/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
