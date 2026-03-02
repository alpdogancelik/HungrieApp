import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, firestore } from "@/lib/firebase";
import type { Address, CartItem, OrderStatus, PaymentMethod } from "@/src/domain/types";

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
        updatedAt: serverTimestamp(),
    }));
    return ref.id;
};

export const subscribeOrder = (orderId: string, cb: (order: any | null) => void) =>
    onSnapshot(doc(ensureDb(), "orders", orderId), (snap) => {
        if (!snap.exists()) return cb(null);
        cb({ id: snap.id, ...snap.data() });
    });

export const subscribeUserOrders = (userId: string, cb: (orders: any[]) => void) =>
    onSnapshot(query(ordersCol(), where("userId", "==", userId)), (snap) =>
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );

export const subscribeRestaurantOrders = (
    restaurantId: string,
    statuses: string[] = ["pending", "accepted", "preparing", "ready", "out_for_delivery"],
    cb?: (orders: any[]) => void,
) => {
    const q = query(ordersCol(), where("restaurantId", "==", restaurantId), where("status", "in", statuses));
    return onSnapshot(q, (snap) =>
        cb
            ? cb(
                  snap.docs
                      .map((d) => ({ id: d.id, ...d.data() }))
                      .filter((order: any) => {
                          const raw = String(order?.status || "").toLowerCase();
                          return !["canceled", "cancelled", "rejected", "delivered"].includes(raw);
                      }),
              )
            : undefined,
    );
};

export const subscribeRestaurantPastOrders = (restaurantId: string, cb: (orders: any[]) => void) => {
    const q = query(
        ordersCol(),
        where("restaurantId", "==", restaurantId),
        where("status", "in", ["rejected", "delivered", "canceled"]),
    );
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const subscribeRestaurantReminderOrders = (restaurantId: string, cb: (orders: any[]) => void) => {
    const q = query(
        ordersCol(),
        where("restaurantId", "==", restaurantId),
        where("reminderPending", "==", true),
    );
    return onSnapshot(q, (snap) =>
        cb(
            snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
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
    });
};

export const transitionOrder = async (orderId: string, status: OrderStatus | string) =>
    updateDoc(doc(ensureDb(), "orders", orderId), {
        status,
        ...(status !== "pending"
            ? {
                  reminderPending: false,
                  reminderHandledAt: serverTimestamp(),
              }
            : null),
        updatedAt: serverTimestamp(),
    });
