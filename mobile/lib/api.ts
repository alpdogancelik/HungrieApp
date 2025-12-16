import Constants from 'expo-constants';
import {
    createOrderDocument,
    firebaseOrdersEnabled,
    clearMockOwnerAccount,
    getMockOwnerAccount,
    signOut as firebaseSignOut,
} from "./firebaseAuth";
import { filterRestaurantMenuForCustomer } from "./menuVisibility";
import { seedRestaurants, seedMenuByRestaurantId, seedCategoriesByRestaurantId } from "./restaurantSeeds";

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
    const query = buildQuery(filters);
    return withFallback(
        () => jsonFetch(`/api/restaurants${query}`),
        () => {
            const list = seedRestaurants;
            if (!filters?.search) return list;
            const term = filters.search.toLowerCase();
            return list.filter(
                (r) =>
                    r.name.toLowerCase().includes(term) ||
                    (r.cuisine ? r.cuisine.toLowerCase().includes(term) : false),
            );
        },
    );
};

export const getRestaurant = async (restaurantId: string | number) => {
    return withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}`),
        () => seedRestaurants.find((r) => String(r.id) === String(restaurantId)) ?? null,
    );
};

async function getDefaultRestaurantId(): Promise<number | null> {
    try {
        const list = await getRestaurants();
        return (Array.isArray(list) && list.length > 0) ? list[0].id : null;
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

    let categoryId: number | undefined = undefined;
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
    return withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}/categories`),
        () => seedCategoriesByRestaurantId(String(restaurantId)),
    );
};

export const getRestaurantMenu = async ({ restaurantId, categoryId }: { restaurantId: string | number; categoryId?: number; }) => {
    const query = categoryId ? `?categoryId=${categoryId}` : '';
    const items = await withFallback(
        () => jsonFetch(`/api/restaurants/${restaurantId}/menu${query}`),
        () => seedMenuByRestaurantId(String(restaurantId)),
    );
    const normalized = (Array.isArray(items) ? items : []).map((item: any) => ({
        ...item,
        $id: item.id ?? `menu-${item.restaurantId}-${item.name}`,
        price: Number(item.price),
        image_url: item.imageUrl || item.image_url || '',
    }));
    return filterRestaurantMenuForCustomer(String(restaurantId), normalized);
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
