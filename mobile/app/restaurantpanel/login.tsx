import { useEffect, useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/themeContext";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";

export default function RestaurantPanelLogin() {
    const { theme } = useTheme();
    const router = useRouter();
    const { session, login } = usePanelSession();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = () => {
        if (!email || !password) return;
        setLoading(true);
        login(email.trim(), password.trim())
            .then(() => router.replace("/restaurantpanel"))
            .catch((err: any) => {
                Alert.alert("Giriş başarısız", err?.message || "E-posta veya şifre hatalı.");
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (session) {
            router.replace("/restaurantpanel");
        }
    }, [session, router]);

    if (session) return null;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface, justifyContent: "center" }}>
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
                <Text style={{ fontFamily: "ChairoSans", fontSize: 24, color: theme.colors.ink }}>Restoran Paneli</Text>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                    Restoran hesabınızla giriş yapın. Restoran personeli için oluşturulmuş e-posta/şifreyi kullanın.
                </Text>
                <TextInput
                    placeholder="E-posta"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.lg,
                        padding: theme.spacing.md,
                        fontFamily: "ChairoSans",
                    }}
                />
                <TextInput
                    placeholder="Şifre"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.lg,
                        padding: theme.spacing.md,
                        fontFamily: "ChairoSans",
                    }}
                />
                <TouchableOpacity
                    onPress={handleLogin}
                    disabled={loading || !email || !password}
                    style={{
                        backgroundColor: theme.colors.primary,
                        padding: theme.spacing.md,
                        borderRadius: theme.radius.xl,
                        alignItems: "center",
                        opacity: !email || !password ? 0.6 : 1,
                    }}
                >
                    <Text style={{ color: theme.colors.surface, fontFamily: "ChairoSans" }}>
                        {loading ? "Giriş yapılıyor..." : "Giriş yap"}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
