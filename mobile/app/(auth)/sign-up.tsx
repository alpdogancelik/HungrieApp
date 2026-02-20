import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, View, Text, Alert, Pressable, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";

import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { createUser } from "@/lib/firebaseAuth";
import OrderFood from "@/assets/illustrations/Order Food.svg";

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
    footerRow: { flexDirection: "row", justifyContent: "center", columnGap: 8, marginTop: 4 },
    footerText: { fontSize: 16, color: "#6B7280", fontFamily: "ChairoSans" },
    footerLink: { fontSize: 16, color: "#FE8C00", fontFamily: "ChairoSans" },
});

const SignUp = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", password: "", whatsappNumber: "" });
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
        const { name, email, password, whatsappNumber } = form;
        if (!name || !email || !password || !whatsappNumber) {
            return Alert.alert("Error", "Please fill in all fields, including your WhatsApp number.");
        }

        setIsSubmitting(true);

        try {
            await createUser({ email, password, name, whatsappNumber });
            Alert.alert(
                "Verify your email",
                "We sent you a verification link. Please verify your email, then sign in.",
                [{ text: "OK", onPress: () => router.replace("/sign-in") }],
            );
            // Ensure we leave the auth flow until verification is completed.
            setIsSubmitting(false);
            return;
        } catch (error: any) {
            const message = error?.message || "";
            if (message.toLowerCase().includes("verify your email")) {
                Alert.alert(
                    "Verify your email",
                    "We sent you a verification link. Please verify your email, then sign in.",
                    [{ text: "OK", onPress: () => router.replace("/sign-in") }],
                );
            } else {
                Alert.alert("Error", message || "Unable to sign up. Please try again.");
            }
        } finally {
            setIsSubmitting(false);
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
                    colors={["#FF512F", "#F09819"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
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
                                Join Hungrie under a minute.
                            </Text>
                            <Text style={[styles.heroBody, { textAlign: heroDirection === "column" ? "center" : "left" }]}>
                                All orders in single tap!
                            </Text>
                        </View>
                        <View style={{ marginTop: heroDirection === "column" ? 16 : 0 }}>
                            <OrderFood width={illustrationSize} height={illustrationSize} />
                        </View>
                    </View>
                </LinearGradient>

                <View style={[styles.authCardWrap, { marginTop: -cardOverlap }]}>
                    <View style={styles.authCard}>
                        <View>
                            <Text style={styles.cardTitle}>Create account</Text>
                            <Text style={styles.cardBody}>
                                Create your account and start ordering in seconds!
                            </Text>
                        </View>
                        <CustomInput
                            placeholder="Ahmet Çetin "
                            value={form.name}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
                            label="Full name"
                        />
                        <CustomInput
                            placeholder="+90 5xx xxx xx xx"
                            value={form.whatsappNumber}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, whatsappNumber: text }))}
                            label="WhatsApp number"
                            keyboardType="phone-pad"
                        />
                        <CustomInput
                            placeholder="ahmet@metu.edu.tr / ahmet@gmail.com / e232231@metu.edu.tr"
                            value={form.email}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
                            label="Email (If you could, please use your METU email, that would be great!)"
                            keyboardType="email-address"
                        />
                        <CustomInput
                            placeholder="At least 8 characters"
                            value={form.password}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, password: text }))}
                            label="Password"
                            secureTextEntry
                        />

                        <CustomButton title="Sign Up" isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>Already have an account?</Text>
                            <Pressable onPress={() => router.push("/sign-in")} hitSlop={6}>
                                <Text style={styles.footerLink}>Sign In</Text>
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
