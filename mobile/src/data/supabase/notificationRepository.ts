import type { NotificationRepository } from "@/src/data/contracts";

export const registerPushToken: NotificationRepository["registerPushToken"] = async () => {
    return null;
};

export const unregisterPushToken: NotificationRepository["unregisterPushToken"] = async () => undefined;

export const supabaseNotificationRepository: NotificationRepository = {
    registerPushToken,
    unregisterPushToken,
};
