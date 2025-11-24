import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile,
    type User as FirebaseUser,
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
    getRestaurantMenu as fetchRestaurantMenu,
    createMenuItem as createMenuItemCore,
} from "./firebase";
import { filterMenuForCustomer, filterRestaurantMenuForCustomer } from "./menuVisibility";
import { sampleCategories, sampleMenu } from "./sampleData";

export type Profile = { name: string; email: string; avatar?: string; accountId?: string };
export const firebaseOrdersEnabled = firebaseConfigured && Boolean(firestore);
export const getMockOwnerAccount = async () => null;
export const clearMockOwnerAccount = async () => undefined;

const requireAuth = () => {
    if (!firebaseConfigured || !auth) throw new Error("Firebase authentication is not configured.");
    return auth;
};
const requireDB = () => {
    if (!firebaseConfigured || !firestore) throw new Error("Firebase Firestore is not configured.");
    return firestore;
};
const avatarUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Hungrie User")}&background=FF8C42&color=ffffff`;
const mapDoc = (snap: { id: string; data: () => any }) => ({ id: snap.id, ...snap.data() });
const mapOrder = (snap: { id: string; data: () => any }) => {
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
const parseErr = (e: any) => (typeof e === "string" ? e : e?.message || "Unexpected error occurred.");

const waitForAuthUser = async (): Promise<FirebaseUser | null> => {
    const firebaseAuth = auth;
    if (!firebaseAuth) return null;
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser;

    return new Promise((resolve) => {
        const done = (u: FirebaseUser | null) => resolve(u);
        const unsub = onAuthStateChanged(
            firebaseAuth,
            (u) => {
                unsub();
                done(u);
            },
            () => {
                unsub();
                done(null);
            },
        );
        setTimeout(() => {
            unsub();
            done(firebaseAuth.currentUser ?? null);
        }, 2000);
    });
};

const syncProfile = async (user: FirebaseUser, overrides: Partial<Profile> = {}) => {
    const db = requireDB();
    const name = overrides.name || user.displayName || user.email || "Hungrie User";
    const base: Profile & { accountId: string } = {
        name,
        email: user.email || overrides.email || "operator@hungrie.app",
        avatar: overrides.avatar || avatarUrl(name),
        accountId: user.uid,
    };
    const ref = doc(db, FIREBASE_COLLECTIONS.users, user.uid);
    const snap = await getDoc(ref).catch(() => null);
    const now = Date.now();
    if (!snap || !snap.exists()) {
        await setDoc(ref, { ...base, ...overrides, createdAt: now, updatedAt: now }, { merge: true });
        return base;
    }
    const stored = snap.data() as Profile & { accountId?: string };
    const merged = { ...base, ...stored, accountId: stored.accountId || user.uid };
    const needsUpdate =
        stored.name !== merged.name || stored.email !== merged.email || stored.avatar !== merged.avatar || !stored.accountId;
    if (needsUpdate) {
        await setDoc(
            ref,
            { name: merged.name, email: merged.email, avatar: merged.avatar, accountId: merged.accountId, updatedAt: now },
            { merge: true },
        ).catch(() => null);
    }
    return merged;
};

// Auth
export const signIn = async ({ email, password }: { email: string; password: string }) => {
    try {
        const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
        if (credential.user) await syncProfile(credential.user);
        return { email };
    } catch (e) {
        throw new Error(parseErr(e));
    }
};

export const createUser = async ({ email, password, name }: { email: string; password: string; name: string }) => {
    try {
        const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
        const user = credential.user;
        if (user && name) await updateProfile(user, { displayName: name }).catch(() => null);
        const target = user || (await waitForAuthUser());
        if (!target) throw new Error("User session could not be established.");
        return syncProfile(target, { name: name || target.displayName || email, email: target.email || email, avatar: avatarUrl(name || email) });
    } catch (e: any) {
        if (e?.code === "auth/email-already-in-use") {
            await signIn({ email, password });
            const existing = await getCurrentUser();
            if (existing) return existing;
        }
        throw new Error(parseErr(e));
    }
};

export const getCurrentUser = async () => {
    const current = await waitForAuthUser();
    return current ? syncProfile(current) : null;
};

export const signOut = async () => firebaseSignOut(requireAuth());

// Menu & categories
export const getMenu = async ({ category, query, limit }: { category?: string; query?: string; limit?: number }) => {
    const applyFilters = (raw: any[]) => {
        let list = raw.map((item) => ({ ...item, price: Number(item.price ?? 0) }));
        if (category) {
            const term = category.toLowerCase();
            list = list.filter((item: any) => (item.category || item.categories || "").toString().toLowerCase().includes(term));
        }
        if (query) {
            const term = query.toLowerCase();
            list = list.filter(
                (item: any) => item.name?.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term),
            );
        }
        if (limit) list = list.slice(0, limit);
        return filterMenuForCustomer(list);
    };

    if (!firebaseConfigured || !firestore) {
        const fallback = Object.values(sampleMenu).flat();
        return applyFilters(fallback);
    }

    try {
        const snap = await getDocs(collection(requireDB(), FIREBASE_COLLECTIONS.menus));
        if (snap.empty) {
            const fallback = Object.values(sampleMenu).flat();
            return applyFilters(fallback);
        }
        return applyFilters(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
        const fallback = Object.values(sampleMenu).flat();
        return applyFilters(fallback);
    }
};

export const getCategories = async () => {
    const fallbackCategories = Object.values(sampleCategories)[0] || [];
    if (!firebaseConfigured || !firestore) {
        return fallbackCategories;
    }
    try {
        const snap = await getDocs(collection(requireDB(), FIREBASE_COLLECTIONS.categories));
        if (snap.empty) return fallbackCategories;
        return snap.docs.map(mapDoc);
    } catch {
        return fallbackCategories;
    }
};

// Restaurants & menus
const ownerId = () => auth?.currentUser?.uid ?? null;

export const getOwnerRestaurants = async () => {
    const owner = ownerId();
    if (!owner) return [];
    const q = query(collection(requireDB(), FIREBASE_COLLECTIONS.restaurants), where("ownerId", "==", owner));
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc);
};

