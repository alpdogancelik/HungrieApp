import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, Alert, ScrollView, Pressable, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import * as Sentry from "@sentry/react-native";

import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { signIn, getCurrentUser, getOwnedRestaurantId, sendPasswordReset } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import MobileDelivery from "@/assets/illustrations/Mobile Delivery.svg";

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#0F172A" },
    scroll: { flex: 1 },
    authCardWrap: { flex: 1, paddingHorizontal: 24, paddingBottom: 48 },
    authCard: {
        rowGap: 24,
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        padding: 24,
    },
    brandKicker: { color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 8, fontFamily: "ChairoSans" },
    heroTitle: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontFamily: "ChairoSans" },
    heroBody: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20, fontFamily: "ChairoSans" },
    cardTitle: { color: "#0F172A", fontSize: 30, lineHeight: 36, fontFamily: "ChairoSans" },
    cardBody: { color: "#334155", fontSize: 14, lineHeight: 20, fontFamily: "ChairoSans" },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    helperText: { fontSize: 12, color: "#FE8C00", fontFamily: "ChairoSans" },
    footerRow: { flexDirection: "row", justifyContent: "center", columnGap: 8, marginTop: 4 },
    footerText: { fontSize: 16, color: "#6B7280", fontFamily: "ChairoSans" },
    footerLink: { fontSize: 16, color: "#FE8C00", fontFamily: "ChairoSans" },
});

const SignIn = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);
    const [form, setForm] = useState({ email: "", password: "" });
    const insets = useSafeAreaInsets();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const isCompactHeight = windowHeight < 760;
    const safeTop = Math.max(insets.top, 16);
    const heroPaddingTop = safeTop + 16;
    const heroPaddingBottom = isCompactHeight ? 120 : 140;
    const cardOverlap = isCompactHeight ? 72 : 84;
    const illustrationSize = Math.min(150, Math.max(96, Math.round(windowWidth * 0.28)));
    const heroDirection = windowWidth < 380 ? "column" : "row";

    const submit = async () => {
        const { email, password } = form;
        if (!email || !password) return Alert.alert("Error", "Please enter valid email address & password.");
        setIsSubmitting(true);

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

                const ownedRestaurantId = await getOwnedRestaurantId();
                if (ownedRestaurantId) {
                    router.replace("/restaurantpanel");
                    return;
                }
            }
            router.replace("/");
        } catch (error: any) {
            Alert.alert("Error", error?.message || "Unable to sign in right now.");
            Sentry.captureException(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = async () => {
        const email = form.email.trim();
        if (!email) {
            Alert.alert("Sifre sifirlama", "Sifre sifirlama linki almak icin e-posta adresini yaz.");
            return;
        }
        setIsResetting(true);
        try {
            await sendPasswordReset(email);
            Alert.alert("Sifre sifirlama", "Sifre sifirlama linki e-posta adresine gonderildi.");
        } catch (error: any) {
            Alert.alert("Error", error?.message || "Unable to send reset email right now.");
            Sentry.captureException(error);
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <SafeAreaView style={styles.root} edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 + insets.bottom }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <LinearGradient
                        colors={["#FE8C00", "#FE5F75"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0.3 }}
                        style={{ paddingHorizontal: 24, paddingTop: heroPaddingTop, paddingBottom: heroPaddingBottom }}
                    >
                        <View style={{ flexDirection: heroDirection as any, alignItems: "center" }}>
                            <View
                                style={{
                                    flex: heroDirection === "row" ? 1 : 0,
                                    paddingRight: heroDirection === "row" ? 24 : 0,
                                    gap: 12,
                                }}
                            >
                                <Text style={[styles.brandKicker, { textAlign: heroDirection === "column" ? "center" : "left" }]}>
                                    Hungrie
                                </Text>
                                <Text style={[styles.heroTitle, { textAlign: heroDirection === "column" ? "center" : "left" }]}>
                                    Log in to become even Hungrier!
                                </Text>
                                <Text style={[styles.heroBody, { textAlign: heroDirection === "column" ? "center" : "left" }]}>
                                    We look forward to you placing your order and getting the couriers riding!
                                </Text>
                            </View>
                            <View style={{ marginTop: heroDirection === "column" ? 16 : 0 }}>
                                <MobileDelivery width={illustrationSize} height={illustrationSize} />
                            </View>
                        </View>
                    </LinearGradient>

                    <View style={[styles.authCardWrap, { marginTop: -cardOverlap }]}>
                        <View style={styles.authCard}>
                            <View>
                                <Text style={styles.cardTitle}>Welcome the Hungrie App!</Text>
                                <Text style={styles.cardBody}>
                                    Sign in to order from Hungrie and get your food delivered fast.
                                </Text>
                            </View>

                            <CustomInput
                                placeholder="ahmet@metumail.edu.tr / ahmet@gmail.com / e232231@metu.edu.tr"
                                value={form.email}
                                onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
                                label="Email (If you could, please use your METU email, that would be great!)"
                                keyboardType="email-address"
                            />
                            <CustomInput
                                placeholder="********"
                                value={form.password}
                                onChangeText={(text) => setForm((prev) => ({ ...prev, password: text }))}
                                label="Password"
                                secureTextEntry
                            />

                            <View style={styles.rowBetween}>
                                <Text style={styles.helperText}>Stay signed in :)</Text>
                                <Pressable onPress={handleForgotPassword} disabled={isResetting || isSubmitting} hitSlop={8}>
                                    <Text style={[styles.helperText, { opacity: isResetting || isSubmitting ? 0.6 : 1 }]}>
                                        Sifremi unuttum
                                    </Text>
                                </Pressable>
                            </View>

                            <CustomButton title="Sign In" isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

                            <View style={styles.footerRow}>
                                <Text style={styles.footerText}>Don't have an account?</Text>
                                <Pressable onPress={() => router.push("/sign-up")} hitSlop={6}>
                                    <Text style={styles.footerLink}>Sign Up</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default SignIn;
