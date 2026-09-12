import { Platform } from "react-native";
import type { NotificationPreferences, NotificationRepository } from "@/src/data/contracts";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { storage } from "@/src/lib/storage";
import { requireSupabase, throwIfError } from "./utils";

const ACTIVE_BINDING_KEY = "supabase_push_token_active_binding_v1";
const LEGACY_PREFS_KEY = "hungrie_notification_prefs_v1";
const PREFS_MIGRATED_KEY = "supabase_notification_prefs_migrated_v1";
const defaults: NotificationPreferences = { orderStatus: true, restaurantOrders: true, reviewReplies: true };

const normalizePreferences = (value: any): NotificationPreferences => ({
    orderStatus: value?.orderStatus !== false,
    restaurantOrders: value?.restaurantOrders !== false,
    reviewReplies: value?.reviewReplies !== false,
});

export const getPreferences: NotificationRepository["getPreferences"] = async () =>
    normalizePreferences(throwIfError(await requireSupabase().rpc("get_my_notification_preferences")));

export const updatePreferences: NotificationRepository["updatePreferences"] = async (preferences) =>
    normalizePreferences(throwIfError(await requireSupabase().rpc("update_my_notification_preferences", {
        p_order_status: Boolean(preferences.orderStatus),
        p_restaurant_orders: Boolean(preferences.restaurantOrders),
        p_review_replies: Boolean(preferences.reviewReplies),
    })));

const migrateLegacyPreferences = async () => {
    if (await storage.getItem(PREFS_MIGRATED_KEY)) return;
    const legacy = await storage.getItem(LEGACY_PREFS_KEY);
    if (legacy) {
        try {
            const parsed = JSON.parse(legacy);
            await updatePreferences({
                orderStatus: parsed.orderStatus !== false,
                restaurantOrders: true,
                reviewReplies: parsed.reviewReplies !== false,
            });
        } catch {
            await updatePreferences(defaults);
        }
    }
    await storage.setItem(PREFS_MIGRATED_KEY, "true");
};

export const registerPushToken: NotificationRepository["registerPushToken"] = async () => {
    if (Platform.OS === "web") return null;
    const granted = await NotificationManager.requestPermissions();
    if (!granted) return null;
    await migrateLegacyPreferences();
    const registration = await NotificationManager.getExpoPushToken();
    if (!registration?.token || (registration.platform !== "ios" && registration.platform !== "android")) return null;
    throwIfError(await requireSupabase().rpc("register_my_push_token", {
        p_token: registration.token,
        p_platform: registration.platform,
    }));
    await storage.setItem(ACTIVE_BINDING_KEY, registration.token);
    return registration;
};

export const unregisterPushToken: NotificationRepository["unregisterPushToken"] = async () => {
    const token = await storage.getItem(ACTIVE_BINDING_KEY);
    if (!token) return;
    throwIfError(await requireSupabase().rpc("unregister_my_push_token", { p_token: token }));
    await storage.removeItem(ACTIVE_BINDING_KEY);
};

export const supabaseNotificationRepository: NotificationRepository = {
    registerPushToken,
    unregisterPushToken,
    getPreferences,
    updatePreferences,
};
