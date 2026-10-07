import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Alert, AppState, Platform } from "react-native";
import { create } from "zustand";
import type { CartCustomization, CartItemType } from "@/src/domain/types";
import useAuthStore from "@/store/auth.store";
import { auth } from "@/lib/firebase";
import i18n from "@/src/lib/i18n";
import {
    changeCartLineQuantity,
    createCartLineKey,
    normalizeCartLines,
    removeCartLine,
    setCartLineQuantity,
    summarizeCartLines,
    type CartLineItem,
} from "@/store/cartModel";
import { createCartHydrationGuard, encodeOwnedCart } from "@/store/cartIdentity";

export const normalizeCartRestaurantKey = (value?: string | null) => {
    if (!value) return null;
    const key = String(value).toLowerCase();
    const compact = key.replace(/\s+/g, "");
    const lookup: Record<string, string> = {
        adapizza: "ada-pizza", "ada-pizza": "ada-pizza",
        alacarte: "alacarte-cafe", alacartecafe: "alacarte-cafe", "alacarte-cafe": "alacarte-cafe",
        burgerhouse: "burger-house", "burger-house": "burger-house",
        lavish: "lavish", munchies: "munchies",
        root: "root-kitchen-coffee", rootkitchencoffee: "root-kitchen-coffee", "root-kitchen-coffee": "root-kitchen-coffee",
        lombard: "lombard-kitchen", lombardkitchen: "lombard-kitchen", "lombard-kitchen": "lombard-kitchen",
    };
    if (lookup[compact]) return lookup[compact];
    const dashy = key.replace(/\s+/g, "-");
    return lookup[dashy] || compact;
};

const resolveItemRestaurant = (item: Omit<CartItemType, "quantity">) => {
    const compatibleItem = item as typeof item & { restaurant_id?: string; restaurant?: { id?: string } };
    return normalizeCartRestaurantKey(
        item.restaurantId ?? compatibleItem.restaurant_id ?? compatibleItem.restaurant?.id ??
        null,
    );
};

const inferCartRestaurant = (items: CartLineItem[]) => {
    const explicit = items.find((item) => item.restaurantId)?.restaurantId;
    if (explicit) return normalizeCartRestaurantKey(explicit);
    return null;
};

// Coalesce rapid taps into one persisted write. Storage operations are serialized
// so an older account's delayed write cannot land after a new identity binds.
const CART_STORAGE_KEY = "hungrie-cart";
let pendingWrite: string | null = null;
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
let storageOperations = Promise.resolve();
const serializeStorage = <T>(operation: () => Promise<T>) => {
    const result = storageOperations.then(operation, operation);
    storageOperations = result.then(() => undefined, () => undefined);
    return result;
};
const flushCartPersistence = async () => {
    if (persistenceTimer) clearTimeout(persistenceTimer);
    persistenceTimer = null;
    const value = pendingWrite;
    pendingWrite = null;
    if (value !== null) await serializeStorage(() => AsyncStorage.setItem(CART_STORAGE_KEY, value));
};
const queueCartPersistence = (ownerUid: string, items: CartLineItem[]) => {
    pendingWrite = JSON.stringify(encodeOwnedCart(ownerUid, items));
    if (persistenceTimer) clearTimeout(persistenceTimer);
    persistenceTimer = setTimeout(() => void flushCartPersistence().catch(() => undefined), 120);
};
const discardPendingCartWrite = () => {
    if (persistenceTimer) clearTimeout(persistenceTimer);
    persistenceTimer = null;
    pendingWrite = null;
};
if (Platform.OS !== "web") {
    AppState.addEventListener("change", (state) => {
        if (state !== "active" && pendingWrite !== null) void flushCartPersistence().catch(() => undefined);
    });
}

export interface CartStore {
    items: CartLineItem[];
    totalItems: number;
    totalPrice: number;
    restaurantId: string | null;
    ownerUid: string | null;
    identityReady: boolean;
    addItem: (item: Omit<CartItemType, "quantity">) => void;
    addItems: (items: CartItemType[], options?: { replaceExisting?: boolean }) => boolean;
    setItemQuantity: (item: Omit<CartItemType, "quantity">, quantity: number) => void;
    removeItem: (id: string, customizations: CartCustomization[]) => void;
    increaseQty: (id: string, customizations: CartCustomization[]) => void;
    decreaseQty: (id: string, customizations: CartCustomization[]) => void;
    clearCart: () => void;
    getTotalItems: () => number;
    getTotalPrice: () => number;
}

