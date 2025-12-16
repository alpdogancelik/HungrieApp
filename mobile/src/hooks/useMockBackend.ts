import { useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid/non-secure";

import { registerLocalOrder, getOrdersByUser } from "@/src/api/client";
import type { CartItem, Order, PaymentMethod, Restaurant } from "@/src/domain/types";
import { getOrderStatus, notifyRestaurant, subscribeOrderStatus, type PendingOrderStatus } from "@/src/services/order";

type PlaceOrderInput = {
    restaurantId: string;
    items: CartItem[];
    userId?: string;
    paymentMethod?: PaymentMethod;
    fees?: {
        deliveryFee?: number;
        serviceFee?: number;
        discount?: number;
        tip?: number;
    };
};

type UseMockBackendResult = {
    restaurants: Restaurant[];
    getMenu: (restaurantId: string) => any[];
    orders: Order[];
    loading: boolean;
    statusMap: Record<string, PendingOrderStatus>;
    placeOrder: (payload: PlaceOrderInput) => Promise<Order>;
    refreshOrders: () => Promise<void>;
    getStatusNow: (orderId: string) => Promise<PendingOrderStatus>;
};

const defaultFees = { deliveryFee: 0, serviceFee: 0, discount: 0, tip: 0 };

const calcSubtotal = (items: CartItem[]) =>
    items.reduce((sum, item) => sum + item.quantity * item.price, 0);

const useMockBackend = (userId?: string): UseMockBackendResult => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusMap, setStatusMap] = useState<Record<string, PendingOrderStatus>>({});

    const restaurants = useMemo<Restaurant[]>(() => [], []);
    const getMenu = useCallback((restaurantId: string) => {
        void restaurantId;
        return [];
    }, []);

    const refreshOrders = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const list = await getOrdersByUser(userId);
            setOrders(list);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        refreshOrders().catch(() => null);
    }, [refreshOrders]);

    useEffect(() => {
        const unsubscribe = subscribeOrderStatus(({ orderId, status }) => {
            setStatusMap((prev) => ({ ...prev, [orderId]: status }));
            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, status: status === "confirmed" ? "preparing" : order.status } : order,
                ),
            );
        });
        return () => {
            unsubscribe();
        };
    }, []);

    const placeOrder = useCallback(
        async ({ restaurantId, items, paymentMethod = "pos", fees = {}, userId: customUserId }: PlaceOrderInput) => {
            const subtotal = calcSubtotal(items);
            const mergedFees = { ...defaultFees, ...fees };
            const order: Order = {
                id: nanoid(),
                userId: customUserId || userId || "guest",
                restaurantId,
                items,
                status: "pending",
                paymentMethod,
                subtotal,
                deliveryFee: mergedFees.deliveryFee ?? 0,
                serviceFee: mergedFees.serviceFee ?? 0,
                discount: mergedFees.discount ?? 0,
                tip: mergedFees.tip ?? 0,
                total: subtotal + (mergedFees.deliveryFee ?? 0) + (mergedFees.serviceFee ?? 0) + (mergedFees.tip ?? 0) - (mergedFees.discount ?? 0),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                etaMinutes: 25,
            };

            registerLocalOrder(order);
            setOrders((prev) => [order, ...prev]);
            setStatusMap((prev) => ({ ...prev, [order.id]: "awaiting_confirmation" }));
            await notifyRestaurant(order.id);
            return order;
        },
        [userId],
    );

    const getStatusNow = useCallback(async (orderId: string) => {
        const res = await getOrderStatus(orderId);
        setStatusMap((prev) => ({ ...prev, [orderId]: res.status }));
        return res.status;
    }, []);

    return {
        restaurants,
        getMenu,
        orders,
        loading,
        statusMap,
        placeOrder,
        refreshOrders,
        getStatusNow,
    };
};

export default useMockBackend;
