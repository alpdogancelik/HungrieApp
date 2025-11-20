import Constants from "expo-constants";
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import {
    DocumentData,
    Firestore,
    addDoc,
    collection,
    doc,
    getDocs,
    getFirestore,
    query,
    updateDoc,
    where,
} from "firebase/firestore";

import { sampleMenu, sampleOwnerRestaurants } from "./sampleData";

const extra: Record<string, string | undefined> = Constants.expoConfig?.extra || {};
const env = (name: string) =>
    (typeof process !== "undefined" ? (process as any).env?.[name] : undefined) || (extra[name] as string | undefined);

const firebaseConfig = {
    apiKey: env("EXPO_PUBLIC_FIREBASE_API_KEY") || "",
    authDomain: env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN") || "",
    projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID") || "",
    storageBucket: env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET") || "",
    messagingSenderId: env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") || "",
    appId: env("EXPO_PUBLIC_FIREBASE_APP_ID") || "",
    measurementId: env("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID") || "",
};

// Firebase is intentionally disabled so the app can run as an Appwrite-only demo.
// Set this to false (and provide EXPO_PUBLIC_FIREBASE_* values) to re-enable.
const firebaseDisabledForDemo = true;

const firebaseConfigured =
    !firebaseDisabledForDemo && Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const useMockData = env("EXPO_PUBLIC_USE_MOCK_DATA") === "true";

let firebaseApp: FirebaseApp | undefined;

if (firebaseConfigured) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
} else if (firebaseDisabledForDemo && __DEV__) {
    console.info("[Firebase] Disabled for Appwrite demo. Flip firebaseDisabledForDemo to re-enable.");
} else if (__DEV__) {
    console.warn("[Firebase] Missing config. Populate EXPO_PUBLIC_FIREBASE_* values in app.json.");
}

const auth: Auth | undefined = firebaseApp ? getAuth(firebaseApp) : undefined;
const firestore: Firestore | undefined = firebaseApp ? getFirestore(firebaseApp) : undefined;

const FIREBASE_COLLECTIONS = {
    users: "users",
    restaurants: "restaurants",
    menus: "menus",
    orders: "orders",
    categories: "categories",
} as const;

type MenuPayload = {
    name: string;
    price: number | string;
    description?: string;
    imageUrl?: string;
};

const mapSnapshot = (snap: { id: string; data: () => DocumentData }) => ({
    id: snap.id,
    ...snap.data(),
});

const fallbackRestaurants = () =>
    sampleOwnerRestaurants.map((restaurant) => ({
        ...restaurant,
        id: String(restaurant.id ?? restaurant.name),
    }));

const fallbackMenu = (restaurantId?: string) => {
    if (!restaurantId) return [];
    const list = sampleMenu[Number(restaurantId)] || Object.values(sampleMenu).flat();
    return list.map((item) => ({
        ...item,
        id: String(item.id ?? item.$id ?? `${restaurantId}-${item.name}`),
        restaurantId,
        price: Number(item.price),
    }));
};

const ensureFirestore = () => {
    if (!firebaseConfigured || !firestore) {
        throw new Error("Firebase is not configured yet.");
    }
    return firestore;
};

export const getRestaurants = async () => {
    if (!firebaseConfigured || !firestore || useMockData) {
        return fallbackRestaurants();
    }

    try {
        const snapshot = await getDocs(collection(firestore, FIREBASE_COLLECTIONS.restaurants));
        return snapshot.docs.map(mapSnapshot);
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getRestaurants failed, falling back to mock data.", error);
        return fallbackRestaurants();
    }
};

export const getRestaurantMenu = async (restaurantId: string) => {
    if (!restaurantId) return [];
    if (!firebaseConfigured || !firestore || useMockData) {
        return fallbackMenu(restaurantId);
    }

    try {
        const q = query(
            collection(firestore, FIREBASE_COLLECTIONS.menus),
            where("restaurantId", "==", restaurantId),
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((snap) => {
            const data = snap.data();
            return {
                ...mapSnapshot(snap),
                price: Number(data.price ?? 0),
            };
        });
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] getRestaurantMenu failed, returning mock menu.", error);
        return fallbackMenu(restaurantId);
    }
};

export const createMenuItem = async (restaurantId: string, payload: MenuPayload) => {
    if (!restaurantId) throw new Error("restaurantId is required.");
    if (!firebaseConfigured || !firestore || useMockData) {
        return {
            ...payload,
            id: `mock-menu-${Date.now()}`,
            restaurantId,
            price: Number(payload.price),
        };
    }

    const data = {
        ...payload,
        restaurantId,
        price: Number(payload.price),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    try {
        const ref = await addDoc(collection(firestore, FIREBASE_COLLECTIONS.menus), data);
        return { id: ref.id, ...data };
    } catch (error) {
        if (__DEV__) console.warn("[Firebase] createMenuItem failed, returning mock entry.", error);
        return {
            ...data,
            id: `mock-menu-${Date.now()}`,
        };
    }
};

export const updateMenuItem = async (itemId: string, updates: Partial<MenuPayload>) => {
    if (!itemId) throw new Error("Menu item id is required.");
    if (!firebaseConfigured || !firestore || useMockData) {
        return {
            id: itemId,
            ...updates,
            price: updates.price !== undefined ? Number(updates.price) : undefined,
        };
    }

    const ref = doc(ensureFirestore(), FIREBASE_COLLECTIONS.menus, itemId);
    const sanitized: Record<string, any> = { updatedAt: Date.now() };
    const response: Record<string, unknown> = { id: itemId };

    Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) return;
        const nextValue = key === "price" ? Number(value) : value;
        sanitized[key] = nextValue;
        response[key] = nextValue;
    });

    await updateDoc(ref, sanitized);
    return response;
};

export { firebaseConfig, firebaseConfigured, firebaseApp, auth, firestore, useMockData, FIREBASE_COLLECTIONS };
