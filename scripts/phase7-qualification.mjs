import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendEvidence, atomicWriteJson, dueSoakJourneys, PHASE7_CONTRACT, stableOperationId } from "./phase7-runner-lib.mjs";
import { inspectPowerPreflight } from "./phase7-power.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase/migrations/20260918100000_phase7_staging_reliability.sql");
const registryPath = path.join(root, "secure/supabase-projects.local.json");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function projectIdentity() {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const staging = registry.projects?.staging;
  if (!staging?.ref || !staging?.url || !staging?.publishableKey || !staging?.databasePassword || staging.name !== "HungrieApp Staging") throw new Error("Complete Staging registry configuration is required.");
  const otherRefs = [registry.projects?.development?.ref, registry.projects?.production?.ref].filter(Boolean);
  if (otherRefs.includes(staging.ref)) throw new Error("Staging overlaps another environment.");
  if (/prod/i.test(`${staging.name} ${staging.url}`)) throw new Error("Production-like target rejected.");
  return { registry, staging };
}

function launchAgentStatus() {
  const result = run(process.execPath, [path.join(root, "scripts/phase7-launch-agent.mjs"), "status"]);
  if (result.status !== 0) throw new Error("Unable to inspect the Phase 7 LaunchAgent.");
  return JSON.parse(result.stdout);
}

function verifyManifestSource(manifest) {
  const commit = run("/usr/bin/git", ["rev-parse", "HEAD"]);
  if (commit.status !== 0 || commit.stdout.trim() !== manifest.sourceCommit) throw new Error("Runner source commit differs from the immutable run manifest.");
  const migrationSha256 = sha256(fs.readFileSync(migrationPath));
  if (manifest.migrationSha256 !== migrationSha256) throw new Error("Runner migration checksum differs from the immutable run manifest.");
  return migrationSha256;
}

async function queryStaging(sql) {
  const { staging } = projectIdentity();
  const token = fs.readFileSync(path.join(root, "secure/supabase-cli-hungrie/access-token"), "utf8").trim();
  const response = await fetch(`https://api.supabase.com/v1/projects/${staging.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Staging SQL query failed (${response.status}); details withheld.`);
  const rows = await response.json(); if (!Array.isArray(rows)) throw new Error("Staging SQL response was malformed.");
  return rows;
}

async function monitor(runDirectory, state, now) {
  const [health] = await queryStaging(`select
    statement_timestamp() as sampled_at,
    (select count(*)::integer from public.orders where approval_deadline_at < statement_timestamp() and status='pending') as overdue_pending_orders,
    (select count(*)::integer from private.restaurant_operational_incidents where state<>'resolved') as unresolved_incidents,
    (select count(*)::integer from private.notification_deliveries where state in('pending','processing')) as notification_backlog,
    (select max(end_time) from cron.job_run_details where status='succeeded') as latest_job_run_at`);
  appendEvidence(path.join(runDirectory, "health.jsonl"), { at: now.toISOString(), ...health });
  state.lastHealthAt = now.toISOString();
}

function markComplete(runDirectory, state, result, now) {
  state.status = "completed"; state.completedAt = now.toISOString(); state.result = result;
  appendEvidence(path.join(runDirectory, "events.jsonl"), { at: now.toISOString(), type: "run.completed", result });
}

async function runPreflight({ runDirectory, manifest, state, now }) {
  const migrationSha256 = verifyManifestSource(manifest);
  const { staging } = projectIdentity();
  const power = inspectPowerPreflight({ runnerPath: path.join(root, "scripts/phase7-runner.mjs"), evidenceRoot: path.join(root, "secure/phase7"), launchAgentStatus: launchAgentStatus(), now });
  atomicWriteJson(path.join(runDirectory, "power-preflight.json"), power);
  if (!power.passed) throw new Error(`Power preflight failed: ${power.failures.join(" ")}`);
  const [database] = await queryStaging("select current_database() database, current_setting('server_version') server_version");
  markComplete(runDirectory, state, { passed: true, environment: "staging", projectRefDigest: sha256(staging.ref).slice(0, 16), migrationSha256, databaseVersion: database.server_version, launchAgentLoginRequiredAfterReboot: true }, now);
}

async function runSoakTick({ runDirectory, manifest, state, now }) {
  verifyManifestSource(manifest);
  await monitor(runDirectory, state, now);
  const fixtures = path.join(root, "secure/phase7/fixtures.json");
  if (!fs.existsSync(fixtures)) throw new Error("Guarded soak fixtures have not been prepared.");
  const executor = path.join(root, "scripts/phase7-real-contract-journey.mjs");
  for (const journey of dueSoakJourneys(state, now)) {
    journey.state = "running"; journey.startedAt ||= now.toISOString();
    atomicWriteJson(path.join(runDirectory, "state.json"), state);
    const result = run(process.execPath, [executor, "--run-directory", runDirectory, "--journey", String(journey.index)]);
    if (result.status !== 0) throw new Error(`Guarded real-contract journey ${journey.index} failed; sensitive details withheld.`);
    const outcome = JSON.parse(result.stdout);
    if (!outcome.authoritativeTerminalState) throw new Error(`Journey ${journey.index} lacks authoritative terminal verification.`);
    journey.state = "completed"; journey.completedAt = new Date().toISOString(); journey.orderIdDigest = outcome.orderIdDigest;
    state.progress.completed = state.journeys.filter(value => value.state === "completed").length;
    appendEvidence(path.join(runDirectory, "journeys.jsonl"), { at: journey.completedAt, journey: journey.index, ...outcome });
  }
  if (now.getTime() >= Date.parse(state.plannedEndAt) && state.progress.completed === PHASE7_CONTRACT.automatedSoakJourneys) markComplete(runDirectory, state, { automatedJourneys: state.progress.completed }, now);
}

async function runExternalKind({ runDirectory, manifest, state, now }) {
  verifyManifestSource(manifest);
  const executor = path.join(root, "scripts/phase7-guarded-qualification.mjs");
  const result = run(process.execPath, [executor, state.kind, "--run-directory", runDirectory]);
  if (result.status !== 0) throw new Error(`${state.kind} qualification failed; inspect owner-only evidence.`);
  const outcome = JSON.parse(result.stdout);
  if (!outcome.passed) throw new Error(`${state.kind} qualification did not pass.`);
  markComplete(runDirectory, state, outcome, now);
}

export async function executeQualificationTick(context) {
  if (context.state.kind === "preflight") return runPreflight(context);
  if (context.state.kind === "soak") return runSoakTick(context);
  return runExternalKind(context);
}
