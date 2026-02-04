import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type { OrderStatus, RestaurantOrder } from "@/type";
import { subscribeUserOrders } from "@/src/services/firebaseOrders";
import useAuthStore from "@/store/auth.store";
import { illustrations } from "@/constants/mediaCatalog";
import { ORDER_STATUS_COLORS } from "@/components/OrderCard";
import Icon from "@/components/Icon";

type FilterId = "all" | OrderStatus;

const FILTERS: { id: FilterId; label: string }[] = [
    { id: "all", label: "ordersAll" },
    { id: "preparing", label: "status.preparing" },
    { id: "ready", label: "status.ready" },
    { id: "delivered", label: "status.delivered" },
    { id: "canceled", label: "status.canceled" },
];

const PAGE_SIZE = 4;
const formatCurrencyValue = (value?: number | string) => {
    const amount = Number(value ?? 0);
    return `TRY ${Number.isNaN(amount) ? "0.00" : amount.toFixed(2)}`;
};

const formatTimestamp = (value: any, locale?: string) => {
    if (!value) return "";
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString(locale);
    }
    if (typeof value === "object" && "seconds" in value) {
        const millis = value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
        return new Date(millis).toLocaleString(locale);
    }
    return "";
};

const getMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value === "object" && "seconds" in value) {
        return value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
    }
    const asDate = new Date(value);
    const ms = asDate.getTime();
    return Number.isNaN(ms) ? 0 : ms;
};

