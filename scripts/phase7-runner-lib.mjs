import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PHASE7_CONTRACT = Object.freeze({
  contractVersion: 1,
  heartbeatIntervalMs: 60_000,
  healthIntervalMs: 300_000,
  continuityLimitMs: 300_000,
  soakDurationMs: 24 * 60 * 60 * 1000,
  automatedSoakJourneys: 40,
  maximumCatchUpPerTick: 2,
  load: Object.freeze({ workers: 10, sustainedPerMinute: 50, sustainedMinutes: 15, burstPerMinute: 100, burstMinutes: 2 }),
  reliability: Object.freeze({
    realtimeP95Ms: 2_000,
    recoveryMaximumMs: 20_000,
    deadlineP95Ms: 30_000,
    deadlineMaximumMs: 75_000,
    coreP95Ms: 1_000,
    quoteCreateP95Ms: 1_500,
    unexpectedFailureRate: 0.01,
  }),
});

const UUID_NAMESPACE = "hungrie-phase7-v1";
const allowedKinds = new Set(["preflight", "authorization", "load", "deadline", "incident", "soak", "cleanup"]);

export function runnerSourceSha256(repositoryRoot) {
  const scriptsDirectory = path.join(repositoryRoot, "scripts");
  const names = fs.readdirSync(scriptsDirectory)
    .filter(name => /^phase7-.*\.mjs$/.test(name) && !name.endsWith(".test.mjs"))
    .sort();
  if (names.length === 0) throw new Error("No Phase 7 runner sources were found.");
  const digest = crypto.createHash("sha256");
  for (const name of names) {
    digest.update(name);
    digest.update("\0");
    digest.update(fs.readFileSync(path.join(scriptsDirectory, name)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function stableOperationId(runId, journey, step) {
  const bytes = crypto.createHash("sha256").update(`${UUID_NAMESPACE}\0${runId}\0${journey}\0${step}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

export function atomicWriteJson(file, value) {
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

export function appendEvidence(file, value) {
  ensurePrivateDirectory(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

export function readJson(file, label = "JSON evidence") {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing or corrupt: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function createRun({ phaseRoot, runId = crypto.randomUUID(), kind, commit, migrationSha256, runnerSha256, runnerMode = "launch-agent", now = new Date() }) {
  if (!allowedKinds.has(kind)) throw new Error(`Unsupported Phase 7 run kind: ${kind}`);
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("Run ID must be a UUID.");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("A full source commit is required.");
  if (migrationSha256 && !/^[0-9a-f]{64}$/.test(migrationSha256)) throw new Error("Migration checksum must be SHA-256.");
  if (!/^[0-9a-f]{64}$/.test(runnerSha256 || "")) throw new Error("Runner checksum must be SHA-256.");
  const runDirectory = path.join(phaseRoot, runId);
  if (fs.existsSync(runDirectory)) throw new Error("Phase 7 run already exists.");
  ensurePrivateDirectory(runDirectory);
  const startedAt = now.toISOString();
  const manifest = {
    contractVersion: PHASE7_CONTRACT.contractVersion,
    environment: "staging",
    runId,
    kind,
    sourceCommit: commit,
    migrationSha256: migrationSha256 || null,
    runnerSha256,
    runnerMode,
    launchAgentLoginRequiredAfterReboot: runnerMode === "launch-agent",
    startedAt,
    targets: PHASE7_CONTRACT,
  };
  const journeys = kind === "soak"
    ? Array.from({ length: PHASE7_CONTRACT.automatedSoakJourneys }, (_, index) => ({
        index,
        dueAt: new Date(now.getTime() + index * (PHASE7_CONTRACT.soakDurationMs / PHASE7_CONTRACT.automatedSoakJourneys)).toISOString(),
        state: "pending",
        steps: {},
        operationIds: Object.fromEntries(["quote", "create", "seen", "preparing", "ready", "out_for_delivery", "delivered"].map(step => [step, stableOperationId(runId, index, step)])),
      }))
    : [];
  const state = {
    contractVersion: PHASE7_CONTRACT.contractVersion,
    runId,
    kind,
    status: "created",
    startedAt,
    plannedEndAt: kind === "soak" ? new Date(now.getTime() + PHASE7_CONTRACT.soakDurationMs).toISOString() : null,
    lastHeartbeatAt: null,
    lastHealthAt: null,
    stopRequestedAt: null,
    failure: null,
    progress: { completed: 0, total: kind === "soak" ? PHASE7_CONTRACT.automatedSoakJourneys : 1 },
    journeys,
  };
  atomicWriteJson(path.join(runDirectory, "manifest.json"), manifest);
  atomicWriteJson(path.join(runDirectory, "state.json"), state);
  appendEvidence(path.join(runDirectory, "events.jsonl"), { at: startedAt, type: "run.created", kind });
  return { runDirectory, manifest, state };
}

export function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

export function acquirePidLock(lockFile, label, now = new Date()) {
  ensurePrivateDirectory(path.dirname(lockFile));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockFile, "wx", 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, acquiredAt: now.toISOString() })}\n`);
      fs.closeSync(descriptor);
      return () => { try { fs.unlinkSync(lockFile); } catch (error) { if (error?.code !== "ENOENT") throw error; } };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const lock = readJson(lockFile, label);
      if (processExists(Number(lock.pid))) { const busy = new Error(`${label} is already held by process ${lock.pid}.`); busy.code = "PHASE7_LOCK_BUSY"; throw busy; }
      fs.unlinkSync(lockFile);
    }
  }
  throw new Error(`Unable to acquire ${label}.`);
}

export function acquireRunLock(runDirectory, now = new Date()) {
  return acquirePidLock(path.join(runDirectory, "runner.lock"), "Phase 7 run lock", now);
}

export function loadRun(runDirectory) {
  const manifest = readJson(path.join(runDirectory, "manifest.json"), "run manifest");
  const state = readJson(path.join(runDirectory, "state.json"), "run state");
  if (manifest.runId !== state.runId || manifest.kind !== state.kind) throw new Error("Run manifest and state disagree.");
  if (!allowedKinds.has(state.kind)) throw new Error("Run state has an unsupported kind.");
  return { manifest, state };
}

export function persistState(runDirectory, state) {
  atomicWriteJson(path.join(runDirectory, "state.json"), state);
}

export function recordHeartbeat(runDirectory, state, now = new Date()) {
  const at = now.toISOString();
  state.lastHeartbeatAt = at;
  appendEvidence(path.join(runDirectory, "heartbeats.jsonl"), { at, pid: process.pid });
  persistState(runDirectory, state);
  return state;
}

export function dueSoakJourneys(state, now = new Date()) {
  if (state.kind !== "soak") return [];
  return state.journeys
    .filter(journey => journey.state !== "completed" && Date.parse(journey.dueAt) <= now.getTime())
    .slice(0, PHASE7_CONTRACT.maximumCatchUpPerTick);
}

export function requestStop(runDirectory, now = new Date()) {
  const { state } = loadRun(runDirectory);
  if (["completed", "failed", "stopped"].includes(state.status)) return state;
  const requestedAt = now.toISOString();
  atomicWriteJson(path.join(runDirectory, "stop-request.json"), { requestedAt });
  appendEvidence(path.join(runDirectory, "events.jsonl"), { at: requestedAt, type: "run.stop_requested" });
  return { ...state, stopRequestedAt: requestedAt };
}

export function continuityGaps(runDirectory, endedAt = null) {
  const heartbeatFile = path.join(runDirectory, "heartbeats.jsonl");
  if (!fs.existsSync(heartbeatFile)) return [];
  const rows = fs.readFileSync(heartbeatFile, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const gaps = [];
  const manifest = readJson(path.join(runDirectory, "manifest.json"), "run manifest");
  if (rows.length > 0) {
    const initialDurationMs = Date.parse(rows[0].at) - Date.parse(manifest.startedAt);
    if (initialDurationMs > PHASE7_CONTRACT.continuityLimitMs) gaps.push({ from: manifest.startedAt, to: rows[0].at, durationMs: initialDurationMs });
  }
  for (let index = 1; index < rows.length; index += 1) {
    const durationMs = Date.parse(rows[index].at) - Date.parse(rows[index - 1].at);
    if (durationMs > PHASE7_CONTRACT.continuityLimitMs) gaps.push({ from: rows[index - 1].at, to: rows[index].at, durationMs });
  }
  if (rows.length > 0 && endedAt) {
    const finalDurationMs = Date.parse(endedAt) - Date.parse(rows.at(-1).at);
    if (finalDurationMs > PHASE7_CONTRACT.continuityLimitMs) gaps.push({ from: rows.at(-1).at, to: endedAt, durationMs: finalDurationMs });
  }
  return gaps;
}

export function evidenceDigests(runDirectory) {
  const names = fs.readdirSync(runDirectory).filter(name => name !== "final-evidence.json" && !name.endsWith(".lock") && !name.endsWith(".tmp") && fs.statSync(path.join(runDirectory, name)).isFile()).sort();
  return Object.fromEntries(names.map(name => [name, crypto.createHash("sha256").update(fs.readFileSync(path.join(runDirectory, name))).digest("hex")]));
}

export function finalizeEvidence(runDirectory, result, now = new Date()) {
  const finalizedAt = now.toISOString();
  const payload = { contractVersion: 1, finalizedAt, result, continuityGaps: continuityGaps(runDirectory, finalizedAt), sha256: evidenceDigests(runDirectory) };
  atomicWriteJson(path.join(runDirectory, "final-evidence.json"), payload);
  return payload;
}

export function verifyFinalEvidence(runDirectory) {
  const final = readJson(path.join(runDirectory, "final-evidence.json"), "final evidence");
  for (const [name, expected] of Object.entries(final.sha256 || {})) {
    const file = path.join(runDirectory, name);
    if (!fs.existsSync(file) || crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== expected) throw new Error(`Evidence checksum mismatch: ${name}`);
  }
  return final;
}
