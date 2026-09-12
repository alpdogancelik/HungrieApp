import Constants from 'expo-constants';
import {
    createOrderDocument,
    firebaseOrdersEnabled,
    clearMockOwnerAccount,
    getMockOwnerAccount,
    signOut as firebaseSignOut,
} from "./firebaseAuth";
import { firebaseConfigured, firestore, FIREBASE_COLLECTIONS } from "./firebase";
import { filterRestaurantMenuForCustomer } from "./menuVisibility";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { resolveSeedMenuImageUrl, withBundledRestaurantLogo } from "./catalogNormalization";
import { seedCategoriesByRestaurantId, seedMenuByRestaurantId } from "./restaurantSeeds";
export { resolveSeedMenuImageUrl, withBundledRestaurantLogo } from "./catalogNormalization";

const slugifyCategory = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9çğıöşü]+/gi, "-")
        .replace(/^-+|-+$/g, "");

const sortCatalogRows = (rows: any[], localRows: any[]) => {
    const localOrder = new Map<string, number>();
    localRows.forEach((row, index) => {
        localOrder.set(String(row.id || ""), index);
        localOrder.set(String(row.name || "").trim().toLocaleLowerCase("tr-TR"), index);
    });
    const rank = (row: any) => {
        const explicit = Number(row.sortOrder ?? row.sort_order ?? row.order);
        if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
        const id = String(row.id || "");
        const baseId = String(row.restaurantId || "") && id.startsWith(`${row.restaurantId}_`)
            ? id.slice(String(row.restaurantId).length + 1)
            : id;
        return localOrder.get(baseId)
            ?? localOrder.get(String(row.name || "").trim().toLocaleLowerCase("tr-TR"))
            ?? 1_000_000;
    };
    return [...rows].sort((left, right) => rank(left) - rank(right)
        || String(left.name || "").localeCompare(String(right.name || ""), "tr")
        || String(left.id || "").localeCompare(String(right.id || "")));
};

const extra: any = Constants.expoConfig?.extra || {};
const env = (name: string) => (typeof process !== 'undefined' ? (process as any).env?.[name] : undefined) || extra[name];

// Base URL for our Node server. For web, default to same-origin.
const API_BASE = env('EXPO_PUBLIC_API_BASE_URL') || (typeof window !== 'undefined' ? '' : '');
const forceApiRequests = env('EXPO_PUBLIC_FORCE_API') === 'true';
const isApiConfigured = Boolean(API_BASE && API_BASE.trim() && API_BASE.trim() !== '/');
const shouldBypassNetwork = !forceApiRequests && !isApiConfigured;

const jsonFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        credentials: 'include', // keep session cookie
    });
    const rawText = await res.text().catch(() => '');

    const parseJson = () => {
        if (!rawText) return null;
        try {
            return JSON.parse(rawText);
        } catch {
            const snippet = rawText.slice(0, 200);
            const error: any = new Error(snippet || res.statusText || 'Invalid JSON response');
            error.status = res.status;
            throw error;
        }
    };

    if (!res.ok) {
        try {
            const parsed = parseJson();
            const message =
                typeof parsed === 'string'
                    ? parsed
                    : (parsed && typeof parsed === 'object' && 'message' in parsed)
                        ? (parsed as any).message
                        : rawText || res.statusText;
            const error: any = new Error(message);
            error.status = res.status;
            throw error;
        } catch (error) {
            throw error;
        }
    }

    return parseJson();
};

const withFallback = async <T>(fn: () => Promise<T>, fallback: () => T) => {
    if (shouldBypassNetwork) {
        return fallback();
    }
    try {
        return await fn();
    } catch (error: any) {
        if (error?.status === 404 || error?.status === 401) {
            return fallback();
        }
        throw error;
    }
};

const buildQuery = (params?: Record<string, string | number | boolean | undefined>) => {
    if (!params) return '';
    const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!entries.length) return '';
    const query = new URLSearchParams();
    entries.forEach(([key, value]) => query.append(key, String(value)));
    return `?${query.toString()}`;
};

export const createUser = async ({ name, email, password }: { name: string; email: string; password: string; }) => {
    const [firstName, ...rest] = (name || '').trim().split(' ');
    const lastName = rest.join(' ');
    const username = (email?.split('@')[0] || name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 30) || `user_${Date.now()}`;

    return jsonFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, firstName, lastName }),
    });
};

export const signIn = async ({ email, password }: { email: string; password: string; }) => {
    // Server accepts identifier (username or email)
    return jsonFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email, password }),
    });
};

