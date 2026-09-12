import type { CartCustomization, CartItemType } from "@/src/domain/types";

export type ReorderUnavailableReason =
    | "missing_product_id"
    | "product_unavailable"
    | "customization_changed"
    | "invalid_quantity";

export type ReorderUnavailableItem = {
    name: string;
    reason: ReorderUnavailableReason;
};

export type ReorderResolution = {
    restaurantId: string;
    restaurantName: string;
    cartItems: CartItemType[];
    unavailableItems: ReorderUnavailableItem[];
};

export class ReorderError extends Error {
    readonly code: "restaurant_unavailable" | "menu_unavailable";

    constructor(code: "restaurant_unavailable" | "menu_unavailable") {
        super(code);
        this.name = "ReorderError";
        this.code = code;
    }
}

const historicalItems = (order: any): any[] =>
    Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];

const stableMenuItemId = (item: any) => {
    const value = item?.menuItemId ?? item?.menu_item_id ?? item?.itemId ?? item?.item_id;
    return value === null || value === undefined ? "" : String(value).trim();
};

const currentMenuItemId = (item: any) => String(item?.id ?? item?.$id ?? "").trim();

const currentCustomizationPrice = (option: any) => {
    const direct = Number(option?.price);
    if (Number.isFinite(direct)) return direct;
    const kurus = Number(option?.price_kurus);
    return Number.isFinite(kurus) ? kurus / 100 : 0;
};

const resolveCustomizations = (historical: any, current: any): CartCustomization[] | null => {
    const previous = Array.isArray(historical?.customizations) ? historical.customizations : [];
    if (!previous.length) return [];

    const available = Array.isArray(current?.customizations) ? current.customizations : [];
    const byId = new Map(available.map((option: any) => [String(option?.id || "").trim(), option]));
    const resolved: CartCustomization[] = [];

    for (const oldOption of previous) {
        const optionId = String(oldOption?.id ?? oldOption?.optionId ?? oldOption?.option_id ?? "").trim();
        if (!optionId) return null;
        const currentOption = byId.get(optionId) as any;
        if (!currentOption) return null;
        resolved.push({
            id: optionId,
            name: String(currentOption.name || ""),
            price: currentCustomizationPrice(currentOption),
            type: currentOption.type ? String(currentOption.type) : undefined,
        });
    }

    return resolved;
};

const isMenuItemAvailable = (item: any) =>
    item &&
    item.visible !== false &&
    item.isActive !== false &&
    item.is_active !== false &&
    item.available !== false &&
    item.isAvailable !== false &&
    item.soldOut !== true &&
    item.sold_out !== true &&
    item.inStock !== false;

const isRestaurantOrderable = (restaurant: any) => {
    const status = String(restaurant?.status || "").trim().toLowerCase();
    return restaurant &&
        restaurant.isActive !== false &&
        restaurant.is_active !== false &&
        restaurant.visible !== false &&
        restaurant.acceptingOrders !== false &&
        !["closed", "inactive", "disabled", "offline", "kapalı", "kapali"].includes(status);
};

export const resolveOrderAgainstCurrentBundle = (order: any, bundle: any): ReorderResolution => {
    const restaurantId = String(order?.restaurantId ?? order?.restaurant_id ?? "").trim();
    if (!restaurantId) throw new ReorderError("restaurant_unavailable");

    const restaurant = bundle?.restaurant;
    if (!bundle || !isRestaurantOrderable(restaurant)) {
        throw new ReorderError("restaurant_unavailable");
    }

    if (!Array.isArray(bundle.items)) throw new ReorderError("menu_unavailable");
    const currentById = new Map<string, any>(bundle.items.map((item: any) => [currentMenuItemId(item), item]));
    const cartItems: CartItemType[] = [];
    const unavailableItems: ReorderUnavailableItem[] = [];

    for (const historical of historicalItems(order)) {
        const name = String(historical?.name || "").trim() || "Menu item";
        const menuItemId = stableMenuItemId(historical);
        if (!menuItemId) {
            unavailableItems.push({ name, reason: "missing_product_id" });
            continue;
        }

        const current = currentById.get(menuItemId);
        const currentPrice = Number(current?.price);
        if (!isMenuItemAvailable(current) || !Number.isFinite(currentPrice) || currentPrice < 0) {
            unavailableItems.push({ name, reason: "product_unavailable" });
            continue;
        }

        const rawQuantity = Number(historical?.quantity ?? 1);
        const quantity = Math.trunc(rawQuantity);
        const maximumQuantity = Number(current?.maximumQuantity ?? current?.maxQuantity ?? current?.max_quantity);
        if (!Number.isFinite(rawQuantity) || quantity < 1 || (Number.isFinite(maximumQuantity) && quantity > maximumQuantity)) {
            unavailableItems.push({ name, reason: "invalid_quantity" });
            continue;
        }

        const customizations = resolveCustomizations(historical, current);
        if (!customizations) {
            unavailableItems.push({ name, reason: "customization_changed" });
            continue;
        }

        cartItems.push({
            id: menuItemId,
            name: String(current.name || name),
            price: currentPrice,
            image_url: String(current.image_url || current.imageUrl || ""),
            quantity,
            restaurantId,
            customizations,
        });
    }

    return {
        restaurantId,
        restaurantName: String(restaurant.name || order?.restaurantName || "Restaurant"),
        cartItems,
        unavailableItems,
    };
};

export const resolveOrderForReorder = async (order: any): Promise<ReorderResolution> => {
    const restaurantId = String(order?.restaurantId ?? order?.restaurant_id ?? "").trim();
    if (!restaurantId) throw new ReorderError("restaurant_unavailable");
    const { getRestaurantBundle } = await import("@/src/data/menuRepository");
    return resolveOrderAgainstCurrentBundle(order, await getRestaurantBundle(restaurantId));
};
