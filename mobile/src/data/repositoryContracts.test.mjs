/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepositoryBackend, selectRepositoryForBackend } from "./backendSelection.ts";
import { createInitialFetchSubscription, setCatalogSupabaseClientForTests, setSupabaseClientForTests, withSupabaseAuthRetry } from "./supabase/utils.ts";
import * as supabaseAddresses from "./supabase/addressRepository.ts";
import * as supabaseMenu from "./supabase/menuRepository.ts";
import * as supabaseOrders from "./supabase/orderRepository.ts";
import * as supabaseReviews from "./supabase/reviewRepository.ts";
import * as supabaseNotifications from "./supabase/notificationRepository.ts";
import * as supabaseRestaurants from "./supabase/restaurantRepository.ts";
import { supabaseFavoritesRepository } from "./supabase/favoritesRepository.ts";
import { getMembershipForFirebaseUser } from "./supabase/membershipQueries.ts";
import { OrderRealtimeCoordinator } from "./supabase/orderRealtimeCoordinator.ts";
import { createBoundedRetry } from "../features/notifications/boundedRetry.ts";
import { createMenuSections } from "../features/restaurantMenu/menuUtils.ts";

const here = dirname(fileURLToPath(import.meta.url));
const readDataFile = (relativePath) => readFileSync(join(here, relativePath), "utf8");

class MockQuery {
    constructor(client, table) {
        this.client = client;
        this.table = table;
        this.operation = "select";
        this.filters = [];
    }
    select(columns) { this.columns = columns; this.client.calls.push({ kind: "select", table: this.table, columns }); return this; }
    insert(payload) { this.operation = "insert"; this.payload = payload; this.client.calls.push({ kind: "insert", table: this.table, payload }); return this; }
    update(payload) { this.operation = "update"; this.payload = payload; this.client.calls.push({ kind: "update", table: this.table, payload }); return this; }
    delete() { this.operation = "delete"; this.client.calls.push({ kind: "delete", table: this.table }); return this; }
    eq(column, value) { this.filters.push({ type: "eq", column, value }); return this; }
    in(column, value) { this.filters.push({ type: "in", column, value }); return this; }
    or(value) { this.filters.push({ type: "or", value }); return this; }
    order() { return this; }
    limit(value) { this.limitValue = value; return this; }
    maybeSingle() { this.single = true; return this; }
    then(resolve, reject) {
        return Promise.resolve(this.client.resolveQuery(this)).then(resolve, reject);
    }
}

const createMockClient = ({ query, rpc } = {}) => {
    const client = {
        calls: [],
        realtime: { setAuth(token) { client.calls.push({ kind: "setAuth", token }); return Promise.resolve(); } },
        from(table) { return new MockQuery(client, table); },
        rpc(name, args) {
            client.calls.push({ kind: "rpc", name, args });
            return Promise.resolve(rpc ? rpc(name, args, client) : { data: null, error: null });
        },
        channel(name, options) {
            client.calls.push({ kind: "channel", name, options });
            const channel = {
                on(_type, _filter, listener) { channel.listener = listener; return channel; },
                subscribe(listener) { channel.statusListener = listener; globalThis.queueMicrotask(() => listener?.("SUBSCRIBED")); return channel; },
            };
            return channel;
        },
        removeChannel(channel) { client.calls.push({ kind: "removeChannel", channel }); return Promise.resolve(); },
        resolveQuery(builder) {
            if (query) return query(builder, client);
            return { data: builder.single ? null : [], error: null };
        },
    };
    return client;
};

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
const wait = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

const createRealtimeHarness = () => {
    let identity = "firebase-user-1";
    const listeners = {};
    const channels = [];
    const client = {
        calls: [],
        realtime: { setAuth(token) { client.calls.push(["auth", token]); return Promise.resolve(); } },
        rpc(name) {
            client.calls.push(["rpc", name]);
            return Promise.resolve({ data: [{ topic: `orders:profile:${identity}`, topic_kind: "profile", resource_id: identity }], error: null });
        },
        channel(topic, options) {
            const channel = {
                topic, options,
                on(_type, _filter, listener) { channel.broadcast = listener; return channel; },
                subscribe(listener) { channel.status = listener; globalThis.queueMicrotask(() => listener("SUBSCRIBED")); return channel; },
            };
            channels.push(channel);
            return channel;
        },
        removeChannel(channel) { client.calls.push(["remove", channel.topic]); return Promise.resolve(); },
    };
    const dependencies = {
        client: () => client,
        accessToken: async () => `${identity}-token`,
        authIdentity: () => identity,
        watchAuth: (listener) => { listeners.auth = listener; return () => { delete listeners.auth; }; },
        watchForeground: (listener) => { listeners.foreground = listener; return () => { delete listeners.foreground; }; },
        watchNetwork: (listener) => { listeners.network = listener; return () => { delete listeners.network; }; },
    };
    return { client, channels, dependencies, listeners, setIdentity: (value) => { identity = value; } };
};

