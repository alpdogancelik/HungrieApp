const RESTAURANT_LOGO_MAP: Record<string, number> = {
    "@/assets/restaurantlogo/adapizzalogo.jpg": require("@/assets/restaurantlogo/adapizzalogo.jpg"),
    "@/assets/restaurantlogo/alacartelogo.jpg": require("@/assets/restaurantlogo/alacartelogo.jpg"),
    "@/assets/restaurantlogo/hotnfreshlogo.jpg": require("@/assets/restaurantlogo/hotnfreshlogo.jpg"),
    "@/assets/restaurantlogo/lavishlogo.jpg": require("@/assets/restaurantlogo/lavishlogo.jpg"),
    "@/assets/restaurantlogo/munchieslogo.jpg": require("@/assets/restaurantlogo/munchieslogo.jpg"),
    "@/assets/restaurantlogo/rootlogo.jpg": require("@/assets/restaurantlogo/rootlogo.jpg"),
    "@/assets/restaurantlogo/lombardlogo.jpg": require("@/assets/restaurantlogo/lombardlogo.jpg"),
    "@/assets/restaurantlogo/burgerhouselogo.jpg": require("@/assets/restaurantlogo/burgerhouselogo.jpg"),
};

const RESTAURANT_LOGO_BY_FILE: Record<string, number> = {
    adapizzalogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/adapizzalogo.jpg"],
    alacartelogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/alacartelogo.jpg"],
    hotnfreshlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/hotnfreshlogo.jpg"],
    lavishlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/lavishlogo.jpg"],
    munchieslogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/munchieslogo.jpg"],
    rootlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/rootlogo.jpg"],
    lombardlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/lombardlogo.jpg"],
    burgerhouselogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/burgerhouselogo.jpg"],
};

const FALLBACK_RESTAURANT_IMAGE = RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/adapizzalogo.jpg"];

type ExpoImageSource = number | { uri: string };

export const resolveRestaurantImageSource = (value?: string | number | null) => {
    if (value && typeof value === "object") {
        const uriLike = (value as any).uri ?? (value as any).default?.uri ?? null;
        if (typeof uriLike === "string" && uriLike.trim().length) {
            return uriLike;
        }
    }
    if (typeof value === "number") return value;
    if (typeof value !== "string") return FALLBACK_RESTAURANT_IMAGE;
    const trimmed = value.trim();
    if (!trimmed) return FALLBACK_RESTAURANT_IMAGE;
    const lowered = trimmed.toLowerCase();
    if (
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("data:") ||
        trimmed.startsWith("file://") ||
        lowered.startsWith("//")
    ) {
        return trimmed;
    }
    const localAsset = RESTAURANT_LOGO_MAP[trimmed];
    if (localAsset) return localAsset;

    const fileName = trimmed.split("/").pop()?.split(".")[0];
    if (fileName) {
        const byFile = RESTAURANT_LOGO_BY_FILE[fileName];
        if (byFile) return byFile;
    }

    const containsMatch = Object.entries(RESTAURANT_LOGO_BY_FILE).find(([key]) => trimmed.includes(key));
    if (containsMatch) return containsMatch[1];

    // Prevent invalid URI errors when a local asset path leaks into runtime.
    if (trimmed.startsWith("@/assets/restaurantlogo/")) return FALLBACK_RESTAURANT_IMAGE;
    return FALLBACK_RESTAURANT_IMAGE;
};

export const getRestaurantImageSource = (
    value?: string | number | { uri?: string } | null,
    fallback: ExpoImageSource = FALLBACK_RESTAURANT_IMAGE,
): ExpoImageSource => {
    const resolved = resolveRestaurantImageSource(value as any);
    if (typeof resolved === "number") return resolved;
    if (typeof resolved === "string" && resolved.trim()) {
        return { uri: resolved.trim() };
    }
    return fallback;
};
