import * as firebaseOrderRepository from "@/src/services/firebaseOrders";
import * as firebaseAuthRepository from "@/lib/firebaseAuth";
import { selectRepository } from "./backendFlags";
import type { OrderRepository } from "./contracts";
import { supabaseOrderRepository } from "./supabase/orderRepository";

const firebaseOrder: OrderRepository = {
    ...firebaseOrderRepository,
    courierAssignmentMode: "dispatcher_labels",
    listenToOrders: firebaseAuthRepository.listenToOrders,
    assignCourier: firebaseAuthRepository.assignCourier,
    updateOrderStatus: firebaseAuthRepository.updateOrderStatus,
    fetchAuthorizedOrder: async (orderId) => firebaseOrderRepository.fetchOrder(orderId) as any,
    fetchUserOrdersPage: async (userId, options = {}) => {
        const all = await firebaseOrderRepository.fetchUserOrders(userId);
        const offset = Number(options.cursor || 0) || 0;
        const limit = options.limit || 20;
        const items = all.slice(offset, offset + limit) as any[];
        return { items, hasMore: offset + limit < all.length, nextCursor: offset + limit < all.length ? String(offset + limit) as any : null };
    },
    fetchRestaurantOrdersPage: async (restaurantId, options = {}) => {
        const all = await firebaseOrderRepository.fetchRestaurantPastOrders(restaurantId, options.statuses);
        const offset = Number(options.cursor || 0) || 0;
        const limit = options.limit || 20;
        const items = all.slice(offset, offset + limit) as any[];
        return { items, hasMore: offset + limit < all.length, nextCursor: offset + limit < all.length ? String(offset + limit) as any : null };
    },
    fetchAdminOrdersPage: async () => ({ items: [], hasMore: false, nextCursor: null }),
    fetchActiveOrderSummary: async (userId) => (await firebaseOrderRepository.fetchUserOrders(userId)).find((order: any) =>
        ["pending", "accepted", "preparing", "ready", "out_for_delivery"].includes(String(order.status)),
    ) || null,
    fetchLatestOrderSummary: async (userId) => (await firebaseOrderRepository.fetchUserOrders(userId))[0] || null,
    subscribeActiveOrderSummary: (userId, cb) => firebaseOrderRepository.subscribeUserOrders(userId, (orders) => cb(orders.find((order: any) =>
        ["pending", "accepted", "preparing", "ready", "out_for_delivery"].includes(String(order.status)),
    ) || null)),
    subscribeLatestOrderSummary: (userId, cb) => firebaseOrderRepository.subscribeUserOrders(userId, (orders) => cb(orders[0] || null)),
};

export const orderRepository = selectRepository<OrderRepository>("order", {
    firebase: firebaseOrder,
    supabase: supabaseOrderRepository,
});

export const firebaseOrdersEnabled = firebaseAuthRepository.firebaseOrdersEnabled;
export const ordersRepositoryEnabled = orderRepository === supabaseOrderRepository || firebaseAuthRepository.firebaseOrdersEnabled;
export const courierAssignmentMode = orderRepository.courierAssignmentMode;
export const getOrderApprovalDeadlineMs = orderRepository.getOrderApprovalDeadlineMs;
export const isExpiredPendingOrder = orderRepository.isExpiredPendingOrder;
export const placeOrder = orderRepository.placeOrder;
export const subscribeOrder = orderRepository.subscribeOrder;
export const fetchAuthorizedOrder = orderRepository.fetchAuthorizedOrder;
export const fetchUserOrdersPage = orderRepository.fetchUserOrdersPage;
export const fetchRestaurantOrdersPage = orderRepository.fetchRestaurantOrdersPage;
export const fetchAdminOrdersPage = orderRepository.fetchAdminOrdersPage;
export const fetchActiveOrderSummary = orderRepository.fetchActiveOrderSummary;
export const fetchLatestOrderSummary = orderRepository.fetchLatestOrderSummary;
export const subscribeActiveOrderSummary = orderRepository.subscribeActiveOrderSummary;
export const subscribeLatestOrderSummary = orderRepository.subscribeLatestOrderSummary;
export const subscribeUserOrders = orderRepository.subscribeUserOrders;
export const fetchUserOrders = orderRepository.fetchUserOrders;
export const subscribeRestaurantOrders = orderRepository.subscribeRestaurantOrders;
export const fetchRestaurantPastOrders = orderRepository.fetchRestaurantPastOrders;
export const subscribeRestaurantReminderOrders = orderRepository.subscribeRestaurantReminderOrders;
export const requestOrderReminder = orderRepository.requestOrderReminder;
export const transitionOrder = orderRepository.transitionOrder;
export const autoCancelExpiredPendingOrders = orderRepository.autoCancelExpiredPendingOrders;
export const listenToOrders = orderRepository.listenToOrders;
export const assignCourier = orderRepository.assignCourier;
export const updateOrderStatus = orderRepository.updateOrderStatus;
