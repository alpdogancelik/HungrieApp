import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { Redirect, useRouter } from "expo-router";

import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import type { OrderReview } from "@/src/domain/types";
import { fetchRestaurantOrderReviews, moderateOrderReview } from "@/src/services/orderReviews";
import { PanelCard, PanelShell, panelDesign } from "@/src/features/restaurantPanel/ui";
import { LanguageSwitch } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

const RestaurantReviewsScreen = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isPhone = width < 760;
    const { isAuthenticated, isLoading: authLoading } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [redirectTo, setRedirectTo] = useState<"/sign-in" | "/" | null>(null);
    const [loading, setLoading] = useState(true);
    const [reviews, setReviews] = useState<OrderReview[]>([]);
    const [savingById, setSavingById] = useState<Record<string, boolean>>({});
    const { locale, ready, setLocale } = useRestaurantPanelLocale(restaurantId);
    const isTurkish = locale === "tr";
    const localeReady = !restaurantId || ready;

    useEffect(() => {
        let mounted = true;
        const bootstrap = async () => {
            if (authLoading) return;
            if (!isAuthenticated) {
                if (mounted) {
                    setRedirectTo("/sign-in");
                    setLoading(false);
                }
                return;
            }
            const owned = await getOwnedRestaurantId();
            if (!mounted) return;
            if (!owned) {
                setRedirectTo("/");
                setLoading(false);
                return;
            }
            setRedirectTo(null);
            setRestaurantId(owned);
        };

        void bootstrap();
        return () => {
            mounted = false;
        };
    }, [authLoading, isAuthenticated]);

    const loadReviews = useCallback(async () => {
        if (!restaurantId) {
            setReviews([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const nextReviews = await fetchRestaurantOrderReviews(restaurantId, { includeHidden: true, limit: 100 });
            setReviews(nextReviews);
        } catch (error: any) {
            Alert.alert(
                isTurkish ? "Yorumlar yuklenemedi" : "Unable to load reviews",
                error?.message || (isTurkish ? "Lutfen tekrar deneyin." : "Please try again."),
            );
        } finally {
            setLoading(false);
        }
    }, [isTurkish, restaurantId]);

    useEffect(() => {
        void loadReviews();
    }, [loadReviews]);

    const summary = useMemo(() => {
        const published = reviews.filter((review) => review.status === "published").length;
        const hidden = reviews.filter((review) => review.status === "hidden").length;
        return { total: reviews.length, published, hidden };
    }, [reviews]);

    const handleModerate = useCallback(
        async (review: OrderReview, nextStatus: OrderReview["status"]) => {
            setSavingById((prev) => ({ ...prev, [review.id]: true }));
            try {
                await moderateOrderReview(review.id, nextStatus);
                await loadReviews();
            } catch (error: any) {
                Alert.alert(
                    isTurkish ? "Islem tamamlanamadi" : "Action failed",
                    error?.message || (isTurkish ? "Lutfen tekrar deneyin." : "Please try again."),
                );
            } finally {
                setSavingById((prev) => ({ ...prev, [review.id]: false }));
            }
        },
        [isTurkish, loadReviews],
    );

    const formatDate = (value?: string) => {
        if (!value) return "-";
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleString();
    };

    if (redirectTo) return <Redirect href={redirectTo} />;

    return (
        <PanelShell
            kicker={isTurkish ? "Restoran merkezi" : "Restaurant hub"}
            title={isTurkish ? "Siparis yorumlari" : "Order reviews"}
            subtitle={
                isTurkish
                    ? "Siparis bazli restoran yorumlarini yayinla veya gizle."
                    : "Publish or hide order-level restaurant reviews."
            }
            onBackPress={isPhone ? undefined : () => router.push("/restaurantpanel")}
            backLabel={isTurkish ? "Panele don" : "Back to panel"}
            backAccessibilityLabel={isTurkish ? "Panele geri don" : "Back to panel"}
            right={
                <LanguageSwitch
                    locale={locale}
                    onChange={(next) => void setLocale(next)}
                    getAccessibilityLabel={(next) => `${isTurkish ? "Dili degistir" : "Switch language"} ${next.toUpperCase()}`}
                />
            }
        >
            <PanelCard
                title={isTurkish ? "Yorum ozeti" : "Review snapshot"}
                subtitle={`${summary.total} ${isTurkish ? "toplam" : "total"} - ${summary.published} ${isTurkish ? "yayinlandi" : "published"} - ${summary.hidden} ${isTurkish ? "gizli" : "hidden"}`}
            />

            {loading || !localeReady ? (
                <PanelCard title={isTurkish ? "Yukleniyor" : "Loading"} subtitle={isTurkish ? "Yorumlar getiriliyor..." : "Fetching reviews..."} />
            ) : (
                <View style={styles.list}>
                    {reviews.length ? (
                        reviews.map((review) => {
                            const saving = Boolean(savingById[review.id]);
                            return (
                                <PanelCard
                                    key={review.id}
                                    compact
                                    title={review.restaurantName || (isTurkish ? "Restoran" : "Restaurant")}
                                    subtitle={`${isTurkish ? "Siparis" : "Order"} #${review.orderId}`}
                                    style={styles.reviewCard}
                                    right={
                                        <View style={[styles.statusPill, review.status === "published" ? styles.statusPillPublished : styles.statusPillHidden]}>
                                            <Text style={[styles.statusPillText, review.status === "published" ? styles.statusPillTextPublished : styles.statusPillTextHidden]}>
                                                {review.status === "published" ? (isTurkish ? "Yayinda" : "Published") : isTurkish ? "Gizli" : "Hidden"}
                                            </Text>
                                        </View>
                                    }
                                >
                                    <Text style={styles.meta}>{`${isTurkish ? "Kullanici" : "User"}: ${review.userName || review.userId}`}</Text>
                                    <Text style={styles.meta}>{`${isTurkish ? "Tarih" : "Date"}: ${formatDate(review.createdAt || review.updatedAt)}`}</Text>
                                    <Text style={styles.ratingLine}>{`${isTurkish ? "Genel" : "Overall"}: ${review.averageRating.toFixed(1)}/5`}</Text>
                                    <Text style={styles.ratingLine}>{`${isTurkish ? "Hiz" : "Speed"}: ${review.ratings.speed} - ${isTurkish ? "Lezzet" : "Taste"}: ${review.ratings.taste} - ${isTurkish ? "F/P" : "Value"}: ${review.ratings.value}`}</Text>
                                    {review.comment ? (
                                        <Text style={styles.comment}>{review.comment}</Text>
                                    ) : (
                                        <Text style={styles.commentMuted}>{isTurkish ? "Yorum metni yok." : "No text comment."}</Text>
                                    )}

                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity
                                            disabled={saving || review.status === "published"}
                                            onPress={() => void handleModerate(review, "published")}
                                            style={[styles.actionButton, styles.publishButton, (saving || review.status === "published") ? styles.actionButtonDisabled : null]}
                                        >
                                            <Text style={[styles.actionButtonText, styles.publishButtonText]}>
                                                {isTurkish ? "Yayinla" : "Publish"}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            disabled={saving || review.status === "hidden"}
                                            onPress={() => void handleModerate(review, "hidden")}
                                            style={[styles.actionButton, styles.hideButton, (saving || review.status === "hidden") ? styles.actionButtonDisabled : null]}
                                        >
                                            <Text style={[styles.actionButtonText, styles.hideButtonText]}>
                                                {isTurkish ? "Gizle" : "Hide"}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </PanelCard>
                            );
                        })
                    ) : (
                        <PanelCard
                            title={isTurkish ? "Henuz yorum yok" : "No reviews yet"}
                            subtitle={isTurkish ? "Teslim edilen siparislerden yorum geldikce burada listelenecek." : "Order reviews will appear here as they arrive."}
                        />
                    )}
                </View>
            )}
        </PanelShell>
    );
};

const styles = StyleSheet.create({
    list: {
        gap: panelDesign.spacing.sm,
        paddingBottom: panelDesign.spacing.md,
    },
    reviewCard: {
        gap: 10,
    },
    meta: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: panelDesign.colors.muted,
    },
    ratingLine: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: panelDesign.colors.text,
    },
    comment: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
        color: panelDesign.colors.text,
    },
    commentMuted: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: panelDesign.colors.muted,
    },
    actionsRow: {
        flexDirection: "row",
        gap: 8,
        flexWrap: "wrap",
    },
    actionButton: {
        minHeight: 40,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
    },
    actionButtonDisabled: {
        opacity: 0.45,
    },
    actionButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
    },
    publishButton: {
        backgroundColor: "#ECFDF5",
        borderColor: "#9AD7B8",
    },
    publishButtonText: {
        color: "#157347",
    },
    hideButton: {
        backgroundColor: "#FFF1F4",
        borderColor: "#E8B2BE",
    },
    hideButtonText: {
        color: "#B62B4D",
    },
    statusPill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    statusPillPublished: {
        backgroundColor: "#ECFDF5",
    },
    statusPillHidden: {
        backgroundColor: "#FFF1F4",
    },
    statusPillText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
    },
    statusPillTextPublished: {
        color: "#157347",
    },
    statusPillTextHidden: {
        color: "#B62B4D",
    },
});

export default RestaurantReviewsScreen;
