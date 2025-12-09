import { useCallback, useEffect, useState } from "react";
import { subscribeOrder } from "@/src/services/firebaseOrders";
import type { Order } from "@/src/domain/types";

type OrderRealtimePayload = {
    order: Order;
    event: "order_state_changed" | "order_auto_canceled";
};

export const useOrderRealtime = (orderId?: string) => {
    const [order, setOrder] = useState<Order | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!orderId) return undefined;
        return subscribeOrder(
            orderId,
            (payload) => {
                if (!payload) return;
                setOrder((prev) => ({ ...(prev ?? {}) as Order, ...payload }));
            },
            // subscribeOrder already handles errors silently; keep a setter for completeness
        );
    }, [orderId]);

    return { order, error, refetch: useCallback(() => undefined, []) };
};

export default useOrderRealtime;
