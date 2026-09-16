import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SplashScreen, Stack, usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";
import { Animated, AppState, Easing, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { onIdTokenChanged } from "firebase/auth";

import useAuthStore from "@/store/auth.store";
import { ThemeProvider, useTheme } from "@/src/theme/themeContext";
import "@/src/lib/i18n";
import "./globals.css";
import { isRemotePushSupported, NotificationManager } from "@/src/features/notifications/NotificationManager";
import { startOrderStatusWatcher } from "@/src/features/notifications/orderStatusWatcher";
import { createBoundedRetry } from "@/src/features/notifications/boundedRetry";
import { getCurrentAuthUserId } from "@/src/data/authRepository";
import CartLockNotice from "@/components/CartLockNotice";
import SplashPulse from "@/components/SplashPulse";
import { markDevelopment } from "@/src/lib/performanceMetrics";
import InternetConnectionGate from "@/src/features/connectivity/InternetConnectionGate";
import MaintenanceGate from "@/src/features/runtime/MaintenanceGate";
import CustomerReleaseGate from "@/src/features/runtime/CustomerReleaseGate";
import CustomerAccessGate from "@/src/features/auth/CustomerAccessGate";
import { registerPushToken, unregisterPushToken } from "@/src/data/notificationRepository";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";
import { useReducedMotion } from "@/src/lib/useReducedMotion";
import webSplashImage from "../assets/hungriesplash.png";
import mobileSplashImage from "../assets/hungriesplashmobile.png";
import { auth } from "@/lib/firebase";

const extra = Constants.expoConfig?.extra ?? {};
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || extra.EXPO_PUBLIC_SENTRY_DSN;
const sentryEnabled = String(process.env.EXPO_PUBLIC_SENTRY_ENABLED || extra.EXPO_PUBLIC_SENTRY_ENABLED || "false") === "true";
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV || extra.EXPO_PUBLIC_APP_ENV || "development";
const enableSentry = sentryEnabled && Boolean(sentryDsn) && ["staging", "production"].includes(appEnvironment);
const sentryRelease = Constants.expoConfig?.version ? `com.hungrie.app@${Constants.expoConfig.version}` : undefined;
const sentryDistribution = Platform.OS === "ios"
    ? Constants.expoConfig?.ios?.buildNumber
    : Constants.expoConfig?.android?.versionCode?.toString();
if (enableSentry) {
    Sentry.init({
        dsn: sentryDsn,
        sendDefaultPii: false,
        environment: appEnvironment,
        release: sentryRelease,
        dist: sentryDistribution,
        beforeBreadcrumb(breadcrumb) {
            return {
                ...breadcrumb,
                data: undefined,
                message: breadcrumb.category?.startsWith("navigation") ? breadcrumb.message : undefined,
            };
        },
        beforeSend(event) {
            event.user = undefined;
            if (event.request) {
                event.request.cookies = undefined;
                event.request.data = undefined;
                event.request.headers = undefined;
            }
            return event;
        },
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
    const { isLoading, isAuthenticated, user, fetchAuthenticatedUser, syncAuthenticatedUser } = useAuthStore();
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();
    const pathname = usePathname();
    const isLegacyPrivilegedRoute = pathname === "/courier" || pathname.startsWith("/admin") || pathname.startsWith("/restaurantpanel");
    const pushRegistrationKeyRef = useRef<string | null>(null);
    const authStateHydratedRef = useRef(false);
    const authRecoveryInFlightRef = useRef(false);
    const handledNotificationResponsesRef = useRef(new Set<string>());
    const didHideNativeSplashRef = useRef(false);
    const [launchSplashVisible, setLaunchSplashVisible] = useState(true);
    const [releaseReady, setReleaseReady] = useState(false);
    const [customerAccessReadyFor, setCustomerAccessReadyFor] = useState<string | null>(null);
    const customerIdentityKey = isAuthenticated ? String(getCurrentAuthUserId() || "authenticated") : "guest";
    const customerAccessReady = customerAccessReadyFor === customerIdentityKey;
    const finishLaunchSplash = useCallback(() => setLaunchSplashVisible(false), []);
    const handleReleaseReadyChange = useCallback((ready: boolean) => {
        setReleaseReady(ready);
        if (!ready) setCustomerAccessReadyFor(null);
    }, []);
    const handleCustomerAccessReadyChange = useCallback((ready: boolean, identityKey: string) => {
        setCustomerAccessReadyFor(ready ? identityKey : null);
    }, []);
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
        if (rootNavigationState?.key && isLegacyPrivilegedRoute) router.replace("/home");
    }, [isLegacyPrivilegedRoute, rootNavigationState?.key, router]);

    useEffect(() => {
        if (!auth) return;
        // onIdTokenChanged emits the persisted Firebase identity once initial
        // restoration finishes. Let this single callback own cold-start auth
        // hydration; starting fetchAuthenticatedUser in parallel can invalidate
        // it and leave the root loading gate waiting indefinitely.
        const unsubscribe = onIdTokenChanged(auth, () => {
            void syncAuthenticatedUser(false);
        });
        const appStateSubscription = AppState.addEventListener("change", (state) => {
            if (state === "active") void syncAuthenticatedUser(true);
        });
        return () => {
            unsubscribe();
            appStateSubscription.remove();
        };
    }, [syncAuthenticatedUser]);

    useEffect(() => {
        let active = true;
        let listenerObservedState = false;
        let wasOffline: boolean | null = null;

        const handleNetworkState = (state: Network.NetworkState) => {
            const offline = state.isConnected === false || state.isInternetReachable === false;
            if (offline) {
                wasOffline = true;
                return;
            }
            if (wasOffline !== true || authRecoveryInFlightRef.current) {
                wasOffline = false;
                return;
            }

            wasOffline = false;
            authRecoveryInFlightRef.current = true;
            void fetchAuthenticatedUser().finally(() => {
                authRecoveryInFlightRef.current = false;
            });
        };

        void Network.getNetworkStateAsync().then((state) => {
            if (active && !listenerObservedState) handleNetworkState(state);
        }).catch(() => null);
        const subscription = Network.addNetworkStateListener((state) => {
            listenerObservedState = true;
            if (active) handleNetworkState(state);
        });

        return () => {
            active = false;
            subscription.remove();
        };
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
        if (!isAuthenticated || !customerAccessReady) return;
        if (!isRemotePushSupported()) return;
        let cancelled = false;

        const retry = createBoundedRetry({
            task: async () => {
                const registered = await registerPushToken();
                if (!registered || cancelled) return;
                const registrationKey = `customer::${registered.token}`;
                if (pushRegistrationKeyRef.current === registrationKey) return;
                pushRegistrationKeyRef.current = registrationKey;
            },
            onError: (error) => console.warn("[notifications] Failed to register push token", error),
        });

        void retry.run(true);
        const appStateSubscription = AppState.addEventListener("change", (state) => {
            if (state === "active") void retry.run(true);
        });
        const networkSubscription = Network.addNetworkStateListener((state) => {
            if (state.isConnected && state.isInternetReachable !== false) void retry.run(true);
        });
        return () => {
            cancelled = true;
            retry.cancel();
            appStateSubscription.remove();
            networkSubscription.remove();
        };
    }, [customerAccessReady, isAuthenticated, user]);

    useEffect(() => {
        if (isLoading) return;
        if (!authStateHydratedRef.current) {
            authStateHydratedRef.current = true;
            return;
        }
        if (isAuthenticated) return;
        if (!isRemotePushSupported()) return;

        unregisterPushToken().catch((error) => {
            console.warn("[notifications] Failed to unregister push token", error);
        });
    }, [isAuthenticated, isLoading]);

    useEffect(() => {
        if (!isAuthenticated || !customerAccessReady) return;
        // Native development/production builds receive remote Expo pushes.
        // Avoid a second full-history listener and duplicate foreground alerts.
        if (isRemotePushSupported()) return;
        const resolvedUserId = getCurrentAuthUserId() || user?.accountId || user?.id || user?.$id || null;
        if (!resolvedUserId) return;

        const stopWatcher = startOrderStatusWatcher(resolvedUserId);

        NotificationManager.requestPermissions().catch((error) => {
            console.warn("[notifications] Order status watcher failed", error);
        });

        return () => {
            stopWatcher();
        };
    }, [customerAccessReady, isAuthenticated, user?.$id, user?.accountId, user?.id]);

    useEffect(() => {
        if (!rootNavigationState?.key || isLoading || !isAuthenticated || !customerAccessReady) return;

        let cancelled = false;
        let responsePollTimer: ReturnType<typeof setTimeout> | null = null;

        const handleNotificationPayload = (payload: Record<string, unknown>) => {
            const orderId = String(payload?.orderId || "");
            const reviewId = String(payload?.reviewId || "");
            const type = String(payload?.type || "");
            if (!type || (type !== "review_reply" && !orderId) || (type === "review_reply" && !reviewId)) return false;
            // Wait for the root redirect before opening a notification target.
            if (pathname === "/") return false;
            const responseKey = String(payload?.eventId || `${type}:${orderId || reviewId}`);
            if (handledNotificationResponsesRef.current.has(responseKey)) return false;
            handledNotificationResponsesRef.current.add(responseKey);

            if (type === "review_reply") {
                router.push("/orders");
                return true;
            }
            if (type === "restaurant_new_order" || type === "restaurant_reminder") return false;
            // Resolve the notification against the guarded detail contract so
            // the Customer sees the current authoritative order immediately.
            router.push({
                pathname: "/orders/[id]",
                params: { id: orderId },
            });
            return true;
        };

        const consumePayload = (payload: Record<string, unknown>) => {
            if (!handleNotificationPayload(payload)) return false;
            void NotificationManager.clearLastNotificationResponse().catch(() => null);
            return true;
        };

        const pollForColdStartResponse = async (attempt = 0) => {
            const payload = await NotificationManager.getLastNotificationResponsePayload().catch(() => null);
            if (cancelled) return;
            if (payload && consumePayload(payload)) return;
            // On a terminated iOS launch, the native response can become
            // available shortly after the JS navigation tree is ready.
            if (attempt < 20) {
                responsePollTimer = setTimeout(() => void pollForColdStartResponse(attempt + 1), 250);
            }
        };

        const unsubscribe = NotificationManager.subscribeToResponses(consumePayload);
        void pollForColdStartResponse();
        return () => {
            cancelled = true;
            if (responsePollTimer) clearTimeout(responsePollTimer);
            unsubscribe();
        };
    }, [customerAccessReady, isAuthenticated, isLoading, pathname, rootNavigationState?.key, router]);

    useEffect(() => {
        if (!fontsLoaded || !themeHydrated) return;
        if (didHideNativeSplashRef.current) return;

        // Native splash is kept visible until fonts and the saved theme are ready.
        didHideNativeSplashRef.current = true;
        SplashScreen.hideAsync().catch(() => null);
    }, [fontsLoaded, themeHydrated]);

    useEffect(() => {
        if (!fontsLoaded || !themeHydrated || isLoading || !rootNavigationState?.key) return;
        markDevelopment("startup.ready");
    }, [fontsLoaded, isLoading, rootNavigationState?.key, themeHydrated]);

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
                    {!isLegacyPrivilegedRoute && releaseReady && customerAccessReady ? <Stack screenOptions={{ headerShown: false }} /> : null}
                </View>
                <SplashPulse
                    visible={launchSplashVisible}
                    ready={!isLoading && Boolean(rootNavigationState?.key)}
                    onFinished={finishLaunchSplash}
                    imageSource={splashImage}
                    backgroundColor="#FFF7EF"
                />
                <InternetConnectionGate />
                <MaintenanceGate />
                <CustomerReleaseGate onReadyChange={handleReleaseReadyChange} />
                {releaseReady ? <CustomerAccessGate onReadyChange={handleCustomerAccessReadyChange} /> : null}
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
