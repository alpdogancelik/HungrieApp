const ADA_LOGO = require("@/assets/restaurantlogo/adapizzalogo.jpg");
const ALA_LOGO = require("@/assets/restaurantlogo/alacartelogo.jpg");
const HNF_LOGO = require("@/assets/restaurantlogo/hotnfreshlogo.jpg");
const LAVISH_LOGO = require("@/assets/restaurantlogo/lavishlogo.jpg");
const MUNCHIES_LOGO = require("@/assets/restaurantlogo/munchieslogo.jpg");
const ROOT_LOGO = require("@/assets/restaurantlogo/rootlogo.jpg");
const LOMBARD_LOGO = require("@/assets/restaurantlogo/lombardlogo.jpg");
const BURGER_LOGO = require("@/assets/restaurantlogo/burgerhouselogo.jpg");

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
    key: string;
    seed: RestaurantSeedFile;
    logoAsset: any;
    fallbackImage: string;
    rating: number;
    reviewCount: number;
};

// Menu items intentionally left without photos; only restaurant logos are shown in UI.
const MENU_PHOTOS: string[] = [];

const TURKISH_CHAR_MAP: Record<string, string> = {
    "\u00e7": "c",
    "\u00c7": "C",
    "\u011f": "g",
    "\u011e": "G",
    "\u0131": "i",
    "\u0130": "I",
    "\u00f6": "o",
    "\u00d6": "O",
    "\u015f": "s",
    "\u015e": "S",
    "\u00fc": "u",
    "\u00dc": "U",
};

