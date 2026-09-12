import { useRef, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
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
import CustomInput from "@/components/CustomInput";
import LanguageToggle from "@/components/LanguageToggle";
import { createUser } from "@/src/data/authRepository";
import { getAuthErrorMessage, getAuthScreenCopy, isTurkishLanguage } from "@/src/features/auth/authCopy";
import { isStrictValidEmail } from "@/src/features/auth/emailValidation";
import { PASSWORD_MIN_LENGTH, getPasswordRequirementState, isStrongPassword } from "@/src/features/auth/passwordValidation";
import DeliveryGuy from "@/assets/illustrations/Delivery Guy.svg";
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

const getPasswordChecks = (password: string, isTurkish: boolean) => {
    const state = getPasswordRequirementState(password);
    return [
        {
            key: "minLength",
            met: state.minLength,
            label: isTurkish ? `En az ${PASSWORD_MIN_LENGTH} karakter` : `At least ${PASSWORD_MIN_LENGTH} characters`,
        },
        {
            key: "uppercase",
            met: state.uppercase,
            label: isTurkish ? "Bir büyük harf" : "One uppercase letter",
        },
        {
            key: "lowercase",
            met: state.lowercase,
            label: isTurkish ? "Bir küçük harf" : "One lowercase letter",
        },
        {
            key: "number",
            met: state.number,
            label: isTurkish ? "Bir sayı" : "One number",
        },
    ];
};

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
        color: "#111318",
        fontSize: 28,
        lineHeight: 34,
        letterSpacing: -0.3,
    },
    fieldLabel: {
        color: "#667085",
        fontSize: 14,
        lineHeight: 18,
        marginBottom: 6,
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
    feedbackWrap: {
        marginBottom: 0,
    },
    passwordChecklist: {
        gap: 6,
        marginTop: -8,
        paddingHorizontal: 2,
    },
    passwordCheckRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
    },
    passwordHelperText: {
        color: "#667085",
        fontSize: 12,
        lineHeight: 16,
    },
    passwordHelperTextMet: {
        color: "#FF5A00",
    },
    submitButton: {
        width: "100%",
        height: 52,
        minHeight: 52,
        borderRadius: 26,
        marginTop: 0,
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
        marginTop: 0,
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
});

