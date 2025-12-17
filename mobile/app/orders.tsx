import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import OrderCard from "@/components/OrderCard";
import type { RestaurantOrder } from "@/type";
import { subscribeUserOrders } from "@/src/services/firebaseOrders";
import useAuthStore from "@/store/auth.store";
import { illustrations } from "@/constants/mediaCatalog";
import { t } from "i18next";

const FILTERS = [
    { id: "all", label: "ordersAll" },
    { id: "preparing", label: "status.preparing" },
    { id: "ready", label: "status.ready" },
    { id: "delivered", label: "status.delivered" },
    { id: "canceled", label: "status.canceled" },
];

const PAGE_SIZE = 4;

const OrderHistoryScreen = () => {
    const params = useLocalSearchParams<{
        lang: string; highlight?: string
    }>();
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<RestaurantOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
        return orders.filter((order) => {
            const matchesFilter = filter === "all" || order.status === filter;
            const matchesSearch = order.restaurant?.name
                ?.toLowerCase()
                .includes(search.trim().toLowerCase());
            return matchesFilter && (search ? matchesSearch : true);
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
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View>
                        <Text style={{ fontSize: 28, fontFamily: "ChairoSans", color: "#0F172A" }}>Sipariş Geçmişi</Text>
                        <Text style={{ color: "#475569", fontFamily: "ChairoSans", marginTop: 4 }}>
                            Son siparişlerini tara, filtrele, incele.
                        </Text>
                    </View>
                    <illustrations.courierHero width={64} height={64} />
                </View>
                {params.highlight ? (
                    <Text style={{ color: "#059669", fontFamily: "ChairoSans" }}>
                        #{params.highlight} numaralı sipariş onaylandı!
                    </Text>
                ) : null}
                <TextInput
                    placeholder="Restoran adıyla ara"
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
                renderItem={({ item }) => (
                    <OrderCard order={item} variant="customer" disableActions />
                )}
                ListEmptyComponent={() =>
                    loading ? null : (
                        <View style={{ padding: 32, alignItems: "center" }}>
                            <Text style={{ color: "#475569", fontFamily: "ChairoSans" }}>
                                Gösterilecek sipariş bulunamadı.
                            </Text>
                        </View>
                    )
                }
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor="#FE8C00" />
                }
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


