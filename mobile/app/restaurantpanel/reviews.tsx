import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { Redirect, useRouter } from "expo-router";

import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import type { MenuItemReview } from "@/src/domain/types";
import { fetchRestaurantReviews, moderateMenuItemReview } from "@/src/services/menuItemReviews";
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
    const [reviews, setReviews] = useState<MenuItemReview[]>([]);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
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
            const nextReviews = await fetchRestaurantReviews(restaurantId, { includeHidden: true });
            setReviews(nextReviews);
            setReplyDrafts(
                Object.fromEntries(nextReviews.map((review) => [review.id, review.reply || ""])),
            );
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
        async (review: MenuItemReview, nextStatus: MenuItemReview["status"]) => {
            setSavingById((prev) => ({ ...prev, [review.id]: true }));
            try {
                await moderateMenuItemReview({
                    reviewId: review.id,
                    status: nextStatus,
                    reply: replyDrafts[review.id] || "",
                });
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
        [isTurkish, loadReviews, replyDrafts],
    );

    const handleReplySave = useCallback(
        async (review: MenuItemReview) => {
            setSavingById((prev) => ({ ...prev, [review.id]: true }));
            try {
                await moderateMenuItemReview({
                    reviewId: review.id,
                    reply: replyDrafts[review.id] || "",
                });
                await loadReviews();
            } catch (error: any) {
                Alert.alert(
                    isTurkish ? "Cevap kaydedilemedi" : "Reply could not be saved",
                    error?.message || (isTurkish ? "Lutfen tekrar deneyin." : "Please try again."),
                );
            } finally {
                setSavingById((prev) => ({ ...prev, [review.id]: false }));
            }
        },
        [isTurkish, loadReviews, replyDrafts],
    );

    if (redirectTo) return <Redirect href={redirectTo} />;

    return (
        <PanelShell
            kicker={isTurkish ? "Restoran merkezi" : "Restaurant hub"}
            title={isTurkish ? "Yorum moderasyonu" : "Review moderation"}
            subtitle={
                isTurkish
                    ? "Urun yorumlarini yayinla, gizle ve restoran cevabi ekle."
                    : "Publish, hide, and reply to product reviews."
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
                subtitle={`${summary.total} ${isTurkish ? "toplam" : "total"} • ${summary.published} ${isTurkish ? "yayinlandi" : "published"} • ${summary.hidden} ${isTurkish ? "gizli" : "hidden"}`}
            />

            {loading || !localeReady ? (
                <PanelCard title={isTurkish ? "Yukleniyor" : "Loading"} subtitle={isTurkish ? "Yorumlar getiriliyor..." : "Fetching reviews..."} />
            ) : (
                <View style={styles.list}>
                    {reviews.length ? (
                        reviews.map((review) => {
                            const saving = Boolean(savingById[review.id]);
                            const draft = replyDrafts[review.id] || "";
                            return (
                                <PanelCard
                                    key={review.id}
                                    compact
                                    title={review.menuItemName || (isTurkish ? "Menu urunu" : "Menu item")}
                                    subtitle={`${review.rating}/5 • ${review.userName || review.userId}`}
                                    style={styles.reviewCard}
                                    right={
                                        <View style={[styles.statusPill, review.status === "published" ? styles.statusPillPublished : styles.statusPillHidden]}>
                                            <Text style={[styles.statusPillText, review.status === "published" ? styles.statusPillTextPublished : styles.statusPillTextHidden]}>
                                                {review.status === "published" ? (isTurkish ? "Yayinda" : "Published") : isTurkish ? "Gizli" : "Hidden"}
                                            </Text>
                                        </View>
                                    }
                                >
                                    <Text style={styles.orderMeta}>{`#${review.orderId}`}</Text>
                                    {review.comment ? (
                                        <Text style={styles.commentText}>{review.comment}</Text>
                                    ) : (
                                        <Text style={styles.commentMuted}>{isTurkish ? "Sadece puan birakilmis." : "Rating only, no comment."}</Text>
                                    )}

                                    <TextInput
                                        value={draft}
                                        onChangeText={(value) => setReplyDrafts((prev) => ({ ...prev, [review.id]: value.slice(0, 300) }))}
                                        placeholder={isTurkish ? "Restoran cevabi yaz..." : "Write a restaurant reply..."}
                                        placeholderTextColor="#94A3B8"
                                        multiline
                                        style={styles.replyInput}
                                    />

                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity
                                            disabled={saving}
                                            onPress={() => void handleReplySave(review)}
                                            style={[styles.actionButton, styles.replyButton, saving ? styles.actionButtonDisabled : null]}
                                        >
                                            <Text style={[styles.actionButtonText, styles.replyButtonText]}>
                                                {isTurkish ? "Cevabi kaydet" : "Save reply"}
                                            </Text>
                                        </TouchableOpacity>
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
                            subtitle={isTurkish ? "Teslim edilen urunlerden yorum geldikce burada listelenecek." : "Delivered item reviews will appear here as they arrive."}
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
    orderMeta: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: panelDesign.colors.muted,
    },
    commentText: {
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
    replyInput: {
        minHeight: 84,
        borderRadius: panelDesign.radius.md,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: panelDesign.colors.text,
        fontFamily: "ChairoSans",
        fontSize: 14,
        textAlignVertical: "top",
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
    replyButton: {
        backgroundColor: "#FFF5EA",
        borderColor: "#EE7A14",
    },
    replyButtonText: {
        color: "#B94900",
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
