import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { assignCourier, listenToOrders, updateOrderStatus } from "@/lib/firebaseAuth";

const COURIER_LABELS = ["Courier1", "Courier2", "Courier3", "Courier4"];

const CourierAssignmentScreen = () => {
    const { restaurantId } = useLocalSearchParams<{ restaurantId?: string }>();
    const resolvedRestaurantId = restaurantId ? String(restaurantId) : "ada-pizza";
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [listenerToken, setListenerToken] = useState(0);

    useEffect(() => {
        const unsubscribe = listenToOrders(
            { restaurantId: resolvedRestaurantId, statuses: ["preparing", "ready"] },
            (incoming) => {
                setOrders(Array.isArray(incoming) ? incoming : []);
                setLoading(false);
                setError(null);
            },
            (err) => {
                setError(err?.message || "Unable to load courier queue.");
                setLoading(false);
            },
        );
        return unsubscribe;
    }, [resolvedRestaurantId, listenerToken]);

    const handleAssign = useCallback(async (orderId: string, courierLabel: string, currentStatus?: string) => {
        setAssigningOrderId(orderId);
        try {
            await assignCourier(orderId, courierLabel, currentStatus);
            Alert.alert("Assigned", `${courierLabel} is now handling order #${orderId.slice(-6)}.`);
        } catch (err: any) {
            Alert.alert("Assignment failed", err?.message || "Please try again.");
        } finally {
            setAssigningOrderId(null);
        }
    }, []);

    const handleDelivered = useCallback(async (orderId: string) => {
        setAssigningOrderId(orderId);
        try {
            await updateOrderStatus(orderId, "delivered");
            Alert.alert("Delivered", "Thanks for confirming delivery.");
        } catch (err: any) {
            Alert.alert("Unable to update", err?.message || "Please try again.");
        } finally {
            setAssigningOrderId(null);
        }
    }, []);

    const visibleOrders = useMemo(
        () =>
            orders.filter((order) => {
                const status = String(order.status || "").toLowerCase();
                return status === "preparing" || status === "ready";
            }),
        [orders],
    );

    const isAssigning = (orderId: string) => assigningOrderId === orderId;

    const renderOrderCard = (order: any) => {
        const orderId = String(order.id ?? order.orderId ?? Date.now());
        const customerName = order.customerName || order.customer?.name || "Customer";
        const customerWhatsapp = order.customerWhatsapp || order.customer?.whatsappNumber || order.customer?.whatsapp;
        const assignedLabel = order.courierLabel;

        return (
            <View key={orderId} className="rounded-3xl border border-gray-100 bg-white p-4 gap-3">
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="text-xs uppercase tracking-[3px] text-dark-60">Order</Text>
                        <Text className="text-xl font-ezra-bold text-dark-100">#{orderId.slice(-6)}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-xs uppercase tracking-[3px] text-dark-60">Customer</Text>
                        <Text className="text-base font-ezra-semibold text-dark-100">{customerName}</Text>
                        {customerWhatsapp ? (
                            <Text className="text-sm text-dark-60">WhatsApp: {customerWhatsapp}</Text>
                        ) : null}
                    </View>
                </View>

                <View className="flex-row flex-wrap gap-2">
                    {COURIER_LABELS.map((label) => {
                        const active = assignedLabel === label;
                        return (
                            <TouchableOpacity
                                key={`${orderId}-${label}`}
                                onPress={() => handleAssign(orderId, label, order.status)}
                                disabled={isAssigning(orderId)}
                                className={`rounded-full border px-4 py-2 ${
                                    active ? "bg-dark-100 border-dark-100" : "bg-white border-gray-200"
                                } ${isAssigning(orderId) ? "opacity-60" : "opacity-100"}`}
                            >
                                <Text
                                    className={`text-sm font-ezra-semibold ${
                                        active ? "text-white" : "text-dark-80"
                                    }`}
                                >
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {assignedLabel && (
                    <View className="flex-row items-center justify-between pt-2">
                        <Text className="text-sm text-dark-60">Assigned to {assignedLabel}</Text>
                        <TouchableOpacity
                            onPress={() => handleDelivered(orderId)}
                            disabled={isAssigning(orderId)}
                            className="rounded-full bg-primary-dark px-4 py-2"
                        >
                            <Text className="text-sm font-ezra-semibold text-white">Mark delivered</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                <View className="gap-1">
                    <Text className="text-3xl font-ezra-bold text-dark-100">Courier queue</Text>
                    <Text className="text-base text-dark-60">
                        Claim preparing orders and close them out when delivered.
                    </Text>
                </View>

                <View className="rounded-3xl border border-gray-100 bg-white/90 p-4">
                    <Text className="text-xs uppercase tracking-[3px] text-dark-60">Restaurant</Text>
                    <Text className="text-2xl font-ezra-bold text-dark-100">#{resolvedRestaurantId}</Text>
                </View>

                {loading ? (
                    <View className="items-center justify-center py-12">
                        <ActivityIndicator size="large" color="#FE8C00" />
                        <Text className="mt-3 text-dark-60">Loading active orders…</Text>
                    </View>
                ) : error ? (
                    <View className="rounded-3xl border border-error/40 bg-error/10 p-4">
                        <Text className="text-base font-ezra-semibold text-error">{error}</Text>
                        <TouchableOpacity
                            className="mt-3 self-start rounded-full bg-error px-4 py-2"
                            onPress={() => setListenerToken((token) => token + 1)}
                        >
                            <Text className="text-sm font-ezra-semibold text-white">Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : visibleOrders.length === 0 ? (
                    <View className="rounded-3xl border border-dashed border-gray-200 bg-white/80 p-6 items-center">
                        <Text className="text-xl font-ezra-semibold text-dark-80">No active pickups</Text>
                        <Text className="mt-2 text-center text-dark-60">
                            Orders appear here when the kitchen moves them to preparing.
                        </Text>
                    </View>
                ) : (
                    visibleOrders.map(renderOrderCard)
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default CourierAssignmentScreen;