export const logout = async () => {
    if (!shouldBypassNetwork) {
        try {
            await jsonFetch('/api/logout', { method: 'POST' });
        } catch (error) {
            // Ignore API logout failures when backend is unavailable.
            if (__DEV__) console.warn("[API] logout failed, falling back to Firebase signOut.", error);
        }
    }

    try {
        await firebaseSignOut();
    } finally {
        clearMockOwnerAccount();
    }
};

export const getCurrentUser = async () => {
    return jsonFetch('/api/user');
};

export const getRestaurants = async (filters?: { search?: string; category?: string }) => {
    if (!firebaseConfigured || !firestore) return [];

    const restaurantsRef = collection(firestore, FIREBASE_COLLECTIONS.restaurants);
    const activeSnap = await getDocs(query(restaurantsRef, where("isActive", "==", true)));
    const baseSnap = activeSnap.empty ? await getDocs(restaurantsRef) : activeSnap;
    const list = baseSnap.docs
        .map((d) => withBundledRestaurantLogo({ id: d.id, ...d.data() }))
        .filter((r: any) => r.isActive !== false); // keep hidden ones filtered out if explicitly false

    const ordered = sortCatalogRows(list, []);
    if (!filters?.search) return ordered;
    const term = filters.search.toLowerCase();
    return ordered.filter((r: any) => {
        const name = String(r.name || "").toLowerCase();
        const cuisine = String(r.cuisine || "").toLowerCase();
        return name.includes(term) || cuisine.includes(term);
    });
};

export const subscribeRestaurants = (cb: (restaurants: any[]) => void, onError?: (error: unknown) => void) => {
    if (!firebaseConfigured || !firestore) {
        cb([]);
        return () => {};
    }

    const restaurantsRef = collection(firestore, FIREBASE_COLLECTIONS.restaurants);
    return onSnapshot(
        restaurantsRef,
        (snapshot) => {
            const list = snapshot.docs
                .map((d) => withBundledRestaurantLogo({ id: d.id, ...d.data() }))
                .filter((restaurant: any) => restaurant.isActive !== false);
            cb(sortCatalogRows(list, []));
        },
        (error) => {
            onError?.(error);
        },
    );
};

export const subscribeRestaurant = (restaurantId: string | number, cb: (restaurant: any | null) => void, onError?: (error: unknown) => void) => {
    if (!firebaseConfigured || !firestore || !restaurantId) {
        cb(null);
        return () => {};
    }

    const ref = doc(firestore, FIREBASE_COLLECTIONS.restaurants, String(restaurantId));
    return onSnapshot(
        ref,
        (snapshot) => {
            const restaurant = snapshot.exists() ? withBundledRestaurantLogo({ id: snapshot.id, ...snapshot.data() }) : null;
            cb(restaurant?.isActive === false ? null : restaurant);
        },
        (error) => {
            onError?.(error);
        },
    );
};

export const getRestaurant = async (restaurantId: string | number) => {
    if (!firebaseConfigured || !firestore) return null;
    const ref = doc(firestore, FIREBASE_COLLECTIONS.restaurants, String(restaurantId));
    const snap = await getDoc(ref).catch(() => null);
    if (!snap || !snap.exists()) return null;
    const restaurant = withBundledRestaurantLogo({ id: snap.id, ...snap.data() });
    return restaurant?.isActive === false ? null : restaurant;
};

async function getDefaultRestaurantId(): Promise<number | null> {
    try {
        const list = await getRestaurants();
        return (Array.isArray(list) && list.length > 0) ? (list[0].id as any) : null;
    } catch { return null; }
}

export const getCategories = async () => {
    const restId = await getDefaultRestaurantId();
    if (!restId) return [];
    return getRestaurantCategories(restId);
};

export const getMenu = async ({ category, query, limit }: { category?: string; query?: string; limit?: number; }) => {
    const restId = await getDefaultRestaurantId();
    if (!restId) return [];

    let categoryId: string | number | undefined = undefined;
    if (category) {
        try {
            const categories = await getRestaurantCategories(restId);
            const match = (categories || []).find((c: any) => String(c.name).toLowerCase() === String(category).toLowerCase());
            categoryId = match?.id;
        } catch { }
    }
    const items = await getRestaurantMenu({ restaurantId: restId, categoryId });
    let list = Array.isArray(items) ? items : [];
    if (query) {
        const q = String(query).toLowerCase();
        list = list.filter((i: any) => String(i.name).toLowerCase().includes(q));
    }
    if (limit) list = list.slice(0, limit);
    return list.map((i: any) => ({
        $id: i.id ?? i.$id ?? `menu-${restId}-${Math.random().toString(36).slice(2, 9)}`,
        name: i.name,
        price: Number(i.price),
        image_url: i.image_url || i.imageUrl || '',
    }));
};

