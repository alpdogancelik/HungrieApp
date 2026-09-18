import assert from "node:assert/strict";
import test from "node:test";
import { parseAssertions, parsePmsetCustom, parsePowerSource, sanitizePowerEvidence } from "./phase7-power.mjs";

test("pmset parser keeps AC settings separate", () => {
  const value = parsePmsetCustom(`Battery Power:\n sleep 5\n disksleep 10\nAC Power:\n sleep 0\n disksleep 10\n displaysleep 180\n`);
  assert.equal(value.ac_power.sleep, 0);
  assert.equal(value.battery_power.sleep, 5);
});

test("power source parser requires an explicit AC source", () => {
  assert.equal(parsePowerSource("Now drawing from 'AC Power'"), "ac");
  assert.equal(parsePowerSource("Now drawing from 'Battery Power'"), "battery");
  assert.equal(parsePowerSource("unknown"), "unknown");
});

test("assertion parser identifies the managed sleep safeguards", () => {
  const value = parseAssertions(`PreventSystemSleep 1\nPreventUserIdleSystemSleep 1\n pid 10(caffeinate)`, "/reviewed/runner.mjs");
  assert.equal(value.preventSystemSleep, true);
  assert.equal(value.preventIdleSystemSleep, true);
  assert.equal(value.caffeinatePresent, true);
  assert.equal(value.reviewedRunnerPresent, false);
});

test("sanitized power evidence omits raw process and user data", () => {
  const value = sanitizePowerEvidence({ capturedAt: "2026-09-18T00:00:00Z", powerSource: "ac", acProfile: { sleep: 0 }, assertions: { caffeinatePresent: true }, launchAgent: { loaded: true, labelMatches: true, runnerMatches: true, evidenceRootMatches: true, raw: "secret" }, ownerSessionAvailable: true, passed: true, raw: "secret" });
  assert.equal(JSON.stringify(value).includes("secret"), false);
  assert.equal(value.launchAgent.loaded, true);
});
