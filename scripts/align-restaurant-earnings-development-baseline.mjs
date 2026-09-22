#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const migrationsDirectory = path.join(root, "supabase", "migrations");
const authorized = [
  { version: "20260918100000", name: "20260918100000_phase7_staging_reliability.sql", sha256: "ac3419cade9767d9257fdceb963ee42d5e454934dec73cd59b17a2366286a9cd" },
  { version: "20260920170000", name: "20260920170000_restaurant_customer_cancellation_message.sql", sha256: "74fc88781ad02518cc60c2d86fd8104ca899c3f622d14fca0551fbbd170cc30b" },
  { version: "20260921100000", name: "20260921100000_customer_push_language.sql", sha256: "d36097b124818e12051cefd80526743f782f1562502d98125e7e80451c279e84" },
];
const earnings = "20260922100000_restaurant_earnings_admin_commission.sql";
const action = process.argv[2] || "";
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
if (!["review", "backup", "apply-next", "verify-final"].includes(action)) throw new Error("Use review|backup|apply-next|verify-final.");
if (option("--environment") !== "development") throw new Error("Explicit --environment=development is required; no default is allowed.");
const expectedConfirmation = `development:earnings-baseline:${action}`;
if (option("--confirm") !== expectedConfirmation) throw new Error(`Confirmation mismatch; expected ${expectedConfirmation}.`);

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
for (const migration of authorized) {
  const file = path.join(migrationsDirectory, migration.name);
  if (sha256(fs.readFileSync(file)) !== migration.sha256) throw new Error(`Checksum mismatch for ${migration.name}.`);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", `supabase/migrations/${migration.name}`], { cwd: root, encoding: "utf8" });
  const clean = spawnSync("git", ["diff", "--quiet", "--", `supabase/migrations/${migration.name}`], { cwd: root });
  if (tracked.status !== 0 || clean.status !== 0) throw new Error(`${migration.name} is not an unchanged tracked repository migration.`);
  if (fs.readFileSync(file, "utf8").includes("restaurant_earnings_v1")) throw new Error(`${migration.name} unexpectedly depends on Restaurant Earnings.`);
}

