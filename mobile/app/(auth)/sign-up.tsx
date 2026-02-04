import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, View, Text, Alert, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";

import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { createUser } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import OrderFood from "@/assets/illustrations/Order Food.svg";

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
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView
                className="flex-1"
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
                                Join Hungrie under a minute.
                            </Text>
                            <Text
                                className="text-white/80 text-sm font-ezra-medium leading-5"
                                style={{ textAlign: heroDirection === "column" ? "center" : "left" }}
                            >
                                All orders in single tap!
                            </Text>
                        </View>
                        <View style={{ marginTop: heroDirection === "column" ? 16 : 0 }}>
                            <OrderFood width={illustrationSize} height={illustrationSize} />
                        </View>
                    </View>
                </LinearGradient>

                <View style={{ marginTop: -cardOverlap }} className="flex-1 px-6 pb-12">
                    <View className="gap-6 bg-white rounded-3xl p-6 shadow-xl shadow-dark-100/10">
                        <View>
                            <Text className="text-3xl font-ezra-bold text-dark-100">Create account</Text>
                            <Text className="text-sm text-dark-60 font-ezra-medium leading-5">
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

                        <View className="flex justify-center mt-1 flex-row gap-2">
                            <Text className="text-base text-gray-500 font-ezra">Already have an account?</Text>
                            <Pressable onPress={() => router.push("/sign-in")} hitSlop={6}>
                                <Text className="text-base text-primary font-ezra-semibold">Sign In</Text>
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
