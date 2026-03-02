import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import AuthScreenLayout from "@/components/auth/AuthScreenLayout";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import { createUser } from "@/lib/firebaseAuth";
import { getAuthScreenCopy } from "@/src/features/auth/authCopy";
import DeliveryGuy from "@/assets/illustrations/Delivery Guy.svg";

type FeedbackState = {
    title: string;
    message: string;
} | null;

const styles = StyleSheet.create({
    cardTitle: { color: "#0F172A", fontSize: 30, lineHeight: 36, fontFamily: "ChairoSans" },
    cardBody: { color: "#334155", fontSize: 14, lineHeight: 20, fontFamily: "ChairoSans" },
    footerRow: { flexDirection: "row", justifyContent: "center", columnGap: 8, marginTop: 4 },
    footerText: { fontSize: 16, color: "#6B7280", fontFamily: "ChairoSans" },
    footerLink: { fontSize: 16, color: "#FE8C00", fontFamily: "ChairoSans" },
});

const heroPackshot = require("../../assets/images/vecteezy_fast-food-meal-with_25065315.png");

const SignUp = () => {
    const { i18n } = useTranslation();
    const copy = getAuthScreenCopy(i18n.language).signUp;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [form, setForm] = useState({ name: "", email: "", password: "", whatsappNumber: "" });

    const setField = (field: "name" | "email" | "password" | "whatsappNumber", value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (feedback) {
            setFeedback(null);
        }
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

        if (!name || !email || !password || !whatsappNumber) {
            setFeedback({
                title: copy.emptyErrorTitle,
                message: copy.emptyErrorBody,
            });
            return;
        }

        setIsSubmitting(true);
        setFeedback(null);

        try {
            await createUser({ email, password, name, whatsappNumber });
            goToCheckEmail(email);
            return;
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
        <AuthScreenLayout
            heroTitle={copy.heroTitle}
            heroBody={copy.heroBody}
            heroImageSource={heroPackshot}
            gradientColors={["#FE8C00", "#FE5F75"]}
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
                    Illustration={DeliveryGuy}
                />
            ) : null}

            <CustomInput
                placeholder={copy.namePlaceholder}
                value={form.name}
                onChangeText={(text) => setField("name", text)}
                label={copy.nameLabel}
            />
            <CustomInput
                placeholder="+90 5xx xxx xx xx"
                value={form.whatsappNumber}
                onChangeText={(text) => setField("whatsappNumber", text)}
                label={copy.whatsappLabel}
                keyboardType="phone-pad"
            />
            <CustomInput
                placeholder="e232231@metu.edu.tr"
                value={form.email}
                onChangeText={(text) => setField("email", text)}
                label={copy.emailLabel}
                keyboardType="email-address"
            />
            <CustomInput
                placeholder={copy.passwordPlaceholder}
                value={form.password}
                onChangeText={(text) => setField("password", text)}
                label={copy.passwordLabel}
                secureTextEntry
            />

            <CustomButton title={copy.submit} isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

            <View style={styles.footerRow}>
                <Text style={styles.footerText}>{copy.alreadyAccount}</Text>
                <Pressable onPress={() => router.push("/sign-in")} hitSlop={6}>
                    <Text style={styles.footerLink}>{copy.signInLink}</Text>
                </Pressable>
            </View>
        </AuthScreenLayout>
    );
};

export default SignUp;
