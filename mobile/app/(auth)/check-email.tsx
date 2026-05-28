import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import CustomButton from "@/components/CustomButton";
import LanguageToggle from "@/components/LanguageToggle";
import { getAuthScreenCopy, isTurkishLanguage } from "@/src/features/auth/authCopy";
import DeliveryBoy from "@/assets/illustrations/Delivery Boy.svg";
import { makeShadow } from "@/src/lib/shadowStyle";

const heroPackshot = require("../../assets/Categories/Sign-In Burger Photo1.png");

const styles = StyleSheet.create({
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
        backgroundColor: "#F1895E",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.32)",
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
        lineHeight: 37,
        fontFamily: "ChairoSans",
    },
    heroAccent: {
        color: "#FF5A14",
    },
    heroBody: {
        color: "#6B7280",
        fontSize: 15,
        lineHeight: 23,
        fontFamily: "ChairoSans",
        marginTop: 14,
        maxWidth: 255,
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
        borderRadius: 28,
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
        paddingTop: 20,
        paddingBottom: 20,
        gap: 12,
        position: "relative",
        zIndex: 2,
    },
    authCardHeader: {
        gap: 6,
    },
    cardTitle: {
        color: "#0F172A",
        fontSize: 31,
        lineHeight: 38,
        fontFamily: "ChairoSans",
    },
    cardBody: {
        color: "#475569",
        fontSize: 15,
        lineHeight: 22,
        fontFamily: "ChairoSans",
    },
    emailBadge: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#D9E1EC",
        backgroundColor: "#F8FAFC",
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    emailLabel: {
        color: "#64748B",
        fontSize: 13,
        lineHeight: 18,
        fontFamily: "ChairoSans",
        marginBottom: 4,
    },
    emailValue: {
        color: "#0F172A",
        fontSize: 16,
        lineHeight: 22,
        fontFamily: "ChairoSans",
    },
    submitButton: {
        minHeight: 56,
        borderRadius: 999,
        marginTop: 0,
        backgroundColor: "#FF6A00",
    },
    submitText: {
        fontSize: 18,
    },
    footerRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        columnGap: 8,
        marginTop: 0,
        flexWrap: "wrap",
    },
    footerText: {
        color: "#6B7280",
        fontSize: 17,
        fontFamily: "ChairoSans",
        textAlign: "center",
    },
    footerLink: {
        color: "#FF6A00",
        fontSize: 17,
        fontFamily: "ChairoSans",
    },
});

const CheckEmailScreen = () => {
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const copy = getAuthScreenCopy(i18n.language).checkEmail;
    const isTurkish = isTurkishLanguage(i18n.language);
    const params = useLocalSearchParams<{ email?: string | string[] }>();
    const { width } = useWindowDimensions();
    const isWide = width >= 700;
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
    const cardOverlap = isWide ? -24 : -50;

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
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
                            <Pressable style={styles.closeButton} onPress={() => router.replace("/home")} hitSlop={8}>
                                <Ionicons name="close" size={24} color="#FFFFFF" />
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.heroSection}>
                        <View style={styles.heroGrid}>
                            <View style={styles.heroTextCol}>
                                <Text style={[styles.heroHeading, isWide ? { fontSize: 56, lineHeight: 66 } : null]}>
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
                                <Text style={[styles.heroBody, isWide ? { fontSize: 18, lineHeight: 30, maxWidth: 420 } : null]}>
                                    {copy.heroBody}
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
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                </View>
                            </View>
                        </View>
                    </View>

                    <View
                        style={[
                            styles.authCard,
                            { marginTop: cardOverlap },
                            makeShadow({ color: "#000000", offsetY: 20, blurRadius: 38, opacity: 0.1, elevation: 12 }),
                        ]}
                    >
                        <View style={styles.authCardHeader}>
                            <Text style={[styles.cardTitle, isWide ? { fontSize: 46, lineHeight: 54 } : null]}>{copy.title}</Text>
                            <Text style={styles.cardBody}>{copy.subtitle}</Text>
                        </View>

                        <AuthFeedbackCard
                            tone="success"
                            title={copy.cardTitle}
                            message={copy.cardBody}
                            Illustration={DeliveryBoy}
                        />

                        {email ? (
                            <View style={styles.emailBadge}>
                                <Text style={styles.emailLabel}>{copy.sentAddress}</Text>
                                <Text style={styles.emailValue}>{email}</Text>
                            </View>
                        ) : null}

                        <CustomButton
                            title={copy.backToSignIn}
                            onPress={() => router.replace("/sign-in")}
                            style={styles.submitButton}
                            textStyle={styles.submitText}
                        />

                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>{copy.editPrompt}</Text>
                            <Pressable onPress={() => router.replace("/sign-up")} hitSlop={6}>
                                <Text style={styles.footerLink}>{copy.editLink}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default CheckEmailScreen;
