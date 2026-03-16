import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";
import { PanelButton, PanelCard, PanelShell, panelDesign } from "@/src/features/restaurantPanel/ui";
import { LanguageSwitch } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

export default function RestaurantPanelLogin() {
    const router = useRouter();
    const { session, login } = usePanelSession();
    const { locale, setLocale, t } = useRestaurantPanelLocale(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const didNavigateRef = useRef(false);

    const handleLogin = () => {
        if (!email || !password) return;
        setLoading(true);
        login(email.trim(), password.trim())
            .catch((err: any) => {
                Alert.alert(t("login.failedTitle"), err?.message || t("login.failedBody"));
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!session) return;
        if (didNavigateRef.current) return;

        didNavigateRef.current = true;
        const frame = requestAnimationFrame(() => {
            router.replace("/restaurantpanel");
        });

        return () => cancelAnimationFrame(frame);
    }, [session, router]);

    if (session) return null;

    return (
        <PanelShell
            kicker={t("common.restaurantHub")}
            title={t("login.title")}
            subtitle={t("login.subtitle")}
            right={<LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })} />}
            noScroll
        >
            <View style={styles.centerWrap}>
                <PanelCard title={t("login.welcome")} subtitle={t("login.welcomeSubtitle")}>
                    <View style={styles.fieldWrap}>
                        <Text style={styles.label}>{t("login.email")}</Text>
                        <TextInput
                            placeholder={t("login.emailPlaceholder")}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                            style={styles.input}
                            accessibilityLabel={t("a11y.restaurantPanelEmail")}
                        />
                    </View>

                    <View style={styles.fieldWrap}>
                        <Text style={styles.label}>{t("login.password")}</Text>
                        <TextInput
                            placeholder={t("login.passwordPlaceholder")}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            style={styles.input}
                            accessibilityLabel={t("a11y.restaurantPanelPassword")}
                        />
                    </View>

                    <PanelButton
                        label={loading ? t("login.signingIn") : t("login.signIn")}
                        onPress={handleLogin}
                        loading={loading}
                        disabled={loading || !email || !password}
                        accessibilityLabel={t("a11y.signInRestaurantPanel")}
                    />
                </PanelCard>
            </View>
        </PanelShell>
    );
}

const styles = StyleSheet.create({
    centerWrap: {
        flex: 1,
        justifyContent: "center",
    },
    fieldWrap: {
        gap: 6,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: panelDesign.colors.text,
    },
    input: {
        minHeight: 46,
        borderRadius: panelDesign.radius.md,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: panelDesign.colors.text,
        fontFamily: "ChairoSans",
        fontSize: 16,
    },
});
