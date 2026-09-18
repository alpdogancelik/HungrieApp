#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv.find((value) => value.startsWith("--target="))?.split("=")[1];
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.split("=")[1];

if (!new Set(["development", "staging"]).has(target) || confirmation !== `${target}:review-v2-phase0-read-only`) {
  throw new Error("Use --target=development|staging with --confirm=<target>:review-v2-phase0-read-only. Production is forbidden.");
}

const secureDir = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secureDir, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.[target];
if (!project?.ref || !project.databasePassword || project.ref === state.projects?.production?.ref) {
  throw new Error("A distinct configured non-production project is required.");
}
const other = target === "development" ? state.projects?.staging : state.projects?.development;
if (project.ref === other?.ref) throw new Error("Development and Staging project references must be distinct.");

const accessToken = fs.readFileSync(path.join(secureDir, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const connectionProbe = spawnSync("supabase", [
  "db", "dump", "--dry-run", "--project-ref", project.ref, "--password", project.databasePassword,
], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, SUPABASE_HOME: path.join(secureDir, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: accessToken },
});
if (connectionProbe.status !== 0) throw new Error(`${target} connection discovery failed; output was suppressed.`);
const connectionScript = connectionProbe.stdout;
const connectionValue = (name) => connectionScript.match(new RegExp(`export ${name}="([^"]+)"`))?.[1];
const pgHost = connectionValue("PGHOST");
const pgPort = connectionValue("PGPORT");
const pgUser = connectionValue("PGUSER");
const pgDatabase = connectionValue("PGDATABASE");
if (!pgHost || !pgPort || !pgUser || !pgDatabase || !pgUser.endsWith(`.${project.ref}`)) {
  throw new Error(`${target} connection discovery returned an unexpected non-project route.`);
}

const sql = String.raw`
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
  'captured_at', statement_timestamp(),
  'transaction_read_only', current_setting('transaction_read_only'),
  'migration_versions', coalesce((select jsonb_agg(version order by version) from supabase_migrations.schema_migrations), '[]'::jsonb),
  'counts', jsonb_build_object(
    'product_reviews_total', (select count(*) from public.product_reviews),
    'order_reviews_total', (select count(*) from public.order_reviews),
    'product_reviews_by_status', coalesce((select jsonb_object_agg(status,total) from (select status::text,count(*) total from public.product_reviews group by status) s), '{}'::jsonb),
    'order_reviews_by_status', coalesce((select jsonb_object_agg(status,total) from (select status::text,count(*) total from public.order_reviews group by status) s), '{}'::jsonb),
    'duplicate_product_review_keys', (select count(*) from (select order_id,menu_item_id,profile_id from public.product_reviews group by 1,2,3 having count(*)>1) d),
    'duplicate_order_review_keys', (select count(*) from (select order_id,profile_id from public.order_reviews group by 1,2 having count(*)>1) d)
  ),
  'aggregate_outputs', jsonb_build_object(
    'restaurant_product_review_metrics', coalesce((select jsonb_agg(to_jsonb(m) order by restaurant_id) from public.restaurant_product_review_metrics m), '[]'::jsonb),
    'restaurant_order_review_metrics', coalesce((select jsonb_agg(to_jsonb(m) order by restaurant_id) from public.restaurant_order_review_metrics m), '[]'::jsonb),
    'restaurant_cached_ratings', coalesce((select jsonb_agg(jsonb_build_object('restaurant_id',id,'rating_average',rating_average,'rating_count',rating_count) order by id) from public.restaurants), '[]'::jsonb)
  ),
  'columns', coalesce((select jsonb_agg(jsonb_build_object(
      'table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default,'generated',is_generated,'generation_expression',generation_expression
    ) order by table_name,ordinal_position)
    from information_schema.columns where table_schema='public' and table_name in ('product_reviews','order_reviews')), '[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(jsonb_build_object(
      'table',c.relname,'name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid,true)
    ) order by c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('product_reviews','order_reviews')), '[]'::jsonb),
  'indexes', coalesce((select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) order by tablename,indexname)
    from pg_indexes where schemaname='public' and tablename in ('product_reviews','order_reviews')), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(jsonb_build_object('table',event_object_table,'name',trigger_name,'timing',action_timing,'event',event_manipulation,'statement',action_statement) order by event_object_table,trigger_name,event_manipulation)
    from information_schema.triggers where trigger_schema='public' and event_object_table in ('product_reviews','order_reviews')), '[]'::jsonb),
  'policies', coalesce((select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by tablename,policyname)
    from pg_policies where schemaname='public' and tablename in ('product_reviews','order_reviews')), '[]'::jsonb),
  'relation_security', coalesce((select jsonb_agg(jsonb_build_object('relation',c.relname,'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('product_reviews','order_reviews')), '[]'::jsonb),
  'column_grants', coalesce((select jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type,'column',column_name) order by table_name,grantee,privilege_type,column_name)
    from information_schema.column_privileges where table_schema='public' and table_name in ('product_reviews','order_reviews')), '[]'::jsonb),
  'table_grants', coalesce((select jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type) order by table_name,grantee,privilege_type)
    from information_schema.table_privileges where table_schema='public'
      and (table_name in ('product_reviews','order_reviews') or table_name ilike '%review%')), '[]'::jsonb),
  'routine_grants', coalesce((select jsonb_agg(jsonb_build_object(
      'routine',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),
      'grantee',coalesce(grantee.rolname,'PUBLIC'),'privilege',acl.privilege_type,'grantable',acl.is_grantable
    ) order by p.proname,pg_get_function_identity_arguments(p.oid),coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    left join pg_roles grantee on grantee.oid=acl.grantee
    where n.nspname='public' and p.prokind='f' and p.proname ilike '%review%'), '[]'::jsonb),
  'review_functions', coalesce((select jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid)
    ) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
      and (p.proname ilike '%review%' or pg_get_functiondef(p.oid) ilike '%order_reviews%' or pg_get_functiondef(p.oid) ilike '%product_reviews%')), '[]'::jsonb),
  'review_views', coalesce((select jsonb_agg(jsonb_build_object('schema',schemaname,'name',viewname,'definition',definition) order by schemaname,viewname)
    from pg_views where schemaname='public' and (viewname ilike '%review%' or definition ilike '%order_reviews%' or definition ilike '%product_reviews%')), '[]'::jsonb),
  'dependent_objects', coalesce((select jsonb_agg(distinct jsonb_build_object('source',source.relname,'dependent_schema',dn.nspname,'dependent_object',dependent.relname))
    from pg_depend dep
    join pg_rewrite rw on rw.oid=dep.objid
    join pg_class dependent on dependent.oid=rw.ev_class
    join pg_namespace dn on dn.oid=dependent.relnamespace
    join pg_class source on source.oid=dep.refobjid
    join pg_namespace sn on sn.oid=source.relnamespace
    where sn.nspname='public' and source.relname in ('product_reviews','order_reviews')), '[]'::jsonb)
));
rollback;
`;

const result = spawnSync("docker", [
  "run", "--rm", "-i",
  "-e", `PGPASSWORD=${project.databasePassword}`,
  "postgres:17-alpine", "psql",
  "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align",
  "--host", pgHost, "--port", pgPort, "--username", pgUser, "--dbname", pgDatabase,
], { cwd: root, encoding: "utf8", input: sql, maxBuffer: 64 * 1024 * 1024 });

if (result.status !== 0) {
  const safeError = result.stderr.replaceAll(project.databasePassword, "[PASSWORD]").replaceAll(project.ref, "[PROJECT_REF]").trim();
  throw new Error(`${target} read-only capture failed: ${safeError.slice(0, 800)}`);
}
const output = result.stdout.trim();
const jsonStart = output.indexOf("{");
const jsonEnd = output.lastIndexOf("}");
if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error(`${target} capture did not return JSON evidence.`);
const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
if (parsed.transaction_read_only !== "on") throw new Error("Database session did not prove read-only mode.");

const outputDir = path.join(secureDir, "customer-review-v2-phase0");
fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const outputPath = path.join(outputDir, `${target}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify({ environment: target, ...parsed }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  environment: target,
  outputPath,
  transactionReadOnly: parsed.transaction_read_only,
  migrationCount: parsed.migration_versions.length,
  counts: parsed.counts,
}));
