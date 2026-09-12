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
const archive = value("--archive");
const keyPath = value("--encryption-key-file");
if (value("--confirm") !== "isolated-restore" || value("--target-label") !== "milestone11-isolated-restore") {
  throw new Error("Use --confirm=isolated-restore --target-label=milestone11-isolated-restore.");
}
if (!archive || !keyPath || !path.isAbsolute(keyPath) || !fs.existsSync(keyPath)) throw new Error("Provide an archive and an external encryption-key file.");
const target = {
  host: process.env.RESTORE_DB_HOST,
  port: process.env.RESTORE_DB_PORT || "5432",
  database: process.env.RESTORE_DB_NAME,
  user: process.env.RESTORE_DB_USER,
  password: process.env.RESTORE_DB_PASSWORD,
};
if (Object.values(target).some((entry) => !entry)) throw new Error("Set all RESTORE_DB_* variables for an isolated empty target.");
const state = JSON.parse(fs.readFileSync(path.join(root, "secure", "supabase-projects.local.json"), "utf8"));
const protectedRefs = Object.values(state.projects || {}).map((project) => project.ref).filter(Boolean);
if (protectedRefs.some((ref) => target.host.includes(ref))) throw new Error("Refusing to restore over a recorded application environment.");

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}); output was suppressed.`);
  return String(result.stdout || "").trim();
};
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-pg-restore-"));
fs.chmodSync(temporaryDirectory, 0o700);
const encryptedPath = path.join(temporaryDirectory, "database.dump.enc");
const dumpPath = path.join(temporaryDirectory, "database.dump");
try {
  if (archive.startsWith("gs://")) run("gcloud", ["storage", "cp", archive, encryptedPath]);
  else fs.copyFileSync(path.resolve(archive), encryptedPath);
  const descriptor = fs.openSync(encryptedPath, "r");
  const header = Buffer.alloc(20);
  fs.readSync(descriptor, header, 0, 20, 0);
  const size = fs.fstatSync(descriptor).size;
  const tag = Buffer.alloc(16);
  fs.readSync(descriptor, tag, 0, 16, size - 16);
  fs.closeSync(descriptor);
  if (header.subarray(0, 8).toString() !== "HUNGRIE1") throw new Error("Unknown encrypted backup format.");
  const key = crypto.createHash("sha256").update(fs.readFileSync(keyPath)).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(8, 20));
  decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(encryptedPath, { start: 20, end: size - 17 }), decipher, fs.createWriteStream(dumpPath, { mode: 0o600 }));
  const databaseEnvironment = { ...process.env, PGHOST: target.host, PGPORT: target.port, PGDATABASE: target.database, PGUSER: target.user, PGPASSWORD: target.password, PGSSLMODE: process.env.RESTORE_DB_SSLMODE || "require" };
  run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-acl", "--dbname", target.database, dumpPath], { env: databaseEnvironment });
  const verification = run("psql", ["--tuples-only", "--no-align", "--command", "select count(*) from supabase_migrations.schema_migrations; select count(*) from public.restaurants;"], { env: databaseEnvironment }).split("\n");
  if (!verification[0]) throw new Error("Restored database did not contain migration history.");
  console.log(JSON.stringify({ restoredTo: "isolated-target", migrations: Number(verification[0]), restaurants: Number(verification[1] || 0), restorationVerified: true }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
