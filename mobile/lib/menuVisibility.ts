import { storage } from "@/src/lib/storage";

const STORAGE_KEY = "restaurant_menu_visibility";

type VisibilityMap = Record<string, Record<string, boolean>>;

let cachedMap: VisibilityMap | null = null;

const readMap = async (): Promise<VisibilityMap> => {
    if (cachedMap) return cachedMap;
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
        cachedMap = {};
        return cachedMap;
    }
    try {
        const parsed = JSON.parse(raw);
        cachedMap = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        cachedMap = {};
    }
    return cachedMap ?? {};
};

const writeMap = async (map: VisibilityMap) => {
    cachedMap = map;
    await storage.setItem(STORAGE_KEY, JSON.stringify(map));
};

export const getHiddenItemsForRestaurant = async (restaurantId: string) => {
    const map = await readMap();
    return map[restaurantId] ?? {};
};

export const setMenuItemVisibility = async (restaurantId: string, itemId: string, visible: boolean) => {
    const map = await readMap();
    const restaurantMap = { ...(map[restaurantId] ?? {}) };
    if (visible) {
        delete restaurantMap[itemId];
    } else {
        restaurantMap[itemId] = true;
    }
    const nextMap = { ...map };
    if (Object.keys(restaurantMap).length) {
        nextMap[restaurantId] = restaurantMap;
    } else {
        delete nextMap[restaurantId];
    }
    await writeMap(nextMap);
};

const shouldHide = (map: VisibilityMap, item: any) => {
    const restaurantId = String(item.restaurantId ?? item.restaurant_id ?? item.restaurant?.id ?? "");
    if (!restaurantId) return false;
    const restaurantMap = map[restaurantId];
    if (!restaurantMap) return false;
    const menuId = String(item.$id ?? item.id ?? item.name);
    return Boolean(restaurantMap[menuId]);
};

export const filterMenuForCustomer = async (items: any[]) => {
    const map = await readMap();
    return items.filter((item) => !shouldHide(map, item));
};

export const filterRestaurantMenuForCustomer = async (restaurantId: string, items: any[]) => {
    if (!restaurantId) return items;
    const hidden = await getHiddenItemsForRestaurant(restaurantId);
    return items.filter((item) => {
        const menuId = String(item.$id ?? item.id ?? item.name);
        return !hidden[menuId];
    });
};

export const clearMenuVisibilityCache = () => {
    cachedMap = null;
};
