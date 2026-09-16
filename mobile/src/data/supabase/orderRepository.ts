import type { OrderCursor, OrderPage, OrderRepository } from "@/src/data/contracts";
import type { OrderStatus } from "@/src/domain/types";
import { orderRealtimeCoordinator } from "./orderRealtimeCoordinator";
import { fromKurus, requireSupabase, throwIfError, toMillis, toSupabaseOrderStatus } from "./utils";
import { measureDevelopment } from "@/src/lib/performanceMetrics";

const ACTIVE_RESTAURANT_STATUSES = ["pending", "preparing", "ready", "out_for_delivery"];
const PAST_RESTAURANT_STATUSES = ["delivered", "canceled"];
const APPROVAL_SLA_MS = 5 * 60 * 1000;
const normalizeStatuses = (statuses: string[]) => [...new Set(statuses.map(toSupabaseOrderStatus))];
const normalizeCustomization = (value: any) => ({
    id: String(value?.id || ""),
    name: String(value?.name || ""),
    price: fromKurus(value?.price_kurus),
});

const normalizeOrderItem = (row: any) => ({
    id: String(row.id || ""),
    menuItemId: String(row.menu_item_id || row.source_menu_item_id || ""),
    itemId: String(row.menu_item_id || row.source_menu_item_id || ""),
    name: String(row.name || row.item_name || ""),
    imageUrl: row.image_url || row.item_image_url || undefined,
    price: fromKurus(row.unit_price_kurus),
    quantity: Number(row.quantity || 0),
    customizations: Array.isArray(row.customizations || row.customizations_snapshot)
        ? (row.customizations || row.customizations_snapshot).map(normalizeCustomization)
        : [],
});

export const courierAssignmentMode: OrderRepository["courierAssignmentMode"] = "restaurant_managed";

const normalizeOrder = (row: any) => ({
    id: String(row.id || ""),
    userId: String(row.profile_id || ""),
    restaurantId: String(row.restaurant_id || ""),
    status: row.status || "pending",
    cancellationReasonCode: row.cancellation_reason_code || undefined,
    paymentMethod: row.payment_method || "pos",
    subtotal: fromKurus(row.subtotal_kurus),
    deliveryFee: fromKurus(row.delivery_fee_kurus),
    serviceFee: fromKurus(row.service_fee_kurus),
    discount: fromKurus(row.discount_kurus),
    tip: fromKurus(row.tip_kurus),
    total: fromKurus(row.total_kurus),
    totalPrice: fromKurus(row.total_kurus),
    etaMinutes: row.eta_minutes || undefined,
    customerName: row.customer_name || undefined,
    customerEmail: row.customer_email || undefined,
    customerWhatsapp: row.customer_whatsapp || undefined,
    restaurantName: row.restaurant_name || undefined,
    notes: row.notes || undefined,
    deliveryAddress: row.delivery_address_snapshot || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtMs: toMillis(row.created_at),
    updatedAtMs: toMillis(row.updated_at),
    reminderPending: Boolean(row.reminder_pending),
    approvalDeadline: row.approval_deadline_at,
});

const hydrateOrder = (row: any) => {
    const order = normalizeOrder(row);
    const items = Array.isArray(row?.items) ? row.items.map(normalizeOrderItem) : [];
    return { ...order, items, orderItems: items };
};

const normalizePage = (value: any): OrderPage => ({
    items: (Array.isArray(value?.items) ? value.items : []).map(hydrateOrder),
    hasMore: Boolean(value?.has_more),
    nextCursor: (value?.next_cursor || null) as OrderCursor | null,
});

const fetchOrderById = async (orderId: string) => {
    const row = await measureDevelopment("repository.order.detail", async () =>
        throwIfError(await requireSupabase().rpc("get_my_customer_order_v1", { p_order_id: orderId })),
    );
    return row ? hydrateOrder(row) : null;
};

export const getOrderApprovalDeadlineMs: OrderRepository["getOrderApprovalDeadlineMs"] = (order) =>
    toMillis(order?.approvalDeadline || order?.approval_deadline_at) ||
    (toMillis(order?.createdAt || order?.created_at) ? toMillis(order?.createdAt || order?.created_at) + APPROVAL_SLA_MS : 0);

export const isExpiredPendingOrder: OrderRepository["isExpiredPendingOrder"] = (order, nowMs = Date.now()) =>
    String(order?.status || "").toLowerCase() === "pending" && Boolean(getOrderApprovalDeadlineMs(order) <= nowMs);

