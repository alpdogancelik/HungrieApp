import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secureRoot = path.join(root, "secure");
const write = process.argv.includes("--write");
const confirmation = process.argv.find((entry) => entry.startsWith("--confirm="))?.slice("--confirm=".length);

if (write && confirmation !== "clear-staging-test-data") {
  throw new Error("Refusing cleanup without --write --confirm=clear-staging-test-data.");
}

const state = JSON.parse(fs.readFileSync(path.join(secureRoot, "supabase-projects.local.json"), "utf8"));
const managementToken = fs.readFileSync(path.join(secureRoot, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const project = state.projects?.staging;
if (!project?.ref) throw new Error("The ignored staging project configuration is unavailable.");

const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const body = await response.text();
    let diagnostic = "database details were suppressed";
    try {
      diagnostic = String(JSON.parse(body)?.message || diagnostic)
        .replace(/'[^']*'/g, "'[redacted]'")
        .replace(/\([A-Za-z0-9_]+\)=\([^)]+\)/g, "($1)=([redacted])")
        .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
        .slice(0, 500);
    } catch {}
    throw new Error(`Staging cleanup query failed safely (${response.status}): ${diagnostic}`);
  }
  return response.json();
};

const summarySql = `select
  (select environment from private.runtime_settings where singleton) environment,
  (select mode::text from private.runtime_settings where singleton) mode,
  (select count(*) from public.restaurants where is_active) active_restaurants,
  (select count(*) from public.categories where is_active) active_categories,
  (select count(*) from public.menu_items where is_active) active_menu_items,
  (select count(*) from public.profiles) profiles,
  (select count(*) from public.profiles p where lower(p.email) like '%@hungrie.app') hungrie_domain_profiles,
  (select count(distinct rm.profile_id) from private.restaurant_members rm join public.profiles p on p.id=rm.profile_id join public.restaurants r on r.id=rm.restaurant_id and r.is_active where lower(p.email) like '%@hungrie.app') retained_member_profiles,
  (select count(*) from private.restaurant_members) restaurant_memberships,
  (select count(*) from public.orders) orders,
  (select count(*) from public.order_items) order_items,
  (select count(*) from public.addresses) addresses,
  (select count(*) from public.favorites) favorites,
  (select count(*) from public.product_reviews) + (select count(*) from public.order_reviews) reviews,
  (select count(*) from private.push_tokens) push_tokens,
  (select count(*) from private.notification_events) notification_events,
  (select count(*) from private.notification_deliveries) notification_deliveries,
  (select count(*) from migration.import_runs) import_runs,
  (select count(*) from migration.firestore_documents) migration_documents,
  (select count(*) from auth.users) supabase_auth_users,
  (select count(*) from storage.objects) storage_objects;`;

const before = (await query(summarySql))[0];
if (before?.environment !== "staging") throw new Error("Recorded target does not identify itself as staging; refusing cleanup.");
for (const [field, expected] of Object.entries({
  active_restaurants: 9,
  active_categories: 94,
  active_menu_items: 822,
  hungrie_domain_profiles: 9,
  retained_member_profiles: 9,
})) {
  if (Number(before[field]) !== expected) throw new Error(`Staging precondition ${field} changed; refusing cleanup.`);
}
if (Number(before.supabase_auth_users) !== 0 || Number(before.storage_objects) !== 0) {
  throw new Error("Unexpected Supabase Auth users or Storage objects require separate review; refusing cleanup.");
}

if (!write) {
  console.log(JSON.stringify({
    mode: "dry-run",
    target: "staging",
    preserve: { restaurantProfiles: 9, restaurants: 9, categories: 94, menuItems: 822 },
    remove: {
      profiles: Number(before.profiles) - 9,
      orders: Number(before.orders),
      orderItems: Number(before.order_items),
      addresses: Number(before.addresses),
      favorites: Number(before.favorites),
      reviews: Number(before.reviews),
      pushTokens: Number(before.push_tokens),
      notificationEvents: Number(before.notification_events),
      notificationDeliveries: Number(before.notification_deliveries),
      importRuns: Number(before.import_runs),
      migrationDocuments: Number(before.migration_documents),
    },
  }, null, 2));
  process.exit(0);
}

