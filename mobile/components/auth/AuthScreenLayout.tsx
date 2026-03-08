import { Children, type ComponentType, type ReactNode, useMemo } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type ImageSourcePropType,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { SvgProps } from "react-native-svg";
import Animated, { Easing, FadeInDown, FadeInUp } from "react-native-reanimated";

import LanguageToggle from "@/components/LanguageToggle";
import { useReducedMotion } from "@/src/lib/useReducedMotion";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";

type AuthScreenLayoutProps = {
    heroTitle: string;
    heroBody: string;
    Illustration?: ComponentType<SvgProps>;
    heroImageSource?: ImageSourcePropType;
    gradientColors: readonly [string, string, ...string[]];
    showWordmark?: boolean;
    enableEntranceAnimation?: boolean;
    children: ReactNode;
};

const brandWordmark = require("../../assets/images/hungrie-wordmark.png");
const defaultHeroPackshot = require("../../assets/images/vecteezy_fast-food-meal-with_25065315.png");

const BACKGROUND_COLOR = "#FFF7EF";
const CONTENT_MAX_WIDTH = 520;

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: BACKGROUND_COLOR },
    scroll: { flex: 1 },
    content: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, paddingHorizontal: 18 },
    heroCard: {
        borderRadius: 40,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        shadowColor: "#000",
        shadowOpacity: Platform.OS === "ios" ? 0.14 : 0.24,
        shadowOffset: { width: 0, height: 16 },
        shadowRadius: 26,
        elevation: 12,
    },
    heroInner: {
        paddingHorizontal: 18,
        paddingBottom: 22,
        gap: 18,
    },
    heroTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    heroTitle: {
        color: "#FFFFFF",
        fontSize: 30,
        lineHeight: 36,
        fontFamily: "ChairoSans",
    },
    heroBody: {
        color: "rgba(255,255,255,0.88)",
        fontSize: 14,
        lineHeight: 20,
        fontFamily: "ChairoSans",
    },
    heroMediaCard: {
        borderRadius: 32,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.26)",
        backgroundColor: "rgba(15,23,42,0.12)",
    },
    authCardWrap: {
        paddingHorizontal: 18,
        paddingBottom: 24,
    },
    authCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 28,
        padding: 22,
        gap: 20,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.06)",
        shadowColor: "#000",
        shadowOpacity: Platform.OS === "ios" ? 0.08 : 0.12,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 22,
        elevation: 10,
    },
});

const AuthScreenLayout = ({
    heroTitle,
    heroBody,
    Illustration,
    heroImageSource,
    gradientColors,
    showWordmark = true,
    enableEntranceAnimation = true,
    children,
}: AuthScreenLayoutProps) => {
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const { width: windowWidth, height: windowHeight } = useStableWindowDimensions();
    const isWeb = Platform.OS === "web";
    const contentWidth = isWeb ? Math.min(Math.max(windowWidth, 320), CONTENT_MAX_WIDTH) : windowWidth;
    const isCompactHeight = windowHeight < 760;
    const heroDirection = contentWidth < 380 ? "column" : "row";
    const heroMediaSize = Math.min(200, Math.max(150, Math.round(contentWidth * 0.38)));
    const wordmarkWidth = Math.round(Math.min(260, Math.max(176, contentWidth * 0.52)));
    const safeTop = Math.max(insets.top, 16);
    const heroPaddingTop = safeTop + 18;
    const heroPaddingBottom = isCompactHeight ? 112 : 132;
    const cardOverlap = isCompactHeight ? 72 : 84;
    const shouldAnimate = enableEntranceAnimation && !reduceMotion;
    const resolvedHeroImage = heroImageSource ?? defaultHeroPackshot;

    const stagedChildren = useMemo(() => {
        if (!shouldAnimate) return children;
        const items = Children.toArray(children);
        return items.map((child, index) => (
            <Animated.View
                key={(child as any)?.key ?? `auth-child-${index}`}
                entering={FadeInDown.delay(180 + index * 70).duration(420).easing(Easing.out(Easing.cubic))}
            >
                {child}
            </Animated.View>
        ));
    }, [children, shouldAnimate]);

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: 24 + insets.bottom,
                        alignItems: isWeb ? "center" : "stretch",
                    }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.content, isWeb ? { width: contentWidth } : null]}>
                        <Animated.View
                            entering={
                                shouldAnimate
                                    ? FadeInDown.duration(420).easing(Easing.out(Easing.cubic))
                                    : undefined
                            }
                            style={styles.heroCard}
                        >
                            <LinearGradient
                                colors={gradientColors}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0.7 }}
                                style={{
                                    paddingHorizontal: 18,
                                    paddingTop: heroPaddingTop,
                                    paddingBottom: heroPaddingBottom,
                                }}
                            >
                                <View style={styles.heroTopRow}>
                                    {showWordmark ? (
                                        <Image
                                            source={brandWordmark}
                                            style={{ width: wordmarkWidth, aspectRatio: 2.786 }}
                                            contentFit="contain"
                                            cachePolicy="memory-disk"
                                        />
                                    ) : (
                                        <Text style={{ color: "rgba(255,255,255,0.82)", letterSpacing: 8, textTransform: "uppercase" }}>
                                            Hungrie
                                        </Text>
                                    )}
                                    <LanguageToggle appearance="inverse" showLabel={false} />
                                </View>

                                <View style={{ flexDirection: heroDirection as "row" | "column", alignItems: "center", gap: 16 }}>
                                    <View
                                        style={{
                                            flex: heroDirection === "row" ? 1 : 0,
                                            gap: 12,
                                            alignItems: heroDirection === "column" ? "center" : "flex-start",
                                        }}
                                    >
                                        <Text style={[styles.heroTitle, heroDirection === "column" ? { textAlign: "center" } : null]}>
                                            {heroTitle}
                                        </Text>
                                        <Text style={[styles.heroBody, heroDirection === "column" ? { textAlign: "center" } : null]}>
                                            {heroBody}
                                        </Text>
                                    </View>

                                    <View
                                        style={[
                                            styles.heroMediaCard,
                                            {
                                                width: heroMediaSize,
                                                height: heroMediaSize,
                                                marginTop: heroDirection === "column" ? 8 : 0,
                                            },
                                        ]}
                                    >
                                        {heroImageSource || !Illustration ? (
                                            <Image
                                                source={resolvedHeroImage}
                                                style={StyleSheet.absoluteFillObject}
                                                contentFit="cover"
                                                cachePolicy="memory-disk"
                                            />
                                        ) : (
                                            <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
                                                <Illustration width={heroMediaSize} height={heroMediaSize} />
                                            </View>
                                        )}
                                        <LinearGradient
                                            colors={["rgba(15,23,42,0.00)", "rgba(15,23,42,0.35)"]}
                                            start={{ x: 0.5, y: 0 }}
                                            end={{ x: 0.5, y: 1 }}
                                            style={StyleSheet.absoluteFillObject}
                                        />
                                    </View>
                                </View>
                            </LinearGradient>
                        </Animated.View>

                        <Animated.View
                            entering={
                                shouldAnimate
                                    ? FadeInUp.delay(120).duration(420).easing(Easing.out(Easing.cubic))
                                    : undefined
                            }
                            style={[styles.authCardWrap, { marginTop: -cardOverlap }]}
                        >
                            <View style={styles.authCard}>{stagedChildren}</View>
                        </Animated.View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default AuthScreenLayout;
