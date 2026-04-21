import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";

import Icon from "@/components/Icon";
import { getRestaurant } from "@/lib/api";
import type { OrderReview, RestaurantOrderReviewSummary } from "@/src/domain/types";
import { calculateRestaurantOrderReviewSummary, fetchRestaurantOrderReviews } from "@/src/services/orderReviews";
import { makeShadow } from "@/src/lib/shadowStyle";

type RestaurantDetails = {
    id?: string;
    name?: string;
    ratingAverage?: number | string;
    ratingCount?: number | string;
    speedAverage?: number | string;
    tasteAverage?: number | string;
    valueAverage?: number | string;
};

const THEME = {
    bg: "#FFF8F2",
    bgTop: "#FFF5EB",
    bgBottom: "#FFFCF8",
    card: "#FFFFFF",
    cardSoft: "#FFF9F3",
    ink: "#251B17",
    muted: "#7E7167",
    subtle: "#A39489",
    line: "rgba(37,27,23,0.08)",
    lineSoft: "rgba(37,27,23,0.05)",
    accent: "#F28C28",
    accentStrong: "#E46F10",
    accentSoft: "rgba(242,140,40,0.12)",
};

const shadow = makeShadow({
    color: "#8F6543",
    offsetY: 10,
    blurRadius: 24,
    opacity: 0.1,
    elevation: 4,
});

const parseNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const maskName = (userName?: string, userId?: string) => {
    const parts = String(userName || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]?.toUpperCase()}**** ${parts[1][0]?.toUpperCase()}`;
    if (parts.length === 1) return `${parts[0][0]?.toUpperCase()}****`;
    const fallback = String(userId || "").trim();
    return fallback ? `${fallback[0]?.toUpperCase()}****` : "Hungrie kullanıcısı";
};

const toRelativeDate = (value?: string) => {
    if (!value) return "Az önce";
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "Az önce";

    const diff = Date.now() - time;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "Az önce";
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} dk önce`;
    if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} saat önce`;
    return `${Math.max(1, Math.floor(diff / day))} gün önce`;
};

const starsFor = (value: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(value)));
    return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
};

const formatItemsSnapshot = (items: OrderReview["itemsSnapshot"]) => {
    if (!Array.isArray(items) || !items.length) return "";
    const preview = items.slice(0, 3).map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`);
    const remaining = items.length - preview.length;
    if (remaining > 0) preview.push(`+${remaining} ürün`);
    return preview.join(", ");
};

const summaryFromRestaurantDoc = (restaurant: RestaurantDetails | null): RestaurantOrderReviewSummary | null => {
    if (!restaurant) return null;
    const count = Math.max(0, Math.round(parseNumber(restaurant.ratingCount)));
    if (count <= 0) return null;

    const valueAverage = parseNumber(restaurant.valueAverage);
    return {
        averageRating: Number(parseNumber(restaurant.ratingAverage).toFixed(1)),
        count,
        speedAverage: Number(parseNumber(restaurant.speedAverage).toFixed(1)),
        tasteAverage: Number(parseNumber(restaurant.tasteAverage).toFixed(1)),
        valueAverage: Number(valueAverage.toFixed(1)),
        pricePerformanceAverage: Number(valueAverage.toFixed(1)),
        latestComments: [],
    };
};

