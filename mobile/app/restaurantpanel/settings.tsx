import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";
import { updateRestaurantSettings } from "@/lib/firebase";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";

type SettingsForm = {
    minOrderAmount?: string;
    serviceFee?: string;
};

export default function RestaurantSettingsScreen() {
    const { theme } = useTheme();
    const { session } = usePanelSession();
    const restaurantId = session?.restaurantId || "";
    const [form, setForm] = useState<SettingsForm>({});
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!restaurantId) return;
        setSaving(true);
        try {
            await updateRestaurantSettings(restaurantId, {
                minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
                serviceFee: form.serviceFee ? Number(form.serviceFee) : undefined,
            });
        } catch (error) {
            console.warn("Settings update failed", error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
                <Text style={{ fontFamily: "ChairoSans", fontSize: 22, color: theme.colors.ink }}>Restoran Ayarları</Text>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                    Minimum sepet tutarı ve servis ücretini güncelle. Restoran ID: {restaurantId || "-"}.
                </Text>
                <TextInput
                    placeholder="Minimum sepet tutarı"
                    keyboardType="decimal-pad"
                    value={form.minOrderAmount || ""}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, minOrderAmount: text }))}
                    style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.lg,
                        padding: theme.spacing.md,
                        fontFamily: "ChairoSans",
                    }}
                />
                <TextInput
                    placeholder="Servis ücreti"
                    keyboardType="decimal-pad"
                    value={form.serviceFee || ""}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, serviceFee: text }))}
                    style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.lg,
                        padding: theme.spacing.md,
                        fontFamily: "ChairoSans",
                    }}
                />
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={!restaurantId || saving}
                    style={{
                        backgroundColor: theme.colors.primary,
                        padding: theme.spacing.md,
                        borderRadius: theme.radius.xl,
                        alignItems: "center",
                        opacity: !restaurantId ? 0.6 : 1,
                    }}
                >
                    <Text style={{ color: theme.colors.surface, fontFamily: "ChairoSans" }}>
                        {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

