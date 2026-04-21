import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    ActivityIndicator,
    Clipboard,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import type { OrderStatus, RestaurantOrder } from "@/type";
import { fetchUserOrders } from "@/src/services/firebaseOrders";
import ReviewSheet from "@/src/features/reviews/ReviewSheet";
import { fetchUserReviews, submitMenuItemReview } from "@/src/services/menuItemReviews";
import useAuthStore from "@/store/auth.store";
import { illustrations } from "@/constants/mediaCatalog";
import { ORDER_STATUS_COLORS } from "@/components/OrderCard";
import Icon from "@/components/Icon";
import { seedRestaurants } from "@/lib/restaurantSeeds";
import { getProductReviewId, isCancelledStatus, isReviewableStatus } from "@/src/features/reviews/reviewUtils";

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
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(locale);
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
    const raw = String(status || "").trim().toLowerCase();
    if (isCancelledStatus(raw)) return "canceled";
    if (isReviewableStatus(raw)) return "delivered";
    if (raw === "accepted") return "preparing";
    if (raw === "hazir" || raw === "hazirlandi" || raw === "hazirlandı" || raw === "hazırlandı" || raw === "hazır") return "ready";
    if (["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(raw)) {
        return raw as OrderStatus;
    }
    return "pending";
};

const resolveItems = (order: any) => {
    const raw = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
    return raw.map((item: any) => ({
        itemId: String(item?.menuItemId ?? item?.itemId ?? item?.id ?? "").trim() || undefined,
        name: item?.name ?? "-",
        quantity: Math.max(1, Number(item?.quantity ?? 1)),
    }));
};

const normalizeId = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const restaurantNamesById = seedRestaurants.reduce<Record<string, string>>((acc, restaurant: any) => {
    const id = normalizeId(restaurant?.id);
    if (!id) return acc;
    acc[id] = restaurant?.name || id;
    return acc;
}, {});
const resolveRestaurantName = (order: any) =>
    order?.restaurant?.name ||
    order?.restaurantName ||
    restaurantNamesById[normalizeId(order?.restaurantId)] ||
    "Restaurant";

type ReviewTarget = {
    orderId: string;
    restaurantId: string;
    itemId: string;
    itemName: string;
};

