import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const state = JSON.parse(fs.readFileSync(path.join(SECURE_DIR, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const tokenPath = path.join(SECURE_DIR, "supabase-cli-hungrie", "access-token");
if (!project?.url || !project?.publishableKey || !fs.existsSync(tokenPath)) throw new Error("Ignored development credentials are unavailable.");
const env = { ...process.env, SUPABASE_HOME: path.dirname(tokenPath), SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim() };
const query = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql, "--output-format", "json"], { cwd: ROOT_DIR, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Hosted Milestone 6 verification query failed.");
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))).rows;
};
const database = query(`select json_build_object(
  'migration_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20260904120000'),
  'staging_tables',(select count(*) from information_schema.tables where table_schema='migration' and table_name like 'identity_%_stage'),
  'completed_runs',(select count(*) from migration.import_runs where status='completed' and counts ? 'identity'),
  'profiles',(select count(*) from public.profiles),
  'addresses',(select count(*) from public.addresses),
  'favorites',(select count(*) from public.favorites),
  'memberships',(select count(*) from private.restaurant_members),
  'latest_counts',(select counts->'identity' from migration.import_runs where status='completed' and counts ? 'identity' order by completed_at desc limit 1),
  'latest_source_checksum',(select source_checksum from migration.import_runs where status='completed' and counts ? 'identity' order by completed_at desc limit 1)
) as result`)[0]?.result;
const headers = { apikey: project.publishableKey };
const [profiles, addresses, favorites, memberships, staging] = await Promise.all([
  fetch(`${project.url}/rest/v1/profiles?select=id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/addresses?select=id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/favorites?select=restaurant_id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/my_restaurant_memberships?select=restaurant_id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/identity_profiles_stage?select=id&limit=1`, { headers }),
]);
const anonymousDenied = [profiles, addresses, favorites, memberships, staging].every((response) => !response.ok);
const latest = database?.latest_counts;
const passed = Boolean(database?.migration_applied && database.staging_tables === 4 && database.completed_runs >= 1
  && database.profiles === latest?.profiles && database.addresses === latest?.addresses
  && database.favorites === latest?.favorites && database.memberships === latest?.memberships && anonymousDenied);
console.log(JSON.stringify({ passed, database, anonymousDenied }, null, 2));
if (!passed) throw new Error("Hosted Milestone 6 verification failed.");
