import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useRestaurantOrders from "@/src/hooks/useRestaurantOrders";
import { sampleMenu } from "@/lib/sampleData";
import { storage } from "@/src/lib/storage";
import type { RestaurantOrder } from "@/type";

const AUTO_ACCEPT_KEY = "auto_accept_orders";
const formatCurrency = (value?: number | string) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const useAutoAccept = () => {
    const [value, setValue] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        let mounted = true;
        storage
            .getItem(AUTO_ACCEPT_KEY)
            .then((stored) => {
                if (!mounted) return;
                if (stored === "true") setValue(true);
            })
            .finally(() => setHydrated(true));
        return () => {
            mounted = false;
        };
    }, []);

    const update = useCallback(async (next: boolean) => {
        setValue(next);
        await storage.setItem(AUTO_ACCEPT_KEY, next ? "true" : "false");
    }, []);

    return { value, setValue: update, hydrated };
};

const menuSeed = (sampleMenu[1] || []).slice(0, 5).map((item) => ({
    id: String(item.id ?? item.$id ?? `menu-${item.name}`),
    name: item.name,
    price: Number(item.price),
    visible: true,
}));

type DayDefinition = {
    id: string;
    label: string;
    fullLabel: string;
    index: number;
};

type DaySchedule = DayDefinition & {
    start: string;
    end: string;
    enabled: boolean;
};

const VISIBILITY_SCHEDULE_KEY = "restaurant_visibility_schedule";

const DAY_DEFINITIONS: DayDefinition[] = [
    { id: "sun", label: "Paz", fullLabel: "Pazar", index: 0 },
    { id: "mon", label: "Pzt", fullLabel: "Pazartesi", index: 1 },
    { id: "tue", label: "Sal", fullLabel: "Sali", index: 2 },
    { id: "wed", label: "Car", fullLabel: "Carsamba", index: 3 },
    { id: "thu", label: "Per", fullLabel: "Persembe", index: 4 },
    { id: "fri", label: "Cum", fullLabel: "Cuma", index: 5 },
    { id: "sat", label: "Cmt", fullLabel: "Cumartesi", index: 6 },
];

const defaultSchedule: DaySchedule[] = DAY_DEFINITIONS.map((day) => ({
    ...day,
    start: "09:00",
    end: "23:00",
    enabled: true,
}));

const sanitizeTime = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const mergeSchedule = (stored?: string | null) => {
    if (!stored) return defaultSchedule;
    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return defaultSchedule;
        return DAY_DEFINITIONS.map((day) => {
            const existing = parsed.find((entry: any) => entry?.id === day.id) || {};
            return {
                ...day,
                start: typeof existing.start === "string" ? existing.start : "09:00",
                end: typeof existing.end === "string" ? existing.end : "23:00",
                enabled: typeof existing.enabled === "boolean" ? existing.enabled : true,
            };
        });
    } catch {
        return defaultSchedule;
    }
};

const useVisibilitySchedule = () => {
    const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        let mounted = true;
        storage
            .getItem(VISIBILITY_SCHEDULE_KEY)
            .then((stored) => {
                if (!mounted) return;
                setSchedule(mergeSchedule(stored));
            })
            .finally(() => {
                if (mounted) setHydrated(true);
            });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        storage.setItem(VISIBILITY_SCHEDULE_KEY, JSON.stringify(schedule)).catch(() => null);
    }, [schedule, hydrated]);

    const updateDay = useCallback((dayId: string, updates: Partial<DaySchedule>) => {
        setSchedule((prev) =>
            prev.map((day) => (day.id === dayId ? { ...day, ...updates } : day)),
        );
    }, []);

    const todaysSlot = useMemo(() => {
        const todayIndex = new Date().getDay();
        return schedule.find((day) => day.index === todayIndex);
    }, [schedule]);

    const applyTodayToAll = useCallback(() => {
        if (!todaysSlot) return;
        setSchedule((prev) =>
            prev.map((day) => ({
                ...day,
                start: todaysSlot.start,
                end: todaysSlot.end,
                enabled: todaysSlot.enabled,
            })),
        );
    }, [todaysSlot]);

    return {
        schedule,
        hydrated,
        updateDay,
        applyTodayToAll,
        todaysSlot,
    };
};

