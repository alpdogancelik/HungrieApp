import type { CartCustomization, CartItemType } from "@/src/domain/types";

export type CartLineItem = CartItemType & {
    lineKey: string;
    unitPrice: number;
};

export type CartMutation = {
    items: CartLineItem[];
    itemCountDelta: number;
    priceDelta: number;
    changed: boolean;
};

const finiteMoney = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const canonicalizeCustomizations = (customizations: CartCustomization[] = []) =>
    [...customizations].sort((left, right) => {
        const idOrder = String(left.id).localeCompare(String(right.id));
        if (idOrder !== 0) return idOrder;
        return String(left.type || "").localeCompare(String(right.type || ""));
    });

export const createCartLineKey = (id: string, customizations: CartCustomization[] = []) => {
    const customizationKey = canonicalizeCustomizations(customizations)
        .map((entry) => `${String(entry.id)}:${String(entry.type || "")}`)
        .join("|");
    return `${String(id)}::${customizationKey}`;
};

export const normalizeCartLine = (item: CartItemType): CartLineItem => {
    const customizations = canonicalizeCustomizations(item.customizations ?? []);
    const unitPrice = finiteMoney(item.price) + customizations.reduce((sum, entry) => sum + finiteMoney(entry.price), 0);
    return {
        ...item,
        id: String(item.id),
        price: finiteMoney(item.price),
        quantity: Math.max(0, Math.trunc(finiteMoney(item.quantity))),
        customizations,
        lineKey: createCartLineKey(String(item.id), customizations),
        unitPrice,
    };
};

export const normalizeCartLines = (items: CartItemType[] = []) => items
    .map(normalizeCartLine)
    .filter((item) => item.quantity > 0);

export const summarizeCartLines = (items: CartLineItem[]) => items.reduce(
    (summary, item) => ({
        totalItems: summary.totalItems + item.quantity,
        totalPrice: summary.totalPrice + item.quantity * item.unitPrice,
    }),
    { totalItems: 0, totalPrice: 0 },
);

export const setCartLineQuantity = (
    items: CartLineItem[],
    incoming: Omit<CartItemType, "quantity">,
    requestedQuantity: number,
): CartMutation => {
    const normalizedIncoming = normalizeCartLine({ ...incoming, quantity: 1 });
    const index = items.findIndex((entry) => entry.lineKey === normalizedIncoming.lineKey);
    const existing = index >= 0 ? items[index] : null;
    const previousQuantity = existing?.quantity ?? 0;
    const nextQuantity = Math.max(0, Math.trunc(finiteMoney(requestedQuantity)));

    if (previousQuantity === nextQuantity) {
        return { items, itemCountDelta: 0, priceDelta: 0, changed: false };
    }

    const itemCountDelta = nextQuantity - previousQuantity;
    const unitPrice = existing?.unitPrice ?? normalizedIncoming.unitPrice;
    const nextItems = [...items];

    if (nextQuantity === 0) {
        if (index < 0) return { items, itemCountDelta: 0, priceDelta: 0, changed: false };
        nextItems.splice(index, 1);
    } else if (existing) {
        nextItems[index] = { ...existing, quantity: nextQuantity };
    } else {
        nextItems.push({ ...normalizedIncoming, quantity: nextQuantity });
    }

    return {
        items: nextItems,
        itemCountDelta,
        priceDelta: itemCountDelta * unitPrice,
        changed: true,
    };
};

export const changeCartLineQuantity = (
    items: CartLineItem[],
    id: string,
    customizations: CartCustomization[] = [],
    delta: number,
): CartMutation => {
    const lineKey = createCartLineKey(id, customizations);
    const existing = items.find((entry) => entry.lineKey === lineKey);
    if (!existing) return { items, itemCountDelta: 0, priceDelta: 0, changed: false };
    return setCartLineQuantity(items, existing, existing.quantity + delta);
};

export const removeCartLine = (
    items: CartLineItem[],
    id: string,
    customizations: CartCustomization[] = [],
) => changeCartLineQuantity(items, id, customizations, -Number.MAX_SAFE_INTEGER);
