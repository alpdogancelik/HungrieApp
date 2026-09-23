import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const restaurant = path.join(root, "apps/restaurant");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const importTs = relative => import(pathToFileURL(path.join(root, relative)).href);

const validDashboard = {
  restaurantId: "restaurant-1", role: "owner",
  restaurant: { name: "Restaurant", lifecycleStatus: "active", acceptingOrders: true, preferredLanguage: "tr" },
  counts: { pending: 1, active: 2, unreadReviews: 3 }, serverTime: "2026-09-23T10:00:00.000Z",
};

test("dashboard parser accepts only the exact authoritative contract", async () => {
  const { parseRestaurantDashboard, RestaurantDashboardContractError } = await importTs("apps/restaurant/src/dashboardContract.ts");
  assert.deepEqual(parseRestaurantDashboard(validDashboard), validDashboard);
  for (const invalid of [
    { ...validDashboard, invented: true },
    { ...validDashboard, role: "admin" },
    { ...validDashboard, counts: { ...validDashboard.counts, pending: -1 } },
    { ...validDashboard, restaurant: { ...validDashboard.restaurant, name: "" } },
    { ...validDashboard, serverTime: "not-a-date" },
  ]) assert.throws(() => parseRestaurantDashboard(invalid), RestaurantDashboardContractError);
});

test("runtime status and request ordering are presentation-only and race safe", async () => {
  const { deriveRestaurantRuntimeStatus, runtimeResultIsCurrent } = await importTs("apps/restaurant/src/restaurantRuntimeModel.ts");
  assert.equal(deriveRestaurantRuntimeStatus({ online: false, realtimeConnected: true, dashboard: validDashboard, refreshFailed: false }), "offline");
  assert.equal(deriveRestaurantRuntimeStatus({ online: true, realtimeConnected: false, dashboard: validDashboard, refreshFailed: false }), "connecting");
  assert.equal(deriveRestaurantRuntimeStatus({ online: true, realtimeConnected: true, dashboard: validDashboard, refreshFailed: false }), "connected");
  assert.equal(deriveRestaurantRuntimeStatus({ online: true, realtimeConnected: true, dashboard: validDashboard, refreshFailed: true }), "stale");
  assert.equal(deriveRestaurantRuntimeStatus({ online: true, realtimeConnected: true, dashboard: null, refreshFailed: true }), "stale");
  assert.equal(runtimeResultIsCurrent({ resultGeneration: 1, currentGeneration: 2, request: 4, latestAppliedRequest: 3 }), false);
  assert.equal(runtimeResultIsCurrent({ resultGeneration: 2, currentGeneration: 2, request: 2, latestAppliedRequest: 3 }), false);
  assert.equal(runtimeResultIsCurrent({ resultGeneration: 2, currentGeneration: 2, request: 4, latestAppliedRequest: 3 }), true);
});

