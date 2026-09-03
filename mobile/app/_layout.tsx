import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SplashScreen, Stack, usePathname, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as Sentry from "@sentry/react-native";
import { Animated, AppState, Easing, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import useAuthStore from "@/store/auth.store";
import { ThemeProvider, useTheme } from "@/src/theme/themeContext";
import "@/src/lib/i18n";
import "./globals.css";
import { isRemotePushSupported, NotificationManager } from "@/src/features/notifications/NotificationManager";
import { startOrderStatusWatcher } from "@/src/features/notifications/orderStatusWatcher";
import { getCurrentAuthUserId } from "@/src/data/authRepository";
import CartLockNotice from "@/components/CartLockNotice";
import SplashPulse from "@/components/SplashPulse";
import InternetConnectionGate from "@/src/features/connectivity/InternetConnectionGate";
import { registerPushToken, unregisterPushToken } from "@/src/data/notificationRepository";
import { playOrderNotificationSound, unloadOrderNotificationSound } from "@/src/features/notifications/orderSound";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";
import { useReducedMotion } from "@/src/lib/useReducedMotion";
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

const THEME_FADE_DURATION_MS = 240;
const APP_TEXT_SCALE_LIMIT = 1.2;
const chairoRegular = require("../assets/fonts/ChairoSansRegular-Regular.ttf");

const configureDefaultText = (component: any) => {
    const existingStyle = component?.defaultProps?.style;
    const styleArray = Array.isArray(existingStyle) ? existingStyle : existingStyle ? [existingStyle] : [];
    const hasChairo = styleArray.some((style: any) => style?.fontFamily === "ChairoSans");

    component.defaultProps = {
        ...(component.defaultProps || {}),
        maxFontSizeMultiplier: APP_TEXT_SCALE_LIMIT,
        style: hasChairo ? styleArray : [{ fontFamily: "ChairoSans" }, ...styleArray],
    };
};

configureDefaultText(Text);
configureDefaultText(TextInput);

const ThemeTransitionOverlay = ({ backgroundColor }: { backgroundColor: string }) => {
    const reduceMotion = useReducedMotion();
    const previousColorRef = useRef(backgroundColor);
    const opacity = useRef(new Animated.Value(0)).current;
    const [overlayColor, setOverlayColor] = useState(backgroundColor);

    useLayoutEffect(() => {
        const previousColor = previousColorRef.current;
        previousColorRef.current = backgroundColor;
        if (previousColor === backgroundColor || reduceMotion) return;

        opacity.stopAnimation();
        setOverlayColor(previousColor);
        opacity.setValue(0.42);

        Animated.timing(opacity, {
            toValue: 0,
            duration: THEME_FADE_DURATION_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        return () => {
            opacity.stopAnimation();
        };
    }, [backgroundColor, opacity, reduceMotion]);

    return (
        <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayColor, opacity, zIndex: 10000 }]}
        />
    );
};

function RootLayoutBase() {
    const { theme, variant, hydrated: themeHydrated } = useTheme();
    const { isLoading, isAuthenticated, user, fetchAuthenticatedUser } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
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
    const [fontsLoaded, error] = useFonts({
        ChairoSans: chairoRegular,
    });

    useEffect(() => {
        fetchAuthenticatedUser();
    }, [fetchAuthenticatedUser]);

    useEffect(() => {
        if (Platform.OS !== "web") return;
        if (typeof document === "undefined") return;
        document.title = "HungrieApp";
    }, [pathname]);

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
        const resolvedUserId = getCurrentAuthUserId() || user?.accountId || user?.id || user?.$id || null;
        if (!resolvedUserId) return;

        const stopWatcher = startOrderStatusWatcher(resolvedUserId);

        NotificationManager.requestPermissions().catch((error) => {
            console.warn("[notifications] Order status watcher failed", error);
        });

        return () => {
            stopWatcher();
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
        if (!fontsLoaded || !themeHydrated) return;
        if (didHideNativeSplashRef.current) return;

        // Native splash is kept visible until fonts and the saved theme are ready.
        didHideNativeSplashRef.current = true;
        SplashScreen.hideAsync().catch(() => null);
    }, [fontsLoaded, themeHydrated]);

    useEffect(() => {
        if (!themeHydrated) return;
        void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => null);
    }, [theme.colors.background, themeHydrated]);

    if (error) throw error;
    if (!fontsLoaded || !themeHydrated) {
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
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
                <StatusBar style={variant === "dark" ? "light" : "dark"} />
                <CartLockNotice />
                <View
                    style={
                        isWeb
                            ? { flex: 1, alignSelf: "center", width: "100%", maxWidth: contentWidth, backgroundColor: theme.colors.background }
                            : { flex: 1, backgroundColor: theme.colors.background }
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
                <InternetConnectionGate />
                <ThemeTransitionOverlay backgroundColor={theme.colors.background} />
        </GestureHandlerRootView>
    );
}

const ThemedRootLayout = enableSentry ? Sentry.wrap(RootLayoutBase) : RootLayoutBase;

const RootLayout = () => (
    <ThemeProvider>
        <ThemedRootLayout />
    </ThemeProvider>
);

export default RootLayout;
