import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { subscribeUserOrders } from "@/src/services/firebaseOrders";

type NormalizedOrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "canceled";
type StatusMap = Record<string, NormalizedOrderStatus>;

const STORAGE_KEY = "@hungrie/notifications/order-status-map";
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

const parseStoredMap = (value: string | null): StatusMap => {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value) as Record<string, string>;
        const next: StatusMap = {};
        Object.entries(parsed || {}).forEach(([orderId, status]) => {
            const normalized = normalizeStatus(status);
            next[orderId] = normalized;
        });
        return next;
    } catch {
        return {};
    }
};

const getRestaurantName = (order: any) =>
    String(order?.restaurant?.name || order?.restaurantName || order?.restaurantId || "Restoran");

const toNotification = (order: any, status: NormalizedOrderStatus) => {
    const restaurantName = getRestaurantName(order);
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

const persistMap = async (map: StatusMap) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map)).catch(() => null);
};

export const startOrderStatusWatcher = (userId: string) => {
    let active = true;
    let primed = false;
    let statusMap: StatusMap = {};

    const init = async () => {
        const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (!active) return;
        statusMap = parseStoredMap(raw);

        const unsubscribe = subscribeUserOrders(userId, (orders: any[]) => {
            if (!active) return;
            const list = Array.isArray(orders) ? orders : [];

            if (!primed) {
                const initialMap = { ...statusMap };
                list.forEach((order) => {
                    const orderId = String(order?.id || "");
                    if (!orderId) return;
                    initialMap[orderId] = normalizeStatus(order?.status);
                });
                statusMap = initialMap;
                primed = true;
                void persistMap(statusMap);
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

                if (prevStatus !== nextStatus) {
                    const payload = toNotification(order, nextStatus);
                    void NotificationManager.notifyLocal(payload.title, payload.body, {
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
                void persistMap(statusMap);
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

export default startOrderStatusWatcher;
