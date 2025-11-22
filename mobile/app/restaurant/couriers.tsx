import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import useServerResource from "@/lib/useServerResource";
import {
    getCourierRoster,
    getOwnerRestaurants,
    getRestaurantOrders,
    updateOrderStatus,
} from "@/lib/api";

const parsePrice = (value: any) => {
    if (value === null || value === undefined) return 0;
    const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatTry = (amount: number) => `TRY ${amount.toFixed(2)}`;

const routeFocusOptions = [
    { id: "campus", label: "Campus loop" },
    { id: "city", label: "City center" },
    { id: "late", label: "Late night" },
];

const shiftTemplate = [
    { id: "early", window: "09:00 - 13:00", focus: "Dorm drop-offs", slots: 2 },
    { id: "mid", window: "13:00 - 17:00", focus: "Campus loop", slots: 1 },
    { id: "late", window: "17:00 - 23:30", focus: "Night bites", slots: 3 },
];

const CourierControl = () => {
    const { data: couriers, loading: couriersLoading, refetch: refetchCouriers } = useServerResource({ fn: getCourierRoster });
    const { data: ownerRestaurants } = useServerResource({ fn: getOwnerRestaurants, skipAlert: true });
    const [activeRestaurantId, setActiveRestaurantId] = useState<number | null>(null);

    const fetchOrders = useCallback(async (restaurantId?: number | null) => {
        if (!restaurantId) return [];
        return getRestaurantOrders(restaurantId);
    }, []);

    const {
        data: fetchedOrders,
        loading: ordersLoading,
        refetch: refetchOrders,
    } = useServerResource<any[], number>({
        fn: fetchOrders,
        immediate: false,
        skipAlert: true,
    });

    const [localOrders, setLocalOrders] = useState<any[]>([]);
    const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
    const [handoverOrderId, setHandoverOrderId] = useState<number | null>(null);
    const [handoverNotes, setHandoverNotes] = useState("Route via dorm loading bay");
    const [routeFocus, setRouteFocus] = useState("campus");
    const [panelMessage, setPanelMessage] = useState<string | null>(null);

    useEffect(() => {
        if (ownerRestaurants?.length && !activeRestaurantId) {
            setActiveRestaurantId(ownerRestaurants[0].id);
        }
    }, [ownerRestaurants, activeRestaurantId]);

    useEffect(() => {
        if (activeRestaurantId) {
            refetchOrders(activeRestaurantId);
        }
    }, [activeRestaurantId, refetchOrders]);

    useEffect(() => {
        if (Array.isArray(fetchedOrders)) {
            setLocalOrders(fetchedOrders);
        }
    }, [fetchedOrders]);

    useEffect(() => {
        if (!selectedCourierId && couriers?.length) {
            setSelectedCourierId(couriers[0].id);
        }
    }, [couriers, selectedCourierId]);

    useEffect(() => {
        const ready = localOrders.filter((order) => order.status === "ready");
        if (!handoverOrderId && ready.length) {
            setHandoverOrderId(ready[0].id);
        }
    }, [localOrders, handoverOrderId]);

    const readyOrders = useMemo(() => localOrders.filter((order) => order.status === "ready"), [localOrders]);
    const onRouteOrders = useMemo(() => localOrders.filter((order) => order.status === "out_for_delivery"), [localOrders]);
    const deliveredOrders = useMemo(() => localOrders.filter((order) => order.status === "delivered"), [localOrders]);

    const courierStats = useMemo(() => {
        const total = couriers?.length ?? 0;
        const delivering = (couriers || []).filter((courier: any) => courier.status?.toLowerCase().includes("deliver")).length;
        const available = (couriers || []).filter((courier: any) => courier.status?.toLowerCase().includes("avail")).length;
        const standby = Math.max(0, total - delivering - available);
        return { total, delivering, available, standby };
    }, [couriers]);

    const alerts = useMemo(() => {
        const feed: string[] = [];
        if (readyOrders.length > 2) feed.push("Kitchen has trays waiting. Dispatch now.");
        if (!onRouteOrders.length) feed.push("No couriers currently on road. Activate a rider.");
        feed.push(`Delivered today: ${deliveredOrders.length}`);
        return feed;
    }, [readyOrders.length, onRouteOrders.length, deliveredOrders.length]);

    const selectedCourier = couriers?.find((courier: any) => courier.id === selectedCourierId) || null;
    const selectedOrder = localOrders.find((order) => order.id === handoverOrderId) || null;

    const syncOrders = () => {
        if (activeRestaurantId) {
            refetchOrders(activeRestaurantId);
        }
    };

    const mutateOrderStatus = async (orderId: number, status: string) => {
        try {
            await updateOrderStatus(orderId, status);
            setLocalOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status } : order)));
            syncOrders();
        } catch (error: any) {
            Alert.alert("Update failed", error?.message || "Unable to update order status right now.");
        }
    };

    const handleHandover = async () => {
        if (!selectedCourierId || !handoverOrderId) {
            Alert.alert("Select courier", "Choose a courier and a ready order before dispatching.");
            return;
        }
        await mutateOrderStatus(handoverOrderId, "out_for_delivery");
        setPanelMessage(`Order #${handoverOrderId} left with ${selectedCourier?.name || "courier"}.`);
        setHandoverNotes("Route via dorm loading bay");
        setHandoverOrderId(null);
    };

    const handleDelivered = async (orderId: number) => {
        await mutateOrderStatus(orderId, "delivered");
        setPanelMessage(`Order #${orderId} marked delivered.`);
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
                <View className="px-5 pt-6 gap-6">
                    <View className="flex-row items-center justify-between gap-4">
                        <View className="flex-1">
                            <Text className="h3-bold text-dark-100">Courier mission control</Text>
                            <Text className="body-medium text-dark-60">Balance pickups, rider energy, and arrival promises.</Text>
                        </View>
                        <TouchableOpacity className="chip" onPress={() => router.back()}>
                            <Text className="paragraph-semibold text-primary-dark">Back to console</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="secondary-card gap-4">
                        <View className="flex-row items-center justify-between">
                            <Text className="section-title">Shift pulse</Text>
                            <TouchableOpacity className="chip" onPress={() => { refetchCouriers(); syncOrders(); }}>
                                <Text className="paragraph-semibold text-primary-dark">Refresh</Text>
                            </TouchableOpacity>
                        </View>
                        <View className="flex-row flex-wrap gap-3">
                            {[
                                { label: "On duty", value: courierStats.total },
                                { label: "Delivering", value: courierStats.delivering },
                                { label: "Available", value: courierStats.available },
                                { label: "Waiting trays", value: readyOrders.length },
                            ].map((metric) => (
                                <View key={metric.label} className="flex-1 min-w-[45%] p-3 rounded-2xl border border-gray-100 bg-white">
                                    <Text className="text-2xl font-ezra-bold text-dark-100">{metric.value}</Text>
                                    <Text className="body-medium text-dark-60">{metric.label}</Text>
                                </View>
                            ))}
                        </View>
                        {panelMessage && (
                            <View className="info-chip bg-primary/10 border-transparent">
                                <Text className="body-medium text-primary-dark">{panelMessage}</Text>
                            </View>
                        )}
                        <View className="flex-row flex-wrap gap-2">
                            {routeFocusOptions.map((option) => (
                                <TouchableOpacity
                                    key={option.id}
                                    className={`px-4 py-2 rounded-full border ${routeFocus === option.id ? "border-primary bg-primary/10" : "border-gray-100"}`}
                                    onPress={() => setRouteFocus(option.id)}
                                >
                                    <Text className={`paragraph-semibold ${routeFocus === option.id ? "text-primary-dark" : "text-dark-80"}`}>{option.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View className="secondary-card gap-4">
                        <View className="flex-row items-center justify-between">
                            <Text className="section-title">Dispatch board</Text>
                            {ordersLoading && <ActivityIndicator color="#FF8C42" />}
                        </View>
                        <Text className="body-medium text-dark-60">Lock in who is taking the next basket and what they must remember.</Text>
                        <View className="gap-3">
                            <Text className="paragraph-semibold text-dark-100">Couriers</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {(couriers || []).map((courier: any) => (
                                    <TouchableOpacity
                                        key={courier.id}
                                        className={`px-4 py-3 rounded-2xl border ${selectedCourierId === courier.id ? "border-primary bg-primary/10" : "border-gray-100"}`}
                                        onPress={() => setSelectedCourierId(courier.id)}
                                    >
                                        <Text className="paragraph-semibold text-dark-100">{courier.name}</Text>
                                        <Text className="body-medium text-dark-60">{courier.vehicle}</Text>
                                        <Text className="body-medium text-primary-dark mt-1">{courier.status}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View className="gap-3">
                            <Text className="paragraph-semibold text-dark-100">Ready trays</Text>
                            {readyOrders.length ? (
                                <View className="flex-row flex-wrap gap-2">
                                    {readyOrders.map((order) => (
                                        <TouchableOpacity
                                            key={order.id}
                                            className={`px-4 py-2 rounded-full border ${handoverOrderId === order.id ? "border-primary bg-primary/10" : "border-gray-100"}`}
                                            onPress={() => setHandoverOrderId(order.id)}
                                        >
                                            <Text className="paragraph-semibold text-dark-100">#{order.id}</Text>
                                            <Text className="body-medium text-dark-60">{order.customerName}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : (
                                <Text className="body-medium text-dark-60">Kitchen has no pending pickups.</Text>
                            )}
                        </View>
                        <View>
                            <Text className="paragraph-semibold text-dark-100 mb-2">Handover notes</Text>
                            <TextInput
                                className="border border-gray-100 rounded-2xl px-4 py-3 text-dark-100"
                                value={handoverNotes}
                                onChangeText={setHandoverNotes}
                                placeholder="Mention gate codes, dietary flags, or weather calls"
                                placeholderTextColor="#94A3B8"
                                multiline
                            />
                        </View>
                        {selectedOrder && (
                            <View className="p-3 rounded-2xl border border-gray-100 bg-gray-50/60">
                                <Text className="paragraph-semibold text-dark-100">Next up — #{selectedOrder.id}</Text>
                                <Text className="body-medium text-dark-60">{selectedOrder.customerName} • {selectedOrder.address}</Text>
                                <Text className="body-medium text-dark-60">{formatTry(parsePrice(selectedOrder.total))} • {selectedOrder.paymentMethod}</Text>
                            </View>
                        )}
                        <TouchableOpacity className="hero-cta items-center" onPress={handleHandover}>
                            <Text className="text-white">Launch courier</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="secondary-card gap-4">
                        <View className="flex-row items-center justify-between">
                            <Text className="section-title">Active delivery queue</Text>
                            <Text className="body-medium text-dark-60">{onRouteOrders.length} on the road</Text>
                        </View>
                        {[...readyOrders, ...onRouteOrders].map((order) => (
                            <View key={order.id} className="p-3 border border-gray-100 rounded-2xl gap-2">
                                <View className="flex-row items-center justify-between">
                                    <Text className="paragraph-semibold text-dark-100">#{order.id} • {order.customerName}</Text>
                                    <View className="info-chip bg-primary/10 border-transparent">
                                        <Text className="body-medium text-primary-dark">{order.status}</Text>
                                    </View>
                                </View>
                                <Text className="body-medium text-dark-60">{order.address}</Text>
                                <Text className="body-medium text-dark-60">{formatTry(parsePrice(order.total))}</Text>
                                <View className="flex-row gap-2 mt-2">
                                    {order.status === "ready" && (
                                        <TouchableOpacity className="chip" onPress={() => { setHandoverOrderId(order.id); }}>
                                            <Text className="paragraph-semibold text-primary-dark">Assign now</Text>
                                        </TouchableOpacity>
                                    )}
                                    {order.status === "out_for_delivery" && (
                                        <TouchableOpacity className="chip bg-primary" onPress={() => handleDelivered(order.id)}>
                                            <Text className="paragraph-semibold text-white">Mark delivered</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))}
                    </View>

                    <View className="secondary-card gap-4">
                        <Text className="section-title">Courier lineup</Text>
                        <View className="flex-row flex-wrap gap-3">
                            {(couriers || []).map((courier: any) => (
                                <View key={courier.id} className="basis-[48%] p-3 border border-gray-100 rounded-2xl bg-white">
                                    <Text className="paragraph-semibold text-dark-100">{courier.name}</Text>
                                    <Text className="body-medium text-dark-60">{courier.vehicle}</Text>
                                    <Text className="body-medium text-primary-dark mt-1">{courier.status}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View className="secondary-card gap-4">
                        <Text className="section-title">Shift planner</Text>
                        <View className="gap-3">
                            {shiftTemplate.map((slot) => (
                                <View key={slot.id} className="p-3 border border-gray-100 rounded-2xl flex-row items-center justify-between">
                                    <View>
                                        <Text className="paragraph-semibold text-dark-100">{slot.window}</Text>
                                        <Text className="body-medium text-dark-60">{slot.focus}</Text>
                                    </View>
                                    <View className="info-chip bg-primary/10 border-transparent">
                                        <Text className="body-medium text-primary-dark">{slot.slots} slots</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View className="secondary-card gap-4">
                        <Text className="section-title">Alert feed</Text>
                        {alerts.map((alert) => (
                            <View key={alert} className="p-3 border border-gray-100 rounded-2xl bg-gray-50/60">
                                <Text className="paragraph-semibold text-dark-100">{alert}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default CourierControl;

