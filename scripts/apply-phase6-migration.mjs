#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, migrations, developmentMigrations, migrationSha } from "./phase6-batch.mjs";

const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const target = arg("--target");
const apply = process.argv.includes("--apply");
const batch = target === "development" ? developmentMigrations : migrations;
const sha = migrationSha(batch);
if (!["development", "staging"].includes(target) || arg("--expect-sha256") !== sha ||
    (apply && arg("--confirm") !== `${target}:phase6-migration`)) {
  throw new Error(`Target, reviewed checksum, and apply confirmation are required. Current SHA-256: ${sha}`);
}
const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.[target];
if (!project?.ref || !project.databasePassword || project.ref === state.projects?.production?.ref ||
    project.ref === state.projects?.[target === "development" ? "staging" : "development"]?.ref) throw new Error("Safe non-production environment configuration required.");
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`${target} SQL preflight failed (${response.status}).`);
  return response.json();
};
const history = await query("select version from supabase_migrations.schema_migrations order by version");
const applied = new Set(history.map((row) => String(row.version)));
const pending = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0, 14))).sort();
const expectedPending = batch.filter((name) => !applied.has(name.slice(0,14)));
if (pending.join("\n") !== expectedPending.join("\n")) throw new Error(`Pending migration set changed: ${pending.join(", ")}`);
if (apply) {
  const manifestPath = path.resolve(arg("--backup-manifest") || "");
  if (!manifestPath.startsWith(secure + path.sep)) throw new Error("Restricted backup manifest required.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.environment !== target || manifest.projectRef !== project.ref || Date.now() - Date.parse(manifest.recordedAt) > 86_400_000) throw new Error("Backup is stale or mismatched.");
  for (const entry of manifest.files || []) {
    const file = path.join(path.dirname(manifestPath), entry.name);
    const digest = fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "";
    if (digest !== entry.sha256) throw new Error("Backup checksum mismatch.");
  }
}
const run = (extra) => spawnSync("supabase", ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", ...extra], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token },
});
const dryRun = run(["--dry-run"]);
if (dryRun.status !== 0 || expectedPending.some((name) => !`${dryRun.stdout}\n${dryRun.stderr}`.includes(name))) throw new Error("Phase 6 migration dry-run failed.");
if (!apply) { console.log(JSON.stringify({ target, mode: "dry-run", migrations: batch, pendingMigrations: expectedPending, sha256: sha })); process.exit(0); }
const pushed = run(["--yes"]);
if (pushed.status !== 0) throw new Error("Phase 6 migration apply failed; inspect restricted operator logs.");
const [after] = await query("select (select count(*) from supabase_migrations.schema_migrations)::int migrations,(select count(*) from private.account_access)::int accounts");
console.log(JSON.stringify({ target, mode: "applied", migrations: batch, sha256: sha, migrationCount: after.migrations, accountRows: after.accounts }));
