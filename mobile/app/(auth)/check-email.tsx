import { useMemo } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    useFonts,
} from "@expo-google-fonts/inter";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import CustomButton from "@/components/CustomButton";
import LanguageToggle from "@/components/LanguageToggle";
import { getAuthScreenCopy, isTurkishLanguage } from "@/src/features/auth/authCopy";
import DeliveryBoy from "@/assets/illustrations/Delivery Boy.svg";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTheme } from "@/src/theme/themeContext";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";

const heroPackshot = require("../../assets/Categories/Sign-In Burger Photo1.png");
const readableHeroFont = Platform.select({ ios: "System", android: "sans-serif", default: "system-ui" });

const styles = createAdaptiveStyleSheet({
    safeArea: { flex: 1, backgroundColor: "#FFF8F2" },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 28,
    },
    shell: {
        width: "100%",
        alignSelf: "center",
    },
    topRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
        columnGap: 16,
    },
    topRightActions: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 10,
        flexShrink: 0,
    },
    brandWrap: {
        flexDirection: "row",
        alignItems: "baseline",
        flexShrink: 1,
    },
    brandHungrie: {
        color: "#FF5A14",
        fontSize: 26,
        lineHeight: 30,
        fontFamily: "ChairoSans",
    },
    brandDotApp: {
        color: "#111827",
        fontSize: 26,
        lineHeight: 30,
        fontFamily: "ChairoSans",
    },
    closeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E4E7EC",
        ...makeShadow({ color: "#101828", offsetY: 1, blurRadius: 3, opacity: 0.04, elevation: 1 }),
    },
    heroSection: {
        position: "relative",
        marginBottom: 24,
        overflow: "visible",
        zIndex: 0,
    },
    heroGrid: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    heroTextCol: {
        flex: 1,
        paddingRight: 18,
        zIndex: 2,
    },
    heroHeading: {
        color: "#111827",
        fontSize: 30,
        lineHeight: 40,
        fontFamily: readableHeroFont,
        fontWeight: "500",
    },
    heroAccent: {
        color: "#FF5A14",
    },
    heroVisualWrap: {
        justifyContent: "flex-start",
        alignItems: "flex-end",
        position: "relative",
        overflow: "visible",
        zIndex: 0,
    },
    heroVisualCard: {
        overflow: "hidden",
        borderRadius: 18,
        backgroundColor: "#FFF8F2",
    },
    heroVisualGlow: {
        position: "absolute",
        right: 6,
        top: 34,
        backgroundColor: "#FFF0E4",
        borderRadius: 999,
    },
    heroImageShadow: {
        position: "absolute",
        left: 54,
        right: 18,
        bottom: 10,
        height: 18,
        borderRadius: 999,
        backgroundColor: "rgba(122, 61, 19, 0.08)",
    },
    heroImage: {
        width: "100%",
        height: "100%",
    },
    authCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 30,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.06)",
        paddingHorizontal: 22,
        paddingTop: 24,
        paddingBottom: 26,
        gap: 0,
        position: "relative",
        zIndex: 2,
    },
    authCardHeader: {
        gap: 6,
        marginBottom: 20,
    },
    cardTitle: {
        color: "#111318",
        fontSize: 28,
        lineHeight: 34,
        letterSpacing: -0.3,
    },
    cardBody: {
        color: "#667085",
        fontSize: 15,
        lineHeight: 22,
    },
    feedbackWrap: {
        marginBottom: 12,
    },
    emailBadge: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#D9E1EC",
        backgroundColor: "#F8FAFC",
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
    },
    emailLabel: {
        color: "#64748B",
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 4,
    },
    emailValue: {
        color: "#111318",
        fontSize: 16,
        lineHeight: 20,
    },
    submitButton: {
        minHeight: 52,
        height: 52,
        borderRadius: 26,
        marginTop: 0,
        backgroundColor: "#FF5A00",
    },
    submitText: {
        fontSize: 16,
        lineHeight: 20,
    },
    footerRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        columnGap: 8,
        marginTop: 22,
        flexWrap: "wrap",
    },
    footerText: {
        color: "#667085",
        fontSize: 15,
        lineHeight: 20,
        textAlign: "center",
    },
    footerLink: {
        color: "#FF5A00",
        fontSize: 15,
        lineHeight: 20,
    },
});

