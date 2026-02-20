import { z } from "zod";
import { nanoid } from "nanoid/non-secure";
import type { Order, OrderStatus } from "../domain/types";
import { CartItem, MenuItem, PaymentMethod, Restaurant } from "../domain/types";
import { transitionOrderStatus, canTransition } from "../domain/orderMachine";
import { emitOrderEvent } from "../lib/realtime";

const restaurants: Restaurant[] = [
    { id: "ada-pizza", name: "Ada Pizza", description: "Ada'nın geç-gece pizzaları ve dürümleri", isActive: true },
    { id: "alacarte-cafe", name: "Ala Carte Cafe", description: "Wrap, burger ve ızgara tabaklar", isActive: true },
];

const menuItems: MenuItem[] = [
    {
        id: "ada-special",
        restaurantId: "ada-pizza",
        name: "Ada Special Pizza",
        description: "30 cm ince hamur, şefin gizli reçetesi",
        price: 420,
        etaMinutes: 30,
        visible: true,
    },
    {
        id: "ada-fajita",
        restaurantId: "ada-pizza",
        name: "Fajita Dürüm",
        description: "Izgara biber, tavuk, cheddar ve fajita sosu",
        price: 300,
        etaMinutes: 20,
        visible: true,
    },
    {
        id: "alacarte-burger",
        restaurantId: "alacarte-cafe",
        name: "Pres Et Burger",
        description: "Preslenmiş dana burger, isteğe göre ekstra peynir",
        price: 370,
        etaMinutes: 22,
        visible: true,
    },
    {
        id: "alacarte-wrap",
        restaurantId: "alacarte-cafe",
        name: "Popcorn Ala Carte Special",
        description: "Özel soslu popcorn tavuk dürüm",
        price: 300,
        etaMinutes: 18,
        visible: true,
    },
];

let orders: Order[] = [];

const cartItemSchema = z.object({
    menuItemId: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().nonnegative(),
    customizations: z
        .array(
            z.object({
                id: z.string(),
                name: z.string(),
                price: z.number().nonnegative(),
            }),
        )
        .optional(),
});

const createOrderSchema = z.object({
    userId: z.string(),
    restaurantId: z.string(),
    items: z.array(cartItemSchema).min(1),
    paymentMethod: z.custom<PaymentMethod>((val) => val === "cash" || val === "pos"),
    deliveryFee: z.number().nonnegative(),
    serviceFee: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    tip: z.number().nonnegative(),
});

const changeStatusSchema = z.object({
    orderId: z.string(),
    status: z.custom<OrderStatus>((val) =>
        ["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(
            String(val),
        ),
    ),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

const calcSubtotal = (items: CartItem[]) =>
    items.reduce(
        (sum, item) =>
            sum +
            item.quantity *
            (item.price +
                (item.customizations?.reduce((cSum, c) => cSum + c.price, 0) ?? 0)),
        0,
    );

export const createOrder = async (input: CreateOrderInput): Promise<Order> => {
    const payload = createOrderSchema.parse(input);
    const restaurant = restaurants.find((r) => r.id === payload.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");

    const subtotal = calcSubtotal(payload.items);
    const total =
        subtotal + payload.deliveryFee + payload.serviceFee + payload.tip - payload.discount;

    const order: Order = {
        id: nanoid(),
        userId: payload.userId,
        restaurantId: payload.restaurantId,
        items: payload.items,
        status: "pending",
        paymentMethod: payload.paymentMethod,
        subtotal,
        deliveryFee: payload.deliveryFee,
        serviceFee: payload.serviceFee,
        discount: payload.discount,
        tip: payload.tip,
        total,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        etaMinutes: 25,
    };

    orders = [order, ...orders];
    return order;
};

export const getOrder = async (orderId: string): Promise<Order | null> => {
    const found = orders.find((order) => order.id === orderId);
    return found ?? null;
};

export const getOrdersByUser = async (userId: string): Promise<Order[]> =>
    orders.filter((order) => order.userId === userId);

export const nudgeRestaurant = async (orderId: string) => {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    return { success: true, notifiedAt: new Date().toISOString() };
};

export const changeStatus = async (input: z.infer<typeof changeStatusSchema>): Promise<Order> => {
    const { orderId, status } = changeStatusSchema.parse(input);
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    if (!canTransition(order, status)) {
        throw new Error(`Invalid transition from ${order.status} to ${status}`);
    }
    const updated = transitionOrderStatus(order, status);
    orders = orders.map((o) => (o.id === orderId ? updated : o));
    emitOrderEvent("order_state_changed", { id: orderId, status });
    return updated;
};

export const getMenuByRestaurant = async (restaurantId: string): Promise<MenuItem[]> =>
    menuItems.filter((item) => item.restaurantId === restaurantId && item.visible);

export const registerLocalOrder = (order: Order) => {
    // Keep most recent first and prevent duplicates
    orders = [order, ...orders.filter((o) => o.id !== order.id)];
};

export const __resetDevServer = () => {
    orders = [];
};
