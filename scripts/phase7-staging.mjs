#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), secure = path.join(root, "secure");
const migrationName = "20260918100000_phase7_staging_reliability.sql", expectedSha256 = "ac3419cade9767d9257fdceb963ee42d5e454934dec73cd59b17a2366286a9cd";
const migrationPath = path.join(root, "supabase/migrations", migrationName), action = process.argv[2];
const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const digest = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const registry = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8")), project = registry.projects?.staging;
if (!project?.ref || !project?.databasePassword || project.name !== "HungrieApp Staging" || project.ref === registry.projects?.development?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Isolated Staging target required.");
if (digest(migrationPath) !== expectedSha256 || arg("--expect-sha256") !== expectedSha256) throw new Error(`Reviewed migration checksum required: ${expectedSha256}`);
if (!["backup", "preflight", "apply", "verify"].includes(action)) throw new Error("Use backup, preflight, apply, or verify.");
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token };
const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cliEnv });
const query = async query => { const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query }) }); if (!response.ok) throw new Error(`Staging query failed (${response.status}).`); return response.json(); };
const baselineSql = `select (select count(*) from public.orders)::integer orders,(select count(*) from public.profiles)::integer profiles,(select count(*) from public.restaurants)::integer restaurants,(select count(*) from private.restaurant_operational_incidents)::integer incidents,
  (select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(id,status,updated_at) order by id)::text,'[]'),'sha256'),'hex') from public.orders) orders_digest,
  (select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(id,updated_at) order by id)::text,'[]'),'sha256'),'hex') from public.profiles) profiles_digest,
  (select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(id,updated_at) order by id)::text,'[]'),'sha256'),'hex') from public.restaurants) restaurants_digest`;

if (action === "backup") {
  if (arg("--confirm") !== "staging:phase7-backup") throw new Error("Staging Phase 7 backup confirmation required.");
  const directory = path.join(secure, "phase7/staging-backups", new Date().toISOString().replaceAll(/[:.]/g, "-")); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const entries = [{ name: "schema.sql", extra: [] }, { name: "data.sql", extra: ["--data-only", "--use-copy"] }];
  for (const entry of entries) { const file = path.join(directory, entry.name), result = run("supabase", ["db", "dump", "--project-ref", project.ref, "--password", project.databasePassword, "--file", file, ...entry.extra]); if (result.status !== 0 || !fs.existsSync(file) || fs.statSync(file).size < 1024) throw new Error("Restricted Staging backup failed; output withheld."); fs.chmodSync(file, 0o600); }
  const files = entries.map(entry => ({ name: entry.name, bytes: fs.statSync(path.join(directory, entry.name)).size, sha256: digest(path.join(directory, entry.name)) })), [baseline] = await query(baselineSql);
  const manifest = path.join(directory, "manifest.json"); fs.writeFileSync(manifest, JSON.stringify({ environment: "staging", projectRef: project.ref, recordedAt: new Date().toISOString(), migrationSha256: expectedSha256, baseline, files }, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ environment: "staging", manifest, files, baseline }));
} else if (action === "preflight" || action === "apply") {
  const history = await query("select version from supabase_migrations.schema_migrations order by version"), applied = new Set(history.map(value => String(value.version)));
  const pending = fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0, 14))).sort();
  if (pending.join() !== (applied.has("20260918100000") ? "" : migrationName)) throw new Error(`Unexpected pending migration set: ${pending.join(",")}`);
  const dry = run("supabase", ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", "--dry-run"]);
  if (dry.status !== 0 || (!applied.has("20260918100000") && !`${dry.stdout}\n${dry.stderr}`.includes(migrationName))) throw new Error("Staging migration dry-run failed.");
  if (action === "preflight") console.log(JSON.stringify({ environment: "staging", mode: "preflight", pending, migrationSha256: expectedSha256 }));
  else {
    if (arg("--confirm") !== "staging:phase7-migration") throw new Error("Staging Phase 7 migration confirmation required.");
    const manifest = path.resolve(arg("--backup-manifest") || ""); if (!manifest.startsWith(path.join(secure, "phase7/staging-backups") + path.sep)) throw new Error("Phase 7 restricted backup manifest required.");
    const backup = JSON.parse(fs.readFileSync(manifest, "utf8")); if (backup.environment !== "staging" || backup.projectRef !== project.ref || backup.migrationSha256 !== expectedSha256 || Date.now() - Date.parse(backup.recordedAt) > 86_400_000) throw new Error("Backup manifest is stale or mismatched.");
    for (const entry of backup.files) if (digest(path.join(path.dirname(manifest), entry.name)) !== entry.sha256) throw new Error("Backup checksum mismatch.");
    const pushed = run("supabase", ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", "--yes"]); if (pushed.status !== 0) throw new Error("Staging migration failed; output withheld.");
    console.log(JSON.stringify({ environment: "staging", mode: "applied", migration: migrationName, sha256: expectedSha256 }));
  }
} else {
  const [result] = await query(`select
    exists(select 1 from supabase_migrations.schema_migrations where version='20260918100000') migration_applied,
    (select schedule='15 seconds' from cron.job where jobname='hungrie-expire-pending-orders') expiry_schedule,
    (select schedule='*/5 * * * *' from cron.job where jobname='hungrie-detect-restaurant-non-response') incident_schedule,
    not has_function_privilege('authenticated','private.detect_repeated_order_non_response_v1(timestamptz)','execute') authenticated_denied,
    pg_get_userbyid(p.proowner)='hungrie_api_owner' owner_ok
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='detect_repeated_order_non_response_v1'`);
  if (!result || Object.values(result).some(value => value !== true)) throw new Error("Staging Phase 7 reliability verification failed.");
  console.log(JSON.stringify({ environment: "staging", verified: true, migrationSha256: expectedSha256, checks: result }));
}
