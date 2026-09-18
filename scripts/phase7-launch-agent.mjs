#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensurePrivateDirectory } from "./phase7-runner-lib.mjs";
import { PHASE7_AGENT_LABEL } from "./phase7-power.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "scripts/phase7-runner.mjs");
const evidenceRoot = path.join(root, "secure/phase7");
const agentDirectory = path.join(os.homedir(), "Library/LaunchAgents");
const plist = path.join(agentDirectory, `${PHASE7_AGENT_LABEL}.plist`);
const domain = `gui/${process.getuid()}`;
const action = process.argv[2] || "status";

const xml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export const expectedPlist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${PHASE7_AGENT_LABEL}</string>
<key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-ims</string><string>${xml(process.execPath)}</string><string>${xml(runner)}</string><string>daemon</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(path.join(evidenceRoot, "runner/launch-agent.stdout.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(evidenceRoot, "runner/launch-agent.stderr.log"))}</string>
</dict></plist>
`;
const launchctl = args => spawnSync("/bin/launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export function status() {
  const printed = launchctl(["print", `${domain}/${PHASE7_AGENT_LABEL}`]);
  const contents = fs.existsSync(plist) ? fs.readFileSync(plist, "utf8") : "";
  return {
    loaded: printed.status === 0,
    labelMatches: contents.includes(`<string>${PHASE7_AGENT_LABEL}</string>`),
    runnerMatches: contents.includes(xml(runner)),
    evidenceRootMatches: contents.includes(xml(evidenceRoot)),
    loginRequiredAfterReboot: true,
    mechanism: "LaunchAgent",
  };
}

export function main(selectedAction = action) {
if (selectedAction === "install") {
  if (process.getuid() === 0) throw new Error("Install the Phase 7 LaunchAgent from the owner user session, not as root.");
  ensurePrivateDirectory(evidenceRoot); ensurePrivateDirectory(path.join(evidenceRoot, "runner"));
  fs.mkdirSync(agentDirectory, { recursive: true });
  fs.writeFileSync(plist, expectedPlist(), { mode: 0o600 }); fs.chmodSync(plist, 0o600);
  launchctl(["bootout", domain, plist]);
  const loaded = launchctl(["bootstrap", domain, plist]);
  if (loaded.status !== 0) throw new Error("LaunchAgent bootstrap failed; details are available in the owner session logs.");
  const kicked = launchctl(["kickstart", "-k", `${domain}/${PHASE7_AGENT_LABEL}`]);
  if (kicked.status !== 0) throw new Error("LaunchAgent kickstart failed.");
  const result = status(); if (!result.loaded) throw new Error("LaunchAgent did not remain loaded.");
  console.log(JSON.stringify(result));
} else if (selectedAction === "remove") {
  launchctl(["bootout", domain, plist]);
  if (fs.existsSync(plist)) fs.unlinkSync(plist);
  const result = status(); if (result.loaded) throw new Error("LaunchAgent is still loaded.");
  console.log(JSON.stringify({ ...result, removed: true }));
} else if (selectedAction === "status") console.log(JSON.stringify(status()));
else throw new Error("Use install, status, or remove.");
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
