import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const files = [
  "20260912160000_phase2_account_model_expand.sql",
  "20260912161000_phase2_account_helpers.sql",
  "20260912162000_phase2_account_rpcs.sql"
];
const migrations = files.map((file) => path.join(root, "supabase", "migrations", file));
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = process.argv.includes("--apply");
if (arg("--target") !== "development") throw new Error("This command targets the recorded development project only.");
if (apply && arg("--confirm") !== "development:phase2-account-model") {
  throw new Error("Hosted application requires --confirm=development:phase2-account-model.");
}
const sha = crypto.createHash("sha256").update(Buffer.concat(migrations.map((file) => fs.readFileSync(file)))).digest("hex");
if (arg("--expect-sha256") !== sha) throw new Error("The reviewed migration SHA-256 does not match.");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
if (!project?.ref || !project?.databasePassword || project.name !== "HungrieApp Development") {
  throw new Error("Recorded development project credentials are incomplete.");
}
if (project.ref === state.projects?.staging?.ref || project.ref === state.projects?.production?.ref) {
  throw new Error("Development ref overlaps another environment.");
}
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql })
  });
  if (!response.ok) throw new Error(`Development preflight query failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Development preflight response is malformed.");
  return rows;
};
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, {
  headers: { authorization: `Bearer ${token}` }
});
if (!metadataResponse.ok) throw new Error(`Development metadata check failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
if (metadata.name !== project.name || metadata.region !== "eu-central-1" ||
    metadata.status !== "ACTIVE_HEALTHY" || !String(metadata.database?.version || "").startsWith("17")) {
  throw new Error("Development identity, region, health, or PostgreSQL version is unexpected.");
}
const history = await query("select version from supabase_migrations.schema_migrations order by version");
const applied = new Set(history.map((row) => String(row.version)));
const local = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
const pending = local.filter((name) => !applied.has(name.slice(0, 14)));
if (history.length !== 25 || pending.length !== files.length ||
    pending.some((name, index) => name !== files[index])) {
  throw new Error("Expected 25 applied migrations and only the three reviewed Phase 2 migrations pending; refusing.");
}
const [before] = await query("select (select count(*) from public.profiles)::integer profiles,(select count(*) from public.orders)::integer orders,(select count(*) from public.restaurants)::integer restaurants,(select count(*) from auth.users)::integer auth_users,(select count(*) from storage.objects)::integer storage_objects,to_regclass('private.account_access') is null as account_model_absent");
if (!before?.account_model_absent) throw new Error("Account model already exists outside recorded migration history.");
const backupManifestFile = arg("--backup-manifest");
if (apply) {
  const manifestPath = path.resolve(root, backupManifestFile || "");
  if (!backupManifestFile || !manifestPath.startsWith(secure + path.sep) || !fs.existsSync(manifestPath)) {
    throw new Error("A reviewed development backup manifest under ignored secure/ is required.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.environment !== "development" || manifest.projectRef !== project.ref ||
      !Array.isArray(manifest.files) || manifest.files.length !== 2 ||
      Date.now() - Date.parse(manifest.recordedAt) > 24 * 60 * 60 * 1000) {
    throw new Error("Development backup manifest is stale or belongs to another project.");
  }
  for (const name of ["schema.sql", "data.sql"]) {
    const entry = manifest.files.find((file) => file.name === name);
    const file = path.join(path.dirname(manifestPath), name);
    if (!entry || !fs.existsSync(file) || fs.statSync(file).size < 1024 ||
        crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== entry.sha256) {
      throw new Error("Development backup files differ from their reviewed manifest.");
    }
  }
}

const run = (extra) => spawnSync("supabase", ["db", "push", "--project-ref", project.ref,
  "--password", project.databasePassword, "--skip-vault", ...extra], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token }
});
const dry = run(["--dry-run"]);
if (dry.status !== 0 || files.some((file) => !`${dry.stdout}\n${dry.stderr}`.includes(file))) {
  throw new Error("Development CLI dry-run failed or did not list all reviewed migrations.");
}
if (!apply) {
  console.log(JSON.stringify({ target: "development", ref: project.ref, mode: "dry-run", migrations: files,
    sha256: sha, appliedMigrations: 25, pendingMigrations: 3, preservedCounts: before }));
  process.exit(0);
}
const result = run(["--yes"]);
if (result.status !== 0) throw new Error("Development migration failed; stop and inspect before probing.");
const [after] = await query("select (select count(*) from supabase_migrations.schema_migrations)::integer migrations,(select count(*) from public.profiles)::integer profiles,(select count(*) from public.orders)::integer orders,(select count(*) from public.restaurants)::integer restaurants,(select count(*) from private.account_access)::integer account_rows,(select count(*) from private.account_invitations)::integer invitation_rows,(select count(*) from private.restaurant_operational_incidents)::integer incident_rows,(select count(*) from public.restaurants where (is_active and lifecycle_status<>'active') or (not is_active and (lifecycle_status<>'pending' or accepting_orders)))::integer incompatible_restaurants");
if (Number(after?.migrations) !== 28 || Number(after?.account_rows) !== 0 ||
    Number(after?.invitation_rows) !== 0 || Number(after?.incident_rows) !== 0 ||
    Number(after?.incompatible_restaurants) !== 0 ||
    Number(after?.profiles) !== Number(before.profiles) || Number(after?.orders) !== Number(before.orders) ||
    Number(after?.restaurants) !== Number(before.restaurants)) {
  throw new Error("Post-migration history, empty account state, or preserved development counts are unexpected.");
}
console.log(JSON.stringify({ target: "development", ref: project.ref, mode: "applied", migrations: files,
  sha256: sha, migrationCount: 28, accountRows: 0, invitationRows: 0, incidentRows: 0,
  preservedCounts: { profiles: after.profiles, orders: after.orders, restaurants: after.restaurants } }));
