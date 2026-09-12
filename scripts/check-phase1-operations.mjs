import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${command} readiness check failed; command output withheld.`);
  return result.stdout.trim();
};

for (const file of [
  "scripts/check-supabase-health.mjs",
  "scripts/set-supabase-runtime-mode.mjs",
  "scripts/backup-supabase-postgres.mjs",
  "scripts/restore-supabase-postgres-drill.mjs"
]) run("node", ["--check", file]);

const sql = `select json_build_object(
  'health_rpc', to_regprocedure('public.system_health()') is not null,
  'runtime_rpc', to_regprocedure('public.get_runtime_status()') is not null,
  'release_rpc', to_regprocedure('public.get_client_release_policy_v1(text,text,integer,integer)') is not null,
  'release_policy_table', to_regclass('private.client_release_policy') is not null,
  'expiry_job', exists(select 1 from cron.job where jobname='hungrie-expire-pending-orders'),
  'retained_policy_rows', (select count(*) from private.client_release_policy)
)`;
const output = run("docker", ["exec", "supabase_db_hungrie-app", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql]);
const result = JSON.parse(output);
for (const key of ["health_rpc", "runtime_rpc", "release_rpc", "release_policy_table", "expiry_job"]) {
  assert.equal(result[key], true, `${key} is unavailable in the local database`);
}
assert.equal(Number(result.retained_policy_rows), 0, "Phase 1 probe must not retain policy rows");
console.log(JSON.stringify({ target: "local", ...result, backupRestoreScripts: "syntax-valid", hostedBackupRestoreDrill: "not-run" }));
