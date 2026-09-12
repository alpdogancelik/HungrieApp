import { seedMenuByRestaurantId } from "./restaurantSeeds";

const RESTAURANT_LOGO_PATH_BY_KEY: Record<string, string> = {
    adapizza: "@/assets/restaurantlogo/adapizzalogo.jpg",
    alacarte: "@/assets/restaurantlogo/alacartelogo.jpg",
    alacartecafe: "@/assets/restaurantlogo/alacartelogo.jpg",
    lavish: "@/assets/restaurantlogo/lavishlogo.jpg",
    munchies: "@/assets/restaurantlogo/munchieslogo.jpg",
    root: "@/assets/restaurantlogo/rootlogo.jpg",
    rootkitchencoffee: "@/assets/restaurantlogo/rootlogo.jpg",
    lombard: "@/assets/restaurantlogo/lombardlogo.jpg",
    lombardkitchen: "@/assets/restaurantlogo/lombardlogo.jpg",
    burgerhouse: "@/assets/restaurantlogo/burgerhouselogo.jpg",
    voy: "@/assets/restaurantlogo/voylogo.jpg",
    erto: "@/assets/restaurantlogo/ertologo.jpg",
    ertocafe: "@/assets/restaurantlogo/ertologo.jpg",
};

const normalizeKey = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizeMenuText = (value: unknown) => String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const resolveSeedMenuImageUrl = (restaurantId: string, item: any) => {
    const seedMenu = seedMenuByRestaurantId(String(restaurantId));
    if (!seedMenu.length) return "";
    const itemId = String(item?.id ?? item?.$id ?? "").trim();
    const baseId = itemId.startsWith(`${restaurantId}_`) ? itemId.slice(restaurantId.length + 1) : itemId;
    const byId = baseId ? seedMenu.find((entry) => String(entry.id).trim() === baseId) : null;
    if (byId?.imageUrl) return String(byId.imageUrl);
    const itemName = normalizeMenuText(item?.name);
    const byName = itemName ? seedMenu.find((entry) => normalizeMenuText(entry.name) === itemName) : null;
    return byName?.imageUrl ? String(byName.imageUrl) : "";
};

export const withBundledRestaurantLogo = (restaurant: any) => {
    const candidates = [restaurant?.slug, restaurant?.code, restaurant?.handle, restaurant?.name, restaurant?.id, restaurant?.$id];
    for (const candidate of candidates) {
        const key = normalizeKey(candidate);
        if (!key) continue;
        const exact = RESTAURANT_LOGO_PATH_BY_KEY[key];
        const partial = Object.entries(RESTAURANT_LOGO_PATH_BY_KEY).find(([lookup]) => key.includes(lookup))?.[1];
        if (exact || partial) return { ...restaurant, imageUrl: exact || partial };
    }
    return restaurant;
};