const SignUp = () => {
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const copy = getAuthScreenCopy(i18n.language).signUp;
    const isTurkish = isTurkishLanguage(i18n.language);
    const { width } = useWindowDimensions();
    const isWide = width >= 700;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitPressed, setIsSubmitPressed] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [form, setForm] = useState({ name: "", email: "", password: "", whatsappNumber: "" });
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [focusedField, setFocusedField] = useState<"name" | "whatsappNumber" | "email" | "password" | null>(null);
    const [interLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
    });
    const nameRef = useRef<TextInput>(null);
    const whatsappRef = useRef<TextInput>(null);
    const emailRef = useRef<TextInput>(null);
    const passwordRef = useRef<TextInput>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    const interRegular = interLoaded ? "Inter_400Regular" : readableTurkishFont;
    const interMedium = interLoaded ? "Inter_500Medium" : readableTurkishFont;
    const interSemiBold = interLoaded ? "Inter_600SemiBold" : readableTurkishFont;
    const interBold = interLoaded ? "Inter_700Bold" : readableTurkishFont;

    const heroVisualWidth = isWide ? 360 : Math.min(266, Math.max(210, width * 0.43));
    const heroVisualHeight = isWide ? 320 : Math.min(224, Math.max(230, width * 0.36));
    const heroGlowWidth = isWide ? 312 : Math.min(194, Math.max(148, width * 0.26));
    const heroGlowHeight = isWide ? 250 : Math.min(168, Math.max(124, width * 0.22));
    const maxShellWidth = isWide ? 860 : 520;
    const cardOverlap = isWide ? -24 : -70;

    const revealPasswordRequirements = () => {
        setPasswordFocused(true);
        setFocusedField("password");
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), Platform.OS === "ios" ? 320 : 180);
    };

    const setField = (field: "name" | "email" | "password" | "whatsappNumber", value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (feedback) setFeedback(null);
    };

    const goToCheckEmail = (email: string) => {
        router.replace({
            pathname: "/check-email",
            params: { email },
        });
    };

    const submit = async () => {
        const name = form.name.trim();
        const email = form.email.trim();
        const password = form.password;
        const whatsappNumber = form.whatsappNumber.trim();

        if (!name || !email || !password) {
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

        if (!isStrongPassword(password)) {
            setFeedback({
                title: copy.emptyErrorTitle,
                message: getAuthErrorMessage(i18n.language, "weakPassword") || copy.fallbackError,
            });
            return;
        }

        setIsSubmitting(true);
        setFeedback(null);

        try {
            await createUser({ email, password, name, whatsappNumber: whatsappNumber || undefined });
            goToCheckEmail(email);
        } catch (error: any) {
            setFeedback({
                title: copy.emptyErrorTitle,
                message: String(error?.message || "") || copy.fallbackError,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView
                ref={scrollViewRef}
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
                                            Hungrie&apos;ye{"\n"}hızlıca{"\n"}
                                            <Text style={styles.heroAccent}>katıl!</Text>
                                        </>
                                    ) : (
                                        <>
                                            Join{"\n"}Hungrie{"\n"}
                                            <Text style={styles.heroAccent}>fast.</Text>
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
                            <Text style={[styles.cardTitle, { color: theme.colors.ink, fontFamily: interBold }, isWide ? { fontSize: 46, lineHeight: 54 } : null]}>{copy.submit}</Text>
                        </View>

                        {feedback ? (
                            <View style={styles.feedbackWrap}>
                                <AuthFeedbackCard
                                    tone="error"
                                    title={feedback.title}
                                    message={feedback.message}
                                    Illustration={DeliveryGuy}
                                />
                            </View>
                        ) : null}

                        <CustomInput
                            ref={nameRef}
                            placeholder={copy.namePlaceholder}
                            value={form.name}
                            onChangeText={(text) => setField("name", text)}
                            label={copy.nameLabel}
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => whatsappRef.current?.focus()}
                            onFocus={() => setFocusedField("name")}
                            onBlur={() => setFocusedField((current) => current === "name" ? null : current)}
                            placeholderTextColor={theme.colors.muted}
                            leftIcon={<Ionicons name="person-outline" size={20} color="#FF5A00" />}
                            labelStyle={[styles.fieldLabel, { fontFamily: interMedium }]}
                            inputStyle={[
                                styles.fieldInput,
                                focusedField === "name" && styles.fieldInputFocused,
                                {
                                    color: theme.colors.ink,
                                    backgroundColor: theme.colors.input,
                                    borderColor: focusedField === "name" ? "#FF5A00" : theme.colors.border,
                                    fontFamily: form.name ? interMedium : interRegular,
                                },
                            ]}
                        />
                        <CustomInput
                            ref={whatsappRef}
                            placeholder="+90 5xx xxx xx xx"
                            value={form.whatsappNumber}
                            onChangeText={(text) => setField("whatsappNumber", text)}
                            label={copy.whatsappLabel}
                            keyboardType="phone-pad"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => emailRef.current?.focus()}
                            onFocus={() => setFocusedField("whatsappNumber")}
                            onBlur={() => setFocusedField((current) => current === "whatsappNumber" ? null : current)}
                            placeholderTextColor={theme.colors.muted}
                            leftIcon={<Ionicons name="logo-whatsapp" size={20} color="#FF5A00" />}
                            labelStyle={[styles.fieldLabel, { fontFamily: interMedium }]}
                            inputStyle={[
                                styles.fieldInput,
                                focusedField === "whatsappNumber" && styles.fieldInputFocused,
                                {
                                    color: theme.colors.ink,
                                    backgroundColor: theme.colors.input,
                                    borderColor: focusedField === "whatsappNumber" ? "#FF5A00" : theme.colors.border,
                                    fontFamily: form.whatsappNumber ? interMedium : interRegular,
                                },
                            ]}
                        />
                        <CustomInput
                            ref={emailRef}
                            placeholder="e232231@metu.edu.tr"
                            value={form.email}
                            onChangeText={(text) => setField("email", text)}
                            label={copy.emailLabel}
                            keyboardType="email-address"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            onFocus={() => setFocusedField("email")}
                            onBlur={() => setFocusedField((current) => current === "email" ? null : current)}
                            placeholderTextColor={theme.colors.muted}
                            leftIcon={<Ionicons name="mail-outline" size={20} color="#FF5A00" />}
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
                            placeholder={copy.passwordPlaceholder}
                            value={form.password}
                            onChangeText={(text) => setField("password", text)}
                            label={copy.passwordLabel}
                            secureTextEntry
                            returnKeyType="done"
                            onSubmitEditing={submit}
                            onFocus={revealPasswordRequirements}
                            onBlur={() => {
                                setFocusedField((current) => current === "password" ? null : current);
                                setTimeout(() => setPasswordFocused(false), 120);
                            }}
                            placeholderTextColor={theme.colors.muted}
                            secureToggleColor={theme.colors.textSecondary}
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
                        {passwordFocused ? (
                            <View style={styles.passwordChecklist}>
                                {getPasswordChecks(form.password, isTurkish).map((check) => (
                                    <View key={check.key} style={styles.passwordCheckRow}>
                                        <Ionicons
                                            name={check.met ? "checkmark-circle" : "ellipse-outline"}
                                            size={15}
                                            color={check.met ? "#FF6A00" : "#9CA3AF"}
                                        />
                                        <Text style={[styles.passwordHelperText, { fontFamily: interMedium }, check.met ? styles.passwordHelperTextMet : null]}>
                                            {check.label}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}

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
                            <Text style={[styles.footerText, { fontFamily: interRegular }]}>{copy.alreadyAccount}</Text>
                            <Pressable onPress={() => router.push("/sign-in")} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                                <Text style={[styles.footerLink, { fontFamily: interSemiBold }]}>{copy.signInLink}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default SignUp;
