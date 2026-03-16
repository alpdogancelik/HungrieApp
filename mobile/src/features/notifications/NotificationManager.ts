import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Device from "expo-device";

type PushPlatform = "ios" | "android" | "web" | "unknown";
type PushProvider = "apns" | "fcm" | "web" | "unknown";

export type PushTokenInfo = {
    token: string;
    platform: PushPlatform;
    provider: PushProvider;
};

type NotificationPayload = Record<string, unknown>;
type NotificationResponseHandler = (payload: NotificationPayload) => void;
type NotificationReceivedHandler = (payload: NotificationPayload) => void;
type LocalNotificationOptions = {
    withSound?: boolean;
    channelId?: string;
    soundName?: string;
    data?: NotificationPayload;
};

const isWeb = Platform.OS === "web";
const isExpoGo = Constants.appOwnership === "expo";
const DEFAULT_CHANNEL_ID = "default";
const NEW_ORDER_CHANNEL_ID = "orders";
const ORDER_STATUS_CHANNEL_ID = "order-status";
const HUNGRIE_SOUND_FILE = "hungrie.wav";
const HUNGRIE_SOUND_ANDROID = "hungrie";
const SYSTEM_DEFAULT_SOUND = "default";

export const isRemotePushSupported = (): boolean => !isWeb && Device.isDevice && !isExpoGo;
type NotificationsModule = typeof import("expo-notifications");

const getNotificationsModule = (): NotificationsModule | null => {
    if (isWeb || isExpoGo) return null;
    return require("expo-notifications") as NotificationsModule;
};

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

const notificationHandler = {
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldSetBadge: false,
        shouldPlaySound: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
};

let notificationHandlerConfigured = false;

export const ensureNotificationHandler = () => {
    if (notificationHandlerConfigured) return;
    const notificationsModule = getNotificationsModule();
    if (!notificationsModule) return;
    notificationsModule.setNotificationHandler(notificationHandler);
    notificationHandlerConfigured = true;
};

const ensureAndroidChannel = async () => {
    if (Platform.OS !== "android") return;
    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        enableVibrate: true,
        enableLights: true,
    });

    await Notifications.setNotificationChannelAsync(ORDER_STATUS_CHANNEL_ID, {
        name: "Order Status",
        importance: Notifications.AndroidImportance.MAX,
        sound: SYSTEM_DEFAULT_SOUND,
        enableVibrate: true,
        enableLights: true,
    });

    await Notifications.setNotificationChannelAsync(NEW_ORDER_CHANNEL_ID, {
        name: "New Orders",
        importance: Notifications.AndroidImportance.MAX,
        sound: HUNGRIE_SOUND_ANDROID,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        enableLights: true,
    });
};

export const ensureNotificationChannels = async () => {
    await ensureAndroidChannel();
};

export const requestPermissions = async (): Promise<boolean> => {
    if (isWeb) {
        const NotificationApi = getWebNotification();
        if (!NotificationApi) return false;
        const result = await NotificationApi.requestPermission();
        return result === "granted";
    }

    const Notifications = getNotificationsModule();
    if (!Notifications) return false;
    if (!Device.isDevice) return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === "granted") {
        await ensureAndroidChannel();
        return true;
    }
    const { status } = await Notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
        },
    });
    const granted = status === "granted";
    if (granted) {
        await ensureAndroidChannel();
    }
    return granted;
};

export const getPushToken = async (): Promise<PushTokenInfo | null> => {
    if (!isRemotePushSupported()) return null;
    const Notifications = getNotificationsModule();
    if (!Notifications) return null;
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== "granted") return null;
    const response = await Notifications.getDevicePushTokenAsync();
    const platform: PushPlatform =
        response.type === "ios" ? "ios" : response.type === "android" ? "android" : Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";
    const provider: PushProvider = platform === "ios" ? "apns" : platform === "android" ? "fcm" : "unknown";
    return { token: String(response.data || ""), platform, provider };
};

export const notifyLocal = async (title: string, body: string, options: LocalNotificationOptions = {}) => {
    const {
        withSound = true,
        channelId = DEFAULT_CHANNEL_ID,
        soundName = SYSTEM_DEFAULT_SOUND,
        data = {},
    } = options;
    if (isWeb) {
        const NotificationApi = getWebNotification();
        if (NotificationApi && NotificationApi.permission === "granted") {
            new NotificationApi(title, { body });
        }
        return;
    }
    const Notifications = getNotificationsModule();
    if (!Notifications) return;
    await ensureAndroidChannel();
    const resolvedSound =
        Platform.OS === "android"
            ? soundName === HUNGRIE_SOUND_FILE || soundName === "hungrie"
              ? HUNGRIE_SOUND_ANDROID
              : soundName === SYSTEM_DEFAULT_SOUND || soundName === "default"
                ? SYSTEM_DEFAULT_SOUND
                : undefined
            : soundName;
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: withSound ? resolvedSound : undefined,
            data,
            ...(Platform.OS === "android" ? { channelId } : {}),
        },
        trigger: null,
    });
};

export const subscribeToResponses = (handler: NotificationResponseHandler) => {
    const Notifications = getNotificationsModule();
    if (!Notifications || isWeb) {
        return () => {};
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const payload = (response?.notification?.request?.content?.data ?? {}) as NotificationPayload;
        handler(payload);
    });
    return () => {
        subscription.remove();
    };
};

export const subscribeToReceived = (handler: NotificationReceivedHandler) => {
    const Notifications = getNotificationsModule();
    if (!Notifications || isWeb) {
        return () => {};
    }
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
        const payload = (notification?.request?.content?.data ?? {}) as NotificationPayload;
        handler(payload);
    });
    return () => {
        subscription.remove();
    };
};

export const getLastNotificationResponsePayload = async (): Promise<NotificationPayload | null> => {
    const Notifications = getNotificationsModule();
    if (!Notifications || isWeb) return null;
    const response = await Notifications.getLastNotificationResponseAsync().catch(() => null);
    const payload = (response?.notification?.request?.content?.data ?? null) as NotificationPayload | null;
    return payload;
};

export const NotificationManager = {
    DEFAULT_CHANNEL_ID,
    NEW_ORDER_CHANNEL_ID,
    ORDER_STATUS_CHANNEL_ID,
    HUNGRIE_SOUND_FILE,
    HUNGRIE_SOUND_ANDROID,
    SYSTEM_DEFAULT_SOUND,
    ensureNotificationHandler,
    ensureNotificationChannels,
    requestPermissions,
    getPushToken,
    notifyLocal,
    subscribeToReceived,
    subscribeToResponses,
    getLastNotificationResponsePayload,
};

export default NotificationManager;
