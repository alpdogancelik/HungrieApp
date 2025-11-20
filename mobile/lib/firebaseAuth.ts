import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
} from "firebase/auth";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import {
    FIREBASE_COLLECTIONS,
    auth,
    firebaseConfigured,
    firestore,
    useMockData,
    getRestaurantMenu as getRestaurantMenuCore,
    createMenuItem as createMenuItemCore,
} from "./firebase";
import {
    sampleCategories,
    sampleMenu,
    sampleOwnerRestaurants,
    sampleRestaurantOrders,
} from "./sampleData";

export type Profile = { name: string; email: string; avatar?: string };

const mapDoc = (snap: { id: string; data: () => any }) => ({
    id: snap.id,
    ...snap.data(),
});

const avatarUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Hungrie User")}&background=FF8C42&color=ffffff`;

const getMockMenus = ({ query }: { query?: string }) => {
    const all = Object.values(sampleMenu).flat();
    if (!query) return all;
    const term = query.toLowerCase();
    return all.filter(
        (item: any) =>
            item.name?.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term),
    );
};

const getMockCategories = () => Object.values(sampleCategories).flat();

const getMockRestaurants = () =>
    sampleOwnerRestaurants.map((restaurant) => ({
        ...restaurant,
        id: String(restaurant.id ?? restaurant.name),
    }));

const getMockOrders = (restaurantId?: string) =>
    sampleRestaurantOrders.map((order) => ({
        ...order,
        id: String(order.id ?? `${restaurantId ?? "sample"}-${order.customerName}`),
        restaurantId: restaurantId ?? "sample",
        courierLabel: (order as any).courierLabel ?? null,
    }));

const mapOrderDoc = (snap: { id: string; data: () => any }) => {
    const data = snap.data() || {};
    return {
        id: snap.id,
        orderId: data.orderId || snap.id,
        ...data,
        total: Number(data.total ?? data.totalPrice ?? data.amount ?? 0),
        courierLabel: data.courierLabel ?? null,
        status: data.status || "pending",
    };
};

const buildMockProfile = (overrides: Partial<Profile> = {}): Profile => ({
    name: overrides.name || "Campus Operator",
    email: overrides.email || "owner@hungrie.app",
    avatar: overrides.avatar || avatarUrl(overrides.name || "Campus Operator"),
});

const parseFirebaseError = (error: any) => {
    if (typeof error === "string") return error;
    if (error?.message) return error.message;
    return "Unexpected error occurred.";
};

const shouldUseFirebase = firebaseConfigured && !useMockData;
export const firebaseOrdersEnabled = shouldUseFirebase;

const currentOwnerId = () => auth?.currentUser?.uid ?? null;

export const signIn = async ({ email, password }: { email: string; password: string }) => {
    if (!shouldUseFirebase) {
        return { sessionId: `mock-session-${Date.now()}`, email };
    }

    if (!auth) throw new Error("Authentication is not ready yet.");

    try {
        await signInWithEmailAndPassword(auth, email, password);
        return { email };
    } catch (error) {
        throw new Error(parseFirebaseError(error));
    }
};

export const createUser = async ({
    email,
    password,
    name,
}: {
    email: string;
    password: string;
    name: string;
}) => {
    if (!shouldUseFirebase || !auth || !firestore) {
        return buildMockProfile({ name, email });
    }

    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const user = credential.user;
        if (user && name) {
            try {
                await updateProfile(user, { displayName: name });
            } catch {
                // Ignore profile update failures; we'll still create Firestore doc.
            }
        }

        const profile: Profile & { accountId: string } = {
            name: name || user?.displayName || email,
            email: user?.email || email,
            avatar: avatarUrl(name || email),
            accountId: user?.uid || `pending-${Date.now()}`,
        };

        await setDoc(doc(firestore, FIREBASE_COLLECTIONS.users, profile.accountId), profile, { merge: true });
        return profile;
    } catch (error: any) {
        if (error?.code === "auth/email-already-in-use") {
            await signIn({ email, password });
            const existing = await getCurrentUser();
            if (existing) return existing;
        }
        throw new Error(parseFirebaseError(error));
    }
};

