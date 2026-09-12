#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = ["recordAdminMfaEnrollmentStaging", "setAdminAccountStatusStaging", "recoverAdminMfaStaging"];
const files = ["functions/index.js", "functions/phase4AdminLogic.js", "functions/package.json", "functions/package-lock.json"];
const digest = crypto.createHash("sha256");
for (const name of files) digest.update(name).update("\0").update(fs.readFileSync(path.join(root, name))).update("\0");
const checksum = digest.digest("hex");
if (!process.argv.includes("--apply") || !process.argv.includes("--confirm=staging:phase4-functions") || !process.argv.includes(`--expect-sha256=${checksum}`)) throw new Error(`Reviewed staging confirmation and source checksum required. Current SHA-256: ${checksum}`);
const command = ["--yes", "firebase-tools", "deploy", "--project", "hungrieapp-a2288", "--only", names.map((name) => `functions:${name}`).join(",")];
const result = spawnSync("npx", command, { cwd: root, encoding: "utf8", stdio: "inherit" });
if (result.status !== 0) throw new Error("Staging callable deployment failed.");
