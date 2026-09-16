import type { CartItemType } from "@/src/domain/types";

export const ORANGE = "#FF5A00";
export const MINIMUM_ORDER_TOTAL = 250;
export const MAX_NOTES = 200;
export const FOOTER_CONTENT_HEIGHT = 82;

const RESTAURANT_ALIASES: Record<string, string> = {
    adapizza: "ada-pizza", "ada-pizza": "ada-pizza",
    alacarte: "alacarte-cafe", alacartecafe: "alacarte-cafe", "alacarte-cafe": "alacarte-cafe",
    burgerhouse: "burger-house", "burger-house": "burger-house",
    lavish: "lavish", munchies: "munchies",
    root: "root-kitchen-coffee", rootkitchencoffee: "root-kitchen-coffee", "root-kitchen-coffee": "root-kitchen-coffee",
    lombard: "lombard-kitchen", lombardkitchen: "lombard-kitchen", "lombard-kitchen": "lombard-kitchen",
    voy: "voy", erto: "erto-cafe", ertocafe: "erto-cafe", "erto-cafe": "erto-cafe",
};

export const stringifyId = (value: unknown) => value === null || value === undefined ? "" : String(value);

export const normalizeRestaurantId = (value: unknown) => {
    const raw = stringifyId(value).trim().toLowerCase();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, "");
    return RESTAURANT_ALIASES[compact] || RESTAURANT_ALIASES[raw.replace(/\s+/g, "-")] || compact;
};

export const resolveCartRestaurantId = (items: CartItemType[]) => {
    const explicit = items.find((item) => item.restaurantId)?.restaurantId;
    if (explicit) return normalizeRestaurantId(explicit);
    return null;
};

export const cartLineKey = (item: CartItemType) => {
    const customizations = (item.customizations || []).map((option) => String(option.id)).sort().join("_");
    return customizations ? `${item.id}-${customizations}` : String(item.id);
};

export type Recommendation = {
    id: string;
    name: string;
    price: number;
    description?: string;
    imageUrl?: string;
    restaurantId: string;
};

const isRecommendation = (item: any) => {
    const categories = Array.isArray(item?.categories) ? item.categories.join(" ") : String(item?.categories || item?.category || item?.category_name || "");
    const text = `${categories} ${item?.name || ""}`.toLocaleLowerCase("tr-TR");
    return /drink|içecek|icecek|cola|kola|ayran|fries|patates|side|yan ürün|yan urun/.test(text);
};

export const extractRecommendations = (menu: any[], restaurantId: string, cartIds: Set<string>): Recommendation[] => menu
    .filter((item) => isRecommendation(item) && !cartIds.has(String(item?.id)))
    .map((item) => ({
        id: String(item.id || item.$id || ""),
        name: String(item.name || ""),
        price: Number(item.price || 0),
        description: item.description ? String(item.description) : undefined,
        imageUrl: item.imageUrl || item.image_url || undefined,
        restaurantId: String(item.restaurantId || restaurantId),
    }))
    .filter((item) => item.id && item.name && Number.isFinite(item.price));

export const parseNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};

export const restaurantRating = (restaurant: any) => {
    const value = parseNumber(restaurant?.ratingAverage ?? restaurant?.rating);
    return value && value > 0 ? value.toFixed(1) : null;
};

export const restaurantReviewCount = (restaurant: any) =>
    Math.max(0, Math.round(parseNumber(restaurant?.ratingCount ?? restaurant?.reviewCount ?? restaurant?.reviewsCount) ?? 0));

export const restaurantEta = (restaurant: any, turkish: boolean) => {
    const minimum = parseNumber(restaurant?.deliveryEtaMin);
    const maximum = parseNumber(restaurant?.deliveryEtaMax);
    if (minimum !== null && maximum !== null) return `${Math.round(minimum)}–${Math.round(maximum)} ${turkish ? "dk" : "min"}`;
    const range = String(restaurant?.deliveryTime || restaurant?.eta || "").match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) return `${range[1]}–${range[2]} ${turkish ? "dk" : "min"}`;
    return turkish ? "25–35 dk" : "25–35 min";
};

const clockMinutes = (value: unknown) => {
    const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};

export const isRestaurantOpenForOrdering = (restaurant: any) => {
    const status = String(restaurant?.status || "").trim().toLowerCase();
    if (restaurant?.isActive === false || restaurant?.isOpen === false || ["closed", "kapalı", "kapali", "inactive", "disabled", "offline"].includes(status)) return false;
    const opens = clockMinutes(restaurant?.openingTime || restaurant?.opening_time);
    const closes = clockMinutes(restaurant?.closingTime || restaurant?.closing_time);
    if (opens === null || closes === null || opens === closes) return true;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    return opens < closes ? current >= opens && current < closes : current >= opens || current < closes;
};
