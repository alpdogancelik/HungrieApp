import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { isAuthRequired } from "@/lib/runtimeEnv";

import brandMark from "../assets/images/hungrie-mark.png";

const brandWordmark = require("../assets/images/hungrie-wordmark.png");
const burger3d = require("../assets/images/Burger.png");
const pizza3d = require("../assets/images/Pizza.png");
const fries3d = require("../assets/images/Fries.png");

const ONBOARDING_SEEN_KEY = "hungrie.onboarding.seen";
const BACKGROUND_COLOR = "#FFF7EF";

export default function Splash() {
    const router = useRouter();
    const { width } = useWindowDimensions();

    const sizes = useMemo(() => {
        const markSize = Math.round(Math.min(168, Math.max(118, width * 0.34)));
        const wordmarkWidth = Math.round(Math.min(340, Math.max(220, width * 0.72)));
        const burgerSize = Math.round(Math.min(250, Math.max(170, width * 0.62)));
        const pizzaSize = Math.round(Math.min(220, Math.max(150, width * 0.56)));
        const friesSize = Math.round(Math.min(170, Math.max(120, width * 0.4)));
        return { markSize, wordmarkWidth, burgerSize, pizzaSize, friesSize };
    }, [width]);

    const didNavigateRef = useRef(false);
    const nextRouteRef = useRef("/welcome");

    const containerOpacity = useRef(new Animated.Value(1)).current;
    const markScale = useRef(new Animated.Value(0.88)).current;
    const markOpacity = useRef(new Animated.Value(0)).current;
    const wordmarkOpacity = useRef(new Animated.Value(0)).current;
    const wordmarkTranslateY = useRef(new Animated.Value(10)).current;
    const taglineOpacity = useRef(new Animated.Value(0)).current;
    const taglineTranslateY = useRef(new Animated.Value(8)).current;
    const bgFloat = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let mounted = true;

        const resolveNextRoute = async () => {
            const seen = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY).catch(() => null);
            if (!mounted) return;
            if (seen === "1") {
                nextRouteRef.current = isAuthRequired() ? "/sign-in" : "/home";
            }
        };

        resolveNextRoute();
        return () => {
            mounted = false;
        };
    }, []);

    const navigateNext = useCallback(() => {
        if (didNavigateRef.current) return;
        didNavigateRef.current = true;
        router.replace(nextRouteRef.current as any);
    }, [router]);

    useEffect(() => {
        let cancelled = false;

        const floatLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(bgFloat, { toValue: 1, duration: 2200, useNativeDriver: true }),
                Animated.timing(bgFloat, { toValue: 0, duration: 2200, useNativeDriver: true }),
            ]),
        );
        floatLoop.start();

        const sequence = Animated.sequence([
            Animated.parallel([
                Animated.timing(markOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(markScale, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }),
            ]),
            Animated.delay(120),
            Animated.parallel([
                Animated.timing(wordmarkOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
                Animated.timing(wordmarkTranslateY, { toValue: 0, duration: 260, useNativeDriver: true }),
            ]),
            Animated.delay(120),
            Animated.parallel([
                Animated.timing(taglineOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
                Animated.timing(taglineTranslateY, { toValue: 0, duration: 260, useNativeDriver: true }),
            ]),
            Animated.delay(700),
            Animated.timing(containerOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]);

        sequence.start(({ finished }) => {
            if (!finished || cancelled) return;
            navigateNext();
        });

        return () => {
            cancelled = true;
            sequence.stop();
            floatLoop.stop();
        };
    }, [
        bgFloat,
        containerOpacity,
        markOpacity,
        markScale,
        navigateNext,
        taglineOpacity,
        taglineTranslateY,
        wordmarkOpacity,
        wordmarkTranslateY,
    ]);

    const floatUp = bgFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
    const floatDown = bgFloat.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />
            <Pressable style={styles.pressable} onPress={navigateNext} accessibilityRole="button">
                <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
                    <LinearGradient
                        colors={["#FFF7EF", "#FFE8D6", "#FFF7EF"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />

                    <View pointerEvents="none" style={styles.bgLayer}>
                        <Animated.View
                            style={[
                                styles.bgFood,
                                {
                                    left: -Math.round(sizes.burgerSize * 0.22),
                                    bottom: -Math.round(sizes.burgerSize * 0.16),
                                    transform: [{ translateY: floatDown }, { rotate: "-12deg" }],
                                },
                            ]}
                        >
                            <Image
                                source={burger3d}
                                style={{ width: sizes.burgerSize, height: sizes.burgerSize, opacity: 0.14 }}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                            />
                        </Animated.View>

                        <Animated.View
                            style={[
                                styles.bgFood,
                                {
                                    right: -Math.round(sizes.pizzaSize * 0.18),
                                    top: -Math.round(sizes.pizzaSize * 0.22),
                                    transform: [{ translateY: floatUp }, { rotate: "10deg" }],
                                },
                            ]}
                        >
                            <Image
                                source={pizza3d}
                                style={{ width: sizes.pizzaSize, height: sizes.pizzaSize, opacity: 0.12 }}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                            />
                        </Animated.View>

                        <Animated.View
                            style={[
                                styles.bgFood,
                                {
                                    right: -Math.round(sizes.friesSize * 0.28),
                                    bottom: -Math.round(sizes.friesSize * 0.24),
                                    transform: [{ translateY: floatUp }, { rotate: "16deg" }],
                                },
                            ]}
                        >
                            <Image
                                source={fries3d}
                                style={{ width: sizes.friesSize, height: sizes.friesSize, opacity: 0.12 }}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                            />
                        </Animated.View>
                    </View>

                    <View style={styles.center}>
                        <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
                            <Image
                                source={brandMark}
                                style={{ width: sizes.markSize, aspectRatio: 1 }}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                            />
                        </Animated.View>

                        <Animated.View
                            style={{
                                marginTop: 18,
                                opacity: wordmarkOpacity,
                                transform: [{ translateY: wordmarkTranslateY }],
                            }}
                        >
                            <Image
                                source={brandWordmark}
                                style={{ width: sizes.wordmarkWidth, aspectRatio: 2.786 }}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                            />
                        </Animated.View>

                        <Animated.View
                            style={{
                                marginTop: 14,
                                opacity: taglineOpacity,
                                transform: [{ translateY: taglineTranslateY }],
                            }}
                        >
                            <View style={styles.taglinePill}>
                                <Text style={styles.tagline}>Sıcak sıcak geliyor.</Text>
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
    container: {
        flex: 1,
        backgroundColor: BACKGROUND_COLOR,
    },
    bgLayer: {
        ...StyleSheet.absoluteFillObject,
        overflow: "hidden",
    },
    bgFood: {
        position: "absolute",
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    taglinePill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.72)",
        borderWidth: 1,
        borderColor: "rgba(58,31,11,0.10)",
    },
    tagline: {
        fontSize: 13,
        color: "#5A2D14",
        letterSpacing: 0.2,
        textAlign: "center",
    },
});

