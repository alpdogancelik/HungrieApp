import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secureRoot = path.join(root, "secure");
const migrationVersion = "20260912120000";
const migrationName = `${migrationVersion}_client_release_policy_foundation.sql`;
const migrationPath = path.join(root, "supabase", "migrations", migrationName);
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const target = arg("--target");
const expectedSha = arg("--expect-sha256");
const apply = process.argv.includes("--apply");

if (target !== "staging") throw new Error("This Phase 1 migration command targets staging only.");
if (!/^[a-f0-9]{64}$/.test(expectedSha || "")) throw new Error("Provide the reviewed migration --expect-sha256.");
if (apply && arg("--confirm") !== "staging:phase1-client-release-policy") {
  throw new Error("Hosted application requires --confirm=staging:phase1-client-release-policy.");
}

const sha = crypto.createHash("sha256").update(fs.readFileSync(migrationPath)).digest("hex");
if (sha !== expectedSha) throw new Error("The local migration does not match the reviewed checksum.");

const state = JSON.parse(fs.readFileSync(path.join(secureRoot, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.staging;
if (!project?.ref || !project?.databasePassword) throw new Error("Staging project credentials are not recorded.");
const token = fs.readFileSync(path.join(secureRoot, "supabase-cli-hungrie", "access-token"), "utf8").trim();
if (!token) throw new Error("Staging management credential is unavailable.");

const history = async () => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: "select version from supabase_migrations.schema_migrations order by version" })
  });
  if (!response.ok) throw new Error(`Staging migration-history read failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Staging migration history is malformed.");
  return new Set(rows.map((row) => String(row.version)));
};

const localVersions = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .map((name) => name.slice(0, 14));
const applied = await history();
const pending = localVersions.filter((version) => !applied.has(version));
if (pending.length !== 1 || pending[0] !== migrationVersion) {
  throw new Error(`Staging has ${pending.length} pending migration versions (${pending.join(", ")}); refusing to apply an unreviewed set.`);
}

if (!apply) {
  console.log(JSON.stringify({ target, mode: "dry-run", migration: migrationName, sha256: sha, pendingCount: 1 }));
  process.exit(0);
}

const result = spawnSync("supabase", [
  "db", "push", "--project-ref", project.ref, "--password", project.databasePassword,
  "--skip-vault", "--yes"
], {
  cwd: root,
  env: { ...process.env, SUPABASE_HOME: path.join(secureRoot, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token },
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
if (result.status !== 0) throw new Error("The staging migration CLI failed; inspect restricted operator logs.");
if (!(await history()).has(migrationVersion)) throw new Error("The staging migration was not recorded after application.");
console.log(JSON.stringify({ target, mode: "applied", migration: migrationName, sha256: sha }));
