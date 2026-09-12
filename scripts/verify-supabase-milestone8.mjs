import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const state = JSON.parse(fs.readFileSync(path.join(SECURE_DIR, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const tokenPath = path.join(SECURE_DIR, "supabase-cli-hungrie", "access-token");
const expectedChecksum = process.argv.find((value) => value.startsWith("--source-checksum="))?.split("=")[1] || null;
if (!project?.url || !project?.publishableKey || !fs.existsSync(tokenPath)) throw new Error("Ignored development credentials are unavailable.");
const environment = { ...process.env, SUPABASE_HOME: path.dirname(tokenPath), SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim() };
const query = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql, "--output-format", "json"], { cwd: ROOT_DIR, env: environment, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Hosted Milestone 8 verification query failed.");
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))).rows;
};
const checksumFilter = expectedChecksum ? `and r.source_checksum='${expectedChecksum.replaceAll("'", "''")}'` : "and false";
const database = query(`select json_build_object(
  'migration_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20260904150000'),
  'stage_tables',(select count(*) from information_schema.tables where table_schema='migration' and table_name in ('orders_stage','order_contacts_stage','order_items_stage','order_quarantine')),
  'source_menu_item_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='source_menu_item_id'),
  'anon_stage_access',has_table_privilege('anon','migration.orders_stage','select'),
  'authenticated_quarantine_access',has_table_privilege('authenticated','migration.order_quarantine','select'),
  'authenticated_metadata_access',has_table_privilege('authenticated','private.order_import_metadata','select'),
  'order_item_rpc_authenticated',has_function_privilege('authenticated','public.get_order_items(text)','execute'),
  'order_item_rpc_anon',has_function_privilege('anon','public.get_order_items(text)','execute'),
  'live_run_status',(select r.status from migration.import_runs r where true ${checksumFilter}),
  'live_source_orders',(select (r.counts->'source'->>'orders')::integer from migration.import_runs r where true ${checksumFilter}),
  'live_promoted_orders',(select count(*) from private.order_import_metadata m join migration.import_runs r on r.id=m.run_id where true ${checksumFilter}),
  'live_quarantined_orders',(select count(distinct q.document_id) from migration.order_quarantine q join migration.import_runs r on r.id=q.run_id where true ${checksumFilter}),
  'live_items',(select count(*) from public.order_items i join private.order_import_metadata m on m.order_id=i.order_id join migration.import_runs r on r.id=m.run_id where true ${checksumFilter}),
  'live_history',(select count(*) from private.order_status_history h join private.order_import_metadata m on m.order_id=h.order_id join migration.import_runs r on r.id=m.run_id where h.source='firebase_import' ${checksumFilter}),
  'live_contacts',(select count(*) from private.order_contacts c join private.order_import_metadata m on m.order_id=c.order_id join migration.import_runs r on r.id=m.run_id where true ${checksumFilter}),
  'live_audits',(select count(*) from private.audit_log a join private.order_import_metadata m on m.order_id=a.target_id join migration.import_runs r on r.id=m.run_id where a.action='order.imported' and a.target_type='order' ${checksumFilter}),
  'live_unlinked_items',(select count(*) from public.order_items i join private.order_import_metadata m on m.order_id=i.order_id join migration.import_runs r on r.id=m.run_id where i.source_menu_item_id is not null and i.menu_item_id is null ${checksumFilter}),
  'live_status_counts',(select coalesce(jsonb_object_agg(status,total),'{}') from (select o.status,count(*) total from public.orders o join private.order_import_metadata m on m.order_id=o.id join migration.import_runs r on r.id=m.run_id where true ${checksumFilter} group by o.status order by o.status)x),
  'live_quarantine_reasons',(select coalesce(jsonb_object_agg(reason_code,total),'{}') from (select q.reason_code,count(*) total from migration.order_quarantine q join migration.import_runs r on r.id=q.run_id where true ${checksumFilter} group by q.reason_code order by q.reason_code)x),
  'live_financial_totals',(select jsonb_build_object('subtotal_kurus',coalesce(sum(o.subtotal_kurus),0),'service_fee_kurus',coalesce(sum(o.service_fee_kurus),0),'total_kurus',coalesce(sum(o.total_kurus),0)) from public.orders o join private.order_import_metadata m on m.order_id=o.id join migration.import_runs r on r.id=m.run_id where true ${checksumFilter}),
  'review_promoted',(select count(*) from public.product_reviews),
  'review_quarantined',(select count(distinct (q.collection_path,q.document_id)) from migration.review_quarantine q)
) as result`)[0]?.result;

const headers = { apikey: project.publishableKey };
const [stage, quarantine, items] = await Promise.all([
  fetch(`${project.url}/rest/v1/orders_stage?select=id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/order_quarantine?select=document_id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/rpc/get_order_items`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ p_order_id: "missing" }) }),
]);
const schemaPassed = Boolean(database?.migration_applied && database.stage_tables === 4 && database.source_menu_item_column
  && !database.anon_stage_access && !database.authenticated_quarantine_access && !database.authenticated_metadata_access
  && database.order_item_rpc_authenticated && !database.order_item_rpc_anon && !stage.ok && !quarantine.ok && !items.ok);
const importPassed = !expectedChecksum || Boolean(database.live_run_status === "completed"
  && database.live_source_orders === 245 && database.live_promoted_orders === 240 && database.live_quarantined_orders === 5
  && database.live_items === 409 && database.live_unlinked_items === 409
  && database.live_contacts === 240 && database.live_history === 240 && database.live_audits === 240
  && Number(database.live_financial_totals?.subtotal_kurus) === 13831000
  && Number(database.live_financial_totals?.service_fee_kurus) === 16800
  && Number(database.live_financial_totals?.total_kurus) === 13847800
  && Number(database.live_status_counts?.canceled) === 146 && Number(database.live_status_counts?.delivered) === 94
  && Number(database.live_quarantine_reasons?.DELIVERY_ADDRESS_SNAPSHOT_MISSING) === 2
  && Number(database.live_quarantine_reasons?.RESTAURANT_NOT_IMPORTED) === 3
  && database.live_source_orders === database.live_promoted_orders + database.live_quarantined_orders
  && database.review_promoted === 0 && database.review_quarantined === 2);
const passed = schemaPassed && importPassed;
console.log(JSON.stringify({ passed, schemaPassed, importPassed, database, anonymous: { staging: stage.status, quarantine: quarantine.status, orderItemsWithoutToken: items.status } }, null, 2));
if (!passed) throw new Error("Hosted Milestone 8 verification failed.");
