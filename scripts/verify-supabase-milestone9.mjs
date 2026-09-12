import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secureDir = path.join(ROOT_DIR, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secureDir, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const tokenPath = path.join(secureDir, "supabase-cli-hungrie", "access-token");
if (!project?.ref || !project?.url || !project?.publishableKey || !fs.existsSync(tokenPath)) throw new Error("Ignored development credentials are unavailable.");
const accessToken = fs.readFileSync(tokenPath, "utf8").trim();
const environment = { ...process.env, SUPABASE_HOME: path.dirname(tokenPath), SUPABASE_ACCESS_TOKEN: accessToken };
const result = spawnSync("supabase", ["db", "query", "--linked", `select json_build_object(
  'migration_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20260904160000'),
  'topic_rpc',to_regprocedure('public.my_order_realtime_topics()') is not null,
  'trigger_installed',exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_private_realtime' and not tgisinternal),
  'receive_policy',exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='order_private_broadcast_receive' and cmd='SELECT'),
  'client_send_policy',exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and cmd='INSERT' and ('authenticated'=any(roles) or 'public'=any(roles))),
  'orders_in_publication',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders')
) as result`, "--output-format", "json"], { cwd: ROOT_DIR, env: environment, encoding: "utf8" });
if (result.status !== 0) throw new Error("Hosted Milestone 9 database verification failed.");
const database = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))).rows[0]?.result;

const configResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/realtime`, { headers: { authorization: `Bearer ${accessToken}` } });
if (!configResponse.ok) throw new Error(`Unable to verify hosted Realtime configuration (${configResponse.status}).`);
const realtimeConfig = await configResponse.json();
const anonymousResponse = await fetch(`${project.url}/rest/v1/rpc/my_order_realtime_topics`, {
  method: "POST", headers: { apikey: project.publishableKey, "content-type": "application/json" }, body: "{}",
});
const passed = Boolean(database?.migration_applied && database.topic_rpc && database.trigger_installed && database.receive_policy
  && !database.client_send_policy && !database.orders_in_publication && realtimeConfig.private_only === true && !anonymousResponse.ok);
console.log(JSON.stringify({ passed, database, realtime: { privateOnly: realtimeConfig.private_only === true }, anonymousTopicDiscoveryStatus: anonymousResponse.status }, null, 2));
if (!passed) throw new Error("Hosted Milestone 9 verification failed.");
