import { useEffect, useState } from "react";
import { subscribeRestaurantOrders, transitionOrder } from "@/src/services/firebaseOrders";
import type { RestaurantOrder } from "@/type";

export const useRestaurantOrders = (restaurantId?: string) => {
    const [orders, setOrders] = useState<RestaurantOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!restaurantId) return;
        setLoading(true);
        setError(null);
        return subscribeRestaurantOrders(restaurantId, ["pending", "accepted"], (incoming: any[]) => {
            const normalized = (Array.isArray(incoming) ? incoming : []).map((order: any) => {
                const items = Array.isArray(order.items) ? order.items : [];
                return {
                    ...order,
                    orderItems: order.orderItems ?? items.map((i: any) => ({ name: i.name, quantity: i.quantity })),
                };
            }) as RestaurantOrder[];
            setOrders(normalized);
            setLoading(false);
        });
    }, [restaurantId]);

    const mutateStatus = async (orderId: string, status: string) => {
        try {
            await transitionOrder(orderId, status as any);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update order");
        }
    };

    return {
        orders,
        loading,
        error,
        refetch: async () => undefined,
        setOrders,
        mutateStatus,
    };
};

export default useRestaurantOrders;