const normalizeToAscii = (value: string) =>
    value
        .replace(/[\u00e7\u00c7\u011f\u011e\u0131\u0130\u00f6\u00d6\u015f\u015e\u00fc\u00dc]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();



const cleanText = (value: string | undefined, fallback: string) => {
    const raw = value?.toString().trim();
    if (!raw) return fallback;
    const sanitized = normalizeToAscii(raw);
    return sanitized || fallback;
};

const formatFee = (value?: number | string) => Number(value ?? 0).toFixed(2);

const ensureDescription = (name: string, description?: string) =>
    cleanText(description, `${name} on campus.`) || `${name} on campus.`;

const ensureCategories = (categories?: string[]) => (categories && categories.length ? categories : ["featured"]);

const resolveAssetUri = (asset: any, fallback: string) => {
    try {
        const { Image: RNImage } = require("react-native");
        return RNImage.resolveAssetSource(asset)?.uri || fallback;
    } catch {
        return fallback;
    }
};

const resolveImageUrl = (raw: string | undefined, asset: any, fallback: string) => {
    // Always prefer bundled assets for restaurant logos; ignore external URLs.
    if (asset) return asset;
    return resolveAssetUri(asset, fallback);
};

// Static JSON requires to avoid dynamic require issues on web/Expo.
const adaSeedJson = require("@/data/ada-pizza-firestore.json") as RestaurantSeedFile;
const alacarteSeedJson = require("@/data/alacarte-cafe-firestore.json") as RestaurantSeedFile;
const hotnfreshSeedJson = require("@/data/hotnfresh-firestore.json") as RestaurantSeedFile;
const lavishSeedJson = require("@/data/lavish-firestore.json") as RestaurantSeedFile;
const munchiesSeedJson = require("@/data/munchies-firestore.json") as RestaurantSeedFile;
const rootSeedJson = require("@/data/root-firestore.json") as RestaurantSeedFile;
const lombardSeedJson = require("@/data/lombard-firestore.json") as RestaurantSeedFile;
const burgerhouseSeedJson = require("@/data/burgerhouse-firestore.json") as RestaurantSeedFile;

const seedBundles: SeedBundle[] = [
    {
        key: "ada-pizza",
        seed: adaSeedJson as RestaurantSeedFile,
        logoAsset: ADA_LOGO,
        fallbackImage: "",
        rating: 4.9,
        reviewCount: 218,
    },
    {
        key: "alacarte-cafe",
        seed: alacarteSeedJson as RestaurantSeedFile,
        logoAsset: ALA_LOGO,
        fallbackImage: "",
        rating: 4.7,
        reviewCount: 162,
    },
    {
        key: "hot-n-fresh",
        seed: hotnfreshSeedJson as RestaurantSeedFile,
        logoAsset: HNF_LOGO,
        fallbackImage: "",
        rating: 4.8,
        reviewCount: 184,
    },
    {
        key: "lavish",
        seed: lavishSeedJson as RestaurantSeedFile,
        logoAsset: LAVISH_LOGO,
        fallbackImage: "",
        rating: 4.6,
        reviewCount: 132,
    },
    {
        key: "munchies",
        seed: munchiesSeedJson as RestaurantSeedFile,
        logoAsset: MUNCHIES_LOGO,
        fallbackImage: "",
        rating: 4.5,
        reviewCount: 118,
    },
    {
        key: "root-kitchen-coffee",
        seed: rootSeedJson as RestaurantSeedFile,
        logoAsset: ROOT_LOGO,
        fallbackImage: "",
        rating: 4.7,
        reviewCount: 164,
    },
    {
        key: "lombard-kitchen",
        seed: lombardSeedJson as RestaurantSeedFile,
        logoAsset: LOMBARD_LOGO,
        fallbackImage: "",
        rating: 4.6,
        reviewCount: 140,
    },
    {
        key: "burgerhouse",
        seed: burgerhouseSeedJson as RestaurantSeedFile,
        logoAsset: BURGER_LOGO,
        fallbackImage: "",
        rating: 4.5,
        reviewCount: 96,
    },
];

type NormalizedSeed = {
    restaurantId: string;
    restaurantCard: {
        id: string;
        name: string;
        cuisine?: string;
        rating?: number;
        reviewCount?: number;
        deliveryTime?: string;
        deliveryFee?: string;
        imageUrl?: string;
        description?: string;
        ownerId?: string;
        isActive?: boolean;
    };
    categories: { id: string; name: string }[];
    menu: any[];
    ownerId: string;
};

const normalizeSeed = (bundle: SeedBundle): NormalizedSeed | null => {
    const restaurant = bundle.seed.restaurants?.[0];
    if (!restaurant) return null;

    const id = restaurant.id || bundle.key;
    const imageUrl = resolveImageUrl(restaurant.imageUrl, bundle.logoAsset, bundle.fallbackImage);
    const ownerId = restaurant.ownerId || `${id}-owner`;

    const categories = (bundle.seed.categories || []).map((category, index) => ({
        id: `${id}-${category.id || index + 1}`,
        name: cleanText(category.name, `Category ${index + 1}`),
    }));

    const menu = (bundle.seed.menus || []).map((item, index) => ({
        id: item.id || `${id}-menu-${index + 1}`,
        $id: item.id || `${id}-menu-${index + 1}`,
        name: cleanText(item.name, `Menu item ${index + 1}`),
        description: ensureDescription(cleanText(item.name, "Menu"), item.description),
        price: Number(item.price ?? 0),
        restaurantId: id,
        categories: ensureCategories(item.categories),
        imageUrl: "", // menu images disabled; use logo-only experience
    }));

    const restaurantCard = {
        id,
        name: cleanText(restaurant.name, id),
        cuisine: cleanText(restaurant.cuisine, "Fast Food"),
        description: ensureDescription(cleanText(restaurant.name, id), restaurant.description),
        deliveryFee: formatFee(restaurant.deliveryFee),
        deliveryTime: restaurant.deliveryTime || "20-30",
        imageUrl,
        rating: bundle.rating,
        reviewCount: bundle.reviewCount,
        ownerId,
        isActive: restaurant.isActive !== false,
    };

    return { restaurantId: id, restaurantCard, categories, menu, ownerId };
};

const normalizedSeeds = seedBundles
    .map(normalizeSeed)
    .filter((seed): seed is NormalizedSeed => Boolean(seed && seed.restaurantCard));

export const sampleRestaurants = normalizedSeeds.map((seed) => seed.restaurantCard);

export const sampleCategories: Record<string, { id: string; name: string }[]> = normalizedSeeds.reduce(
    (acc, seed) => {
        acc[seed.restaurantId] = seed.categories;
        return acc;
    },
    {} as Record<string, { id: string; name: string }[]>,
);

export const sampleMenu: Record<string, any[]> = normalizedSeeds.reduce(
    (acc, seed) => {
        acc[seed.restaurantId] = seed.menu;
        return acc;
    },
    {} as Record<string, any[]>,
);

export const sampleOwnerRestaurants = normalizedSeeds.map((seed) => ({
    id: seed.restaurantId,
    ownerId: seed.ownerId,
    name: seed.restaurantCard.name,
    description: seed.restaurantCard.description,
    cuisine: seed.restaurantCard.cuisine,
    deliveryFee: seed.restaurantCard.deliveryFee,
    deliveryTime: seed.restaurantCard.deliveryTime,
    imageUrl: seed.restaurantCard.imageUrl,
    isActive: seed.restaurantCard.isActive ?? true,
}));

export const sampleRestaurantOwners = normalizedSeeds.map((seed) => ({
    id: seed.ownerId,
    name: `${seed.restaurantCard.name} Owner`,
    email: `${seed.restaurantCard.id}@partners.hungrie`,
    password: `${seed.restaurantCard.id.replace(/[^a-zA-Z0-9]/g, "") || "Owner"}#2024`,
    restaurantIds: [seed.restaurantId],
    avatar: seed.restaurantCard.imageUrl,
}));

const buildOrders = () => {
    const orders: any[] = [];
    normalizedSeeds.forEach((seed, index) => {
        const menuItem = seed.menu[0];
        const fallbackTotal = Number(menuItem?.price ?? 0) + 49.9;
        orders.push({
            id: `${seed.restaurantId}-order-${index + 1}`,
            restaurantId: seed.restaurantId,
            restaurant: {
                id: seed.restaurantId,
                name: seed.restaurantCard.name,
                imageUrl: seed.restaurantCard.imageUrl,
            },
            customerName: "Campus Dorm",
            address: "Main Dorms",
            status: index % 2 === 0 ? "preparing" : "pending",
            total: fallbackTotal.toFixed(2),
            paymentMethod: "card",
            orderItems: menuItem ? [{ name: menuItem.name, quantity: 1 }] : [],
            createdAt: new Date(Date.now() - 3600_000 * (index + 1)).toISOString(),
            updatedAt: new Date(Date.now() - 1800_000 * (index + 1)).toISOString(),
        });
    });
    return orders;
};

export const sampleOrders = buildOrders();
export const sampleRestaurantOrders = sampleOrders;

export const sampleCourierList = [
    { id: "courier_1", name: "Mehmet", vehicle: "Bike", status: "Available" },
    { id: "courier_2", name: "Ayse", vehicle: "Motorbike", status: "Delivering" },
];

export const sampleAddresses = [
    {
        id: "address-1",
        label: "Dorm A - Room 204",
        line1: "Campus Residences",
        block: "Block A",
        room: "Room 204",
        city: "Kalkanli",
        country: "TRNC",
        isDefault: true,
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
        id: "address-2",
        label: "Library",
        line1: "Main Library",
        block: "Study Wing 3",
        room: undefined,
        city: "Kalkanli",
        country: "TRNC",
        isDefault: false,
        createdAt: new Date(Date.now() - 7200_000).toISOString(),
    },
];









