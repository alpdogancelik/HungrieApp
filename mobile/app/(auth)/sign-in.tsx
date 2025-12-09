import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, Alert, ScrollView } from "react-native";
import { Link, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import * as Sentry from "@sentry/react-native";

import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { signIn, getCurrentUser } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import MobileDelivery from "@/assets/illustrations/Mobile Delivery.svg";

// Apply ChairoSans-Regular as the default font for all Text components
// (Assumes the font has been loaded elsewhere in the app)
(Text as any).defaultProps = {
    ...(Text as any).defaultProps || {},
    style: {
        ...(((Text as any).defaultProps || {}).style || {}),
        fontFamily: "ChairoSans-Regular",
    },
};

const SignIn = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);
    const [form, setForm] = useState({ email: "", password: "" });

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
                };
                setUser(mappedUser);
                setIsAuthenticated(true);
            }
            router.replace("/");
        } catch (error: any) {
            Alert.alert("Error", error?.message || "Unable to sign in right now.");
            Sentry.captureException(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <LinearGradient
                    colors={["#FE8C00", "#FE5F75"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0.3 }}
                    style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 160 }}
                >
                    <View className="flex-row items-center">
                        <View className="flex-1 pr-6 gap-3">
                            <Text className="text-white/70 uppercase tracking-[8px]">Hungrie</Text>
                            <Text className="text-white text-3xl font-ezra-bold">Log in to become even Hungrier!
                            </Text>
                            <Text className="text-white/80 body-medium">
                                We look forward to you placing your order and getting the couriers riding!
                            </Text>
                        </View>
                        <MobileDelivery width={150} height={150} />
                    </View>
                </LinearGradient>

                <View className="-mt-28 flex-1 px-6 pb-12">
                    <View className="gap-6 bg-white rounded-3xl p-6 shadow-xl shadow-primary/10">
                        <View>
                            <Text className="text-3xl font-ezra-bold text-dark-100">Welcome the Hungrie App!</Text>
                            <Text className="body-medium text-dark-60">
                                Sign in to order from Hungrie and get your food delivered fast.
                            </Text>
                        </View>

                        <CustomInput
                            placeholder="ahmet@metumail.edu.tr / ahmet@gmail.com / e232231@metu.edu.tr"
                            value={form.email}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
                            label="Email"
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
                            <Text className="small-semibold text-primary">
                                Stay signed in :)
                            </Text>
                        </View>

                        <CustomButton title="Sign In" isLoading={isSubmitting} disabled={isSubmitting} onPress={submit} />

                        <View className="flex justify-center mt-1 flex-row gap-2">
                            <Text className="base-regular text-gray-100">Don't have an account?</Text>
                            <Link href="/sign-up" className="base-bold text-primary">
                                Sign Up
                            </Link>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default SignIn;
