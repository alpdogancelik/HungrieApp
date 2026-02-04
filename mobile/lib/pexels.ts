import Constants from "expo-constants";

const extra: any = Constants.expoConfig?.extra || {};
const env = (name: string) => (typeof process !== "undefined" ? (process as any).env?.[name] : undefined) || extra[name];

const PEXELS_API_KEY = env("EXPO_PUBLIC_PEXELS_API_KEY") || "";

export type PexelsImage = {
    id: string;
    thumb: string;
    full: string;
    alt: string;
};

const fallbackImages: PexelsImage[] = [];

export const searchFoodImages = async (query: string): Promise<PexelsImage[]> => {
    const safeQuery = query?.trim() || "food";

    if (!PEXELS_API_KEY) {
        if (__DEV__) {
            console.warn("[Pexels] Missing EXPO_PUBLIC_PEXELS_API_KEY. Returning sample images.");
        }
        return fallbackImages;
    }

    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQuery)}&per_page=12`, {
        headers: {
            Authorization: PEXELS_API_KEY,
        },
    });

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
    }));
};
