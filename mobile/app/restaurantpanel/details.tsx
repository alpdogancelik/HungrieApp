import { useEffect, useMemo, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import {
    Alert,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";

import { getOwnedRestaurantDetails, updateOwnedRestaurantDetails } from "@/src/data/restaurantRepository";
import useAuthStore from "@/store/auth.store";
import {
    PanelCard,
    PanelLoadingState,
    PanelShell,
    panelDesign,
} from "@/src/features/restaurantPanel/ui";
import { LanguageSwitch } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

const RestaurantDetails = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isPhone = width < 760;
    const { isAuthenticated, isLoading: authLoading } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [redirectTo, setRedirectTo] = useState<"/sign-in" | null>(null);
    const [form, setForm] = useState({
        name: "",
        imageUrl: "",
        address: "",
        cuisine: "",
        description: "",
        isActive: true,
    });

    const canSave = useMemo(() => Boolean(form.name.trim()), [form.name]);
    const { locale, ready, setLocale, t } = useRestaurantPanelLocale(restaurantId);
    const localeReady = !restaurantId || ready;

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (authLoading) return;
            if (!isAuthenticated) {
                if (mounted) {
                    setRedirectTo("/sign-in");
                    setLoading(false);
                }
                return;
            }
            if (mounted) {
                setRedirectTo(null);
            }
            const owned = await getOwnedRestaurantDetails();
            if (!mounted) return;
            if (!owned) {
                setRedirectTo("/sign-in");
                setLoading(false);
                return;
            }
            setRestaurantId(owned.restaurantId);
            setForm(owned.details);
            setLoading(false);
        };
        load();
        return () => {
            mounted = false;
        };
    }, [authLoading, isAuthenticated]);

    if (redirectTo) {
        return <Redirect href={redirectTo} />;
    }

    const handleChange = (key: keyof typeof form, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        if (!restaurantId) return;
        if (!canSave) {
            Alert.alert(t("details.saveFailedTitle"), t("details.nameRequired"));
            return;
        }
        try {
            setSaving(true);
            await updateOwnedRestaurantDetails(restaurantId, form);
            Alert.alert(t("details.savedTitle"), t("details.savedBody"));
        } catch (err: any) {
            Alert.alert(t("details.saveFailedTitle"), err?.message || t("common.tryAgain"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PanelShell
            kicker={t("common.restaurantHub")}
            title={t("details.title")}
            subtitle={t("details.subtitle")}
            onBackPress={isPhone ? undefined : () => router.push("/restaurantpanel")}
            backLabel={isPhone ? undefined : t("button.backToPanel")}
            backAccessibilityLabel={isPhone ? undefined : t("a11y.backToPanel")}
            right={
                isPhone ? (
                    <View style={styles.mobileHeaderTools}>
                        <TouchableOpacity
                            onPress={() => router.push("/restaurantpanel")}
                            activeOpacity={0.82}
                            accessibilityLabel={t("a11y.backToPanel")}
                            style={styles.mobileHeaderBackButton}
                        >
                            <View style={styles.mobileHeaderBackButtonContent}>
                                <View style={styles.mobileHeaderBackButtonIconWrap}>
                                    <Feather name="chevron-left" size={15} color="#B94900" />
                                </View>
                                <Text style={styles.mobileHeaderBackButtonText}>{t("button.backToPanel")}</Text>
                            </View>
                        </TouchableOpacity>
                        <LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })} />
                    </View>
                ) : (
                    <LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })} />
                )
            }
        >
            {loading || !localeReady ? (
                <PanelLoadingState title={t("loading.detailsTitle")} description={t("loading.detailsDescription")} />
            ) : (
                <View style={styles.contentStack}>
                    <PanelCard>
                        <View style={styles.field}>
                            <Text style={styles.label}>{t("details.name")}</Text>
                            <TextInput
                                value={form.name}
                                onChangeText={(value) => handleChange("name", value)}
                                placeholder={t("details.placeholder.name")}
                                placeholderTextColor="#8895AA"
                                style={styles.input}
                                accessibilityLabel={t("a11y.restaurantName")}
                            />
                        </View>

                        <View style={styles.field}>
                            <Text style={styles.label}>{t("details.imageUrl")}</Text>
                            <TextInput
                                value={form.imageUrl}
                                onChangeText={(value) => handleChange("imageUrl", value)}
                                placeholder="https://"
                                placeholderTextColor="#8895AA"
                                style={styles.input}
                                autoCapitalize="none"
                                accessibilityLabel={t("a11y.restaurantImageUrl")}
                            />
                        </View>

                        <View style={styles.field}>
                            <Text style={styles.label}>{t("details.address")}</Text>
                            <TextInput
                                value={form.address}
                                onChangeText={(value) => handleChange("address", value)}
                                placeholder={t("details.placeholder.address")}
                                placeholderTextColor="#8895AA"
                                style={[styles.input, styles.inputMulti]}
                                multiline
                                accessibilityLabel={t("a11y.restaurantAddress")}
                            />
                        </View>

                        <View style={styles.field}>
                            <Text style={styles.label}>{t("details.cuisine")}</Text>
                            <TextInput
                                value={form.cuisine}
                                onChangeText={(value) => handleChange("cuisine", value)}
                                placeholder={t("details.placeholder.cuisine")}
                                placeholderTextColor="#8895AA"
                                style={styles.input}
                                accessibilityLabel={t("a11y.restaurantCuisine")}
                            />
                        </View>

                        <View style={styles.field}>
                            <Text style={styles.label}>{t("details.description")}</Text>
                            <TextInput
                                value={form.description}
                                onChangeText={(value) => handleChange("description", value)}
                                placeholder={t("details.placeholder.description")}
                                placeholderTextColor="#8895AA"
                                style={[styles.input, styles.inputMultiLarge]}
                                multiline
                                accessibilityLabel={t("a11y.restaurantDescription")}
                            />
                        </View>

                        <View style={[styles.switchRow, isPhone ? styles.switchRowPhone : null]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>{t("details.visible")}</Text>
                                <Text style={styles.helper}>{t("details.visibleHint")}</Text>
                            </View>
                            <Switch
                                value={form.isActive}
                                onValueChange={(value) => handleChange("isActive", value)}
                                thumbColor={form.isActive ? panelDesign.colors.primary : "#E2E8F0"}
                                trackColor={{ false: "#DCE3EE", true: "#FFE4C4" }}
                                accessibilityLabel={t("a11y.toggleRestaurantActive")}
                            />
                        </View>

                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={!canSave || saving}
                            accessibilityLabel={t("a11y.saveRestaurantDetails")}
                            activeOpacity={0.82}
                            style={[
                                styles.saveButton,
                                (!canSave || saving) ? styles.saveButtonDisabled : null,
                            ]}
                        >
                            <Text style={styles.saveButtonText}>
                                {saving ? `${t("details.save")}...` : t("details.save")}
                            </Text>
                        </TouchableOpacity>
                    </PanelCard>
                </View>
            )}
        </PanelShell>
    );
};

const styles = createAdaptiveStyleSheet({
    mobileHeaderTools: {
        width: "100%",
        gap: 10,
        alignItems: "flex-start",
    },
    mobileHeaderBackButton: {
        width: "100%",
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#EE7A14",
        backgroundColor: "#FFF5EA",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    mobileHeaderBackButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    mobileHeaderBackButtonIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    mobileHeaderBackButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B94900",
        fontWeight: "600",
    },
    contentStack: {
        gap: panelDesign.spacing.sm,
    },
    field: {
        gap: 6,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: panelDesign.colors.text,
    },
    helper: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
        color: panelDesign.colors.muted,
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
    inputMulti: {
        minHeight: 70,
        textAlignVertical: "top",
    },
    inputMultiLarge: {
        minHeight: 94,
        textAlignVertical: "top",
    },
    switchRow: {
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        borderRadius: panelDesign.radius.md,
        backgroundColor: panelDesign.colors.backgroundSoft,
        padding: panelDesign.spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: panelDesign.spacing.sm,
    },
    switchRowPhone: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    saveButton: {
        width: "100%",
        minHeight: 46,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    saveButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: "#FFFFFF",
    },
    saveButtonDisabled: {
        opacity: 0.55,
    },
});

export default RestaurantDetails;
