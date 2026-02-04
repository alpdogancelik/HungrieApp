import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, Alert, ScrollView, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import * as Sentry from "@sentry/react-native";

import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { signIn, getCurrentUser, getOwnedRestaurantId, sendPasswordReset } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import MobileDelivery from "@/assets/illustrations/Mobile Delivery.svg";

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
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <ScrollView
                    className="flex-1"
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
                                <Text
                                    className="text-white/70 uppercase tracking-[8px]"
                                    style={{ textAlign: heroDirection === "column" ? "center" : "left" }}
                                >
                                    Hungrie
                                </Text>
                                <Text
                                    className="text-white text-3xl font-ezra-bold"
                                    style={{ textAlign: heroDirection === "column" ? "center" : "left" }}
                                >
                                    Log in to become even Hungrier!
                                </Text>
                                <Text
                                    className="text-white/80 text-sm font-ezra-medium leading-5"
                                    style={{ textAlign: heroDirection === "column" ? "center" : "left" }}
                                >
                                    We look forward to you placing your order and getting the couriers riding!
                                </Text>
                            </View>
                            <View style={{ marginTop: heroDirection === "column" ? 16 : 0 }}>
                                <MobileDelivery width={illustrationSize} height={illustrationSize} />
                            </View>
                        </View>
                    </LinearGradient>

                    <View style={{ marginTop: -cardOverlap }} className="flex-1 px-6 pb-12">
                        <View className="gap-6 bg-white rounded-3xl p-6 shadow-xl shadow-primary/10">
                            <View>
                                <Text className="text-3xl font-ezra-bold text-dark-100">Welcome the Hungrie App!</Text>
                                <Text className="text-sm text-dark-60 font-ezra-medium leading-5">
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

                            <View className="flex-row items-center justify-between">
                                <Text className="text-xs font-ezra-semibold text-primary">Stay signed in :)</Text>
                                <Pressable onPress={handleForgotPassword} disabled={isResetting || isSubmitting} hitSlop={8}>
                                    <Text
                                        className="text-xs font-ezra-semibold text-primary"
                                        style={{ opacity: isResetting || isSubmitting ? 0.6 : 1 }}
                                    >
                                        Sifremi unuttum
                                    </Text>
                                </Pressable>
                            </View>

                            <CustomButton title="Sign In" isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

                            <View className="flex justify-center mt-1 flex-row gap-2">
                                <Text className="text-base text-gray-500 font-ezra">Don't have an account?</Text>
                                <Pressable onPress={() => router.push("/sign-up")} hitSlop={6}>
                                    <Text className="text-base text-primary font-ezra-semibold">Sign Up</Text>
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
