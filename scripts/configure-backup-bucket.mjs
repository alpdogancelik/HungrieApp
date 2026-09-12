import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const bucket = value("--bucket");
if (!/^gs:\/\/[a-z0-9._-]+$/.test(bucket)) throw new Error("Provide --bucket=gs://<private-eu-bucket>.");
const write = args.includes("--write");
if (!write) {
  console.log(JSON.stringify({ mode: "dry-run", bucket, publicAccessPrevention: "enforced", versioning: true, retention: "daily 30 days; monthly 12 months" }, null, 2));
  process.exit(0);
}
if (value("--confirm") !== "configure-private-eu-backups") throw new Error("Use --write --confirm=configure-private-eu-backups.");
const run = (commandArgs) => {
  const result = spawnSync("gcloud", ["storage", ...commandArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("gcloud bucket configuration failed; output was suppressed.");
  return result.stdout;
};
const info = JSON.parse(run(["buckets", "describe", bucket, "--format=json"]));
const location = String(info.location || "").toUpperCase();
if (!location.includes("EU") && !location.includes("EUROPE")) throw new Error("Refusing a bucket outside the EU.");
run(["buckets", "update", bucket, "--public-access-prevention"]);
run(["buckets", "update", bucket, "--versioning"]);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-backup-policy-"));
const policyPath = path.join(temporaryDirectory, "lifecycle.json");
try {
  const policy = { rule: [
    { action: { type: "Delete" }, condition: { age: 30, matchesPrefix: ["daily/"] } },
    { action: { type: "Delete" }, condition: { age: 366, matchesPrefix: ["monthly/"] } },
  ] };
  fs.writeFileSync(policyPath, JSON.stringify(policy), { mode: 0o600 });
  run(["buckets", "update", bucket, `--lifecycle-file=${policyPath}`]);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
console.log(JSON.stringify({ configured: true, location, publicAccessPrevention: "enforced", versioning: true }, null, 2));
