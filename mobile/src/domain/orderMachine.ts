import type { Order, OrderStatus } from "./types";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ["preparing", "canceled"],
    preparing: ["ready", "canceled"],
    ready: ["out_for_delivery", "canceled"],
    out_for_delivery: ["delivered", "canceled"],
    delivered: [],
    canceled: [],
};

const guardRules: Partial<Record<OrderStatus, (order: Order) => boolean>> = {
    delivered: (order) => order.status === "out_for_delivery" && order.items.length > 0,
    out_for_delivery: (order) => order.status === "ready",
};

export const canTransition = (order: Order, nextStatus: OrderStatus): boolean => {
    const allowed = ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(nextStatus)) return false;
    const guard = guardRules[nextStatus];
    return guard ? guard(order) : true;
};

export const transitionOrderStatus = (order: Order, nextStatus: OrderStatus): Order => {
    if (!canTransition(order, nextStatus)) {
        throw new Error(`Invalid transition from ${order.status} to ${nextStatus}`);
    }
    return {
        ...order,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
    };
};
