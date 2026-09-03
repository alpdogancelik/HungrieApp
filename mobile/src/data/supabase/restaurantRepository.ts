import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    type User as FirebaseUser,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import { unregisterPushToken } from "@/src/data/notificationRepository";
import type { RestaurantRepository, RestaurantSession, RestaurantDetailsForm } from "@/src/data/contracts";
import { fromKurus, requireSupabase, throwIfError } from "./utils";

const mapRestaurant = (row: any) => ({
    id: String(row.id || ""),
    name: row.name || "",
    description: row.description || "",
    cuisine: row.cuisine || "",
    imageUrl: row.image_url || "",
    image_url: row.image_url || "",
    isActive: true,
    ratingAverage: Number(row.rating_average || 0),
    ratingCount: Number(row.rating_count || 0),
    deliveryFee: fromKurus(row.delivery_fee_kurus),
    minimumOrderAmount: fromKurus(row.minimum_order_kurus),
    deliveryTime:
        row.delivery_eta_min_minutes && row.delivery_eta_max_minutes
            ? `${row.delivery_eta_min_minutes}-${row.delivery_eta_max_minutes}`
            : undefined,
});

const getOwnedRestaurantId = async () => {
    const client = requireSupabase();
    const rows = throwIfError(
        await client.from("my_restaurant_memberships").select("restaurant_id").limit(1),
    );
    return rows?.[0]?.restaurant_id ? String(rows[0].restaurant_id) : null;
};

const fetchRestaurantSession = async (user: FirebaseUser): Promise<RestaurantSession | null> => {
    const restaurantId = await getOwnedRestaurantId();
    if (!restaurantId) return null;
    const restaurant = await getRestaurant(restaurantId);
    return {
        userId: user.uid,
        email: user.email || "",
        restaurantId,
        restaurantName: restaurant?.name || restaurantId,
    };
};

export const getRestaurants: RestaurantRepository["getRestaurants"] = async (filters) => {
    const client = requireSupabase();
    let query = client.from("active_restaurants").select("*").order("name", { ascending: true });
    if (filters?.search) {
        const term = `%${filters.search}%`;
        query = query.or(`name.ilike.${term},cuisine.ilike.${term}`);
    }
    return throwIfError(await query).map(mapRestaurant);
};

export const subscribeRestaurants: RestaurantRepository["subscribeRestaurants"] = (cb, onError) => {
    void getRestaurants().then(cb).catch((error) => {
        cb([]);
        onError?.(error);
    });
    const channel = requireSupabase()
        .channel("restaurants")
        .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, () => {
            void getRestaurants().then(cb).catch(onError);
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const getRestaurant: RestaurantRepository["getRestaurant"] = async (restaurantId) => {
    const client = requireSupabase();
    const row = throwIfError(
        await client.from("active_restaurants").select("*").eq("id", String(restaurantId)).maybeSingle(),
    );
    return row ? mapRestaurant(row) : null;
};

export const subscribeRestaurant: RestaurantRepository["subscribeRestaurant"] = (restaurantId, cb, onError) => {
    void getRestaurant(restaurantId).then(cb).catch((error) => {
        cb(null);
        onError?.(error);
    });
    const channel = requireSupabase()
        .channel(`restaurant:${restaurantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "restaurants", filter: `id=eq.${restaurantId}` }, () => {
            void getRestaurant(restaurantId).then(cb).catch(onError);
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const updateRestaurant: RestaurantRepository["updateRestaurant"] = async (restaurantId, payload) => {
    await requireSupabase().rpc("update_restaurant_details", {
        p_restaurant_id: String(restaurantId),
        p_changes: payload,
    }).then(throwIfError);
    return { id: restaurantId, ...payload };
};

export const createRestaurant: RestaurantRepository["createRestaurant"] = async () => {
    throw new Error("Supabase restaurant creation is not exposed to the mobile repository.");
};

export const getOwnerRestaurants: RestaurantRepository["getOwnerRestaurants"] = async () => {
    const id = await getOwnedRestaurantId();
    const restaurant = id ? await getRestaurant(id) : null;
    return restaurant ? [restaurant] : [];
};

export const getRestaurantOrders: RestaurantRepository["getRestaurantOrders"] = async () => [];
export const updateOrderStatus: RestaurantRepository["updateOrderStatus"] = async (orderId, status) => ({ id: orderId, status });
export const getCourierRoster: RestaurantRepository["getCourierRoster"] = async () => [];

export const getOwnedRestaurantDetails: RestaurantRepository["getOwnedRestaurantDetails"] = async () => {
    const restaurantId = await getOwnedRestaurantId();
    if (!restaurantId) return null;
    const client = requireSupabase();
    const row = throwIfError(await client.from("restaurants").select("*").eq("id", restaurantId).maybeSingle());
    if (!row) return null;
    return {
        restaurantId,
        details: {
            name: row.name || "",
            imageUrl: row.image_url || "",
            address: row.address || "",
            cuisine: row.cuisine || "",
            description: row.description || "",
            isActive: row.is_active !== false,
        },
    };
};

export const updateOwnedRestaurantDetails: RestaurantRepository["updateOwnedRestaurantDetails"] = async (
    restaurantId,
    form: RestaurantDetailsForm,
) => {
    await updateRestaurant(restaurantId, {
        name: form.name,
        image_url: form.imageUrl,
        address: form.address,
        cuisine: form.cuisine,
        description: form.description,
        is_active: form.isActive,
    });
};

export const signInRestaurant: RestaurantRepository["signInRestaurant"] = async (email, password) => {
    if (!auth) throw new Error("Firebase authentication is not configured.");
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const session = await fetchRestaurantSession(credential.user);
    if (!session) throw new Error("Bu kullanıcı için restoran yetkisi bulunamadı.");
    return session;
};

export const signOutRestaurant: RestaurantRepository["signOutRestaurant"] = async () => {
    if (!auth) throw new Error("Firebase authentication is not configured.");
    await unregisterPushToken().catch(() => null);
    await signOut(auth);
};

export const listenRestaurantSession: RestaurantRepository["listenRestaurantSession"] = (cb) => {
    if (!auth) throw new Error("Firebase authentication is not configured.");
    return onAuthStateChanged(auth, async (user) => {
        if (!user) return cb(null);
        cb(await fetchRestaurantSession(user).catch(() => null));
    });
};

export const getPanelLocale: RestaurantRepository["getPanelLocale"] = async (restaurantId) => {
    if (!restaurantId) return null;
    const row = throwIfError(
        await requireSupabase().from("restaurants").select("preferred_language").eq("id", restaurantId).maybeSingle(),
    );
    return row?.preferred_language === "en" || row?.preferred_language === "tr" ? row.preferred_language : null;
};

export const setPanelLocale: RestaurantRepository["setPanelLocale"] = async (restaurantId, locale) => {
    await updateRestaurant(restaurantId, { preferred_language: locale });
};

export const supabaseRestaurantRepository: RestaurantRepository = {
    getRestaurants,
    subscribeRestaurants,
    subscribeRestaurant,
    getRestaurant,
    updateRestaurant,
    createRestaurant,
    getOwnerRestaurants,
    getRestaurantOrders,
    updateOrderStatus,
    getCourierRoster,
    getOwnedRestaurantId,
    getOwnedRestaurantDetails,
    updateOwnedRestaurantDetails,
    signInRestaurant,
    signOutRestaurant,
    listenRestaurantSession,
    getPanelLocale,
    setPanelLocale,
};