export const placeOrder: OrderRepository["placeOrder"] = async ({ restaurantId, items, paymentMethod = "pos", deliveryAddress, notes, operationId }) => {
    const orderItems = items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        optionValueIds: (item.customizations || []).filter((entry) => entry.type !== "removed_ingredient").map((entry) => entry.id),
        removedIngredientIds: (item.customizations || []).filter((entry) => entry.type === "removed_ingredient").map((entry) => entry.id),
    }));
    return measureDevelopment("repository.order.action", async () => {
        const result = throwIfError(await requireSupabase().rpc("create_order_v2", {
            p_restaurant_id: restaurantId,
            p_address_id: String(deliveryAddress?.id || ""),
            p_payment_method: paymentMethod,
            p_items: orderItems,
            p_notes: notes || "",
            p_operation_id: operationId,
        }));
        return String(result?.orderId || "");
    });
};

export const quoteOrder = async (restaurantId: string, items: any[]) => throwIfError(await requireSupabase().rpc("quote_order_v2", {
    p_restaurant_id: restaurantId,
    p_items: items.map((item) => ({ menuItemId: String(item.menuItemId || item.id), quantity: Number(item.quantity || 0),
        optionValueIds: (item.customizations || []).filter((entry: any) => entry.type !== "removed_ingredient").map((entry: any) => entry.id),
        removedIngredientIds: (item.customizations || []).filter((entry: any) => entry.type === "removed_ingredient").map((entry: any) => entry.id) })),
}));

export const subscribeOrder: OrderRepository["subscribeOrder"] = (orderId, cb) => {
    return orderRealtimeCoordinator.subscribeShared(`order:${orderId}`, () => fetchOrderById(orderId), cb, () => cb(null));
};

export const fetchAuthorizedOrder: OrderRepository["fetchAuthorizedOrder"] = fetchOrderById;

export const fetchUserOrdersPage: OrderRepository["fetchUserOrdersPage"] = async (_userId, options = {}) => normalizePage(
    await measureDevelopment("repository.order.page", async () => throwIfError(await requireSupabase().rpc("get_my_customer_orders_page_v1", {
        p_cursor: options.cursor || null,
        p_limit: options.limit || 20,
    }))),
);

export const fetchRestaurantOrdersPage: OrderRepository["fetchRestaurantOrdersPage"] = async (restaurantId, options = {}) => normalizePage(
    throwIfError(await requireSupabase().rpc("get_restaurant_orders_page", {
        p_restaurant_id: restaurantId,
        p_statuses: options.statuses?.length ? normalizeStatuses(options.statuses) : null,
        p_cursor: options.cursor || null,
        p_limit: options.limit || 20,
    })),
);

export const fetchAdminOrdersPage: OrderRepository["fetchAdminOrdersPage"] = async (options = {}) => normalizePage(
    throwIfError(await requireSupabase().rpc("get_admin_orders_page", {
        p_restaurant_id: options.restaurantId || null,
        p_statuses: options.statuses?.length ? normalizeStatuses(options.statuses) : null,
        p_cursor: options.cursor || null,
        p_limit: options.limit || 20,
    })),
);

export const fetchActiveOrderSummary: OrderRepository["fetchActiveOrderSummary"] = async () => {
    const row = throwIfError(await requireSupabase().rpc("get_my_customer_active_order_summary_v1"));
    return row ? normalizeOrder(row) : null;
};

export const fetchLatestOrderSummary: OrderRepository["fetchLatestOrderSummary"] = async () => {
    const row = throwIfError(await requireSupabase().rpc("get_my_customer_latest_order_summary_v1"));
    return row ? hydrateOrder(row) : null;
};

export const subscribeActiveOrderSummary: OrderRepository["subscribeActiveOrderSummary"] = (userId, cb) =>
    orderRealtimeCoordinator.subscribeShared(`orders:active-summary:${userId}`, () => fetchActiveOrderSummary(userId), cb, () => cb(null));

export const subscribeLatestOrderSummary: OrderRepository["subscribeLatestOrderSummary"] = (userId, cb) =>
    orderRealtimeCoordinator.subscribeShared(`orders:latest-summary:${userId}`, () => fetchLatestOrderSummary(userId), cb, () => cb(null));

export const fetchUserOrders: OrderRepository["fetchUserOrders"] = async (userId) =>
    (await fetchUserOrdersPage(userId, { limit: 50 })).items;

