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
import type { CartItem, OrderStatus, PaymentMethod } from "@/src/domain/types";

const ensureDb = () => {
    if (!firestore) throw new Error("Firebase is not configured");
    return firestore;
};

const ensureAuthSession = async () => {
    if (!auth) return;
    if (auth.currentUser) return;
    try {
        await signInAnonymously(auth);
    } catch (error) {
        console.warn("[Firebase] Anonymous sign-in failed", error);
    }
};

const ordersCol = () => collection(ensureDb(), "orders");

export const placeOrder = async ({
    userId,
    restaurantId,
    items,
    paymentMethod = "pos",
    fees = {},
    etaMinutes = 25,
}: {
    userId: string;
    restaurantId: string;
    items: CartItem[];
    paymentMethod?: PaymentMethod;
    fees?: { deliveryFee?: number; serviceFee?: number; discount?: number; tip?: number };
    etaMinutes?: number;
}) => {
    await ensureAuthSession();

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const { deliveryFee = 0, serviceFee = 0, discount = 0, tip = 0 } = fees;
    const total = subtotal + deliveryFee + serviceFee + tip - discount;

    const ref = await addDoc(ordersCol(), {
        userId,
        restaurantId,
        items,
        paymentMethod,
        status: "pending",
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        tip,
        total,
        etaMinutes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
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

export const subscribeRestaurantOrders = (restaurantId: string, cb: (orders: any[]) => void) => {
    const q = query(
        ordersCol(),
        where("restaurantId", "==", restaurantId),
        where("status", "in", ["pending", "preparing", "ready", "out_for_delivery"]),
    );
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const transitionOrder = async (orderId: string, status: OrderStatus) =>
    updateDoc(doc(ensureDb(), "orders", orderId), { status, updatedAt: serverTimestamp() });
