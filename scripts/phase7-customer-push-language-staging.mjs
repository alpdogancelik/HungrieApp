#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const migrationName = "20260921100000_customer_push_language.sql";
const migrationSha256 = "d36097b124818e12051cefd80526743f782f1562502d98125e7e80451c279e84";
const migrationPath = path.join(root, "supabase/migrations", migrationName);
const action = process.argv[2];
const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const digest = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const registry = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = registry.projects?.staging;
if (!project?.ref || !project?.databasePassword || project.name !== "HungrieApp Staging" ||
  project.ref === registry.projects?.development?.ref || project.ref === registry.projects?.production?.ref) {
  throw new Error("Isolated Staging target required.");
}
if (digest(migrationPath) !== migrationSha256 || arg("--expect-sha256") !== migrationSha256) {
  throw new Error(`Reviewed migration checksum required: ${migrationSha256}`);
}
if (!["preflight", "backup", "apply", "verify"].includes(action)) {
  throw new Error("Use preflight, backup, apply, or verify.");
}

const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token };
const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cliEnv });
const query = async statement => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: statement }),
  });
  if (!response.ok) throw new Error(`Staging query failed (${response.status}); details withheld.`);
  return response.json();
};
const baselineSql = `select
  (select count(*) from public.orders)::integer orders,
  (select count(*) from private.order_status_history)::integer status_events,
  (select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(id,status,updated_at) order by id)::text,'[]'),'sha256'),'hex') from public.orders) orders_digest`;
const migrationHistory = async () => {
  const history = await query("select version from supabase_migrations.schema_migrations order by version");
  const applied = new Set(history.map(row => String(row.version)));
  const pending = fs.readdirSync(path.join(root, "supabase/migrations"))
    .filter(name => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0, 14))).sort();
  return { applied, pending };
};

if (action === "preflight" || action === "backup" || action === "apply") {
  const { applied, pending } = await migrationHistory();
  if (applied.has("20260921100000") || pending.join() !== migrationName) {
    throw new Error(`Unexpected Staging migration state: ${pending.join(",")}`);
  }
  const dry = run("supabase", ["db", "push", "--project-ref", project.ref,
    "--password", project.databasePassword, "--skip-vault", "--dry-run"]);
  if (dry.status !== 0 || !`${dry.stdout}\n${dry.stderr}`.includes(migrationName)) {
    throw new Error("Staging migration dry-run failed; output withheld.");
  }
  if (action === "preflight") {
    console.log(JSON.stringify({ environment: "staging", pending, migrationSha256, dryRun: true }));
  } else if (action === "backup") {
    if (arg("--confirm") !== "staging:customer-push-language-backup") throw new Error("Backup confirmation required.");
    const directory = path.join(secure, "phase7/staging-backups/customer-push-language-" + new Date().toISOString().replaceAll(/[:.]/g, "-"));
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const entry of [{ name: "schema.sql", extra: [] }, { name: "data.sql", extra: ["--data-only", "--use-copy"] }]) {
      const file = path.join(directory, entry.name);
      const result = run("supabase", ["db", "dump", "--project-ref", project.ref,
        "--password", project.databasePassword, "--file", file, ...entry.extra]);
      if (result.status !== 0 || !fs.existsSync(file) || fs.statSync(file).size < 1024) {
        throw new Error("Restricted Staging backup failed; output withheld.");
      }
      fs.chmodSync(file, 0o600);
    }
    const files = ["schema.sql", "data.sql"].map(name => ({ name, sha256: digest(path.join(directory, name)), bytes: fs.statSync(path.join(directory, name)).size }));
    const [baseline] = await query(baselineSql);
    const manifest = path.join(directory, "manifest.json");
    fs.writeFileSync(manifest, JSON.stringify({ environment: "staging", projectRef: project.ref,
      recordedAt: new Date().toISOString(), migrationSha256, baseline, files }, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ environment: "staging", manifest, files, baseline }));
  } else {
    if (arg("--confirm") !== "staging:customer-push-language-migration") throw new Error("Migration confirmation required.");
    const manifest = path.resolve(arg("--backup-manifest") || "");
    if (!manifest.startsWith(path.join(secure, "phase7/staging-backups") + path.sep)) throw new Error("Restricted backup manifest required.");
    const backup = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (backup.environment !== "staging" || backup.projectRef !== project.ref || backup.migrationSha256 !== migrationSha256 ||
      Date.now() - Date.parse(backup.recordedAt) > 86_400_000) throw new Error("Backup is stale or mismatched.");
    for (const entry of backup.files) if (digest(path.join(path.dirname(manifest), entry.name)) !== entry.sha256) {
      throw new Error("Backup checksum mismatch.");
    }
    const pushed = run("supabase", ["db", "push", "--project-ref", project.ref,
      "--password", project.databasePassword, "--skip-vault", "--yes"]);
    if (pushed.status !== 0) throw new Error("Staging migration failed; output withheld.");
    console.log(JSON.stringify({ environment: "staging", mode: "applied", migrationName, migrationSha256, backupManifest: manifest }));
  }
} else {
  const [result] = await query(`select
    exists(select 1 from supabase_migrations.schema_migrations where version='20260921100000') migration_applied,
    (select pg_get_userbyid(proowner)='hungrie_api_owner' from pg_proc where oid='public.register_my_customer_push_token_v2(text,public.notification_platform,text)'::regprocedure) owner_ok,
    has_function_privilege('authenticated','public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute') customer_rpc_reachable,
    not has_function_privilege('anon','public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute') anonymous_denied,
    not has_table_privilege('authenticated','private.push_tokens','update') table_private,
    (select position('coalesce(t.preferred_language,p.preferred_language' in pg_get_functiondef('public.claim_notification_deliveries(integer)'::regprocedure))>0) token_language_preferred,
    not has_schema_privilege('hungrie_api_owner','public','create') owner_create_revoked`);
  if (!result || Object.values(result).some(value => value !== true)) throw new Error("Staging push-language contract verification failed.");
  const manifest = path.resolve(arg("--backup-manifest") || "");
  if (!manifest.startsWith(path.join(secure, "phase7/staging-backups") + path.sep)) throw new Error("Restricted backup manifest required.");
  const backup = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (backup.environment !== "staging" || backup.projectRef !== project.ref || backup.migrationSha256 !== migrationSha256) {
    throw new Error("Backup identity mismatch.");
  }
  const [baseline] = await query(baselineSql);
  if (JSON.stringify(baseline) !== JSON.stringify(backup.baseline)) throw new Error("Staging order baseline changed during migration.");
  console.log(JSON.stringify({ environment: "staging", verified: true, migrationSha256, checks: result, baselineReconciled: true }));
}
