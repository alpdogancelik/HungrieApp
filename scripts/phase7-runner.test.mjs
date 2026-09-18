import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import {
  acquirePidLock, acquireRunLock, atomicWriteJson, continuityGaps, createRun, loadRun,
  dueSoakJourneys, finalizeEvidence, requestStop, runnerSourceSha256, stableOperationId, verifyFinalEvidence,
} from "./phase7-runner-lib.mjs";

const commit = "a".repeat(40), migrationSha256 = "b".repeat(64), runnerSha256 = "c".repeat(64);
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-phase7-runner-"));

test("stable operation IDs survive restart and distinguish steps", () => {
  const first = stableOperationId("00000000-0000-4000-8000-000000000001", 7, "create");
  assert.equal(first, stableOperationId("00000000-0000-4000-8000-000000000001", 7, "create"));
  assert.notEqual(first, stableOperationId("00000000-0000-4000-8000-000000000001", 7, "delivered"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("runner checksum is deterministic and ignores test-only sources", () => {
  const root = temporary(), scripts = path.join(root, "scripts");
  fs.mkdirSync(scripts);
  fs.writeFileSync(path.join(scripts, "phase7-a.mjs"), "a\n");
  fs.writeFileSync(path.join(scripts, "phase7-b.mjs"), "b\n");
  fs.writeFileSync(path.join(scripts, "phase7-a.test.mjs"), "ignored\n");
  const before = runnerSourceSha256(root);
  fs.writeFileSync(path.join(scripts, "phase7-a.test.mjs"), "still ignored\n");
  assert.equal(runnerSourceSha256(root), before);
  fs.writeFileSync(path.join(scripts, "phase7-b.mjs"), "changed\n");
  assert.notEqual(runnerSourceSha256(root), before);
});

test("soak manifest and forty resumable journeys persist atomically", () => {
  const root = temporary();
  const now = new Date("2026-09-18T12:00:00.000Z");
  const created = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000002", kind: "soak", commit, migrationSha256, runnerSha256, now });
  assert.equal(created.state.journeys.length, 40);
  assert.equal(created.state.journeys[0].dueAt, now.toISOString());
  assert.equal(created.state.plannedEndAt, "2026-09-19T12:00:00.000Z");
  assert.equal(loadRun(created.runDirectory).state.journeys[39].operationIds.create, created.state.journeys[39].operationIds.create);
  assert.equal(fs.statSync(created.runDirectory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(created.runDirectory, "state.json")).mode & 0o777, 0o600);
});

test("single-writer lock rejects another live owner and recovers a stale lock", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000003", kind: "load", commit, migrationSha256, runnerSha256 });
  const release = acquireRunLock(runDirectory);
  assert.throws(() => acquireRunLock(runDirectory), /already held/);
  release();
  fs.writeFileSync(path.join(runDirectory, "runner.lock"), JSON.stringify({ pid: 99999999, acquiredAt: new Date().toISOString() }), { mode: 0o600 });
  const recovered = acquireRunLock(runDirectory);
  recovered();
});

test("workload lock defers to a surviving child and recovers after it exits", async () => {
  const root = temporary(), lockFile = path.join(root, "workload.lock");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  fs.writeFileSync(lockFile, `${JSON.stringify({ pid: child.pid, acquiredAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  assert.throws(() => acquirePidLock(lockFile, "test workload lock"), error => error?.code === "PHASE7_LOCK_BUSY");
  child.kill("SIGTERM");
  await once(child, "exit");
  const release = acquirePidLock(lockFile, "test workload lock");
  release();
});

test("corrupt state fails closed and does not overwrite evidence", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000004", kind: "incident", commit, migrationSha256, runnerSha256 });
  fs.writeFileSync(path.join(runDirectory, "state.json"), "{bad", { mode: 0o600 });
  assert.throws(() => loadRun(runDirectory), /missing or corrupt/);
});

test("stop requests persist and continuity reports gaps over five minutes", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000005", kind: "soak", commit, migrationSha256, runnerSha256 });
  const stopped = requestStop(runDirectory, new Date("2026-09-18T13:00:00Z"));
  assert.equal(stopped.stopRequestedAt, "2026-09-18T13:00:00.000Z");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runDirectory, "stop-request.json"))), { requestedAt: "2026-09-18T13:00:00.000Z" });
  const heartbeat = path.join(runDirectory, "heartbeats.jsonl");
  fs.writeFileSync(heartbeat, `${JSON.stringify({ at: "2026-09-18T12:00:00Z" })}\n${JSON.stringify({ at: "2026-09-18T12:06:00Z" })}\n`, { mode: 0o600 });
  assert.equal(continuityGaps(runDirectory).length, 1);
});

test("continuity includes the run boundaries", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000009", kind: "soak", commit, migrationSha256, runnerSha256, now: new Date("2026-09-18T12:00:00Z") });
  const heartbeat = path.join(runDirectory, "heartbeats.jsonl");
  fs.writeFileSync(heartbeat, `${JSON.stringify({ at: "2026-09-18T12:06:00Z" })}\n`, { mode: 0o600 });
  const gaps = continuityGaps(runDirectory, "2026-09-18T12:12:00Z");
  assert.deepEqual(gaps.map(value => value.durationMs), [360_000, 360_000]);
});

test("atomic writer leaves valid JSON and no temporary file", () => {
  const root = temporary(), file = path.join(root, "state.json");
  atomicWriteJson(file, { value: 1 });
  atomicWriteJson(file, { value: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { value: 2 });
  assert.deepEqual(fs.readdirSync(root), ["state.json"]);
});

test("soak restart selects only due incomplete work with bounded catch-up", () => {
  const root = temporary(), now = new Date("2026-09-18T13:30:00Z");
  const { state } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000006", kind: "soak", commit, migrationSha256, runnerSha256, now: new Date("2026-09-18T12:00:00Z") });
  state.journeys[0].state = "completed";
  const due = dueSoakJourneys(state, now);
  assert.equal(due.length, 2);
  assert.deepEqual(due.map(value => value.index), [1, 2]);
});

test("final evidence detects later tampering", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000007", kind: "cleanup", commit, migrationSha256, runnerSha256 });
  finalizeEvidence(runDirectory, { status: "completed" });
  assert.equal(verifyFinalEvidence(runDirectory).result.status, "completed");
  fs.appendFileSync(path.join(runDirectory, "events.jsonl"), "tampered\n");
  assert.throws(() => verifyFinalEvidence(runDirectory), /checksum mismatch/);
});

test("final evidence excludes the transient writer lock", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000008", kind: "preflight", commit, migrationSha256, runnerSha256 });
  const release = acquireRunLock(runDirectory);
  finalizeEvidence(runDirectory, { status: "completed" });
  release();
  assert.equal(verifyFinalEvidence(runDirectory).result.status, "completed");
});
