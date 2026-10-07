import { Platform } from "react-native";
import i18n from "@/src/lib/i18n";
import type { NotificationPreferences, NotificationRepository } from "@/src/data/contracts";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { storage } from "@/src/lib/storage";
import { auth } from "@/lib/firebase";
import { requireSupabase, throwIfError } from "./utils";

const ACTIVE_BINDING_KEY = "supabase_push_token_active_binding_v1";
const ACTIVE_BINDING_VERSION = 2;
const LEGACY_PREFS_KEY = "hungrie_notification_prefs_v1";
const PREFS_MIGRATED_KEY = "supabase_notification_prefs_migrated_v1";
const defaults: NotificationPreferences = { orderStatus: true, restaurantOrders: false, reviewReplies: true };
const pushLanguage = (): "en" | "tr" => i18n.language?.split("-")[0] === "tr" ? "tr" : "en";
type ActiveBinding = { raw: string; token: string; ownerUid: string | null };
let bindingGeneration = 0;
let bindingStorageOperations = Promise.resolve();
const serializeBindingStorage = <T>(operation: () => Promise<T>) => {
    const result = bindingStorageOperations.then(operation, operation);
    bindingStorageOperations = result.then(() => undefined, () => undefined);
    return result;
};
const encodeActiveBinding = (token: string, ownerUid: string) => JSON.stringify({
    version: ACTIVE_BINDING_VERSION,
    token,
    ownerUid,
});
const readActiveBinding = async (): Promise<ActiveBinding | null> => {
    await bindingStorageOperations;
    const raw = await storage.getItem(ACTIVE_BINDING_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as { version?: unknown; token?: unknown; ownerUid?: unknown };
        if (
            parsed.version === ACTIVE_BINDING_VERSION &&
            typeof parsed.token === "string" && parsed.token &&
            typeof parsed.ownerUid === "string" && parsed.ownerUid
        ) return { raw, token: parsed.token, ownerUid: parsed.ownerUid };
    } catch {
        // Version 1 stored only the raw token. It may be used for authenticated
        // server reconciliation, but its previous owner is never guessed.
    }
    return { raw, token: raw, ownerUid: null };
};
const persistActiveBinding = async (token: string, ownerUid: string, generation: number) =>
    serializeBindingStorage(async () => {
        if (generation !== bindingGeneration || auth?.currentUser?.uid !== ownerUid) return;
        await storage.setItem(ACTIVE_BINDING_KEY, encodeActiveBinding(token, ownerUid));
    });
const removeActiveBinding = async (binding: ActiveBinding, generation: number) =>
    serializeBindingStorage(async () => {
        if (generation !== bindingGeneration) return;
        if (await storage.getItem(ACTIVE_BINDING_KEY) !== binding.raw) return;
        await storage.removeItem(ACTIVE_BINDING_KEY);
    });

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
    const ownerUid = auth?.currentUser?.uid;
    if (!ownerUid) return null;
    const generation = ++bindingGeneration;
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
    await persistActiveBinding(registration.token, ownerUid, generation);
    if (pushLanguage() !== registeredLanguage) await syncRegisteredPushLanguage();
    return registration;
};

// Called only after the root Customer access guard is ready. Reuses the bound
// token, so switching language never prompts for notification permission.
export const syncRegisteredPushLanguage = async (): Promise<void> => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const ownerUid = auth?.currentUser?.uid;
    if (!ownerUid) return;
    const generation = ++bindingGeneration;
    const binding = await readActiveBinding();
    if (!binding) return;
    throwIfError(await requireSupabase().rpc("register_my_customer_push_token_v2", {
        p_token: binding.token,
        p_platform: Platform.OS,
        p_preferred_language: pushLanguage(),
    }));
    await persistActiveBinding(binding.token, ownerUid, generation);
};

export const unregisterPushToken: NotificationRepository["unregisterPushToken"] = async () => {
    const generation = ++bindingGeneration;
    const binding = await readActiveBinding();
    if (!binding) return;
    throwIfError(await requireSupabase().rpc("unregister_my_customer_push_token_v1", { p_token: binding.token }));
    await removeActiveBinding(binding, generation);
};

export const supabaseNotificationRepository: NotificationRepository = {
    registerPushToken,
    unregisterPushToken,
    getPreferences,
    updatePreferences,
};
