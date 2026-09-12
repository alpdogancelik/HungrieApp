import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const state = JSON.parse(fs.readFileSync(path.join(SECURE_DIR, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const EXPECTED_SOURCE_CHECKSUM = "b7c1740593a0ba9335bd28e4997f1d3085fea045284088531948c15ce1a1f9db";
const tokenPath = path.join(SECURE_DIR, "supabase-cli-hungrie", "access-token");
if (!project?.url || !project?.publishableKey || !fs.existsSync(tokenPath)) throw new Error("Ignored development credentials are unavailable.");
const environment = { ...process.env, SUPABASE_HOME: path.dirname(tokenPath), SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim() };
const query = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql, "--output-format", "json"], { cwd: ROOT_DIR, env: environment, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Hosted Milestone 7 verification query failed.");
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))).rows;
};
const database = query(`select json_build_object(
  'migration_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20260904140000'),
  'stage_tables',(select count(*) from information_schema.tables where table_schema='migration' and table_name in ('product_reviews_stage','order_reviews_stage','review_quarantine')),
  'product_reviews',(select count(*) from public.product_reviews),
  'order_reviews',(select count(*) from public.order_reviews),
  'anon_stage_access',has_table_privilege('anon','migration.product_reviews_stage','select'),
  'authenticated_quarantine_access',has_table_privilege('authenticated','migration.review_quarantine','select'),
  'live_run_status',(select status from migration.import_runs where source_checksum='${EXPECTED_SOURCE_CHECKSUM}'),
  'live_staged_product_reviews',(select count(*) from migration.product_reviews_stage s join migration.import_runs r on r.id=s.run_id where r.source_checksum='${EXPECTED_SOURCE_CHECKSUM}'),
  'live_quarantined_reviews',(select count(distinct (q.collection_path,q.document_id)) from migration.review_quarantine q join migration.import_runs r on r.id=q.run_id where r.source_checksum='${EXPECTED_SOURCE_CHECKSUM}'),
  'live_quarantine_reasons',(select coalesce(jsonb_object_agg(reason_code,total),'{}') from (select q.reason_code,count(*) total from migration.review_quarantine q join migration.import_runs r on r.id=q.run_id where r.source_checksum='${EXPECTED_SOURCE_CHECKSUM}' group by q.reason_code order by q.reason_code) x),
  'live_quarantine_checksum',(select encode(digest(coalesce(string_agg(q.reason_code||':'||q.collection_path,',' order by q.reason_code,q.collection_path,q.document_id),''),'sha256'),'hex') from migration.review_quarantine q join migration.import_runs r on r.id=q.run_id where r.source_checksum='${EXPECTED_SOURCE_CHECKSUM}')
) as result`)[0]?.result;
const headers = { apikey: project.publishableKey };
const [productSummary, orderSummary, quarantine, hidden] = await Promise.all([
  fetch(`${project.url}/rest/v1/rpc/get_restaurant_product_review_summary`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ p_restaurant_id: "missing" }) }),
  fetch(`${project.url}/rest/v1/rpc/get_restaurant_order_review_summary`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ p_restaurant_id: "missing" }) }),
  fetch(`${project.url}/rest/v1/review_quarantine?select=document_id&limit=1`, { headers }),
  fetch(`${project.url}/rest/v1/product_reviews?select=profile_id,order_id&limit=1`, { headers }),
]);
const product = productSummary.ok ? await productSummary.json() : null;
const order = orderSummary.ok ? await orderSummary.json() : null;
const passed = Boolean(database?.migration_applied && database.stage_tables === 3
  && database.product_reviews === 0 && database.order_reviews === 0
  && database.live_run_status === "completed" && database.live_staged_product_reviews === 2
  && database.live_quarantined_reviews === 2
  && !database.anon_stage_access && !database.authenticated_quarantine_access
  && productSummary.ok && Number(product?.rating_count) === 0
  && orderSummary.ok && Number(order?.review_count) === 0
  && !quarantine.ok && !hidden.ok);
console.log(JSON.stringify({ passed, database, anonymous: { productSummary: productSummary.status, orderSummary: orderSummary.status, quarantine: quarantine.status, privateRelationshipColumns: hidden.status } }, null, 2));
if (!passed) throw new Error("Hosted Milestone 7 verification failed.");