export const getCurrentUser = async () => {
    if (!shouldUseFirebase || !auth) {
        return buildMockProfile();
    }

    const current = auth.currentUser;
    if (!current) return null;

    const fallback: Profile = {
        name: current.displayName || current.email || "Hungrie User",
        email: current.email || "operator@hungrie.app",
        avatar: avatarUrl(current.displayName || current.email || "Hungrie User"),
    };

    if (!firestore) return fallback;

    try {
        const ref = doc(firestore, FIREBASE_COLLECTIONS.users, current.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            await setDoc(ref, fallback, { merge: true });
            return fallback;
        }
        const profile = snap.data() as Profile;
        return {
            ...fallback,
            ...profile,
        };
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getCurrentUser failed, falling back.", error);
        return fallback;
    }
};

export const getMenu = async ({ category, query, limit }: { category?: string; query?: string; limit?: number }) => {
    const fallback = () => {
        let list = getMockMenus({ query });
        if (category) {
            const normalized = category.toLowerCase();
            list = list.filter(
                (item: any) =>
                    item.name?.toLowerCase().includes(normalized) ||
                    item.description?.toLowerCase().includes(normalized),
            );
        }
        if (limit) {
            list = list.slice(0, limit);
        }
        return list;
    };

    if (!shouldUseFirebase || !firestore) return fallback();

    try {
        const snapshot = await getDocs(collection(firestore, FIREBASE_COLLECTIONS.menus));
        let list = snapshot.docs.map((snap) => {
            const data = snap.data();
            return {
                id: snap.id,
                ...data,
                price: Number(data.price ?? 0),
            };
        });

        if (category) {
            const normalized = category.toLowerCase();
            list = list.filter((item: any) => {
                const group = (item.category || item.categories || "").toString().toLowerCase();
                return group.includes(normalized);
            });
        }

        if (query) {
            const term = query.toLowerCase();
            list = list.filter(
                (item: any) =>
                    item.name?.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term),
            );
        }

        if (limit) {
            list = list.slice(0, limit);
        }

        return list;
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getMenu failed, returning mock list.", error);
        return fallback();
    }
};

export const getCategories = async () => {
    if (!shouldUseFirebase || !firestore) return getMockCategories();

    try {
        const snapshot = await getDocs(collection(firestore, FIREBASE_COLLECTIONS.categories));
        if (!snapshot.empty) return snapshot.docs.map(mapDoc);
        return getMockCategories();
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getCategories failed.", error);
        return getMockCategories();
    }
};

export const getOwnerRestaurants = async () => {
    const fallback = () => getMockRestaurants();

    if (!shouldUseFirebase || !firestore) return fallback();
    const ownerId = currentOwnerId();
    if (!ownerId) return fallback();

    try {
        const q = query(
            collection(firestore, FIREBASE_COLLECTIONS.restaurants),
            where("ownerId", "==", ownerId),
        );
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(mapDoc);
        return docs.length ? docs : fallback();
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getOwnerRestaurants failed, fallback data used.", error);
        return fallback();
    }
};

export const createRestaurant = async (payload: {
    name: string;
    cuisine: string;
    description?: string;
    deliveryFee?: string;
    deliveryTime?: string;
    imageUrl?: string;
}) => {
    const fallback = () => ({
        ...payload,
        id: `mock-restaurant-${Date.now()}`,
    });

    if (!shouldUseFirebase || !firestore) return fallback();

    try {
        const ownerId = currentOwnerId();
        const data = {
            ...payload,
            ownerId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const ref = await addDoc(collection(firestore, FIREBASE_COLLECTIONS.restaurants), data);
        return { id: ref.id, ...data };
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] createRestaurant failed.", error);
        return fallback();
    }
};

export const getRestaurantMenu = async ({ restaurantId }: { restaurantId: string }) =>
    getRestaurantMenuCore(restaurantId);

export const createMenuItem = async (
    restaurantId: string,
    payload: {
        name: string;
        price: string | number;
        description?: string;
        imageUrl?: string;
    },
) => createMenuItemCore(restaurantId, payload);

export const createOrderDocument = async (
    orderData: Record<string, any>,
    orderItems: Record<string, any>[],
) => {
    const normalizedStatus = orderData.status || "pending approval";
    if (!shouldUseFirebase || !firestore) {
        return {
            id: `mock-order-${Date.now()}`,
            ...orderData,
            orderItems,
            status: normalizedStatus,
            courierLabel: orderData.courierLabel ?? null,
            createdAt: new Date().toISOString(),
        };
    }

    const now = Date.now();
    const restaurantId = String(
        orderData.restaurantId ?? orderData.restaurant?.id ?? orderData.restaurantID ?? "unknown",
    );
    const payload = {
        ...orderData,
        restaurantId,
        orderItems,
        status: normalizedStatus,
        courierLabel: orderData.courierLabel ?? null,
        createdAt: now,
        updatedAt: now,
    };

    const ref = await addDoc(collection(firestore, FIREBASE_COLLECTIONS.orders), payload);
    await updateDoc(ref, { orderId: ref.id });
    return { id: ref.id, orderId: ref.id, ...payload };
};