type CartLockListener = (message: string) => void;
const lockListeners = new Set<CartLockListener>();
export const subscribeCartLock = (listener: CartLockListener) => {
    lockListeners.add(listener);
    return () => lockListeners.delete(listener);
};
const notifyLock = (message: string) => lockListeners.forEach((listener) => listener(message));

const requireSignedIn = () => {
    const cart = useCartStore.getState();
    const uid = auth?.currentUser?.uid || "";
    if (useAuthStore.getState().isAuthenticated && cart.identityReady && cart.ownerUid === uid) return true;
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    Alert.alert(
        isTurkish ? "Giriş gerekli" : "Sign in required",
        isTurkish ? "Sepetine ürün eklemek için lütfen giriş yap veya hesap oluştur."
            : "Please sign in or create an account to add items to your cart.",
    );
    router.push("/sign-in");
    return false;
};

const emptyCart = { items: [] as CartLineItem[], totalItems: 0, totalPrice: 0, restaurantId: null };

const normalizePersistedCartLines = (rawItems: CartLineItem[]) => {
    if (rawItems.some((item) => !item || typeof item !== "object")) return [];
    try {
        return normalizeCartLines(rawItems);
    } catch {
        return [];
    }
};

export const useCartStore = create<CartStore>()(
        (set, get) => {
            const commit = (next: Pick<CartStore, "items" | "totalItems" | "totalPrice" | "restaurantId">) => {
                const state = get();
                const currentUid = auth?.currentUser?.uid || "";
                if (
                    !useAuthStore.getState().isAuthenticated ||
                    !state.identityReady ||
                    !state.ownerUid ||
                    state.ownerUid !== currentUid
                ) return;
                set(next);
                queueCartPersistence(state.ownerUid, next.items);
            };
            const setQuantity = (item: Omit<CartItemType, "quantity">, quantity: number) => {
                if (!requireSignedIn()) return;
                const state = get();
                const incomingRestaurant = resolveItemRestaurant(item);
                const currentRestaurant = state.restaurantId ?? inferCartRestaurant(state.items);
                if (
                    (currentRestaurant && incomingRestaurant && currentRestaurant !== incomingRestaurant) ||
                    (currentRestaurant && !incomingRestaurant) ||
                    (!incomingRestaurant && !currentRestaurant && state.items.length > 0)
                ) {
                    const message = "Sepette başka bir restoranın ürünü var. Önce sepeti temizle, sonra ekleyebilirsin.";
                    Alert.alert("Sepet kilitli", message);
                    notifyLock(message);
                    return;
                }

                const effectiveRestaurant = incomingRestaurant ?? currentRestaurant ?? undefined;
                const needsBackfill = !currentRestaurant && state.items.length > 0 && Boolean(effectiveRestaurant);
                const baseItems = needsBackfill
                    ? state.items.map((entry) => ({ ...entry, restaurantId: effectiveRestaurant }))
                    : state.items;
                const mutation = setCartLineQuantity(baseItems, { ...item, restaurantId: effectiveRestaurant }, quantity);
                if (!mutation.changed && !needsBackfill) return;
                commit({
                    items: mutation.items,
                    totalItems: Math.max(0, state.totalItems + mutation.itemCountDelta),
                    totalPrice: Math.max(0, state.totalPrice + mutation.priceDelta),
                    restaurantId: mutation.items.length ? effectiveRestaurant ?? currentRestaurant : null,
                });
            };

            const applyExistingMutation = (
                mutate: (items: CartLineItem[]) => ReturnType<typeof changeCartLineQuantity>,
            ) => {
                const state = get();
                const mutation = mutate(state.items);
                if (!mutation.changed) return;
                commit({
                    items: mutation.items,
                    totalItems: Math.max(0, state.totalItems + mutation.itemCountDelta),
                    totalPrice: Math.max(0, state.totalPrice + mutation.priceDelta),
                    restaurantId: mutation.items.length ? state.restaurantId : null,
                });
            };

            return {
                ...emptyCart, ownerUid: null, identityReady: false,
                addItem: (item) => {
                    const lineKey = createCartLineKey(String(item.id), item.customizations ?? []);
                    const current = get().items.find((entry) => entry.lineKey === lineKey);
                    setQuantity(item, (current?.quantity ?? 0) + 1);
                },
                addItems: (incomingItems, options = {}) => {
                    if (!requireSignedIn() || !incomingItems.length) return false;

                    const state = get();
                    const incomingRestaurants = Array.from(new Set(
                        incomingItems.map((item) => resolveItemRestaurant(item)).filter((value): value is string => Boolean(value)),
                    ));
                    if (incomingRestaurants.length !== 1) return false;

                    const incomingRestaurant = incomingRestaurants[0];
                    const currentRestaurant = state.restaurantId ?? inferCartRestaurant(state.items);
                    if (state.items.length > 0 && currentRestaurant !== incomingRestaurant && !options.replaceExisting) {
                        notifyLock(i18n.language?.toLowerCase().startsWith("tr")
                            ? "Sepette başka bir restoranın ürünü var. Önce sepeti temizle, sonra ekleyebilirsin."
                            : "Your cart contains items from another restaurant. Clear it before adding these items.");
                        return false;
                    }

                    let nextItems = options.replaceExisting ? [] : state.items;
                    for (const item of incomingItems) {
                        const normalizedItem = { ...item, restaurantId: incomingRestaurant };
                        const lineKey = createCartLineKey(String(normalizedItem.id), normalizedItem.customizations ?? []);
                        const existingQuantity = nextItems.find((entry) => entry.lineKey === lineKey)?.quantity ?? 0;
                        nextItems = setCartLineQuantity(nextItems, normalizedItem, existingQuantity + item.quantity).items;
                    }

                    commit({
                        items: nextItems,
                        ...summarizeCartLines(nextItems),
                        restaurantId: incomingRestaurant,
                    });
                    return true;
                },
                setItemQuantity: setQuantity,
                removeItem: (id, customizations = []) =>
                    applyExistingMutation((items) => removeCartLine(items, id, customizations)),
                increaseQty: (id, customizations = []) =>
                    applyExistingMutation((items) => changeCartLineQuantity(items, id, customizations, 1)),
                decreaseQty: (id, customizations = []) =>
                    applyExistingMutation((items) => changeCartLineQuantity(items, id, customizations, -1)),
                clearCart: () => commit(emptyCart),
                getTotalItems: () => get().totalItems,
                getTotalPrice: () => get().totalPrice,
            };
        },
);