const normalizeStatus = (status?: string): OrderStatus => {
    if (!status) return "pending";
    if (status === "accepted") return "preparing";
    if (status === "rejected") return "canceled";
    if (["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(status)) {
        return status as OrderStatus;
    }
    return "pending";
};

const resolveItems = (order: any) => {
    const raw = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
    return raw.map((item: any) => ({
        name: item?.name ?? "-",
        quantity: Number(item?.quantity ?? 1),
    }));
};

const OrderHistoryScreen = () => {
    const params = useLocalSearchParams<{ lang: string; highlight?: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const { t, i18n } = useTranslation();
    const locale = i18n.language?.startsWith("tr") ? "tr-TR" : "en-US";

    const [orders, setOrders] = useState<RestaurantOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterId>("all");
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const handleBackPress = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace("/profile");
    };

    useEffect(() => {
        const userId = user?.id ?? user?.$id ?? user?.accountId ?? null;
        if (!userId) {
            setOrders([]);
            setLoading(false);
            return;
        }

        const unsub = subscribeUserOrders(userId, (list) => {
            setOrders((list as RestaurantOrder[]) || []);
            setLoading(false);
        });

        return () => {
            try {
                unsub && unsub();
            } catch {
                /* noop */
            }
        };
    }, [user?.id, user?.$id, user?.accountId]);

    const filtered = useMemo(() => {
        return orders
            .filter((order) => {
                const matchesFilter = filter === "all" || normalizeStatus(order.status) === filter;
                const matchesSearch = order.restaurant?.name?.toLowerCase().includes(search.trim().toLowerCase());
                return matchesFilter && (search ? matchesSearch : true);
            })
            .sort((a, b) => {
                const da = getMillis(a.updatedAt || a.createdAt || 0);
                const db = getMillis(b.updatedAt || b.createdAt || 0);
                return db - da;
            });
    }, [orders, filter, search]);

    const visibleData = filtered.slice(0, visibleCount);

    const handleLoadMore = useCallback(() => {
        if (visibleData.length >= filtered.length) return;
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
    }, [visibleData.length, filtered.length]);

    const handleRefresh = async () => {
        setVisibleCount(PAGE_SIZE);
    };

    const renderFilter = () => (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {FILTERS.map((item) => {
                const active = filter === item.id;
                const label = item.id === "all" ? t("cart.screen.ordersAll") : t(item.label as any);
                return (
                    <TouchableOpacity
                        key={item.id}
                        onPress={() => {
                            setFilter(item.id);
                            setVisibleCount(PAGE_SIZE);
                        }}
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: active ? "#FE8C00" : "#E2E8F0",
                            backgroundColor: active ? "#FFF6EF" : "transparent",
                        }}
                    >
                        <Text style={{ color: active ? "#FE8C00" : "#475569", fontFamily: "ChairoSans" }}>{label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
                <Pressable
                    onPress={handleBackPress}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.goBack")}
                    style={{
                        height: 40,
                        width: 40,
                        borderRadius: 999,
                        backgroundColor: "#FFFFFF",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Icon name="arrowBack" size={20} color="#0F172A" />
                </Pressable>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View>
                        <Text style={{ fontSize: 28, fontFamily: "ChairoSans", color: "#0F172A" }}>
                            {t("cart.screen.ordersHistoryTitle")}
                        </Text>
                        <Text style={{ color: "#475569", fontFamily: "ChairoSans", marginTop: 4 }}>
                            {t("cart.screen.ordersSearchSubtitle")}
                        </Text>
                    </View>
                    <illustrations.courierHero width={64} height={64} />
                </View>

                {params.highlight ? (
                    <Text style={{ color: "#059669", fontFamily: "ChairoSans" }}>
                        {t("cart.screen.ordersHighlight", { id: params.highlight })}
                    </Text>
                ) : null}

                <TextInput
                    placeholder={t("cart.screen.ordersSearchPlaceholder")}
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={(text) => {
                        setSearch(text);
                        setVisibleCount(PAGE_SIZE);
                    }}
                    style={{
                        backgroundColor: "#fff",
                        borderRadius: 24,
                        paddingHorizontal: 18,
                        paddingVertical: 12,
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        fontFamily: "ChairoSans",
                    }}
                />

                {renderFilter()}
            </View>

            <FlatList
                data={visibleData}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingBottom: 40 }}
                renderItem={({ item }) => {
                    const normStatus = normalizeStatus(item.status);
                    const badge = ORDER_STATUS_COLORS[normStatus];
                    const label = t(`status.${normStatus}` as any);
                    const summaryItems = resolveItems(item);
                    const summary = summaryItems.map((it: any) => `${it.quantity}x ${it.name}`).join(" • ");
                    const restaurantName = item.restaurant?.name || "Hungrie Order";

                    return (
                        <View
                            style={{
                                backgroundColor: "#fff",
                                borderRadius: 24,
                                padding: 16,
                                borderWidth: 1,
                                borderColor: "#E2E8F0",
                            }}
                        >
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" }}>
                                    {restaurantName}
                                </Text>
                                <View
                                    style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        backgroundColor: badge.bg,
                                        flexDirection: "row",
                                        alignItems: "center",
                                    }}
                                >
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: badge.dot }} />
                                    <Text style={{ color: badge.text, fontFamily: "ChairoSans", marginLeft: 6 }}>
                                        {label}
                                    </Text>
                                </View>
                            </View>
                            <Text style={{ color: "#94A3B8", marginTop: 4, fontFamily: "ChairoSans" }}>
                                {formatTimestamp(item.updatedAt || item.createdAt, locale)}
                            </Text>
                            {summary ? (
                                <Text style={{ color: "#1E293B", marginTop: 8, fontFamily: "ChairoSans" }}>
                                    {summary}
                                </Text>
                            ) : null}
                            <View
                                style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginTop: 12,
                                }}
                            >
                                <View>
                                    <Text style={{ color: "#94A3B8", fontFamily: "ChairoSans" }}>
                                        {t("cart.screen.summary.total")}
                                    </Text>
                                    <Text style={{ color: "#0F172A", fontSize: 18, fontFamily: "ChairoSans" }}>
                                        {formatCurrencyValue(item.total)}
                                    </Text>
                                </View>
                                <Text style={{ color: badge.text, fontFamily: "ChairoSans" }}>{label}</Text>
                            </View>
                        </View>
                    );
                }}
                ListEmptyComponent={() =>
                    loading ? null : (
                        <View style={{ padding: 32, alignItems: "center" }}>
                            <Text style={{ color: "#475569", fontFamily: "ChairoSans" }}>
                                {t("cart.screen.ordersEmpty")}
                            </Text>
                        </View>
                    )
                }
                refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor="#FE8C00" />}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={
                    visibleData.length < filtered.length ? (
                        <ActivityIndicator color="#FE8C00" style={{ marginVertical: 16 }} />
                    ) : null
                }
            />
        </SafeAreaView>
    );
};

export default OrderHistoryScreen;
