const normalizeToken = (value?: string | null) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

const REVIEWABLE_STATUS_TOKENS = new Set(["delivered", "completed", "teslim edildi", "teslimedildi"]);
const NON_REVIEWABLE_STATUS_TOKENS = new Set([
    "pending",
    "preparing",
    "ready",
    "accepted",
    "rejected",
    "reddedildi",
    "canceled",
    "cancelled",
    "iptal edildi",
    "iptaledildi",
]);
const CANCELLED_STATUS_TOKENS = new Set(["canceled", "cancelled", "iptal edildi", "iptaledildi", "iptal", "rejected", "reddedildi"]);

const normalizeId = (value: unknown) => String(value ?? "").trim();

type ExistingReviewLookup = Set<string> | Map<string, unknown> | Record<string, unknown> | string[];

export type ReviewOrderItem = {
    itemId: string;
    itemName: string;
    quantity: number;
};

const hasExistingReview = (lookup: ExistingReviewLookup, reviewId: string) => {
    if (!reviewId) return false;
    if (lookup instanceof Set) return lookup.has(reviewId);
    if (lookup instanceof Map) return lookup.has(reviewId);
    if (Array.isArray(lookup)) return lookup.includes(reviewId);
    return Boolean((lookup as Record<string, unknown>)[reviewId]);
};

export const isReviewableStatus = (status?: string | null) => {
    const token = normalizeToken(status);
    if (!token) return false;
    if (NON_REVIEWABLE_STATUS_TOKENS.has(token) || NON_REVIEWABLE_STATUS_TOKENS.has(token.replace(/\s+/g, ""))) {
        return false;
    }
    return REVIEWABLE_STATUS_TOKENS.has(token) || REVIEWABLE_STATUS_TOKENS.has(token.replace(/\s+/g, ""));
};

export const isDeliveredStatus = (status?: string | null) => isReviewableStatus(status);

export const isCancelledStatus = (status?: string | null) => {
    const token = normalizeToken(status);
    if (!token) return false;
    return CANCELLED_STATUS_TOKENS.has(token) || CANCELLED_STATUS_TOKENS.has(token.replace(/\s+/g, ""));
};

export const getProductReviewId = (orderId: string, menuItemId: string, userId: string) =>
    `${normalizeId(orderId)}__${normalizeId(menuItemId)}__${normalizeId(userId)}`;

export const getOrderReviewItems = (order: any): ReviewOrderItem[] => {
    const rawItems = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
    const mergedByItemId = new Map<string, ReviewOrderItem>();

    for (const item of rawItems) {
        const itemId = normalizeId(item?.menuItemId ?? item?.itemId ?? item?.id);
        if (!itemId) continue;

        const current = mergedByItemId.get(itemId);
        const quantity = Math.max(1, Number(item?.quantity ?? 1));
        const itemName = normalizeId(item?.name) || current?.itemName || "Urun";

        if (current) {
            mergedByItemId.set(itemId, {
                ...current,
                itemName: current.itemName || itemName,
                quantity: current.quantity + quantity,
            });
            continue;
        }

        mergedByItemId.set(itemId, {
            itemId,
            itemName,
            quantity,
        });
    }

    return Array.from(mergedByItemId.values());
};

export const getPendingReviewItems = (order: any, existingReviews: ExistingReviewLookup, userIdOverride?: string) => {
    const orderId = normalizeId(order?.id ?? order?.orderId);
    const userId = normalizeId(userIdOverride ?? order?.userId);
    if (!orderId || !userId) return [];

    return getOrderReviewItems(order).filter(
        (item) => !hasExistingReview(existingReviews, getProductReviewId(orderId, item.itemId, userId)),
    );
};
