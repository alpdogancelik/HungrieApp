import { useRef, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    useFonts,
} from "@expo-google-fonts/inter";
import * as Sentry from "@sentry/react-native";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import CustomInput from "@/components/CustomInput";
import LanguageToggle from "@/components/LanguageToggle";
import { getAuthErrorMessage, getAuthScreenCopy, isTurkishLanguage } from "@/src/features/auth/authCopy";
import { isStrictValidEmail } from "@/src/features/auth/emailValidation";
import { getCurrentAuthIdentity, signIn } from "@/src/data/authRepository";
import useAuthStore from "@/store/auth.store";
import RobotDelivery from "@/assets/illustrations/Robot Delivery.svg";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTheme } from "@/src/theme/themeContext";

type FeedbackState = {
    title: string;
    message: string;
} | null;

const heroPackshot = require("../../assets/Categories/Sign-In Burger Photo1.png");
const readableTurkishFont = Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "system-ui",
});

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
        lineHeight: 40,
        fontFamily: readableTurkishFont,
        fontWeight: "500",
    },
    heroAccent: {
        color: "#FF5A14",
    },
    heroBody: {
        color: "#6B7280",
        fontSize: 15,
        lineHeight: 25,
        fontFamily: readableTurkishFont,
        fontWeight: "400",
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
        marginBottom: 23,
    },
    cardTitle: {
        color: "#111318",
        fontSize: 28,
        lineHeight: 34,
        letterSpacing: -0.3,
    },
    cardBody: {
        color: "#475569",
        fontSize: 15,
        lineHeight: 22,
        fontFamily: "ChairoSans",
    },
    fieldLabel: {
        color: "#667085",
        fontSize: 14,
        lineHeight: 18,
        marginBottom: 8,
        paddingLeft: 0,
    },
    fieldInput: {
        height: 54,
        minHeight: 54,
        borderRadius: 17,
        borderColor: "#DDE2EA",
        paddingHorizontal: 16,
        paddingVertical: 0,
        fontSize: 16,
        lineHeight: 20,
        color: "#111318",
        backgroundColor: "#FFFFFF",
    },
    fieldInputFocused: {
        borderColor: "#FF5A00",
    },
    emailField: {
        marginBottom: 20,
    },
    feedbackWrap: {
        marginBottom: 20,
    },
    rowBetween: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        marginTop: 12,
    },
    helperText: {
        color: "#FF5A00",
        fontSize: 14,
        lineHeight: 18,
    },
    helperLink: {
        textDecorationLine: "underline",
        textDecorationColor: "#FF5A00",
    },
    submitButton: {
        width: "100%",
        height: 52,
        minHeight: 52,
        borderRadius: 26,
        marginTop: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FF5A00",
    },
    submitText: {
        color: "#FFFFFF",
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
    },
    footerLink: {
        color: "#FF5A00",
        fontSize: 15,
        lineHeight: 20,
    },
    closeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E4E7EC",
        ...makeShadow({ color: "#101828", offsetY: 1, blurRadius: 3, opacity: 0.04, elevation: 1 }),
    },
    featureRow: {
        flexDirection: "row",
        marginTop: 18,
        borderTopWidth: 1,
        borderTopColor: "#F1E4D5",
        paddingTop: 16,
    },
    featureItem: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: 8,
        gap: 6,
    },
    featureDivider: {
        width: 1,
        backgroundColor: "#F1E4D5",
    },
    featureIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFF4EA",
    },
    featureTitle: {
        color: "#0F172A",
        fontSize: 12,
        lineHeight: 16,
        textAlign: "center",
        fontFamily: "ChairoSans",
    },
    featureBody: {
        color: "#6B7280",
        fontSize: 11,
        lineHeight: 15,
        textAlign: "center",
        fontFamily: "ChairoSans",
    },
});

