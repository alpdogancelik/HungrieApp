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

const extra: Record<string, string | undefined> = Constants.expoConfig?.extra || {};
const env = (name: string) =>
    (typeof process !== "undefined" ? (process as any).env?.[name] : undefined) || (extra[name] as string | undefined);

// Enable App Check debug token for local/dev if provided.
const appCheckDebugToken = env("EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN");
if (appCheckDebugToken && typeof globalThis !== "undefined") {
    (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
}

const defaultFirebaseConfig = {
    apiKey: "AIzaSyAqR--zHc7u-JF0EkJ5boTYjqew1HG3Kvs",
    authDomain: "hungrie-b5458.firebaseapp.com",
    projectId: "hungrie-b5458",
    storageBucket: "hungrie-b5458.firebasestorage.app",
    messagingSenderId: "115590895272",
    appId: "1:115590895272:web:0b89fe4164a8d7cba8549d",
    measurementId: "G-NC9CL8HT4C",
    databaseURL: "https://hungrie-b5458-default-rtdb.firebaseio.com",
};

const firebaseConfig = {
    apiKey: env("EXPO_PUBLIC_FIREBASE_API_KEY") || defaultFirebaseConfig.apiKey,
    authDomain: env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN") || defaultFirebaseConfig.authDomain,
    projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID") || defaultFirebaseConfig.projectId,
    storageBucket: env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET") || defaultFirebaseConfig.storageBucket,
    messagingSenderId: env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") || defaultFirebaseConfig.messagingSenderId,
    appId: env("EXPO_PUBLIC_FIREBASE_APP_ID") || defaultFirebaseConfig.appId,
    measurementId: env("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID") || defaultFirebaseConfig.measurementId,
    databaseURL: env("EXPO_PUBLIC_FIREBASE_DATABASE_URL") || defaultFirebaseConfig.databaseURL,
};

// Allow Firebase by default; can be disabled by setting EXPO_PUBLIC_DISABLE_FIREBASE.
const firebaseDisabledForDemo = env("EXPO_PUBLIC_DISABLE_FIREBASE") === "true";

const firebaseConfigured =
    !firebaseDisabledForDemo && Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let firebaseApp: FirebaseApp | undefined;

if (firebaseConfigured) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
} else if (firebaseDisabledForDemo && __DEV__) {
    console.info("[Firebase] Disabled via EXPO_PUBLIC_DISABLE_FIREBASE flag.");
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

const ensureFirestore = () => {
    if (!firebaseConfigured || !firestore) {
        throw new Error("Firebase is not configured yet.");
    }
    return firestore;
};

export const getRestaurants = async () => {
    const db = ensureFirestore();
    const snapshot = await getDocs(collection(db, FIREBASE_COLLECTIONS.restaurants));
    return snapshot.docs.map(mapSnapshot);
};

export const getRestaurantMenu = async (restaurantId: string) => {
    if (!restaurantId) return [];
    const db = ensureFirestore();
    const q = query(collection(db, FIREBASE_COLLECTIONS.menus), where("restaurantId", "==", restaurantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((snap) => {
        const data = snap.data();
        return {
            ...mapSnapshot(snap),
            price: Number(data.price ?? 0),
        };
    });
};

export const createMenuItem = async (restaurantId: string, payload: MenuPayload) => {
    if (!restaurantId) throw new Error("restaurantId is required.");
    const db = ensureFirestore();

    const data = {
        ...payload,
        restaurantId,
        price: Number(payload.price),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    const ref = await addDoc(collection(db, FIREBASE_COLLECTIONS.menus), data);
    return { id: ref.id, ...data };
};

export const updateMenuItem = async (itemId: string, updates: Partial<MenuPayload>) => {
    if (!itemId) throw new Error("Menu item id is required.");
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

export { firebaseConfig, firebaseConfigured, firebaseApp, auth, firestore, FIREBASE_COLLECTIONS };
