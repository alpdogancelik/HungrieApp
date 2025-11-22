const ADA_LOGO = require("@/assets/restaurantlogo/adapizzalogo.jpeg");
const ALA_LOGO = require("@/assets/restaurantlogo/alacartelogo.jpeg");
const HNF_LOGO = require("@/assets/restaurantlogo/hotnfreshlogo.jpeg");
const LOMBARD_LOGO = require("@/assets/restaurantlogo/lombardlogo.jpg.jpg");
const BURGER_LOGO = require("@/assets/restaurantlogo/burgerhouselogo.jpeg");

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

const MENU_PHOTOS = [
    "https://images.unsplash.com/photo-1548365328-49f67499b4fb?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1608039829574-7d0174b8cd48?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1541592106381-b31e1d25224a?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1473093226795-af9932fe5856?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&q=60",
];

const cleanText = (value: string | undefined, fallback: string) => {
    const raw = value?.toString().trim();
    if (!raw) return fallback;
    const sanitized = raw.replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
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
    if (raw && !raw.startsWith("@/")) return raw;
    return resolveAssetUri(asset, fallback);
};

// Static JSON requires to avoid dynamic require issues on web/Expo.
const adaSeedJson = require("@/data/ada-pizza-firestore.json") as RestaurantSeedFile;
const alacarteSeedJson = require("@/data/alacarte-cafe-firestore.json") as RestaurantSeedFile;
const hotnfreshSeedJson = require("@/data/hotnfresh-firestore.json") as RestaurantSeedFile;
const lombardSeedJson = require("@/data/lombard-firestore.json") as RestaurantSeedFile;
const burgerhouseSeedJson = require("@/data/burgerhouse-firestore.json") as RestaurantSeedFile;

const seedBundles: SeedBundle[] = [
    {
        key: "ada-pizza",
        seed: adaSeedJson as RestaurantSeedFile,
        logoAsset: ADA_LOGO,
        fallbackImage: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=60",
        rating: 4.9,
        reviewCount: 218,
    },
    {
        key: "alacarte-cafe",
        seed: alacarteSeedJson as RestaurantSeedFile,
        logoAsset: ALA_LOGO,
        fallbackImage: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&q=60",
        rating: 4.7,
        reviewCount: 162,
    },
    {
        key: "hot-n-fresh",
        seed: hotnfreshSeedJson as RestaurantSeedFile,
        logoAsset: HNF_LOGO,
        fallbackImage: "https://images.unsplash.com/photo-1606756790138-261c234c83cd?auto=format&fit=crop&w=800&q=60",
        rating: 4.8,
        reviewCount: 184,
    },
    {
        key: "lombard-kitchen",
        seed: lombardSeedJson as RestaurantSeedFile,
        logoAsset: LOMBARD_LOGO,
        fallbackImage: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60",
        rating: 4.6,
        reviewCount: 140,
    },
    {
        key: "burgerhouse",
        seed: burgerhouseSeedJson as RestaurantSeedFile,
        logoAsset: BURGER_LOGO,
        fallbackImage: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=60",
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
        imageUrl: item.imageUrl || MENU_PHOTOS[index % MENU_PHOTOS.length],
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
