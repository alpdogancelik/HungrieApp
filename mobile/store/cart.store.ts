import { create } from "zustand";
import type { CartCustomization, CartItemType } from "@/src/domain/types";
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

export const useCartStore = create<CartStore>((set, get) => ({
    items: [],

    addItem: (item) => {
        const customizations = item.customizations ?? [];
        const existing = get().items.find((i) => i.id === item.id && areCustomizationsEqual(i.customizations ?? [], customizations));
        if (existing) {
            set({ items: get().items.map((i) => i.id === item.id && areCustomizationsEqual(i.customizations ?? [], customizations) ? { ...i, quantity: i.quantity + 1 } : i) });
        } else {
            set({ items: [...get().items, { ...item, quantity: 1, customizations }] });
        }
    },

    removeItem: (id, customizations = []) => {
        set({ items: get().items.filter((i) => !(i.id === id && areCustomizationsEqual(i.customizations ?? [], customizations))) });
    },

    increaseQty: (id, customizations = []) => {
        set({ items: get().items.map((i) => (i.id === id && areCustomizationsEqual(i.customizations ?? [], customizations) ? { ...i, quantity: i.quantity + 1 } : i)) });
    },

    decreaseQty: (id, customizations = []) => {
        set({ items: get().items.map((i) => (i.id === id && areCustomizationsEqual(i.customizations ?? [], customizations) ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0) });
    },

    clearCart: () => set({ items: [] }),

    getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),

    getTotalPrice: () => get().items.reduce((total, item) => {
        const base = item.price;
        const customPrice = item.customizations?.reduce((s: number, c: CartCustomization) => s + c.price, 0) ?? 0;
        return total + item.quantity * (base + customPrice);
    }, 0),
}));