export const subscribeUserOrders: OrderRepository["subscribeUserOrders"] = (_userId, cb) => {
    return orderRealtimeCoordinator.subscribeShared(`orders:customer:${_userId}`, () => fetchUserOrders(_userId), cb, () => cb([]));
};

export const subscribeRestaurantOrders: OrderRepository["subscribeRestaurantOrders"] = (restaurantId, statuses = ACTIVE_RESTAURANT_STATUSES, cb) => {
    const load = async () => {
        return (await fetchRestaurantOrdersPage(restaurantId, { statuses, limit: 30 })).items;
    };
    return orderRealtimeCoordinator.subscribeShared(`orders:restaurant:${restaurantId}:${normalizeStatuses(statuses).join(",")}`, load, (orders) => cb?.(orders), () => cb?.([]));
};

export const fetchRestaurantPastOrders: OrderRepository["fetchRestaurantPastOrders"] = async (restaurantId, statuses = PAST_RESTAURANT_STATUSES) =>
    (await fetchRestaurantOrdersPage(restaurantId, { statuses, limit: 30 })).items;

export const subscribeRestaurantReminderOrders: OrderRepository["subscribeRestaurantReminderOrders"] = (restaurantId, cb) => {
    const load = async () => (await fetchRestaurantOrdersPage(restaurantId, { statuses: ACTIVE_RESTAURANT_STATUSES, limit: 50 })).items
        .filter((order) => order.reminderPending);
    return orderRealtimeCoordinator.subscribeShared(`orders:reminders:${restaurantId}`, load, cb, () => cb([]));
};

export const requestOrderReminder: OrderRepository["requestOrderReminder"] = async (orderId) => {
    await measureDevelopment("repository.order.action", () => requireSupabase().rpc("request_my_customer_order_reminder_v1", { p_order_id: orderId }).then(throwIfError));
};

export const transitionOrder: OrderRepository["transitionOrder"] = async (orderId, status) => {
    await measureDevelopment("repository.order.action", () => requireSupabase().rpc("transition_order", { p_order_id: orderId, p_new_status: toSupabaseOrderStatus(status) as any }).then(throwIfError));
};

export const autoCancelExpiredPendingOrders: OrderRepository["autoCancelExpiredPendingOrders"] = async (orders, options = {}) => {
    // Supabase expiry is database-owned. Retain this contract method as a safe
    // no-op so existing screens do not become a second scheduler.
    void orders;
    void options;
};

export const listenToOrders: OrderRepository["listenToOrders"] = (filter, onChange, onError) => {
    const load = async () => {
        try {
            return (await fetchAdminOrdersPage({ restaurantId: filter.restaurantId, statuses: filter.statuses, limit: 50 })).items;
        } catch (error: any) {
            if (!["42501", "PGRST301", "PGRST302"].includes(String(error?.code || ""))) throw error;
            if (filter.restaurantId) return (await fetchRestaurantOrdersPage(filter.restaurantId, { statuses: filter.statuses, limit: 50 })).items;
            return [];
        }
    };
    const key = `orders:role-list:${filter.restaurantId || "all"}:${normalizeStatuses(filter.statuses || []).join(",")}`;
    return orderRealtimeCoordinator.subscribeShared(key, load, onChange, (error) => onError?.(error as Error));
};

export const assignCourier: OrderRepository["assignCourier"] = async (orderId) => {
    await transitionOrder(orderId, "out_for_delivery");
    return { id: orderId, status: "out_for_delivery" };
};

export const updateOrderStatus: OrderRepository["updateOrderStatus"] = async (orderId, status) => {
    await transitionOrder(orderId, status);
    return { id: orderId, status };
};

export const supabaseOrderRepository: OrderRepository = {
    courierAssignmentMode,
    getOrderApprovalDeadlineMs,
    isExpiredPendingOrder,
    placeOrder,
    subscribeOrder,
    fetchAuthorizedOrder,
    fetchUserOrdersPage,
    fetchRestaurantOrdersPage,
    fetchAdminOrdersPage,
    fetchActiveOrderSummary,
    fetchLatestOrderSummary,
    subscribeActiveOrderSummary,
    subscribeLatestOrderSummary,
    subscribeUserOrders,
    fetchUserOrders,
    subscribeRestaurantOrders,
    fetchRestaurantPastOrders,
    subscribeRestaurantReminderOrders,
    requestOrderReminder,
    transitionOrder,
    autoCancelExpiredPendingOrders,
    listenToOrders,
    assignCourier,
    updateOrderStatus,
};
