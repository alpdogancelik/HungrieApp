import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const CLI_HOME = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie");
const TOKEN_PATH = path.join(CLI_HOME, "access-token");
const REQUIRED_MIGRATIONS = new Set(["20260902170000", "20260903143000", "20260903160000"]);
const EXPECTED_TABLES = new Set([
  "public.profiles",
  "public.restaurants",
  "public.categories",
  "public.menu_items",
  "public.addresses",
  "public.favorites",
  "public.orders",
  "public.order_items",
  "public.product_reviews",
  "public.order_reviews",
  "private.user_roles",
  "private.restaurant_members",
  "private.order_status_history",
  "private.push_tokens",
  "private.audit_log",
  "migration.import_runs",
  "migration.firestore_documents",
  "migration.import_rejections",
]);
const REQUIRED_INDEXES = new Set([
  "public.categories_restaurant_active_sort_idx",
  "public.menu_items_restaurant_category_active_sort_idx",
  "public.orders_profile_created_idx",
  "public.orders_restaurant_status_created_idx",
  "public.orders_courier_status_created_idx",
  "public.orders_reminder_requested_by_idx",
  "public.product_reviews_menu_status_created_idx",
  "public.product_reviews_restaurant_status_created_idx",
  "public.order_reviews_restaurant_status_created_idx",
  "private.restaurant_members_profile_idx",
  "private.order_status_history_order_created_idx",
  "private.order_status_history_changed_by_idx",
  "private.push_tokens_profile_idx",
  "private.push_tokens_restaurant_idx",
]);

if (!fs.existsSync(STATE_PATH) || !fs.existsSync(TOKEN_PATH)) {
  throw new Error("Missing ignored Supabase project state or access token.");
}
const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const project = state.projects?.development;
const accessToken = fs.readFileSync(TOKEN_PATH, "utf8").trim();
if (!project?.ref || !project?.databasePassword) {
  throw new Error("No complete development project configuration is recorded.");
}

const environment = {
  ...process.env,
  SUPABASE_HOME: CLI_HOME,
  SUPABASE_ACCESS_TOKEN: accessToken,
};
const runJson = (args) => {
  const result = spawnSync("supabase", [...args, "--output-format", "json"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: environment,
  });
  if (result.status !== 0) throw new Error("Hosted schema verification command failed.");
  const output = String(result.stdout || "").trim();
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) throw new Error("Hosted schema verification returned no JSON.");
  return JSON.parse(output.slice(jsonStart));
};

runJson(["link", "--project-ref", project.ref, "--password", project.databasePassword]);
const migrations = runJson([
  "migration",
  "list",
  "--linked",
  "--password",
  project.databasePassword,
]).migrations ?? [];
const tableRows = runJson(["inspect", "db", "table-stats", "--linked"]).rows ?? [];
const indexRows = runJson(["inspect", "db", "index-stats", "--linked"]).rows ?? [];

const remoteMigrations = new Set(migrations.map((entry) => String(entry.remote || "")));
const tableNames = new Set(tableRows.map((entry) => entry.name));
const indexNames = new Set(indexRows.map((entry) => entry.name));
const localRemoteParity = migrations.every(
  (entry) => Boolean(entry.local) && entry.local === entry.remote,
);
// Later milestones may add protected tables. Keep this historical verifier useful
// by requiring the complete Milestone 2 foundation instead of an exact final count.
const requiredTablesPresent = [...EXPECTED_TABLES].every((name) => tableNames.has(name));
const emptyTables = tableRows.every((entry) => Number(entry.estimated_row_count) === 0);
const requiredIndexes = [...REQUIRED_INDEXES].every((name) => indexNames.has(name));
const requiredMigrations = [...REQUIRED_MIGRATIONS].every((version) => remoteMigrations.has(version));

const report = {
  migrationCount: migrations.length,
  localRemoteMigrationParity: localRemoteParity,
  requiredMigrationsPresent: requiredMigrations,
  applicationTableCount: tableRows.length,
  requiredMilestone2TablesPresent: requiredTablesPresent,
  hostedApplicationTablesEmpty: emptyTables,
  indexCount: indexRows.length,
  requiredQueryIndexesPresent: requiredIndexes,
};

if (!Object.values(report).every((value) => value === true || (typeof value === "number" && value > 0))) {
  throw new Error("Hosted Milestone 2 schema verification failed.");
}
console.log(JSON.stringify(report, null, 2));
