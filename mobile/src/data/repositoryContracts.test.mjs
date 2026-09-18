/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepositoryBackend } from "./backendSelection.ts";
import { createInitialFetchSubscription, setCatalogSupabaseClientForTests, setSupabaseClientForTests, withSupabaseAuthRetry } from "./supabase/utils.ts";
import * as supabaseAddresses from "./supabase/addressRepository.ts";
import * as supabaseMenu from "./supabase/menuRepository.ts";
import * as supabaseOrders from "./supabase/orderRepository.ts";
import * as supabaseReviews from "./supabase/reviewRepository.ts";
import * as reviewV2 from "./supabase/reviewV2Repository.ts";
import * as supabaseNotifications from "./supabase/notificationRepository.ts";
import * as supabaseRestaurants from "./supabase/restaurantRepository.ts";
import { supabaseFavoritesRepository } from "./supabase/favoritesRepository.ts";
import { getMembershipForFirebaseUser } from "./supabase/membershipQueries.ts";
import { OrderRealtimeCoordinator } from "./supabase/orderRealtimeCoordinator.ts";
import { createBoundedRetry } from "../features/notifications/boundedRetry.ts";
import { createMenuSections } from "../features/restaurantMenu/menuUtils.ts";
import { getCancellationReasonText } from "../features/orders/cancellationReason.ts";
import {
    canonicalizeCustomerReviewDraft,
    clearCustomerReviewOperation,
    listPendingCustomerReviewOperations,
    recoverCustomerReviewsIfAuthorized,
    reconcilePendingCustomerReviewOperations,
    resolveCustomerReviewOperation,
    submitCustomerReviewWithDurableOperation,
} from "../features/reviews/customerReviewOperation.ts";

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

