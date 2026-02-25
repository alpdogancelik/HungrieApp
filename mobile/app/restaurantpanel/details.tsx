import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "expo-router";

import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import {
    PanelButton,
    PanelCard,
    PanelLoadingState,
    PanelShell,
    panelDesign,
} from "@/src/features/restaurantPanel/ui";
import { LanguageSwitch } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

const RestaurantDetails = () => {
    const router = useRouter();
    const { isAuthenticated } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: "",
        imageUrl: "",
        address: "",
        cuisine: "",
        description: "",
        isActive: true,
    });

    const canSave = useMemo(() => Boolean(form.name.trim()), [form.name]);
    const { locale, setLocale, t } = useRestaurantPanelLocale(restaurantId);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (!isAuthenticated || !firestore) {
                setLoading(false);
                return;
            }
            const owned = await getOwnedRestaurantId();
            if (!mounted) return;
            if (!owned) {
                setLoading(false);
                return;
            }
            setRestaurantId(owned);
            const snap = await getDoc(doc(firestore, "restaurants", owned)).catch(() => null);
            if (snap?.exists()) {
                const data = snap.data() || {};
                setForm({
                    name: String(data.name || ""),
                    imageUrl: String(data.imageUrl || data.image_url || ""),
                    address: String(data.address || ""),
                    cuisine: String(data.cuisine || ""),
                    description: String(data.description || ""),
                    isActive: data.isActive !== false,
                });
            }
            setLoading(false);
        };
        load();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    const handleChange = (key: keyof typeof form, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        if (!restaurantId || !firestore) return;
        if (!canSave) {
            Alert.alert(t("details.saveFailedTitle"), t("details.nameRequired"));
            return;
        }
        try {
            setSaving(true);
            await updateDoc(doc(firestore, "restaurants", restaurantId), {
                name: form.name.trim(),
                imageUrl: form.imageUrl.trim(),
                address: form.address.trim(),
                cuisine: form.cuisine.trim(),
                description: form.description.trim(),
                isActive: !!form.isActive,
                updatedAt: Date.now(),
            });
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
            onBackPress={() => router.push("/restaurantpanel")}
            backLabel={t("button.backToPanel")}
            backAccessibilityLabel={t("a11y.backToPanel")}
            right={<LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })} />}
        >
            {loading ? (
                <PanelLoadingState title={t("loading.detailsTitle")} description={t("loading.detailsDescription")} />
            ) : (
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

                    <View style={styles.switchRow}>
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

                    <PanelButton
                        label={t("details.save")}
                        onPress={handleSave}
                        loading={saving}
                        disabled={!canSave || saving}
                        accessibilityLabel={t("a11y.saveRestaurantDetails")}
                    />
                </PanelCard>
            )}
        </PanelShell>
    );
};

const styles = StyleSheet.create({
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
});

export default RestaurantDetails;

