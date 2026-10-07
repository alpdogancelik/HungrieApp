import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRemotePushSupported, NotificationManager } from "@/src/features/notifications/NotificationManager";
import { autoCancelExpiredPendingOrders, subscribeLatestOrderSummary } from "@/src/data/orderRepository";
import { getRepositoryBackend } from "@/src/data/backendFlags";
import i18n from "@/src/lib/i18n";
import {
    clearOwnedOrderStatusMap,
    loadOwnedOrderStatusMap,
    saveOwnedOrderStatusMap,
    type PersistedOrderStatusMap,
} from "./orderStatusPersistence";

type NormalizedOrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "canceled";
type StatusMap = PersistedOrderStatusMap;
const KNOWN_STATUSES: NormalizedOrderStatus[] = [
    "pending",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "canceled",
];

const normalizeStatus = (value?: string | null): NormalizedOrderStatus => {
    const raw = String(value || "").toLowerCase();
    if (raw === "accepted") return "preparing";
    if (raw === "rejected") return "canceled";
    if (KNOWN_STATUSES.includes(raw as NormalizedOrderStatus)) {
        return raw as NormalizedOrderStatus;
    }
    return "pending";
};

const getRestaurantName = (order: any) =>
    String(order?.restaurant?.name || order?.restaurantName || order?.restaurantId || "Restoran");

const toNotification = (order: any, status: NormalizedOrderStatus) => {
    const restaurantName = getRestaurantName(order);
    if (i18n.language?.split("-")[0] !== "tr") {
        const english = {
            pending: ["Order received", "Your order is waiting for restaurant approval."],
            preparing: ["Order accepted", "Your order is being prepared."],
            ready: ["Order ready", "Your order is ready for courier pickup."],
            out_for_delivery: ["Order on the way", "Your order is out for delivery."],
            delivered: ["Order delivered", "Enjoy your meal."],
            canceled: ["Order canceled", "Your order was canceled."],
        } as const;
        const [title, body] = english[status];
        return { title, body: `${restaurantName}: ${body}` };
    }
    switch (status) {
        case "pending":
            return {
                title: "Sipariş alındı",
                body: `${restaurantName} onayı bekleniyor.`,
            };
        case "preparing":
            return {
                title: "Sipariş onaylandı",
                body: `${restaurantName} siparişini hazırlıyor.`,
            };
        case "ready":
            return {
                title: "Sipariş hazır",
                body: "Kurye teslim almak üzere yönlendirildi.",
            };
        case "out_for_delivery":
            return {
                title: "Sipariş yolda",
                body: "Siparişin yolda, kurye sana yaklaşıyor.",
            };
        case "delivered":
            return {
                title: "Sipariş teslim edildi",
                body: "Afiyet olsun.",
            };
        case "canceled":
            return {
                title: "Sipariş onaylanmadı",
                body: `${restaurantName} siparişi reddetti.`,
            };
        default:
            return {
                title: "Sipariş güncellendi",
                body: `${restaurantName} sipariş durumunu güncelledi.`,
            };
    }
};

type WatcherDependencies = {
    storage: typeof AsyncStorage;
    subscribe: typeof subscribeLatestOrderSummary;
    backend: typeof getRepositoryBackend;
    autoCancel: typeof autoCancelExpiredPendingOrders;
    remotePushSupported: typeof isRemotePushSupported;
    notify: typeof NotificationManager.notifyLocal;
};

const defaultDependencies: WatcherDependencies = {
    storage: AsyncStorage,
    subscribe: subscribeLatestOrderSummary,
    backend: getRepositoryBackend,
    autoCancel: autoCancelExpiredPendingOrders,
    remotePushSupported: isRemotePushSupported,
    notify: NotificationManager.notifyLocal.bind(NotificationManager),
};

export const clearOrderStatusForIdentity = async (ownerUid: string) => {
    await clearOwnedOrderStatusMap(AsyncStorage, ownerUid).catch(() => undefined);
};

export const createOrderStatusWatcher = (dependencies: WatcherDependencies) => (userId: string) => {
    let active = true;
    let primed = false;
    let statusMap: StatusMap = {};
    const autoCancelingIds = new Set<string>();

    const init = async () => {
        const stored = await loadOwnedOrderStatusMap(dependencies.storage, userId);
        if (!active) return;
        statusMap = stored;

        const unsubscribe = dependencies.subscribe(userId, (latestOrder: any | null) => {
            const orders = latestOrder ? [latestOrder] : [];
            if (!active) return;
            const list = Array.isArray(orders) ? orders : [];
            if (dependencies.backend("order") === "firebase") {
                void dependencies.autoCancel(list, {
                    inFlightIds: autoCancelingIds,
                    onError: (error) => {
                        console.warn("[orders] Failed to auto-cancel expired pending order", error);
                    },
                });
            }

            if (!primed) {
                const initialMap = { ...statusMap };
                list.forEach((order) => {
                    const orderId = String(order?.id || "");
                    if (!orderId) return;
                    initialMap[orderId] = normalizeStatus(order?.status);
                });
                statusMap = initialMap;
                primed = true;
                void saveOwnedOrderStatusMap(dependencies.storage, userId, statusMap).catch(() => undefined);
                return;
            }

            const nextMap = { ...statusMap };
            let hasChanges = false;

            list.forEach((order) => {
                const orderId = String(order?.id || "");
                if (!orderId) return;
                const nextStatus = normalizeStatus(order?.status);
                const prevStatus = statusMap[orderId];
                nextMap[orderId] = nextStatus;

                if (!prevStatus) {
                    hasChanges = true;
                    return;
                }

                if (prevStatus !== nextStatus && !dependencies.remotePushSupported()) {
                    const payload = toNotification(order, nextStatus);
                    void dependencies.notify(payload.title, payload.body, {
                        withSound: true,
                        channelId: NotificationManager.ORDER_STATUS_CHANNEL_ID,
                        soundName: NotificationManager.SYSTEM_DEFAULT_SOUND,
                        data: {
                            type: "order_status",
                            orderId,
                            status: nextStatus,
                        },
                    });
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                statusMap = nextMap;
                void saveOwnedOrderStatusMap(dependencies.storage, userId, statusMap).catch(() => undefined);
            }
        });

        if (!active) {
            unsubscribe();
            return;
        }

        stopRef = () => {
            active = false;
            unsubscribe();
        };
    };

    let stopRef: (() => void) | null = null;
    void init();

    return () => {
        active = false;
        stopRef?.();
    };
};

export const startOrderStatusWatcher = createOrderStatusWatcher(defaultDependencies);

export default startOrderStatusWatcher;
