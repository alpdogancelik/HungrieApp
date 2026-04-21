import { useEffect, useRef, useState } from "react";
import { SplashScreen, Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import { AppState, Platform, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import useAuthStore from "@/store/auth.store";
import { ThemeProvider } from "@/src/theme/themeContext";
import "@/src/lib/i18n";
import "./globals.css";
import { isRemotePushSupported, NotificationManager } from "@/src/features/notifications/NotificationManager";
import { startOrderStatusWatcher } from "@/src/features/notifications/orderStatusWatcher";
import { auth } from "@/lib/firebase";
import CartLockNotice from "@/components/CartLockNotice";
import SplashPulse from "@/components/SplashPulse";
import { registerPushToken, unregisterPushToken } from "@/lib/registerPushToken";
import { playOrderNotificationSound, unloadOrderNotificationSound } from "@/src/features/notifications/orderSound";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";
import webSplashImage from "../assets/hungriesplash.png";
import mobileSplashImage from "../assets/hungriesplashmobile.png";

const extra = Constants.expoConfig?.extra ?? {};
const env = (typeof process !== "undefined" ? (process as any).env : undefined) ?? {};
const sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN || extra.EXPO_PUBLIC_SENTRY_DSN;
const enableSentry = Boolean(sentryDsn);
if (enableSentry) {
    Sentry.init({
        dsn: sentryDsn,
        sendDefaultPii: true,
    });
}

void SplashScreen.preventAutoHideAsync().catch(() => null);

function RootLayoutBase() {
    const { isLoading, isAuthenticated, user, fetchAuthenticatedUser } = useAuthStore();
    const router = useRouter();
    const pushRegistrationKeyRef = useRef<string | null>(null);
    const didHideNativeSplashRef = useRef(false);
    const [launchSplashVisible, setLaunchSplashVisible] = useState(true);
    const { width: windowWidth, height: windowHeight } = useStableWindowDimensions();
    const isWeb = Platform.OS === "web";
    const safeWindowWidth = windowWidth > 0 ? windowWidth : isWeb ? 1440 : 390;
    const safeWindowHeight = windowHeight > 0 ? windowHeight : isWeb ? 900 : 844;
    const isCompactWeb = isWeb && safeWindowWidth <= 768;
    const splashImage = isCompactWeb ? mobileSplashImage : isWeb ? webSplashImage : mobileSplashImage;
    const resolvedSplashSource = Asset.fromModule(splashImage);
    const splashAspectRatio =
        resolvedSplashSource?.width && resolvedSplashSource?.height
            ? resolvedSplashSource.width / resolvedSplashSource.height
            : 1024 / 1536;
    const WEB_MAX_WIDTH = 960;
    const contentWidth = isWeb ? Math.min(safeWindowWidth, WEB_MAX_WIDTH) : safeWindowWidth;
    const splashPreviewWidth = Math.min(
        isWeb ? Math.min(safeWindowWidth * 0.4, 520) : Math.min(safeWindowWidth * 0.94, 420),
        (isWeb ? Math.min(safeWindowHeight * 0.82, 760) : Math.min(safeWindowHeight * 0.8, 700)) * splashAspectRatio,
    );
    const splashPreviewHeight = splashPreviewWidth / splashAspectRatio;
    const shouldUseFullBleedSplash = !isWeb || isCompactWeb;
    const chairoRegular = require("../assets/fonts/ChairoSansRegular-Regular.ttf");
    const applyDefaultFont = (component: any) => {
        const existingStyle = component?.defaultProps?.style;
        const styleArray = Array.isArray(existingStyle) ? existingStyle : existingStyle ? [existingStyle] : [];
        const hasChairo = styleArray.some((style: any) => style?.fontFamily === "ChairoSans");
        const mergedStyle = hasChairo ? styleArray : [{ fontFamily: "ChairoSans" }, ...styleArray];

        component.defaultProps = {
            ...(component.defaultProps || {}),
            style: mergedStyle,
        };
    };
    const [fontsLoaded, error] = useFonts({
        ChairoSans: chairoRegular,
    });

    useEffect(() => {
        fetchAuthenticatedUser();
    }, [fetchAuthenticatedUser]);

    useEffect(() => {
        NotificationManager.ensureNotificationHandler();
    }, []);

    useEffect(() => {
        if (Platform.OS !== "android") return;
        NotificationManager.ensureNotificationChannels().catch((error) => {
            console.warn("[notifications] Failed to initialize channels", error);
        });
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (!isRemotePushSupported()) return;
        let cancelled = false;

        const registerPush = async () => {
            try {
                const registered = await registerPushToken();
                if (!registered || cancelled) return;
                const registrationKey = `restaurant::${registered.token}`;
                if (pushRegistrationKeyRef.current === registrationKey) return;
                pushRegistrationKeyRef.current = registrationKey;
            } catch (error) {
                console.warn("[notifications] Failed to register push token", error);
            }
        };

        registerPush().catch((error) => console.warn("[notifications] Registration error", error));
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, user]);

    useEffect(() => {
        if (isAuthenticated) return;
        if (!isRemotePushSupported()) return;

        unregisterPushToken().catch((error) => {
            console.warn("[notifications] Failed to unregister push token", error);
        });
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (!isRemotePushSupported()) return;

        const subscription = AppState.addEventListener("change", (state) => {
            if (state !== "active") return;
            void registerPushToken().catch((error) => {
                console.warn("[notifications] Re-register on resume failed", error);
            });
        });

        return () => {
            subscription.remove();
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const resolvedUserId = auth?.currentUser?.uid ?? user?.accountId ?? user?.id ?? user?.$id ?? null;
        if (!resolvedUserId) return;

        let cancelled = false;
        let stopWatcher: (() => void) | null = null;

        const bootOrderNotifications = async () => {
            const granted = await NotificationManager.requestPermissions();
            if (!granted || cancelled) return;
            stopWatcher = startOrderStatusWatcher(resolvedUserId);
        };

        bootOrderNotifications().catch((error) => {
            console.warn("[notifications] Order status watcher failed", error);
        });

        return () => {
            cancelled = true;
            stopWatcher?.();
        };
    }, [isAuthenticated, user?.$id, user?.accountId, user?.id]);

    useEffect(() => {
        const handleNotificationPayload = (payload: Record<string, unknown>) => {
            const orderId = String(payload?.orderId || "");
            const restaurantId = String(payload?.restaurantId || "");
            if (!orderId) return;
            if (restaurantId) {
                router.push({
                    pathname: "/restaurantpanel/order/[orderId]",
                    params: { orderId, restaurantId },
                });
                return;
            }
            router.push({
                pathname: "/order/pending",
                params: { orderId },
            });
        };

        NotificationManager.getLastNotificationResponsePayload()
            .then((payload) => {
                if (payload) handleNotificationPayload(payload);
            })
            .catch(() => null);

        const unsubscribe = NotificationManager.subscribeToResponses(handleNotificationPayload);
        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        const unsubscribe = NotificationManager.subscribeToReceived((payload) => {
            const orderId = String(payload?.orderId || "");
            const restaurantId = String(payload?.restaurantId || "");
            if (!orderId || !restaurantId) return;
            void playOrderNotificationSound();
        });
        return () => {
            unsubscribe();
            void unloadOrderNotificationSound();
        };
    }, []);

    useEffect(() => {
        if (!fontsLoaded) return;
        if (didHideNativeSplashRef.current) return;

        // Native splash is kept visible until JS is ready.
        applyDefaultFont(Text);
        applyDefaultFont(TextInput);
        didHideNativeSplashRef.current = true;
        SplashScreen.hideAsync().catch(() => null);
    }, [fontsLoaded]);

    if (error) throw error;
    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7EF" }}>
                {shouldUseFullBleedSplash ? (
                    <Image source={splashImage} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                    <Image
                        source={splashImage}
                        style={{ width: splashPreviewWidth, height: splashPreviewHeight }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                    />
                )}
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider>
                <CartLockNotice />
                <View
                    style={
                        isWeb
                            ? { flex: 1, alignSelf: "center", width: "100%", maxWidth: contentWidth }
                            : { flex: 1 }
                    }
                >
                    <Stack screenOptions={{ headerShown: false }} />
                </View>
                <SplashPulse
                    visible={launchSplashVisible}
                    onFinished={() => setLaunchSplashVisible(false)}
                    imageSource={splashImage}
                    backgroundColor="#FFF7EF"
                />
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}

const RootLayout = enableSentry ? Sentry.wrap(RootLayoutBase) : RootLayoutBase;

export default RootLayout;
