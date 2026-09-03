import { useMemo, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import LanguageToggle from "@/components/LanguageToggle";
import { sendPasswordReset } from "@/src/data/authRepository";
import { getAuthErrorMessage, getAuthScreenCopy, isTurkishLanguage } from "@/src/features/auth/authCopy";
import { isStrictValidEmail } from "@/src/features/auth/emailValidation";
import OnlineOrder from "@/assets/illustrations/Online Order.svg";
import RobotDelivery from "@/assets/illustrations/Robot Delivery.svg";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTheme } from "@/src/theme/themeContext";

type FeedbackState = {
    tone: "error" | "success";
    title: string;
    message: string;
} | null;

const heroPackshot = require("../../assets/Categories/Sign-In Burger Photo1.png");

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
        paddingTop: 24,
        paddingBottom: 26,
        gap: 18,
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
    fieldLabel: {
        color: "#6B7280",
        fontSize: 14,
        marginBottom: 10,
        paddingLeft: 0,
    },
    fieldInput: {
        minHeight: 58,
        borderRadius: 18,
        borderColor: "#D9E1EC",
        paddingHorizontal: 16,
        fontSize: 17,
        color: "#0F172A",
        backgroundColor: "#FFFFFF",
    },
    helperText: {
        color: "#6B7280",
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "ChairoSans",
        marginTop: -6,
    },
    submitButton: {
        minHeight: 64,
        borderRadius: 999,
        marginTop: 4,
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
        marginTop: 2,
        flexWrap: "wrap",
    },
    footerText: {
        color: "#6B7280",
        fontSize: 17,
        fontFamily: "ChairoSans",
    },
    footerLink: {
        color: "#FF6A00",
        fontSize: 17,
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
});

const ForgotPasswordScreen = () => {
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const copy = getAuthScreenCopy(i18n.language).forgotPassword;
    const isTurkish = isTurkishLanguage(i18n.language);
    const params = useLocalSearchParams<{ email?: string | string[] }>();
    const { width } = useWindowDimensions();
    const isWide = width >= 700;
    const initialEmail = useMemo(() => {
        if (typeof params.email === "string") return params.email;
        if (Array.isArray(params.email)) return params.email[0] || "";
        return "";
    }, [params.email]);

    const [email, setEmail] = useState(initialEmail);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);

    const heroVisualWidth = isWide ? 360 : Math.min(266, Math.max(210, width * 0.43));
    const heroVisualHeight = isWide ? 320 : Math.min(224, Math.max(230, width * 0.36));
    const heroGlowWidth = isWide ? 312 : Math.min(194, Math.max(148, width * 0.26));
    const heroGlowHeight = isWide ? 250 : Math.min(168, Math.max(124, width * 0.22));
    const maxShellWidth = isWide ? 860 : 520;
    const cardOverlap = isWide ? -24 : -50;

    const submit = async () => {
        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            setFeedback({
                tone: "error",
                title: copy.emptyTitle,
                message: copy.emptyBody,
            });
            return;
        }

        if (!isStrictValidEmail(trimmedEmail)) {
            setFeedback({
                tone: "error",
                title: copy.emptyTitle,
                message: getAuthErrorMessage(i18n.language, "invalidEmail") || copy.fallbackError,
            });
            return;
        }

        setIsSubmitting(true);
        setFeedback(null);

        try {
            await sendPasswordReset(trimmedEmail);
            setFeedback({
                tone: "success",
                title: copy.successTitle,
                message: copy.successBody,
            });
        } catch (error: any) {
            setFeedback({
                tone: "error",
                title: copy.emptyTitle,
                message: error?.message || copy.fallbackError,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom + 24, 28) },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
                                <Text style={[styles.heroHeading, { color: theme.colors.ink }, isWide ? { fontSize: 56, lineHeight: 66 } : null]}>
                                    {isTurkish ? (
                                        <>
                                            Şifreni{"\n"}yenile{"\n"}
                                            <Text style={styles.heroAccent}>ve devam et.</Text>
                                        </>
                                    ) : (
                                        <>
                                            Reset{"\n"}your password{"\n"}
                                            <Text style={styles.heroAccent}>and continue.</Text>
                                        </>
                                    )}
                                </Text>
                                <Text style={[styles.heroBody, { color: theme.colors.textSecondary }, isWide ? { fontSize: 18, lineHeight: 30, maxWidth: 420 } : null]}>
                                    {copy.subtitle}
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
                            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                            { marginTop: cardOverlap },
                            makeShadow({ color: "#000000", offsetY: 20, blurRadius: 38, opacity: 0.1, elevation: 12 }),
                        ]}
                    >
                        <View style={styles.authCardHeader}>
                            <Text style={[styles.cardTitle, { color: theme.colors.ink }, isWide ? { fontSize: 46, lineHeight: 54 } : null]}>{copy.title}</Text>
                        </View>

                        {feedback ? (
                            <AuthFeedbackCard
                                tone={feedback.tone}
                                title={feedback.title}
                                message={feedback.message}
                                Illustration={feedback.tone === "success" ? OnlineOrder : RobotDelivery}
                            />
                        ) : null}

                        <CustomInput
                            placeholder="ahmet@metumail.edu.tr"
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text);
                                if (feedback) setFeedback(null);
                            }}
                            label={copy.emailLabel}
                            keyboardType="email-address"
                            leftIcon={<Ionicons name="mail-outline" size={22} color="#FF6A00" />}
                            labelStyle={styles.fieldLabel}
                            inputStyle={styles.fieldInput}
                        />

                        <Text style={styles.helperText}>{copy.helper}</Text>

                        <CustomButton title={copy.submit} isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} style={styles.submitButton} textStyle={styles.submitText} />

                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>{copy.backPrompt}</Text>
                            <Pressable onPress={() => router.replace("/sign-in")} hitSlop={6}>
                                <Text style={styles.footerLink}>{copy.backLink}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ForgotPasswordScreen;
