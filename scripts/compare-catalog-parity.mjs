import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const exportArg = process.argv.find((entry) => entry.startsWith("--export="))?.slice("--export=".length);
if (!exportArg) throw new Error("Usage: npm run catalog:parity -- --export=secure/catalog-migration-....json");
const exportPath = path.resolve(ROOT_DIR, exportArg);
const relative = path.relative(SECURE_DIR, exportPath);
if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("The catalog export must be inside ignored secure/.");
const payload = JSON.parse(fs.readFileSync(exportPath, "utf8"));
const state = JSON.parse(fs.readFileSync(path.join(SECURE_DIR, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
if (!project?.url || !project?.publishableKey) throw new Error("Development Supabase configuration is incomplete.");

const headers = { apikey: project.publishableKey };
const fetchRows = async (resource, columns) => {
  const response = await fetch(`${project.url}/rest/v1/${resource}?select=${columns}&limit=1000`, { headers });
  if (!response.ok) throw new Error(`Public catalog request failed for ${resource}.`);
  return response.json();
};
const [actualRestaurants, actualCategories, actualMenuItems] = await Promise.all([
  fetchRows("active_restaurants", "id,name,description,cuisine,image_url,delivery_eta_min_minutes,delivery_eta_max_minutes,delivery_fee_kurus,minimum_order_kurus,sort_order"),
  fetchRows("active_categories", "id,restaurant_id,name,description,icon,sort_order"),
  fetchRows("active_menu_items", "id,restaurant_id,category_id,name,description,image_url,price_kurus,sort_order"),
]);

const activeRestaurantIds = new Set(payload.staged.restaurants.filter((row) => row.is_active).map((row) => row.id));
const expectedRestaurants = payload.staged.restaurants.filter((row) => row.is_active).map((row) => ({
  id: row.id, name: row.name, description: row.description, cuisine: row.cuisine, image_url: row.image_url,
  delivery_eta_min_minutes: row.delivery_eta_min_minutes, delivery_eta_max_minutes: row.delivery_eta_max_minutes,
  delivery_fee_kurus: row.delivery_fee_kurus, minimum_order_kurus: row.minimum_order_kurus, sort_order: row.sort_order,
}));
const activeCategoryIds = new Set(payload.staged.categories
  .filter((row) => row.is_active && activeRestaurantIds.has(row.restaurant_id)).map((row) => row.id));
const expectedCategories = payload.staged.categories
  .filter((row) => row.is_active && activeRestaurantIds.has(row.restaurant_id))
  .map(({ id, restaurant_id, name, description, icon, sort_order }) => ({ id, restaurant_id, name, description, icon, sort_order }));
const expectedMenuItems = payload.staged.menu_items
  .filter((row) => row.is_active && activeRestaurantIds.has(row.restaurant_id) && activeCategoryIds.has(row.category_id))
  .map(({ id, restaurant_id, category_id, name, description, image_url, price_kurus, sort_order }) => ({
    id, restaurant_id, category_id, name, description, image_url, price_kurus, sort_order,
  }));
const stable = (rows) => JSON.stringify([...rows].sort((left, right) => left.id.localeCompare(right.id)));
const parity = {
  restaurantLists: stable(expectedRestaurants) === stable(actualRestaurants),
  restaurantDetails: expectedRestaurants.every((expected) => stable([expected]) === stable(actualRestaurants.filter((row) => row.id === expected.id))),
  categoriesByRestaurant: [...activeRestaurantIds].every((id) =>
    stable(expectedCategories.filter((row) => row.restaurant_id === id)) === stable(actualCategories.filter((row) => row.restaurant_id === id))),
  menusByRestaurant: [...activeRestaurantIds].every((id) =>
    stable(expectedMenuItems.filter((row) => row.restaurant_id === id)) === stable(actualMenuItems.filter((row) => row.restaurant_id === id))),
  inactiveFiltering: actualRestaurants.every((row) => activeRestaurantIds.has(row.id))
    && actualCategories.every((row) => activeCategoryIds.has(row.id))
    && actualMenuItems.every((row) => expectedMenuItems.some((expected) => expected.id === row.id)),
  searchResults: ["a", "pizza", "cafe"].every((term) => {
    const matches = (rows) => rows.filter((row) => `${row.name} ${row.cuisine || ""}`.toLocaleLowerCase("tr-TR").includes(term)).map((row) => row.id).sort();
    return JSON.stringify(matches(expectedRestaurants)) === JSON.stringify(matches(actualRestaurants));
  }),
};
const result = {
  passed: Object.values(parity).every(Boolean),
  sourceChecksum: payload.metadata.sourceChecksum,
  stagedChecksum: payload.metadata.stagedChecksum,
  expectedCounts: { restaurants: expectedRestaurants.length, categories: expectedCategories.length, menuItems: expectedMenuItems.length },
  actualCounts: { restaurants: actualRestaurants.length, categories: actualCategories.length, menuItems: actualMenuItems.length },
  parity,
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) throw new Error("Firebase export and Supabase catalog parity failed.");
