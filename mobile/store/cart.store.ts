import { Alert } from "react-native";
import { create } from "zustand";
import type { CartCustomization, CartItemType } from "@/src/domain/types";
import { seedMenusAll } from "@/lib/restaurantSeeds";

const MENU_ID_TO_RESTAURANT: Record<string, string> = seedMenusAll.reduce((acc, entry) => {
    acc[String(entry.id)] = entry.restaurantId;
    return acc;
}, {} as Record<string, string>);

const normalizeRestaurantKey = (value?: string | null) => {
    if (!value) return null;
    const key = String(value).toLowerCase();
    const compact = key.replace(/\s+/g, "");

    const lookup: Record<string, string> = {
        "adapizza": "ada-pizza",
        "ada-pizza": "ada-pizza",
        "alacarte": "alacarte-cafe",
        "alacartecafe": "alacarte-cafe",
        "alacarte-cafe": "alacarte-cafe",
        "burgerhouse": "burger-house",
        "burger-house": "burger-house",
        "hotnfresh": "hot-n-fresh",
        "hot-n-fresh": "hot-n-fresh",
        "lavish": "lavish",
        "munchies": "munchies",
        "root": "root-kitchen-coffee",
        "rootkitchencoffee": "root-kitchen-coffee",
        "root-kitchen-coffee": "root-kitchen-coffee",
        "lombard": "lombard-kitchen",
        "lombardkitchen": "lombard-kitchen",
        "lombard-kitchen": "lombard-kitchen",
    };

    if (lookup[compact]) return lookup[compact];
    const dashy = key.replace(/\s+/g, "-");
    if (lookup[dashy]) return lookup[dashy];
    return compact;
};

export interface CartStore {
    items: CartItemType[];
    addItem: (item: Omit<CartItemType, "quantity">) => void;
    removeItem: (id: string, customizations: CartCustomization[]) => void;
    increaseQty: (id: string, customizations: CartCustomization[]) => void;
    decreaseQty: (id: string, customizations: CartCustomization[]) => void;
    clearCart: () => void;
    getTotalItems: () => number;
    getTotalPrice: () => number;
}

function areCustomizationsEqual(a: CartCustomization[] = [], b: CartCustomization[] = []): boolean {
    if (a.length !== b.length) return false;
    const aSorted = [...a].sort((x, y) => x.id.localeCompare(y.id));
    const bSorted = [...b].sort((x, y) => x.id.localeCompare(y.id));
    return aSorted.every((item, idx) => item.id === bSorted[idx].id);
}

type CartLockListener = (message: string) => void;
const lockListeners = new Set<CartLockListener>();

export const subscribeCartLock = (listener: CartLockListener) => {
    lockListeners.add(listener);
    return () => lockListeners.delete(listener);
};

const notifyLock = (message: string) => {
    lockListeners.forEach((fn) => fn(message));
};

export const useCartStore = create<CartStore>((set, get) => ({
    items: [],

    addItem: (item) => {
        const customizations = item.customizations ?? [];
        let items = get().items;

        const resolveExistingRestaurant = () => {
            const explicit = items.find((i) => i.restaurantId)?.restaurantId;
            if (explicit) return normalizeRestaurantKey(explicit);

            const inferred = items
                .map((i) => normalizeRestaurantKey(MENU_ID_TO_RESTAURANT[String(i.id)] || null))
                .find((id): id is string => Boolean(id));
            return inferred || null;
        };

        const resolveIncomingRestaurant = () => {
            const explicit =
                (item as any).restaurantId ??
                (item as any).restaurant_id ??
                (item as any).restaurant?.id ??
                null;
            const mapped = MENU_ID_TO_RESTAURANT[String(item.id)] || null;
            return normalizeRestaurantKey(explicit || mapped);
        };

        let currentRestaurant = resolveExistingRestaurant();
        const incomingRestaurant = resolveIncomingRestaurant();

        // If cart already has items but none are tagged with a restaurant, tag them with the incoming restaurant
        // to enforce single-restaurant constraint going forward.
        if (!currentRestaurant && items.length && incomingRestaurant) {
            set({ items: items.map((entry) => ({ ...entry, restaurantId: incomingRestaurant })) });
            items = get().items;
            currentRestaurant = incomingRestaurant;
        }

        const effectiveRestaurant = incomingRestaurant ?? currentRestaurant ?? undefined;

        const doAdd = () => {
            const normalizedItem = { ...item, restaurantId: effectiveRestaurant, customizations };
            const existing = get().items.find(
                (i) => i.id === normalizedItem.id && areCustomizationsEqual(i.customizations ?? [], customizations),
            );
            if (existing) {
                set({
                    items: get().items.map((i) =>
                        i.id === normalizedItem.id && areCustomizationsEqual(i.customizations ?? [], customizations)
                            ? { ...i, quantity: i.quantity + 1 }
                            : i,
                    ),
                });
            } else {
                set({ items: [...get().items, { ...normalizedItem, quantity: 1 }] });
            }
        };

        const isDifferentRestaurant =
            currentRestaurant && incomingRestaurant && currentRestaurant !== incomingRestaurant;
        const missingRestaurantOnIncoming = currentRestaurant && !incomingRestaurant;
        const missingIdentity = !incomingRestaurant && !currentRestaurant && items.length > 0;

        if (isDifferentRestaurant || missingRestaurantOnIncoming || missingIdentity) {
            const message =
                "Sepette başka bir restoranın ürünü var. Önce sepeti temizle, sonra ekleyebilirsin.";
            Alert.alert("Sepet kilitli", message);
            notifyLock(message);
            return;
        }

        doAdd();
    },

    removeItem: (id, customizations = []) => {
        set({
            items: get().items.filter(
                (i) => !(i.id === id && areCustomizationsEqual(i.customizations ?? [], customizations)),
            ),
        });
    },

    increaseQty: (id, customizations = []) => {
        set({
            items: get().items.map((i) =>
                i.id === id && areCustomizationsEqual(i.customizations ?? [], customizations)
                    ? { ...i, quantity: i.quantity + 1 }
                    : i,
            ),
        });
    },

    decreaseQty: (id, customizations = []) => {
        set({
            items: get().items
                .map((i) =>
                    i.id === id && areCustomizationsEqual(i.customizations ?? [], customizations)
                        ? { ...i, quantity: i.quantity - 1 }
                        : i,
                )
                .filter((i) => i.quantity > 0),
        });
    },

    clearCart: () => set({ items: [] }),

    getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),

    getTotalPrice: () =>
        get().items.reduce((total, item) => {
            const base = item.price;
            const customPrice = item.customizations?.reduce((s: number, c: CartCustomization) => s + c.price, 0) ?? 0;
            return total + item.quantity * (base + customPrice);
        }, 0),
}));
