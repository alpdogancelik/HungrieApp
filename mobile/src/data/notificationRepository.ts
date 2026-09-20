import * as firebaseNotificationRepository from "@/lib/registerPushToken";
import { selectRepository } from "./backendFlags";
import type { NotificationRepository } from "./contracts";
import { supabaseNotificationRepository, syncRegisteredPushLanguage as syncSupabasePushLanguage } from "./supabase/notificationRepository";

export const notificationRepository = selectRepository<NotificationRepository>("notification", {
    firebase: firebaseNotificationRepository,
    supabase: supabaseNotificationRepository,
});

export const registerPushToken = notificationRepository.registerPushToken;
export const unregisterPushToken = notificationRepository.unregisterPushToken;
export const syncRegisteredPushLanguage = supabaseNotificationRepository === notificationRepository
    ? syncSupabasePushLanguage
    : async () => {};
export const getNotificationPreferences = notificationRepository.getPreferences;
export const updateNotificationPreferences = notificationRepository.updatePreferences;
export default registerPushToken;
