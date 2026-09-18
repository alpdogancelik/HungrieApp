import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    type User as FirebaseUser,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import type { RestaurantRepository, RestaurantSession, RestaurantDetailsForm } from "@/src/data/contracts";
import { createInitialFetchSubscription, fromKurus, requireCatalogSupabase, requireSupabase, throwIfError, toSupabaseOrderStatus } from "./utils";
import { invalidateCatalogCache, readCatalogCached } from "./publicCatalogCache";
import { getRestaurantReviewSummaryV2 } from "./reviewV2Repository";

const ACTIVE_RESTAURANT_COLUMNS = [
    "id", "name", "description", "cuisine", "image_url", "delivery_eta_min_minutes",
    "delivery_eta_max_minutes", "delivery_fee_kurus", "minimum_order_kurus", "opening_hours",
    "preferred_language", "created_at", "updated_at",
    "sort_order",
].join(",");
const RESTAURANT_ORDER_COLUMNS = [
    "id", "restaurant_id", "status", "payment_method", "subtotal_kurus", "delivery_fee_kurus",
    "service_fee_kurus", "discount_kurus", "tip_kurus", "total_kurus", "eta_minutes",
    "approval_deadline_at", "reminder_pending", "reminder_requested_at", "preparing_at", "ready_at",
    "out_for_delivery_at", "delivered_at", "canceled_at", "created_at", "updated_at", "customer_name",
    "customer_email", "customer_whatsapp", "delivery_address_snapshot",
].join(",");

export const mapCatalogRestaurant = (row: any, summary: { overallRating: number | null; reviewCount: number }) => ({
    id: String(row.id || ""),
    name: row.name || "",
    description: row.description || "",
    cuisine: row.cuisine || "",
    imageUrl: row.image_url || "",
    image_url: row.image_url || "",
    isActive: true,
    ratingAverage: summary.overallRating,
    ratingCount: summary.reviewCount,
    deliveryFee: fromKurus(row.delivery_fee_kurus),
    minimumOrderAmount: fromKurus(row.minimum_order_kurus),
    deliveryTime:
        row.delivery_eta_min_minutes && row.delivery_eta_max_minutes
            ? `${row.delivery_eta_min_minutes}-${row.delivery_eta_max_minutes}`
            : undefined,
});

export const hydrateCatalogRestaurant = async (row: any) =>
    mapCatalogRestaurant(row, await getRestaurantReviewSummaryV2(String(row.id || "")));

export const invalidateRestaurantCatalog = () => invalidateCatalogCache("restaurants:");

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
    const rows = await readCatalogCached(`restaurants:${filters?.search || ""}:${filters?.category || ""}`, async () => {
        const client = requireCatalogSupabase();
        let query = client.from("active_restaurants").select(ACTIVE_RESTAURANT_COLUMNS).order("sort_order", { ascending: true }).order("name", { ascending: true }).order("id", { ascending: true });
        if (filters?.search) {
            const term = `%${filters.search}%`;
            query = query.or(`name.ilike.${term},cuisine.ilike.${term}`);
        }
        return throwIfError(await query);
    });
    return Promise.all(rows.map(hydrateCatalogRestaurant));
};

export const subscribeRestaurants: RestaurantRepository["subscribeRestaurants"] = (cb, onError) => {
    return createInitialFetchSubscription(
        getRestaurants,
        cb,
        (error) => {
            cb([]);
            onError?.(error);
        },
    );
};

export const getRestaurant: RestaurantRepository["getRestaurant"] = async (restaurantId) => {
    const row = await readCatalogCached(`restaurant:${String(restaurantId)}`, async () => {
        const client = requireCatalogSupabase();
        return throwIfError(await client.from("active_restaurants").select(ACTIVE_RESTAURANT_COLUMNS).eq("id", String(restaurantId)).maybeSingle());
    });
    return row ? hydrateCatalogRestaurant(row) : null;
};

export const subscribeRestaurant: RestaurantRepository["subscribeRestaurant"] = (restaurantId, cb, onError) => {
    return createInitialFetchSubscription(
        () => getRestaurant(restaurantId),
        cb,
        (error) => {
            cb(null);
            onError?.(error);
        },
    );
};

export const updateRestaurant: RestaurantRepository["updateRestaurant"] = async (restaurantId, payload) => {
    await requireSupabase().rpc("update_restaurant_details", {
        p_restaurant_id: String(restaurantId),
        p_changes: payload,
    }).then(throwIfError);
    invalidateCatalogCache();
    return { id: restaurantId, ...payload };
};

export const createRestaurant: RestaurantRepository["createRestaurant"] = async (payload) => {
    const normalized = {
        name: String(payload.name || ""),
        description: String(payload.description || ""),
        cuisine: String(payload.cuisine || ""),
        address: String(payload.address || ""),
        phone: String(payload.phone || ""),
        image_url: String(payload.imageUrl || payload.image_url || ""),
        is_active: payload.isActive ?? payload.is_active ?? false,
        delivery_eta_min_minutes: payload.deliveryEtaMinMinutes ?? payload.delivery_eta_min_minutes ?? null,
        delivery_eta_max_minutes: payload.deliveryEtaMaxMinutes ?? payload.delivery_eta_max_minutes ?? null,
        delivery_fee_kurus: payload.deliveryFeeKurus ?? payload.delivery_fee_kurus ?? 0,
        minimum_order_kurus: payload.minimumOrderKurus ?? payload.minimum_order_kurus ?? 0,
        opening_hours: payload.openingHours ?? payload.opening_hours ?? {},
        preferred_language: payload.preferredLanguage ?? payload.preferred_language ?? "tr",
    };
    const id = throwIfError(await requireSupabase().rpc("create_restaurant", { p_payload: normalized }));
    invalidateCatalogCache();
    return { id, ...payload };
};

export const getOwnerRestaurants: RestaurantRepository["getOwnerRestaurants"] = async () => {
    const id = await getOwnedRestaurantId();
    const restaurant = id ? await getRestaurant(id) : null;
    return restaurant ? [restaurant] : [];
};

export const getRestaurantOrders: RestaurantRepository["getRestaurantOrders"] = async (restaurantId, status) => {
    let query = requireSupabase()
        .from("restaurant_orders")
        .select(RESTAURANT_ORDER_COLUMNS)
        .eq("restaurant_id", String(restaurantId))
        .order("created_at", { ascending: false });
    if (status) query = query.eq("status", toSupabaseOrderStatus(status));
    return throwIfError(await query);
};
export const updateOrderStatus: RestaurantRepository["updateOrderStatus"] = async (orderId, status) => {
    await requireSupabase().rpc("transition_order", { p_order_id: String(orderId), p_new_status: toSupabaseOrderStatus(status) }).then(throwIfError);
    return { id: orderId, status };
};
export const getCourierRoster: RestaurantRepository["getCourierRoster"] = async () => {
    const restaurantId = await getOwnedRestaurantId();
    if (!restaurantId) return [];
    return throwIfError(await requireSupabase().rpc("list_restaurant_couriers", { p_restaurant_id: restaurantId }));
};

export const getOwnedRestaurantDetails: RestaurantRepository["getOwnedRestaurantDetails"] = async () => {
    const restaurantId = await getOwnedRestaurantId();
    if (!restaurantId) return null;
    const client = requireSupabase();
    const row = throwIfError(await client.rpc("get_restaurant_management_details", { p_restaurant_id: restaurantId }));
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
    const { signOut } = await import("@/src/data/authRepository");
    await signOut();
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
