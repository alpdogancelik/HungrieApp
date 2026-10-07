export type PersistedOrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "canceled";
export type PersistedOrderStatusMap = Record<string, PersistedOrderStatus>;

type Storage = {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
};

const LEGACY_STORAGE_KEY = "@hungrie/notifications/order-status-map";
const STORAGE_PREFIX = "@hungrie/notifications/order-status-map/v2:";
const VERSION = 2;
const STATUSES = new Set<PersistedOrderStatus>([
    "pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled",
]);

export const orderStatusStorageKey = (ownerUid: string) => `${STORAGE_PREFIX}${encodeURIComponent(ownerUid)}`;

export const parseOwnedOrderStatusMap = (raw: string | null, expectedOwnerUid: string): PersistedOrderStatusMap => {
    if (!raw || !expectedOwnerUid) return {};
    try {
        const parsed = JSON.parse(raw) as { version?: unknown; ownerUid?: unknown; statuses?: unknown };
        if (parsed?.version !== VERSION || parsed.ownerUid !== expectedOwnerUid || !parsed.statuses || typeof parsed.statuses !== "object" || Array.isArray(parsed.statuses)) return {};
        const statuses: PersistedOrderStatusMap = {};
        for (const [orderId, status] of Object.entries(parsed.statuses)) {
            if (!orderId || typeof status !== "string" || !STATUSES.has(status as PersistedOrderStatus)) return {};
            statuses[orderId] = status as PersistedOrderStatus;
        }
        return statuses;
    } catch {
        return {};
    }
};

export const loadOwnedOrderStatusMap = async (storage: Storage, ownerUid: string) => {
    // The v1 key has no trustworthy owner. Delete it, never claim it for the
    // identity that happens to be active during an upgrade.
    await storage.removeItem(LEGACY_STORAGE_KEY).catch(() => undefined);
    const raw = await storage.getItem(orderStatusStorageKey(ownerUid)).catch(() => null);
    return parseOwnedOrderStatusMap(raw, ownerUid);
};

export const saveOwnedOrderStatusMap = async (storage: Storage, ownerUid: string, statuses: PersistedOrderStatusMap) => {
    if (!ownerUid) return;
    await storage.setItem(orderStatusStorageKey(ownerUid), JSON.stringify({ version: VERSION, ownerUid, statuses }));
};

export const clearOwnedOrderStatusMap = async (storage: Storage, ownerUid: string) => {
    if (!ownerUid) return;
    await storage.removeItem(orderStatusStorageKey(ownerUid));
};

export const ORDER_STATUS_LEGACY_KEY = LEGACY_STORAGE_KEY;
