#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const secure = path.join(root, "secure");
const action = process.argv[2] || "";
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = option("--run-id");
const environment = option("--environment");
const migration = "20260922100000_restaurant_earnings_admin_commission.sql";
const migrationSha256 = "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94";
const expectedSupabase = "rlrfvqskzvpysewdxqcr";
const rejectedDevelopment = "rgjlsjwsitbnwoetmidb";
const expectedFirebase = "hungrieapp-a2288";
const expectedVercelProject = "prj_aCnq7HJXVEdrh0l40DDSCavVVPlz";
const expectedEasProject = "a2d5538b-bd0c-4205-8153-ba08a3a9b2b1";
const adminAlias = "hungrie-admin-web-phase1.vercel.app";
const restaurantAlias = "https://hungrie-restaurant--staging.expo.app";
const knownRestaurantRollback = "https://hungrie-restaurant--dkxapku412.expo.app";
const knownRestaurantQualified = "https://hungrie-restaurant--6jki82fy0u.expo.app";
const actions = new Set(["preflight", "backup", "apply", "inspect", "types"]);
if (!actions.has(action)) throw new Error("Use preflight|backup|apply|inspect|types.");
if (!/^earnp5_[a-z0-9]{8,32}$/.test(runId || "")) throw new Error("Canonical earnp5_ run ID required.");
if (environment !== "staging") throw new Error("Explicit --environment=staging required; there is no default.");
if (option("--confirm") !== `staging:restaurant-earnings-phase5:${action}:${runId}`) throw new Error("Action-specific Staging confirmation mismatch.");
if (option("--expect-sha256") !== migrationSha256) throw new Error("Accepted migration SHA-256 required.");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const migrationPath = path.join(root, "supabase", "migrations", migration);
if (sha256(fs.readFileSync(migrationPath)) !== migrationSha256) throw new Error("Accepted migration checksum mismatch.");
const registry = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = registry.projects?.staging;
if (project?.name !== "HungrieApp Staging" || project.ref !== expectedSupabase || project.ref === rejectedDevelopment || project.ref === registry.projects?.development?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Staging Supabase target required.");
const operator = JSON.parse(fs.readFileSync(path.join(secure, "phase7", "operator-config.json"), "utf8"));
const credentialPath = path.resolve(operator.firebaseAdminCredentialPath || "");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath) || credentialPath.startsWith(`${root}${path.sep}`)) throw new Error("External Firebase Admin credential required.");
const firebaseCredential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (operator.firebaseProjectId !== expectedFirebase || firebaseCredential.project_id !== expectedFirebase) throw new Error("Approved shared non-production Firebase target required.");
const vercelProject = JSON.parse(fs.readFileSync(path.join(root, "apps", "admin-web", ".vercel", "project.json"), "utf8"));
if (vercelProject.projectId !== expectedVercelProject) throw new Error("Exact Admin Vercel project required.");
const restaurantApp = JSON.parse(fs.readFileSync(path.join(root, "apps", "restaurant", "app.json"), "utf8"));
if (restaurantApp.expo?.extra?.eas?.projectId !== expectedEasProject) throw new Error("Exact Restaurant EAS project required.");
console.log(JSON.stringify({ phase5Environment: "staging", supabaseProjectRef: project.ref, firebaseProjectId: expectedFirebase, vercelProjectId: vercelProject.projectId, easProjectId: restaurantApp.expo.extra.eas.projectId, rejectedProjectRefs: [rejectedDevelopment, registry.projects?.production?.ref].filter(Boolean) }));

