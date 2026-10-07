type MinimumOrderRestaurant = {
    minimumOrderKurus?: unknown;
    minimum_order_kurus?: unknown;
    minimumOrderAmount?: unknown;
    minimumOrder?: unknown;
    minOrderAmount?: unknown;
    minBasketAmount?: unknown;
} | null | undefined;

const nonNegativeSafeInteger = (value: unknown): number | null => {
    if (typeof value === "string" && /^\d+$/.test(value.trim())) value = Number(value.trim());
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
};

const tryAmountToKurus = (value: unknown): number | null => {
    if (typeof value === "string") {
        const normalized = value.trim().replace(",", ".");
        if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
        value = Number(normalized);
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    const kurus = Math.round(value * 100);
    return Number.isSafeInteger(kurus) ? kurus : null;
};

export const minimumOrderKurusFromRestaurant = (restaurant: MinimumOrderRestaurant): number | null => {
    if (!restaurant) return null;
    if (restaurant.minimumOrderKurus !== undefined) return nonNegativeSafeInteger(restaurant.minimumOrderKurus);
    if (restaurant.minimum_order_kurus !== undefined) return nonNegativeSafeInteger(restaurant.minimum_order_kurus);

    // Compatibility for server-derived catalog records that still expose TRY.
    const legacyValue = restaurant.minimumOrderAmount ?? restaurant.minimumOrder ??
        restaurant.minOrderAmount ?? restaurant.minBasketAmount;
    return legacyValue === undefined ? null : tryAmountToKurus(legacyValue);
};

export const subtotalTryToKurus = (subtotal: unknown): number | null => tryAmountToKurus(subtotal);

export type MinimumOrderState =
    | { status: "unavailable"; minimumKurus: null; subtotalKurus: number | null; remainingKurus: null }
    | { status: "below" | "met"; minimumKurus: number; subtotalKurus: number; remainingKurus: number };

export const getMinimumOrderState = (restaurant: MinimumOrderRestaurant, subtotalTry: unknown): MinimumOrderState => {
    const minimumKurus = minimumOrderKurusFromRestaurant(restaurant);
    const subtotalKurus = subtotalTryToKurus(subtotalTry);
    if (minimumKurus === null || subtotalKurus === null) {
        return { status: "unavailable", minimumKurus: null, subtotalKurus, remainingKurus: null };
    }
    const remainingKurus = Math.max(0, minimumKurus - subtotalKurus);
    return { status: remainingKurus > 0 ? "below" : "met", minimumKurus, subtotalKurus, remainingKurus };
};

export const kurusToTry = (kurus: number) => kurus / 100;
