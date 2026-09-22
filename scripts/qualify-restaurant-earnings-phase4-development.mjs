#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PHASE4_ACTIONS,
  PHASE4_FIREBASE_PROJECT,
  PHASE4_MIGRATION,
  PHASE4_MIGRATION_SHA256,
  inspectMigrationHistory,
  sanitizePreflightEvidence,
  sha256,
  validateEnvironment,
  validateManifest,
  validateRunId,
} from "./restaurant-earnings-phase4-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const action = process.argv[2] || "";
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const environment = option("--environment");
const runId = validateRunId(option("--run-id"));
const expectedConfirmation = `development:restaurant-earnings-phase4:${action}:${runId}`;

if (!PHASE4_ACTIONS.has(action)) throw new Error("Use backup|preflight|apply|verify-cleanup.");
if (environment !== "development") throw new Error("An explicit --environment=development is required; there is no default.");
if (option("--expect-sha256") !== PHASE4_MIGRATION_SHA256) throw new Error("The accepted migration SHA-256 is required.");
if (option("--confirm") !== expectedConfirmation) throw new Error(`Action confirmation mismatch; expected ${expectedConfirmation}.`);

const migrationPath = path.join(root, "supabase", "migrations", PHASE4_MIGRATION);
if (sha256(fs.readFileSync(migrationPath)) !== PHASE4_MIGRATION_SHA256) throw new Error("The accepted migration changed.");

const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const operator = JSON.parse(fs.readFileSync(path.join(secure, "phase7", "operator-config.json"), "utf8"));
const credentialPath = path.resolve(operator.firebaseAdminCredentialPath || "");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath) || credentialPath.startsWith(`${root}${path.sep}`)) {
  throw new Error("An approved external Firebase Admin credential is required.");
}
const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
const project = state.projects?.development;
const tokenPath = path.join(secure, "supabase-cli-hungrie", "access-token");
const managementToken = fs.readFileSync(tokenPath, "utf8").trim();
if (!managementToken) throw new Error("The approved external Supabase credential is unavailable.");

const phaseRoot = path.join(secure, "restaurant-earnings-admin-commission-phase4");
const runDirectory = path.join(phaseRoot, runId);
fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(phaseRoot, 0o700);
fs.chmodSync(runDirectory, 0o700);

const query = async sql => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Development SQL request failed (${response.status}); response withheld.`);
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error("Development SQL response was malformed.");
  return value;
};

const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, { headers: { authorization: `Bearer ${managementToken}` } });
if (!metadataResponse.ok) throw new Error(`Development metadata request failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
validateEnvironment({
  development: project,
  staging: state.projects?.staging,
  production: state.projects?.production,
  metadata,
  firebaseProjectId: operator.firebaseProjectId,
  credentialProjectId: credential.project_id,
});

const localMigrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
const remoteHistory = (await query("begin transaction read only; select version from supabase_migrations.schema_migrations order by version; rollback;")).map(row => String(row.version));
const history = inspectMigrationHistory(localMigrations, remoteHistory);
const evidence = sanitizePreflightEvidence({ history, metadata, firebaseProjectId: PHASE4_FIREBASE_PROJECT, runId, migrationSha256: PHASE4_MIGRATION_SHA256 });
const preflightPath = path.join(runDirectory, "preflight.json");
fs.writeFileSync(preflightPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

if (!history.passed) {
  throw new Error(`Hosted-mutation gate failed: expected ${history.expectedCount} migrations through ${history.expectedLatest}; found ${history.actualCount} through ${history.actualLatest}; pending set is ${history.pending.join(", ")}. No hosted mutation performed.`);
}

const stale = await query(`begin transaction read only;
  select
    (select count(*)::integer from public.restaurants where id like 'earnp4\\_%' escape '\\') restaurants,
    (select count(*)::integer from public.profiles where id like 'earnp4\\_%' escape '\\') profiles,
    (select count(*)::integer from public.orders where id like 'earnp4\\_%' escape '\\' or profile_id like 'earnp4\\_%' escape '\\' or restaurant_id like 'earnp4\\_%' escape '\\') orders;
  rollback;`);
if (Object.values(stale[0] || {}).some(Number)) throw new Error("Stale earnp4_ database fixtures exist; no hosted mutation performed.");

const manifestPath = option("--manifest") ? path.resolve(option("--manifest")) : path.join(runDirectory, "backup-manifest.json");

if (action === "preflight") {
  console.log(JSON.stringify({ action, environment, runId, passed: true, migration: PHASE4_MIGRATION, migrationSha256: PHASE4_MIGRATION_SHA256, history }));
} else if (action === "backup") {
  if (fs.existsSync(manifestPath)) throw new Error("The run backup manifest already exists.");
  const schemaPath = path.join(runDirectory, "schema.sql");
  const restaurantsPath = path.join(runDirectory, "restaurants.json");
  const baselinePath = path.join(runDirectory, "baseline.json");
  const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: managementToken };
  const dumped = spawnSync("supabase", ["db", "dump", "--project-ref", project.ref, "--password", project.databasePassword, "--schema", "public,private,migration,cron", "--file", schemaPath], { cwd: root, env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (dumped.status !== 0 || !fs.existsSync(schemaPath)) throw new Error("Minimized Development schema backup failed; output withheld.");
  const restaurants = await query("begin transaction read only; select to_jsonb(r) row from public.restaurants r order by id; rollback;");
  const [baseline] = await query(`begin transaction read only; select
    (select count(*)::integer from public.profiles) profiles,
    (select count(*)::integer from public.restaurants) restaurants,
    (select count(*)::integer from public.orders) orders,
    (select count(*)::integer from public.order_items) order_items,
    (select count(*)::integer from private.account_access) account_access,
    (select count(*)::integer from private.audit_log) audit_events,
    encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,lifecycle_status,accepting_orders) order by id)::text from public.restaurants),'[]'),'sha256'),'hex') restaurant_digest,
    encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,status,restaurant_id,profile_id) order by id)::text from public.orders),'[]'),'sha256'),'hex') order_digest;
    rollback;`);
  fs.writeFileSync(restaurantsPath, `${JSON.stringify(restaurants.map(value => value.row), null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.chmodSync(schemaPath, 0o600);
  const files = [schemaPath, restaurantsPath, baselinePath].map(file => ({ path: file, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), mode: (fs.statSync(file).mode & 0o777).toString(8) }));
  const manifest = { createdAt: new Date().toISOString(), environment, projectRef: project.ref, runId, includedScope: ["schema-only:public,private,migration,cron", "data-only:public.restaurants", "non-PII:protected-counts-and-digests"], sensitivity: "sensitive-restricted-local", retention: "Phase 4 acceptance plus seven calendar days", files };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ action, environment, runId, manifestPath, files: files.map(({ path: file, ...rest }) => ({ name: path.basename(file), ...rest })) }));
} else if (action === "apply") {
  if (!fs.existsSync(manifestPath)) throw new Error("The fresh protected backup manifest is required.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validateManifest(manifest, { projectRef: project.ref, runId });
  for (const entry of manifest.files) {
    if (!path.resolve(entry.path).startsWith(`${runDirectory}${path.sep}`) || !fs.existsSync(entry.path) || sha256(fs.readFileSync(entry.path)) !== entry.sha256 || (fs.statSync(entry.path).mode & 0o077) !== 0) {
      throw new Error("Backup checksum, path, or permission verification failed.");
    }
  }
  const cliEnv = { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: managementToken };
  const pushed = spawnSync("supabase", ["db", "push", "--project-ref", project.ref, "--password", project.databasePassword, "--skip-vault", "--yes"], { cwd: root, env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (pushed.status !== 0) throw new Error("Checksum-pinned Development migration application failed; output withheld.");
  const [capability] = await query("select enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1'");
  if (capability?.enabled !== false) throw new Error("Post-apply capability-disabled gate failed.");
  console.log(JSON.stringify({ action, environment, runId, migration: PHASE4_MIGRATION, migrationSha256: PHASE4_MIGRATION_SHA256, capabilityEnabled: false }));
} else if (action === "verify-cleanup") {
  if (!fs.existsSync(manifestPath)) throw new Error("The current-run manifest is required for cleanup verification.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validateManifest(manifest, { projectRef: project.ref, runId, requireFiles: false });
  const [result] = await query(`begin transaction read only; select
    (select count(*)::integer from public.restaurants where id like 'earnp4\\_%' escape '\\') restaurants,
    (select count(*)::integer from public.profiles where id like 'earnp4\\_%' escape '\\') profiles,
    (select count(*)::integer from public.orders where id like 'earnp4\\_%' escape '\\' or profile_id like 'earnp4\\_%' escape '\\' or restaurant_id like 'earnp4\\_%' escape '\\') orders,
    (select enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_enabled,
    (select count(*)::integer from pg_trigger where tgname in ('restaurant_commission_rules_immutable','order_commission_terms_immutable','delivered_financial_snapshots_immutable') and tgenabled='O') immutable_triggers_enabled;
    rollback;`);
  if (Number(result.restaurants) || Number(result.profiles) || Number(result.orders) || result.capability_enabled !== false || Number(result.immutable_triggers_enabled) !== 3) throw new Error("Cleanup exit gate failed.");
  console.log(JSON.stringify({ action, environment, runId, passed: true, capabilityEnabled: false, immutableTriggersEnabled: 3 }));
}
