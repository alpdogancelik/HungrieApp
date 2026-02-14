import { useEffect, useRef } from "react";
import { SplashScreen, Stack } from "expo-router";
import { useFonts } from "expo-font";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import { Platform, Text, TextInput, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import useAuthStore from "@/store/auth.store";
import { ThemeProvider } from "@/src/theme/themeContext";
import "@/src/lib/i18n";
import "./globals.css";
import { isRemotePushSupported, NotificationManager } from "@/src/features/notifications/NotificationManager";
import { registerTokenWithBackend } from "@/src/features/notifications/push";
import CartLockNotice from "@/components/CartLockNotice";

const extra = Constants.expoConfig?.extra ?? {};
const env = (typeof process !== "undefined" ? (process as any).env : undefined) ?? {};
const sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN || extra.EXPO_PUBLIC_SENTRY_DSN;
const enableSentry = Boolean(sentryDsn);

if (enableSentry) {
    Sentry.init({
        dsn: sentryDsn,
        sendDefaultPii: true,
        replaysSessionSampleRate: 1,
        replaysOnErrorSampleRate: 1,
        integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
    });
}

void SplashScreen.preventAutoHideAsync().catch(() => null);

function RootLayoutBase() {
    const { isLoading, isAuthenticated, user, fetchAuthenticatedUser } = useAuthStore();
    const pushRegistrationKeyRef = useRef<string | null>(null);
    const { width: windowWidth } = useWindowDimensions();
    const isWeb = Platform.OS === "web";
    const WEB_MAX_WIDTH = 960;
    const contentWidth = isWeb ? Math.min(windowWidth, WEB_MAX_WIDTH) : windowWidth;
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
        if (!isAuthenticated) return;
        if (!isRemotePushSupported()) return;
        let cancelled = false;

        const registerPush = async () => {
            const granted = await NotificationManager.requestPermissions();
            if (!granted || cancelled) return;

            const tokenInfo = await NotificationManager.getPushToken();
            if (!tokenInfo || cancelled) return;

            const userId = user?.id ?? user?.$id ?? user?.accountId ?? null;
            const registrationKey = `${userId || "anon"}::${tokenInfo.token}`;
            if (pushRegistrationKeyRef.current === registrationKey) return;
            pushRegistrationKeyRef.current = registrationKey;

            try {
                await registerTokenWithBackend(userId, tokenInfo.token, tokenInfo.platform);
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
        if (!fontsLoaded || isLoading) return;

        applyDefaultFont(Text);
        applyDefaultFont(TextInput);
        SplashScreen.hideAsync().catch(() => null);
    }, [fontsLoaded, isLoading]);

    if (error) throw error;
    if (!fontsLoaded || isLoading) return null;

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
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}

const RootLayout = enableSentry ? Sentry.wrap(RootLayoutBase) : RootLayoutBase;

if (enableSentry) {
    Sentry.showFeedbackWidget();
}

export default RootLayout;
