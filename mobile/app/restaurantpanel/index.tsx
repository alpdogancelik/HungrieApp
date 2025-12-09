import { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme/themeContext";
import { SectionHeader } from "@/src/components/componentRegistry";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";

const StatCard = ({ label, value }: { label: string; value: string | number }) => {
    const { theme } = useTheme();
    return (
        <View
            style={{
                flex: 1,
                padding: theme.spacing.md,
                borderRadius: theme.radius.xl,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                gap: 6,
            }}
        >
            <Text style={{ fontFamily: "ChairoSans", fontSize: 16, color: theme.colors.ink }}>{value}</Text>
            <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>{label}</Text>
        </View>
    );
};

export default function RestaurantPanelHome() {
    const router = useRouter();
    const { theme } = useTheme();
    const { session, logout } = usePanelSession();

    useEffect(() => {
        if (!session) {
            router.replace("/restaurantpanel/login");
        }
    }, [session, router]);

    if (!session) return null;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
                <View style={{ gap: theme.spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View>
                            <Text style={{ fontFamily: "ChairoSans", fontSize: 24, color: theme.colors.ink }}>
                                Restoran Paneli
                            </Text>
                            <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                                {session.restaurantName} ({session.restaurantId})
                            </Text>
                        </View>
                        <TouchableOpacity onPress={logout}>
                            <Text style={{ fontFamily: "ChairoSans", color: theme.colors.primary }}>Çıkış</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>
                        Menü, görünürlük ve çalışma saatlerini yönetin. Güncellemeler müşteri tarafına anlık düşer.
                    </Text>
                </View>

                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                    <StatCard label="Aktif sipariş" value="-" />
                    <StatCard label="Yayında menü" value="-" />
                </View>

                <View style={{ gap: theme.spacing.md }}>
                    <SectionHeader title="Kısayollar" />
                    <View style={{ flexDirection: "row", gap: theme.spacing.md, flexWrap: "wrap" }}>
                        {[
                            { label: "Siparişler", target: "/restaurantpanel/orders" },
                            { label: "Menü Yönetimi", target: "/restaurantpanel/menu" },
                            { label: "Görünürlük", target: "/restaurantpanel/visibility" },
                            { label: "Çalışma Saatleri", target: "/restaurantpanel/hours" },
                            { label: "Ayarlar", target: "/restaurantpanel/settings" },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.target}
                                onPress={() => router.push(item.target as any)}
                                style={{
                                    paddingVertical: theme.spacing.md,
                                    paddingHorizontal: theme.spacing.lg,
                                    borderRadius: theme.radius.xl,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surface,
                                }}
                            >
                                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.ink }}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
