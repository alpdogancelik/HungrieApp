import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import AuthFeedbackCard from "@/components/auth/AuthFeedbackCard";
import AuthScreenLayout from "@/components/auth/AuthScreenLayout";
import CustomButton from "@/components/CustomButton";
import { getAuthScreenCopy } from "@/src/features/auth/authCopy";
import DeliveryBoy from "@/assets/illustrations/Delivery Boy.svg";

const styles = StyleSheet.create({
    cardTitle: { color: "#0F172A", fontSize: 30, lineHeight: 36, fontFamily: "ChairoSans" },
    cardBody: { color: "#334155", fontSize: 14, lineHeight: 20, fontFamily: "ChairoSans" },
    emailBadge: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#CBD5E1",
        backgroundColor: "#F8FAFC",
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    emailLabel: { color: "#64748B", fontSize: 13, lineHeight: 18, fontFamily: "ChairoSans" },
    emailValue: { color: "#0F172A", fontSize: 16, lineHeight: 22, fontFamily: "ChairoSans" },
    footerRow: { flexDirection: "row", justifyContent: "center", columnGap: 8, marginTop: 4 },
    footerText: { fontSize: 16, color: "#6B7280", fontFamily: "ChairoSans" },
    footerLink: { fontSize: 16, color: "#FE8C00", fontFamily: "ChairoSans" },
});

const heroPackshot = require("../../assets/images/vecteezy_fast-food-meal-with_25065315.png");

const CheckEmailScreen = () => {
    const { i18n } = useTranslation();
    const copy = getAuthScreenCopy(i18n.language).checkEmail;
    const params = useLocalSearchParams<{ email?: string | string[] }>();
    const email = useMemo(() => {
        if (typeof params.email === "string") return params.email;
        if (Array.isArray(params.email)) return params.email[0] || "";
        return "";
    }, [params.email]);

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

            <CustomButton title={copy.backToSignIn} onPress={() => router.replace("/sign-in")} />

            <View style={styles.footerRow}>
                <Text style={styles.footerText}>{copy.editPrompt}</Text>
                <Pressable onPress={() => router.replace("/sign-up")} hitSlop={6}>
                    <Text style={styles.footerLink}>{copy.editLink}</Text>
                </Pressable>
            </View>
        </AuthScreenLayout>
    );
};

export default CheckEmailScreen;
