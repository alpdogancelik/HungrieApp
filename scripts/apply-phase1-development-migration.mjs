import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const version = "20260912120000";
const file = `${version}_client_release_policy_foundation.sql`;
const migration = path.join(root, "supabase", "migrations", file);
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = process.argv.includes("--apply");
if (arg("--target") !== "development") throw new Error("This command targets the recorded development project only.");
if (apply && arg("--confirm") !== "development:phase1-client-release-policy") {
  throw new Error("Hosted application requires --confirm=development:phase1-client-release-policy.");
}
const sha = crypto.createHash("sha256").update(fs.readFileSync(migration)).digest("hex");
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
if (history.length !== 24 || pending.length !== 1 || pending[0] !== file) {
  throw new Error(`Expected 24 applied migrations and only ${file} pending; refusing.`);
}
const [before] = await query("select (select count(*) from public.profiles)::integer profiles,(select count(*) from public.orders)::integer orders,(select count(*) from public.restaurants)::integer restaurants,(select count(*) from auth.users)::integer auth_users,(select count(*) from storage.objects)::integer storage_objects,to_regclass('private.client_release_policy') is null as policy_absent");
if (!before?.policy_absent) throw new Error("Release-policy table already exists outside recorded migration history.");

const run = (extra) => spawnSync("supabase", ["db", "push", "--project-ref", project.ref,
  "--password", project.databasePassword, "--skip-vault", ...extra], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token }
});
const dry = run(["--dry-run"]);
if (dry.status !== 0 || !`${dry.stdout}\n${dry.stderr}`.includes(file)) {
  throw new Error("Development CLI dry-run failed or did not list exactly the reviewed migration.");
}
if (!apply) {
  console.log(JSON.stringify({ target: "development", ref: project.ref, mode: "dry-run", migration: file,
    sha256: sha, appliedMigrations: 24, pendingMigrations: 1, preservedCounts: before }));
  process.exit(0);
}
const result = run(["--yes"]);
if (result.status !== 0) throw new Error("Development migration failed; stop and inspect before probing.");
const [after] = await query("select (select count(*) from supabase_migrations.schema_migrations)::integer migrations,(select count(*) from public.profiles)::integer profiles,(select count(*) from public.orders)::integer orders,(select count(*) from public.restaurants)::integer restaurants,(select count(*) from private.client_release_policy)::integer policy_rows");
if (Number(after?.migrations) !== 25 || Number(after?.policy_rows) !== 0 ||
    Number(after?.profiles) !== Number(before.profiles) || Number(after?.orders) !== Number(before.orders) ||
    Number(after?.restaurants) !== Number(before.restaurants)) {
  throw new Error("Post-migration history, policy state, or preserved development counts are unexpected.");
}
console.log(JSON.stringify({ target: "development", ref: project.ref, mode: "applied", migration: file,
  sha256: sha, migrationCount: 25, releasePolicyRows: 0,
  preservedCounts: { profiles: after.profiles, orders: after.orders, restaurants: after.restaurants } }));