const OrderHistoryScreen = () => {
    const params = useLocalSearchParams<{ lang: string; highlight?: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const { t, i18n } = useTranslation();
    const locale = i18n.language?.startsWith("tr") ? "tr-TR" : "en-US";
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const userId = String(user?.id ?? user?.$id ?? user?.accountId ?? "").trim();
    const userName = String(user?.name || "").trim() || undefined;

    const [orders, setOrders] = useState<RestaurantOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterId>("all");
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
    const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [reviewLookupLoading, setReviewLookupLoading] = useState(false);

    const loadOrders = useCallback(async () => {
        if (!userId) {
            setOrders([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const list = await fetchUserOrders(userId);
            setOrders((list as RestaurantOrder[]) || []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const loadReviewedIds = useCallback(async () => {
        if (!userId) {
            setReviewedIds(new Set());
            setReviewLookupLoading(false);
            return;
        }

        try {
            setReviewLookupLoading(true);
            const reviews = await fetchUserReviews(userId);
            const nextIds = new Set<string>();
            for (const review of reviews) {
                if (review.id) nextIds.add(String(review.id));
                const reviewOrderId = String(review.orderId || "");
                const reviewItemId = String(review.itemId || review.menuItemId || "");
                if (reviewOrderId && reviewItemId) {
                    nextIds.add(getProductReviewId(reviewOrderId, reviewItemId, userId));
                }
            }
            setReviewedIds(nextIds);
        } catch {
            setReviewedIds(new Set());
        } finally {
            setReviewLookupLoading(false);
        }
    }, [userId]);

    const handleBackPress = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace("/profile");
    };

    useFocusEffect(
        useCallback(() => {
            void loadOrders();
            void loadReviewedIds();
            return () => {
                setReviewTarget(null);
                setIsSubmittingReview(false);
            };
        }, [loadOrders, loadReviewedIds]),
    );

    useEffect(() => {
        void loadOrders();
    }, [loadOrders]);

    useEffect(() => {
        void loadReviewedIds();
    }, [loadReviewedIds]);

    const filtered = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return orders
            .filter((order) => {
                const matchesFilter = filter === "all" || normalizeStatus(order.status) === filter;
                const restaurantName = resolveRestaurantName(order).toLowerCase();
                const matchesSearch = normalizedSearch ? restaurantName.includes(normalizedSearch) : true;
                return matchesFilter && matchesSearch;
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
        await Promise.all([loadOrders(), loadReviewedIds()]);
    };

    const handleCopyOrderId = (orderId: string) => {
        if (!orderId || orderId === "-") return;
        Clipboard.setString(orderId);
        Alert.alert(isTurkish ? "Kopyalandi" : "Copied", isTurkish ? "Siparis numarasi kopyalandi." : "Order ID copied.");
    };

    const openReviewModal = (target: ReviewTarget) => {
        setReviewTarget(target);
    };

    const closeReviewModal = () => {
        setReviewTarget(null);
    };

    const handleSubmitReview = useCallback(
        async ({ rating, comment }: { rating: 1 | 2 | 3 | 4 | 5; comment?: string }) => {
            if (!reviewTarget) return;
            if (!userId) {
                Alert.alert(isTurkish ? "Yorum kullanilamiyor" : "Review unavailable", isTurkish ? "Lutfen giris yapin." : "Please sign in.");
                return;
            }
            if (rating < 1 || rating > 5) {
                Alert.alert(isTurkish ? "Gecersiz puan" : "Invalid rating", isTurkish ? "Puan 1-5 arasinda olmali." : "Rating must be 1-5.");
                return;
            }

            try {
                setIsSubmittingReview(true);
                await submitMenuItemReview({
                    orderId: reviewTarget.orderId,
                    restaurantId: reviewTarget.restaurantId,
                    itemId: reviewTarget.itemId,
                    itemName: reviewTarget.itemName,
                    userId,
                    userName,
                    rating,
                    comment,
                });

                const submittedId = getProductReviewId(reviewTarget.orderId, reviewTarget.itemId, userId);
                setReviewedIds((prev) => {
                    const next = new Set(prev);
                    next.add(submittedId);
                    return next;
                });
                await loadReviewedIds();
                closeReviewModal();
                Alert.alert(
                    isTurkish ? "Yorum kaydedildi" : "Review saved",
                    isTurkish ? "Urun yorumu basariyla kaydedildi." : "Your product review was saved.",
                );
            } catch (error: any) {
                Alert.alert(
                    isTurkish ? "Yorum kaydedilemedi" : "Unable to save review",
                    error?.message || (isTurkish ? "Lütfen tekrar deneyin." : "Please try again."),
                );
            } finally {
                setIsSubmittingReview(false);
            }
        },
        [isTurkish, loadReviewedIds, reviewTarget, userId, userName],
    );

    useEffect(() => {
        if (!__DEV__ || !userId) return;

        const deliveredOrders = orders.filter((order) => {
            const status = String(order?.status || "");
            return isReviewableStatus(status);
        }).length;

        let pendingItems = 0;
        for (const order of orders) {
            const status = String(order?.status || "");
            if (!isReviewableStatus(status)) continue;
            const orderId = String(order?.id || "").trim();
            if (!orderId) continue;
            for (const item of resolveItems(order)) {
                if (!item.itemId) continue;
                const reviewId = getProductReviewId(orderId, item.itemId, userId);
                if (!reviewedIds.has(reviewId)) pendingItems += 1;
            }
        }

        console.debug(`[Reviews][Orders] delivered=${deliveredOrders}, existing=${reviewedIds.size}, pending=${pendingItems}`);
    }, [orders, reviewedIds, userId]);

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
                    const restaurantName = resolveRestaurantName(item);
                    const rawOrderId = String(item.id ?? "-");
                    const orderIdText = `#${rawOrderId}`;
                    const restaurantId = String(item.restaurantId ?? "");
                    const canReviewDeliveredItems = isReviewableStatus(String(item.status || ""));

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
                                <View style={{ flex: 1, paddingRight: 10 }}>
                                    <Text style={{ fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" }}>
                                        {restaurantName}
                                    </Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, columnGap: 6, paddingRight: 8 }}>
                                        <Text
                                            style={{ flex: 1, fontFamily: "ChairoSans", fontSize: 12, color: "#64748B" }}
                                            numberOfLines={2}
                                        >
                                            {isTurkish ? `Siparis No: ${orderIdText}` : `Order ID: ${orderIdText}`}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => handleCopyOrderId(rawOrderId)}
                                            hitSlop={8}
                                            accessibilityRole="button"
                                            accessibilityLabel={isTurkish ? "Siparis numarasini kopyala" : "Copy order ID"}
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: "#E2E8F0",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                backgroundColor: "#FFFFFF",
                                                flexShrink: 0,
                                            }}
                                        >
                                            <Ionicons name="copy-outline" size={14} color="#64748B" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
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
                            {summaryItems.length ? (
                                <View style={{ marginTop: 10, gap: 8 }}>
                                    {summaryItems.map((orderItem: { itemId?: string; name: string; quantity: number }, index: number) => {
                                        const reviewId =
                                            userId && orderItem.itemId ? getProductReviewId(rawOrderId, orderItem.itemId, userId) : "";
                                        const isReviewed = reviewId ? reviewedIds.has(reviewId) : false;
                                        const canReviewItem =
                                            !reviewLookupLoading &&
                                            canReviewDeliveredItems &&
                                            Boolean(restaurantId) &&
                                            Boolean(orderItem.itemId) &&
                                            !isReviewed;

                                        return (
                                            <View
                                                key={`${rawOrderId}-${String(orderItem.itemId || orderItem.name)}-${index}`}
                                                style={{
                                                    borderRadius: 18,
                                                    borderWidth: 1,
                                                    borderColor: "#E2E8F0",
                                                    backgroundColor: "#F8FAFC",
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 10,
                                                    gap: 8,
                                                }}
                                            >
                                                <View
                                                    style={{
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        columnGap: 12,
                                                    }}
                                                >
                                                    <Text style={{ flex: 1, color: "#1E293B", fontFamily: "ChairoSans" }}>
                                                        {`${orderItem.quantity}x ${orderItem.name}`}
                                                    </Text>
                                                    {canReviewItem ? (
                                                        <TouchableOpacity
                                                            onPress={() =>
                                                                openReviewModal({
                                                                    orderId: rawOrderId,
                                                                    restaurantId,
                                                                    itemId: String(orderItem.itemId),
                                                                    itemName: orderItem.name,
                                                                })
                                                            }
                                                            style={{
                                                                borderRadius: 999,
                                                                paddingHorizontal: 12,
                                                                paddingVertical: 8,
                                                                backgroundColor: "#FE8C00",
                                                            }}
                                                        >
                                                            <Text style={{ color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 12 }}>
                                                                {isTurkish ? "\u00dcr\u00fcn\u00fc de\u011ferlendir" : "Review item"}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ) : isReviewed ? (
                                                        <View
                                                            style={{
                                                                borderRadius: 999,
                                                                paddingHorizontal: 12,
                                                                paddingVertical: 8,
                                                                backgroundColor: "#E2E8F0",
                                                            }}
                                                        >
                                                            <Text style={{ color: "#475569", fontFamily: "ChairoSans", fontSize: 12 }}>
                                                                {isTurkish ? "De\u011ferlendirildi" : "Reviewed"}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
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

            <ReviewSheet
                visible={Boolean(reviewTarget)}
                submitting={isSubmittingReview}
                onClose={closeReviewModal}
                onSubmit={handleSubmitReview}
                placeholder={isTurkish ? "Teslimattan sonra bu \u00fcr\u00fcn nas\u0131ld\u0131?" : "Tell others how this item was after delivery..."}
            />
        </SafeAreaView>
    );
};

export default OrderHistoryScreen;
