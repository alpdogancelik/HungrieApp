#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const migration = "20260913110000_phase4_public_rpc_type_boundary.sql";
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = process.argv.includes("--apply");
if (arg("--target") !== "staging" || (apply && arg("--confirm") !== "staging:phase4-rpc-boundary")) throw new Error("Target staging explicitly; apply requires --confirm=staging:phase4-rpc-boundary.");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const migrationPath = path.join(root, "supabase/migrations", migration);
const checksum = sha256(migrationPath);
if (arg("--expect-sha256") !== checksum) throw new Error("Migration checksum differs from the reviewed file.");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.staging;
if (project?.name !== "HungrieApp Staging" || !project.ref || !project.databasePassword || project.ref === state.projects?.development?.ref || project.ref === state.projects?.production?.ref) throw new Error("Staging identity is incomplete or overlaps another environment.");
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query: sql }) });
  if (!response.ok) throw new Error(`Staging preflight failed (${response.status}).`);
  return response.json();
};
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, { headers: { authorization: `Bearer ${token}` } });
if (!metadataResponse.ok) throw new Error("Staging metadata check failed.");
const metadata = await metadataResponse.json();
if (metadata.name !== project.name || metadata.status !== "ACTIVE_HEALTHY") throw new Error("Staging identity or health changed.");
const history = await query("select version from supabase_migrations.schema_migrations order by version");
const applied = new Set(history.map((row) => String(row.version)));
const pending = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0, 14))).sort();
if (history.length !== 31 || pending.length !== 1 || pending[0] !== migration) throw new Error("Expected 31 applied migrations and only the Phase 4 RPC boundary correction pending.");
if (apply) {
  const manifestPath = path.resolve(arg("--backup-manifest") || "");
  if (!manifestPath.startsWith(secure + path.sep)) throw new Error("Fresh restricted staging backup required.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.environment !== "staging" || manifest.projectRef !== project.ref || Date.now() - Date.parse(manifest.recordedAt) > 24 * 60 * 60 * 1000 || !["schema.sql", "data.sql"].every((name) => {
    const entry = manifest.files?.find((file) => file.name === name);
    const file = path.join(path.dirname(manifestPath), name);
    return entry && fs.existsSync(file) && sha256(file) === entry.sha256;
  })) throw new Error("Backup is stale, missing, or mismatched.");
}
const run = (extra) => spawnSync("supabase", ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", ...extra], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token } });
const dryRun = run(["--dry-run"]);
if (dryRun.status !== 0 || !`${dryRun.stdout}\n${dryRun.stderr}`.includes(migration)) throw new Error("Staging migration dry-run failed.");
if (!apply) {
  console.log(JSON.stringify({ target: "staging", mode: "dry-run", migration, sha256: checksum }));
  process.exit(0);
}
const pushed = run(["--yes"]);
if (pushed.status !== 0) throw new Error("Staging migration failed; inspect restricted operator logs.");
const [after] = await query("select (select count(*) from supabase_migrations.schema_migrations)::int migrations,(select count(*) from private.account_access)::int accounts,(select count(*) from private.account_access where account_type='admin' and status='active')::int active_admins,(select count(*) from private.user_roles)::int legacy_admin_roles,has_schema_privilege('authenticated','private','usage') private_usage,has_function_privilege('authenticated','public.admin_invite_admin_account_v1(text,text,text,uuid)','execute') invite_execute");
if (after?.migrations !== 32 || after.accounts !== 10 || after.active_admins !== 1 || after.legacy_admin_roles !== 0 || after.private_usage || !after.invite_execute) throw new Error("Staging post-migration invariant failed.");
console.log(JSON.stringify({ target: "staging", mode: "applied", migration, sha256: checksum, migrationCount: after.migrations, accountRows: after.accounts }));
