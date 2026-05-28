import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import type { Address, CartItem, OrderStatus, PaymentMethod } from "@/src/domain/types";
import { recomputeRestaurantMetrics } from "@/src/services/restaurantMetrics";

const ensureDb = () => {
    if (!firestore) throw new Error("Firebase is not configured");
    return firestore;
};

const ensureAuthSession = async () => {
    if (!auth) throw new Error("Firebase Auth is not configured");
    if (auth.currentUser) return;
    await (auth as any).authStateReady?.().catch(() => null);
    if (auth.currentUser) return;
    throw new Error("Please sign in before placing an order.");
};

const ordersCol = () => collection(ensureDb(), "orders");
const compactObject = <T extends Record<string, any>>(value: T) =>
    Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));
const ACTIVE_RESTAURANT_STATUSES = ["pending", "accepted", "preparing", "ready", "out_for_delivery"] as const;
const PAST_RESTAURANT_STATUSES = ["rejected", "delivered", "canceled"] as const;
const APPROVAL_SLA_MS = 5 * 60 * 1000;

const toMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (typeof value?.seconds === "number") return value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
    return 0;
};

const getOrderSortMs = (order: any) =>
    toMillis(order?.createdAtMs) ||
    toMillis(order?.createdAt) ||
    toMillis(order?.updatedAtMs) ||
    toMillis(order?.updatedAt) ||
    0;

const sortOrdersByRecent = (orders: any[]) => [...orders].sort((a, b) => getOrderSortMs(b) - getOrderSortMs(a));

const isPermissionDeniedError = (error: unknown) => {
    const code = String((error as any)?.code || "").toLowerCase();
    const message = String((error as any)?.message || "").toLowerCase();
    return code.includes("permission-denied") || message.includes("missing or insufficient permissions");
};

const handleSnapshotError = (scope: string, cb?: (orders: any[]) => void) => (error: unknown) => {
    cb?.([]);
    if (__DEV__ && !isPermissionDeniedError(error)) {
        console.warn(`[orders] ${scope} listener failed`, error);
    }
};

export const getOrderApprovalDeadlineMs = (order: any) => {
    const explicitDeadline =
        toMillis(order?.restaurantApprovalDeadline) ||
        toMillis(order?.approvalDeadline) ||
        toMillis(order?.slaDeadline);
    if (explicitDeadline) return explicitDeadline;

    const createdAtMs = toMillis(order?.createdAtMs) || toMillis(order?.createdAt) || toMillis(order?.updatedAtMs) || toMillis(order?.updatedAt);
    return createdAtMs ? createdAtMs + APPROVAL_SLA_MS : 0;
};

export const isExpiredPendingOrder = (order: any, nowMs = Date.now()) => {
    const status = String(order?.status || "").trim().toLowerCase();
    const isPending =
        !status ||
        status === "pending" ||
        status === "awaiting_confirmation" ||
        status === "waiting_restaurant" ||
        status === "pending_restaurant_approval" ||
        status === "awaiting_restaurant_approval" ||
        status.includes("pending") ||
        status.includes("awaiting");
    if (!isPending) return false;
    const approvalDeadlineMs = getOrderApprovalDeadlineMs(order);
    return Boolean(approvalDeadlineMs && approvalDeadlineMs <= nowMs);
};

const normalizeStatuses = (statuses: string[], fallback: readonly string[]) => {
    const normalized = statuses.map((status) => String(status || "").trim().toLowerCase()).filter(Boolean);
    return normalized.length ? normalized : [...fallback];
};

const hasTimestamp = (value: Record<string, any>, fieldName: string) => Boolean(value?.[fieldName] || value?.[`${fieldName}Ms`]);

const buildStatusTransitionFields = (order: Record<string, any>, status: OrderStatus | string, nowMs: number) => {
    const normalizedStatus = String(status || "").trim().toLowerCase();
    const fields: Record<string, unknown> = {
        status,
        statusChangedAt: serverTimestamp(),
        statusChangedAtMs: nowMs,
        updatedAt: serverTimestamp(),
        updatedAtMs: nowMs,
    };

    if (normalizedStatus !== "pending") {
        fields.reminderPending = false;
        fields.reminderHandledAt = serverTimestamp();
        fields.reminderHandledAtMs = nowMs;
    }

    if (normalizedStatus === "accepted" && !hasTimestamp(order, "acceptedAt")) {
        fields.acceptedAt = serverTimestamp();
        fields.acceptedAtMs = nowMs;
    }

    if (normalizedStatus === "ready" && !hasTimestamp(order, "readyAt")) {
        fields.readyAt = serverTimestamp();
        fields.readyAtMs = nowMs;
    }

    if (normalizedStatus === "out_for_delivery" && !hasTimestamp(order, "outForDeliveryAt")) {
        fields.outForDeliveryAt = serverTimestamp();
        fields.outForDeliveryAtMs = nowMs;
    }

    if (normalizedStatus === "delivered" && !hasTimestamp(order, "deliveredAt")) {
        fields.deliveredAt = serverTimestamp();
        fields.deliveredAtMs = nowMs;
    }

    if (normalizedStatus === "canceled" && !hasTimestamp(order, "canceledAt")) {
        fields.canceledAt = serverTimestamp();
        fields.canceledAtMs = nowMs;
    }

    if (normalizedStatus === "rejected" && !hasTimestamp(order, "rejectedAt")) {
        fields.rejectedAt = serverTimestamp();
        fields.rejectedAtMs = nowMs;
    }

    return fields;
};

