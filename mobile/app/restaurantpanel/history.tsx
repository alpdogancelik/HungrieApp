import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useEffect, useState } from "react";

import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { subscribeRestaurantPastOrders } from "@/src/services/firebaseOrders";

const RestaurantHistory = () => {
    const { isAuthenticated } = useAuthStore();
    const [orders, setOrders] = useState<any[]>([]);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (!isAuthenticated) return;
            const restId = await getOwnedRestaurantId();
            if (!mounted) return;
            setRestaurantId(restId);
        };
        load();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!restaurantId) return;
        const unsub = subscribeRestaurantPastOrders(restaurantId, (list) => {
            setOrders(
                list.map((o) => ({
                    id: o.id,
                    customer: o.customerName || o.customer?.name || "Customer",
                    total: o.total || 0,
                    status: o.status || "delivered",
                    time: o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : "",
                    paymentMethod: o.paymentMethod || "N/A",
                })),
            );
        });
        return () => unsub?.();
    }, [restaurantId]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>Past Orders</Text>
                <Text style={styles.subtitle}>Review completed and rejected orders.</Text>

                <View style={styles.list}>
                    {orders.map((order) => (
                        <View key={order.id} style={styles.card}>
                            <View style={styles.row}>
                                <Text style={styles.customer}>{order.customer}</Text>
                                <Text style={styles.total}>TRY {Number(order.total || 0).toFixed(2)}</Text>
                            </View>
                            <View style={styles.row}>
                                <View style={[styles.statusPill, styles.statusDelivered]}>
                                    <Text style={[styles.statusText, styles.statusDeliveredText]}>
                                        {order.status}
                                    </Text>
                                </View>
                                <Text style={styles.meta}>{order.time}</Text>
                            </View>
                            <Text style={styles.meta}>Payment: {order.paymentMethod}</Text>
                        </View>
                    ))}
                    {!orders.length ? <Text style={styles.meta}>No past orders yet.</Text> : null}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#FFF6EC", padding: 16 },
    container: { paddingBottom: 40, gap: 12 },
    title: { fontFamily: "ChairoSans", fontSize: 22, color: "#0F172A", letterSpacing: -0.2 },
    subtitle: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    list: { gap: 10, marginTop: 8 },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "#E2E8F0",
        padding: 12,
        gap: 6,
    },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    customer: { fontFamily: "ChairoSans", fontSize: 15, color: "#0F172A" },
    total: { fontFamily: "ChairoSans", fontSize: 15, color: "#0F172A" },
    meta: { fontFamily: "ChairoSans", fontSize: 12, color: "#475569" },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    statusDelivered: { backgroundColor: "#E0E7FF" },
    statusDeliveredText: { color: "#4338CA" },
    statusText: { fontFamily: "ChairoSans", fontSize: 12, textTransform: "capitalize" },
});

export default RestaurantHistory;
