import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, View, Text, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router } from "expo-router";
import { useState } from "react";

import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { createUser } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import OrderFood from "@/assets/illustrations/Order Food.svg";

const SignUp = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", password: "", whatsappNumber: "" });
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);

    const submit = async () => {
        const { name, email, password, whatsappNumber } = form;
        if (!name || !email || !password || !whatsappNumber) {
            return Alert.alert("Error", "Please fill in all fields, including your WhatsApp number.");
        }

        setIsSubmitting(true);

        try {
            const profile = await createUser({ email, password, name, whatsappNumber });
            if (profile) {
                const mappedUser = {
                    id: profile.accountId,
                    $id: profile.accountId,
                    accountId: profile.accountId,
                    name: profile.name,
                    email: profile.email,
                    avatar: profile.avatar,
                    whatsappNumber: profile.whatsappNumber,
                };
                setUser(mappedUser);
                setIsAuthenticated(true);
            }
            router.replace("/");
        } catch (error: any) {
            Alert.alert("Error", error?.message || "Unable to sign up. Please try again.");
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
                    colors={["#FF512F", "#F09819"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 160 }}
                >
                    <View className="flex-row items-center">
                        <View className="flex-1 pr-6 gap-3">
                            <Text className="text-white/70 uppercase tracking-[8px]">Hungrie</Text>
                            <Text className="text-white text-3xl font-ezra-bold">
                                Join Hungrie under a minute.
                            </Text>
                            <Text className="text-white/80 body-medium">
                                All orders in single tap!
                            </Text>
                        </View>
                        <OrderFood width={150} height={150} />
                    </View>
                </LinearGradient>

                <View className="-mt-28 flex-1 px-6 pb-12">
                    <View className="gap-6 bg-white rounded-3xl p-6 shadow-xl shadow-dark-100/10">
                        <View>
                            <Text className="text-3xl font-ezra-bold text-dark-100">Create account</Text>
                            <Text className="body-medium text-dark-60">
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
                            <Text className="base-regular text-gray-100">Already have an account?</Text>
                            <Link href="/sign-in" className="base-bold text-primary">
                                Sign In
                            </Link>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default SignUp;
