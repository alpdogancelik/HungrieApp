#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireRunLock, appendEvidence, createRun, finalizeEvidence, loadRun, persistState, recordHeartbeat, requestStop, verifyFinalEvidence } from "./phase7-runner-lib.mjs";
import { executeQualificationTick } from "./phase7-qualification.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phaseRoot = path.join(root, "secure/phase7");
const migration = path.join(root, "supabase/migrations/20260918100000_phase7_staging_reliability.sql");
const command = process.argv[2] || "status";
const arg = name => { const at = process.argv.indexOf(name); if (at >= 0) return process.argv[at + 1]; return process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1); };
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const git = args => spawnSync("/usr/bin/git", args, { cwd: root, encoding: "utf8" });
const runDirectory = runId => path.join(phaseRoot, runId);
const terminal = new Set(["completed", "failed", "stopped"]);

async function tick(directory, now = new Date()) {
  const release = acquireRunLock(directory, now);
  try {
    const { manifest, state } = loadRun(directory);
    if (terminal.has(state.status)) return state;
    if (state.stopRequestedAt) {
      state.status = "stopped"; state.stoppedAt = now.toISOString();
      appendEvidence(path.join(directory, "events.jsonl"), { at: now.toISOString(), type: "run.stopped" });
      persistState(directory, state); return state;
    }
    if (state.status === "created") {
      state.status = "running"; state.runnerStartedAt = now.toISOString();
      appendEvidence(path.join(directory, "events.jsonl"), { at: now.toISOString(), type: "run.started" });
    }
    recordHeartbeat(directory, state, now);
    try {
      await executeQualificationTick({ runDirectory: directory, manifest, state, now });
    } catch (error) {
      state.status = "failed"; state.failedAt = now.toISOString(); state.failure = { message: error instanceof Error ? error.message : String(error) };
      appendEvidence(path.join(directory, "events.jsonl"), { at: now.toISOString(), type: "run.failed", message: state.failure.message });
    }
    persistState(directory, state);
    if (terminal.has(state.status)) finalizeEvidence(directory, { status: state.status, progress: state.progress, failure: state.failure }, now);
    return state;
  } finally { release(); }
}

function listRunnable() {
  if (!fs.existsSync(phaseRoot)) return [];
  return fs.readdirSync(phaseRoot).filter(name => /^[0-9a-f-]{36}$/.test(name)).map(name => runDirectory(name)).filter(directory => {
    try { return !terminal.has(loadRun(directory).state.status); } catch { return false; }
  });
}

if (command === "start") {
  const kind = arg("--kind"), head = git(["rev-parse", "HEAD"]);
  if (head.status !== 0) throw new Error("Unable to determine the source commit.");
  if (!fs.existsSync(migration)) throw new Error("Phase 7 migration is missing.");
  const created = createRun({ phaseRoot, runId: arg("--run-id") || crypto.randomUUID(), kind, commit: head.stdout.trim(), migrationSha256: sha256(fs.readFileSync(migration)) });
  console.log(JSON.stringify({ runId: created.manifest.runId, kind, status: created.state.status, evidenceDirectory: created.runDirectory, loginRequiredAfterReboot: true }));
} else if (command === "status") {
  const id = arg("--run-id");
  if (id) console.log(JSON.stringify(loadRun(runDirectory(id)).state));
  else console.log(JSON.stringify(listRunnable().map(directory => loadRun(directory).state)));
} else if (command === "resume") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required.");
  const directory = runDirectory(id), release = acquireRunLock(directory);
  try { const { state } = loadRun(directory); if (state.status === "failed" || state.status === "stopped") { state.status = "running"; state.failure = null; state.stopRequestedAt = null; persistState(directory, state); appendEvidence(path.join(directory, "events.jsonl"), { at: new Date().toISOString(), type: "run.resumed" }); } } finally { release(); }
  console.log(JSON.stringify({ runId: id, resumed: true }));
} else if (command === "stop") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required."); console.log(JSON.stringify(requestStop(runDirectory(id))));
} else if (command === "verify") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required.");
  const { state } = loadRun(runDirectory(id)); const final = path.join(runDirectory(id), "final-evidence.json");
  if (!terminal.has(state.status) || !fs.existsSync(final)) throw new Error("Run has no finalized evidence.");
  console.log(JSON.stringify({ runId: id, status: state.status, finalEvidence: verifyFinalEvidence(runDirectory(id)) }));
} else if (command === "tick") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required."); console.log(JSON.stringify(await tick(runDirectory(id))));
} else if (command === "daemon") {
  let stopping = false; process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
  while (!stopping) {
    for (const directory of listRunnable()) await tick(directory);
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
} else throw new Error("Use start, status, resume, stop, verify, tick, or daemon.");
