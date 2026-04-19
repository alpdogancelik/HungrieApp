import Constants from "expo-constants";

const extra: any = Constants.expoConfig?.extra || {};
const env = (name: string) => (typeof process !== "undefined" ? (process as any).env?.[name] : undefined) || extra[name];

const PEXELS_API_KEY = env("EXPO_PUBLIC_PEXELS_API_KEY") || "";

export type PexelsImage = {
    id: string;
    thumb: string;
    full: string;
    alt: string;
    width?: number;
    height?: number;
};

const fallbackImages: PexelsImage[] = [];
const imageSearchCache = new Map<string, Promise<PexelsImage[]>>();
const firstImageUrlCache = new Map<string, Promise<string | null>>();

export const searchFoodImages = async (query: string): Promise<PexelsImage[]> => {
    const safeQuery = query?.trim() || "food";
    const cacheKey = safeQuery.toLowerCase();

    if (imageSearchCache.has(cacheKey)) {
        return imageSearchCache.get(cacheKey)!;
    }

    const request = (async () => {
        if (!PEXELS_API_KEY) {
            if (__DEV__) {
                console.warn("[Pexels] Missing EXPO_PUBLIC_PEXELS_API_KEY. Returning sample images.");
            }
            return fallbackImages;
        }

        const res = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQuery)}&per_page=24&orientation=square`,
            {
            headers: {
                Authorization: PEXELS_API_KEY,
            },
            },
        );

        if (!res.ok) {
            throw new Error(`Pexels error ${res.status}`);
        }

        const data = await res.json();
        if (!data?.photos?.length) {
            return fallbackImages;
        }

        return data.photos.map((photo: any) => ({
            id: String(photo.id),
            thumb: photo.src?.medium || photo.src?.small,
            full: photo.src?.large2x || photo.src?.large || photo.src?.original,
            alt: photo.alt,
            width: photo.width,
            height: photo.height,
        }));
    })();

    imageSearchCache.set(cacheKey, request);
    return request;
};

export const searchFirstFoodImageUrl = async (query: string): Promise<string | null> => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return null;

    if (firstImageUrlCache.has(normalizedQuery)) {
        return firstImageUrlCache.get(normalizedQuery)!;
    }

    const request = (async () => {
        try {
            const images = await searchFoodImages(normalizedQuery);
            const first = images[0];
            return first?.thumb || first?.full || null;
        } catch (error) {
            if (__DEV__) {
                console.warn("[Pexels] Failed to resolve image URL.", error);
            }
            return null;
        }
    })();

    firstImageUrlCache.set(normalizedQuery, request);
    return request;
};

const normalize = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const DEFAULT_FOOD_HINTS = ["food", "meal", "dish", "snack", "pizza", "burger", "fries", "pasta", "dessert", "drink", "chicken"];
const DEFAULT_AVOID_HINTS = [
    "portrait",
    "woman",
    "man",
    "people",
    "person",
    "face",
    "model",
    "street",
    "city",
    "flower",
    "plant",
    "leaf",
    "bird",
    "animal",
    "cat",
    "dog",
    "vehicle",
    "building",
];

export type BestFoodImageOptions = {
    mustInclude?: string[];
    avoid?: string[];
    strict?: boolean;
};

const computeImageScore = (image: PexelsImage, mustInclude: string[], avoid: string[]) => {
    const alt = normalize(image.alt);
    let score = 0;

    for (const foodHint of DEFAULT_FOOD_HINTS) {
        if (alt.includes(foodHint)) score += 2;
    }

    for (const token of mustInclude) {
        if (alt.includes(token)) score += 4;
    }

    for (const token of avoid) {
        if (alt.includes(token)) score -= 5;
    }

    const width = Number(image.width || 0);
    const height = Number(image.height || 0);
    if (width > 0 && height > 0) {
        const ratio = width / height;
        score += Math.max(0, 1 - Math.abs(1 - ratio));
    }

    return { score, alt };
};

export const searchBestFoodImageUrl = async (query: string, options: BestFoodImageOptions = {}): Promise<string | null> => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return null;

    const mustInclude = (options.mustInclude || []).map(normalize).filter(Boolean);
    const avoid = [...DEFAULT_AVOID_HINTS, ...((options.avoid || []).map(normalize).filter(Boolean))];

    try {
        const images = await searchFoodImages(normalizedQuery);
        if (!images.length) return null;

        let best: PexelsImage | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        let bestAlt = "";

        for (const image of images) {
            const { score, alt } = computeImageScore(image, mustInclude, avoid);
            if (score > bestScore) {
                best = image;
                bestScore = score;
                bestAlt = alt;
            }
        }

        if (!best) return null;

        if (mustInclude.length && options.strict) {
            const allMustPresent = mustInclude.every((token) => bestAlt.includes(token));
            if (!allMustPresent) return null;
        }

        if (bestScore < 1) return null;
        return best.thumb || best.full || null;
    } catch (error) {
        if (__DEV__) {
            console.warn("[Pexels] Failed scoring best image.", error);
        }
        return null;
    }
};
