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
import { signInAnonymously } from "firebase/auth";
import { auth, firestore } from "@/lib/firebase";
import type { Address, CartItem, OrderStatus, PaymentMethod } from "@/src/domain/types";
import { recomputeRestaurantMetrics } from "@/src/services/restaurantMetrics";

const ensureDb = () => {
    if (!firestore) throw new Error("Firebase is not configured");
    return firestore;
};

const ensureAuthSession = async () => {
    if (!auth) return;
    if (auth.currentUser) return;
    await (auth as any).authStateReady?.().catch(() => null);
    if (auth.currentUser) return;
    try {
        await signInAnonymously(auth);
    } catch (error) {
        console.warn("[Firebase] Anonymous sign-in failed", error);
    }
};

const ordersCol = () => collection(ensureDb(), "orders");
const compactObject = <T extends Record<string, any>>(value: T) =>
    Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));
const ACTIVE_RESTAURANT_STATUSES = ["pending", "accepted", "preparing", "ready", "out_for_delivery"] as const;
const PAST_RESTAURANT_STATUSES = ["rejected", "delivered", "canceled"] as const;

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
    onSnapshot(doc(ensureDb(), "orders", orderId), (snap) => {
        if (!snap.exists()) return cb(null);
        cb({ id: snap.id, ...snap.data() });
    });

export const subscribeUserOrders = (userId: string, cb: (orders: any[]) => void) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
        cb([]);
        return () => undefined;
    }
    return onSnapshot(query(ordersCol(), where("userId", "==", normalizedUserId), orderBy("createdAtMs", "desc"), limit(30)), (snap) =>
        cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    );
};

export const fetchUserOrders = async (userId: string) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return [];
    const snap = await getDocs(query(ordersCol(), where("userId", "==", normalizedUserId), orderBy("createdAtMs", "desc"), limit(30)));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
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
    return onSnapshot(q, (snap) =>
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
    return onSnapshot(q, (snap) =>
        cb(
            snap.docs
                .map((d) => ({ ...d.data(), id: d.id }))
                .filter((order: any) => !["delivered", "canceled", "rejected"].includes(String(order?.status || "").toLowerCase())),
        ),
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
