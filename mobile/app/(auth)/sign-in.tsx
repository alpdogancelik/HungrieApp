import { useRef, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import LanguageToggle from "@/components/LanguageToggle";
import { getAuthErrorMessage, getAuthScreenCopy, isTurkishLanguage } from "@/src/features/auth/authCopy";
import { isStrictValidEmail } from "@/src/features/auth/emailValidation";
import { getCurrentUser, signIn } from "@/src/data/authRepository";
import { getOwnedRestaurantId } from "@/src/data/restaurantRepository";
import useAuthStore from "@/store/auth.store";
import RobotDelivery from "@/assets/illustrations/Robot Delivery.svg";
import { addressStore } from "@/src/data/addressRepository";
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
        lineHeight: 42,
        fontFamily: readableTurkishFont,
        fontWeight: "500",
    },
    cardBody: {
        color: "#475569",
        fontSize: 15,
        lineHeight: 22,
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
    rowBetween: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        marginTop: -4,
    },
    helperText: {
        color: "#FF8A00",
        fontSize: 14,
        lineHeight: 20,
        fontFamily: "ChairoSans",
    },
    helperLink: {
        textDecorationLine: "underline",
        textDecorationColor: "#FF8A00",
    },
    submitButton: {
        minHeight: 64,
        borderRadius: 999,
        marginTop: 4,
        backgroundColor: "#FF6A00",
    },
    submitText: {
        fontSize: 18,
        fontFamily: readableTurkishFont,
        fontWeight: "500",
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

const replaceAfterAuth = (pathname: "/home" | "/restaurantpanel") => {
    try {
        if (router.canDismiss()) {
            router.dismissAll();
        }
    } catch {
        // Ignore navigator-specific dismiss support and still replace the route.
    }
    router.replace(pathname);
};

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
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [form, setForm] = useState({ email: "", password: "" });
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);

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
            const user = await getCurrentUser();

            if (user) {
                const mappedUser = {
                    id: user.accountId,
                    $id: user.accountId,
                    accountId: user.accountId,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    whatsappNumber: user.whatsappNumber,
                };
                setUser(mappedUser);
                setIsAuthenticated(true);
                await addressStore.list().catch(() => null);

                const ownedRestaurantId = await getOwnedRestaurantId();
                if (ownedRestaurantId) {
                    replaceAfterAuth("/restaurantpanel");
                    return;
                }
            }

            replaceAfterAuth("/home");
        } catch (error: any) {
            setFeedback({
                title: copy.emptyErrorTitle,
                message: error?.message || copy.fallbackError,
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
                            <Pressable style={styles.closeButton} onPress={() => router.replace("/home")} hitSlop={8}>
                                <Ionicons name="close" size={24} color="#FFFFFF" />
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
                            <Text style={[styles.cardTitle, { color: theme.colors.ink }, isWide ? { fontSize: 46, lineHeight: 58 } : null]}>{copy.submit}</Text>
                        </View>

                        {feedback ? (
                            <AuthFeedbackCard
                                tone="error"
                                title={feedback.title}
                                message={feedback.message}
                                Illustration={RobotDelivery}
                            />
                        ) : null}

                        <CustomInput
                            ref={emailRef}
                            placeholder="ornek@mail.com"
                            value={form.email}
                            onChangeText={(text) => setField("email", text)}
                            label={copy.emailLabel}
                            inputKey="email"
                            autoComplete="email"
                            keyboardType="email-address"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            leftIcon={<Ionicons name="mail-outline" size={22} color="#FF6A00" />}
                            labelStyle={styles.fieldLabel}
                            inputStyle={styles.fieldInput}
                        />

                        <CustomInput
                            ref={passwordRef}
                            placeholder={isTurkish ? "Şifreni gir" : "Enter your password"}
                            value={form.password}
                            onChangeText={(text) => setField("password", text)}
                            label={copy.passwordLabel}
                            inputKey="password"
                            autoComplete="current-password"
                            secureTextEntry
                            returnKeyType="done"
                            onSubmitEditing={submit}
                            leftIcon={<Ionicons name="lock-closed-outline" size={22} color="#FF6A00" />}
                            labelStyle={styles.fieldLabel}
                            inputStyle={styles.fieldInput}
                        />

                        <View style={styles.rowBetween}>
                            <Pressable onPress={handleForgotPassword} disabled={isSubmitting} hitSlop={8}>
                                <Text style={[styles.helperText, styles.helperLink, { opacity: isSubmitting ? 0.6 : 1 }]}>
                                    {copy.forgotPassword}
                                </Text>
                            </Pressable>
                        </View>

                        <CustomButton
                            title={copy.submit}
                            isLoading={isSubmitting}
                            disabled={isSubmitting}
                            onPress={submit}
                            style={styles.submitButton}
                            textStyle={styles.submitText}
                        />

                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>{copy.noAccount}</Text>
                            <Pressable onPress={() => router.push("/sign-up")} hitSlop={6}>
                                <Text style={styles.footerLink}>{copy.signUpLink}</Text>
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
