import * as firebaseNotificationRepository from "@/lib/registerPushToken";
import { selectRepository } from "./backendFlags";
import type { NotificationRepository } from "./contracts";
import { supabaseNotificationRepository } from "./supabase/notificationRepository";

export const notificationRepository = selectRepository<NotificationRepository>("notification", {
    firebase: firebaseNotificationRepository,
    supabase: supabaseNotificationRepository,
});

export const registerPushToken = notificationRepository.registerPushToken;
export const unregisterPushToken = notificationRepository.unregisterPushToken;
export const getNotificationPreferences = notificationRepository.getPreferences;
export const updateNotificationPreferences = notificationRepository.updatePreferences;
export default registerPushToken;
