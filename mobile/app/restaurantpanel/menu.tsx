import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/themeContext";
import { addMenuItem, fetchMenuItems, toggleMenuVisibility } from "@/lib/firebase";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";

type MenuForm = { name: string; price: string; description?: string };

export default function RestaurantMenuScreen() {
    const { theme } = useTheme();
    const { session } = usePanelSession();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<MenuForm>({ name: "", price: "", description: "" });
    const restaurantId = session?.restaurantId || "";

    const loadMenu = async () => {
        if (!restaurantId) return;
        setLoading(true);
        try {
            const data = await fetchMenuItems(restaurantId);
            setItems(data);
        } catch (error) {
            console.warn("Menu fetch failed", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadMenu();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId]);

    const handleSave = async () => {
        if (!form.name || !form.price || !restaurantId) return;
        setSaving(true);
        try {
            await addMenuItem({
                restaurantId,
                name: form.name,
                price: Number(form.price),
                description: form.description,
            });
            setForm((prev) => ({ ...prev, name: "", price: "", description: "" }));
            void loadMenu();
        } catch (error) {
            console.warn("Menu save failed", error);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleVisibility = async (id: string, visible: boolean) => {
        try {
            await toggleMenuVisibility(id, !visible);
            setItems((prev) => prev.map((item) => (item.id === id ? { ...item, visible: !visible } : item)));
        } catch (error) {
            console.warn("Visibility toggle failed", error);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
                <Text style={{ fontFamily: "ChairoSans", fontSize: 22, color: theme.colors.ink }}>Menü Yönetimi</Text>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                    Menü öğelerini ekle, fiyat ve görünürlük güncelle. Giriş yaptığın restoran ID: {restaurantId || "-"}.
                </Text>
                <View style={{ gap: theme.spacing.sm }}>
                    <TextInput
                        placeholder="Ürün adı"
                        value={form.name}
                        onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
                        style={{
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.lg,
                            padding: theme.spacing.md,
                            fontFamily: "ChairoSans",
                        }}
                    />
                    <TextInput
                        placeholder="Fiyat"
                        keyboardType="decimal-pad"
                        value={form.price}
                        onChangeText={(text) => setForm((prev) => ({ ...prev, price: text }))}
                        style={{
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.lg,
                            padding: theme.spacing.md,
                            fontFamily: "ChairoSans",
                        }}
                    />
                    <TextInput
                        placeholder="Açıklama (opsiyonel)"
                        value={form.description}
                        onChangeText={(text) => setForm((prev) => ({ ...prev, description: text }))}
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
                        disabled={!restaurantId || !form.name || !form.price || saving}
                        style={{
                            backgroundColor: theme.colors.primary,
                            padding: theme.spacing.md,
                            borderRadius: theme.radius.xl,
                            alignItems: "center",
                            opacity: !restaurantId || !form.name || !form.price ? 0.6 : 1,
                        }}
                    >
                        <Text style={{ color: theme.colors.surface, fontFamily: "ChairoSans" }}>
                            {saving ? "Kaydediliyor..." : "Ürün Ekle"}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={{ height: 1, backgroundColor: theme.colors.border }} />

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} />
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ gap: theme.spacing.sm }}
                        renderItem={({ item }) => (
                            <View
                                style={{
                                    padding: theme.spacing.md,
                                    borderRadius: theme.radius.lg,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surface,
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={{ fontFamily: "ChairoSans", color: theme.colors.ink }}>{item.name}</Text>
                                    <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                                        TRY {Number(item.price || 0).toFixed(2)}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => handleToggleVisibility(item.id, item.visible !== false)}
                                    style={{
                                        paddingVertical: theme.spacing.xs,
                                        paddingHorizontal: theme.spacing.md,
                                        borderRadius: theme.radius.lg,
                                        borderWidth: 1,
                                        borderColor: theme.colors.border,
                                        backgroundColor: item.visible === false ? "#FFF1F0" : "#E7F5FF",
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: "ChairoSans",
                                            color: item.visible === false ? "#D14343" : "#0F172A",
                                        }}
                                    >
                                        {item.visible === false ? "Kapalı" : "Yayında"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

