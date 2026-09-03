import type { OrderRepository } from "@/src/data/contracts";
import type { OrderStatus } from "@/src/domain/types";
import { fromKurus, requireSupabase, throwIfError, toMillis } from "./utils";

const ACTIVE_RESTAURANT_STATUSES = ["pending", "preparing", "ready", "out_for_delivery"];
const PAST_RESTAURANT_STATUSES = ["delivered", "canceled"];
const APPROVAL_SLA_MS = 5 * 60 * 1000;

const normalizeOrder = (row: any) => ({
    id: String(row.id || ""),
    userId: String(row.profile_id || ""),
    restaurantId: String(row.restaurant_id || ""),
    status: row.status || "pending",
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
    deliveryAddress: row.delivery_address_snapshot || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtMs: toMillis(row.created_at),
    updatedAtMs: toMillis(row.updated_at),
    reminderPending: Boolean(row.reminder_pending),
    approvalDeadline: row.approval_deadline_at,
});

const fetchOrderById = async (orderId: string) => {
    const views = ["my_orders", "restaurant_orders", "courier_assigned_orders", "courier_available_orders", "admin_orders"] as const;
    for (const view of views) {
        const row = throwIfError(await requireSupabase().from(view).select("*").eq("id", orderId).maybeSingle());
        if (row) return normalizeOrder(row);
    }
    return null;
};

export const getOrderApprovalDeadlineMs: OrderRepository["getOrderApprovalDeadlineMs"] = (order) =>
    toMillis(order?.approvalDeadline || order?.approval_deadline_at) ||
    (toMillis(order?.createdAt || order?.created_at) ? toMillis(order?.createdAt || order?.created_at) + APPROVAL_SLA_MS : 0);

export const isExpiredPendingOrder: OrderRepository["isExpiredPendingOrder"] = (order, nowMs = Date.now()) =>
    String(order?.status || "").toLowerCase() === "pending" && Boolean(getOrderApprovalDeadlineMs(order) <= nowMs);

export const placeOrder: OrderRepository["placeOrder"] = async ({ restaurantId, items, paymentMethod = "pos", deliveryAddress, notes }) => {
    const orderItems = items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        customizations: item.customizations || [],
    }));
    return throwIfError(
        await requireSupabase().rpc("create_order", {
            p_restaurant_id: restaurantId,
            p_address_id: String(deliveryAddress?.id || ""),
            p_payment_method: paymentMethod,
            p_items: orderItems,
            p_notes: notes || "",
        }),
    );
};

export const subscribeOrder: OrderRepository["subscribeOrder"] = (orderId, cb) => {
    void fetchOrderById(orderId).then(cb).catch(() => cb(null));
    const channel = requireSupabase()
        .channel(`order:${orderId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => {
            void fetchOrderById(orderId).then(cb).catch(() => cb(null));
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const fetchUserOrders: OrderRepository["fetchUserOrders"] = async () =>
    throwIfError(await requireSupabase().from("my_orders").select("*").order("created_at", { ascending: false }).limit(60)).map(normalizeOrder);

export const subscribeUserOrders: OrderRepository["subscribeUserOrders"] = (_userId, cb) => {
    void fetchUserOrders(_userId).then(cb).catch(() => cb([]));
    const channel = requireSupabase()
        .channel("my-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
            void fetchUserOrders(_userId).then(cb).catch(() => cb([]));
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const subscribeRestaurantOrders: OrderRepository["subscribeRestaurantOrders"] = (restaurantId, statuses = ACTIVE_RESTAURANT_STATUSES, cb) => {
    const load = async () => {
        const rows = throwIfError(
            await requireSupabase()
                .from("restaurant_orders")
                .select("*")
                .eq("restaurant_id", restaurantId)
                .in("status", statuses as any)
                .order("created_at", { ascending: false })
                .limit(30),
        );
        cb?.(rows.map(normalizeOrder));
    };
    void load().catch(() => cb?.([]));
    const channel = requireSupabase()
        .channel(`restaurant-orders:${restaurantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
            void load().catch(() => cb?.([]));
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const fetchRestaurantPastOrders: OrderRepository["fetchRestaurantPastOrders"] = async (restaurantId, statuses = PAST_RESTAURANT_STATUSES) =>
    throwIfError(
        await requireSupabase()
            .from("restaurant_orders")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .in("status", statuses as any)
            .order("created_at", { ascending: false })
            .limit(30),
    ).map(normalizeOrder);

export const subscribeRestaurantReminderOrders: OrderRepository["subscribeRestaurantReminderOrders"] = (restaurantId, cb) => {
    const load = async () =>
        cb(
            throwIfError(
                await requireSupabase().from("restaurant_orders").select("*").eq("restaurant_id", restaurantId).eq("reminder_pending", true),
            ).map(normalizeOrder),
        );
    void load().catch(() => cb([]));
    const channel = requireSupabase()
        .channel(`restaurant-reminders:${restaurantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
            void load().catch(() => cb([]));
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const requestOrderReminder: OrderRepository["requestOrderReminder"] = async (orderId) => {
    await requireSupabase().rpc("request_order_reminder", { p_order_id: orderId }).then(throwIfError);
};

export const transitionOrder: OrderRepository["transitionOrder"] = async (orderId, status) => {
    await requireSupabase().rpc("transition_order", { p_order_id: orderId, p_new_status: status as any }).then(throwIfError);
};

export const autoCancelExpiredPendingOrders: OrderRepository["autoCancelExpiredPendingOrders"] = async (orders, options = {}) => {
    const nowMs = Date.now();
    await Promise.all(
        (Array.isArray(orders) ? orders : []).map(async (order) => {
            const orderId = String(order?.id || "");
            if (!orderId || options.inFlightIds?.has(orderId) || !isExpiredPendingOrder(order, nowMs)) return;
            options.inFlightIds?.add(orderId);
            try {
                await transitionOrder(orderId, "canceled");
            } catch (error) {
                options.onError?.(error, order);
            } finally {
                options.inFlightIds?.delete(orderId);
            }
        }),
    );
};

export const listenToOrders: OrderRepository["listenToOrders"] = (filter, onChange, onError) => {
    const load = async () => {
        let query = requireSupabase().from("admin_orders").select("*").order("created_at", { ascending: false });
        if (filter.restaurantId) query = query.eq("restaurant_id", filter.restaurantId);
        if (filter.statuses?.length) query = query.in("status", filter.statuses as any);
        onChange(throwIfError(await query).map(normalizeOrder));
    };
    void load().catch((error) => onError?.(error));
    const channel = requireSupabase()
        .channel(`admin-orders:${filter.restaurantId || "all"}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
            void load().catch((error) => onError?.(error));
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const assignCourier: OrderRepository["assignCourier"] = async (orderId) => {
    const id = throwIfError(await requireSupabase().rpc("claim_delivery", { p_order_id: orderId }));
    return { id, status: "out_for_delivery" };
};

export const updateOrderStatus: OrderRepository["updateOrderStatus"] = async (orderId, status) => {
    await transitionOrder(orderId, status);
    return { id: orderId, status };
};

export const supabaseOrderRepository: OrderRepository = {
    getOrderApprovalDeadlineMs,
    isExpiredPendingOrder,
    placeOrder,
    subscribeOrder,
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
