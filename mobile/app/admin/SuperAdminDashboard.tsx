import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { firebaseOrdersEnabled, listenToOrders, updateOrderStatus } from "@/lib/firebaseAuth";
import MenuEditor from "./MenuEditor";

type AdminOrder = {
    id: string;
    customerName: string;
    customerEmail?: string;
    customerWhatsapp?: string | null;
    restaurantName?: string;
    totalPrice: number;
    status: string;
    createdAt?: number;
    courierLabel?: string | null;
};

const STATUS_OPTIONS = ["pending approval", "preparing", "ready", "delivered"];

const STATUS_BADGE_CLASS: Record<string, string> = {
    "pending approval": "bg-amber-100 text-amber-900 border-amber-200",
    preparing: "bg-violet-100 text-violet-900 border-violet-200",
    ready: "bg-sky-100 text-sky-900 border-sky-200",
    delivered: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

const formatCurrency = (value?: number | string) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const humanizeStatus = (value: string) =>
    value
        .split(" ")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");

const extractMillis = (input: any): number | undefined => {
    if (!input) return undefined;
    if (typeof input?.toDate === "function") return input.toDate()?.getTime?.();
    if (typeof input === "number") return input;
    if (typeof input === "string") {
        const parsed = Date.parse(input);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};

const mapAdminOrder = (order: any): AdminOrder => {
    const customer = order.customer || {};
    const restaurant = order.restaurant || {};
    const status = String(order.status || "pending approval").toLowerCase();
    const totalRaw = order.totalPrice ?? order.total ?? order.amount ?? 0;

    return {
        id: String(order.id ?? order.orderId ?? order.$id ?? Date.now()),
        customerName: order.customerName || customer.name || "Walk-in customer",
        customerEmail: order.customerEmail || customer.email,
        customerWhatsapp: order.customerWhatsapp || customer.whatsappNumber || customer.whatsapp || order.whatsappNumber || null,
        restaurantName: order.restaurantName || restaurant.name,
        totalPrice: Number.isNaN(Number(totalRaw)) ? 0 : Number(totalRaw),
        status,
        courierLabel: order.courierLabel ?? null,
        createdAt: extractMillis(order.createdAt ?? order.updatedAt),
    };
};

const SuperAdminDashboard = () => {
    const [orders, setOrders] = useState<AdminOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [listenerToken, setListenerToken] = useState(0);

    useEffect(() => {
        const unsubscribe = listenToOrders(
            {},
            (incoming) => {
                const parsed = (incoming || []).map(mapAdminOrder).sort((a, b) => {
                    const first = a.createdAt ?? 0;
                    const second = b.createdAt ?? 0;
                    return second - first;
                });
                setOrders(parsed);
                setErrorMessage(undefined);
                setLoading(false);
                setRefreshing(false);
            },
            (error) => {
                setErrorMessage(error?.message || "Unable to fetch orders right now.");
                setLoading(false);
                setRefreshing(false);
            },
        );
        return unsubscribe;
    }, [listenerToken]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        setListenerToken((token) => token + 1);
    }, []);

    const handleStatusChange = useCallback(async (orderId: string, nextStatus: string) => {
        setUpdatingOrderId(orderId);
        try {
            await updateOrderStatus(orderId, nextStatus);
        } catch (error: any) {
            Alert.alert("Unable to update status", error?.message || "Please try again.");
        } finally {
            setUpdatingOrderId(null);
        }
    }, []);

    const handleMarkDelivered = useCallback(async (orderId: string) => {
        setUpdatingOrderId(orderId);
        try {
            await updateOrderStatus(orderId, "delivered");
            Alert.alert("Marked as delivered", "This order is now completed.");
        } catch (error: any) {
            Alert.alert("Unable to mark delivered", error?.message || "Please try again.");
        } finally {
            setUpdatingOrderId(null);
        }
    }, []);

    const renderStatusButtons = (order: AdminOrder) => {
        const isUpdating = updatingOrderId === order.id;
        return (
            <View className="mt-3">
                <Text className="text-xs uppercase tracking-wide text-dark-60">Update status</Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                    {STATUS_OPTIONS.map((option) => {
                        const isActive = order.status === option;
                        return (
                            <TouchableOpacity
                                key={option}
                                disabled={isActive || isUpdating}
                                onPress={() => handleStatusChange(order.id, option)}
                                className={`rounded-full border px-4 py-2 ${
                                    isActive ? "bg-dark-100 border-dark-100" : "border-gray-200 bg-white"
                                } ${isUpdating ? "opacity-60" : "opacity-100"}`}
                            >
                                <Text
                                    className={`text-sm font-ezra-semibold ${
                                        isActive ? "text-white" : "text-dark-80"
                                    }`}
                                >
                                    {humanizeStatus(option)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {isUpdating && (
                    <View className="mt-3 flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#FE8C00" />
                        <Text className="text-sm text-dark-60">Saving latest status...</Text>
                    </View>
                )}

                {order.status !== "delivered" && (
                    <TouchableOpacity
                        onPress={() => handleMarkDelivered(order.id)}
                        disabled={isUpdating}
                        className={`mt-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 ${
                            isUpdating ? "opacity-60" : "opacity-100"
                        }`}
                    >
                        <Text className="text-center text-sm font-ezra-semibold text-emerald-900">
                            Mark as Delivered
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const renderOrderCard = (order: AdminOrder) => {
        const badgeClass = STATUS_BADGE_CLASS[order.status] || "bg-gray-100 text-dark-80 border-gray-100";
        return (
            <View key={order.id} className="rounded-3xl border border-gray-100 bg-white/95 p-5 shadow-sm">
                <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                        <Text className="text-xs uppercase tracking-[2px] text-dark-60">Order ID</Text>
                        <Text className="text-lg font-ezra-bold text-dark-100">{order.id}</Text>
                    </View>
                    <View className={`items-center rounded-full border px-3 py-1 ${badgeClass}`}>
                        <Text className="text-xs font-ezra-semibold uppercase">{humanizeStatus(order.status)}</Text>
                    </View>
                </View>

                <View className="mt-4 gap-3">
                    <View>
                        <Text className="text-xs uppercase tracking-wide text-dark-60">Customer</Text>
                        <Text className="text-base font-ezra-semibold text-dark-100">{order.customerName}</Text>
                        {!!order.customerEmail && (
                            <Text className="text-sm text-dark-60">{order.customerEmail}</Text>
                        )}
                        {!!order.customerWhatsapp && (
                            <Text className="text-sm text-dark-60">WhatsApp: {order.customerWhatsapp}</Text>
                        )}
                    </View>
                    {order.restaurantName && (
                        <View>
                            <Text className="text-xs uppercase tracking-wide text-dark-60">Restaurant</Text>
                            <Text className="text-base text-dark-80">{order.restaurantName}</Text>
                        </View>
                    )}
                    <View className="flex-row items-center justify-between">
                        <View>
                            <Text className="text-xs uppercase tracking-wide text-dark-60">Total</Text>
                            <Text className="text-xl font-ezra-bold text-primary-dark">
                                {formatCurrency(order.totalPrice)}
                            </Text>
                        </View>
                        {order.createdAt && (
                            <View className="items-end">
                                <Text className="text-xs uppercase tracking-wide text-dark-60">Placed</Text>
                                <Text className="text-sm text-dark-80">
                                    {new Date(order.createdAt).toLocaleString()}
                                </Text>
                            </View>
                        )}
                    </View>

                    {order.courierLabel && (
                        <View className="flex-row items-center gap-2">
                            <Text className="text-xs uppercase tracking-wide text-dark-60">Courier</Text>
                            <View className="rounded-full bg-dark-100/10 px-3 py-1">
                                <Text className="text-sm font-ezra-semibold text-dark-80">
                                    {order.courierLabel}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {renderStatusButtons(order)}
            </View>
        );
    };

    const refreshControl = (
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FE8C00" colors={["#FE8C00"]} />
    );

    const showEmptyState = !loading && orders.length === 0 && !errorMessage;

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView
                className="flex-1"
                refreshControl={refreshControl}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                <View className="gap-5 px-5 pt-6">
                    <View className="gap-1">
                        <Text className="text-3xl font-ezra-bold text-dark-100">Super Admin</Text>
                        <Text className="text-base text-dark-60">Track every order across restaurants in real time.</Text>
                    </View>

                    {!firebaseOrdersEnabled && (
                        <View className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                            <Text className="text-base font-ezra-semibold text-amber-900">
                                Firebase has not been configured.
                            </Text>
                            <Text className="mt-1 text-sm text-amber-900/80">
                                Fill in the EXPO_PUBLIC_FIREBASE_* keys in app.json to enable this dashboard.
                            </Text>
                        </View>
                    )}

                    {errorMessage && (
                        <View className="rounded-3xl border border-error/40 bg-error/10 p-4">
                            <Text className="text-base font-ezra-semibold text-error">{errorMessage}</Text>
                            <TouchableOpacity
                                onPress={handleRefresh}
                                className="mt-3 self-start rounded-full bg-error px-4 py-2"
                            >
                                <Text className="text-sm font-ezra-semibold text-white">Try again</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {loading && (
                        <View className="items-center justify-center py-16">
                            <ActivityIndicator size="large" color="#FE8C00" />
                            <Text className="mt-4 text-base text-dark-60">Loading the latest orders...</Text>
                        </View>
                    )}

                    {showEmptyState && (
                        <View className="rounded-3xl border border-gray-100 bg-white/90 p-6 items-center">
                            <Text className="text-xl font-ezra-semibold text-dark-80">No orders yet</Text>
                            <Text className="mt-2 text-center text-dark-60">
                                Orders from every restaurant will appear here. Pull down to refresh once the first order
                                arrives.
                            </Text>
                        </View>
                    )}

                    {!loading && orders.map(renderOrderCard)}

                    <MenuEditor />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default SuperAdminDashboard;

