import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import AuthScreenLayout from "@/components/auth/AuthScreenLayout";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import { sendPasswordReset } from "@/lib/firebaseAuth";
import { getAuthScreenCopy } from "@/src/features/auth/authCopy";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";
import OnlineOrder from "@/assets/illustrations/Online Order.svg";
import RobotDelivery from "@/assets/illustrations/Robot Delivery.svg";

type FeedbackState = {
    tone: "error" | "success";
    title: string;
    message: string;
} | null;

const styles = StyleSheet.create({
    cardTitle: { color: "#0F172A", fontSize: 30, lineHeight: 36, fontFamily: "ChairoSans" },
    cardBody: { color: "#334155", fontSize: 14, lineHeight: 20, fontFamily: "ChairoSans" },
    helperText: { color: "#64748B", fontSize: 13, lineHeight: 19, fontFamily: "ChairoSans" },
    footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", columnGap: 8, rowGap: 4, marginTop: 4, flexWrap: "wrap" },
    footerRowCompact: { justifyContent: "flex-start" },
    footerText: { fontSize: 16, color: "#6B7280", fontFamily: "ChairoSans", flexShrink: 1, textAlign: "center" },
    footerTextCompact: { width: "100%", textAlign: "left" },
    footerLink: { fontSize: 16, color: "#FE8C00", fontFamily: "ChairoSans", flexShrink: 0 },
});

const heroPackshot = require("../../assets/images/vecteezy_fast-food-meal-with_25065315.png");

const ForgotPasswordScreen = () => {
    const { width } = useStableWindowDimensions();
    const isCompact = width < 380;
    const { i18n } = useTranslation();
    const copy = getAuthScreenCopy(i18n.language).forgotPassword;
    const params = useLocalSearchParams<{ email?: string | string[] }>();
    const initialEmail = useMemo(() => {
        if (typeof params.email === "string") return params.email;
        if (Array.isArray(params.email)) return params.email[0] || "";
        return "";
    }, [params.email]);

    const [email, setEmail] = useState(initialEmail);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>(null);

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
            />

            <Text style={styles.helperText}>{copy.helper}</Text>

            <CustomButton title={copy.submit} isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

            <View style={[styles.footerRow, isCompact ? styles.footerRowCompact : null]}>
                <Text style={[styles.footerText, isCompact ? styles.footerTextCompact : null]}>{copy.backPrompt}</Text>
                <Pressable onPress={() => router.replace("/sign-in")} hitSlop={6}>
                    <Text style={styles.footerLink}>{copy.backLink}</Text>
                </Pressable>
            </View>
        </AuthScreenLayout>
    );
};

export default ForgotPasswordScreen;
