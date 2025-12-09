import { useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";
import { usePanelSession } from "@/src/features/restaurantPanel/panelSession";
import useRestaurantOrders from "@/src/hooks/useRestaurantOrders";

const formatCurrency = (value?: number | string) => `TRY ${Number(value ?? 0).toFixed(2)}`;

export default function RestaurantOrdersScreen() {
    const { theme } = useTheme();
    const { session } = usePanelSession();
    const restaurantId = session?.restaurantId || "";
    const { orders, loading, mutateStatus } = useRestaurantOrders(restaurantId);

    const grouped = useMemo(() => {
        const pending = orders.filter((o) => o.status === "pending");
        const active = orders.filter((o) => o.status === "preparing");
        const ready = orders.filter((o) => o.status === "ready");
        return { pending, active, ready };
    }, [orders]);

    const renderOrderCard = (order: any) => {
        const orderId = String(order.id ?? order.$id ?? "");
        const items = order.orderItems || order.items || [];
        const summary = Array.isArray(items)
            ? items
                  .slice(0, 2)
                  .map((i: any) => `${i.quantity || 1}x ${i.name || "Item"}`)
                  .join(", ")
            : "";
        return (
            <View
                key={orderId}
                style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.xl,
                    padding: theme.spacing.md,
                    backgroundColor: theme.colors.surface,
                    marginBottom: theme.spacing.sm,
                }}
            >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontFamily: "ChairoSans", color: theme.colors.ink, fontSize: 16 }}>#{orderId.slice(-5)}</Text>
                    <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted }}>{formatCurrency(order.total)}</Text>
                </View>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.muted, marginTop: 4 }} numberOfLines={2}>
                    {summary || "Ürün listesi yok"}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: theme.spacing.sm }}>
                    {order.status === "pending" ? (
                        <>
                            <TouchableOpacity
                                onPress={() => mutateStatus(orderId, "preparing")}
                                style={{
                                    paddingVertical: theme.spacing.xs,
                                    paddingHorizontal: theme.spacing.md,
                                    borderRadius: theme.radius.lg,
                                    backgroundColor: theme.colors.primary,
                                }}
                            >
                                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.surface }}>Onayla</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => mutateStatus(orderId, "canceled")}
                                style={{
                                    paddingVertical: theme.spacing.xs,
                                    paddingHorizontal: theme.spacing.md,
                                    borderRadius: theme.radius.lg,
                                    backgroundColor: "#FEE2E2",
                                }}
                            >
                                <Text style={{ fontFamily: "ChairoSans", color: "#B91C1C" }}>Reddet</Text>
                            </TouchableOpacity>
                        </>
                    ) : null}
                    {order.status === "preparing" ? (
                        <TouchableOpacity
                            onPress={() => mutateStatus(orderId, "ready")}
                            style={{
                                paddingVertical: theme.spacing.xs,
                                paddingHorizontal: theme.spacing.md,
                                borderRadius: theme.radius.lg,
                                backgroundColor: "#E0F2FE",
                            }}
                        >
                            <Text style={{ fontFamily: "ChairoSans", color: "#075985" }}>Hazır</Text>
                        </TouchableOpacity>
                    ) : null}
                    {order.status === "ready" ? (
                        <TouchableOpacity
                            onPress={() => mutateStatus(orderId, "out_for_delivery")}
                            style={{
                                paddingVertical: theme.spacing.xs,
                                paddingHorizontal: theme.spacing.md,
                                borderRadius: theme.radius.lg,
                                backgroundColor: "#DCFCE7",
                            }}
                        >
                            <Text style={{ fontFamily: "ChairoSans", color: "#166534" }}>Kurye aldı</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        );
    };

    const renderSection = (title: string, list: any[]) => (
        <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={{ fontFamily: "ChairoSans", fontSize: 18, color: theme.colors.ink, marginBottom: 6 }}>{title}</Text>
            {list.length ? list.map(renderOrderCard) : <Text style={{ color: theme.colors.muted }}>Sipariş yok</Text>}
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }}>
                <Text style={{ fontFamily: "ChairoSans", fontSize: 22, color: theme.colors.ink, marginBottom: theme.spacing.md }}>
                    Sipariş Kuyruğu
                </Text>
                {!restaurantId ? (
                    <Text style={{ color: theme.colors.muted }}>Giriş yapmanız gerekiyor.</Text>
                ) : loading ? (
                    <ActivityIndicator color={theme.colors.primary} />
                ) : (
                    <>
                        {renderSection("Bekleyen", grouped.pending)}
                        {renderSection("Hazırlanıyor", grouped.active)}
                        {renderSection("Hazır", grouped.ready)}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
