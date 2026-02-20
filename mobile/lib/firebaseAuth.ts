import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile,
    reload,
    sendEmailVerification,
    type User as FirebaseUser,
} from "firebase/auth";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
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

export type Profile = { name: string; email: string; avatar?: string; accountId?: string; whatsappNumber?: string };
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
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Hungrie User")}&background=FE8C00&color=ffffff`;
const parseWhatsappFromPhoto = (photoUrl?: string | null) =>
    photoUrl && photoUrl.startsWith("wa:") ? photoUrl.replace("wa:", "") : undefined;
const mapFirebaseUser = (user: FirebaseUser, overrides: Partial<Profile> = {}): Profile & { accountId: string } => {
    const name = overrides.name || user.displayName || user.email || "Hungrie User";
    const whatsappNumber = overrides.whatsappNumber ?? parseWhatsappFromPhoto(user.photoURL);
    return {
        name,
        email: user.email || overrides.email || "operator@hungrie.app",
        avatar: overrides.avatar || avatarUrl(name),
        accountId: user.uid,
        whatsappNumber,
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

const ensureVerified = async (user: FirebaseUser | null) => {
    if (!user) return null;
    await reload(user).catch(() => null);
    if (user.emailVerified) return user;
    await firebaseSignOut(requireAuth()).catch(() => null);
    throw new Error("Please verify your email using the link we sent and then sign in again.");
};

const syncProfile = async (user: FirebaseUser, overrides: Partial<Profile> = {}) => {
    const db = requireDB();
    const name = overrides.name || user.displayName || user.email || "Hungrie User";
    const base: Profile & { accountId: string } = {
        name,
        email: user.email || overrides.email || "operator@hungrie.app",
        avatar: overrides.avatar || avatarUrl(name),
        accountId: user.uid,
        whatsappNumber: overrides.whatsappNumber ?? parseWhatsappFromPhoto(user.photoURL),
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
        stored.name !== merged.name ||
        stored.email !== merged.email ||
        stored.avatar !== merged.avatar ||
        stored.whatsappNumber !== merged.whatsappNumber ||
        !stored.accountId;
    if (needsUpdate) {
        await setDoc(
            ref,
            {
                name: merged.name,
                email: merged.email,
                avatar: merged.avatar,
                whatsappNumber: merged.whatsappNumber,
                accountId: merged.accountId,
                updatedAt: now,
            },
            { merge: true },
        ).catch(() => null);
    }
    return merged;
};

// Auth
export const signIn = async ({ email, password }: { email: string; password: string }) => {
    try {
        const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
        const verifiedUser = await ensureVerified(credential.user);
        return verifiedUser ? syncProfile(verifiedUser) : null;
    } catch (e) {
        throw new Error(parseErr(e));
    }
};

export const createUser = async ({
    email,
    password,
    name,
    whatsappNumber,
}: {
    email: string;
    password: string;
    name: string;
    whatsappNumber?: string;
}) => {
    try {
        const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
        const user = credential.user;
        if (user) {
            await updateProfile(user, {
                displayName: name,
                photoURL: whatsappNumber ? `wa:${whatsappNumber}` : user.photoURL ?? undefined,
            }).catch(() => null);
            await sendEmailVerification(user).catch(() => null);
        }
        const target = user || (await waitForAuthUser());
        if (!target) throw new Error("User session could not be established.");
        await ensureVerified(target);
        return null;
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
    if (!current) return null;
    const verified = await ensureVerified(current).catch(() => null);
    return verified ? syncProfile(verified) : null;
};

export const signOut = async () => firebaseSignOut(requireAuth());

export const sendPasswordReset = async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) throw new Error("Email is required.");
    try {
        await sendPasswordResetEmail(requireAuth(), trimmed);
    } catch (e) {
        throw new Error(parseErr(e));
    }
};

export const getOwnedRestaurantId = async () => {
    if (!firebaseConfigured || !firestore) return null;
    const owner = auth?.currentUser?.uid;
    if (!owner) return null;
    const q = query(
        collection(requireDB(), FIREBASE_COLLECTIONS.restaurants),
        where("ownerId", "==", owner),
        where("isActive", "==", true),
    );
    const snap = await getDocs(q).catch(() => null);
    if (!snap || snap.empty) return null;
    return snap.docs[0].id;
};

export const updateUserProfile = async ({
    name,
    whatsappNumber,
}: {
    name?: string;
    whatsappNumber?: string;
}) => {
    const authUser = await waitForAuthUser();
    if (!authUser) throw new Error("User is not signed in.");
    const db = requireDB();
    const updates: Partial<Profile> = {};
    if (name) updates.name = name;
    if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber;

    await updateProfile(authUser, {
        displayName: name ?? authUser.displayName ?? undefined,
        photoURL: whatsappNumber ? `wa:${whatsappNumber}` : authUser.photoURL ?? undefined,
    }).catch(() => null);

    await setDoc(
        doc(db, FIREBASE_COLLECTIONS.users, authUser.uid),
        {
            ...(name ? { name } : {}),
            ...(whatsappNumber !== undefined ? { whatsappNumber } : {}),
            updatedAt: Date.now(),
        },
        { merge: true },
    ).catch(() => null);

    return syncProfile(authUser, updates);
};

// ---- Stubbed data helpers to avoid Firestore access ----
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
    if (!firebaseConfigured || !firestore) return [];

    const snap = await getDocs(collection(requireDB(), FIREBASE_COLLECTIONS.menus));
    //console.log("Menus",snap.docs);
    if (snap.empty) return [];
    return applyFilters(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
};

export const getCategories = async () => {
    if (!firebaseConfigured || !firestore) return [];
    const snap = await getDocs(collection(requireDB(), FIREBASE_COLLECTIONS.categories));
    
    if (snap.empty) return [];
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Stubbed order creation for API compatibility
export const createOrderDocument = async (orderData: Record<string, any>, orderItems: Record<string, any>[]) => {
    return {
        id: orderData?.id || `order-${Date.now()}`,
        ...orderData,
        orderItems,
        status: orderData?.status || "pending",
        createdAt: orderData?.createdAt || Date.now(),
    };
};

// Restaurants & menus
const ownerId = () => auth?.currentUser?.uid ?? null;

/*export const getOwnerRestaurants = async () => {
    const owner = ownerId();
    if (!owner) return [];
    const q = query(collection(requireDB(), FIREBASE_COLLECTIONS.restaurants), where("ownerId", "==", owner));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};*/

/*export const createRestaurant = async (payload: {
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
};*/

export const getRestaurantMenu = async ({ restaurantId }: { restaurantId: string }) => {
    if (!firebaseConfigured || !firestore) return [];
    try {
        const result = await fetchRestaurantMenu(restaurantId);
        if (!result || !Array.isArray(result) || !result.length) return [];
        return filterRestaurantMenuForCustomer(restaurantId, result);
    } catch (error) {
        //const fallback = sampleMenu[restaurantId] || Object.values(sampleMenu).flat();
        return [];
    }
};

/*export const createMenuItem = async (
    restaurantId: string,
    payload: { name: string; price: string | number; description?: string; imageUrl?: string },
) => {
    return createMenuItemCore(restaurantId, payload);
};*/

// Orders
export const listenToOrders = (
    filter: { restaurantId?: string; statuses?: string[] },
    onChange: (orders: any[]) => void,
    onError?: (error: Error) => void,
) => {
    if (!firebaseOrdersEnabled) {
        onChange([]);
        return () => {};
    }

    const constraints: any[] = [];
    if (filter.restaurantId) {
        constraints.push(where("restaurantId", "==", String(filter.restaurantId)));
    }
    if (filter.statuses?.length) {
        constraints.push(where("status", "in", filter.statuses));
    }
    const q = constraints.length
        ? query(collection(requireDB(), FIREBASE_COLLECTIONS.orders), ...constraints)
        : query(collection(requireDB(), FIREBASE_COLLECTIONS.orders));

    return onSnapshot(
        q,
        (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            onChange(items);
        },
        (err) => {
            onError?.(err as any);
        },
    );
};

export const assignCourier = async (orderId: string, courierLabel: string, currentStatus?: string) => {
    if (!orderId) throw new Error("orderId is required.");
    if (!firebaseOrdersEnabled) return { id: orderId, courierLabel, status: currentStatus || "pending" };
    const ref = doc(requireDB(), FIREBASE_COLLECTIONS.orders, orderId);
    await updateDoc(ref, { courierLabel, updatedAt: Date.now() });
    return { id: orderId, courierLabel, status: currentStatus };
};

export const updateOrderStatus = async (orderId: string, status: string) => {
    if (!orderId) throw new Error("orderId is required.");
    if (!status) throw new Error("status is required.");
    if (!firebaseOrdersEnabled) return { id: orderId, status };
    const ref = doc(requireDB(), FIREBASE_COLLECTIONS.orders, orderId);
    await updateDoc(ref, { status, updatedAt: Date.now() });
    return { id: orderId, status };
};