export const placeOrder = async ({
    userId,
    restaurantId,
    items,
    paymentMethod = "pos",
    fees = {},
    etaMinutes = 25,
    customer,
    deliveryAddress,
    notes,
}: {
    userId: string;
    restaurantId: string;
    items: CartItem[];
    paymentMethod?: PaymentMethod;
    fees?: { deliveryFee?: number; serviceFee?: number; discount?: number; tip?: number };
    etaMinutes?: number;
    customer?: { name?: string | null; email?: string | null; whatsappNumber?: string | null };
    deliveryAddress?: Partial<Address> | null;
    notes?: string | null;
}) => {
    await ensureAuthSession();

    const nowMs = Date.now();
    const resolvedUserId = auth?.currentUser?.uid ?? userId ?? "guest";
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const { deliveryFee = 0, serviceFee = 0, discount = 0, tip = 0 } = fees;
    const total = subtotal + deliveryFee + serviceFee + tip - discount;
    const contactName = customer?.name || "Hungrie User";
    const contactEmail = customer?.email || undefined;
    const contactWhatsapp = customer?.whatsappNumber || undefined;
    const deliveryAddressText = deliveryAddress
        ? [
              deliveryAddress.label,
              deliveryAddress.line1,
              deliveryAddress.block,
              deliveryAddress.room,
              deliveryAddress.city,
              deliveryAddress.country,
          ]
              .filter(Boolean)
              .join(", ")
        : undefined;
    const sanitizedDeliveryAddress = deliveryAddress
        ? compactObject({
              id: deliveryAddress.id,
              label: deliveryAddress.label,
              line1: deliveryAddress.line1,
              block: deliveryAddress.block,
              room: deliveryAddress.room,
              city: deliveryAddress.city,
              country: deliveryAddress.country,
              isDefault: deliveryAddress.isDefault,
              createdAt: deliveryAddress.createdAt,
          })
        : undefined;
    const customerPayload = compactObject({
        name: contactName,
        email: contactEmail,
        whatsappNumber: contactWhatsapp,
    });

    const ref = await addDoc(ordersCol(), compactObject({
        userId: resolvedUserId,
        restaurantId,
        items,
        paymentMethod,
        status: "pending",
        customerName: contactName,
        customerEmail: contactEmail,
        customerWhatsapp: contactWhatsapp,
        customer: customerPayload,
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        tip,
        total,
        etaMinutes,
        deliveryAddress: sanitizedDeliveryAddress,
        deliveryAddressText,
        notes: typeof notes === "string" ? notes.trim() : "",
        createdAt: serverTimestamp(),
        createdAtMs: nowMs,
        updatedAt: serverTimestamp(),
        updatedAtMs: nowMs,
        statusChangedAt: serverTimestamp(),
        statusChangedAtMs: nowMs,
    }));
    return ref.id;
};

export const subscribeOrder = (orderId: string, cb: (order: any | null) => void) =>
    onSnapshot(
        doc(ensureDb(), "orders", orderId),
        (snap) => {
            if (!snap.exists()) return cb(null);
            cb({ id: snap.id, ...snap.data() });
        },
        (error) => {
            cb(null);
            if (__DEV__ && !isPermissionDeniedError(error)) {
                console.warn("[orders] order listener failed", error);
            }
        },
    );

export const subscribeUserOrders = (userId: string, cb: (orders: any[]) => void) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
        cb([]);
        return () => undefined;
    }
    return onSnapshot(
        query(ordersCol(), where("userId", "==", normalizedUserId)),
        (snap) => cb(sortOrdersByRecent(snap.docs.map((d) => ({ ...d.data(), id: d.id }))).slice(0, 60)),
        handleSnapshotError("user orders", cb),
    );
};

export const fetchUserOrders = async (userId: string) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return [];
    const snap = await getDocs(query(ordersCol(), where("userId", "==", normalizedUserId)));
    return sortOrdersByRecent(snap.docs.map((d) => ({ ...d.data(), id: d.id }))).slice(0, 60);
};

