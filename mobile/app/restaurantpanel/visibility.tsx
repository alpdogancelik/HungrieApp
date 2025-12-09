import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";
import { fetchMenuItems, toggleMenuVisibility } from "@/lib/firebase";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";

export default function RestaurantVisibilityScreen() {
    const { theme } = useTheme();
    const { session } = usePanelSession();
    const restaurantId = session?.restaurantId || "";
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        if (!restaurantId) return;
        setLoading(true);
        try {
            const data = await fetchMenuItems(restaurantId);
            setItems(data);
        } catch (error) {
            console.warn("Visibility fetch failed", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId]);

    const handleToggle = async (id: string, visible: boolean) => {
        try {
            await toggleMenuVisibility(id, !visible);
            setItems((prev) => prev.map((i) => (i.id === id ? { ...i, visible: !visible } : i)));
        } catch (error) {
            console.warn("Toggle failed", error);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
                <Text style={{ fontFamily: "ChairoSans", fontSize: 22, color: theme.colors.ink }}>Görünürlük</Text>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                    Ürünleri yayına al veya gizle. Müşteri tarafında anında güncellenir. Restoran ID: {restaurantId || "-"}.
                </Text>

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} />
                ) : restaurantId ? (
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
                                    onPress={() => handleToggle(item.id, item.visible !== false)}
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
                                        {item.visible === false ? "Gizli" : "Yayında"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                ) : (
                    <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                        Önce giriş yap ve restoran seç.
                    </Text>
                )}
            </View>
        </SafeAreaView>
    );
}

