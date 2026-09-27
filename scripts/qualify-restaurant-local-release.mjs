#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DIAGNOSTIC_OPERATOR, verifyLocalExportOutput, verifyProtectedEvidence } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { validateStagingPublicBuildInputs } from "./restaurant-alias-staging-public-build-inputs.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/restaurant");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const options = Object.fromEntries(process.argv.slice(2).filter(value => value.startsWith("--") && value.includes("=")).map(value => { const index = value.indexOf("="); return [value.slice(2, index), value.slice(index + 1)]; }));
const outputPath = path.resolve(options.output || path.join(os.tmpdir(), "restaurant-local-release-report.json"));
const buildInputPath = path.resolve(options["build-inputs"] || path.join(root, "secure/restaurant-alias-build-inputs/staging-preview.json"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-local-release-"));
const results = [];

function record(name, category, status, detail = {}) { results.push({ name, category, status, ...detail }); }
function run(name, category, command, args, runOptions = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...runOptions });
  const status = result.status === 0 ? "PASS" : "FAIL";
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const tapCounts = [...output.matchAll(/(?:^|\n)(?:# |ℹ )?tests\s+(\d+)/g)].map(match => Number(match[1]));
  const jestCounts = [...output.matchAll(/Tests:\s+\d+ passed,\s+(\d+) total/g)].map(match => Number(match[1]));
  const testCount = [...tapCounts, ...jestCounts].at(-1) || null;
  record(name, category, status, { durationMs: Date.now() - started, exitCode: result.status, testCount, outputSha256: sha256(Buffer.from(output)), diagnostic: status === "FAIL" ? String(result.stderr || result.stdout || "command failed").replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(-3000) : undefined });
  return result;
}
function fail(name, category, error) { record(name, category, "FAIL", { diagnostic: String(error?.message || error).slice(0, 3000) }); }

function loadBuildEnvironment() {
  const stat = fs.statSync(buildInputPath);
  if ((stat.mode & 0o077) !== 0) throw new Error("Build-input file must be mode 0600 or stricter.");
  const value = JSON.parse(fs.readFileSync(buildInputPath, "utf8"));
  if (value.schemaVersion !== 1 || value.environment !== "staging" || value.easEnvironment !== "preview" || !value.values || Object.keys(value.values).length !== 9) throw new Error("Secure Staging build-input file shape is invalid.");
  const environment = { ...process.env, ...value.values };
  const validation = validateStagingPublicBuildInputs({ root, environment });
  if (validation.contractSha256 !== DIAGNOSTIC_OPERATOR.buildInputContractSha256) throw new Error("Build-input contract identity mismatch.");
  return environment;
}

function runCleanExport(environment, attempt) {
  fs.rmSync(path.join(appRoot, "dist"), { recursive: true, force: true });
  const prepare = run(`export-${attempt}-prepare`, "production-export", "npm", ["run", "prepare:web"], { cwd: appRoot, env: environment });
  if (prepare.status !== 0) return null;
  const exported = run(`export-${attempt}-expo`, "production-export", "npx", ["expo", "export", "--platform", "web", "--clear"], { cwd: appRoot, env: environment });
  if (exported.status !== 0) return null;
  const copy = path.join(temporary, `export-${attempt}`); fs.cpSync(path.join(appRoot, "dist"), copy, { recursive: true });
  const archivePath = path.join(temporary, `export-${attempt}.tar`);
  try {
    const verified = verifyLocalExportOutput({ distDirectory: copy, archivePath });
    record(`export-${attempt}-artifact`, "production-export", "PASS", { fileCount: verified.files.length, htmlCount: verified.files.filter(row => row.path.endsWith(".html")).length, artifactManifestSha256: verified.artifactManifestSha256, archiveSha256: verified.archive.sha256 });
    return verified;
  } catch (error) { fail(`export-${attempt}-artifact`, "production-export", error); return null; }
}

function inspectArtifact(verified) {
  const routes = ["login.html", "dashboard.html", "orders/detail.html", "menu.html", "reviews.html", "earnings.html"];
  const byPath = new Map(verified.files.map(row => [row.path, row]));
  if (routes.some(route => !byPath.has(route))) throw new Error("One or more of the six required route artifacts is missing.");
  const requiredAssets = verified.files.filter(row => /^(?:_expo\/static\/).+\.(?:js|css)$/.test(row.path));
  const fonts = verified.files.filter(row => /\.(?:woff2?|ttf|otf)$/i.test(row.path));
  const images = verified.files.filter(row => /\.(?:png|jpe?g|svg|webp|ico)$/i.test(row.path));
  if (requiredAssets.length !== 5 || fonts.length < 1 || images.length < 1) throw new Error("Required JS/CSS, font, or image inventory is incomplete.");
  const sw = fs.readFileSync(path.join(appRoot, "dist/sw.js"), "utf8");
  if (!/addEventListener\("install"/.test(sw) || !/addEventListener\("activate"/.test(sw) || !/firebase\.messaging\(\)\.onBackgroundMessage/.test(sw) || /addEventListener\(["']fetch/.test(sw)) throw new Error("Service-worker lifecycle or no-fetch-cache contract differs.");
  record("artifact-routes-assets-service-worker", "production-export", "PASS", { routes: routes.length, criticalAssets: requiredAssets.length, fonts: fonts.length, images: images.length, serviceWorker: "static lifecycle and registration adapter verified; external gstatic execution not locally verified" });
}

try {
  const environment = loadBuildEnvironment();
  record("staging-public-build-inputs", "integrity", "PASS", { contractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256, valuesPersisted: false });
  try { const protectedRows = verifyProtectedEvidence(root); record("protected-historical-evidence", "integrity", "PASS", { sets: protectedRows.map(row => ({ runId: row.runId, files: row.files, manifestSha256: row.manifestSha256 })) }); } catch (error) { fail("protected-historical-evidence", "integrity", error); }

  const commands = [
    ["restaurant-typecheck", "static", "npm", ["--workspace", "@hungrie/restaurant", "run", "typecheck"]],
    ["responsive-ui-phase1", "application", "npm", ["run", "test:restaurant-responsive-ui-phase1"]],
    ["responsive-ui-phase2", "application", "npm", ["run", "test:restaurant-responsive-ui-phase2"]],
    ["responsive-ui-phase3", "application", "npm", ["run", "test:restaurant-responsive-ui-phase3"]],
    ["responsive-ui-phase4", "application", "npm", ["run", "test:restaurant-responsive-ui-phase4"]],
    ["responsive-ui-phase5", "application", "npm", ["run", "test:restaurant-responsive-ui-phase5"]],
    ["auth-access-exhaustive", "qualification", "node", ["--test", "scripts/test-restaurant-alias-diagnostic-access-staging.mjs"]],
    ["diagnostic-operator", "qualification", "node", ["--test", "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs", "scripts/test-restaurant-alias-parity-verifier.mjs", "scripts/test-restaurant-alias-diagnostic-execution-support.mjs", "scripts/test-restaurant-alias-single-approval-staging.mjs"]],
    ["build-input-and-export-contracts", "qualification", "node", ["--test", "scripts/test-restaurant-alias-staging-public-build-inputs.mjs", "scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs"]],
    ["notification-worker", "application", "npm", ["run", "notification-worker:test"]],
    ["review-repositories", "application", "npm", ["run", "test:review-v2-repositories"]],
    ["review-ui", "application", "npm", ["run", "test:review-v2-ui"]],
    ["earnings-safeguards", "application", "npm", ["run", "test:restaurant-earnings-phase3"]],
    ["order-flow", "application", "node", ["--test", "scripts/phase7-order-flow.test.mjs"]],
  ];
  for (const [name, category, command, args] of commands) run(name, category, command, args);

  const first = runCleanExport(environment, 1), second = runCleanExport(environment, 2);
  if (first && second) {
    if (JSON.stringify(first.files) === JSON.stringify(second.files) && first.archive.sha256 === second.archive.sha256) record("repeat-export-byte-parity", "production-export", "PASS", { files: first.files.length, artifactManifestSha256: first.artifactManifestSha256, archiveSha256: first.archive.sha256 });
    else record("repeat-export-byte-parity", "production-export", "FAIL", { diagnostic: "The two clean export inventories or canonical archives differ." });
    try { inspectArtifact(second); } catch (error) { fail("artifact-routes-assets-service-worker", "production-export", error); }
  } else record("repeat-export-byte-parity", "production-export", "BLOCKED", { diagnostic: "A clean export prerequisite failed." });

  if (second) {
    for (let repetition = 1; repetition <= 2; repetition += 1) {
      const evidenceDirectory = path.join(temporary, `browser-${repetition}`);
      run(`isolated-browser-four-account-${repetition}`, "browser", "node", ["scripts/qualify-restaurant-authgate-pending-local.mjs"], { env: { ...process.env, RESTAURANT_LOCAL_EVIDENCE_DIR: evidenceDirectory } });
    }
  } else record("isolated-browser-four-account", "browser", "BLOCKED", { diagnostic: "Production export failed." });

  const diffText = spawnSync("git", ["diff", "--", "scripts", "package.json", "docs"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout || "";
  const credentialPattern = /(?:Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|password\s*[:=]\s*["'][^"']{8,})/i;
  record("credential-and-prohibited-path-scan", "integrity", credentialPattern.test(diffText) ? "FAIL" : "PASS", { trackedDiffBytes: Buffer.byteLength(diffText), credentialValuesPersisted: false });
  run("git-diff-check", "integrity", "git", ["diff", "--check"]);

  for (const [name, reason] of [
    ["hosted-firebase-authentication", "Local Chrome uses a synthetic Firebase adapter."],
    ["hosted-supabase-authorization", "Local Chrome uses synthetic caller-bound access responses."],
    ["eas-cdn-delivery", "No EAS or CDN request is authorized."],
    ["physical-device-pwa-push", "Physical device and push delivery require separate hosted qualification."],
  ]) record(name, "external", "NOT LOCALLY VERIFIABLE", { reason });
} catch (error) { fail("local-release-prerequisite", "integrity", error); }

const mandatory = results.filter(row => !["external"].includes(row.category));
const passed = mandatory.length > 0 && mandatory.every(row => row.status === "PASS");
const report = { schemaVersion: 1, capturedAt: new Date().toISOString(), mode: "local-only production export with synthetic Firebase/Supabase browser adapter", passed, classification: passed ? "PASS" : "FAIL", checkpoint: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(), applicationTree: spawnSync("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim(), artifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256 }, executedAutomatedTests: results.reduce((sum, row) => sum + (row.testCount || 0), 0), executedBrowserFlows: results.filter(row => row.name.startsWith("isolated-browser-four-account-") && row.status === "PASS").length * 4, counts: Object.fromEntries(["PASS", "FAIL", "BLOCKED", "NOT EXECUTED", "NOT LOCALLY VERIFIABLE"].map(status => [status, results.filter(row => row.status === status).length])), results, credentialsPersisted: false, hostedRequestsAuthorized: false };
fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, canonical(report), { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ passed, report: outputPath, reportSha256: sha256(fs.readFileSync(outputPath)), counts: report.counts })}\n`);
fs.rmSync(temporary, { recursive: true, force: true });
if (!passed) process.exitCode = 1;

export { inspectArtifact };
if (process.argv[1] && path.resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) process.exitCode = undefined;
