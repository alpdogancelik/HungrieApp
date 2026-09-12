import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const STATE_PATH = path.join(SECURE_DIR, "supabase-projects.local.json");
const CLI_HOME = path.join(SECURE_DIR, "supabase-cli-hungrie");
const TOKEN_PATH = path.join(CLI_HOME, "access-token");

if (!fs.existsSync(STATE_PATH) || !fs.existsSync(TOKEN_PATH)) throw new Error("Missing ignored Supabase development state.");
const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const project = state.projects?.development;
if (!project?.url || !project?.publishableKey) throw new Error("Development project URL or publishable key is unavailable.");
const environment = {
  ...process.env,
  SUPABASE_HOME: CLI_HOME,
  SUPABASE_ACCESS_TOKEN: fs.readFileSync(TOKEN_PATH, "utf8").trim(),
};
const query = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql, "--output-format", "json"], {
    cwd: ROOT_DIR,
    env: environment,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Hosted Milestone 5 verification query failed.");
  const start = result.stdout.indexOf("{");
  return JSON.parse(result.stdout.slice(start)).rows;
};

const rows = query(`
  select json_build_object(
    'migration_applied', exists(select 1 from supabase_migrations.schema_migrations where version = '20260903232000'),
    'staging_tables', (
      select count(*) from information_schema.tables
      where table_schema = 'migration' and table_name in ('catalog_restaurants_stage','catalog_categories_stage','catalog_menu_items_stage')
    ),
    'completed_runs', (select count(*) from migration.import_runs where status = 'completed' and counts ? 'catalog'),
    'restaurants', (select count(*) from public.restaurants),
    'categories', (select count(*) from public.categories),
    'menu_items', (select count(*) from public.menu_items),
    'active_restaurants', (select count(*) from public.restaurants where is_active),
    'active_categories', (select count(*) from public.categories where is_active),
    'active_menu_items', (select count(*) from public.menu_items where is_active),
    'active_fixtures', (
      (select count(*) from public.restaurants where id like 'fixture_%' and is_active) +
      (select count(*) from public.categories where id like 'fixture_%' and is_active) +
      (select count(*) from public.menu_items where id like 'fixture_%' and is_active)
    ),
    'latest_source_checksum', (select source_checksum from migration.import_runs where status = 'completed' and counts ? 'catalog' order by completed_at desc limit 1),
    'latest_counts', (select counts->'catalog' from migration.import_runs where status = 'completed' and counts ? 'catalog' order by completed_at desc limit 1)
  ) as result
`);
const database = rows[0]?.result;
if (!database) throw new Error("Hosted Milestone 5 verification returned no aggregate result.");

const headers = { apikey: project.publishableKey, Prefer: "count=exact" };
const request = async (resource) => fetch(`${project.url}/rest/v1/${resource}`, { headers });
const [restaurants, categories, menuItems, protectedPhone, staging] = await Promise.all([
  request("active_restaurants?select=id"),
  request("active_categories?select=id"),
  request("active_menu_items?select=id"),
  request("restaurants?select=phone&limit=1"),
  request("catalog_restaurants_stage?select=id&limit=1"),
]);
const contentCount = (response) => Number(response.headers.get("content-range")?.split("/")[1] || 0);
const publicMatrix = {
  restaurantsAllowed: restaurants.ok,
  categoriesAllowed: categories.ok,
  menuItemsAllowed: menuItems.ok,
  restaurantCount: contentCount(restaurants),
  categoryCount: contentCount(categories),
  menuItemCount: contentCount(menuItems),
  protectedPhoneDenied: !protectedPhone.ok,
  stagingDenied: !staging.ok,
};

const passed = database.migration_applied
  && database.staging_tables === 3
  && database.completed_runs >= 1
  && database.restaurants === database.latest_counts?.restaurants
  && database.categories === database.latest_counts?.categories
  && database.menu_items === database.latest_counts?.menu_items
  && database.active_fixtures === 0
  && publicMatrix.restaurantsAllowed
  && publicMatrix.categoriesAllowed
  && publicMatrix.menuItemsAllowed
  && publicMatrix.protectedPhoneDenied
  && publicMatrix.stagingDenied
  && publicMatrix.restaurantCount === database.active_restaurants
  && publicMatrix.categoryCount === database.active_categories
  && publicMatrix.menuItemCount === database.active_menu_items;

const report = { passed, database, publicMatrix };
console.log(JSON.stringify(report, null, 2));
if (!passed) throw new Error("Hosted Milestone 5 verification failed.");
