import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import AuthScreenLayout from "@/components/auth/AuthScreenLayout";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import { getAuthScreenCopy } from "@/src/features/auth/authCopy";
import { getCurrentUser, getOwnedRestaurantId, signIn } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import RobotDelivery from "@/assets/illustrations/Robot Delivery.svg";
import { addressStore } from "@/src/features/address/addressStore";

type FeedbackState = {
    title: string;
    message: string;
} | null;

const styles = StyleSheet.create({
    cardTitle: { color: "#0F172A", fontSize: 30, lineHeight: 36, fontFamily: "ChairoSans" },
    cardBody: { color: "#334155", fontSize: 14, lineHeight: 20, fontFamily: "ChairoSans" },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    helperText: { fontSize: 12, color: "#FE8C00", fontFamily: "ChairoSans" },
    footerRow: { flexDirection: "row", justifyContent: "center", columnGap: 8, marginTop: 4 },
    footerText: { fontSize: 16, color: "#6B7280", fontFamily: "ChairoSans" },
    footerLink: { fontSize: 16, color: "#FE8C00", fontFamily: "ChairoSans" },
});

const heroPackshot = require("../../assets/images/vecteezy_fast-food-meal-with_25065315.png");

const SignIn = () => {
    const { i18n } = useTranslation();
    const copy = getAuthScreenCopy(i18n.language).signIn;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [form, setForm] = useState({ email: "", password: "" });
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);

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
                    router.replace("/restaurantpanel");
                    return;
                }
            }

            router.replace("/home");
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

    return (
        <AuthScreenLayout
            heroTitle={copy.heroTitle}
            heroBody={copy.heroBody}
            heroImageSource={heroPackshot}
            gradientColors={["#FE8C00", "#FE5F75"]}
            onClose={() => router.replace("/home")}
        >
            <View>
                <Text style={styles.cardTitle}>{copy.title}</Text>
                <Text style={styles.cardBody}>{copy.subtitle}</Text>
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
                placeholder="ahmet@metu.edu.tr"
                value={form.email}
                onChangeText={(text) => setField("email", text)}
                label={copy.emailLabel}
                inputKey="email"
                autoComplete="email"
                keyboardType="email-address"
            />
            <CustomInput
                placeholder="********"
                value={form.password}
                onChangeText={(text) => setField("password", text)}
                label={copy.passwordLabel}
                inputKey="password"
                autoComplete="current-password"
                secureTextEntry
            />

            <View style={styles.rowBetween}>
                <Text style={styles.helperText}>{copy.staySignedIn}</Text>
                <Pressable onPress={handleForgotPassword} disabled={isSubmitting} hitSlop={8}>
                    <Text style={[styles.helperText, { opacity: isSubmitting ? 0.6 : 1 }]}>{copy.forgotPassword}</Text>
                </Pressable>
            </View>

            <CustomButton title={copy.submit} isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

            <View style={styles.footerRow}>
                <Text style={styles.footerText}>{copy.noAccount}</Text>
                <Pressable onPress={() => router.push("/sign-up")} hitSlop={6}>
                    <Text style={styles.footerLink}>{copy.signUpLink}</Text>
                </Pressable>
            </View>
        </AuthScreenLayout>
    );
};

export default SignIn;
