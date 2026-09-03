/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepositoryBackend, selectRepositoryForBackend } from "./backendSelection.ts";

const here = dirname(fileURLToPath(import.meta.url));
const readDataFile = (relativePath) => readFileSync(join(here, relativePath), "utf8");

const firebaseOrders = {
    subscribeOrder(orderId, cb) {
        cb({ id: orderId, status: "pending" });
        return () => {
            firebaseOrders.unsubscribed = true;
        };
    },
    unsubscribed: false,
};

const supabaseOrders = {
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

test("Firebase listener contracts preserve unsubscribe semantics through selection", () => {
    const selected = selectRepositoryForBackend(
        "order",
        { supabaseEnabled: false, domains: { order: "supabase" } },
        { firebase: firebaseOrders, supabase: supabaseOrders },
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
    const domains = ["profile", "restaurant", "menu", "order", "review", "address", "favorites", "notification"];
    for (const domain of domains) {
        const path = domain === "favorites" ? "favoritesBackend.ts" : `${domain}Repository.ts`;
        const source = readDataFile(path);
        assert.match(source, new RegExp(`supabase${domain[0].toUpperCase()}${domain.slice(1)}Repository`));
        assert.doesNotMatch(source, /createDisabledSupabaseRepository/);
        assert.doesNotMatch(source, /typeof firebase/);
    }
});

test("Supabase repository source files contain concrete domain implementations", () => {
    const expected = {
        "supabase/restaurantRepository.ts": ["active_restaurants", "update_restaurant_details", "listenRestaurantSession"],
        "supabase/menuRepository.ts": ["active_menu_items", "upsert_menu_item", "upsert_category"],
        "supabase/orderRepository.ts": ["my_orders", "create_order", "removeChannel"],
        "supabase/reviewRepository.ts": ["published_product_reviews", "submit_product_review", "moderate_review"],
        "supabase/addressRepository.ts": ["addresses", "set_default_address", "subscribe"],
        "supabase/profileRepository.ts": ["ensure_my_profile", "profiles"],
        "supabase/favoritesRepository.ts": ["favorites", "persistFavorites"],
    };

    for (const [path, snippets] of Object.entries(expected)) {
        const source = readDataFile(path);
        for (const snippet of snippets) assert.ok(source.includes(snippet), `${path} should include ${snippet}`);
    }
});