test("shared sign-out deduplicates calls and cannot be blocked by push cleanup", async () => {
  const { createRestaurantSignOut } = await importTs("apps/restaurant/src/restaurantSignOutCore.ts");
  let release;
  let cleanupCalls = 0, signOutCalls = 0;
  const signOut = createRestaurantSignOut({ unregisterPush: () => { cleanupCalls += 1; return new Promise(resolve => { release = resolve; }); }, firebaseSignOut: async () => { signOutCalls += 1; } });
  const first = signOut(), second = signOut();
  assert.equal(first, second);
  assert.equal(cleanupCalls, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(signOutCalls, 1);
  const failing = createRestaurantSignOut({ unregisterPush: async () => { throw new Error("offline"); }, firebaseSignOut: async () => { signOutCalls += 1; } });
  await failing();
  assert.equal(signOutCalls, 2);
});

test("one shared realtime subscription preserves alert and cleanup contracts", () => {
  const sources = walk(path.join(restaurant, "src")).filter(file => /\.(ts|tsx)$/.test(file)).map(file => fs.readFileSync(file, "utf8"));
  assert.equal(sources.reduce((total, source) => total + (source.match(/restaurant-orders:v1:/g)?.length || 0), 0), 1);
  const runtime = read("apps/restaurant/src/RestaurantRuntimeContext.tsx");
  for (const token of ["onMessage", "alertRestaurantOrder", 'event: \"order_changed\"', "setOrderEventRevision", "refreshDashboard", "removeChannel", "unsubscribeMessage", 'removeEventListener(\"online\"', "identityGeneration.current += 1"]) assert.ok(runtime.includes(token), `Missing runtime contract: ${token}`);
  assert.ok(runtime.indexOf("setOrderEventRevision") < runtime.indexOf("reconcile();\n          if"), "Realtime events must be published before reconciliation completes");
});

test("Orders retains authoritative polling, recovery, acknowledgement, and monotonic replacement", () => {
  const orders = read("apps/restaurant/src/OrdersPage.tsx");
  for (const token of ["setInterval", 'addEventListener(\"focus\"', 'addEventListener(\"online\"', 'addEventListener(\"offline\"', 'addEventListener(\"visibilitychange\"', "restaurant_acknowledge_order_seen_v1", "versions.get(item.id) === item.updated_at", "runtime.orderEventRevision", "restaurant_list_orders_v1"]) assert.ok(orders.includes(token), `Missing Orders recovery contract: ${token}`);
  assert.ok(!orders.includes("supabase.channel"));
});

test("navigation, public routes, and production boundaries are preserved", () => {
  const gate = read("apps/restaurant/src/AuthGate.tsx");
  const shell = read("apps/restaurant/src/components/AppShell.tsx");
  const allProduction = walk(restaurant).filter(file => /\.(ts|tsx|css|json)$/.test(file) && !file.includes(`${path.sep}dist${path.sep}`)).map(file => fs.readFileSync(file, "utf8")).join("\n");
  for (const route of ["login", "invite", "forgot-password", "pending", "suspended", "more"]) assert.ok(fs.existsSync(path.join(restaurant, "app", `${route}.tsx`)), `Missing route ${route}`);
  assert.ok(gate.includes('path === "/forgot-password"'));
  assert.ok(gate.includes("RestaurantRuntimeProvider"));
  assert.ok(shell.includes("isActiveRestaurantOwner(access)"));
  assert.ok(shell.includes("runtime.dashboard?.restaurant.name"));
  assert.ok(!allProduction.includes("restaurant-ui-mock"));
  assert.ok(!allProduction.includes("MockProvider"));
  assert.ok(!allProduction.includes("UI STATE"));
});

test("locked text and control color pairs meet WCAG AA contrast", () => {
  const luminance = hex => {
    const channels = hex.match(/../g).map(value => Number.parseInt(value, 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  };
  for (const [foreground, background] of [["0f1729", "ff6520"], ["d13f00", "fff8ef"], ["697386", "ffffff"], ["697386", "fff8ef"], ["aeb7c8", "0f1729"], ["ffffff", "d13f00"]]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must meet 4.5:1`);
});

test("financial artifacts are unchanged and the lock delta is limited to approved UI dependencies", () => {
  const hashes = {
    "supabase/migrations/20260922100000_restaurant_earnings_admin_commission.sql": "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94",
    "packages/database-types/src/database.generated.ts": "337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37",
    "packages/domain/src/index.ts": "8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe",
  };
  for (const [file, expected] of Object.entries(hashes)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"), expected, `${file} changed`);
  const baseline = JSON.parse(execFileSync("git", ["show", "HEAD:package-lock.json"], { cwd: root, encoding: "utf8" }));
  const current = JSON.parse(read("package-lock.json"));
  for (const dependency of ["@expo-google-fonts/dm-sans", "@expo-google-fonts/outfit", "expo-font", "lucide-react"]) delete current.packages["apps/restaurant"].dependencies[dependency];
  delete current.packages["node_modules/lucide-react"];
  assert.deepEqual(current, baseline);
});