export const createRestaurant = async (payload: {
    name: string;
    cuisine: string;
    description?: string;
    deliveryFee?: string;
    deliveryTime?: string;
    imageUrl?: string;
}) => {
    const owner = ownerId();
    if (!owner) throw new Error("An owner must be signed in to create restaurants.");
    const data = { ...payload, ownerId: owner, createdAt: Date.now(), updatedAt: Date.now() };
    const ref = await addDoc(collection(requireDB(), FIREBASE_COLLECTIONS.restaurants), data);
    return { id: ref.id, ...data };
};

export const getRestaurantMenu = async ({ restaurantId }: { restaurantId: string }) => {
    if (!firebaseConfigured || !firestore) {
        const fallback = sampleMenu[restaurantId] || Object.values(sampleMenu).flat();
        return filterRestaurantMenuForCustomer(restaurantId, fallback);
    }
    try {
        const result = await fetchRestaurantMenu(restaurantId);
        if (!result || !Array.isArray(result) || !result.length) {
            const fallback = sampleMenu[restaurantId] || Object.values(sampleMenu).flat();
            return filterRestaurantMenuForCustomer(restaurantId, fallback);
        }
        return filterRestaurantMenuForCustomer(restaurantId, result);
    } catch (error) {
        const fallback = sampleMenu[restaurantId] || Object.values(sampleMenu).flat();
        return filterRestaurantMenuForCustomer(restaurantId, fallback);
    }
};

export const createMenuItem = async (
    restaurantId: string,
    payload: { name: string; price: string | number; description?: string; imageUrl?: string },
) => createMenuItemCore(restaurantId, payload);

// Orders
export const createOrderDocument = async (orderData: Record<string, any>, orderItems: Record<string, any>[]) => {
    const now = Date.now();
    const restaurantId = String(orderData.restaurantId ?? orderData.restaurant?.id ?? orderData.restaurantID ?? "unknown");
    const payload = { ...orderData, restaurantId, orderItems, status: orderData.status || "pending approval", courierLabel: orderData.courierLabel ?? null, createdAt: now, updatedAt: now };
    const ref = await addDoc(collection(requireDB(), FIREBASE_COLLECTIONS.orders), payload);
    await updateDoc(ref, { orderId: ref.id });
    return { id: ref.id, orderId: ref.id, ...payload };
};

export const listenToOrder = (
    orderId: string,
    onChange: (order: any | null) => void,
    onError?: (error: Error) => void,
) => {
    if (!orderId) return () => { };
    const ref = doc(requireDB(), FIREBASE_COLLECTIONS.orders, orderId);
    return onSnapshot(
        ref,
        (snap) => onChange(snap.exists() ? mapOrder(snap as any) : null),
        (err) => {
            if (__DEV__) console.warn("[Firebase] listenToOrder failed.", err);
            onError?.(err as Error);
        },
    );
};

export const listenToOrders = (
    filter: { restaurantId?: string; statuses?: string[] },
    onChange: (orders: any[]) => void,
    onError?: (error: Error) => void,
) => {
    const db = requireDB();
    const colRef = collection(db, FIREBASE_COLLECTIONS.orders);
    const constraints: any[] = [];
    if (filter.restaurantId) constraints.push(where("restaurantId", "==", filter.restaurantId));
    if (filter.statuses?.length) constraints.push(where("status", "in", filter.statuses.slice(0, 10)));
    constraints.push(orderBy("createdAt", "desc"));
    const q = query(colRef, ...constraints);
    return onSnapshot(
        q,
        (snap) => onChange(snap.docs.map(mapOrder)),
        (err) => {
            if (__DEV__) console.warn("[Firebase] listenToOrders failed.", err);
            onError?.(err as Error);
        },
    );
};

export const assignCourier = async (orderId: string, courierLabel: string, currentStatus?: string) => {
    const ref = doc(requireDB(), FIREBASE_COLLECTIONS.orders, orderId);
    const updates: Record<string, unknown> = { courierLabel, updatedAt: Date.now() };
    if (!currentStatus || currentStatus === "pending" || currentStatus === "pending approval") updates.status = "preparing";
    await updateDoc(ref, updates);
    return { id: orderId, courierLabel };
};

export const getRestaurantOrders = async (restaurantId: string) => {
    if (!restaurantId) return [];
    const q = query(collection(requireDB(), FIREBASE_COLLECTIONS.orders), where("restaurantId", "==", restaurantId));
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc);
};

export const updateOrderStatus = async (orderId: string, status: string) => {
    const ref = doc(requireDB(), FIREBASE_COLLECTIONS.orders, orderId);
    const normalized = status === "approved" ? "preparing" : status;
    await updateDoc(ref, { status: normalized, updatedAt: Date.now() });
    return { id: orderId, status: normalized };
};
