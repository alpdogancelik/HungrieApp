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
  assert.equal(sources.reduce((total, source) => total + (source.match(/restaurant_order_realtime_topic_v2/g)?.length || 0), 0), 1);
  const runtime = read("apps/restaurant/src/RestaurantRuntimeContext.tsx");
  for (const token of ["onMessage", "alertRestaurantOrder", 'event: \"order_changed\"', "restaurantOrderRepository.get", "setOrderEventRevision", "refreshDashboard", "removeChannel", "unsubscribeMessage", 'removeEventListener(\"online\"', "identityGeneration.current += 1"]) assert.ok(runtime.includes(token), `Missing runtime contract: ${token}`);
  assert.ok(runtime.indexOf("setOrderEventRevision") < runtime.indexOf("// A second request receives"), "Realtime events must be published before reconciliation completes");
  for (const token of ["REALTIME_RETRY_DELAYS_MS", "scheduleRealtimeReconnect", "clearTimeout(reconnectTimer)", "channel !== nextChannel"]) assert.ok(runtime.includes(token), `Missing Realtime recovery contract: ${token}`);
  assert.ok((runtime.match(/restaurant_order_realtime_topic_v2/g) || []).length === 1, "Each reconnect must resolve the current authorized topic through the shared connection path");
});

test("auth transitions keep one inert runtime boundary around the router", () => {
  const gate = read("apps/restaurant/src/AuthGate.tsx");
  const runtime = read("apps/restaurant/src/RestaurantRuntimeContext.tsx");
  assert.match(gate, /if \(logoutRedirectingRef\.current\) \{\s*setState\("ready"\);\s*return;/);
  assert.equal((gate.match(/<RestaurantRuntimeProvider/g) || []).length, 1);
  assert.match(gate, /restaurantId=\{runtimeReady \? restaurantId : null\}/);
  assert.match(gate, /suspended=\{!runtimeReady \|\| logoutRedirecting\}/);
  assert.match(gate, /resumedAfterLogout \|\| user\.uid !== verifiedUid\.current/);
  assert.match(runtime, /suspended = false/);
  assert.match(runtime, /const inactive = suspended \|\| !restaurantId \|\| !role/);
  assert.match(runtime, /if \(inactive\) \{\s*setOnline\(false\);\s*return;/);
  assert.match(runtime, /if \(suspended \|\| !restaurantId \|\| !role\) return null;/);
});

test("Orders retains authoritative polling, recovery, acknowledgement, and monotonic replacement", () => {
  const orders = ["apps/restaurant/src/OrdersPage.tsx", "apps/restaurant/src/orders/useActiveOrders.ts", "apps/restaurant/src/orders/orderAcknowledgement.ts", "apps/restaurant/src/orders/orderRepository.ts", "apps/restaurant/src/orders/orderModel.ts"].map(read).join("\n");
  for (const token of ["setInterval", 'addEventListener(\"focus\"', 'addEventListener(\"online\"', 'addEventListener(\"offline\"', 'addEventListener(\"visibilitychange\"', "restaurant_acknowledge_order_seen_v1", "replaceOrdersMonotonically", "runtime.orderEventRevision", "restaurant_list_orders_v1"]) assert.ok(orders.includes(token), `Missing Orders recovery contract: ${token}`);
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

test("reviewed financial and schema contracts retain their exact foundation baseline", () => {
  const hashes = {
    "supabase/migrations/20260922100000_restaurant_earnings_admin_commission.sql": "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94",
    "supabase/migrations/20261007110000_virtual_pos_payment_method.sql": "45437ceec19fd77a09c06bc5ed5558241fc084ec450c43f18c7ce55accec052b",
    "supabase/migrations/20261007120000_virtual_pos_provider_independent_foundation.sql": "80baa5bf92e713ef2a6099a6c85739ae02cccd898bc37ca3d7fea9739c481888",
    "packages/database-types/src/database.generated.ts": "6b60adb9dfd989bcf1d786749cf1abde6f1107d68924bd2080a90f71f6b41ed1",
    "packages/domain/src/index.ts": "035204780489028bcbd7014b91de1cc695e427df69bc2480522dfc69d9fb8ba8",
    "packages/domain/src/virtualPos.ts": "9da76979ac330da2b078e52d99919e02227321c6551131519dead4d6e2b242db",
  };
  for (const [file, expected] of Object.entries(hashes)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"), expected, `${file} changed`);
});
