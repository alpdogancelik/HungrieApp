import {
    getRestaurant as firebaseGetRestaurant,
    getRestaurants as firebaseGetRestaurants,
    subscribeRestaurant as firebaseSubscribeRestaurant,
    subscribeRestaurants as firebaseSubscribeRestaurants,
    getCategories as firebaseGetCategories,
    getMenu as firebaseGetMenu,
    getRestaurantCategories as firebaseGetRestaurantCategories,
    getRestaurantMenu as firebaseGetRestaurantMenu,
} from "@/lib/api";
import {
    getRestaurants as firebaseGetAdminRestaurants,
    getRestaurantMenu as firebaseGetAdminRestaurantMenu,
} from "@/lib/firebase";
import { selectRepository } from "./backendFlags";
import type { CatalogRepository } from "./contracts";
import * as supabaseMenu from "./supabase/menuRepository";
import * as supabaseRestaurant from "./supabase/restaurantRepository";

const firebaseCatalogRepository: CatalogRepository = {
    getRestaurants: firebaseGetRestaurants,
    subscribeRestaurants: firebaseSubscribeRestaurants,
    subscribeRestaurant: firebaseSubscribeRestaurant,
    getRestaurant: firebaseGetRestaurant,
    getCategories: firebaseGetCategories,
    getMenu: firebaseGetMenu,
    getMenuPage: async (params) => {
        const items = await firebaseGetMenu(params);
        const offset = params.offset || 0;
        const limit = params.limit || 20;
        return { items: items.slice(offset, offset + limit), hasMore: offset + limit < items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
    },
    getRestaurantCategories: firebaseGetRestaurantCategories,
    getRestaurantMenu: firebaseGetRestaurantMenu,
    getRestaurantBundle: async (restaurantId) => {
        const [restaurant, categories, items] = await Promise.all([
            firebaseGetRestaurant(restaurantId), firebaseGetRestaurantCategories(restaurantId), firebaseGetRestaurantMenu({ restaurantId }),
        ]);
        return restaurant ? { restaurant, categories, items } : null;
    },
    getAdminRestaurants: firebaseGetAdminRestaurants,
    getAdminRestaurantMenu: firebaseGetAdminRestaurantMenu,
};

const supabaseCatalogRepository: CatalogRepository = {
    getRestaurants: supabaseRestaurant.getRestaurants,
    subscribeRestaurants: supabaseRestaurant.subscribeRestaurants,
    subscribeRestaurant: supabaseRestaurant.subscribeRestaurant,
    getRestaurant: supabaseRestaurant.getRestaurant,
    getCategories: supabaseMenu.getCategories,
    getMenu: supabaseMenu.getMenu,
    getMenuPage: supabaseMenu.getMenuPage,
    getRestaurantCategories: supabaseMenu.getRestaurantCategories,
    getRestaurantMenu: supabaseMenu.getRestaurantMenu,
    getRestaurantBundle: supabaseMenu.getRestaurantBundle,
    getAdminRestaurants: supabaseMenu.getAdminRestaurants,
    getAdminRestaurantMenu: supabaseMenu.getAdminRestaurantMenu,
};

export const catalogRepository = selectRepository<CatalogRepository>("catalog", {
    firebase: firebaseCatalogRepository,
    supabase: supabaseCatalogRepository,
});