const cleanupSql = `begin;
set local hungrie.runtime_write_bypass = 'on';

create temporary table staging_profiles_to_keep(profile_id text primary key) on commit drop;
insert into staging_profiles_to_keep(profile_id)
select p.id
from public.profiles p
where lower(p.email) like '%@hungrie.app'
  and exists (
    select 1 from private.restaurant_members rm
    join public.restaurants r on r.id=rm.restaurant_id and r.is_active
    where rm.profile_id=p.id
  );

do $assert_keep$
begin
  if (select count(*) from staging_profiles_to_keep) <> 9 then
    raise exception 'STAGING_KEEP_PROFILE_COUNT_CHANGED';
  end if;
end $assert_keep$;

delete from private.notification_deliveries;
delete from private.notification_events;
delete from public.product_reviews;
delete from public.order_reviews;
delete from private.order_status_history;
delete from private.order_contacts;
delete from private.order_import_metadata;
delete from public.order_items;
delete from public.orders;
delete from private.audit_log;
delete from private.push_tokens;
delete from private.notification_preferences;
delete from private.restaurant_couriers;
delete from private.user_roles;
delete from public.addresses;
delete from public.favorites;
delete from private.restaurant_members where profile_id not in (select profile_id from staging_profiles_to_keep);
delete from public.profiles where id not in (select profile_id from staging_profiles_to_keep);

truncate table
  private.order_import_metadata,
  migration.order_contacts_stage,
  migration.order_items_stage,
  migration.order_reviews_stage,
  migration.product_reviews_stage,
  migration.order_quarantine,
  migration.review_quarantine,
  migration.orders_stage,
  migration.identity_addresses_stage,
  migration.identity_favorites_stage,
  migration.identity_memberships_stage,
  migration.identity_profiles_stage,
  migration.catalog_menu_items_stage,
  migration.catalog_categories_stage,
  migration.catalog_restaurants_stage,
  migration.firestore_documents,
  migration.import_rejections,
  migration.import_runs;

do $assert_final$
begin
  if (select count(*) from public.profiles) <> 9
    or (select count(*) from private.restaurant_members) <> 9
    or (select count(*) from public.orders) <> 0
    or (select count(*) from public.addresses) <> 0
    or (select count(*) from public.favorites) <> 0
    or (select count(*) from public.restaurants where is_active) <> 9
    or (select count(*) from public.categories where is_active) <> 94
    or (select count(*) from public.menu_items where is_active) <> 822
  then
    raise exception 'STAGING_CLEANUP_POSTCONDITION_FAILED';
  end if;
end $assert_final$;

commit;`;

await query(cleanupSql);
const after = (await query(summarySql))[0];
const zeroFields = ["orders", "order_items", "addresses", "favorites", "reviews", "push_tokens", "notification_events", "notification_deliveries", "import_runs", "migration_documents"];
if (Number(after.profiles) !== 9 || Number(after.restaurant_memberships) !== 9 || zeroFields.some((field) => Number(after[field]) !== 0)) {
  throw new Error("Staging cleanup completed but sanitized verification did not match the approved state.");
}

console.log(JSON.stringify({
  mode: "write",
  target: "staging",
  completed: true,
  preserved: {
    restaurantProfiles: Number(after.profiles),
    memberships: Number(after.restaurant_memberships),
    restaurants: Number(after.active_restaurants),
    categories: Number(after.active_categories),
    menuItems: Number(after.active_menu_items),
  },
  cleared: Object.fromEntries(zeroFields.map((field) => [field, Number(after[field])])),
  developmentModified: false,
  firebaseModified: false,
}, null, 2));