test("application data remains on Supabase when its client is unavailable", () => {
    assert.equal(
        resolveRepositoryBackend("order", {
            supabaseEnabled: false,
            domains: { order: "supabase" },
        }).backend,
        "supabase",
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

test("authentication remains Firebase while application data remains Supabase", () => {
    assert.equal(resolveRepositoryBackend("auth", { supabaseEnabled: false }).backend, "firebase");
    assert.equal(resolveRepositoryBackend("order", { supabaseEnabled: false, domains: { order: "firebase" } }).backend, "supabase");
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

test("all Customer application-data domains are fixed to Supabase", () => {
    for (const domain of ["catalog", "profile", "restaurant", "menu", "order", "review", "address", "favorites", "notification"]) {
        assert.equal(resolveRepositoryBackend(domain, { supabaseEnabled: true, domains: { [domain]: "firebase" } }).backend, "supabase");
    }
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
        "supabase/orderRepository.ts": ["get_my_customer_orders_page_v1", "create_order_v2", "get_my_customer_order_v1", "orderRealtimeCoordinator"],
        "supabase/reviewRepository.ts": ["published_product_reviews", "submit_my_customer_product_review_v1", "moderate_review"],
        "supabase/addressRepository.ts": ["list_my_customer_addresses_v1", "set_my_customer_default_address_v1", "subscribe"],
        "supabase/profileRepository.ts": ["get_my_customer_profile_v1", "update_my_customer_profile_v1"],
        "supabase/membershipQueries.ts": ["my_restaurant_memberships", "getMembershipForFirebaseUser"],
        "supabase/favoritesRepository.ts": ["list_my_customer_favorites_v1", "replace_my_customer_favorites_v1"],
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

test("Supabase checkout sends v2 option and removed-ingredient IDs with an operation ID", async () => {
    const client = createMockClient({ rpc: (name) => ({ data: name === "create_order_v2" ? { orderId: "order-1", replayed: false } : null, error: null }) });
    setSupabaseClientForTests(client);
    const id = await supabaseOrders.placeOrder({
        userId: "profile-1",
        restaurantId: "restaurant-1",
        items: [{ menuItemId: "item-1", name: "Pizza", price: 10, quantity: 2, customizations: [{ id: "extra-1", name: "Cheese", price: 2 }, { id: "onion-1", name: "No onion", price: 0, type: "removed_ingredient" }] }],
        deliveryAddress: { id: "address-1" },
        operationId: "00000000-0000-4000-8000-000000000001",
    });
    assert.equal(id, "order-1");
    const call = client.calls.find((item) => item.kind === "rpc" && item.name === "create_order_v2");
    assert.deepEqual(call.args.p_items, [{ menuItemId: "item-1", quantity: 2, optionValueIds: ["extra-1"], removedIngredientIds: ["onion-1"] }]);
    assert.equal(call.args.p_operation_id, "00000000-0000-4000-8000-000000000001");
    await supabaseOrders.transitionOrder("order-1", "accepted");
    const transition = client.calls.find((item) => item.kind === "rpc" && item.name === "transition_order");
    assert.equal(transition.args.p_new_status, "preparing");
});

test("Customer orders expose and translate only the safe cancellation reason code", async () => {
    const client = createMockClient({
        rpc: (name) => ({
            data: name === "get_my_customer_order_v1"
                ? {
                    id: "order-canceled",
                    restaurant_id: "restaurant-1",
                    status: "canceled",
                    cancellation_reason_code: "item_unavailable",
                    subtotal_kurus: 1000,
                    total_kurus: 1000,
                    items: [],
                }
                : null,
            error: null,
        }),
    });
    setSupabaseClientForTests(client);

    const order = await supabaseOrders.fetchAuthorizedOrder("order-canceled");

    assert.equal(order?.cancellationReasonCode, "item_unavailable");
    assert.equal(getCancellationReasonText(order?.cancellationReasonCode, false), "An item in your order is unavailable.");
    assert.equal(getCancellationReasonText(order?.cancellationReasonCode, true), "Siparişindeki bir ürün mevcut değil.");
    assert.equal(getCancellationReasonText("unsupported_internal_value", false), "The restaurant canceled this order.");
});

test("Customer order list and detail render cancellation reasons", () => {
    const ordersScreen = readDataFile("../../app/orders.tsx");
    const orderDetails = readDataFile("../features/orders/OrderDetailsScreen.tsx");

    assert.match(ordersScreen, /getCancellationReasonText\(item\.cancellationReasonCode/);
    assert.match(orderDetails, /getCancellationReasonText\(order\?\.cancellationReasonCode/);
});

test("Customer order expiry remains server-owned and notification taps open order detail", () => {
    const pendingScreen = readDataFile("../screens/OrderPendingScreen.tsx");
    const pendingRoute = readDataFile("../../app/order/pending.tsx");
    const rootLayout = readDataFile("../../app/_layout.tsx");

    assert.doesNotMatch(pendingScreen, /onApprovalExpired=/);
    assert.doesNotMatch(pendingScreen, /nextSla\s*===\s*0[\s\S]{0,100}transitionOrder/);
    assert.match(pendingScreen, /transitionOrder\(orderId, "canceled"\)/, "explicit Customer cancellation remains available");
    assert.match(pendingRoute, /onConfirmed=.*pathname: "\/orders\/\[id\]"/);
    assert.match(pendingRoute, /onRejected=.*pathname: "\/orders\/\[id\]"/);
    assert.match(rootLayout, /pathname: "\/orders\/\[id\]",\s*params: \{ id: orderId \}/);
    assert.doesNotMatch(rootLayout, /params: \{ highlight: orderId \}/);
});

test("Supabase notifications register Expo tokens, persist preferences, and revoke before logout", async () => {
    const client = createMockClient({
        rpc: (name, args) => {
            if (name === "get_my_customer_notification_preferences_v1") {
                return { data: { orderStatus: true, restaurantOrders: false, reviewReplies: true }, error: null };
            }
            if (name === "update_my_customer_notification_preferences_v1") {
                return { data: {
                    orderStatus: args.p_order_status,
                    restaurantOrders: false,
                    reviewReplies: args.p_review_replies,
                }, error: null };
            }
            return { data: null, error: null };
        },
    });
    setSupabaseClientForTests(client);
    const registration = await supabaseNotifications.registerPushToken();
    assert.equal(registration.provider, "expo");
    assert.ok(client.calls.some((call) => call.kind === "rpc" && call.name === "register_my_customer_push_token_v1" && call.args.p_platform === "ios"));
    assert.deepEqual(await supabaseNotifications.getPreferences(), { orderStatus: true, restaurantOrders: false, reviewReplies: true });
    assert.deepEqual(await supabaseNotifications.updatePreferences({ orderStatus: false, restaurantOrders: true, reviewReplies: false }), {
        orderStatus: false, restaurantOrders: false, reviewReplies: false,
    });
    await supabaseNotifications.unregisterPushToken();
    assert.ok(client.calls.some((call) => call.kind === "rpc" && call.name === "unregister_my_customer_push_token_v1"));
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
            : name === "my_customer_order_realtime_topics_v1" ? [{ topic: "orders:restaurant:restaurant-1", topic_kind: "restaurant", resource_id: "restaurant-1" }] : [], error: null }),
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
        rpc: (name) => ({ data: name === "get_my_customer_orders_page_v1" ? { items: [{
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
    assert.equal(client.calls.filter((item) => item.kind === "rpc" && item.name === "get_my_customer_orders_page_v1").length, 1);
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

test("a saved legacy product review cannot invalidate or compete with v2 Restaurant ratings", async () => {
    let restaurantReads = 0;
    const client = createMockClient({
        query: (builder) => {
            if (builder.table === "active_restaurants") {
                restaurantReads += 1;
                return { data: [{ id: "restaurant-1", name: "Kitchen", rating_average: 5, rating_count: restaurantReads }], error: null };
            }
            return { data: builder.single ? null : [], error: null };
        },
        rpc: (name) => {
            if (name === "get_restaurant_review_summary_v2") return { data: {
                restaurantId: "restaurant-1", overallRating: 4.25, tasteRating: 4.5, speedRating: 4, reviewCount: 7,
            }, error: null };
            if (name === "submit_my_customer_product_review_v1") return { data: "review-1", error: null };
            if (name === "get_my_customer_product_review_v1") return { data: {
                id: "review-1", restaurant_id: "restaurant-1", menu_item_id: "menu-1", rating: 5,
            }, error: null };
            return { data: null, error: null };
        },
    });
    setSupabaseClientForTests(client);

    assert.equal((await supabaseRestaurants.getRestaurants())[0].ratingCount, 7);
    await supabaseReviews.submitMenuItemReview({ orderId: "order-1", itemId: "menu-1", rating: 5 });
    assert.equal((await supabaseRestaurants.getRestaurants())[0].ratingCount, 7);
    assert.equal(restaurantReads, 1);
});

test("Home refreshes restaurant summaries on focus and foreground recovery", () => {
    const source = readDataFile("../hooks/useHome.ts");
    assert.match(source, /useFocusEffect/);
    assert.match(source, /reloadRestaurants\(true\)/);
    assert.match(source, /AppState\.addEventListener\("change"/);
    assert.match(source, /reloadRestaurants\(true\)/);
});

test("Customer catalog v2 maps required, multiple-choice, priced, and removable options", async () => {
    const client = createMockClient({
        rpc: (name) => ({ data: name === "get_active_restaurant_bundle_v2" ? {
            restaurant: { id: "restaurant-1", name: "Kitchen", lifecycle_status: "active" },
            categories: [],
            items: [{
                id: "item-1", restaurant_id: "restaurant-1", name: "Meal", price_kurus: 1000,
                menu_definition_revision: 7,
                ingredients: [{ id: "onion", name: "Onion", removable: true }, { id: "bread", name: "Bread", removable: false }],
                option_groups: [{
                    id: "extras", name: "Extras", minimum_selections: 1, maximum_selections: 2,
                    options: [{ id: "cheese", name: "Cheese", price_delta_kurus: 250 }],
                }],
            }],
        } : name === "get_restaurant_review_summary_v2" ? {
            restaurantId: "restaurant-1", overallRating: null, tasteRating: null, speedRating: null, reviewCount: 0,
        } : null, error: null }),
    });
    setCatalogSupabaseClientForTests(client);
    const bundle = await supabaseMenu.getRestaurantBundle("restaurant-1");
    assert.equal(bundle.items[0].menuDefinitionRevision, 7);
    assert.deepEqual(bundle.items[0].optionGroups[0], {
        id: "extras", name: "Extras", kind: "multiple", minimumSelections: 1, maximumSelections: 2,
        options: [{ id: "cheese", name: "Cheese", price: 2.5 }],
    });
    assert.ok(bundle.items[0].customizations.some((entry) => entry.id === "onion" && entry.type === "removed_ingredient"));
    assert.ok(!bundle.items[0].customizations.some((entry) => entry.id === "bread"));
});

test("Supabase address writes use transactional RPCs", async () => {
    let rows = [
        { id: "a1", label: "Home", line1: "One", city: "City", country: "Country", is_default: true, created_at: "2026-09-01T00:00:00Z" },
    ];
    const client = createMockClient({
        rpc: (name, args) => {
            if (name === "list_my_customer_addresses_v1") return { data: rows.map((row) => ({ ...row })), error: null };
            if (name === "set_my_customer_default_address_v1") rows = rows.map((row) => ({ ...row, is_default: row.id === args.p_address_id }));
            if (name === "create_my_customer_address_v1") {
                rows = rows.map((row) => ({ ...row, is_default: args.p_is_default ? false : row.is_default }));
                rows.push({ id: args.p_id, label: args.p_label, line1: args.p_line1, city: args.p_city, country: args.p_country, is_default: args.p_is_default, created_at: "2026-09-03T00:00:00Z" });
            }
            if (name === "update_my_customer_address_v1") {
                if (!args.p_is_default && rows.find((row) => row.id === args.p_id)?.is_default) {
                    const replacement = rows.find((row) => row.id !== args.p_id);
                    if (replacement) replacement.is_default = true;
                }
                rows = rows.map((row) => row.id === args.p_id ? { ...row, label: args.p_label, line1: args.p_line1, is_default: args.p_is_default } : row);
            }
            if (name === "delete_my_customer_address_v1") {
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
    assert.equal(harness.client.calls.filter(([kind, name]) => kind === "rpc" && name === "my_customer_order_realtime_topics_v1").length, 1);
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
    const client = createMockClient({ rpc: (name, args) => ({ data: name === "replace_my_customer_favorites_v1" ? args.p_restaurant_ids.length : null, error: null }) });
    setSupabaseClientForTests(client);
    await supabaseFavoritesRepository.persistFavorites("profile-1", ["restaurant-1", "restaurant-2"]);
    assert.deepEqual(client.calls, [{ kind: "rpc", name: "replace_my_customer_favorites_v1", args: { p_restaurant_ids: ["restaurant-1", "restaurant-2"] } }]);
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
    await supabaseReviews.fetchReviewedMenuItemIdsForOrder("order-1");
    await supabaseReviews.fetchRestaurantReviews("restaurant-1", { includeHidden: true });
    assert.ok(client.calls.filter((item) => item.kind === "select").every((item) => item.columns !== "*"));
    assert.ok(client.calls.some((item) => item.kind === "rpc" && item.name === "list_my_customer_product_reviews_v1"));
    assert.ok(client.calls.some((item) => item.kind === "rpc" && item.name === "list_my_customer_product_review_menu_items_v1" && item.args.p_order_id === "order-1"));
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

test("sign-in establishes Firebase identity and delegates Customer access to the root gate", () => {
    const signInScreen = readDataFile("../../app/(auth)/sign-in.tsx");
    const customInput = readDataFile("../../components/CustomInput.tsx");
    const customerGate = readDataFile("../features/auth/CustomerAccessGate.tsx");
    assert.doesNotMatch(signInScreen, /resolveCustomerAccess/);
    assert.match(signInScreen, /await getCurrentAuthIdentity\(\)/);
    assert.match(customerGate, /await resolveCustomerAccess\(\)/);
    assert.doesNotMatch(signInScreen, /getCurrentProfile\(\)|await addressStore\.list\(\)/);
    assert.doesNotMatch(signInScreen, /replaceAfterAuth|dismissAll/);
    assert.match(signInScreen, /auth\/multi-factor-auth-required/);
    assert.match(signInScreen, /getAuthErrorMessage\(i18n\.language, "invalidCredentials"\)/);
    assert.match(customInput, /multiline=\{false\}/);
    assert.match(customInput, /numberOfLines=\{1\}/);
    assert.match(customInput, /scrollEnabled/);
    assert.match(customerGate, /setInterval\(\(\) => void check\(\), 15000\)/);
    assert.match(customerGate, /https:\/\/hungrie\.app\/support/);
    assert.match(customerGate, /tr \? "Çıkış yap" : "Sign out"/);
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

test("Customer startup withholds navigation until configuration, release, and access checks pass", () => {
    const layout = readDataFile("../../app/_layout.tsx");
    const releaseGate = readDataFile("../features/runtime/CustomerReleaseGate.tsx");
    assert.match(layout, /releaseReady && customerAccessReady \? <Stack/);
    assert.match(layout, /customerAccessReadyFor === customerIdentityKey/);
    assert.match(layout, /onIdTokenChanged\(auth/);
    assert.match(layout, /single callback own cold-start auth/);
    assert.doesNotMatch(layout, /useEffect\(\(\) => \{\s*fetchAuthenticatedUser\(\);/);
    assert.match(layout, /syncAuthenticatedUser\(true\)/);
    assert.match(layout, /!isAuthenticated \|\| !customerAccessReady/);
    assert.match(layout, /isLegacyPrivilegedRoute/);
    assert.match(releaseGate, /const API_CONTRACT=2/);
    assert.match(releaseGate, /id6759683384/);
    assert.match(releaseGate, /com\.hungrie\.app/);
    assert.match(releaseGate, /get_client_release_policy_v1/);
    assert.match(layout, /type === "restaurant_new_order" \|\| type === "restaurant_reminder"\) return false/);
});

test("iOS builds adopt the required scene lifecycle and start React Native from its window", () => {
    const appConfig = readDataFile("../../app.json");
    const scenePlugin = readDataFile("../../plugins/with-ios-scene-delegate.js");
    assert.match(appConfig, /\.\/plugins\/with-ios-scene-delegate/);
    assert.match(scenePlugin, /UIApplicationSceneManifest/);
    assert.match(scenePlugin, /class SceneDelegate: UIResponder, UIWindowSceneDelegate/);
    assert.match(scenePlugin, /UIWindow\(windowScene: windowScene\)/);
    assert.match(scenePlugin, /factory\.startReactNative/);
    assert.match(scenePlugin, /connectionOptions\.urlContexts/);
});

test("v2 public review repositories map anonymous contracts and preserve opaque keyset cursors", async () => {
    const client = createMockClient({ rpc: (name, args) => {
        if (name === "get_restaurant_review_summary_v2") return { data: { restaurantId: args.p_restaurant_id, overallRating: 4.5, tasteRating: 5, speedRating: 4, reviewCount: 2 }, error: null };
        if (name === "list_published_restaurant_reviews_v2") return { data: { limit: args.p_limit, nextCursor: args.p_cursor === "opaque:next" ? null : "opaque:next", items: [{
            reviewId: args.p_cursor === "opaque:next" ? "review-2" : "review-1", overallRating: 4.5, tasteRating: 5, speedRating: 4, comment: "Good", date: "2026-09-17",
            items: [{ menuItemId: "menu-1", name: "Meal", quantity: 2 }], userName: "must-not-map", orderId: "must-not-map",
            operationId: "must-not-map", reactions: [{ profileId: "must-not-map" }], createdAt: "must-not-map",
        }] }, error: null };
        return { data: null, error: null };
    } });
    setCatalogSupabaseClientForTests(client);
    const summary = await reviewV2.getRestaurantReviewSummaryV2("restaurant-public");
    assert.deepEqual(summary, { restaurantId: "restaurant-public", overallRating: 4.5, tasteRating: 5, speedRating: 4, reviewCount: 2 });
    const result = await reviewV2.listPublishedRestaurantReviewsV2("restaurant-public", { cursor: "opaque:prior", limit: 100 });
    const call = client.calls.find((entry) => entry.name === "list_published_restaurant_reviews_v2");
    assert.equal(call.args.p_cursor, "opaque:prior");
    assert.equal(call.args.p_limit, 50);
    assert.equal(result.nextCursor, "opaque:next");
    assert.deepEqual(Object.keys(result.items[0]).sort(), ["comment", "date", "items", "overallRating", "reviewId", "speedRating", "tasteRating"].sort());
    assert.equal(JSON.stringify(result).includes("must-not-map"), false);
    const tiedPage = await reviewV2.listPublishedRestaurantReviewsV2("restaurant-public", { cursor: result.nextCursor, limit: 50 });
    assert.equal(tiedPage.items[0].reviewId, "review-2");
    assert.equal(tiedPage.items[0].date, result.items[0].date);
    assert.throws(() => reviewV2.mapPublicRestaurantReview({ reviewId: "bad" }), (error) => error.code === "service_unavailable");
});

test("Customer catalog ratings come only from the database-owned v2 summary", async () => {
    const client = createMockClient({
        query: () => ({ data: [{ id: "restaurant-source", name: "Kitchen", rating_average: 1.25, rating_count: 99 }], error: null }),
        rpc: (name) => name === "get_restaurant_review_summary_v2"
            ? { data: { restaurantId: "restaurant-source", overallRating: 4.75, tasteRating: 5, speedRating: 4.5, reviewCount: 8 }, error: null }
            : { data: null, error: null },
    });
    setSupabaseClientForTests(client);
    const restaurants = await supabaseRestaurants.getRestaurants();
    assert.equal(restaurants[0].ratingAverage, 4.75);
    assert.equal(restaurants[0].ratingCount, 8);
    const selection = client.calls.find((entry) => entry.kind === "select" && entry.table === "active_restaurants");
    assert.doesNotMatch(selection.columns, /rating_average|rating_count/);
    const source = readDataFile("supabase/restaurantRepository.ts");
    assert.doesNotMatch(source, /row\.rating_average|row\.rating_count|get_restaurant_product_review_summary/);
    assert.match(source, /getRestaurantReviewSummaryV2/);
});

test("confirmed v2 submission invalidates only the affected Restaurant review and catalog caches", async () => {
    const counts = new Map();
    const client = createMockClient({ query: (builder) => {
        const id = builder.filters.find((filter) => filter.column === "id")?.value;
        const key = builder.single ? `detail:${id}` : "list";
        counts.set(key, (counts.get(key) || 0) + 1);
        const rows = [{ id: "restaurant-a", name: "A" }, { id: "restaurant-b", name: "B" }];
        return { data: builder.single ? rows.find((row) => row.id === id) : rows, error: null };
    }, rpc: (name, args) => {
        const key = `${name}:${args?.p_restaurant_id || args?.p_order_id || ""}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (name === "get_restaurant_review_summary_v2") return { data: { restaurantId: args.p_restaurant_id, overallRating: 4, tasteRating: 4, speedRating: 4, reviewCount: 1 }, error: null };
        if (name === "list_published_restaurant_reviews_v2") return { data: { items: [], nextCursor: null, limit: args.p_limit }, error: null };
        if (name === "submit_my_customer_order_review_v2") return { data: { reviewId: "review-new", replayed: false }, error: null };
        return { data: null, error: null };
    } });
    setSupabaseClientForTests(client);
    await reviewV2.getRestaurantReviewSummaryV2("restaurant-a");
    await reviewV2.getRestaurantReviewSummaryV2("restaurant-b");
    await reviewV2.listPublishedRestaurantReviewsV2("restaurant-a");
    await supabaseRestaurants.getRestaurants();
    await supabaseRestaurants.getRestaurant("restaurant-a");
    await supabaseRestaurants.getRestaurant("restaurant-b");
    await reviewV2.submitCustomerOrderReviewV2({ orderId: "order-a", restaurantId: "restaurant-a", tasteRating: 5, speedRating: 4,
        comment: "", mealReactions: [], operationId: "11111111-1111-4111-8111-111111111111" });
    await reviewV2.getRestaurantReviewSummaryV2("restaurant-a");
    await reviewV2.getRestaurantReviewSummaryV2("restaurant-b");
    await reviewV2.listPublishedRestaurantReviewsV2("restaurant-a");
    await supabaseRestaurants.getRestaurants();
    await supabaseRestaurants.getRestaurant("restaurant-a");
    await supabaseRestaurants.getRestaurant("restaurant-b");
    assert.equal(counts.get("get_restaurant_review_summary_v2:restaurant-a"), 2);
    assert.equal(counts.get("get_restaurant_review_summary_v2:restaurant-b"), 1);
    assert.equal(counts.get("list_published_restaurant_reviews_v2:restaurant-a"), 2);
    assert.equal(counts.get("list"), 2);
    assert.equal(counts.get("detail:restaurant-a"), 2);
    assert.equal(counts.get("detail:restaurant-b"), 1);
    const source = readDataFile("supabase/reviewV2Repository.ts");
    const invalidator = source.slice(source.indexOf("export const invalidateRestaurantReviewV2Caches"), source.indexOf("export const mapRestaurantReviewSummaryV2"));
    assert.match(invalidator, /bundle:\$\{restaurantId\}/);
    assert.doesNotMatch(invalidator, /menu:|featured:|product.review/i);
});

test("Phase 5 public presentation stays anonymous and refreshes only v2 metrics", () => {
    const page = readDataFile("../../app/restaurant-reviews/[id].tsx");
    const view = readDataFile("../features/reviews/PublicRestaurantReviewsView.tsx");
    const home = readDataFile("../hooks/useHome.ts");
    const search = readDataFile("../hooks/useSearch.ts");
    const details = readDataFile("../features/restaurantMenu/RestaurantMenuScreen.tsx");
    assert.match(page, /listPublishedRestaurantReviewsV2/);
    assert.match(page, /refreshRestaurantReviewSummaryV2/);
    assert.match(home, /reloadRestaurants\(true\)/);
    assert.match(search, /refreshRestaurants/);
    assert.match(details, /refreshRestaurantReviewSummaryV2/);
    assert.doesNotMatch(`${page}\n${view}`, /Hungrie kullanıcısı|masked.?name|customer.?name|user.?name|avatar|price.?performance|F\/P|meal.?reaction/i);
    assert.doesNotMatch(`${home}\n${search}\n${details}`, /get_restaurant_product_review_summary|get_restaurant_order_review_summary|restaurants\.rating_|row\.rating_average|row\.rating_count/i);
});

test("v2 Customer state mapping and stable error classification fail closed", async () => {
    const client = createMockClient({ rpc: (name) => name === "get_my_customer_order_review_state_v2" ? { data: {
        orderId: "order-state", reviewed: true, eligible: false, expiresAt: "2026-10-01T00:00:00Z",
        review: { reviewId: "review-state", tasteRating: 5, speedRating: 3, overallRating: 4, comment: "Done",
            items: [{ menuItemId: "menu-1", name: "Meal", quantity: 1 }], status: "published", createdAt: "2026-09-17T00:00:00Z" },
    }, error: null } : { data: null, error: null } });
    setSupabaseClientForTests(client);
    const state = await reviewV2.getCustomerOrderReviewStateV2("order-state");
    assert.equal(state.review?.overallRating, 4);
    const cases = [
        [{ code: "PGRST303", message: "JWT expired" }, "session_expired"],
        [{ code: "42501", message: "Active Customer account required" }, "account_inactive"],
        [{ code: "42501", message: "Owned delivered order required" }, "order_unavailable"],
        [{ code: "22023", message: "Review window has expired" }, "review_expired"],
        [{ code: "23505", message: "Order already reviewed" }, "already_reviewed"],
        [{ code: "22023", message: "Reaction item is not part of the order" }, "invalid_reaction_item"],
        [{ code: "22023", message: "Operation ID was reused with different input" }, "operation_conflict"],
        [{ code: "22023", message: "Invalid review comment" }, "validation"],
        [{ message: "network request failed" }, "service_unavailable"],
    ];
    for (const [input, expected] of cases) assert.equal(reviewV2.classifyReviewRepositoryError(input).code, expected);
    assert.equal(reviewV2.classifyReviewRepositoryError({ code: "XX000", message: "private database detail" }).message.includes("private"), false);
});

test("v2 review operations canonicalize drafts, retain uncertain attempts, and reconcile authoritatively", async () => {
    const values = new Map();
    const target = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => void values.set(key, value), removeItem: async (key) => void values.delete(key) };
    const draft = { orderId: "order-op", restaurantId: "restaurant-op", tasteRating: 5, speedRating: 4,
        comment: "  Cafe\u0301  ", mealReactions: [{ menuItemId: "menu-z", reaction: "liked" }, { menuItemId: "menu-a", reaction: "disliked" }] };
    const equivalent = { ...draft, comment: "Café", mealReactions: [...draft.mealReactions].reverse() };
    assert.deepEqual(canonicalizeCustomerReviewDraft(draft).mealReactions.map((entry) => entry.menuItemId), ["menu-a", "menu-z"]);
    assert.equal(canonicalizeCustomerReviewDraft({ ...draft, comment: "  Café\n" }).comment, "Café\n");
    const first = await resolveCustomerReviewOperation("profile-a", draft, target);
    const replay = await resolveCustomerReviewOperation("profile-a", equivalent, target);
    assert.equal(replay.operationId, first.operationId);
    const changed = await resolveCustomerReviewOperation("profile-a", { ...draft, speedRating: 3 }, target);
    assert.notEqual(changed.operationId, first.operationId);
    await assert.rejects(() => submitCustomerReviewWithDurableOperation("profile-a", { ...draft, speedRating: 3 }, target, async () => { throw new Error("lost response"); }));
    assert.equal((await listPendingCustomerReviewOperations("profile-a", target)).length, 1);
    const success = await submitCustomerReviewWithDurableOperation("profile-a", { ...draft, speedRating: 3 }, target,
        async ({ operationId }) => ({ reviewId: "review-op", replayed: operationId === changed.operationId }));
    assert.equal(success.replayed, true);
    assert.equal((await listPendingCustomerReviewOperations("profile-a", target)).length, 0);
    let concurrentCalls = 0;
    const concurrentDraft = { ...draft, orderId: "order-concurrent" };
    const submitOnce = async () => { concurrentCalls += 1; await new Promise((resolve) => globalThis.setTimeout(resolve, 5)); return { reviewId: "review-concurrent", replayed: false }; };
    const [left, right] = await Promise.all([
        submitCustomerReviewWithDurableOperation("profile-a", concurrentDraft, target, submitOnce),
        submitCustomerReviewWithDurableOperation("profile-a", concurrentDraft, target, submitOnce),
    ]);
    assert.equal(concurrentCalls, 1);
    assert.deepEqual(left, right);
    await resolveCustomerReviewOperation("profile-a", draft, target);
    await resolveCustomerReviewOperation("profile-b", { ...draft, orderId: "order-other" }, target);
    await reconcilePendingCustomerReviewOperations("profile-a", async () => ({ orderId: "order-op", reviewed: true, eligible: false, expiresAt: null, review: null }), target);
    assert.equal((await listPendingCustomerReviewOperations("profile-a", target)).length, 0);
    assert.equal((await listPendingCustomerReviewOperations("profile-b", target)).length, 1);
    const serialized = [...values.values()].join("\n");
    assert.equal(serialized.includes("Café"), false);
    assert.equal(serialized.includes("mealReactions"), false);
    let unauthorizedCalls = 0;
    await recoverCustomerReviewsIfAuthorized(false, "profile-b", async () => { unauthorizedCalls += 1; throw new Error("must not run"); }, target);
    assert.equal(unauthorizedCalls, 0);
    await clearCustomerReviewOperation("profile-b", "order-other", undefined, target);
});

test("v2 recovery coordinator cannot mount before active Customer authorization", () => {
    const layout = readDataFile("../../app/_layout.tsx");
    const coordinator = readDataFile("../features/reviews/CustomerReviewRecoveryCoordinator.tsx");
    assert.match(layout, /customerAccessReady && user\?\.accountId \? <CustomerReviewRecoveryCoordinator/);
    assert.match(coordinator, /recoverCustomerReviewsIfAuthorized/);
    assert.match(coordinator, /state === "active"/);
    assert.doesNotMatch(coordinator, /getCustomerReviewPromptV2/);
});

test.after(() => {
    setSupabaseClientForTests();
    setCatalogSupabaseClientForTests();
});
