import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { subscribeRestaurantOrders, transitionOrder, subscribeRestaurantPastOrders } from "@/src/services/firebaseOrders";

type PanelOrderItem = { name?: string; quantity?: number; price?: number };
type PanelOrder = {
    id: string;
    customer: string;
    items: PanelOrderItem[];
    status: string;
    time?: string;
    whatsapp?: string;
    address?: string;
    paymentMethod?: string;
    total?: number;
};

const RestaurantPanel = () => {
    const router = useRouter();
    const { isAuthenticated } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [restaurantName, setRestaurantName] = useState<string | null>(null);
    const [orders, setOrders] = useState<PanelOrder[]>([]);
    const [pastOrders, setPastOrders] = useState<PanelOrder[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "canceled" | "delivered">("all");
    const [searchTerm, setSearchTerm] = useState("");
    const updateOrderStatus = (orderId: string, status: "pending" | "accepted" | "canceled" | "delivered") => {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        transitionOrder(orderId, status).catch(() => null);
    };

    useEffect(() => {
        let mounted = true;
        const verify = async () => {
            if (!isAuthenticated) {
                router.replace("/sign-in");
                return;
            }
            const restId = await getOwnedRestaurantId();
            if (!mounted) return;
            if (restId) {
                setAuthorized(true);
                setRestaurantId(restId);
                setRestaurantName(restId);
            } else {
                router.replace("/");
            }
            setLoading(false);
        };
        verify();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated, router]);

    useEffect(() => {
        if (!restaurantId) return;
        const formatOrders = (list: any[]): PanelOrder[] =>
            list.map((o) => ({
                id: o.id,
                customer: o.customerName || o.customer?.name || "Customer",
                items: o.items || o.orderItems || [],
                status: o.status || "pending",
                time: o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : "Just now",
                whatsapp: o.customerWhatsapp || o.customer?.whatsappNumber || "",
                address: o.deliveryAddressText || o.address || "",
                paymentMethod: o.paymentMethod || "N/A",
                total: o.total || 0,
            }));

        const unsubActive = subscribeRestaurantOrders(restaurantId, ["pending", "accepted"], (list) => {
            setOrders(formatOrders(list));
        });
        const unsubPast = subscribeRestaurantPastOrders(restaurantId, (list) => {
            setPastOrders(formatOrders(list));
        });
        return () => {
            unsubActive?.();
            unsubPast?.();
        };
    }, [restaurantId]);

    if (loading || !authorized) return null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.kicker}>Restaurant Hub</Text>
                        <Text style={styles.title}>Welcome back{restaurantName ? `, ${restaurantName}` : ""}</Text>
                        <Text style={styles.subtitle}>Manage orders, menus, and settings in one place.</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Orders</Text>
                    <View style={styles.card}>
                    <Text style={styles.cardTitle}>Active orders</Text>
                    <Text style={styles.cardSubtitle}>Review and Accept / Reject pending orders.</Text>
                    <View style={styles.filterRow}>
                        {(["all", "pending", "accepted", "canceled"] as const).map((status) => {
                            const active = statusFilter === status;
                            return (
                                <TouchableOpacity
                                    key={status}
                                    style={[styles.filterPill, active ? styles.filterPillActive : null]}
                                    onPress={() => setStatusFilter(status)}
                                >
                                    <Text style={[styles.filterLabel, active ? styles.filterLabelActive : null]}>
                                        {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                        <View style={styles.searchRow}>
                            <TextInput
                                placeholder="Search by customer name"
                                value={searchTerm}
                                onChangeText={setSearchTerm}
                                style={styles.searchInput}
                                placeholderTextColor="#94A3B8"
                            />
                        </View>
                        <View style={styles.orderList}>
                            {orders
                                .filter((o) => statusFilter === "all" || o.status === statusFilter)
                                .filter((o) => o.customer.toLowerCase().includes(searchTerm.trim().toLowerCase()))
                                .map((order) => (
                            <TouchableOpacity
                                key={order.id}
                                style={styles.orderCard}
                                activeOpacity={0.95}
                                onPress={() => setSelectedOrderId((prev) => (prev === order.id ? null : order.id))}
                                >
                                    <View style={styles.orderHeader}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.orderTitle}>{order.customer}</Text>
                                        </View>
                                        <View style={styles.orderHeaderRight}>
                                            <View
                                                style={[
                                                    styles.statusPill,
                                                    order.status === "pending"
                                                        ? styles.statusPending
                                                        : order.status === "accepted"
                                                        ? styles.statusAccepted
                                                        : order.status === "canceled"
                                                        ? styles.statusCanceled
                                                        : order.status === "rejected"
                                                        ? styles.statusRejected
                                                        : styles.statusDelivered,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.orderStatus,
                                                        order.status === "pending"
                                                            ? styles.statusPendingText
                                                            : order.status === "accepted"
                                                            ? styles.statusAcceptedText
                                                            : order.status === "canceled"
                                                            ? styles.statusCanceledText
                                                            : order.status === "rejected"
                                                            ? styles.statusRejectedText
                                                            : styles.statusDeliveredText,
                                                    ]}
                                                >
                                                    {order.status}
                                                </Text>
                                            </View>
                                            <Text style={styles.orderTotal}>TRY {Number(order.total || 0).toFixed(2)}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.orderMeta}>{order.time}</Text>
                                    {order.whatsapp ? (
                                        <Text style={styles.orderMeta}>WhatsApp: {order.whatsapp}</Text>
                                    ) : null}
                                    {order.address ? (
                                        <Text style={styles.orderMeta}>Address: {order.address}</Text>
                                    ) : null}
                                    <Text style={styles.orderItemsLabel}>Items</Text>
                                    <View style={styles.orderItemsTable}>
                                        {Array.isArray(order.items) &&
                                            order.items.map((item: PanelOrderItem, idx: number) => (
                                                <View key={`${order.id}-item-${idx}`} style={styles.orderItemRow}>
                                                    <Text style={styles.orderItemQty}>{item.quantity}x</Text>
                                                    <Text style={styles.orderItemName} numberOfLines={1}>
                                                        {item.name}
                                                    </Text>
                                                    <Text style={styles.orderItemPrice}>
                                                        TRY {(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}
                                                    </Text>
                                                </View>
                                            ))}
                                    </View>

                                    {selectedOrderId === order.id ? (
                                        <View style={styles.orderDetails}>
                                            <Text style={styles.orderDetailsLabel}>
                                                Payment method: {order.paymentMethod || "N/A"}
                                            </Text>
                                        </View>
                                    ) : null}
                                    <View style={[styles.orderActionsInline, { justifyContent: "space-between" }]}>
                                        {order.status === "pending" ? (
                                            <>
                                                <TouchableOpacity
                                                    style={[styles.acceptPill, { flex: 1 }]}
                                                    onPress={() => updateOrderStatus(order.id, "accepted")}
                                                >
                                                    <Text style={styles.acceptLabel}>Accept</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.rejectPill, { flex: 1 }]}
                                                    onPress={() => updateOrderStatus(order.id, "canceled")}
                                                >
                                                    <Text style={styles.rejectLabel}>Reject</Text>
                                                </TouchableOpacity>
                                            </>
                                        ) : order.status === "accepted" ? (
                                            <>
                                                <TouchableOpacity
                                                    style={[styles.courierPill, { flex: 1 }]}
                                                    onPress={() => updateOrderStatus(order.id, "accepted")}
                                                >
                                                    <Text style={styles.courierLabel}>Courier given</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.deliveredPill, { flex: 1 }]}
                                                    onPress={() => updateOrderStatus(order.id, "delivered")}
                                                >
                                                    <Text style={styles.deliveredLabel}>Delivered</Text>
                                                </TouchableOpacity>
                                            </>
                                        ) : null}
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.ctaButton, styles.outlineButton]}
                        onPress={() => router.push("/restaurantpanel/history")}
                    >
                        <Text style={styles.outlineLabel}>View past orders</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Restaurant</Text>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Menu & Categories</Text>
                        <Text style={styles.cardSubtitle}>Edit menu items, visibility, pricing, and categories.</Text>
                        <TouchableOpacity
                            style={[styles.ctaButton, styles.outlineButton]}
                            onPress={() => router.push("/restaurantpanel/menu")}
                        >
                            <Text style={styles.outlineLabel}>Manage menu</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Restaurant details</Text>
                        <Text style={styles.cardSubtitle}>Update name, phone, hours, and address.</Text>
                        <TouchableOpacity
                            style={[styles.ctaButton, styles.outlineButton]}
                            onPress={() => router.push("/restaurantpanel/details")}
                        >
                            <Text style={styles.outlineLabel}>Edit details</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.signOutButton} onPress={() => router.replace("/sign-in")}>
                        <Text style={styles.signOutLabel}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#FFF6EC", padding: 16 },
    scrollContent: { padding: 16, paddingBottom: 80, gap: 16 },
    header: { gap: 6 },
    kicker: { fontFamily: "ChairoSans", fontSize: 12, color: "#FE8C00", letterSpacing: 0.8 },
    title: { fontFamily: "ChairoSans", fontSize: 24, color: "#0F172A", letterSpacing: -0.2 },
    subtitle: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    section: { gap: 8, marginBottom: 16 },
    sectionTitle: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    card: {
        backgroundColor: "rgba(255,255,255,0.92)",
        borderRadius: 16,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "#E2E8F0",
        gap: 8,
    },
    cardTitle: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    cardSubtitle: { fontFamily: "ChairoSans", fontSize: 13, color: "#64748B", lineHeight: 18 },
    ctaButton: {
        marginTop: 6,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryButton: { backgroundColor: "#FE8C00" },
    primaryLabel: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 14 },
    outlineButton: { borderWidth: 1, borderColor: "#FE8C00", backgroundColor: "rgba(254,140,0,0.08)" },
    outlineLabel: { color: "#C2410C", fontFamily: "ChairoSans", fontSize: 14 },
    secondaryButton: { borderWidth: 1, borderColor: "#E11D48", backgroundColor: "rgba(225,29,72,0.08)" },
    secondaryLabel: { color: "#9F1239", fontFamily: "ChairoSans", fontSize: 14 },
    linkButton: { paddingVertical: 8 },
    linkLabel: { color: "#0F75F3", fontFamily: "ChairoSans", fontSize: 14 },
    footer: { marginTop: "auto", gap: 6 },
    signOutButton: {
        backgroundColor: "#0F172A",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    signOutLabel: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 15 },
    filterRow: { flexDirection: "row", gap: 8, marginTop: 6 },
    filterPill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
    },
    filterPillActive: { borderColor: "#FE8C00", backgroundColor: "rgba(254,140,0,0.12)" },
    filterLabel: { fontFamily: "ChairoSans", fontSize: 13, color: "#475569" },
    filterLabelActive: { color: "#FE8C00" },
    searchRow: { marginTop: 8 },
    searchInput: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: "ChairoSans",
        color: "#0F172A",
    },
    orderList: { gap: 8, marginTop: 8 },
    orderCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "#E2E8F0",
        padding: 10,
        gap: 6,
    },
    orderHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 4 },
    orderTitle: { fontFamily: "ChairoSans", fontSize: 15, color: "#0F172A" },
    orderHeaderRight: { alignItems: "flex-end", gap: 6 },
    orderTotal: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    orderStatus: { fontFamily: "ChairoSans", fontSize: 13, textTransform: "capitalize" },
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignItems: "center",
        minWidth: 70,
    },
    statusPending: { backgroundColor: "#FFF4D5" },
    statusPendingText: { color: "#E7A700" },
    statusAccepted: { backgroundColor: "#DCFCE7" },
    statusAcceptedText: { color: "#15803D" },
    statusCanceled: { backgroundColor: "#FEE2E2" },
    statusCanceledText: { color: "#B91C1C" },
    statusRejected: { backgroundColor: "#FEE2E2" },
    statusRejectedText: { color: "#B91C1C" },
    statusDelivered: { backgroundColor: "#E0E7FF" },
    statusDeliveredText: { color: "#4338CA" },
    orderMeta: { fontFamily: "ChairoSans", fontSize: 12, color: "#0F172A", marginTop: 2 },
    orderItemsLabel: { fontFamily: "ChairoSans", fontSize: 13, color: "#0F172A", marginTop: 6 },
    orderItemsTable: { gap: 4, marginTop: 2 },
    orderItemRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingVertical: 1,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E2E8F0",
    },
    orderItemQty: { fontFamily: "ChairoSans", fontSize: 13, color: "#0F172A", width: 30 },
    orderItemName: { fontFamily: "ChairoSans", fontSize: 13, color: "#334155", flex: 1 },
    orderItemPrice: { fontFamily: "ChairoSans", fontSize: 13, color: "#0F172A" },
    orderDetails: { marginTop: 6 },
    orderDetailsLabel: { fontFamily: "ChairoSans", fontSize: 13, color: "#0F172A" },
    orderActionsInline: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 },
    acceptPill: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: "rgba(16,185,129,0.14)",
        borderWidth: 1,
        borderColor: "rgba(16,185,129,0.35)",
    },
    acceptLabel: { color: "#065F46", fontFamily: "ChairoSans", fontSize: 14, textAlign: "center" },
    rejectPill: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: "rgba(225,29,72,0.12)",
        borderWidth: 1,
        borderColor: "rgba(225,29,72,0.30)",
    },
    rejectLabel: { color: "#9F1239", fontFamily: "ChairoSans", fontSize: 14, textAlign: "center" },
    courierPill: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: "rgba(14,165,233,0.14)",
        borderWidth: 1,
        borderColor: "rgba(14,165,233,0.32)",
    },
    courierLabel: { color: "#075985", fontFamily: "ChairoSans", fontSize: 14, textAlign: "center" },
    deliveredPill: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: "rgba(99,102,241,0.14)",
        borderWidth: 1,
        borderColor: "rgba(99,102,241,0.30)",
    },
    deliveredLabel: { color: "#4338CA", fontFamily: "ChairoSans", fontSize: 14, textAlign: "center" },
});

export default RestaurantPanel;