type ListenOrdersParams = {
    restaurantId?: string;
    statuses?: string[];
};

const filterOrdersByStatus = (orders: any[], statuses?: string[]) => {
    if (!statuses?.length) return orders;
    const allowed = new Set(statuses.map((status) => status.toLowerCase()));
    return orders.filter((order) => allowed.has(String(order.status || "").toLowerCase()));
};

export const listenToOrders = (
    { restaurantId, statuses }: ListenOrdersParams,
    onChange: (orders: any[]) => void,
    onError?: (error: Error) => void,
) => {
    if (!shouldUseFirebase || !firestore) {
        onChange(filterOrdersByStatus(getMockOrders(restaurantId), statuses));
        return () => {};
    }

    try {
        const constraints: any[] = [];
        if (restaurantId) constraints.push(where("restaurantId", "==", restaurantId));
        if (statuses?.length) constraints.push(where("status", "in", statuses));
        constraints.push(orderBy("createdAt", "desc"));

        const q = query(collection(firestore, FIREBASE_COLLECTIONS.orders), ...constraints);
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                onChange(snapshot.docs.map(mapOrderDoc));
            },
            (error) => {
                if (__DEV__) console.warn("[Firebase] listenToOrders failed.", error);
                onError?.(error as Error);
            },
        );
        return unsubscribe;
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] listenToOrders setup error.", error);
        onError?.(error as Error);
        onChange(filterOrdersByStatus(getMockOrders(restaurantId), statuses));
        return () => {};
    }
};

export const listenToOrder = (
    orderId: string,
    onChange: (order: any | null) => void,
    onError?: (error: Error) => void,
) => {
    if (!orderId) return () => {};

    if (!shouldUseFirebase || !firestore) {
        const fallback = getMockOrders().find((order) => String(order.id) === orderId) ?? null;
        onChange(fallback);
        return () => {};
    }

    const ref = doc(firestore, FIREBASE_COLLECTIONS.orders, orderId);
    const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
            if (!snapshot.exists()) {
                onChange(null);
                return;
            }
            onChange(mapOrderDoc(snapshot as any));
        },
        (error) => {
            if (__DEV__) console.warn("[Firebase] listenToOrder failed.", error);
            onError?.(error as Error);
        },
    );
    return unsubscribe;
};

export const assignCourier = async (orderId: string, courierLabel: string, currentStatus?: string) => {
    if (!shouldUseFirebase || !firestore) {
        return { id: orderId, courierLabel };
    }
    try {
        const ref = doc(firestore, FIREBASE_COLLECTIONS.orders, orderId);
        const updates: Record<string, unknown> = {
            courierLabel,
            updatedAt: Date.now(),
        };
        if (!currentStatus || currentStatus === "pending" || currentStatus === "pending approval") {
            updates.status = "preparing";
        }
        await updateDoc(ref, updates);
        return { id: orderId, courierLabel };
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] assignCourier failed.", error);
        throw new Error(parseFirebaseError(error));
    }
};

export const getRestaurantOrders = async (restaurantId: string) => {
    const fallback = () => getMockOrders(restaurantId);

    if (!restaurantId) return fallback();
    if (!shouldUseFirebase || !firestore) return fallback();

    try {
        const q = query(
            collection(firestore, FIREBASE_COLLECTIONS.orders),
            where("restaurantId", "==", restaurantId),
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(mapDoc);
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getRestaurantOrders failed.", error);
        return fallback();
    }
};

export const updateOrderStatus = async (orderId: string, status: string) => {
    const normalizedStatus = status === "approved" ? "preparing" : status;
    if (!shouldUseFirebase || !firestore) return { id: orderId, status: normalizedStatus };

    try {
        const ref = doc(firestore, FIREBASE_COLLECTIONS.orders, orderId);
        await updateDoc(ref, { status: normalizedStatus, updatedAt: Date.now() });
        return { id: orderId, status: normalizedStatus };
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] updateOrderStatus failed.", error);
        return { id: orderId, status: normalizedStatus };
    }
};
