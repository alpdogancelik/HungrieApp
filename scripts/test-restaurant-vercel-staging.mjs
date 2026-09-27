#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import crypto from "node:crypto";
import {
  classifyReviewedVariables,
  deploymentPlan,
  planEnvironmentReconciliation,
  validateAuthenticatedAccount,
  validateConsumedProgress,
  validateLocalProjectLink,
  validateRemoteProject,
  validateTeamInventory,
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

test("security headers preserve the Expo hosting policy", () => {
  const global = config.headers.find(row => row.source === "/(.*)");
  const headers = Object.fromEntries(global.headers.map(row => [row.key, row.value]));
  assert.match(headers["Content-Security-Policy"], /worker-src 'self'/);
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

test("accepted artifact includes routes, critical assets, fonts, worker, and runtime config", () => {
  assert.equal(artifact.files.length, 74);
  assert.equal(artifact.criticalAssets.length, 5);
  assert.ok(artifact.files.some(row => /\.ttf$/.test(row.path)));
  for (const required of ["sw.js", "firebase-config.js", "manifest.webmanifest"]) assert.ok(artifact.files.some(row => row.path === required));
});

test("deployment continuation is isolated, preview-only, one-shot, and exactly scope-bound", () => {
  const plan = deploymentPlan("nurlan-ildirimli-s-projects");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.project, "hungrie-restaurant-web-staging-eval-20260927a");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.actionId, "restaurant-vercel-staging-evaluation-20260927c");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.environment, "preview");
  assert.equal(VERCEL_STAGING_DEPLOYMENT.expectedVariables.length, 9);
  assert.equal(plan.length, 6);
  const serialized = plan.map(row => row.command || "").join("\n");
  assert.doesNotMatch(serialized, /--prod|\s(?:alias|promote|domains?)\s/i);
  assert.match(serialized, /--archive=tgz/);
  assert.match(serialized, /--scope nurlan-ildirimli-s-projects/);
  assert.match(serialized, /--local-config apps\/restaurant\/vercel\.json/);
  assert.match(serialized, /project inspect hungrie-restaurant-web-staging-eval-20260927a --json/);
  assert.doesNotMatch(serialized, /project ls|vercel@60\.1\.3 link/);
  assert.throws(() => deploymentPlan("reviewed-team"), /exact reviewed Vercel scope/);
});

const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const values = Object.fromEntries(VERCEL_STAGING_DEPLOYMENT.expectedVariables.map((name, index) => [name, `public-${index}`]));
const observations = VERCEL_STAGING_DEPLOYMENT.expectedVariables.map(name => ({ name, bytes: Buffer.byteLength(values[name]), sha256: digest(values[name]) }));

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
  const empty = planEnvironmentReconciliation([], observations, values);
  assert.ok(empty.every(row => row.action === "add"));
  const one = [{ key: observations[0].name, type: "config", target: ["preview"], value: values[observations[0].name] }];
  const partial = planEnvironmentReconciliation({ envs: one }, observations, values);
  assert.equal(partial[0].action, "skip");
  assert.ok(partial.slice(1).every(row => row.action === "add"));
  assert.equal(planEnvironmentReconciliation({ envs: [{ ...one[0], type: "encrypted" }] }, observations, values)[0].action, "skip");
  const mismatch = planEnvironmentReconciliation({ envs: [{ ...one[0], type: "secret" }] }, observations, values);
  assert.equal(mismatch[0].action, "replace");
  assert.throws(() => planEnvironmentReconciliation({ envs: [one[0], one[0]] }, observations, values), /Duplicate/);
  assert.throws(() => planEnvironmentReconciliation({ envs: [{ key: "UNREVIEWED", type: "config", target: ["preview"], value: "x" }] }, observations, values), /Unexpected/);
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

test("consumed attempt permits only the reviewed create/link then failed first variable write", () => {
  const evidencePath = path.join(root, "secure/restaurant-vercel-staging-deployment/restaurant-vercel-staging-evaluation-20260927b/progress.json");
  const bytes = fs.readFileSync(evidencePath);
  assert.deepEqual(validateConsumedProgress(JSON.parse(bytes), bytes), { completedProjectCreationInOriginalAttempt: true, successfulEnvironmentWrites: 0, deploymentCommands: 0 });
  const changed = Buffer.from(bytes.toString().replace('"terminal": "FAIL"', '"terminal": "PASS"'));
  assert.throws(() => validateConsumedProgress(JSON.parse(changed), changed), /hash mismatch/);
});