export const subscribeRestaurantOrders = (
    restaurantId: string,
    statuses: string[] = [...ACTIVE_RESTAURANT_STATUSES],
    cb?: (orders: any[]) => void,
) => {
    const normalizedRestaurantId = String(restaurantId || "").trim();
    if (!normalizedRestaurantId) {
        cb?.([]);
        return () => undefined;
    }
    const activeStatuses = normalizeStatuses(statuses, ACTIVE_RESTAURANT_STATUSES).filter((status) =>
        ACTIVE_RESTAURANT_STATUSES.includes(status as (typeof ACTIVE_RESTAURANT_STATUSES)[number]),
    );
    const statusFilter = activeStatuses.length ? activeStatuses : [...ACTIVE_RESTAURANT_STATUSES];
    const q = query(
        ordersCol(),
        where("restaurantId", "==", normalizedRestaurantId),
        where("status", "in", statusFilter),
        orderBy("createdAtMs", "desc"),
        limit(30),
    );
    return onSnapshot(
        q,
        (snap) =>
            cb
                ? cb(
                      snap.docs
                          .map((d) => ({ ...d.data(), id: d.id }))
                          .filter((order: any) => {
                              const raw = String(order?.status || "").toLowerCase();
                              return !["canceled", "cancelled", "rejected", "delivered"].includes(raw);
                          }),
                  )
                : undefined,
        handleSnapshotError("restaurant active orders", cb),
    );
};

export const fetchRestaurantPastOrders = async (restaurantId: string, statuses: string[] = [...PAST_RESTAURANT_STATUSES]) => {
    const normalizedRestaurantId = String(restaurantId || "").trim();
    if (!normalizedRestaurantId) return [];
    const pastStatuses = normalizeStatuses(statuses, PAST_RESTAURANT_STATUSES).filter((status) =>
        PAST_RESTAURANT_STATUSES.includes(status as (typeof PAST_RESTAURANT_STATUSES)[number]),
    );
    const statusFilter = pastStatuses.length ? pastStatuses : [...PAST_RESTAURANT_STATUSES];
    const q = query(
        ordersCol(),
        where("restaurantId", "==", normalizedRestaurantId),
        where("status", "in", statusFilter),
        orderBy("createdAtMs", "desc"),
        limit(30),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
};

export const subscribeRestaurantReminderOrders = (restaurantId: string, cb: (orders: any[]) => void) => {
    const normalizedRestaurantId = String(restaurantId || "").trim();
    if (!normalizedRestaurantId) {
        cb([]);
        return () => undefined;
    }
    const q = query(
        ordersCol(),
        where("restaurantId", "==", normalizedRestaurantId),
        where("reminderPending", "==", true),
    );
    return onSnapshot(
        q,
        (snap) =>
            cb(
                snap.docs
                    .map((d) => ({ ...d.data(), id: d.id }))
                    .filter((order: any) => !["delivered", "canceled", "rejected"].includes(String(order?.status || "").toLowerCase())),
            ),
        handleSnapshotError("restaurant reminder orders", cb),
    );
};

export const requestOrderReminder = async (
    orderId: string,
    payload: { userId?: string; source?: "customer" | "system" } = {},
) => {
    await updateDoc(doc(ensureDb(), "orders", orderId), {
        reminderPending: true,
        reminderRequestedAt: serverTimestamp(),
        reminderRequestedAtMs: Date.now(),
        reminderRequestedBy: payload.userId || "unknown",
        reminderSource: payload.source || "customer",
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
    });
};

export const transitionOrder = async (orderId: string, status: OrderStatus | string) => {
    const orderRef = doc(ensureDb(), "orders", orderId);
    const orderSnapshot = await getDoc(orderRef);

    if (!orderSnapshot.exists()) {
        throw new Error("Order not found.");
    }

    const order = orderSnapshot.data() || {};
    const nowMs = Date.now();
    await updateDoc(orderRef, buildStatusTransitionFields(order, status, nowMs));

    if (String(status || "").trim().toLowerCase() === "delivered") {
        const restaurantId = String(order.restaurantId || "").trim();
        if (restaurantId) {
            await recomputeRestaurantMetrics(restaurantId).catch((error) => {
                console.warn("[Metrics] Failed to recompute restaurant metrics after delivery", error);
            });
        }
    }
};

export const autoCancelExpiredPendingOrders = async (
    orders: any[],
    options: { inFlightIds?: Set<string>; onError?: (error: unknown, order: any) => void } = {},
) => {
    const list = Array.isArray(orders) ? orders : [];
    const nowMs = Date.now();

    await Promise.all(
        list.map(async (order) => {
            const orderId = String(order?.id || "");
            if (!orderId || options.inFlightIds?.has(orderId)) return;
            if (!isExpiredPendingOrder(order, nowMs)) return;

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
