import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const write = args.includes("--write");
const confirmation = value("--confirm");
const bucket = value("--bucket");
const keyPath = value("--encryption-key-file");
const statePath = path.join(root, "secure", "supabase-projects.local.json");
if (!/^gs:\/\/[a-z0-9._-]+$/.test(bucket)) throw new Error("Provide --bucket=gs://<private-eu-bucket>.");
if (!keyPath || !path.isAbsolute(keyPath) || !fs.existsSync(keyPath)) throw new Error("Provide an external absolute encryption-key file.");
if (!write) {
  console.log(JSON.stringify({ mode: "dry-run", environment: "production", bucket, retention: { dailyDays: 30, monthlyMonths: 12 }, rpoHours: 24, rtoHours: 4 }, null, 2));
  process.exit(0);
}
if (confirmation !== "production-backup") throw new Error("Use --write --confirm=production-backup.");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects?.production;
if (!project?.ref || !project?.databasePassword) throw new Error("Production Supabase credentials are not recorded.");
const databaseHost = process.env.SUPABASE_PRODUCTION_DB_HOST || `db.${project.ref}.supabase.co`;

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}); sensitive output was suppressed.`);
  return result.stdout;
};
const bucketInfo = JSON.parse(run("gcloud", ["storage", "buckets", "describe", bucket, "--format=json"]));
const location = String(bucketInfo.location || "").toUpperCase();
if (!location.includes("EU") && !location.includes("EUROPE")) throw new Error("Backup bucket is not in an approved EU location.");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-pg-backup-"));
fs.chmodSync(temporaryDirectory, 0o700);
const dumpPath = path.join(temporaryDirectory, "database.dump");
const encryptedPath = `${dumpPath}.enc`;
try {
  run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", dumpPath], {
    env: { ...process.env, PGHOST: databaseHost, PGPORT: "5432", PGDATABASE: "postgres", PGUSER: "postgres", PGPASSWORD: project.databasePassword, PGSSLMODE: "require" },
  });
  fs.chmodSync(dumpPath, 0o600);
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(fs.readFileSync(keyPath)).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const output = fs.createWriteStream(encryptedPath, { mode: 0o600 });
  output.write(Buffer.concat([Buffer.from("HUNGRIE1"), iv]));
  await pipeline(fs.createReadStream(dumpPath), cipher, output, { end: false });
  output.end(cipher.getAuthTag());
  await new Promise((resolve, reject) => { output.on("close", resolve); output.on("error", reject); });
  const encryptedChecksum = crypto.createHash("sha256").update(fs.readFileSync(encryptedPath)).digest("hex");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const object = `${bucket}/daily/${timestamp}-${encryptedChecksum.slice(0, 16)}.dump.enc`;
  run("gcloud", ["storage", "cp", encryptedPath, object]);
  let monthlyObject = null;
  if (new Date().getUTCDate() === 1) {
    monthlyObject = `${bucket}/monthly/${timestamp.slice(0, 7)}-${encryptedChecksum.slice(0, 16)}.dump.enc`;
    run("gcloud", ["storage", "cp", encryptedPath, monthlyObject]);
  }
  console.log(JSON.stringify({ environment: "production", encryptedChecksum, objectName: object.replace(bucket, "[private-eu-bucket]"), monthlyCopy: monthlyObject ? monthlyObject.replace(bucket, "[private-eu-bucket]") : null, location, completed: true }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