const firebaseOrders = {
    subscribeOrder(orderId, cb) {
        cb({ id: orderId, status: "pending" });
        return () => {
            firebaseOrders.unsubscribed = true;
        };
    },
    unsubscribed: false,
};

const disabledSupabaseOrders = {
    subscribeOrder() {
        throw new Error("Supabase order repository should not be selected while globally disabled.");
    },
};

test("selects Firebase for a domain when Supabase is globally disabled", () => {
    assert.equal(
        resolveRepositoryBackend("order", {
            supabaseEnabled: false,
            domains: { order: "supabase" },
        }).backend,
        "firebase",
    );
});

test("selects Supabase only when the global and domain flags both request it", () => {
    assert.equal(
        resolveRepositoryBackend("restaurant", {
            supabaseEnabled: true,
            domains: { restaurant: "supabase" },
        }).backend,
        "supabase",
    );
});

test("standalone builds use statically referenced Expo repository flags", () => {
    const source = readDataFile("backendFlags.ts");
    const domains = ["AUTH", "CATALOG", "PROFILE", "MEMBERSHIP", "RESTAURANT", "MENU", "ORDER", "REVIEW", "ADDRESS", "FAVORITES", "NOTIFICATION"];
    for (const domain of domains) {
        assert.match(source, new RegExp(`process\\.env\\.EXPO_PUBLIC_${domain}_REPOSITORY`));
    }
    assert.doesNotMatch(source, /process[^\n]*\.env\?\.\[name\]/);
});

test("Firebase listener contracts preserve unsubscribe semantics through selection", () => {
    const selected = selectRepositoryForBackend(
        "order",
        { supabaseEnabled: false, domains: { order: "supabase" } },
        { firebase: firebaseOrders, supabase: disabledSupabaseOrders },
    );

    let received = null;
    const unsubscribe = selected.subscribeOrder("fixture-order", (order) => {
        received = order;
    });

    assert.deepEqual(received, { id: "fixture-order", status: "pending" });
    assert.equal(typeof unsubscribe, "function");
    unsubscribe();
    assert.equal(firebaseOrders.unsubscribed, true);
});

test("real repository facades use explicit contracts and Supabase adapters", () => {
    const domains = ["profile", "membership", "restaurant", "menu", "order", "review", "address", "favorites", "notification"];
    for (const domain of domains) {
        const path = domain === "favorites" ? "favoritesBackend.ts" : `${domain}Repository.ts`;
        const source = readDataFile(path);
        assert.match(source, new RegExp(`supabase${domain[0].toUpperCase()}${domain.slice(1)}Repository`));
        assert.doesNotMatch(source, /createDisabledSupabaseRepository/);
        assert.doesNotMatch(source, /typeof firebase/);
    }
});

