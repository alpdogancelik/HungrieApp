import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const CLI_HOME = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie");
const TOKEN_PATH = path.join(CLI_HOME, "access-token");
const REQUIRED_MIGRATIONS = new Set([
  "20260902170000", "20260903143000", "20260903160000",
  "20260903190000", "20260903200000", "20260903210000", "20260903220000",
]);
const REQUIRED_TABLES = new Set([
  "public.profiles", "public.restaurants", "public.categories", "public.menu_items",
  "public.addresses", "public.favorites", "public.orders", "public.order_items",
  "public.product_reviews", "public.order_reviews", "private.user_roles",
  "private.restaurant_members", "private.restaurant_couriers",
  "private.order_contacts", "private.order_status_history", "private.push_tokens",
  "private.audit_log", "migration.import_runs", "migration.firestore_documents",
  "migration.import_rejections",
]);
const REQUIRED_INDEXES = new Set([
  "public.categories_restaurant_active_sort_idx",
  "public.menu_items_restaurant_category_active_sort_idx",
  "public.orders_profile_created_idx",
  "public.orders_restaurant_status_created_idx",
  "public.orders_courier_status_created_idx",
  "public.product_reviews_menu_status_created_idx",
  "public.order_reviews_restaurant_status_created_idx",
  "private.restaurant_members_profile_idx",
  "private.restaurant_couriers_profile_idx",
  "private.order_status_history_order_created_idx",
]);
const REQUIRED_SCHEMA_MARKERS = [
  "private.order_contacts",
  "private.restaurant_couriers",
  "public.my_orders",
  "public.restaurant_orders",
  "public.courier_available_orders",
  "public.admin_orders",
  "private.current_profile_id",
  "public.create_order",
  "public.transition_order",
  "public.claim_delivery",
  "CREATE POLICY orders_authenticated_select",
];

if (!fs.existsSync(STATE_PATH) || !fs.existsSync(TOKEN_PATH)) {
  throw new Error("Missing ignored Supabase project state or access token.");
}
const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const project = state.projects?.development;
const accessToken = fs.readFileSync(TOKEN_PATH, "utf8").trim();
if (!project?.ref || !project?.databasePassword || !project?.url || !project?.publishableKey) {
  throw new Error("Development project configuration is incomplete.");
}
const environment = {
  ...process.env,
  SUPABASE_HOME: CLI_HOME,
  SUPABASE_ACCESS_TOKEN: accessToken,
};
const run = (args, stdio = ["ignore", "pipe", "pipe"]) => {
  const result = spawnSync("supabase", args, {
    cwd: ROOT_DIR, encoding: "utf8", stdio, env: environment,
  });
  if (result.status !== 0) throw new Error("Hosted schema verification command failed.");
  return result;
};
const runJson = (args) => {
  const output = String(run([...args, "--output-format", "json"]).stdout || "").trim();
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Hosted verification returned no JSON.");
  return JSON.parse(output.slice(start));
};

run(["link", "--project-ref", project.ref, "--password", project.databasePassword]);
const migrations = runJson([
  "migration", "list", "--linked", "--password", project.databasePassword,
]).migrations ?? [];
const tableRows = runJson(["inspect", "db", "table-stats", "--linked"]).rows ?? [];
const indexRows = runJson(["inspect", "db", "index-stats", "--linked"]).rows ?? [];
const securityAdvisor = runJson(["db", "advisors", "--linked", "--type", "security"]);
const performanceAdvisor = runJson(["db", "advisors", "--linked", "--type", "performance"]);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m3-schema-"));
const dumpPath = path.join(temporaryDirectory, "schema.sql");
let schema = "";
try {
  run([
    "db", "dump", "--linked", "--password", project.databasePassword,
    "--schema", "public,private,migration", "--file", dumpPath,
  ]);
  schema = fs.readFileSync(dumpPath, "utf8")
    .replaceAll('"', "")
    .replaceAll(" FUNCTION ", " FUNCTION ")
    .replace(/\s+/g, " ");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

const remoteMigrations = new Set(migrations.map((entry) => String(entry.remote || "")));
const tableNames = new Set(tableRows.map((entry) => entry.name));
const indexNames = new Set(indexRows.map((entry) => entry.name));
const result = {
  migrationParity: migrations.every((entry) => entry.local && entry.local === entry.remote)
    && [...REQUIRED_MIGRATIONS].every((version) => remoteMigrations.has(version)),
  applicationTableCount: tableRows.length,
  exactApplicationTables: tableNames.size === REQUIRED_TABLES.size
    && [...REQUIRED_TABLES].every((name) => tableNames.has(name)),
  requiredIndexes: [...REQUIRED_INDEXES].every((name) => indexNames.has(name)),
  securityDefinitionsPresent: REQUIRED_SCHEMA_MARKERS.every((marker) => schema.includes(marker)),
  missingSecurityDefinitions: REQUIRED_SCHEMA_MARKERS.filter((marker) => !schema.includes(marker)),
  securityAdvisorErrors: (securityAdvisor.results ?? []).filter((item) => item.level === "ERROR").length,
  performanceAdvisorErrors: (performanceAdvisor.results ?? []).filter((item) => item.level === "ERROR").length,
};

const headers = { apikey: project.publishableKey, "content-type": "application/json" };
const publicCatalog = await fetch(`${project.url}/rest/v1/active_restaurants?select=id&limit=1`, { headers });
const protectedColumn = await fetch(`${project.url}/rest/v1/restaurants?select=phone&limit=1`, { headers });
const anonymousOrder = await fetch(`${project.url}/rest/v1/rpc/create_order`, {
  method: "POST", headers,
  body: JSON.stringify({
    p_restaurant_id: "missing", p_address_id: "missing", p_payment_method: "cash",
    p_items: [{ menu_item_id: "missing", quantity: 1, customization_ids: [] }], p_notes: "",
  }),
});
const malformedOrder = await fetch(`${project.url}/rest/v1/rpc/create_order`, {
  method: "POST", headers: { ...headers, authorization: "Bearer not-a-jwt" },
  body: JSON.stringify({
    p_restaurant_id: "missing", p_address_id: "missing", p_payment_method: "cash",
    p_items: [{ menu_item_id: "missing", quantity: 1, customization_ids: [] }], p_notes: "",
  }),
});
result.publishableKeyMatrix = {
  publicCatalogAllowed: publicCatalog.ok,
  protectedColumnDenied: !protectedColumn.ok,
  anonymousMutationDenied: !anonymousOrder.ok,
  malformedTokenDenied: !malformedOrder.ok,
};

const booleans = [
  result.migrationParity, result.exactApplicationTables, result.requiredIndexes,
  result.securityDefinitionsPresent, result.securityAdvisorErrors === 0,
  result.performanceAdvisorErrors === 0, ...Object.values(result.publishableKeyMatrix),
];
if (!booleans.every(Boolean)) {
  console.error(JSON.stringify(result, null, 2));
  throw new Error("Hosted Milestone 3 verification failed.");
}
console.log(JSON.stringify(result, null, 2));
