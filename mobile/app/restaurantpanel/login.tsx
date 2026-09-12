import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { PanelButton, PanelCard, PanelShell, panelDesign } from "@/src/features/restaurantPanel/ui";
import { LanguageSwitch } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";
import { getAuthErrorMessage } from "@/src/features/auth/authCopy";
import { isStrictValidEmail } from "@/src/features/auth/emailValidation";
import useAuthStore from "@/store/auth.store";
import { getCurrentMembership } from "@/src/data/membershipRepository";
import { signInRestaurant, signOutRestaurant, type RestaurantSession } from "@/src/data/restaurantRepository";

const replaceAfterAuth = (router: ReturnType<typeof useRouter>, pathname: "/restaurantpanel") => {
    try {
        if (router.canDismiss()) {
            router.dismissAll();
        }
    } catch {
        // Ignore navigator-specific dismiss support and still replace the route.
    }
    router.replace(pathname);
};

export default function RestaurantPanelLogin() {
    const router = useRouter();
    const { isAuthenticated, isLoading: authLoading } = useAuthStore();
    const [session, setSession] = useState<RestaurantSession | null>(null);
    const [membershipChecked, setMembershipChecked] = useState(false);
    const { locale, setLocale, t } = useRestaurantPanelLocale(null);
    const isTurkish = locale === "tr";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const didNavigateRef = useRef(false);

    const handleLogin = () => {
        const trimmedEmail = email.trim();
        const trimmedPassword = password.trim();
        if (!trimmedEmail || !trimmedPassword) return;
        if (!isStrictValidEmail(trimmedEmail)) {
            Alert.alert(t("login.failedTitle"), getAuthErrorMessage(locale, "invalidEmail") || t("login.failedBody"));
            return;
        }
        setLoading(true);
        signInRestaurant(trimmedEmail, trimmedPassword)
            .then(setSession)
            .catch((err: any) => {
                Alert.alert(t("login.failedTitle"), err?.message || t("login.failedBody"));
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) {
            setSession(null);
            setMembershipChecked(true);
            return;
        }
        let active = true;
        setMembershipChecked(false);
        void getCurrentMembership()
            .then((next) => { if (active) setSession(next); })
            .catch(() => { if (active) setSession(null); })
            .finally(() => { if (active) setMembershipChecked(true); });
        return () => { active = false; };
    }, [authLoading, isAuthenticated]);

    useEffect(() => {
        if (!session) return;
        if (didNavigateRef.current) return;

        didNavigateRef.current = true;
        const frame = requestAnimationFrame(() => {
            replaceAfterAuth(router, "/restaurantpanel");
        });

        return () => cancelAnimationFrame(frame);
    }, [session, router]);

    if (session || authLoading || !membershipChecked) return null;

    if (isAuthenticated) {
        return (
            <PanelShell
                kicker={t("common.restaurantHub")}
                title={locale === "tr" ? "Restoran erişimi yok" : "No restaurant access"}
                subtitle={locale === "tr" ? "Bu hesap bir restorana bağlı değil." : "This account is not linked to a restaurant."}
                right={<LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => `${isTurkish ? "Dili degistir" : "Switch language"} ${next.toUpperCase()}`} />}
            >
                <View style={styles.centerWrap}>
                    <PanelCard
                        title={locale === "tr" ? "Başka hesap kullan" : "Use another account"}
                        subtitle={locale === "tr" ? "Devam etmek mevcut hesaptan çıkış yapar." : "Continuing signs out the current account."}
                    >
                        <PanelButton
                            label={locale === "tr" ? "Hesap değiştir" : "Switch account"}
                            onPress={() => void signOutRestaurant()}
                            accessibilityLabel={locale === "tr" ? "Restoran hesabına geç" : "Switch restaurant account"}
                        />
                    </PanelCard>
                </View>
            </PanelShell>
        );
    }

    return (
        <PanelShell
            kicker={t("common.restaurantHub")}
            title={t("login.title")}
            subtitle={t("login.subtitle")}
            right={<LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })} />}
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

const styles = createAdaptiveStyleSheet({
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