export default function RestaurantReviewsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const restaurantId = useMemo(() => (id ? String(id) : ""), [id]);

    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [restaurant, setRestaurant] = useState<RestaurantDetails | null>(null);
    const [summary, setSummary] = useState<RestaurantOrderReviewSummary>({
        averageRating: 0,
        count: 0,
        speedAverage: 0,
        tasteAverage: 0,
        valueAverage: 0,
        pricePerformanceAverage: 0,
        latestComments: [],
    });
    const [reviews, setReviews] = useState<OrderReview[]>([]);
    const handleBack = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        if (restaurantId) {
            router.replace({
                pathname: "/restaurants/[id]",
                params: { id: restaurantId },
            });
            return;
        }
        router.replace("/");
    }, [restaurantId, router]);

    const loadScreenData = useCallback(async () => {
        if (!restaurantId) {
            setLoading(false);
            setErrorText("Restoran bulunamadı.");
            return;
        }

        setLoading(true);
        setErrorText(null);
        try {
            const [restaurantData, fetchedReviews] = await Promise.all([
                getRestaurant(restaurantId),
                fetchRestaurantOrderReviews(restaurantId, { limit: 20 }),
            ]);

            const resolvedRestaurant = (restaurantData as RestaurantDetails | null) || null;
            setRestaurant(resolvedRestaurant);
            setReviews(fetchedReviews);

            const computed = calculateRestaurantOrderReviewSummary(fetchedReviews);
            const aggregateFallback = summaryFromRestaurantDoc(resolvedRestaurant);
            setSummary(computed.count > 0 ? computed : aggregateFallback || computed);
        } catch (error: any) {
            setErrorText(error?.message || "Yorumlar alınamadı.");
        } finally {
            setLoading(false);
        }
    }, [restaurantId]);

    useEffect(() => {
        void loadScreenData();
    }, [loadScreenData]);

    const hasReviews = summary.count > 0 || reviews.length > 0;
    const restaurantName = restaurant?.name || "Restoran";
    const contentPadding = {
        paddingHorizontal: 16,
        paddingBottom: Math.max(20, insets.bottom + 16),
        paddingTop: Math.max(insets.top, 8),
    };

    const renderListHeader = () => (
        <View style={styles.listHeaderWrap}>
            <View style={styles.headerCard}>
                <View style={styles.headerTop}>
                    <Pressable onPress={handleBack} style={styles.backButton}>
                        <Icon name="arrowBack" size={18} color={THEME.ink} />
                    </Pressable>
                    <View style={styles.headerCopy}>
                        <Text style={styles.headerTitle} numberOfLines={2}>
                            {restaurantName}
                        </Text>
                        <Text style={styles.headerSubtitle}>Teslim edilen siparişlerden gelen gerçek değerlendirmeler</Text>
                    </View>
                </View>
            </View>

            {hasReviews ? (
                <View style={styles.summaryCard}>
                    <View style={styles.summaryTop}>
                        <View>
                            <Text style={styles.summaryScore}>{summary.averageRating.toFixed(1)}</Text>
                            <Text style={styles.summaryStars}>{starsFor(summary.averageRating)}</Text>
                        </View>
                        <Text style={styles.summaryCount}>{`${summary.count} değerlendirme`}</Text>
                    </View>

                    <View style={styles.metricsRow}>
                        <View style={styles.metricPill}>
                            <Text style={styles.metricLabel}>Lezzet</Text>
                            <Text style={styles.metricValue}>{summary.tasteAverage.toFixed(1)}</Text>
                        </View>
                        <View style={styles.metricPill}>
                            <Text style={styles.metricLabel}>Hız</Text>
                            <Text style={styles.metricValue}>{summary.speedAverage.toFixed(1)}</Text>
                        </View>
                        <View style={styles.metricPill}>
                            <Text style={styles.metricLabel}>F/P</Text>
                            <Text style={styles.metricValue}>{(summary.pricePerformanceAverage ?? summary.valueAverage).toFixed(1)}</Text>
                        </View>
                    </View>
                </View>
            ) : null}
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgBottom]} style={styles.flex}>
                    <View style={[styles.stateWrap, { paddingTop: Math.max(insets.top, 8) }]}>
                        <Text style={styles.stateTitle}>Yükleniyor...</Text>
                        <Text style={styles.stateBody}>Yorumlar hazırlanıyor.</Text>
                    </View>
                </LinearGradient>
            </SafeAreaView>
        );
    }

    if (errorText) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgBottom]} style={styles.flex}>
                    <View style={[styles.stateWrap, { paddingTop: Math.max(insets.top, 8) }]}>
                        <Text style={styles.stateTitle}>Yorumlar alınamadı</Text>
                        <Text style={styles.stateBody}>{errorText}</Text>
                        <Pressable style={styles.retryButton} onPress={() => void loadScreenData()}>
                            <Text style={styles.retryButtonText}>Tekrar dene</Text>
                        </Pressable>
                    </View>
                </LinearGradient>
            </SafeAreaView>
        );
    }

    if (!hasReviews) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgBottom]} style={styles.flex}>
                    <FlatList<OrderReview>
                        data={[]}
                        keyExtractor={(_, index) => `empty-${index}`}
                        renderItem={() => null}
                        ListHeaderComponent={renderListHeader}
                        ListEmptyComponent={
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyTitle}>Bu restoran için henüz yorum yok.</Text>
                            </View>
                        }
                        contentContainerStyle={contentPadding}
                        showsVerticalScrollIndicator={false}
                    />
                </LinearGradient>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgBottom]} style={styles.flex}>
                <FlatList
                    data={reviews}
                    keyExtractor={(item) => item.id}
                    ListHeaderComponent={renderListHeader}
                    ItemSeparatorComponent={() => <View style={styles.listSpacer} />}
                    contentContainerStyle={contentPadding}
                    renderItem={({ item }) => {
                        const itemsText = formatItemsSnapshot(item.itemsSnapshot || []);
                        const pricePerformance = Number(item.ratings.pricePerformance ?? item.ratings.value ?? 0).toFixed(1);

                        return (
                            <View style={styles.reviewCard}>
                                <View style={styles.reviewTop}>
                                    <Text style={styles.reviewUser}>{maskName(item.userName, item.userId)}</Text>
                                    <Text style={styles.reviewDate}>{toRelativeDate(item.createdAt || item.updatedAt)}</Text>
                                </View>

                                <Text style={styles.reviewOverall}>{`${starsFor(item.averageRating)}  ${item.averageRating.toFixed(1)}`}</Text>

                                <View style={styles.chipsRow}>
                                    <View style={styles.scoreChip}>
                                        <Text style={styles.scoreChipText}>{`Lezzet ${Number(item.ratings.taste || 0).toFixed(1)}`}</Text>
                                    </View>
                                    <View style={styles.scoreChip}>
                                        <Text style={styles.scoreChipText}>{`Hız ${Number(item.ratings.speed || 0).toFixed(1)}`}</Text>
                                    </View>
                                    <View style={styles.scoreChip}>
                                        <Text style={styles.scoreChipText}>{`F/P ${pricePerformance}`}</Text>
                                    </View>
                                </View>

                                {item.comment?.trim() ? <Text style={styles.reviewComment}>{item.comment.trim()}</Text> : null}
                                {itemsText ? <Text style={styles.reviewItems}>{`Sipariş: ${itemsText}`}</Text> : null}
                            </View>
                        );
                    }}
                    showsVerticalScrollIndicator={false}
                />
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: THEME.bg,
    },
    flex: {
        flex: 1,
    },
    listHeaderWrap: {
        gap: 12,
        marginBottom: 12,
    },
    headerCard: {
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        ...shadow,
    },
    headerTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.line,
    },
    headerCopy: {
        flex: 1,
        gap: 3,
    },
    headerTitle: {
        fontFamily: "ChairoSans",
        fontSize: 24,
        lineHeight: 28,
        color: THEME.ink,
    },
    headerSubtitle: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.muted,
    },
    summaryCard: {
        borderRadius: 20,
        padding: 14,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        gap: 10,
        ...shadow,
    },
    summaryTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    summaryScore: {
        fontFamily: "ChairoSans",
        fontSize: 30,
        color: THEME.ink,
    },
    summaryStars: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.accentStrong,
    },
    summaryCount: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.muted,
    },
    metricsRow: {
        flexDirection: "row",
        gap: 8,
    },
    metricPill: {
        flex: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
    },
    metricLabel: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.muted,
    },
    metricValue: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: THEME.accentStrong,
    },
    listSpacer: {
        height: 10,
    },
    reviewCard: {
        borderRadius: 18,
        padding: 14,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        gap: 8,
        ...shadow,
    },
    reviewTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    reviewUser: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.ink,
    },
    reviewDate: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.subtle,
    },
    reviewOverall: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.accentStrong,
    },
    chipsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    scoreChip: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
    },
    scoreChipText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.accentStrong,
    },
    reviewComment: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
        color: THEME.muted,
    },
    reviewItems: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.subtle,
    },
    stateWrap: {
        margin: 16,
        borderRadius: 18,
        padding: 16,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        gap: 6,
    },
    stateTitle: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: THEME.ink,
    },
    stateBody: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.muted,
    },
    retryButton: {
        marginTop: 8,
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: THEME.accentSoft,
    },
    retryButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.accentStrong,
    },
    emptyCard: {
        borderRadius: 18,
        padding: 16,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
    },
    emptyTitle: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: THEME.ink,
    },
});