export const getRestaurantCategories = async (restaurantId: string | number) => {
    if (!firebaseConfigured || !firestore) return [];
    const categoriesRef = collection(firestore, FIREBASE_COLLECTIONS.categories);
    const snap = await getDocs(query(categoriesRef, where("restaurantId", "==", String(restaurantId))));
    const rows = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
            id: d.id,
            ...data,
            slug: slugifyCategory(data.slug || data.id || data.name || d.id),
        };
    }).filter((category: any) => category.visible !== false && category.isActive !== false);
    return sortCatalogRows(rows, seedCategoriesByRestaurantId(String(restaurantId)));
};

export const getRestaurantMenu = async ({
    restaurantId,
    categoryId,
}: {
    restaurantId: string | number;
    categoryId?: string | number;
}) => {
    if (!firebaseConfigured || !firestore) return [];
    const menusRef = collection(firestore, FIREBASE_COLLECTIONS.menus);
    const snap = await getDocs(query(menusRef, where("restaurantId", "==", String(restaurantId))));
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Hide items explicitly marked invisible
    items = items.filter((item: any) => item.visible !== false && item.isActive !== false);

    if (categoryId !== undefined && categoryId !== null) {
        const categoryKey = String(categoryId);
        items = items.filter((item: any) => {
            const categories = Array.isArray(item.categories) ? item.categories.map(String) : [];
            if (categories.includes(categoryKey)) return true;
            const cat = item.categoryId ?? item.category ?? item.categorySlug;
            if (Array.isArray(cat)) return cat.map(String).includes(categoryKey);
            return cat !== undefined && String(cat) === categoryKey;
        });
    }

    const normalized = (Array.isArray(items) ? items : []).map((item: any) => ({
        ...item,
        $id: item.id ?? `menu-${item.restaurantId}-${item.name}`,
        price: Number(item.price),
        image_url: item.imageUrl || item.image_url || resolveSeedMenuImageUrl(String(restaurantId), item) || "",
    }));
    return filterRestaurantMenuForCustomer(
        String(restaurantId),
        sortCatalogRows(normalized, seedMenuByRestaurantId(String(restaurantId))),
    );
};

export const getRestaurantReviews = async (restaurantId: string | number) => {
    return withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}/reviews`),
        () => [
            {
                id: 1,
                rating: 5,
                comment: "Best burger on campus!",
                createdAt: new Date().toISOString(),
                user: { firstName: "Demo" },
            },
        ],
    );
};

export const submitReview = async ({ restaurantId, rating, comment }: { restaurantId: string | number; rating: number; comment: string; }) => {
    return jsonFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
            restaurantId,
            rating,
            comment,
        }),
    });
};

export const getAddresses = async () => {
    return withFallback(
        () => jsonFetch('/api/addresses'),
        () => [],
    );
};

export const getUserOrders = async () => {
    return withFallback(
        () => jsonFetch('/api/orders/user/me'),
        () => [],
    );
};

export const createOrder = async ({ orderData, orderItems }: { orderData: Record<string, any>; orderItems: Record<string, any>[]; }) => {
    if (firebaseOrdersEnabled) {
        return createOrderDocument(orderData, orderItems);
    }

    return withFallback(
        () => jsonFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify({ orderData, orderItems }),
        }),
        () => ({
            id: Date.now(),
            ...orderData,
            orderItems,
            status: "pending approval",
            createdAt: new Date().toISOString(),
        }),
    );
};

export const getOwnerRestaurants = async () => {
    return withFallback(
        () => jsonFetch('/api/restaurants/owner/me'),
        () => [],
    );
};
export const updateRestaurant = async (restaurantId: string | number, payload: Record<string, any>) => {
    return withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        }),
        () => ({ id: restaurantId, ...payload }),
    );
};
export const createRestaurant = async (payload: Record<string, any>) => {
    return withFallback(
        () => jsonFetch('/api/restaurants', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
        () => ({ id: Date.now(), ...payload }),
    );
};

export const getRestaurantOrders = async (restaurantId: string | number, status?: string) => {
    const query = buildQuery(status ? { status } : undefined);
    return withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}/orders${query}`),
        () => [],
    );
};

export const updateOrderStatus = async (orderId: number, status: string) => {
    return withFallback(
        () => jsonFetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
        }),
        () => ({ id: orderId, status }),
    );
};

export const createMenuItem = async (restaurantId: string | number, payload: Record<string, any>) => {
    return withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}/menu`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
        () => ({ id: Date.now(), ...payload }),
    );
};

export const getCourierRoster = async () => [];