const cartHydration = createCartHydrationGuard<CartLineItem>({
    read: async () => {
        await storageOperations;
        return AsyncStorage.getItem(CART_STORAGE_KEY);
    },
    remove: async () => {
        discardPendingCartWrite();
        await serializeStorage(() => AsyncStorage.removeItem(CART_STORAGE_KEY));
    },
    lock: () => useCartStore.setState({ ...emptyCart, ownerUid: null, identityReady: false }),
    commit: ({ ownerUid, items: rawItems }) => {
        if (ownerUid && (
            !useAuthStore.getState().isAuthenticated ||
            auth?.currentUser?.uid !== ownerUid
        )) return;
        const items = normalizePersistedCartLines(rawItems);
        useCartStore.setState({
            items,
            ...summarizeCartLines(items),
            restaurantId: inferCartRestaurant(items),
            ownerUid,
            identityReady: true,
        });
    },
});

export const invalidateCartIdentity = () => {
    discardPendingCartWrite();
    cartHydration.invalidate();
};

export const bindCartToIdentity = async (uid: string | null) => {
    discardPendingCartWrite();
    await cartHydration.bind(uid);
};

export const destroyCartForSessionBoundary = async () => {
    // bind(null) locks memory synchronously before attempting local storage I/O.
    // Even a storage failure therefore cannot expose the previous cart in UI.
    await bindCartToIdentity(null);
};
