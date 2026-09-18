import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  acquireRunLock, atomicWriteJson, continuityGaps, createRun, loadRun,
  dueSoakJourneys, finalizeEvidence, requestStop, stableOperationId, verifyFinalEvidence,
} from "./phase7-runner-lib.mjs";

const commit = "a".repeat(40), migrationSha256 = "b".repeat(64);
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-phase7-runner-"));

test("stable operation IDs survive restart and distinguish steps", () => {
  const first = stableOperationId("00000000-0000-4000-8000-000000000001", 7, "create");
  assert.equal(first, stableOperationId("00000000-0000-4000-8000-000000000001", 7, "create"));
  assert.notEqual(first, stableOperationId("00000000-0000-4000-8000-000000000001", 7, "delivered"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("soak manifest and forty resumable journeys persist atomically", () => {
  const root = temporary();
  const now = new Date("2026-09-18T12:00:00.000Z");
  const created = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000002", kind: "soak", commit, migrationSha256, now });
  assert.equal(created.state.journeys.length, 40);
  assert.equal(created.state.journeys[0].dueAt, now.toISOString());
  assert.equal(created.state.plannedEndAt, "2026-09-19T12:00:00.000Z");
  assert.equal(loadRun(created.runDirectory).state.journeys[39].operationIds.create, created.state.journeys[39].operationIds.create);
  assert.equal(fs.statSync(created.runDirectory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(created.runDirectory, "state.json")).mode & 0o777, 0o600);
});

test("single-writer lock rejects another live owner and recovers a stale lock", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000003", kind: "load", commit, migrationSha256 });
  const release = acquireRunLock(runDirectory);
  assert.throws(() => acquireRunLock(runDirectory), /already locked/);
  release();
  fs.writeFileSync(path.join(runDirectory, "runner.lock"), JSON.stringify({ pid: 99999999, acquiredAt: new Date().toISOString() }), { mode: 0o600 });
  const recovered = acquireRunLock(runDirectory);
  recovered();
});

test("corrupt state fails closed and does not overwrite evidence", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000004", kind: "incident", commit, migrationSha256 });
  fs.writeFileSync(path.join(runDirectory, "state.json"), "{bad", { mode: 0o600 });
  assert.throws(() => loadRun(runDirectory), /missing or corrupt/);
});

test("stop requests persist and continuity reports gaps over five minutes", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000005", kind: "soak", commit, migrationSha256 });
  const stopped = requestStop(runDirectory, new Date("2026-09-18T13:00:00Z"));
  assert.equal(stopped.stopRequestedAt, "2026-09-18T13:00:00.000Z");
  const heartbeat = path.join(runDirectory, "heartbeats.jsonl");
  fs.writeFileSync(heartbeat, `${JSON.stringify({ at: "2026-09-18T12:00:00Z" })}\n${JSON.stringify({ at: "2026-09-18T12:06:00Z" })}\n`, { mode: 0o600 });
  assert.equal(continuityGaps(runDirectory).length, 1);
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
  const { state } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000006", kind: "soak", commit, migrationSha256, now: new Date("2026-09-18T12:00:00Z") });
  state.journeys[0].state = "completed";
  const due = dueSoakJourneys(state, now);
  assert.equal(due.length, 2);
  assert.deepEqual(due.map(value => value.index), [1, 2]);
});

test("final evidence detects later tampering", () => {
  const root = temporary();
  const { runDirectory } = createRun({ phaseRoot: root, runId: "00000000-0000-4000-8000-000000000007", kind: "cleanup", commit, migrationSha256 });
  finalizeEvidence(runDirectory, { status: "completed" });
  assert.equal(verifyFinalEvidence(runDirectory).result.status, "completed");
  fs.appendFileSync(path.join(runDirectory, "events.jsonl"), "tampered\n");
  assert.throws(() => verifyFinalEvidence(runDirectory), /checksum mismatch/);
});
