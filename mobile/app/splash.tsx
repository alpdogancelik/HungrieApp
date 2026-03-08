import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import BrandMotion from "../components/BrandMotion";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { isAuthRequired } from "@/lib/runtimeEnv";
import useAuthStore from "@/store/auth.store";
import { useReducedMotion } from "@/src/lib/useReducedMotion";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";

import brandMark from "../assets/images/hungrie-mark.png";

const brandWordmark = require("../assets/images/hungrie-wordmark.png");
const heroPackshot = require("../assets/images/vecteezy_fast-food-meal-with_25065315.png");

const BACKGROUND_COLOR = "#FFF7EF";
const CONTENT_MAX_WIDTH = 520;

const authGuardEnabled = isAuthRequired();

export default function Splash() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const { width: windowWidth } = useStableWindowDimensions();
    const isWeb = Platform.OS === "web";
    const contentWidth = isWeb ? Math.min(Math.max(windowWidth, 320), CONTENT_MAX_WIDTH) : windowWidth;

    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    const [exitRequested, setExitRequested] = useState(false);
    const [nextRoute, setNextRoute] = useState<string | null>(null);
    const exitStartedRef = useRef(false);

    const sizes = useMemo(() => {
        const wordmarkWidth = Math.round(Math.min(360, Math.max(224, contentWidth * 0.72)));
        const markSize = Math.round(Math.min(148, Math.max(112, contentWidth * 0.34)));
        return { wordmarkWidth, markSize };
    }, [contentWidth]);

    const containerOpacity = useSharedValue(1);
    const bgOpacity = useSharedValue(0);
    const wordmarkOpacity = useSharedValue(0);
    const wordmarkTranslateY = useSharedValue(-8);
    const heroOpacity = useSharedValue(0);
    const heroScale = useSharedValue(1.06);
    const logoOpacity = useSharedValue(0);
    const logoScale = useSharedValue(0.9);

    const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
    const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
    const wordmarkStyle = useAnimatedStyle(() => ({
        opacity: wordmarkOpacity.value,
        transform: [{ translateY: wordmarkTranslateY.value }],
    }));
    const heroStyle = useAnimatedStyle(() => ({
        opacity: heroOpacity.value,
        transform: [{ scale: heroScale.value }],
    }));
    const logoStyle = useAnimatedStyle(() => ({
        opacity: logoOpacity.value,
        transform: [{ scale: logoScale.value }],
    }));

    useEffect(() => {
        let mounted = true;

        const resolveHomeOrPanel = async () => {
            const ownedRestaurantId = await getOwnedRestaurantId().catch(() => null);
            return ownedRestaurantId ? "/restaurantpanel" : "/home";
        };

        const resolveNextRoute = async () => {
            if (authGuardEnabled && !isAuthenticated) {
                if (mounted) setNextRoute("/sign-in");
                return;
            }

            if (!isAuthenticated && !authGuardEnabled) {
                if (mounted) setNextRoute("/home");
                return;
            }

            const destination = await resolveHomeOrPanel();
            if (mounted) setNextRoute(destination);
        };

        resolveNextRoute();

        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    const navigateTo = useCallback(
        (route: string) => {
            router.replace(route as any);
        },
        [router],
    );

    const startExit = useCallback(
        (route: string) => {
            if (exitStartedRef.current) return;
            exitStartedRef.current = true;
            const duration = reduceMotion ? 120 : 220;
            containerOpacity.value = withTiming(
                0,
                { duration, easing: Easing.out(Easing.quad) },
                (finished) => {
                    if (!finished) return;
                    runOnJS(navigateTo)(route);
                },
            );
        },
        [containerOpacity, navigateTo, reduceMotion],
    );

    useEffect(() => {
        if (reduceMotion) {
            bgOpacity.value = 1;
            wordmarkOpacity.value = 1;
            wordmarkTranslateY.value = 0;
            heroOpacity.value = 1;
            heroScale.value = 1;
            logoOpacity.value = 1;
            logoScale.value = 1;
            return;
        }

        bgOpacity.value = withTiming(1, { duration: 200 });
        wordmarkOpacity.value = withDelay(60, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
        wordmarkTranslateY.value = withDelay(60, withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }));
        heroOpacity.value = withDelay(120, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
        heroScale.value = withDelay(120, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
        logoOpacity.value = withDelay(240, withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
        logoScale.value = withDelay(240, withSpring(1, { damping: 12, stiffness: 140, mass: 1 }));
    }, [
        bgOpacity,
        heroOpacity,
        heroScale,
        logoOpacity,
        logoScale,
        reduceMotion,
        wordmarkOpacity,
        wordmarkTranslateY,
    ]);

    useEffect(() => {
        const delay = reduceMotion ? 650 : 1550;
        const id = setTimeout(() => setExitRequested(true), delay);
        return () => clearTimeout(id);
    }, [reduceMotion]);

    useEffect(() => {
        if (!exitRequested) return;
        if (!nextRoute) return;
        startExit(nextRoute);
    }, [exitRequested, nextRoute, startExit]);

    const topPad = Math.max(insets.top, 16);
    const bottomPad = Math.max(insets.bottom, 18);

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
            <StatusBar style="dark" />
            <Pressable style={styles.pressable} onPress={() => setExitRequested(true)}>
                <Animated.View style={[styles.outer, containerStyle]}>
                    <View style={[styles.content, isWeb ? { width: contentWidth } : null]}>
                        <Animated.View style={[styles.heroCard, bgStyle, { paddingTop: topPad, paddingBottom: bottomPad }]}>
                            <LinearGradient
                                colors={["#FE8C00", "#FE5F75"]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0.8 }}
                                style={StyleSheet.absoluteFillObject}
                            />

                            <View style={styles.heroInner}>
                                <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
                                    <Image
                                        source={brandWordmark}
                                        style={{ width: sizes.wordmarkWidth, aspectRatio: 2.786 }}
                                        contentFit="contain"
                                        cachePolicy="memory-disk"
                                    />
                                </Animated.View>

                                <Animated.View style={[styles.packshotWrap, heroStyle]}>
                                    <View style={styles.packshotCard}>
                                        <Image
                                            source={heroPackshot}
                                            style={StyleSheet.absoluteFillObject}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                        />
                                        <LinearGradient
                                            colors={["rgba(15,23,42,0.00)", "rgba(15,23,42,0.40)"]}
                                            start={{ x: 0.5, y: 0 }}
                                            end={{ x: 0.5, y: 1 }}
                                            style={StyleSheet.absoluteFillObject}
                                        />
                                    </View>
                                </Animated.View>

                                <Animated.View style={[styles.logoWrap, logoStyle]}>
                                    <View style={styles.logoBubble}>
                                        <BrandMotion
                                            fallbackImage={brandMark}
                                            autoplay
                                            loop={false}
                                            style={{ width: sizes.markSize, height: sizes.markSize }}
                                        />
                                    </View>
                                    <Text style={styles.tapHint}>Tap to continue</Text>
                                </Animated.View>
                            </View>
                        </Animated.View>
                    </View>
                </Animated.View>
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: BACKGROUND_COLOR,
    },
    pressable: {
        flex: 1,
    },
    outer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
        paddingVertical: 18,
    },
    content: {
        width: "100%",
        maxWidth: CONTENT_MAX_WIDTH,
    },
    heroCard: {
        borderRadius: 40,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.22)",
        shadowColor: "#000",
        shadowOpacity: Platform.OS === "ios" ? 0.18 : 0.26,
        shadowOffset: { width: 0, height: 18 },
        shadowRadius: 28,
        elevation: 12,
    },
    heroInner: {
        paddingHorizontal: 18,
        paddingBottom: 22,
        gap: 18,
    },
    wordmarkWrap: {
        alignItems: "center",
    },
    packshotWrap: {
        width: "100%",
    },
    packshotCard: {
        width: "100%",
        aspectRatio: 0.86,
        borderRadius: 32,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.28)",
        backgroundColor: "rgba(15,23,42,0.25)",
    },
    logoWrap: {
        alignItems: "center",
        gap: 10,
    },
    logoBubble: {
        borderRadius: 999,
        padding: 14,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.60)",
    },
    tapHint: {
        fontSize: 13,
        color: "rgba(255,255,255,0.90)",
        letterSpacing: 0.2,
    },
});
