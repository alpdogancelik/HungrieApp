import { Platform } from "react-native";
import i18n from "@/src/lib/i18n";
import type { NotificationPreferences, NotificationRepository } from "@/src/data/contracts";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { storage } from "@/src/lib/storage";
import { requireSupabase, throwIfError } from "./utils";

const ACTIVE_BINDING_KEY = "supabase_push_token_active_binding_v1";
const LEGACY_PREFS_KEY = "hungrie_notification_prefs_v1";
const PREFS_MIGRATED_KEY = "supabase_notification_prefs_migrated_v1";
const defaults: NotificationPreferences = { orderStatus: true, restaurantOrders: false, reviewReplies: true };
const pushLanguage = (): "en" | "tr" => i18n.language?.split("-")[0] === "tr" ? "tr" : "en";

const normalizePreferences = (value: any): NotificationPreferences => ({
    orderStatus: value?.orderStatus !== false,
    restaurantOrders: false,
    reviewReplies: value?.reviewReplies !== false,
});

export const getPreferences: NotificationRepository["getPreferences"] = async () =>
    normalizePreferences(throwIfError(await requireSupabase().rpc("get_my_customer_notification_preferences_v1")));

export const updatePreferences: NotificationRepository["updatePreferences"] = async (preferences) =>
    normalizePreferences(throwIfError(await requireSupabase().rpc("update_my_customer_notification_preferences_v1", {
        p_order_status: Boolean(preferences.orderStatus),
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
                restaurantOrders: false,
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
    const registeredLanguage = pushLanguage();
    throwIfError(await requireSupabase().rpc("register_my_customer_push_token_v2", {
        p_token: registration.token,
        p_platform: registration.platform,
        p_preferred_language: registeredLanguage,
    }));
    await storage.setItem(ACTIVE_BINDING_KEY, registration.token);
    if (pushLanguage() !== registeredLanguage) await syncRegisteredPushLanguage();
    return registration;
};

// Called only after the root Customer access guard is ready. Reuses the bound
// token, so switching language never prompts for notification permission.
export const syncRegisteredPushLanguage = async (): Promise<void> => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const token = await storage.getItem(ACTIVE_BINDING_KEY);
    if (!token) return;
    throwIfError(await requireSupabase().rpc("register_my_customer_push_token_v2", {
        p_token: token,
        p_platform: Platform.OS,
        p_preferred_language: pushLanguage(),
    }));
};

export const unregisterPushToken: NotificationRepository["unregisterPushToken"] = async () => {
    const token = await storage.getItem(ACTIVE_BINDING_KEY);
    if (!token) return;
    throwIfError(await requireSupabase().rpc("unregister_my_customer_push_token_v1", { p_token: token }));
    await storage.removeItem(ACTIVE_BINDING_KEY);
};

export const supabaseNotificationRepository: NotificationRepository = {
    registerPushToken,
    unregisterPushToken,
    getPreferences,
    updatePreferences,
};
