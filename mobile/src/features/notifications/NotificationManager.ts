import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

type PushPlatform = "ios" | "android" | "web" | "unknown";

export type PushTokenInfo = {
    token: string;
    platform: PushPlatform;
};

const isWeb = Platform.OS === "web";

type NotificationPermissionLike = "default" | "granted" | "denied";
type WebNotificationCtor = {
    new(title: string, options?: { body?: string }): void;
    permission: NotificationPermissionLike;
    requestPermission: () => Promise<NotificationPermissionLike>;
};

type GlobalWithNotification = typeof globalThis & { Notification?: WebNotificationCtor };

const getWebNotification = (): WebNotificationCtor | null => {
    if (!isWeb) return null;
    const globalObj = globalThis as GlobalWithNotification;
    if (!globalObj.Notification) return null;
    return globalObj.Notification;
};

const notificationHandler: Notifications.NotificationHandler = {
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldSetBadge: false,
        shouldPlaySound: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
};

Notifications.setNotificationHandler(notificationHandler);

const ensureAndroidChannel = async () => {
    if (Platform.OS !== "android") return;
    await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        enableVibrate: true,
        enableLights: true,
    });
};

export const requestPermissions = async (): Promise<boolean> => {
    if (isWeb) {
        const NotificationApi = getWebNotification();
        if (!NotificationApi) return false;
        const result = await NotificationApi.requestPermission();
        return result === "granted";
    }

    if (!Device.isDevice) return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === "granted") {
        await ensureAndroidChannel();
        return true;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    if (granted) {
        await ensureAndroidChannel();
    }
    return granted;
};

const resolveProjectId = () => {
    const easProjectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.expoConfig?.extra?.projectId ||
        Constants?.easConfig?.projectId;
    return easProjectId;
};

export const getPushToken = async (): Promise<PushTokenInfo | null> => {
    if (isWeb || !Device.isDevice) return null;
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== "granted") return null;
    const projectId = resolveProjectId();
    const response = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
    );
    const platform: PushPlatform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";
    return { token: response.data, platform };
};

export const notifyLocal = async (title: string, body: string, withSound = true) => {
    if (isWeb) {
        const NotificationApi = getWebNotification();
        if (NotificationApi && NotificationApi.permission === "granted") {
            new NotificationApi(title, { body });
        }
        return;
    }
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: withSound ? "default" : undefined,
        },
        trigger: null,
    });
};

export const NotificationManager = {
    requestPermissions,
    getPushToken,
    notifyLocal,
};

export default NotificationManager;
