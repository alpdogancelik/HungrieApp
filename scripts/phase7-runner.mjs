#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireRunLock, appendEvidence, createRun, finalizeEvidence, loadRun, persistState, recordHeartbeat, requestStop, runnerSourceSha256, verifyFinalEvidence } from "./phase7-runner-lib.mjs";
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
    const stopRequestFile = path.join(directory, "stop-request.json");
    if (fs.existsSync(stopRequestFile)) {
      const stopRequest = JSON.parse(fs.readFileSync(stopRequestFile, "utf8"));
      state.stopRequestedAt = stopRequest.requestedAt;
      state.status = "stopped"; state.stoppedAt = now.toISOString();
      appendEvidence(path.join(directory, "events.jsonl"), { at: now.toISOString(), type: "run.stopped" });
      persistState(directory, state);
      finalizeEvidence(directory, { status: state.status, progress: state.progress, failure: state.failure }, new Date());
      return state;
    }
    if (state.status === "created") {
      state.status = "running"; state.runnerStartedAt = now.toISOString();
      appendEvidence(path.join(directory, "events.jsonl"), { at: now.toISOString(), type: "run.started" });
    }
    recordHeartbeat(directory, state, now);
    try {
      await executeQualificationTick({ runDirectory: directory, manifest, state, now });
    } catch (error) {
      if (error?.deferred) {
        appendEvidence(path.join(directory, "events.jsonl"), { at: new Date().toISOString(), type: "run.deferred_to_surviving_worker" });
        persistState(directory, state); return state;
      }
      if (error?.stopped) {
        const stopRequest = JSON.parse(fs.readFileSync(path.join(directory, "stop-request.json"), "utf8"));
        state.stopRequestedAt = stopRequest.requestedAt; state.status = "stopped"; state.stoppedAt = new Date().toISOString();
        appendEvidence(path.join(directory, "events.jsonl"), { at: state.stoppedAt, type: "run.stopped" });
      } else {
        state.status = "failed"; state.failedAt = new Date().toISOString(); state.failure = { message: error instanceof Error ? error.message : String(error) };
        appendEvidence(path.join(directory, "events.jsonl"), { at: state.failedAt, type: "run.failed", message: state.failure.message });
      }
    }
    persistState(directory, state);
    if (terminal.has(state.status)) finalizeEvidence(directory, { status: state.status, progress: state.progress, failure: state.failure }, new Date());
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
  const trackedChanges = git(["status", "--porcelain"]);
  if (trackedChanges.status !== 0 || trackedChanges.stdout.trim()) throw new Error("Commit or restore source changes before starting immutable Phase 7 evidence.");
  if (!fs.existsSync(migration)) throw new Error("Phase 7 migration is missing.");
  const created = createRun({ phaseRoot, runId: arg("--run-id") || crypto.randomUUID(), kind, commit: head.stdout.trim(), migrationSha256: sha256(fs.readFileSync(migration)), runnerSha256: runnerSourceSha256(root) });
  console.log(JSON.stringify({ runId: created.manifest.runId, kind, status: created.state.status, evidenceDirectory: created.runDirectory, loginRequiredAfterReboot: true }));
} else if (command === "status") {
  const id = arg("--run-id");
  if (id) console.log(JSON.stringify(loadRun(runDirectory(id)).state));
  else console.log(JSON.stringify(listRunnable().map(directory => loadRun(directory).state)));
} else if (command === "resume") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required.");
  const directory = runDirectory(id), release = acquireRunLock(directory);
  try { const { state } = loadRun(directory); if (state.status === "failed" || state.status === "stopped") { state.status = "running"; state.failure = null; state.stopRequestedAt = null; try { fs.unlinkSync(path.join(directory, "stop-request.json")); } catch (error) { if (error?.code !== "ENOENT") throw error; } persistState(directory, state); appendEvidence(path.join(directory, "events.jsonl"), { at: new Date().toISOString(), type: "run.resumed" }); } } finally { release(); }
  console.log(JSON.stringify({ runId: id, resumed: true }));
} else if (command === "stop") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required."); console.log(JSON.stringify(requestStop(runDirectory(id))));
} else if (command === "verify") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required.");
  const { state } = loadRun(runDirectory(id)); const final = path.join(runDirectory(id), "final-evidence.json");
  if (!terminal.has(state.status) || !fs.existsSync(final)) throw new Error("Run has no finalized evidence.");
  const verified = verifyFinalEvidence(runDirectory(id));
  console.log(JSON.stringify({ runId: id, status: state.status, finalizedAt: verified.finalizedAt, continuityGaps: verified.continuityGaps, evidenceFileCount: Object.keys(verified.sha256 || {}).length, finalEvidenceSha256: sha256(fs.readFileSync(final)) }));
} else if (command === "tick") {
  const id = arg("--run-id"); if (!id) throw new Error("--run-id is required."); console.log(JSON.stringify(await tick(runDirectory(id))));
} else if (command === "daemon") {
  let stopping = false; process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
  while (!stopping) {
    for (const directory of listRunnable()) await tick(directory);
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
} else throw new Error("Use start, status, resume, stop, verify, tick, or daemon.");