test("catalog is independently selectable while management domains stay on Firebase", () => {
    assert.equal(resolveRepositoryBackend("catalog", {
        supabaseEnabled: true,
        domains: { catalog: "supabase", restaurant: "firebase", menu: "firebase" },
    }).backend, "supabase");
    assert.equal(resolveRepositoryBackend("restaurant", {
        supabaseEnabled: true,
        domains: { catalog: "supabase", restaurant: "firebase" },
    }).backend, "firebase");
    assert.equal(resolveRepositoryBackend("menu", {
        supabaseEnabled: true,
        domains: { catalog: "supabase", menu: "firebase" },
    }).backend, "firebase");
    const source = readDataFile("catalogRepository.ts");
    assert.match(source, /selectRepository<CatalogRepository>\("catalog"/);
    assert.doesNotMatch(source, /createMenuItem|updateRestaurant|updateMenuItem/);
});

test("Supabase catalog subscriptions fetch once and never enable Realtime", async () => {
    let calls = 0;
    const unsubscribe = createInitialFetchSubscription(
        async () => [{ id: "restaurant-1" }],
        () => { calls += 1; },
    );
    unsubscribe();
    await flushPromises();
    assert.equal(calls, 0, "unsubscribe suppresses an in-flight initial fetch");

    const secondUnsubscribe = createInitialFetchSubscription(
        async () => [{ id: "restaurant-1" }],
        () => { calls += 1; },
    );
    await flushPromises();
    assert.equal(calls, 1);
    secondUnsubscribe();
    const source = readDataFile("supabase/restaurantRepository.ts");
    assert.match(source, /createInitialFetchSubscription/);
    assert.doesNotMatch(source, /\.channel\(|postgres_changes|removeChannel/);
});

test("Supabase review summaries use database metrics and review subscriptions fetch once", async () => {
    const client = createMockClient({
        query: () => ({ data: [{ id: "review-1", restaurant_id: "restaurant-1", menu_item_id: "menu-1", rating: 5, created_at: "2026-09-04T00:00:00Z" }], error: null }),
        rpc: (name) => {
            if (name === "get_restaurant_product_review_summary") return { data: { rating_count: 7, rating_average: 4.25, distribution: { 1: 1, 2: 0, 3: 1, 4: 2, 5: 3 } }, error: null };
            if (name === "list_my_product_reviews") return { data: [], error: null };
            return { data: [], error: null };
        },
    });
    setSupabaseClientForTests(client);
    const summary = await supabaseReviews.fetchRestaurantReviewSummary("restaurant-1");
    assert.equal(summary.count, 7);
    assert.equal(summary.average, 4.25);
    assert.deepEqual(summary.distribution, { 1: 1, 2: 0, 3: 1, 4: 2, 5: 3 });
    let callbacks = 0;
    const unsubscribe = supabaseReviews.subscribeUserReviews("profile-1", () => { callbacks += 1; });
    await flushPromises();
    assert.equal(callbacks, 1);
    unsubscribe();
    assert.equal(client.calls.some((call) => call.kind === "channel" || call.kind === "removeChannel"), false);
    const source = readDataFile("supabase/reviewRepository.ts");
    assert.doesNotMatch(source, /\.channel\(|postgres_changes|removeChannel/);
});

test("Supabase repository source files contain concrete domain implementations", () => {
    const expected = {
        "supabase/restaurantRepository.ts": ["active_restaurants", "update_restaurant_details", "listenRestaurantSession"],
        "supabase/menuRepository.ts": ["active_menu_items", "upsert_menu_item", "upsert_category"],
        "supabase/orderRepository.ts": ["get_my_orders_page", "create_order", "get_authorized_order", "orderRealtimeCoordinator"],
        "supabase/reviewRepository.ts": ["published_product_reviews", "submit_product_review", "moderate_review"],
        "supabase/addressRepository.ts": ["addresses", "set_default_address", "subscribe"],
        "supabase/profileRepository.ts": ["ensure_my_profile", "update_my_profile", "profiles"],
        "supabase/membershipQueries.ts": ["my_restaurant_memberships", "getMembershipForFirebaseUser"],
        "supabase/favoritesRepository.ts": ["favorites", "replace_my_favorites"],
    };

    for (const [path, snippets] of Object.entries(expected)) {
        const source = readDataFile(path);
        for (const snippet of snippets) assert.ok(source.includes(snippet), `${path} should include ${snippet}`);
    }
});

test("Supabase catalog categories use their names instead of UUIDs as display slugs", () => {
    const category = supabaseMenu.mapCatalogCategory({
        id: "29dfb214-e1ff-4522-8379-d7e11142b7c4",
        restaurant_id: "31fdf62e-a49e-41c4-b519-712c7dcd095f",
        name: "Dürüm",
    });

    assert.equal(category.name, "Dürüm");
    assert.equal(category.slug, "dürüm");

    const sections = createMenuSections([
        { id: "item-1", name: "Dürüm Büyük", price: 460, categories: [category.id] },
    ], [category], "en");
    assert.deepEqual(sections.map(({ key, label }) => ({ key, label })), [
        { key: "wraps", label: "Wraps" },
    ]);
});

test("Supabase adapters never request wildcard columns", () => {
    const adapters = ["addressRepository.ts", "favoritesRepository.ts", "membershipRepository.ts", "menuRepository.ts", "orderRepository.ts", "profileRepository.ts", "restaurantRepository.ts", "reviewRepository.ts"];
    for (const adapter of adapters) {
        assert.doesNotMatch(readDataFile(`supabase/${adapter}`), /\.select\(["']\*["']\)/, `${adapter} must use an allowed column list`);
    }
});

test("Supabase address cache is cleared immediately and ignores an older in-flight read", async () => {
    let releaseRead;
    const pendingRows = new Promise((resolve) => { releaseRead = resolve; });
    const client = createMockClient({ query: async () => ({ data: await pendingRows, error: null }) });
    setSupabaseClientForTests(client);
    const observed = [];
    const unsubscribe = supabaseAddresses.subscribe((addresses) => observed.push(addresses));

    supabaseAddresses.clearSessionCache();
    releaseRead([{ id: "old-address", label: "Old", line1: "Old street", city: "City", country: "Country", is_default: true }]);
    await flushPromises();

    assert.deepEqual(observed.at(-1), []);
    unsubscribe();
});

test("Supabase checkout sends customization_ids to server pricing", async () => {
    const client = createMockClient({ rpc: (name) => ({ data: name === "create_order" ? "order-1" : null, error: null }) });
    setSupabaseClientForTests(client);
    const id = await supabaseOrders.placeOrder({
        userId: "profile-1",
        restaurantId: "restaurant-1",
        items: [{ menuItemId: "item-1", name: "Pizza", price: 10, quantity: 2, customizations: [{ id: "extra-1", name: "Cheese", price: 2 }] }],
        deliveryAddress: { id: "address-1" },
    });
    assert.equal(id, "order-1");
    const call = client.calls.find((item) => item.kind === "rpc" && item.name === "create_order");
    assert.deepEqual(call.args.p_items, [{ menu_item_id: "item-1", quantity: 2, customization_ids: ["extra-1"] }]);
    assert.equal("customizations" in call.args.p_items[0], false);
    await supabaseOrders.transitionOrder("order-1", "accepted");
    const transition = client.calls.find((item) => item.kind === "rpc" && item.name === "transition_order");
    assert.equal(transition.args.p_new_status, "preparing");
});

test("Supabase notifications register Expo tokens, persist preferences, and revoke before logout", async () => {
    const client = createMockClient({
        rpc: (name, args) => {
            if (name === "get_my_notification_preferences") {
                return { data: { orderStatus: true, restaurantOrders: false, reviewReplies: true }, error: null };
            }
            if (name === "update_my_notification_preferences") {
                return { data: {
                    orderStatus: args.p_order_status,
                    restaurantOrders: args.p_restaurant_orders,
                    reviewReplies: args.p_review_replies,
                }, error: null };
            }
            return { data: null, error: null };
        },
    });
    setSupabaseClientForTests(client);
    const registration = await supabaseNotifications.registerPushToken();
    assert.equal(registration.provider, "expo");
    assert.ok(client.calls.some((call) => call.kind === "rpc" && call.name === "register_my_push_token" && call.args.p_platform === "ios"));
    assert.deepEqual(await supabaseNotifications.getPreferences(), { orderStatus: true, restaurantOrders: false, reviewReplies: true });
    assert.deepEqual(await supabaseNotifications.updatePreferences({ orderStatus: false, restaurantOrders: true, reviewReplies: false }), {
        orderStatus: false, restaurantOrders: true, reviewReplies: false,
    });
    await supabaseNotifications.unregisterPushToken();
    assert.ok(client.calls.some((call) => call.kind === "rpc" && call.name === "unregister_my_push_token"));
});

test("push registration retry is bounded and recovers without overlapping work", async () => {
    let attempts = 0;
    const retry = createBoundedRetry({
        delays: [1, 1, 1],
        task: async () => {
            attempts += 1;
            if (attempts < 3) throw new Error("offline");
        },
    });
    await retry.run();
    await wait(20);
    retry.cancel();
    assert.equal(attempts, 3);

    let canceledAttempts = 0;
    const canceled = createBoundedRetry({
        delays: [10, 10],
        task: async () => {
            canceledAttempts += 1;
            throw new Error("offline");
        },
    });
    await canceled.run();
    canceled.cancel();
    await wait(25);
    assert.equal(canceledAttempts, 1);
});

test("Supabase delivery handoff is restaurant-managed and uses one batched role page", async () => {
    const client = createMockClient({
        rpc: (name) => ({ data: name === "transition_order" ? "out_for_delivery"
            : name === "get_admin_orders_page" ? { items: [{ id: "ready-1", restaurant_id: "restaurant-1", status: "ready", items: [] }], has_more: false, next_cursor: null }
            : name === "my_order_realtime_topics" ? [{ topic: "orders:restaurant:restaurant-1", topic_kind: "restaurant", resource_id: "restaurant-1" }] : [], error: null }),
    });
    setSupabaseClientForTests(client);
    let received = [];
    const unsubscribe = supabaseOrders.listenToOrders({ restaurantId: "restaurant-1", statuses: ["ready"] }, (orders) => { received = orders; });
    await flushPromises();
    assert.equal(supabaseOrders.courierAssignmentMode, "restaurant_managed");
    assert.equal(client.calls.filter((item) => item.kind === "rpc" && item.name === "get_admin_orders_page").length, 2, "initial fetch plus one reconciliation");
    assert.equal(client.calls.some((item) => item.kind === "select"), false);
    assert.equal(received[0].id, "ready-1");
    assert.deepEqual(await supabaseOrders.assignCourier("ready-1", "ignored-label", "ready"), { id: "ready-1", status: "out_for_delivery" });
    assert.ok(client.calls.some((item) => item.kind === "rpc" && item.name === "transition_order" && item.args?.p_new_status === "out_for_delivery"));
    unsubscribe();
    await flushPromises();
    assert.ok(client.calls.some((item) => item.kind === "channel" && item.options?.config?.private === true));
    assert.ok(client.calls.some((item) => item.kind === "removeChannel"));
    assert.doesNotMatch(readDataFile("supabase/orderRepository.ts"), /postgres_changes/);
});

test("Supabase customer orders receive embedded item snapshots in one page RPC", async () => {
    const client = createMockClient({
        rpc: (name) => ({ data: name === "get_my_orders_page" ? { items: [{
            id: "order-1", restaurant_id: "restaurant-1", status: "delivered", total_kurus: 1800, created_at: "2026-09-04T10:00:00Z", items: [{
            id: "item-1", menu_item_id: null, source_menu_item_id: "legacy-menu", item_name: "Legacy Meal",
            item_image_url: "https://example.invalid/meal.png", unit_price_kurus: 1500, quantity: 1,
            customizations_snapshot: [{ id: "extra-1", name: "Cheese", price_kurus: 300 }],
        }] }], has_more: false, next_cursor: null } : [], error: null }),
    });
    setSupabaseClientForTests(client);
    const orders = await supabaseOrders.fetchUserOrders("ignored-firebase-uid");
    assert.equal(orders[0].items[0].menuItemId, "legacy-menu");
    assert.equal(orders[0].items[0].price, 15);
    assert.equal(orders[0].items[0].customizations[0].price, 3);
    assert.deepEqual(orders[0].orderItems, orders[0].items);
    assert.equal(client.calls.filter((item) => item.kind === "rpc" && item.name === "get_my_orders_page").length, 1);
    assert.equal(client.calls.some((item) => item.kind === "rpc" && item.name === "get_order_items"), false);
});

test("Supabase public catalog requests share the 60-second cache", async () => {
    const client = createMockClient({ rpc: (name) => ({
        data: name === "get_featured_catalog_items" ? [{ id: "menu-1", restaurant_id: "restaurant-1", category_id: "category-1", name: "Meal", price_kurus: 1000 }] : [],
        error: null,
    }) });
    setCatalogSupabaseClientForTests(client);
    const first = await supabaseMenu.getMenu({ limit: 6 });
    const second = await supabaseMenu.getMenu({ limit: 6 });
    assert.deepEqual(second, first);
    assert.equal(client.calls.filter((item) => item.kind === "rpc" && item.name === "get_featured_catalog_items").length, 1);
});

test("Supabase address writes use transactional RPCs", async () => {
    let rows = [
        { id: "a1", label: "Home", line1: "One", city: "City", country: "Country", is_default: true, created_at: "2026-09-01T00:00:00Z" },
    ];
    const client = createMockClient({
        query: (builder) => {
            if (builder.table !== "addresses") return { data: builder.single ? null : [], error: null };
            if (builder.operation === "select") return { data: rows.map((row) => ({ ...row })), error: null };
            return { data: null, error: null };
        },
        rpc: (name, args) => {
            if (name === "set_default_address") rows = rows.map((row) => ({ ...row, is_default: row.id === args.p_address_id }));
            if (name === "create_my_address") {
                rows = rows.map((row) => ({ ...row, is_default: args.p_is_default ? false : row.is_default }));
                rows.push({ id: args.p_id, label: args.p_label, line1: args.p_line1, city: args.p_city, country: args.p_country, is_default: args.p_is_default, created_at: "2026-09-03T00:00:00Z" });
            }
            if (name === "update_my_address") {
                if (!args.p_is_default && rows.find((row) => row.id === args.p_id)?.is_default) {
                    const replacement = rows.find((row) => row.id !== args.p_id);
                    if (replacement) replacement.is_default = true;
                }
                rows = rows.map((row) => row.id === args.p_id ? { ...row, label: args.p_label, line1: args.p_line1, is_default: args.p_is_default } : row);
            }
            if (name === "delete_my_address") {
                const removed = rows.find((row) => row.id === args.p_id);
                rows = rows.filter((row) => row.id !== args.p_id);
                if (removed?.is_default && rows.length) rows[0].is_default = true;
            }
            return { data: null, error: null };
        },
    });
    setSupabaseClientForTests(client);
    await supabaseAddresses.create({ id: "a2", label: "Work", line1: "Two", city: "City", country: "Country", isDefault: true });
    assert.deepEqual(rows.filter((row) => row.is_default).map((row) => row.id), ["a2"]);
    await supabaseAddresses.update({ id: "a2", label: "Work", line1: "Two updated", city: "City", country: "Country", isDefault: false, createdAt: "2026-09-03T00:00:00Z" });
    assert.deepEqual(rows.filter((row) => row.is_default).map((row) => row.id), ["a1"]);
    await supabaseAddresses.remove("a1");
    assert.deepEqual(rows.filter((row) => row.is_default).map((row) => row.id), ["a2"]);
});

test("order Realtime performs initial and post-subscribe reconciliation over a private channel", async () => {
    const harness = createRealtimeHarness();
    const coordinator = new OrderRealtimeCoordinator(harness.dependencies);
    let fetches = 0;
    const values = [];
    const unsubscribe = coordinator.subscribe(async () => ++fetches, (value) => values.push(value));
    await flushPromises();
    await flushPromises();
    assert.equal(fetches, 2);
    assert.deepEqual(values, [1, 2]);
    assert.equal(harness.channels.length, 1);
    assert.deepEqual(harness.channels[0].options, { config: { private: true } });
    assert.ok(harness.client.calls.some(([kind]) => kind === "auth"));
    unsubscribe();
});

test("order Realtime shares channels and coalesces duplicate invalidations", async () => {
    const harness = createRealtimeHarness();
    const coordinator = new OrderRealtimeCoordinator(harness.dependencies);
    let firstFetches = 0;
    let secondFetches = 0;
    const unsubscribeFirst = coordinator.subscribe(async () => ++firstFetches, () => undefined);
    const unsubscribeSecond = coordinator.subscribe(async () => ++secondFetches, () => undefined);
    await flushPromises();
    await flushPromises();
    assert.equal(harness.channels.length, 1, "same topic has one shared channel");
    harness.channels[0].broadcast({ payload: { order_id: "ignored", operation: "update", version: "ignored" } });
    harness.channels[0].broadcast({ payload: { order_id: "ignored", operation: "update", version: "ignored" } });
    await wait(100);
    assert.equal(firstFetches, 3);
    assert.equal(secondFetches, 3);
    unsubscribeFirst();
    assert.equal(harness.client.calls.filter(([kind]) => kind === "remove").length, 0);
    unsubscribeSecond();
    await flushPromises();
    assert.equal(harness.client.calls.filter(([kind]) => kind === "remove").length, 1);
});

test("order Realtime shares identical query fetches and resolves topics once per identity", async () => {
    const harness = createRealtimeHarness();
    const coordinator = new OrderRealtimeCoordinator(harness.dependencies);
    let fetches = 0;
    const firstValues = [];
    const secondValues = [];
    const fetcher = async () => ++fetches;
    const unsubscribeFirst = coordinator.subscribeShared("customer-page", fetcher, (value) => firstValues.push(value));
    const unsubscribeSecond = coordinator.subscribeShared("customer-page", fetcher, (value) => secondValues.push(value));
    await flushPromises();
    await flushPromises();
    assert.equal(fetches, 2, "one initial request and one shared reconciliation");
    assert.deepEqual(firstValues, [1, 2]);
    assert.ok(secondValues.length >= 1);
    assert.equal(harness.client.calls.filter(([kind, name]) => kind === "rpc" && name === "my_order_realtime_topics").length, 1);
    unsubscribeFirst();
    unsubscribeSecond();
});

test("order Realtime suppresses stale work after unsubscribe", async () => {
    const harness = createRealtimeHarness();
    const coordinator = new OrderRealtimeCoordinator(harness.dependencies);
    let resolveFetch;
    let callbacks = 0;
    const unsubscribe = coordinator.subscribe(() => new Promise((resolve) => { resolveFetch = resolve; }), () => { callbacks += 1; });
    await flushPromises();
    unsubscribe();
    resolveFetch?.("late");
    await flushPromises();
    assert.equal(callbacks, 0);
    assert.equal(harness.channels.length, 0);
});

test("order Realtime tears down and re-resolves topics on Firebase account switch and logout", async () => {
    const harness = createRealtimeHarness();
    const coordinator = new OrderRealtimeCoordinator(harness.dependencies);
    const unsubscribe = coordinator.subscribe(async () => [], () => undefined);
    await flushPromises();
    await flushPromises();
    harness.setIdentity("firebase-user-2");
    harness.listeners.auth();
    await flushPromises();
    await flushPromises();
    assert.equal(harness.channels.at(-1).topic, "orders:profile:firebase-user-2");
    assert.ok(harness.client.calls.some(([kind, topic]) => kind === "remove" && topic === "orders:profile:firebase-user-1"));
    harness.setIdentity(null);
    harness.listeners.auth();
    await flushPromises();
    assert.ok(harness.client.calls.some(([kind, topic]) => kind === "remove" && topic === "orders:profile:firebase-user-2"));
    unsubscribe();
});

test("order Realtime refetches on foreground/network recovery and reconnects with bounded backoff", async () => {
    const harness = createRealtimeHarness();
    const coordinator = new OrderRealtimeCoordinator(harness.dependencies);
    let fetches = 0;
    const unsubscribe = coordinator.subscribe(async () => ++fetches, () => undefined);
    await flushPromises();
    await flushPromises();
    harness.listeners.foreground();
    harness.listeners.network();
    await flushPromises();
    assert.ok(fetches >= 4);
    harness.channels[0].status("TIMED_OUT");
    harness.channels[0].status("CHANNEL_ERROR");
    await wait(550);
    assert.equal(harness.channels.length, 2, "duplicate failures schedule one reconnect");
    unsubscribe();
});

test("Supabase favorites replace the caller set atomically", async () => {
    const client = createMockClient({ rpc: (name, args) => ({ data: name === "replace_my_favorites" ? args.p_restaurant_ids.length : null, error: null }) });
    setSupabaseClientForTests(client);
    await supabaseFavoritesRepository.persistFavorites("profile-1", ["restaurant-1", "restaurant-2"]);
    assert.deepEqual(client.calls, [{ kind: "rpc", name: "replace_my_favorites", args: { p_restaurant_ids: ["restaurant-1", "restaurant-2"] } }]);
    assert.equal(client.calls.some((call) => call.kind === "delete" || call.kind === "insert"), false);
});

test("Supabase membership resolves exactly one restaurant without changing auth", async () => {
    const client = createMockClient({
        query: (builder) => builder.table === "my_restaurant_memberships"
            ? { data: [{ restaurant_id: "restaurant-1", role: "owner" }], error: null }
            : { data: { id: "restaurant-1", name: "Restaurant One" }, error: null },
    });
    setSupabaseClientForTests(client);
    const membership = await getMembershipForFirebaseUser({ uid: "firebase-user", email: "member@example.invalid" });
    assert.deepEqual(membership, {
        userId: "firebase-user", email: "member@example.invalid",
        restaurantId: "restaurant-1", restaurantName: "Restaurant One",
    });
    assert.deepEqual(client.calls.filter((call) => call.kind === "select").map((call) => call.table), ["my_restaurant_memberships", "restaurants"]);
});

test("future-issued JWT failures retry a bounded number of times", async () => {
    let attempts = 0;
    const value = await withSupabaseAuthRetry(async () => {
        attempts += 1;
        if (attempts < 2) throw { code: "PGRST303", message: "JWT issued at future" };
        return "ok";
    });
    assert.equal(value, "ok");
    assert.equal(attempts, 2);
});

test("Supabase catalog and review adapters execute allowed projections and scoped RPCs", async () => {
    const client = createMockClient({
        query: (builder) => ({ data: [], error: null }),
        rpc: () => ({ data: [], error: null }),
    });
    setSupabaseClientForTests(client);
    await supabaseMenu.getRestaurantMenu({ restaurantId: "restaurant-1" });
    await supabaseMenu.createMenuItem("restaurant-1", {
        name: "Pizza",
        price: 10,
        categoryId: "category-1",
        customizations: [{ id: "extra-1", name: "Cheese", price: 2 }],
    });
    await supabaseReviews.fetchMenuItemReviews("item-1");
    await supabaseReviews.fetchUserReviews("profile-1");
    await supabaseReviews.fetchRestaurantReviews("restaurant-1", { includeHidden: true });
    assert.ok(client.calls.filter((item) => item.kind === "select").every((item) => item.columns !== "*"));
    assert.ok(client.calls.some((item) => item.kind === "rpc" && item.name === "list_my_product_reviews"));
    assert.ok(client.calls.some((item) => item.kind === "rpc" && item.name === "list_restaurant_product_reviews"));
    const menuWrite = client.calls.find((item) => item.kind === "rpc" && item.name === "upsert_menu_item");
    assert.deepEqual(menuWrite.args.p_customizations, [{ id: "extra-1", name: "Cheese", price_kurus: 200 }]);
});

test("Supabase restaurant and menu management use secured RPCs including inactive rows", async () => {
    const client = createMockClient({
        query: (builder) => builder.table === "my_restaurant_memberships"
            ? { data: [{ restaurant_id: "restaurant-1" }], error: null }
            : { data: builder.single ? null : [], error: null },
        rpc: (name) => {
            if (name === "create_restaurant") return { data: "restaurant-new", error: null };
            if (name === "get_restaurant_menu_management_data") return { data: {
                restaurant_id: "restaurant-1",
                categories: [{ id: "category-inactive", restaurant_id: "restaurant-1", name: "Old", is_active: false }],
                items: [{ id: "item-inactive", restaurant_id: "restaurant-1", category_id: "category-inactive", name: "Old item", price_kurus: 500, is_active: false }],
            }, error: null };
            return { data: null, error: null };
        },
    });
    setSupabaseClientForTests(client);
    assert.equal((await supabaseRestaurants.createRestaurant({ name: "New" })).id, "restaurant-new");
    const management = await supabaseMenu.getOwnedRestaurantMenuManagementData();
    assert.equal(management.items[0].visible, false);
    assert.ok(client.calls.some((call) => call.kind === "rpc" && call.name === "create_restaurant"));
    assert.ok(client.calls.some((call) => call.kind === "rpc" && call.name === "get_restaurant_menu_management_data"));
});

test("public catalog reads do not use the Firebase-authenticated Supabase client", async () => {
    const authenticatedClient = createMockClient();
    const publicCatalogClient = createMockClient({
        query: () => ({ data: [], error: null }),
    });
    setSupabaseClientForTests(authenticatedClient);
    setCatalogSupabaseClientForTests(publicCatalogClient);

    await supabaseMenu.getRestaurantMenu({ restaurantId: "restaurant-1" });
    assert.equal(authenticatedClient.calls.length, 0);
    assert.ok(publicCatalogClient.calls.some((call) => call.kind === "select" && call.table === "active_menu_items"));

    await supabaseMenu.createMenuItem("restaurant-1", {
        name: "Pizza",
        price: 10,
        categoryId: "category-1",
    });
    assert.ok(authenticatedClient.calls.some((call) => call.kind === "rpc" && call.name === "upsert_menu_item"));
});

test("sign-in hydrates account details through the selected profile repository", () => {
    const signInScreen = readDataFile("../../app/(auth)/sign-in.tsx");
    assert.match(signInScreen, /getCurrentUser as getCurrentProfile[^\n]+profileRepository/);
    assert.match(signInScreen, /await getCurrentProfile\(\)/);
    assert.doesNotMatch(signInScreen, /getCurrentUser[^\n]+authRepository/);
    assert.doesNotMatch(signInScreen, /replaceAfterAuth|dismissAll/);
});

test("guest auth layout keeps its navigator mounted while authentication hydrates", () => {
    const source = readDataFile("../features/auth/routeGuards.tsx");
    const guestGuard = source.slice(
        source.indexOf("export const GuestOnlyRoute"),
        source.indexOf("export const ProtectedRoute"),
    );

    assert.match(guestGuard, /<Stack/);
    assert.match(guestGuard, /screenLayout=/);
    assert.doesNotMatch(guestGuard, /if \(isLoading\) return <LoadingGate/);
});

test("admin layout withholds data-fetching screens until dual authorization allows mounting", () => {
    const layout = readDataFile("../../app/admin/_layout.tsx");
    const guard = readDataFile("../features/auth/routeGuards.tsx");
    const adminRoute = guard.slice(guard.indexOf("export const AdminRoute"), guard.indexOf("const adminGateStyles"));
    const screenGate = guard.slice(guard.indexOf("const AdminScreenGate"), guard.indexOf("export const AdminRoute"));
    const dashboard = readDataFile("../../app/admin/SuperAdminDashboard.tsx");

    assert.match(layout, /export default AdminRoute/);
    assert.match(adminRoute, /<Stack/);
    assert.match(adminRoute, /screenLayout=/);
    assert.match(adminRoute, /<AdminScreenGate action=\{routeAction\}/);
    assert.match(screenGate, /shouldMountAdminChildren\(action\)/);
    assert.match(dashboard, /useEffect\(\(\) => \{[\s\S]*listenToOrders\(/);
    assert.doesNotMatch(layout, /listenToOrders|getAdminRestaurants|getAdminRestaurantMenu/);
});

test.after(() => setSupabaseClientForTests());
