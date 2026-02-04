export type PendingOrderStatus = "awaiting_confirmation" | "confirmed" | "rejected";

const restaurantAlertListeners = new Set<(payload: { orderId: string; timestamp: number }) => void>();
const statusListeners = new Set<(payload: { orderId: string; status: PendingOrderStatus }) => void>();
const pollAttempts = new Map<string, number>();
const statusStore = new Map<string, PendingOrderStatus>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function notifyRestaurant(orderId: string): Promise<{ success: boolean }> {
    await delay(800 + Math.random() * 600);
    statusStore.set(orderId, "awaiting_confirmation");
    pollAttempts.set(orderId, 0);
    restaurantAlertListeners.forEach((listener) => listener({ orderId, timestamp: Date.now() }));
    return { success: true };
}

export async function getOrderStatus(orderId: string): Promise<{ status: PendingOrderStatus }> {
    await delay(500 + Math.random() * 800);
    const current = statusStore.get(orderId) ?? "awaiting_confirmation";
    const attempts = pollAttempts.get(orderId) ?? 0;
    let nextStatus = current;

    if (current === "awaiting_confirmation" && attempts >= 3) {
        nextStatus = Math.random() > 0.18 ? "confirmed" : "rejected";
        statusStore.set(orderId, nextStatus);
        statusListeners.forEach((listener) => listener({ orderId, status: nextStatus }));
    }

    pollAttempts.set(orderId, attempts + 1);
    return { status: nextStatus };
}

export function subscribeRestaurantAlerts(listener: (payload: { orderId: string; timestamp: number }) => void) {
    restaurantAlertListeners.add(listener);
    return () => restaurantAlertListeners.delete(listener);
}

export function subscribeOrderStatus(listener: (payload: { orderId: string; status: PendingOrderStatus }) => void) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
}

export function resetMockOrder(orderId: string) {
    statusStore.delete(orderId);
    pollAttempts.delete(orderId);
}
