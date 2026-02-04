type RestaurantSeedFile = {
    restaurants?: Array<{
        id: string;
        name: string;
        cuisine?: string;
        description?: string;
        deliveryFee?: number | string;
        deliveryTime?: string;
        imageUrl?: string;
        ownerId?: string;
        isActive?: boolean;
        address?: string;
    }>;
    categories?: Array<{ id: string; name: string }>;
    menus?: Array<{
        id?: string;
        name: string;
        description?: string;
        price: number | string;
        restaurantId?: string;
        categories?: string[];
        imageUrl?: string;
    }>;
};

type SeedBundle = {
    id: string;
    seed: RestaurantSeedFile;
};

// Static JSON seeds used while Firebase / API are not wired.
// Each file mirrors the Firestore export for a single restaurant.
const adaSeed = require("@/data/ada-pizza-firestore.json") as RestaurantSeedFile;
const alacarteSeed = require("@/data/alacarte-cafe-firestore.json") as RestaurantSeedFile;
const hotnfreshSeed = require("@/data/hotnfresh-firestore.json") as RestaurantSeedFile;
const lavishSeed = require("@/data/lavish-firestore.json") as RestaurantSeedFile;
const munchiesSeed = require("@/data/munchies-firestore.json") as RestaurantSeedFile;
const rootSeed = require("@/data/root-firestore.json") as RestaurantSeedFile;
const lombardSeed = require("@/data/lombard-firestore.json") as RestaurantSeedFile;
const burgerSeed = require("@/data/burgerhouse-firestore.json") as RestaurantSeedFile;

const bundles: SeedBundle[] = [
    { id: "ada-pizza", seed: adaSeed },
    { id: "alacarte-cafe", seed: alacarteSeed },
    { id: "hot-n-fresh", seed: hotnfreshSeed },
    { id: "lavish", seed: lavishSeed },
    { id: "munchies", seed: munchiesSeed },
    { id: "root-kitchen-coffee", seed: rootSeed },
    { id: "lombard-kitchen", seed: lombardSeed },
    { id: "burgerhouse", seed: burgerSeed },
];

export type SeedRestaurant = {
    id: string;
    name: string;
    cuisine?: string;
    description?: string;
    deliveryFee?: number;
    deliveryTime?: string;
    imageUrl?: string;
    isActive?: boolean;
};

const coerceNumber = (value: unknown) => {
    const num = typeof value === "string" ? Number(value.replace(/[^\d.,-]/g, "").replace(",", ".")) : Number(value);
    return Number.isFinite(num) ? num : undefined;
};

export const seedRestaurants: SeedRestaurant[] = bundles
    .map((bundle): SeedRestaurant | null => {
        const restaurant = bundle.seed.restaurants?.[0];
        if (!restaurant) return null;
        return {
            id: restaurant.id || bundle.id,
            name: restaurant.name || bundle.id,
            cuisine: restaurant.cuisine,
            description: restaurant.description,
            deliveryFee: coerceNumber(restaurant.deliveryFee),
            deliveryTime: restaurant.deliveryTime || "20-30",
            imageUrl: restaurant.imageUrl,
            isActive: restaurant.isActive !== false,
        };
    })
    .filter((r): r is SeedRestaurant => r !== null);

export type SeedMenuItem = {
    id: string;
    name: string;
    description?: string;
    price: number;
    restaurantId: string;
    categories?: string[];
    imageUrl?: string;
};

const normalizeMenuForBundle = (bundle: SeedBundle): SeedMenuItem[] => {
    const restaurantId = bundle.seed.restaurants?.[0]?.id || bundle.id;
    if (!restaurantId) return [];
    return (bundle.seed.menus || []).map((entry, index) => ({
        id: entry.id || `${restaurantId}-menu-${index + 1}`,
        name: entry.name,
        description: entry.description,
        price: Number(entry.price ?? 0),
        restaurantId,
        categories: Array.isArray(entry.categories) ? entry.categories : entry.categories ? [entry.categories] : [],
        imageUrl: entry.imageUrl,
    }));
};

const normalizedMenuByRestaurant: Record<string, SeedMenuItem[]> = bundles.reduce(
    (acc, bundle) => {
        const list = normalizeMenuForBundle(bundle);
        const restaurantId = bundle.seed.restaurants?.[0]?.id || bundle.id;
        if (restaurantId && list.length) {
            acc[restaurantId] = list;
        }
        return acc;
    },
    {} as Record<string, SeedMenuItem[]>,
);

export const seedMenusAll: SeedMenuItem[] = Object.values(normalizedMenuByRestaurant).flat();

export const seedMenuByRestaurantId = (restaurantId: string): SeedMenuItem[] =>
    normalizedMenuByRestaurant[restaurantId] || [];

const categoriesByRestaurant: Record<string, { id: string; name: string }[]> = bundles.reduce(
    (acc, bundle) => {
        const restaurantId = bundle.seed.restaurants?.[0]?.id || bundle.id;
        if (!restaurantId) return acc;
        const cats = bundle.seed.categories || [];
        acc[restaurantId] = cats.map((cat, index) => ({
            id: cat.id || `${restaurantId}-cat-${index + 1}`,
            name: cat.name,
        }));
        return acc;
    },
    {} as Record<string, { id: string; name: string }[]>,
);

export const seedCategoriesByRestaurantId = (restaurantId: string) => categoriesByRestaurant[restaurantId] || [];
