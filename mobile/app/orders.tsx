import { useCallback, useMemo, useState } from "react";
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
import useServerResource from "@/lib/useServerResource";
import { getUserOrders } from "@/lib/api";

const FILTERS = [
    { id: "all", label: "Tümü" },
    { id: "preparing", label: "Hazırlanıyor" },
    { id: "ready", label: "Hazır" },
    { id: "delivered", label: "Teslim edildi" },
    { id: "canceled", label: "İptal" },
];

const PAGE_SIZE = 4;

const OrderHistoryScreen = () => {
    const params = useLocalSearchParams<{ highlight?: string }>();
    const { data, loading, refetch } = useServerResource({ fn: getUserOrders, skipAlert: true });
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const orders = (data as RestaurantOrder[]) || [];

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
        await refetch();
    };

    const renderFilter = () => (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {FILTERS.map((item) => {
                const active = filter === item.id;
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
                        <Text style={{ color: active ? "#FE8C00" : "#475569", fontFamily: "Ezra-SemiBold" }}>{item.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
                <Text style={{ fontSize: 28, fontFamily: "Ezra-Bold", color: "#0F172A" }}>Sipariş Geçmişi</Text>
                {params.highlight ? (
                    <Text style={{ color: "#059669", fontFamily: "Ezra-SemiBold" }}>
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
                        fontFamily: "Ezra-Medium",
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
                            <Text style={{ color: "#475569", fontFamily: "Ezra-Medium" }}>
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