const registry = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = registry.projects?.development;
if (!project?.ref || !project.databasePassword || project.name !== "HungrieApp Development" || project.ref === registry.projects?.staging?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Development registry entry required.");
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
if (!token) throw new Error("Approved Supabase credential unavailable.");
const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token };
const query = async statement => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query: statement }) });
  if (!response.ok) throw new Error(`Development SQL request failed (${response.status}); response withheld.`);
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error("Development SQL response malformed.");
  return value;
};
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, { headers: { authorization: `Bearer ${token}` } });
if (!metadataResponse.ok) throw new Error(`Development metadata request failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
if (metadata.id !== project.ref || metadata.name !== "HungrieApp Development" || metadata.status !== "ACTIVE_HEALTHY") throw new Error("Development metadata identity or health mismatch.");

const localMigrations = fs.readdirSync(migrationsDirectory).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
const history = async () => (await query("begin read only; select version from supabase_migrations.schema_migrations order by version; rollback;")).map(row => String(row.version));
const state = async () => {
  const versions = await history(), applied = new Set(versions);
  return { versions, pending: localMigrations.filter(name => !applied.has(name.slice(0, 14))) };
};
const expectedPendingFor = versions => {
  const applied = new Set(versions);
  return [...authorized.filter(item => !applied.has(item.version)).map(item => item.name), earnings];
};
const requireAuthorizedState = current => {
  const expected = expectedPendingFor(current.versions);
  if (current.pending.join() !== expected.join()) throw new Error(`Unexpected pending migration set: ${current.pending.join(",")}.`);
  if (current.versions.some(version => version > "20260921100000")) throw new Error("Unexpected later Development migration exists.");
  return authorized.find(item => !current.versions.includes(item.version)) || null;
};
const riskSql = `begin read only; select
  (select count(*)::integer from public.orders where status='pending' and approval_deadline_at<=statement_timestamp()) overdue_pending_orders,
  (select count(*)::integer from (with eligible as(select o.restaurant_id,count(*) eligible_order_count,count(*) filter(where exists(select 1 from private.order_status_history h where h.order_id=o.id and h.new_status='canceled' and h.source='system' and h.reason='approval_deadline_expired')) ignored_order_count from public.orders o where o.approval_deadline_at>=statement_timestamp()-interval '30 minutes' and o.approval_deadline_at<statement_timestamp() group by o.restaurant_id)select 1 from eligible where ignored_order_count>=3 and ignored_order_count*2>=eligible_order_count)x) detector_candidates,
  to_regclass('private.restaurant_earnings_capabilities') is not null earnings_capability_table_exists,
  (select count(*)::integer from public.restaurants where id like 'earnp4\\_%' escape '\\') earnp4_restaurants,
  (select count(*)::integer from public.profiles where id like 'earnp4\\_%' escape '\\') earnp4_profiles,
  (select count(*)::integer from public.orders where id like 'earnp4\\_%' escape '\\' or profile_id like 'earnp4\\_%' escape '\\' or restaurant_id like 'earnp4\\_%' escape '\\') earnp4_orders;
  rollback;`;
const baselineSql = `begin read only; select
  (select count(*)::integer from public.orders) orders,
  (select count(*)::integer from public.profiles) profiles,
  (select count(*)::integer from public.restaurants) restaurants,
  (select count(*)::integer from private.order_status_history) status_events,
  (select count(*)::integer from private.restaurant_operational_incidents) incidents,
  (select count(*)::integer from private.audit_log) audit_events,
  (select count(*)::integer from private.push_tokens) push_tokens,
  encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,status,approval_deadline_at,updated_at) order by id)::text from public.orders),'[]'),'sha256'),'hex') orders_digest,
  encode(extensions.digest(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from private.order_status_history h),'[]'),'sha256'),'hex') status_digest,
  encode(extensions.digest(coalesce((select jsonb_agg(to_jsonb(i) order by id)::text from private.restaurant_operational_incidents i),'[]'),'sha256'),'hex') incidents_digest,
  encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,profile_id,restaurant_id,token_hash,preferred_language,updated_at) order by id)::text from private.push_tokens),'[]'),'sha256'),'hex') push_tokens_digest;
  rollback;`;
const compatibilitySql = `begin read only; select
  to_regprocedure('private.expire_pending_orders(integer)') is not null expiry_dependency,
  to_regprocedure('private.write_audit(text,text,text,text,jsonb)') is not null audit_dependency,
  to_regclass('private.restaurant_operational_incidents') is not null incidents_dependency,
  to_regprocedure('public.restaurant_transition_order_v1(text,timestamptz,text,text,text,uuid)') is not null transition_dependency,
  to_regprocedure('public.get_my_customer_order_v1(text)') is not null customer_order_dependency,
  to_regprocedure('private.require_active_restaurant()') is not null restaurant_guard_dependency,
  to_regprocedure('private.require_active_customer()') is not null customer_guard_dependency,
  to_regprocedure('public.register_my_push_token(text,public.notification_platform)') is not null push_registration_dependency,
  to_regprocedure('private.materialize_notification_deliveries()') is not null materialize_dependency,
  to_regprocedure('private.notification_event_is_current(private.notification_events)') is not null current_event_dependency,
  exists(select 1 from information_schema.columns where table_schema='private' and table_name='push_tokens' and column_name='preferred_language') push_language_dependency,
  to_regprocedure('private.detect_repeated_order_non_response_v1(timestamptz)') is not null detector_conflict,
  to_regclass('private.restaurant_customer_cancellation_messages') is not null cancellation_table_conflict,
  to_regprocedure('public.restaurant_cancel_order_v2(text,timestamptz,text,text,uuid)') is not null cancellation_rpc_conflict,
  to_regprocedure('public.get_my_customer_order_v2(text)') is not null customer_order_v2_conflict,
  to_regprocedure('public.register_my_customer_push_token_v2(text,public.notification_platform,text)') is not null push_v2_conflict;
  rollback;`;

const makeWorktree = target => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "earnings-baseline-"));
  fs.mkdirSync(path.join(directory, "supabase", "migrations"), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(root, "supabase", "config.toml"), path.join(directory, "supabase", "config.toml"));
  for (const name of localMigrations.filter(name => name <= target.name)) fs.copyFileSync(path.join(migrationsDirectory, name), path.join(directory, "supabase", "migrations", name));
  return directory;
};
const pushThrough = (target, apply) => {
  const directory = makeWorktree(target);
  try {
    const args = ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", apply ? "--yes" : "--dry-run"];
    const result = spawnSync("supabase", args, { cwd: directory, env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const listed = [...new Set([...output.matchAll(/\d{14}_[A-Za-z0-9_]+\.sql/g)].map(match => match[0]))];
    if (result.status !== 0 || !listed.includes(target.name) || listed.some(name => name !== target.name)) throw new Error(`${apply ? "Application" : "Dry-run"} did not resolve exactly ${target.name}; output withheld.`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

const current = await state();
const next = requireAuthorizedState(current);
const [risks] = await query(riskSql);
if (Number(risks.overdue_pending_orders) || Number(risks.detector_candidates) || risks.earnings_capability_table_exists || Number(risks.earnp4_restaurants) || Number(risks.earnp4_profiles) || Number(risks.earnp4_orders)) throw new Error("Development risk/earnings-isolation gate failed; no mutation performed.");

const phaseDirectory = path.join(secure, "restaurant-earnings-development-baseline-alignment");
fs.mkdirSync(phaseDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(phaseDirectory, 0o700);
const manifestPath = option("--backup-manifest") ? path.resolve(option("--backup-manifest")) : path.join(phaseDirectory, "backup-manifest.json");

if (action === "review") {
  const [compatibility] = await query(compatibilitySql);
  const dependencies = Object.entries(compatibility).filter(([key]) => key.endsWith("_dependency"));
  const expectedObjects = {
    detector_conflict: current.versions.includes("20260918100000"),
    cancellation_table_conflict: current.versions.includes("20260920170000"),
    cancellation_rpc_conflict: current.versions.includes("20260920170000"),
    customer_order_v2_conflict: current.versions.includes("20260920170000"),
    push_v2_conflict: current.versions.includes("20260921100000"),
  };
  if (dependencies.some(([, value]) => value !== true) || Object.entries(expectedObjects).some(([key, expected]) => compatibility[key] !== expected)) throw new Error("Live schema dependency or conflict check failed; no mutation performed.");
  if (next) pushThrough(next, false);
  console.log(JSON.stringify({ action, environment: "development", projectRef: project.ref, historyCount: current.versions.length, latest: current.versions.at(-1), pending: current.pending, next: next?.name || null, dryRun: Boolean(next), risks, compatibility, checksums: Object.fromEntries(authorized.map(item => [item.name, item.sha256])) }));
} else if (action === "backup") {
  if (!next || next !== authorized[0]) throw new Error("Backup must be taken immediately before the first authorized migration.");
  pushThrough(next, false);
  if (fs.existsSync(manifestPath)) throw new Error("Baseline-alignment backup manifest already exists.");
  const backupDirectory = path.join(phaseDirectory, `backup-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`);
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const schemaPath = path.join(backupDirectory, "schema.sql");
  const dump = spawnSync("supabase", ["db", "dump", "--project-ref", project.ref, "--password", project.databasePassword, "--schema", "public,private,cron", "--file", schemaPath], { cwd: root, env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (dump.status !== 0 || !fs.existsSync(schemaPath) || fs.statSync(schemaPath).size < 1024) throw new Error("Scoped schema backup failed; output withheld.");
  fs.chmodSync(schemaPath, 0o600);
  const definitions = await query(`begin read only; select n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('private','expire_pending_orders'),('public','claim_notification_deliveries')) order by 1,2,3; rollback;`);
  const cron = await query("begin read only; select jobname,schedule,command,database,username,active from cron.job where jobname in ('hungrie-expire-pending-orders','hungrie-detect-restaurant-non-response') order by jobname; rollback;");
  const [baseline] = await query(baselineSql);
  const files = [
    ["function-definitions.json", definitions],
    ["cron-config.json", cron],
    ["protected-baseline.json", { history: current.versions, baseline, risks }],
  ];
  for (const [name, value] of files) fs.writeFileSync(path.join(backupDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const entries = ["schema.sql", ...files.map(([name]) => name)].map(name => { const file = path.join(backupDirectory, name); return { name, path: file, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), mode: (fs.statSync(file).mode & 0o777).toString(8) }; });
  const manifest = { environment: "development", projectRef: project.ref, createdAt: new Date().toISOString(), sensitivity: "sensitive-restricted-local-schema-and-non-PII-metadata", includedScope: ["schema-only:public,private,cron", "function-definitions:expire_pending_orders,claim_notification_deliveries", "cron-config:two-target-jobs", "non-PII:counts-and-digests"], excludedScope: ["Firebase credentials", "tokens", "TOTP secrets", "Customer PII", "table row dumps"], retention: "Phase 4 acceptance plus seven calendar days", authorizedMigrations: authorized, files: entries };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ action, environment: "development", manifestPath, createdAt: manifest.createdAt, sensitivity: manifest.sensitivity, files: entries.map(({ path: ignored, ...entry }) => entry) }));
} else if (action === "apply-next") {
  if (!next) throw new Error("All separately authorized baseline migrations are already applied.");
  if (option("--migration") !== next.name) throw new Error(`Only the next authorized migration may be applied: ${next.name}.`);
  if (!manifestPath.startsWith(`${phaseDirectory}${path.sep}`) || !fs.existsSync(manifestPath)) throw new Error("Protected baseline-alignment backup manifest required.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.environment !== "development" || manifest.projectRef !== project.ref || Date.now() - Date.parse(manifest.createdAt) >= 86_400_000 || Date.now() < Date.parse(manifest.createdAt)) throw new Error("Backup manifest is stale or mismatched.");
  for (const entry of manifest.files || []) if (!path.resolve(entry.path).startsWith(`${path.dirname(manifestPath)}${path.sep}`) || !fs.existsSync(entry.path) || sha256(fs.readFileSync(entry.path)) !== entry.sha256 || (fs.statSync(entry.path).mode & 0o077) !== 0) throw new Error("Backup path, checksum, or permission verification failed.");
  const baseline = JSON.parse(fs.readFileSync(manifest.files.find(entry => entry.name === "protected-baseline.json").path, "utf8")).baseline;
  pushThrough(next, false);
  pushThrough(next, true);
  const afterState = await state();
  if (afterState.versions.length !== current.versions.length + 1 || afterState.versions.filter(version => version === next.version).length !== 1 || afterState.versions.at(-1) !== next.version) throw new Error("Post-apply migration history verification failed.");
  requireAuthorizedState(afterState);
  const [afterBaseline] = await query(baselineSql);
  if (JSON.stringify(afterBaseline) !== JSON.stringify(baseline)) throw new Error("Protected Development data changed during baseline alignment.");
  let verification;
  if (next === authorized[0]) [verification] = await query(`select
    exists(select 1 from supabase_migrations.schema_migrations where version='20260918100000') migration_applied,
    (select schedule='15 seconds' and command='select private.expire_pending_orders(100)' from cron.job where jobname='hungrie-expire-pending-orders') expiry_schedule,
    (select schedule='*/5 * * * *' and command='select private.detect_repeated_order_non_response_v1()' from cron.job where jobname='hungrie-detect-restaurant-non-response') detector_schedule,
    pg_get_userbyid(p.proowner)='hungrie_api_owner' owner_ok,
    not has_function_privilege('authenticated',p.oid,'execute') authenticated_denied,
    pg_get_functiondef(p.oid) like '%SET search_path TO %' search_path_safe
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='detect_repeated_order_non_response_v1'`);
  else if (next === authorized[1]) [verification] = await query(`select
    exists(select 1 from supabase_migrations.schema_migrations where version='20260920170000') migration_applied,
    (select relrowsecurity from pg_class where oid='private.restaurant_customer_cancellation_messages'::regclass) rls_enabled,
    (select pg_get_userbyid(relowner)='hungrie_api_owner' from pg_class where oid='private.restaurant_customer_cancellation_messages'::regclass) owner_ok,
    has_function_privilege('authenticated','public.restaurant_cancel_order_v2(text,timestamptz,text,text,uuid)','execute') restaurant_rpc_reachable,
    has_function_privilege('authenticated','public.get_my_customer_order_v2(text)','execute') customer_rpc_reachable,
    not has_function_privilege('anon','public.get_my_customer_order_v2(text)','execute') anonymous_denied,
    not has_table_privilege('authenticated','private.restaurant_customer_cancellation_messages','select') table_private,
    (select count(*)=0 from private.restaurant_customer_cancellation_messages) table_empty`);
  else [verification] = await query(`select
    exists(select 1 from supabase_migrations.schema_migrations where version='20260921100000') migration_applied,
    (select pg_get_userbyid(proowner)='hungrie_api_owner' from pg_proc where oid='public.register_my_customer_push_token_v2(text,public.notification_platform,text)'::regprocedure) owner_ok,
    has_function_privilege('authenticated','public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute') customer_rpc_reachable,
    not has_function_privilege('anon','public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute') anonymous_denied,
    not has_table_privilege('authenticated','private.push_tokens','select') token_table_private,
    (select pg_get_userbyid(proowner)='postgres' from pg_proc where oid='public.claim_notification_deliveries(integer)'::regprocedure) claim_owner_preserved,
    has_function_privilege('service_role','public.claim_notification_deliveries(integer)','execute') claim_service_role_reachable,
    not has_function_privilege('authenticated','public.claim_notification_deliveries(integer)','execute') claim_authenticated_denied,
    not has_function_privilege('anon','public.claim_notification_deliveries(integer)','execute') claim_anonymous_denied,
    (select pg_get_functiondef(oid) like '%SET search_path TO %' from pg_proc where oid='public.claim_notification_deliveries(integer)'::regprocedure) claim_search_path_safe`);
  if (!verification || Object.values(verification).some(value => value !== true)) throw new Error(`Post-apply verification failed for ${next.name}.`);
  const recordPath = path.join(phaseDirectory, `applied-${next.version}.json`);
  fs.writeFileSync(recordPath, `${JSON.stringify({ appliedAt: new Date().toISOString(), environment: "development", projectRef: project.ref, migration: next, beforeHistory: current.versions, afterHistory: afterState.versions, pending: afterState.pending, protectedBaselineReconciled: true, verification }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ action, environment: "development", migration: next.name, sha256: next.sha256, historyCount: afterState.versions.length, latest: afterState.versions.at(-1), pending: afterState.pending, protectedBaselineReconciled: true, verification, recordPath }));
} else {
  if (next) throw new Error(`Baseline alignment is incomplete; next authorized migration is ${next.name}.`);
  if (current.pending.join() !== earnings) throw new Error("The earnings migration is not the sole pending migration.");
  if (!manifestPath.startsWith(`${phaseDirectory}${path.sep}`) || !fs.existsSync(manifestPath)) throw new Error("Protected baseline-alignment backup manifest required for final verification.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const entry of manifest.files || []) if (!path.resolve(entry.path).startsWith(`${path.dirname(manifestPath)}${path.sep}`) || !fs.existsSync(entry.path) || sha256(fs.readFileSync(entry.path)) !== entry.sha256 || (fs.statSync(entry.path).mode & 0o077) !== 0) throw new Error("Final backup path, checksum, or permission verification failed.");
  const protectedBefore = JSON.parse(fs.readFileSync(manifest.files.find(entry => entry.name === "protected-baseline.json").path, "utf8")).baseline;
  const [protectedAfter] = await query(baselineSql);
  if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) throw new Error("Final protected Development baseline reconciliation failed.");
  const [final] = await query(`begin read only; select
    (select count(*)::integer from supabase_migrations.schema_migrations where version='20260918100000') reliability_history_rows,
    (select count(*)::integer from supabase_migrations.schema_migrations where version='20260920170000') cancellation_history_rows,
    (select count(*)::integer from supabase_migrations.schema_migrations where version='20260921100000') push_language_history_rows,
    (select schedule='15 seconds' and command='select private.expire_pending_orders(100)' from cron.job where jobname='hungrie-expire-pending-orders') expiry_schedule,
    (select schedule='*/5 * * * *' and command='select private.detect_repeated_order_non_response_v1()' from cron.job where jobname='hungrie-detect-restaurant-non-response') detector_schedule,
    (select pg_get_userbyid(proowner)='hungrie_api_owner' and pg_get_functiondef(oid) like '%SET search_path TO %' and not has_function_privilege('authenticated',oid,'execute') from pg_proc where oid='private.detect_repeated_order_non_response_v1(timestamptz)'::regprocedure) detector_security,
    (select relrowsecurity and pg_get_userbyid(relowner)='hungrie_api_owner' from pg_class where oid='private.restaurant_customer_cancellation_messages'::regclass) cancellation_table_security,
    has_function_privilege('authenticated','public.restaurant_cancel_order_v2(text,timestamptz,text,text,uuid)','execute') cancellation_rpc_reachable,
    has_function_privilege('authenticated','public.get_my_customer_order_v2(text)','execute') customer_order_rpc_reachable,
    not has_table_privilege('authenticated','private.restaurant_customer_cancellation_messages','select') cancellation_table_private,
    (select count(*)=0 from private.restaurant_customer_cancellation_messages) cancellation_table_empty,
    (select pg_get_userbyid(proowner)='hungrie_api_owner' and pg_get_functiondef(oid) like '%SET search_path TO %' from pg_proc where oid='public.register_my_customer_push_token_v2(text,public.notification_platform,text)'::regprocedure) push_rpc_security,
    has_function_privilege('authenticated','public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute') push_rpc_reachable,
    not has_function_privilege('anon','public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute') push_rpc_anonymous_denied,
    not has_table_privilege('authenticated','private.push_tokens','select') push_tokens_private,
    (select pg_get_userbyid(proowner)='postgres' and pg_get_functiondef(oid) like '%SET search_path TO %' from pg_proc where oid='public.claim_notification_deliveries(integer)'::regprocedure) claim_contract_preserved,
    has_function_privilege('service_role','public.claim_notification_deliveries(integer)','execute') claim_service_role_reachable,
    not has_function_privilege('authenticated','public.claim_notification_deliveries(integer)','execute') claim_authenticated_denied,
    to_regclass('private.restaurant_earnings_capabilities') is not null earnings_capability_table_exists,
    (select count(*)::integer from public.restaurants where id like 'earnp4\\_%' escape '\\') earnp4_restaurants,
    (select count(*)::integer from public.profiles where id like 'earnp4\\_%' escape '\\') earnp4_profiles,
    (select count(*)::integer from public.orders where id like 'earnp4\\_%' escape '\\' or profile_id like 'earnp4\\_%' escape '\\' or restaurant_id like 'earnp4\\_%' escape '\\') earnp4_orders;
    rollback;`);
  const numericOnes = [final.reliability_history_rows, final.cancellation_history_rows, final.push_language_history_rows].every(value => Number(value) === 1);
  const securityPassed = Object.entries(final).filter(([key]) => !key.endsWith("_rows") && !key.startsWith("earnp4_") && key !== "earnings_capability_table_exists").every(([, value]) => value === true);
  if (!numericOnes || !securityPassed || final.earnings_capability_table_exists || Number(final.earnp4_restaurants) || Number(final.earnp4_profiles) || Number(final.earnp4_orders)) throw new Error("Final baseline-alignment isolation verification failed.");
  const record = { verifiedAt: new Date().toISOString(), environment: "development", projectRef: project.ref, authorizedMigrations: authorized, preHistory: manifest.files ? JSON.parse(fs.readFileSync(manifest.files.find(entry => entry.name === "protected-baseline.json").path, "utf8")).history : [], postHistory: current.versions, pending: current.pending, backupManifest: manifestPath, protectedBaselineReconciled: true, earningsMigrationApplied: false, phase4Resumed: false, final };
  const recordPath = path.join(phaseDirectory, "final-verification.json");
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ action, environment: "development", projectRef: project.ref, historyCount: current.versions.length, latest: current.versions.at(-1), pending: current.pending, protectedBaselineReconciled: true, earningsMigrationApplied: false, phase4Resumed: false, final, recordPath }));
}