const describeSlot = (slot?: DaySchedule) => {
    if (!slot) return "No schedule saved for today.";
    if (!slot.enabled) return "Hidden from customers today.";
    return `Visible between ${slot.start}-${slot.end} today.`;
};

const RestaurantConsoleScreen = () => {
    const restaurantId = "1";
    const { orders, loading, error, mutateStatus, refetch } = useRestaurantOrders(restaurantId);
    const { value: autoAccept, setValue: setAutoAccept, hydrated } = useAutoAccept();
    const [menuItems, setMenuItems] = useState(menuSeed);
    const {
        schedule,
        hydrated: scheduleHydrated,
        updateDay,
        applyTodayToAll,
        todaysSlot,
    } = useVisibilitySchedule();

    const toggleMenuVisibility = (menuId: string) => {
        setMenuItems((prev) =>
            prev.map((item) => (item.id === menuId ? { ...item, visible: !item.visible } : item)),
        );
    };

    const todaysStats = useMemo(() => {
        const today = new Date().toDateString();
        const todaysOrders = orders.filter((order) => {
            const ts = order.createdAt || order.updatedAt;
            if (!ts) return false;
            return new Date(ts).toDateString() === today;
        });
        const revenue = todaysOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        return {
            count: todaysOrders.length,
            revenue,
        };
    }, [orders]);

    const handleAction = async (orderId: string, status: string) => {
        try {
            await mutateStatus(orderId, status);
        } catch {
            Alert.alert("Unable to update order");
        }
    };

    useEffect(() => {
        if (!autoAccept) return;
        orders
            .filter((order) => order.status === "pending")
            .forEach((order) => {
                const id = String(order.id ?? order.$id);
                handleAction(id, "preparing");
            });
    }, [autoAccept, orders]);

    const renderOrderRow = ({ item }: { item: RestaurantOrder }) => {
        const orderId = String(item.id ?? item.$id);
        const summary = (item.orderItems || []).slice(0, 2)
            .map((entry) => `${entry.quantity || 1}x ${entry.name || "Item"}`)
            .join(", ");
        return (
            <View className="flex-row items-center bg-white rounded-2xl p-3 mb-3 border border-gray-100">
                <View className="flex-1">
                    <Text className="paragraph-semibold text-dark-100">#{orderId.slice(-5)}</Text>
                    <Text className="body-medium text-dark-60" numberOfLines={1}>
                        {summary || "No items"}
                    </Text>
                </View>
                <View className="w-24">
                    <Text className="paragraph-semibold text-dark-100">{formatCurrency(item.total)}</Text>
                </View>
                <View className="flex-row gap-2">
                    {item.status === "pending" && (
                        <TouchableOpacity className="chip bg-primary" onPress={() => handleAction(orderId, "preparing")}>
                            <Text className="paragraph-semibold text-white">Confirm</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === "preparing" && (
                        <TouchableOpacity className="chip bg-primary/10" onPress={() => handleAction(orderId, "ready")}>
                            <Text className="paragraph-semibold text-primary">Mark ready</Text>
                        </TouchableOpacity>
                    )}
                    {item.status !== "canceled" && (
                        <TouchableOpacity className="chip bg-red-50" onPress={() => handleAction(orderId, "canceled")}>
                            <Text className="paragraph-semibold text-red-500">Cancel</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="px-5 pt-6 gap-6 flex-1">
                <View className="bg-white rounded-3xl p-4 border border-gray-100 flex-row justify-between">
                    <View>
                        <Text className="body-medium text-dark-60">Orders today</Text>
                        <Text className="text-3xl font-ezra-bold text-dark-100">{todaysStats.count}</Text>
                    </View>
                    <View>
                        <Text className="body-medium text-dark-60">Revenue today</Text>
                        <Text className="text-3xl font-ezra-bold text-dark-100">{formatCurrency(todaysStats.revenue)}</Text>
                    </View>
                </View>

                <View className="bg-white rounded-3xl p-4 border border-gray-100">
                    <View className="flex-row items-center justify-between mb-3">
                        <Text className="section-title">Auto accept orders</Text>
                        <Switch
                            value={autoAccept}
                            disabled={!hydrated}
                            onValueChange={setAutoAccept}
                        />
                    </View>
                    <Text className="body-medium text-dark-60">
                        When enabled, incoming orders will be confirmed automatically.
                    </Text>
                </View>

                <View className="flex-1">
                    <View className="flex-row items-center justify-between mb-3">
                        <Text className="section-title">Incoming orders</Text>
                        <TouchableOpacity onPress={refetch}>
                            <Text className="paragraph-semibold text-primary">Refresh</Text>
                        </TouchableOpacity>
                    </View>
                    {loading ? (
                        <ActivityIndicator color="#FF8C42" />
                    ) : error ? (
                        <Text className="body-medium text-red-500">{error}</Text>
                    ) : (
                        <FlatList
                            data={orders}
                            keyExtractor={(item) => String(item.id ?? item.$id)}
                            renderItem={renderOrderRow}
                            ListEmptyComponent={<Text className="body-medium text-dark-60">No orders yet.</Text>}
                        />
                    )}
                </View>

                <View className="bg-white rounded-3xl p-4 border border-gray-100">
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="section-title">Daily visibility</Text>
                        <TouchableOpacity
                            onPress={applyTodayToAll}
                            disabled={!scheduleHydrated || !todaysSlot}
                        >
                            <Text
                                className={`paragraph-semibold ${!scheduleHydrated || !todaysSlot ? "text-dark-60" : "text-primary"}`}
                            >
                                Copy today's plan
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="body-medium text-dark-60 mb-3">{describeSlot(todaysSlot)}</Text>
                    <View className="gap-3">
                        {schedule.map((day) => (
                            <View
                                key={day.id}
                                className="flex-row items-center gap-3 py-2 border-b border-gray-100"
                            >
                                <View className="flex-1">
                                    <Text className="paragraph-semibold text-dark-100">{day.fullLabel}</Text>
                                    <Text className="body-medium text-dark-60">
                                        {day.enabled ? `${day.start} - ${day.end}` : "Hidden all day"}
                                    </Text>
                                </View>
                                <View className="flex-row items-center gap-2">
                                    <TextInput
                                        value={day.start}
                                        editable={scheduleHydrated && day.enabled}
                                        onChangeText={(value) =>
                                            updateDay(day.id, { start: sanitizeTime(value) })
                                        }
                                        keyboardType="numeric"
                                        maxLength={5}
                                        style={styles.visibilityInput}
                                    />
                                    <Text className="paragraph-semibold text-dark-60">-</Text>
                                    <TextInput
                                        value={day.end}
                                        editable={scheduleHydrated && day.enabled}
                                        onChangeText={(value) =>
                                            updateDay(day.id, { end: sanitizeTime(value) })
                                        }
                                        keyboardType="numeric"
                                        maxLength={5}
                                        style={styles.visibilityInput}
                                    />
                                </View>
                                <Switch
                                    value={day.enabled}
                                    disabled={!scheduleHydrated}
                                    onValueChange={(value) => updateDay(day.id, { enabled: value })}
                                />
                            </View>
                        ))}
                    </View>
                </View>

                <View className="bg-white rounded-3xl p-4 border border-gray-100">
                    <Text className="section-title mb-3">Menu visibility</Text>
                    {menuItems.map((item) => (
                        <View key={item.id} className="flex-row items-center justify-between py-2 border-b border-gray-100">
                            <View>
                                <Text className="paragraph-semibold text-dark-100">{item.name}</Text>
                                <Text className="body-medium text-dark-60">{formatCurrency(item.price)}</Text>
                            </View>
                            <Switch value={item.visible} onValueChange={() => toggleMenuVisibility(item.id)} />
                        </View>
                    ))}
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    visibilityInput: {
        width: 72,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
        fontFamily: "Ezra-SemiBold",
        color: "#0F172A",
        textAlign: "center",
    },
});

export default RestaurantConsoleScreen;

