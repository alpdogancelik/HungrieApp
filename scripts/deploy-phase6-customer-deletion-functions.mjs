#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { functionSha, root } from "./phase6-batch.mjs";

const checksum = functionSha();
if (!process.argv.includes("--apply") ||
    !process.argv.includes("--confirm=nonproduction:phase6-customer-deletion") ||
    !process.argv.includes(`--expect-sha256=${checksum}`)) {
  throw new Error(`Reviewed non-production confirmation and source checksum required. Current SHA-256: ${checksum}`);
}
const names = [
  "deleteHungrieAccount",
  "reconcilePendingAccountAnonymizationsDevelopment",
  "reconcilePendingAccountAnonymizationsStaging",
];
const result = spawnSync("npx", ["--yes", "firebase-tools", "deploy", "--project", "hungrieapp-a2288", "--only",
  names.map((name) => `functions:${name}`).join(",")], { cwd: root, stdio: "inherit" });
if (result.status !== 0) throw new Error("Phase 6 shared non-production deletion deployment failed.");