const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const query = async statement => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query: statement }) });
  if (!response.ok) throw new Error(`Staging SQL failed (${response.status}); response withheld.`);
  const value = await response.json(); if (!Array.isArray(value)) throw new Error("Staging SQL response malformed."); return value;
};
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, { headers: { authorization: `Bearer ${managementToken}` } });
if (!metadataResponse.ok) throw new Error(`Staging metadata failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
if (metadata.id !== expectedSupabase || metadata.status !== "ACTIVE_HEALTHY") throw new Error("Staging metadata identity/health failed.");

const migrationNames = fs.readdirSync(path.join(root, "supabase", "migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
const targetIndex = migrationNames.indexOf(migration);
const expectedHistory = migrationNames.slice(0, targetIndex).map(name => name.slice(0, 14));
const remoteHistory = (await query("begin transaction read only;select version from supabase_migrations.schema_migrations order by version;rollback;")).map(row => String(row.version));
const applied = new Set(remoteHistory), pending = migrationNames.filter(name => !applied.has(name.slice(0, 14)));
const preMigrationAction = action === "preflight" || action === "backup" || action === "apply";
const expectedActionHistory = preMigrationAction ? expectedHistory : [...expectedHistory, migration.slice(0, 14)];
const expectedActionPending = preMigrationAction ? [migration] : [];
const historyPassed = expectedActionHistory.length === remoteHistory.length && expectedActionHistory.every((version, index) => version === remoteHistory[index]) && pending.length === expectedActionPending.length && pending.every((name, index) => name === expectedActionPending[index]);
const [databaseState] = await query(`begin transaction read only;select
  to_regclass('private.restaurant_earnings_capabilities') is not null capability_objects_present,
  (select count(*)::integer from public.restaurants where id like 'earnp5\\_%' escape '\\') restaurants,
  (select count(*)::integer from public.profiles where id like 'earnp5\\_%' escape '\\') profiles,
  (select count(*)::integer from public.orders where id like 'earnp5\\_%' escape '\\' or profile_id like 'earnp5\\_%' escape '\\' or restaurant_id like 'earnp5\\_%' escape '\\') orders;rollback;`);

const require = createRequire(import.meta.url), admin = require("firebase-admin");
const firebaseApp = admin.initializeApp({ credential: admin.credential.cert(firebaseCredential), projectId: expectedFirebase }, `phase5-preflight-${Date.now()}`);
let staleFirebase = 0;
try { let token; do { const page = await firebaseApp.auth().listUsers(1000, token); staleFirebase += page.users.filter(user => user.email?.startsWith("earnp5_") || user.displayName?.startsWith("earnp5_")).length; token = page.pageToken; } while (token); } finally { await firebaseApp.delete(); }

const inspectVercel = spawnSync("npx", ["--yes", "vercel", "inspect", adminAlias, "--json"], { cwd: path.join(root, "apps", "admin-web"), encoding: "utf8" });
if (inspectVercel.status !== 0) throw new Error("Admin alias inspection failed; output withheld.");
const adminDeployment = JSON.parse(inspectVercel.stdout.slice(inspectVercel.stdout.indexOf("{")));
if (adminDeployment.name !== "hungrie-admin-web-phase1" || adminDeployment.readyState !== "READY") throw new Error("Admin rollback target is not ready.");
const [restaurantAliasResponse, restaurantRollbackResponse, restaurantQualifiedResponse] = await Promise.all([fetch(restaurantAlias), fetch(knownRestaurantRollback), fetch(knownRestaurantQualified)]);
if (!restaurantAliasResponse.ok || !restaurantRollbackResponse.ok || !restaurantQualifiedResponse.ok) throw new Error("Restaurant deployment target inspection failed.");
const [restaurantAliasBody, restaurantRollbackBody, restaurantQualifiedBody] = await Promise.all([restaurantAliasResponse.arrayBuffer(), restaurantRollbackResponse.arrayBuffer(), restaurantQualifiedResponse.arrayBuffer()]);
const restaurantAliasSha = sha256(Buffer.from(restaurantAliasBody)), restaurantRollbackSha = sha256(Buffer.from(restaurantRollbackBody)), restaurantQualifiedSha = sha256(Buffer.from(restaurantQualifiedBody));
if (preMigrationAction ? restaurantAliasSha !== restaurantRollbackSha : ![restaurantRollbackSha, restaurantQualifiedSha].includes(restaurantAliasSha)) throw new Error("Restaurant Staging alias does not match a reviewed deployment target.");

const ignored = new Set([".next", ".vercel", ".expo", "dist", "node_modules"]);
const collect = relative => {
  const absolute = path.join(root, relative), output = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith(".env")) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...collect(child)); else output.push(child);
  }
  return output;
};
const sourceFiles = [...collect("apps/admin-web"), ...collect("apps/restaurant"), ...collect("packages/domain/src"), ...collect("packages/database-types/src"), "package.json", "package-lock.json"].sort();
const sourceHash = crypto.createHash("sha256");
for (const file of sourceFiles) sourceHash.update(file).update("\0").update(fs.readFileSync(path.join(root, file))).update("\0");
const sourceSha256 = sourceHash.digest("hex");

const runDirectory = path.join(secure, "restaurant-earnings-admin-commission-phase5", runId);
fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 }); fs.chmodSync(runDirectory, 0o700);
const writeJson = (name, value) => { const file = path.join(runDirectory, name); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.chmodSync(file, 0o600); return file; };
const preflight = { capturedAt: new Date().toISOString(), environment: "staging", runId, supabaseProjectRef: project.ref, supabaseStatus: metadata.status, firebaseProjectId: expectedFirebase, vercelProjectId: expectedVercelProject, easProjectId: expectedEasProject, migration, migrationSha256, history: { passed: historyPassed, expectedCount: expectedActionHistory.length, actualCount: remoteHistory.length, expectedLatest: expectedActionHistory.at(-1), actualLatest: remoteHistory.at(-1), pending }, databaseState, staleFirebase, rollbackTargets: { admin: { id: adminDeployment.id, url: adminDeployment.url, aliases: adminDeployment.aliases }, restaurant: { url: knownRestaurantRollback, htmlSha256: restaurantRollbackSha } }, source: { sha256: sourceSha256, fileCount: sourceFiles.length }, secretsRecorded: false };
writeJson("preflight.json", preflight);
const capabilityStatePassed = preMigrationAction ? !databaseState.capability_objects_present : databaseState.capability_objects_present;
if (!historyPassed || !capabilityStatePassed || Number(databaseState.restaurants) || Number(databaseState.profiles) || Number(databaseState.orders) || staleFirebase) throw new Error("Phase 5 hosted-mutation preflight failed; no hosted write performed.");

const backupManifestPath = path.join(runDirectory, "backup-manifest.json");
const validateBackup = () => {
  if (!fs.existsSync(backupManifestPath)) throw new Error("Fresh protected Staging backup manifest required.");
  const manifest = JSON.parse(fs.readFileSync(backupManifestPath, "utf8"));
  if (manifest.environment !== "staging" || manifest.projectRef !== project.ref || manifest.runId !== runId || Date.now() - Date.parse(manifest.createdAt) >= 86_400_000 || Date.now() < Date.parse(manifest.createdAt)) throw new Error("Backup manifest identity/freshness failed.");
  for (const entry of manifest.files) if (!path.resolve(entry.path).startsWith(`${runDirectory}${path.sep}`) || !fs.existsSync(entry.path) || sha256(fs.readFileSync(entry.path)) !== entry.sha256 || (fs.statSync(entry.path).mode & 0o077)) throw new Error("Backup path/checksum/permission failed.");
  return manifest;
};

if (action === "preflight") console.log(JSON.stringify({ action, environment, runId, passed: true, history: preflight.history, rollbackTargets: preflight.rollbackTargets, source: preflight.source }));
if (action === "backup") {
  if (fs.existsSync(backupManifestPath)) throw new Error("Backup manifest already exists for this run.");
  const schemaPath = path.join(runDirectory, "schema.sql"), restaurantsPath = path.join(runDirectory, "restaurants.json"), baselinePath = path.join(runDirectory, "baseline.json");
  const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: managementToken };
  const dump = spawnSync("supabase", ["db", "dump", "--project-ref", project.ref, "--password", project.databasePassword, "--schema", "public,private,migration,cron", "--file", schemaPath], { cwd: root, env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (dump.status !== 0 || !fs.existsSync(schemaPath)) throw new Error("Scoped Staging schema backup failed; output withheld."); fs.chmodSync(schemaPath, 0o600);
  const restaurants = await query("begin transaction read only;select to_jsonb(r) row from public.restaurants r order by id;rollback;");
  const [baseline] = await query(`begin transaction read only;select
    (select count(*)::integer from public.profiles) profiles,(select count(*)::integer from public.restaurants) restaurants,(select count(*)::integer from public.orders) orders,(select count(*)::integer from public.order_items) order_items,(select count(*)::integer from private.account_access) account_access,(select count(*)::integer from private.audit_log) audit_events,
    encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,lifecycle_status,accepting_orders) order by id)::text from public.restaurants),'[]'),'sha256'),'hex') restaurant_digest,
    encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,status,restaurant_id,profile_id) order by id)::text from public.orders),'[]'),'sha256'),'hex') order_digest;rollback;`);
  fs.writeFileSync(restaurantsPath, `${JSON.stringify(restaurants.map(row => row.row), null, 2)}\n`, { mode: 0o600, flag: "wx" }); fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const files = [schemaPath, restaurantsPath, baselinePath].map(file => ({ path: file, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), mode: (fs.statSync(file).mode & 0o777).toString(8) }));
  writeJson("backup-manifest.json", { createdAt: new Date().toISOString(), environment: "staging", projectRef: project.ref, runId, includedScope: ["schema-only:public,private,migration,cron", "data-only:public.restaurants", "non-PII:protected-counts-and-digests"], sensitivity: "sensitive-restricted-local", retention: "Phase 5 acceptance plus seven calendar days", files });
  console.log(JSON.stringify({ action, environment, runId, manifestPath: backupManifestPath, files: files.map(({ path: file, ...rest }) => ({ name: path.basename(file), ...rest })) }));
}
if (action === "apply") {
  validateBackup();
  const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: managementToken };
  const push = spawnSync("supabase", ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", "--yes"], { cwd: root, env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (push.status !== 0) throw new Error("Checksum-pinned Staging migration application failed; output withheld.");
  const [state] = await query(`select (select count(*)=1 from supabase_migrations.schema_migrations where version='20260922100000') migration_recorded_once,(select enabled=false from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_disabled`);
  if (!state.migration_recorded_once || !state.capability_disabled) throw new Error("Post-apply Staging gate failed.");
  console.log(JSON.stringify({ action, environment, runId, migration, migrationSha256, capabilityEnabled: false }));
}
if (action === "inspect") {
  const [configuration] = await query(`select
    (select count(*)=1 from supabase_migrations.schema_migrations where version='20260922100000') migration_recorded_once,
    (select enabled=false from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_disabled,
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('restaurant_earnings_capabilities','restaurant_commission_rules','order_commission_terms','delivered_order_financial_snapshots','restaurant_financial_integrity_alerts') and c.relrowsecurity and c.relforcerowsecurity) forced_rls_tables,
    (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('admin_get_restaurant_commission_v1','admin_schedule_restaurant_commission_v1','admin_get_restaurant_earnings_summary_v1','restaurant_get_earnings_summary_v1','restaurant_get_earnings_series_v1','restaurant_get_earnings_orders_page_v1') and p.proowner=(select oid from pg_roles where rolname='hungrie_api_owner') and p.proconfig @> array['search_path=""']) guarded_rpcs,
    (select count(*)::integer from pg_indexes where indexname in('restaurant_financial_alert_open_fingerprint_idx','restaurant_financial_alert_restaurant_open_idx','restaurant_commission_rules_lookup_idx','order_commission_terms_restaurant_rule_idx','delivered_financial_snapshots_restaurant_cursor_idx','delivered_financial_snapshots_restaurant_payment_period_idx','orders_restaurant_created_cursor_idx')) purpose_indexes,
    (select count(*)::integer from pg_trigger where tgname in('restaurant_commission_rules_immutable','order_commission_terms_immutable','delivered_financial_snapshots_immutable') and tgenabled='O') immutable_triggers,
    (select count(*)::integer from cron.job where jobname='hungrie-restaurant-financial-integrity' and schedule='*/5 * * * *' and command like '%detect_restaurant_financial_integrity_v1%') cron_entries,
    (select count(*)::integer from information_schema.routine_privileges where routine_schema='public' and routine_name in('admin_get_restaurant_commission_v1','admin_schedule_restaurant_commission_v1','admin_get_restaurant_earnings_summary_v1','restaurant_get_earnings_summary_v1','restaurant_get_earnings_series_v1','restaurant_get_earnings_orders_page_v1') and grantee='authenticated' and privilege_type='EXECUTE') authenticated_rpc_grants,
    (select count(*)::integer from information_schema.table_privileges where table_schema='private' and table_name in('restaurant_earnings_capabilities','restaurant_commission_rules','order_commission_terms','delivered_order_financial_snapshots','restaurant_financial_integrity_alerts') and grantee in('public','anon','authenticated','service_role')) direct_private_grants`);
  const [financial] = await query(`select (select count(*) from private.restaurant_commission_rules)::integer rules,(select count(*) from private.order_commission_terms)::integer terms,(select count(*) from private.delivered_order_financial_snapshots)::integer snapshots,(select count(*) from private.restaurant_financial_integrity_alerts)::integer alerts`);
  writeJson("hosted-inspection.json", { capturedAt: new Date().toISOString(), configuration, financial });
  if (!configuration.migration_recorded_once || !configuration.capability_disabled || configuration.forced_rls_tables !== 5 || configuration.guarded_rpcs !== 6 || configuration.purpose_indexes !== 7 || configuration.immutable_triggers !== 3 || configuration.cron_entries !== 1 || configuration.authenticated_rpc_grants !== 6 || configuration.direct_private_grants !== 0) throw new Error("Staging schema/security inspection failed.");
  console.log(JSON.stringify({ action, environment, runId, configuration, financial }));
}
if (action === "types") {
  const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: managementToken };
  const hosted = spawnSync("supabase", ["gen", "types", "typescript", "--project-id", project.ref, "--schema", "public"], { cwd: root, env: cliEnv, encoding: "utf8" });
  if (hosted.status !== 0 || !hosted.stdout.includes("admin_get_restaurant_commission_v1")) throw new Error("Hosted Staging type generation failed; output withheld.");
  const output = path.join(runDirectory, "staging-types.ts"); fs.writeFileSync(output, hosted.stdout, { mode: 0o600 });
  const tracked = fs.readFileSync(path.join(root, "packages", "database-types", "src", "database.generated.ts"));
  console.log(JSON.stringify({ action, environment, runId, hostedSha256: sha256(hosted.stdout), trackedSha256: sha256(tracked), output, trackedChanged: false }));
}
