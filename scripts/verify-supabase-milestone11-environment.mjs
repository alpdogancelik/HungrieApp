import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = process.argv[2];
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.split("=")[1];
if (!new Set(["staging", "production"]).has(environment) || confirmation !== environment) throw new Error("Choose staging or production and pass matching --confirm.");
const state = JSON.parse(fs.readFileSync(path.join(root, "secure", "supabase-projects.local.json"), "utf8"));
const token = fs.readFileSync(path.join(root, "secure", "supabase-cli-hungrie", "access-token"), "utf8").trim();
const project = state.projects?.[environment];
if (!project?.ref) throw new Error(`No ${environment} project is recorded.`);
const management = async (pathname, init) => {
  const response = await fetch(`https://api.supabase.com${pathname}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(`Sanitized environment verification failed (${response.status}).`);
  return response.json();
};
const projects = await management("/v1/projects");
const record = (Array.isArray(projects) ? projects : projects.projects || []).find((entry) => (entry.ref || entry.id) === project.ref);
if (!record) throw new Error("Recorded project does not exist in the authenticated organization.");
if (record.region !== "eu-central-1") throw new Error(`${environment} is not in Frankfurt.`);
const postgresMajor = String(record.database?.version || record.database_version || "").match(/\d+/)?.[0];
if (postgresMajor !== "17") throw new Error(`${environment} is not PostgreSQL 17.`);

const query = `select
  (select environment from private.runtime_settings where singleton) as environment,
  (select mode::text from private.runtime_settings where singleton) as mode,
  (select firebase_project_id from private.runtime_settings where singleton) as firebase_project_id,
  (select count(*) from supabase_migrations.schema_migrations) as migrations,
  (select count(*) from public.restaurants where is_active) as restaurants,
  (select count(*) from public.categories where is_active) as categories,
  (select count(*) from public.menu_items where is_active) as menu_items,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.orders) as orders,
  (select count(*) from public.product_reviews) + (select count(*) from public.order_reviews) as reviews,
  (select count(*) from public.addresses) as addresses,
  (select count(*) from public.favorites) as favorites,
  (select count(*) from private.push_tokens) as push_tokens,
  (select count(*) from private.notification_events) as notification_events,
  not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') as raw_order_realtime_disabled,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_runtime_status') as runtime_rpc_present;`;
const rows = await management(`/v1/projects/${project.ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
const row = rows?.[0];
if (!row || row.environment !== environment || !row.raw_order_realtime_disabled || !row.runtime_rpc_present) throw new Error("Environment runtime/schema verification failed.");
if (environment === "production" && row.mode !== "maintenance") throw new Error("Production must remain in maintenance during Milestone 11 preparation.");
if (environment === "production" && process.argv.includes("--expect-clean-production")) {
  const expectedCatalog = { restaurants: 9, categories: 94, menu_items: 822 };
  for (const [name, expected] of Object.entries(expectedCatalog)) if (Number(row[name]) !== expected) throw new Error(`Production catalog ${name} count does not match the approved release.`);
  for (const name of ["profiles", "orders", "reviews", "addresses", "favorites", "push_tokens", "notification_events"]) if (Number(row[name]) !== 0) throw new Error(`Clean production unexpectedly contains ${name}.`);
}
console.log(JSON.stringify({ environment, region: record.region, postgresMajor, mode: row.mode, migrations: Number(row.migrations), catalog: { restaurants: Number(row.restaurants), categories: Number(row.categories), menuItems: Number(row.menu_items) }, nonCatalogCounts: { profiles: Number(row.profiles), orders: Number(row.orders), reviews: Number(row.reviews), addresses: Number(row.addresses), favorites: Number(row.favorites), pushTokens: Number(row.push_tokens), notificationEvents: Number(row.notification_events) }, rawOrderRealtimeDisabled: true, runtimeRpcPresent: true, firebaseIdentityProvider: row.firebase_project_id === "hungrieapp-a2288" ? "archived-test-project" : "isolated-production-project" }, null, 2));
