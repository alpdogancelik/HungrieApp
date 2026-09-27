#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DIAGNOSTIC_OPERATOR, verifyLocalExportOutput } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { validateStagingPublicBuildInputs } from "./restaurant-alias-staging-public-build-inputs.mjs";
import { validateVercelProjectConfiguration } from "./deploy-restaurant-vercel-staging.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/restaurant");
const secureInputs = path.join(root, "secure/restaurant-alias-build-inputs/staging-preview.json");
const outputPath = path.resolve(process.argv.find(value => value.startsWith("--output="))?.slice(9) || path.join(root, "docs/restaurant-vercel-staging-local-qualification.json"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-vercel-staging-"));
const dist = path.join(appRoot, "dist");
const config = JSON.parse(fs.readFileSync(path.join(appRoot, "vercel.json"), "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const results = [];
const record = (name, status, detail = {}) => results.push({ name, status, ...detail });

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...options });
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  record(name, result.status === 0 ? "PASS" : "FAIL", { exitCode: result.status, outputSha256: sha256(combined), diagnostic: result.status === 0 ? undefined : combined.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(-2000) });
  return result.status === 0;
}

function loadEnvironment() {
  const stat = fs.statSync(secureInputs);
  if ((stat.mode & 0o077) !== 0) throw new Error("Staging build-input file must be mode 0600 or stricter.");
  const parsed = JSON.parse(fs.readFileSync(secureInputs, "utf8"));
  const environment = { ...process.env, ...parsed.values };
  const validation = validateStagingPublicBuildInputs({ root, environment });
  if (validation.contractSha256 !== DIAGNOSTIC_OPERATOR.buildInputContractSha256) throw new Error("Reviewed Staging build-input contract mismatch.");
  record("staging-public-build-inputs", "PASS", { contractSha256: validation.contractSha256, variableCount: validation.observations.length, valuesPersisted: false });
  return environment;
}

function responseHeaders(urlPath) {
  const headers = {};
  for (const rule of config.headers) {
    const source = rule.source;
    const matches = source === "/(.*)" || source === urlPath || (source === "/_expo/static/(.*)" && urlPath.startsWith("/_expo/static/")) || (source === "/assets/(.*)" && urlPath.startsWith("/assets/"));
    if (matches) for (const row of rule.headers) headers[row.key] = row.value;
  }
  if (urlPath === "/" || /^\/(?:\+not-found|_sitemap|dashboard|earnings|forgot-password|history|invite|login|menu|more|orders|pending|restaurant|reviews|security|settings|suspended)$/.test(urlPath) || /^\/orders\/[^/]+$/.test(urlPath)) headers["Cache-Control"] = "private, no-cache, no-store, max-age=0, must-revalidate";
  return headers;
}

function resolvePath(urlPath) {
  if (urlPath === "/") return "index.html";
  const relative = decodeURIComponent(urlPath.slice(1));
  if (fs.existsSync(path.join(dist, relative)) && fs.statSync(path.join(dist, relative)).isFile()) return relative;
  if (fs.existsSync(path.join(dist, `${relative}.html`))) return `${relative}.html`;
  if (/^orders\/[^/]+$/.test(relative) && relative !== "orders/detail") return "orders/[orderId].html";
  return null;
}

function contentType(relative) {
  if (relative.endsWith(".html")) return "text/html; charset=utf-8";
  if (relative.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (relative.endsWith(".css")) return "text/css; charset=utf-8";
  if (relative.endsWith(".webmanifest") || relative.endsWith(".json")) return "application/json; charset=utf-8";
  if (relative.endsWith(".ttf")) return "font/ttf";
  if (relative.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function qualifyHttp(files) {
  const server = http.createServer((request, response) => {
    const urlPath = new URL(request.url, "http://localhost").pathname;
    const relative = resolvePath(urlPath);
    if (!relative) { response.writeHead(404, { "Cache-Control": "private, no-store" }); response.end("Not found"); return; }
    response.writeHead(200, { "Content-Type": contentType(relative), ...responseHeaders(urlPath) });
    response.end(fs.readFileSync(path.join(dist, relative)));
  });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const routes = files.filter(row => row.path.endsWith(".html"));
    for (const route of routes) {
      const clean = route.path === "index.html" ? "/" : `/${route.path.slice(0, -5)}`;
      const response = await fetch(`${origin}${clean}`);
      if (response.status !== 200 || sha256(Buffer.from(await response.arrayBuffer())) !== route.sha256) throw new Error(`Direct route parity failed: ${clean}`);
      if (!/no-store/.test(response.headers.get("cache-control") || "")) throw new Error(`Direct route cache policy failed: ${clean}`);
    }
    const dynamic = await fetch(`${origin}/orders/test-order-id`);
    if (dynamic.status !== 200) throw new Error("Dynamic order route did not resolve.");
    for (const file of files.filter(row => /^(?:_expo\/static\/|assets\/)/.test(row.path))) {
      const response = await fetch(`${origin}/${file.path}`);
      if (response.status !== 200 || sha256(Buffer.from(await response.arrayBuffer())) !== file.sha256) throw new Error(`Static asset parity failed: ${file.path}`);
      if (!/immutable/.test(response.headers.get("cache-control") || "")) throw new Error(`Static asset cache policy failed: ${file.path}`);
    }
    for (const runtime of ["sw.js", "firebase-config.js", "manifest.webmanifest"]) {
      const expected = files.find(row => row.path === runtime);
      const response = await fetch(`${origin}/${runtime}`);
      if (response.status !== 200 || sha256(Buffer.from(await response.arrayBuffer())) !== expected.sha256) throw new Error(`Runtime file parity failed: ${runtime}`);
    }
    const missing = await fetch(`${origin}/missing-required-asset.js`);
    if (missing.status !== 404) throw new Error("Missing assets must remain HTTP 404.");
    const favicon = await fetch(`${origin}/favicon.ico`);
    if (favicon.status !== 404) throw new Error("Absent optional favicon must remain HTTP 404.");
    record("vercel-compatible-http-delivery", "PASS", { routes: routes.length, assets: files.filter(row => /^(?:_expo\/static\/|assets\/)/.test(row.path)).length, runtimeFiles: 3, dynamicOrderRoute: true, missingAssetStatus: 404, optionalFaviconStatus: 404 });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

try {
  validateVercelProjectConfiguration(config);
  record("vercel-project-configuration", "PASS", { headerRules: config.headers.length, rewriteRules: config.rewrites.length, rejectedExpressionAbsent: true });
  const environment = loadEnvironment();
  fs.rmSync(dist, { recursive: true, force: true });
  if (!run("restaurant-static-export", "npm", ["run", "export:web", "--", "--clear"], { cwd: appRoot, env: environment })) throw new Error("Restaurant export failed.");
  const archivePath = path.join(temporary, "restaurant-static-export.tar");
  const verified = verifyLocalExportOutput({ distDirectory: dist, archivePath });
  if (verified.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || verified.archive.sha256 !== DIAGNOSTIC_OPERATOR.archiveSha256 || verified.files.length !== 74) throw new Error("Fresh export differs from the accepted 74-file artifact.");
  record("accepted-artifact-parity", "PASS", { files: verified.files.length, artifactManifestSha256: verified.artifactManifestSha256, archiveSha256: verified.archive.sha256 });
  await qualifyHttp(verified.files);
  run("vercel-contract-tests", "node", ["--test", "scripts/test-restaurant-vercel-staging.mjs"]);
  run("restaurant-typecheck", "npm", ["--workspace", "@hungrie/restaurant", "run", "typecheck"]);
  run("four-account-local-browser", "node", ["scripts/qualify-restaurant-authgate-pending-local.mjs"], { env: { ...process.env, RESTAURANT_LOCAL_EVIDENCE_DIR: path.join(temporary, "browser") } });
  run("notification-worker-tests", "npm", ["run", "notification-worker:test"]);
  run("git-diff-check", "git", ["diff", "--check"]);
} catch (error) {
  record("qualification", "FAIL", { diagnostic: String(error?.message || error).slice(0, 1000) });
}

const passed = results.length > 0 && results.every(row => row.status === "PASS");
const report = { schemaVersion: 1, capturedAt: new Date().toISOString(), classification: passed ? "PASS" : "FAIL", passed, mode: "local-only Vercel-compatible static delivery; no Vercel API or deployment access", checkpoint: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(), applicationTree: spawnSync("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim(), acceptedArtifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256 }, results, hostedRequests: 0, credentialsPersisted: false };
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed, outputPath, reportSha256: sha256(fs.readFileSync(outputPath)) })}\n`);
fs.rmSync(temporary, { recursive: true, force: true });
if (!passed) process.exitCode = 1;