const CheckEmailScreen = () => {
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const copy = getAuthScreenCopy(i18n.language).checkEmail;
    const isTurkish = isTurkishLanguage(i18n.language);
    const params = useLocalSearchParams<{ email?: string | string[] }>();
    const { width } = useWindowDimensions();
    const isWide = width >= 700;
    const [interLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
    });
    const interRegular = interLoaded ? "Inter_400Regular" : readableHeroFont;
    const interMedium = interLoaded ? "Inter_500Medium" : readableHeroFont;
    const interSemiBold = interLoaded ? "Inter_600SemiBold" : readableHeroFont;
    const interBold = interLoaded ? "Inter_700Bold" : readableHeroFont;
    const email = useMemo(() => {
        if (typeof params.email === "string") return params.email;
        if (Array.isArray(params.email)) return params.email[0] || "";
        return "";
    }, [params.email]);

    const heroVisualWidth = isWide ? 360 : Math.min(266, Math.max(210, width * 0.43));
    const heroVisualHeight = isWide ? 320 : Math.min(224, Math.max(230, width * 0.36));
    const heroGlowWidth = isWide ? 312 : Math.min(194, Math.max(148, width * 0.26));
    const heroGlowHeight = isWide ? 250 : Math.min(168, Math.max(124, width * 0.22));
    const maxShellWidth = isWide ? 860 : 520;
    const cardOverlap = isWide ? -24 : -88;

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={["left", "right", "bottom"]}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom + 24, 28) },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.shell, { maxWidth: maxShellWidth }]}>
                    <View style={styles.topRow}>
                        <View style={styles.brandWrap}>
                            <Text style={styles.brandHungrie}>hungrie</Text>
                            <Text style={styles.brandDotApp}>.app</Text>
                        </View>
                        <View style={styles.topRightActions}>
                            <LanguageToggle appearance="default" showLabel={false} />
                            <Pressable
                                style={({ pressed }) => [
                                    styles.closeButton,
                                    { backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface },
                                ]}
                                onPress={() => router.replace("/home")}
                                hitSlop={8}
                            >
                                <Ionicons name="close" size={18} color={theme.colors.ink} />
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.heroSection}>
                        <View style={styles.heroGrid}>
                            <View style={styles.heroTextCol}>
                                <Text style={[styles.heroHeading, { color: theme.colors.ink }, isWide ? { fontSize: 56, lineHeight: 66 } : null]}>
                                    {isTurkish ? (
                                        <>
                                            Mailini kontrol et{"\n"}ve hızlıca{"\n"}
                                            <Text style={styles.heroAccent}>dön.</Text>
                                        </>
                                    ) : (
                                        <>
                                            Check your email{"\n"}and come back{"\n"}
                                            <Text style={styles.heroAccent}>fast.</Text>
                                        </>
                                    )}
                                </Text>
                            </View>

                            <View
                                style={[
                                    styles.heroVisualWrap,
                                    {
                                        width: heroVisualWidth,
                                        height: heroVisualHeight + (isWide ? 34 : 6),
                                        marginRight: isWide ? -18 : -18,
                                        marginTop: isWide ? -8 : 26,
                                    },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.heroVisualGlow,
                                        { width: heroGlowWidth, height: heroGlowHeight, opacity: 0.76 },
                                    ]}
                                />
                                <View style={styles.heroImageShadow} />
                                <View style={[styles.heroVisualCard, { width: heroVisualWidth, height: heroVisualHeight }]}>
                                    <Image
                                        source={heroPackshot}
                                        style={[
                                            styles.heroImage,
                                            {
                                                transform: [
                                                    { scale: isWide ? 1.18 : 1.2 },
                                                    { translateX: isWide ? 24 : 18 },
                                                    { translateY: isWide ? 2 : 2 },
                                                ],
                                            },
                                        ]}
                                        resizeMode="cover"
                                    />
                                </View>
                            </View>
                        </View>
                    </View>

                    <View
                        style={[
                            styles.authCard,
                            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                            { marginTop: cardOverlap },
                            makeShadow({ color: "#000000", offsetY: 20, blurRadius: 38, opacity: 0.1, elevation: 12 }),
                        ]}
                    >
                        <View style={styles.authCardHeader}>
                            <Text style={[styles.cardTitle, { color: theme.colors.ink, fontFamily: interBold }, isWide ? { fontSize: 46, lineHeight: 54 } : null]}>{copy.title}</Text>
                            <Text style={[styles.cardBody, { color: theme.colors.textSecondary, fontFamily: interRegular }]}>{copy.subtitle}</Text>
                        </View>

                        <View style={styles.feedbackWrap}>
                            <AuthFeedbackCard
                                tone="success"
                                title={copy.cardTitle}
                                message={copy.cardBody}
                                Illustration={DeliveryBoy}
                            />
                        </View>

                        {email ? (
                            <View style={[styles.emailBadge, { backgroundColor: theme.colors.input, borderColor: theme.colors.border }]}>
                                <Text style={[styles.emailLabel, { fontFamily: interMedium }]}>{copy.sentAddress}</Text>
                                <Text style={[styles.emailValue, { color: theme.colors.ink, fontFamily: interMedium }]}>{email}</Text>
                            </View>
                        ) : null}

                        <CustomButton
                            title={copy.backToSignIn}
                            onPress={() => router.replace("/sign-in")}
                            style={styles.submitButton}
                            textStyle={[styles.submitText, { fontFamily: interSemiBold }]}
                        />

                        <View style={styles.footerRow}>
                            <Text style={[styles.footerText, { fontFamily: interRegular }]}>{copy.editPrompt}</Text>
                            <Pressable onPress={() => router.replace("/sign-up")} hitSlop={6}>
                                <Text style={[styles.footerLink, { fontFamily: interSemiBold }]}>{copy.editLink}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default CheckEmailScreen;
