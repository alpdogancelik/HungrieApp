import { useEffect, useState } from "react";
import { subscribeOrder } from "@/src/services/firebaseOrders";

export type PendingOrderStatus = "awaiting_confirmation" | "confirmed" | "rejected";

type UseOrderStatusResult = {
    status: PendingOrderStatus;
};

export function useOrderStatus(orderId?: string): UseOrderStatusResult {
    const [status, setStatus] = useState<PendingOrderStatus>("awaiting_confirmation");

    useEffect(() => {
        if (!orderId) return;
        return subscribeOrder(orderId, (order) => {
            if (!order) return;
            if (order.status === "pending") setStatus("awaiting_confirmation");
            else if (order.status === "canceled") setStatus("rejected");
            else setStatus("confirmed");
        });
    }, [orderId]);

    return {
        status,
    };
}

export default useOrderStatus;
