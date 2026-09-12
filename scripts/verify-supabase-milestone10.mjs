import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secureDir = path.join(root, "secure");
const statePath = path.join(secureDir, "supabase-projects.local.json");
const tokenPath = path.join(secureDir, "supabase-cli-hungrie", "access-token");
if (!fs.existsSync(statePath) || !fs.existsSync(tokenPath)) {
  throw new Error("Ignored development Supabase state is unavailable.");
}
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects?.development;
if (!project?.ref || !project?.url || !project?.publishableKey) {
  throw new Error("Development Supabase project configuration is incomplete.");
}

const environment = {
  ...process.env,
  SUPABASE_HOME: path.dirname(tokenPath),
  SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim(),
};
const sql = `select json_build_object(
  'migration_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20260905100000'),
  'protected_tables',(select count(*) from information_schema.tables where table_schema='private' and table_name in ('notification_preferences','notification_events','notification_deliveries')),
  'client_token_access',has_table_privilege('authenticated','private.push_tokens','select'),
  'client_event_access',has_table_privilege('authenticated','private.notification_events','select'),
  'anon_register',has_function_privilege('anon','public.register_my_push_token(text,public.notification_platform)','execute'),
  'authenticated_register',has_function_privilege('authenticated','public.register_my_push_token(text,public.notification_platform)','execute'),
  'authenticated_worker_claim',has_function_privilege('authenticated','public.claim_notification_deliveries(integer)','execute'),
  'service_worker_claim',has_function_privilege('service_role','public.claim_notification_deliveries(integer)','execute'),
  'worker_vault_secrets',(select count(*) from vault.secrets where name in ('notification_worker_url','notification_worker_secret')),
  'jobs',(select count(*) from cron.job where jobname in ('hungrie-expire-pending-orders','hungrie-notification-dispatch','hungrie-notification-receipts')),
  'review_reply_trigger',exists(select 1 from pg_trigger where tgrelid='public.product_reviews'::regclass and tgname='product_review_reply_notification' and not tgisinternal),
  'event_wakeup_trigger',exists(select 1 from pg_trigger where tgrelid='private.notification_events'::regclass and tgname='notification_event_worker_wakeup' and not tgisinternal),
  'restaurant_create_rpc',to_regprocedure('public.create_restaurant(jsonb)') is not null,
  'management_read_rpc',to_regprocedure('public.get_restaurant_menu_management_data(text)') is not null
) as result`;
const query = spawnSync("supabase", ["db", "query", "--linked", sql, "--output-format", "json"], {
  cwd: root,
  env: environment,
  encoding: "utf8",
});
if (query.status !== 0) throw new Error("Hosted Milestone 10 database verification failed.");
const database = JSON.parse(query.stdout.slice(query.stdout.indexOf("{"))).rows[0]?.result;

const publicHeaders = { apikey: project.publishableKey, "content-type": "application/json" };
const [anonymousRegister, anonymousPreferences, unauthenticatedWorker] = await Promise.all([
  fetch(`${project.url}/rest/v1/rpc/register_my_push_token`, {
    method: "POST",
    headers: publicHeaders,
    body: JSON.stringify({ p_token: "ExpoPushToken[verification_only]", p_platform: "ios" }),
  }),
  fetch(`${project.url}/rest/v1/rpc/get_my_notification_preferences`, {
    method: "POST",
    headers: publicHeaders,
    body: "{}",
  }),
  fetch(`${project.url}/functions/v1/notification-worker`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "dispatch" }),
  }),
]);

const passed = Boolean(
  database?.migration_applied && database.protected_tables === 3
  && !database.client_token_access && !database.client_event_access
  && !database.anon_register && database.authenticated_register
  && !database.authenticated_worker_claim && database.service_worker_claim
  && database.worker_vault_secrets === 2 && database.jobs === 3
  && database.review_reply_trigger && database.event_wakeup_trigger
  && database.restaurant_create_rpc && database.management_read_rpc
  && !anonymousRegister.ok && !anonymousPreferences.ok
  && unauthenticatedWorker.status === 401
);
console.log(JSON.stringify({
  passed,
  database,
  publicDenials: {
    tokenRegistration: anonymousRegister.status,
    preferences: anonymousPreferences.status,
    workerWithoutSecret: unauthenticatedWorker.status,
  },
}, null, 2));
if (!passed) throw new Error("Hosted Milestone 10 verification failed.");
