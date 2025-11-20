import { View, Text, Alert } from 'react-native'
import { Link, router } from "expo-router";
import CustomInput from "@/components/CustomInput";
import CustomButton from "@/components/CustomButton";
import { useState } from "react";
import { signIn, getCurrentUser } from "@/lib/firebaseAuth";
import useAuthStore from '@/store/auth.store';
import * as Sentry from '@sentry/react-native'

const SignIn = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const setUser = useAuthStore((s) => s.setUser);
    const setIsAuthenticated = useAuthStore((s) => s.setIsAuthenticated);
    const [form, setForm] = useState({ email: '', password: '' });

    const submit = async () => {
        const { email, password } = form;

        if (!email || !password) return Alert.alert('Error', 'Please enter valid email address & password.');

        setIsSubmitting(true)

        try {
            await signIn({ email, password });
            const user = await getCurrentUser();
            if (user) {
                setUser({ name: user.name, email: user.email, avatar: user.avatar });
                setIsAuthenticated(true);
            }
            router.replace('/');
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Unable to sign in right now.');
            Sentry.captureException(error);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <View className="gap-10 bg-white rounded-3xl p-6 mt-6 shadow-lg shadow-primary/10">
            <View className="items-center gap-2">
                <Text className="text-4xl font-quicksand-bold text-dark-100 tracking-[8px]">HUNGRIE</Text>
                <Text className="body-medium text-dark-60 text-center">
                    Late-night cravings? Sign in and get fed in minutes.
                </Text>
            </View>
            <CustomInput
                placeholder="Enter your email"
                value={form.email}
                onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
                label="Email"
                keyboardType="email-address"
            />
            <CustomInput
                placeholder="Enter your password"
                value={form.password}
                onChangeText={(text) => setForm((prev) => ({ ...prev, password: text }))}
                label="Password"
                secureTextEntry={true}
            />

            <CustomButton
                title="Sign In"
                isLoading={isSubmitting}
                disabled={isSubmitting}
                onPress={submit}
            />

            <View className="flex justify-center mt-5 flex-row gap-2">
                <Text className="base-regular text-gray-100">
                    Don't have an account?
                </Text>
                <Link href="/sign-up" className="base-bold text-primary">
                    Sign Up
                </Link>
            </View>
        </View>
    )
}

export default SignIn
