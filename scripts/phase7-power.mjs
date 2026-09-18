import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWriteJson } from "./phase7-runner-lib.mjs";

export const PHASE7_AGENT_LABEL = "app.hungrie.phase7-qualification";

export function parsePmsetCustom(output) {
  const profiles = {};
  let current = null;
  for (const raw of String(output).split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^([A-Za-z ]+) Power:$/);
    if (heading) {
      current = `${heading[1].trim()} Power`.toLowerCase().replaceAll(" ", "_");
      profiles[current] = {};
      continue;
    }
    const setting = line.match(/^([A-Za-z0-9_]+)\s+(-?\d+)$/);
    if (current && setting) profiles[current][setting[1]] = Number(setting[2]);
  }
  return profiles;
}

export function parsePowerSource(output) {
  return /AC Power/i.test(String(output)) ? "ac" : /Battery Power/i.test(String(output)) ? "battery" : "unknown";
}

export function parseAssertions(output, expectedRunnerPath = "") {
  const text = String(output);
  return {
    preventSystemSleep: /PreventSystemSleep\s+1/.test(text),
    preventIdleSystemSleep: /PreventUserIdleSystemSleep\s+1/.test(text),
    caffeinatePresent: /caffeinate/i.test(text),
    reviewedRunnerPresent: expectedRunnerPath ? text.includes(expectedRunnerPath) : false,
  };
}

export function sanitizePowerEvidence(value) {
  return {
    capturedAt: value.capturedAt,
    powerSource: value.powerSource,
    acProfile: value.acProfile,
    assertions: value.assertions,
    launchAgent: {
      loaded: Boolean(value.launchAgent?.loaded),
      labelMatches: Boolean(value.launchAgent?.labelMatches),
      runnerMatches: Boolean(value.launchAgent?.runnerMatches),
      evidenceRootMatches: Boolean(value.launchAgent?.evidenceRootMatches),
    },
    ownerSessionAvailable: Boolean(value.ownerSessionAvailable),
    passed: Boolean(value.passed),
    failures: value.failures || [],
  };
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function inspectPowerPreflight({ runnerPath, evidenceRoot, launchAgentStatus, now = new Date() }) {
  const custom = run("/usr/bin/pmset", ["-g", "custom"]);
  const source = run("/usr/bin/pmset", ["-g", "ps"]);
  const assertions = run("/usr/bin/pmset", ["-g", "assertions"]);
  if (custom.status !== 0 || source.status !== 0 || assertions.status !== 0) throw new Error("Unable to inspect macOS power state.");
  const profiles = parsePmsetCustom(custom.stdout);
  const assertionState = parseAssertions(assertions.stdout, runnerPath);
  const powerSource = parsePowerSource(source.stdout);
  const ownerSessionAvailable = Boolean(process.env.HOME && process.env.USER && process.getuid?.() !== 0);
  const failures = [];
  if (powerSource !== "ac") failures.push("Mac mini is not using AC power.");
  if (profiles.ac_power?.sleep !== 0) failures.push("AC idle system sleep is not disabled.");
  if (!assertionState.preventSystemSleep || !assertionState.preventIdleSystemSleep || !assertionState.caffeinatePresent) failures.push("Managed sleep-prevention assertion is not active.");
  if (!ownerSessionAvailable) failures.push("Owner user session is unavailable.");
  if (!launchAgentStatus?.loaded) failures.push("Phase 7 LaunchAgent is not loaded.");
  if (!launchAgentStatus?.labelMatches || !launchAgentStatus?.runnerMatches || !launchAgentStatus?.evidenceRootMatches) failures.push("Loaded LaunchAgent does not match the reviewed runner configuration.");
  return sanitizePowerEvidence({
    capturedAt: now.toISOString(), powerSource, acProfile: profiles.ac_power || null,
    assertions: assertionState, launchAgent: launchAgentStatus, ownerSessionAvailable,
    passed: failures.length === 0, failures,
  });
}

export function recordPowerSnapshot(file, snapshot) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  atomicWriteJson(file, sanitizePowerEvidence(snapshot));
}
