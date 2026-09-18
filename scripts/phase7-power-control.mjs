#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWriteJson, ensurePrivateDirectory } from "./phase7-runner-lib.mjs";
import { parsePmsetCustom } from "./phase7-power.mjs";

const action = process.argv[2], root = path.resolve("secure/phase7"), baselineFile = path.join(root, "power-baseline.json");
const pmset = args => spawnSync("/usr/bin/pmset", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const inspect = () => { const result = pmset(["-g", "custom"]); if (result.status !== 0) throw new Error("Unable to inspect macOS power settings."); return parsePmsetCustom(result.stdout).ac_power; };
const change = sleep => { const direct = pmset(["-c", "sleep", String(sleep)]); if (direct.status === 0) return; const elevated = spawnSync("/usr/bin/sudo", ["-n", "/usr/bin/pmset", "-c", "sleep", String(sleep)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); if (elevated.status !== 0) throw new Error("Changing AC sleep requires an authorized owner command; settings were not changed."); };

if (action === "prepare") {
  ensurePrivateDirectory(root); const current = inspect();
  if (!fs.existsSync(baselineFile)) atomicWriteJson(baselineFile, { capturedAt: new Date().toISOString(), acProfile: current, restoredAt: null });
  if (current?.sleep !== 0) change(0);
  const after = inspect(); if (after?.sleep !== 0) throw new Error("AC idle sleep remains enabled.");
  console.log(JSON.stringify({ prepared: true, acSleep: after.sleep, baselineRecorded: true }));
} else if (action === "restore") {
  if (!fs.existsSync(baselineFile)) throw new Error("No Phase 7 power baseline is available.");
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8")), sleep = baseline.acProfile?.sleep;
  if (!Number.isInteger(sleep) || sleep < 0) throw new Error("Power baseline is invalid.");
  if (inspect()?.sleep !== sleep) change(sleep);
  const after = inspect(); if (after?.sleep !== sleep) throw new Error("Prior AC sleep setting was not restored.");
  baseline.restoredAt = new Date().toISOString(); atomicWriteJson(baselineFile, baseline);
  console.log(JSON.stringify({ restored: true, acSleep: sleep }));
} else if (action === "status") console.log(JSON.stringify({ acProfile: inspect(), baselineExists: fs.existsSync(baselineFile) }));
else throw new Error("Use prepare, status, or restore.");
