import * as firebaseOrderRepository from "@/src/services/firebaseOrders";
import * as firebaseAuthRepository from "@/lib/firebaseAuth";
import { selectRepository } from "./backendFlags";
import type { OrderRepository } from "./contracts";
import { supabaseOrderRepository } from "./supabase/orderRepository";

const firebaseOrder: OrderRepository = {
    ...firebaseOrderRepository,
    listenToOrders: firebaseAuthRepository.listenToOrders,
    assignCourier: firebaseAuthRepository.assignCourier,
    updateOrderStatus: firebaseAuthRepository.updateOrderStatus,
};

export const orderRepository = selectRepository<OrderRepository>("order", {
    firebase: firebaseOrder,
    supabase: supabaseOrderRepository,
});

export const firebaseOrdersEnabled = firebaseAuthRepository.firebaseOrdersEnabled;
export const getOrderApprovalDeadlineMs = orderRepository.getOrderApprovalDeadlineMs;
export const isExpiredPendingOrder = orderRepository.isExpiredPendingOrder;
export const placeOrder = orderRepository.placeOrder;
export const subscribeOrder = orderRepository.subscribeOrder;
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
