import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";
import { updateRestaurantHours } from "@/lib/firebase";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";

type HoursForm = {
    mon?: string;
    tue?: string;
    wed?: string;
    thu?: string;
    fri?: string;
    sat?: string;
    sun?: string;
};

const DAYS: Array<keyof HoursForm> = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function RestaurantHoursScreen() {
    const { theme } = useTheme();
    const { session } = usePanelSession();
    const [form, setForm] = useState<HoursForm>({});
    const [saving, setSaving] = useState(false);
    const restaurantId = session?.restaurantId || "";

    const handleSave = async () => {
        if (!restaurantId) return;
        setSaving(true);
        try {
            const hours: Record<string, string> = {};
            DAYS.forEach((day) => {
                const value = form[day];
                if (value) hours[day] = value;
            });
            await updateRestaurantHours(restaurantId, hours);
        } catch (error) {
            console.warn("Hours update failed", error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
                <Text style={{ fontFamily: "ChairoSans", fontSize: 22, color: theme.colors.ink }}>Çalışma Saatleri</Text>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                    Her gün için saat aralığı gir (örn: 09:00-23:00). Restoran ID: {restaurantId || "-"}.
                </Text>
                <View style={{ gap: theme.spacing.sm }}>
                    {DAYS.map((day) => (
                        <TextInput
                            key={day}
                            placeholder={`${day.toUpperCase()} (örn: 09:00-23:00 veya kapalı)`}
                            value={form[day] || ""}
                            onChangeText={(text) => setForm((prev) => ({ ...prev, [day]: text }))}
                            style={{
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radius.lg,
                                padding: theme.spacing.md,
                                fontFamily: "ChairoSans",
                            }}
                        />
                    ))}
                </View>
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
                        {saving ? "Kaydediliyor..." : "Saatleri Kaydet"}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

