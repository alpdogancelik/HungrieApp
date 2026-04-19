const RESTAURANT_LOGO_MAP: Record<string, number> = {
    "@/assets/restaurantlogo/adapizzalogo.jpg": require("@/assets/restaurantlogo/adapizzalogo.jpg"),
    "@/assets/restaurantlogo/alacartelogo.jpg": require("@/assets/restaurantlogo/alacartelogo.jpg"),
    "@/assets/restaurantlogo/lavishlogo.jpg": require("@/assets/restaurantlogo/lavishlogo.jpg"),
    "@/assets/restaurantlogo/munchieslogo.jpg": require("@/assets/restaurantlogo/munchieslogo.jpg"),
    "@/assets/restaurantlogo/rootlogo.jpg": require("@/assets/restaurantlogo/rootlogo.jpg"),
    "@/assets/restaurantlogo/lombardlogo.jpg": require("@/assets/restaurantlogo/lombardlogo.jpg"),
    "@/assets/restaurantlogo/burgerhouselogo.jpg": require("@/assets/restaurantlogo/burgerhouselogo.jpg"),
};

const RESTAURANT_LOGO_BY_FILE: Record<string, number> = {
    adapizzalogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/adapizzalogo.jpg"],
    alacartelogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/alacartelogo.jpg"],
    lavishlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/lavishlogo.jpg"],
    munchieslogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/munchieslogo.jpg"],
    rootlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/rootlogo.jpg"],
    lombardlogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/lombardlogo.jpg"],
    burgerhouselogo: RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/burgerhouselogo.jpg"],
};

const FALLBACK_RESTAURANT_IMAGE = RESTAURANT_LOGO_MAP["@/assets/restaurantlogo/adapizzalogo.jpg"];
const RESTAURANT_LOGO_BY_HINT: Record<string, number> = {
    "ada-pizza": RESTAURANT_LOGO_BY_FILE.adapizzalogo,
    adapizza: RESTAURANT_LOGO_BY_FILE.adapizzalogo,
    "ala-carte-cafe": RESTAURANT_LOGO_BY_FILE.alacartelogo,
    alacarte: RESTAURANT_LOGO_BY_FILE.alacartelogo,
    "alacarte-cafe": RESTAURANT_LOGO_BY_FILE.alacartelogo,
    lavish: RESTAURANT_LOGO_BY_FILE.lavishlogo,
    munchies: RESTAURANT_LOGO_BY_FILE.munchieslogo,
    root: RESTAURANT_LOGO_BY_FILE.rootlogo,
    "root-kitchen-coffee": RESTAURANT_LOGO_BY_FILE.rootlogo,
    lombard: RESTAURANT_LOGO_BY_FILE.lombardlogo,
    "lombard-kitchen": RESTAURANT_LOGO_BY_FILE.lombardlogo,
    burgerhouse: RESTAURANT_LOGO_BY_FILE.burgerhouselogo,
    "burger-house": RESTAURANT_LOGO_BY_FILE.burgerhouselogo,
};

type ExpoImageSource = number | { uri: string };

const normalizeHint = (value?: string | null) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const resolveByHint = (hint?: string | null) => {
    const normalized = normalizeHint(hint);
    if (!normalized) return null;
    const direct = RESTAURANT_LOGO_BY_HINT[normalized];
    if (direct) return direct;

    // Real-world hints can include random ids like "<docId>-burger-house".
    const entries = Object.entries(RESTAURANT_LOGO_BY_HINT).sort((a, b) => b[0].length - a[0].length);
    const contains = entries.find(([key]) => normalized.includes(key));
    if (contains) return contains[1];

    const compact = normalized.replace(/-/g, "");
    const compactContains = entries.find(([key]) => compact.includes(key.replace(/-/g, "")));
    if (compactContains) return compactContains[1];

    return null;
};

export const resolveRestaurantImageSource = (value?: string | number | null, hint?: string | null) => {
    const byHint = resolveByHint(hint);
    // Force deterministic per-restaurant logos when we can infer restaurant id/name.
    if (byHint) return byHint;

    if (value && typeof value === "object") {
        const uriLike = (value as any).uri ?? (value as any).default?.uri ?? null;
        if (typeof uriLike === "string" && uriLike.trim().length) {
            return uriLike;
        }
    }
    if (typeof value === "number") return value;
    if (typeof value !== "string") {
        return FALLBACK_RESTAURANT_IMAGE;
    }
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
    const isLocalRestaurantLogoPath =
        trimmed.startsWith("@/assets/restaurantlogo/") || lowered.includes("restaurantlogo/");

    // If backend stored an incorrect static local logo path, prefer deterministic mapping by id/name hint.
    if (isLocalRestaurantLogoPath && byHint) return byHint;

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
    hint?: string | null,
): ExpoImageSource => {
    const resolved = resolveRestaurantImageSource(value as any, hint);
    if (typeof resolved === "number") return resolved;
    if (typeof resolved === "string" && resolved.trim()) {
        return { uri: resolved.trim() };
    }
    if (resolved && typeof resolved === "object") {
        const uriLike = (resolved as any).uri ?? (resolved as any).default?.uri ?? null;
        if (typeof uriLike === "string" && uriLike.trim()) {
            return { uri: uriLike.trim() };
        }
        return resolved as ExpoImageSource;
    }
    return fallback;
};