const SignIn = () => {
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const copy = getAuthScreenCopy(i18n.language).signIn;
    const isTurkish = isTurkishLanguage(i18n.language);
    const { width } = useWindowDimensions();
    const isWide = width >= 700;
    const emailRef = useRef<TextInput>(null);
    const passwordRef = useRef<TextInput>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitPressed, setIsSubmitPressed] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [form, setForm] = useState({ email: "", password: "" });
    const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
    const [interLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
    });
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);

    const interRegular = interLoaded ? "Inter_400Regular" : readableTurkishFont;
    const interMedium = interLoaded ? "Inter_500Medium" : readableTurkishFont;
    const interSemiBold = interLoaded ? "Inter_600SemiBold" : readableTurkishFont;
    const interBold = interLoaded ? "Inter_700Bold" : readableTurkishFont;

    const heroVisualWidth = isWide ? 360 : Math.min(266, Math.max(210, width * 0.43));
    const heroVisualHeight = isWide ? 320 : Math.min(224, Math.max(230, width * 0.36));
    const heroGlowWidth = isWide ? 312 : Math.min(194, Math.max(148, width * 0.26));
    const heroGlowHeight = isWide ? 250 : Math.min(168, Math.max(124, width * 0.22));
    const maxShellWidth = isWide ? 860 : 520;
    const cardOverlap = isWide ? -24 : -50;

    const setField = (field: "email" | "password", value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (feedback) {
            setFeedback(null);
        }
    };

    const submit = async () => {
        const email = form.email.trim();
        const password = form.password;

        if (!email || !password) {
            setFeedback({
                title: copy.emptyErrorTitle,
                message: copy.emptyErrorBody,
            });
            return;
        }

        if (!isStrictValidEmail(email)) {
            setFeedback({
                title: copy.emptyErrorTitle,
                message: getAuthErrorMessage(i18n.language, "invalidEmail") || copy.fallbackError,
            });
            return;
        }

        setIsSubmitting(true);
        setFeedback(null);

        try {
            await signIn({ email, password });
            const identity = await getCurrentAuthIdentity();

            if (identity) {
                const mappedUser = {
                    id: identity.uid,
                    $id: identity.uid,
                    accountId: identity.uid,
                    name: identity.name,
                    email: identity.email,
                    avatar: identity.avatar,
                };
                setUser(mappedUser);
                setIsAuthenticated(true);
            } else {
                throw new Error(copy.fallbackError);
            }
        } catch (error: any) {
            const errorCode = String(error?.code || "");
            const hidesAccountKind = [
                "auth/invalid-credential",
                "auth/invalid-login-credentials",
                "auth/user-not-found",
                "auth/wrong-password",
                "auth/multi-factor-auth-required",
            ].includes(errorCode);
            setFeedback({
                title: copy.emptyErrorTitle,
                message: hidesAccountKind
                    ? getAuthErrorMessage(i18n.language, "invalidCredentials") || copy.fallbackError
                    : error?.message || copy.fallbackError,
            });
            Sentry.captureException(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = () => {
        router.push({
            pathname: "/forgot-password",
            params: form.email.trim() ? { email: form.email.trim() } : {},
        });
    };

    const features = isTurkish
        ? [
              { icon: "shield-checkmark-outline" as const, title: "Güvenli ödeme", body: "256-bit SSL koruması" },
              { icon: "bicycle-outline" as const, title: "Hızlı teslimat", body: "En kısa sürede kapında" },
              { icon: "ribbon-outline" as const, title: "En iyi restoranlar", body: "Favori lezzetler bir arada" },
          ]
        : [
              { icon: "shield-checkmark-outline" as const, title: "Secure checkout", body: "256-bit SSL protection" },
              { icon: "bicycle-outline" as const, title: "Fast delivery", body: "At your door in less time" },
              { icon: "ribbon-outline" as const, title: "Best restaurants", body: "Top picks in one place" },
          ];

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
                                <Text style={[styles.heroHeading, { color: theme.colors.ink }, isWide ? { fontSize: 56, lineHeight: 72 } : null]}>
                                    {isTurkish ? (
                                        <>
                                            Hungrie&apos;ye tekrar{"\n"}
                                            <Text style={styles.heroAccent}>hoş geldin!</Text>
                                        </>
                                    ) : (
                                        <>
                                            Welcome{"\n"}back to{" "}
                                            <Text style={styles.heroAccent}>Hungrie!</Text>
                                        </>
                                    )}
                                </Text>
                                <Text style={[styles.heroBody, { color: theme.colors.textSecondary }, isWide ? { fontSize: 18, lineHeight: 32, maxWidth: 420 } : null]}>
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
                                        {
                                            width: heroGlowWidth,
                                            height: heroGlowHeight,
                                            opacity: 0.76,
                                        },
                                    ]}
                                />
                                <View style={styles.heroImageShadow} />
                                <View
                                    style={[
                                        styles.heroVisualCard,
                                        {
                                            width: heroVisualWidth,
                                            height: heroVisualHeight,
                                        },
                                    ]}
                                >
                                    <Image
                                        source={heroPackshot}
                                        style={[
                                            styles.heroImage,
                                            {
                                                transform: [
                                                    { scale: isWide ? 1.18 : 1.2 },
                                                    { translateX: isWide ? 24 : 10 },
                                                    { translateY: isWide ? 2 : -5 },
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
                            <Text style={[styles.cardTitle, { color: theme.colors.ink, fontFamily: interBold }, isWide ? { fontSize: 46, lineHeight: 58 } : null]}>{copy.submit}</Text>
                        </View>

                        {feedback ? (
                            <View style={styles.feedbackWrap}>
                                <AuthFeedbackCard
                                    tone="error"
                                    title={feedback.title}
                                    message={feedback.message}
                                    Illustration={RobotDelivery}
                                />
                            </View>
                        ) : null}

                        <CustomInput
                            ref={emailRef}
                            placeholder="ornek@mail.com"
                            placeholderTextColor={theme.colors.muted}
                            value={form.email}
                            onChangeText={(text) => setField("email", text)}
                            label={copy.emailLabel}
                            inputKey="email"
                            autoComplete="email"
                            keyboardType="email-address"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            onFocus={() => setFocusedField("email")}
                            onBlur={() => setFocusedField((current) => current === "email" ? null : current)}
                            leftIcon={<Ionicons name="mail-outline" size={20} color="#FF5A00" />}
                            containerStyle={styles.emailField}
                            labelStyle={[styles.fieldLabel, { fontFamily: interMedium }]}
                            inputStyle={[
                                styles.fieldInput,
                                focusedField === "email" && styles.fieldInputFocused,
                                {
                                    color: theme.colors.ink,
                                    backgroundColor: theme.colors.input,
                                    borderColor: focusedField === "email" ? "#FF5A00" : theme.colors.border,
                                    fontFamily: form.email ? interMedium : interRegular,
                                },
                            ]}
                        />

                        <CustomInput
                            ref={passwordRef}
                            placeholder={isTurkish ? "Şifreni gir" : "Enter your password"}
                            placeholderTextColor={theme.colors.muted}
                            secureToggleColor={theme.colors.textSecondary}
                            value={form.password}
                            onChangeText={(text) => setField("password", text)}
                            label={copy.passwordLabel}
                            inputKey="password"
                            autoComplete="current-password"
                            secureTextEntry
                            returnKeyType="done"
                            onSubmitEditing={submit}
                            onFocus={() => setFocusedField("password")}
                            onBlur={() => setFocusedField((current) => current === "password" ? null : current)}
                            leftIcon={<Ionicons name="lock-closed-outline" size={20} color="#FF5A00" />}
                            labelStyle={[styles.fieldLabel, { fontFamily: interMedium }]}
                            inputStyle={[
                                styles.fieldInput,
                                focusedField === "password" && styles.fieldInputFocused,
                                {
                                    color: theme.colors.ink,
                                    backgroundColor: theme.colors.input,
                                    borderColor: focusedField === "password" ? "#FF5A00" : theme.colors.border,
                                    fontFamily: form.password ? interMedium : interRegular,
                                },
                            ]}
                        />

                        <View style={styles.rowBetween}>
                            <Pressable onPress={handleForgotPassword} disabled={isSubmitting} hitSlop={8}>
                                <Text style={[styles.helperText, styles.helperLink, { fontFamily: interSemiBold, opacity: isSubmitting ? 0.6 : 1 }]}>
                                    {copy.forgotPassword}
                                </Text>
                            </Pressable>
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={copy.submit}
                            disabled={isSubmitting}
                            onPress={submit}
                            onPressIn={() => setIsSubmitPressed(true)}
                            onPressOut={() => setIsSubmitPressed(false)}
                            style={[
                                styles.submitButton,
                                isSubmitPressed && !isSubmitting ? { backgroundColor: "#E94F00" } : null,
                                isSubmitting ? { backgroundColor: "#E4E7EC" } : null,
                            ]}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text style={[styles.submitText, { fontFamily: interSemiBold }]}>{copy.submit}</Text>
                            )}
                        </Pressable>

                        <View style={styles.footerRow}>
                            <Text style={[styles.footerText, { fontFamily: interRegular }]}>{copy.noAccount}</Text>
                            <Pressable onPress={() => router.push("/sign-up")} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                                <Text style={[styles.footerLink, { fontFamily: interSemiBold }]}>{copy.signUpLink}</Text>
                            </Pressable>
                        </View>
                    </View>

                    {isWide ? (
                        <View style={styles.featureRow}>
                            {features.map((feature, index) => (
                                <View key={feature.title} style={{ flex: 1, flexDirection: "row" }}>
                                    {index > 0 ? <View style={styles.featureDivider} /> : null}
                                    <View style={styles.featureItem}>
                                        <View style={styles.featureIconWrap}>
                                            <Ionicons name={feature.icon} size={18} color="#FF6A00" />
                                        </View>
                                        <Text style={styles.featureTitle}>{feature.title}</Text>
                                        <Text style={styles.featureBody}>{feature.body}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default SignIn;
