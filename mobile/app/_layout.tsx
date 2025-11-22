import { useEffect } from "react";
import { SplashScreen, Stack } from "expo-router";
import { useFonts } from "expo-font";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

import useAuthStore from "@/store/auth.store";
import { ThemeProvider } from "@/src/theme/themeContext";
import "./globals.css";

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
    const { isLoading, fetchAuthenticatedUser } = useAuthStore();
    const ezraFiles = {
        light: require("../assets/fonts/Ezra-Light.ttf"),
        regular: require("../assets/fonts/Ezra-Regular.ttf"),
        medium: require("../assets/fonts/Ezra-Medium.ttf"),
        semiBold: require("../assets/fonts/Ezra-SemiBold.ttf"),
        bold: require("../assets/fonts/Ezra-Bold.ttf"),
    } as const;

    const [fontsLoaded, error] = useFonts({
        "Ezra-Light": ezraFiles.light,
        "Ezra-Regular": ezraFiles.regular,
        "Ezra-Medium": ezraFiles.medium,
        "Ezra-SemiBold": ezraFiles.semiBold,
        "Ezra-Bold": ezraFiles.bold,
    });

    useEffect(() => {
        fetchAuthenticatedUser();
    }, [fetchAuthenticatedUser]);

    useEffect(() => {
        if (fontsLoaded) {
            SplashScreen.hideAsync().catch(() => null);
        }
    }, [fontsLoaded]);

    if (error) throw error;
    if (!fontsLoaded || isLoading) return null;

    return (
        <ThemeProvider>
            <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
    );
}

const RootLayout = enableSentry ? Sentry.wrap(RootLayoutBase) : RootLayoutBase;

if (enableSentry) {
    Sentry.showFeedbackWidget();
}

export default RootLayout;

