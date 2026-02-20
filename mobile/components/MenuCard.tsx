import { memo, useCallback, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useCartStore } from "@/store/cart.store";
import Icon from "./Icon";
import ReviewSheet from "@/src/features/reviews/ReviewSheet";
import { useProductReviews } from "@/src/features/reviews/useProductReviews";

type MenuCardProps = {
    item: any;
    onPress?: () => void;
    accentColor?: string;
};

const showToast = (message: string) => {
    if (Platform.OS === "android") {
        ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
        Alert.alert("Review", message);
    }
};

const formatPrice = (value?: number | string) => `TRY ${Number(value || 0).toFixed(2)}`;

const MenuCard = ({ item, onPress, accentColor = "#FE8C00" }: MenuCardProps) => {
    const { $id, image_url, imageUrl: fallbackImageUrl, name, price } = item || {};
    const resolvedImage = image_url ?? fallbackImageUrl;
    const imageUrl =
        typeof resolvedImage === "string" && resolvedImage.trim().toLowerCase().startsWith("http")
            ? resolvedImage.trim()
            : undefined;
    const { addItem } = useCartStore();
    const numericPrice = Number(price || 0);
    const fallbackProductId = $id ?? item?.id ?? name;
    const productId = fallbackProductId ? String(fallbackProductId) : `menu-${Date.now()}`;
    const { average, count, currentUserReview, submitReview, isSubmitting } = useProductReviews(productId);
    const [sheetVisible, setSheetVisible] = useState(false);
    const averageLabel = useMemo(() => average.toFixed(1), [average]);

    const description = item?.description || "Kampus icin sicak hazirlanir.";
    const eta = item?.deliveryTime || "15-25 dk";
    const cardAccent = accentColor || "#FE8C00";

    const handleAdd = useCallback(() => {
        addItem({
            id: String($id || item?.id || `menu-${Date.now()}`),
            name: name || "Menu Item",
            price: numericPrice || 0,
            image_url: imageUrl || "",
            restaurantId: (item as any).restaurantId || (item as any).restaurant_id,
            customizations: [],
        });
    }, [$id, addItem, imageUrl, item?.id, name, numericPrice, item?.restaurantId]);

    const handleSubmitReview = useCallback(
        async ({ rating, comment }: { rating: 1 | 2 | 3 | 4 | 5; comment?: string }) => {
            try {
                const result = await submitReview({ rating, comment });
                if (result?.error) {
                    Alert.alert("Unable to save review", result.error instanceof Error ? result.error.message : "Please try again.");
                } else {
                    showToast(
                        result?.queued
                            ? "You're offline. We'll send your review once you're connected."
                            : "Thanks for sharing your experience!",
                    );
                }
            } catch (error: any) {
                Alert.alert("Unable to save review", error?.message || "Please try again.");
            } finally {
                setSheetVisible(false);
            }
        },
        [submitReview],
    );

    return (
        <TouchableOpacity
            activeOpacity={0.92}
            onPress={onPress ?? (() => {})}
            style={[
                styles.card,
                { borderColor: `${cardAccent}18` },
                Platform.OS === "android" ? { elevation: 3, shadowColor: "#0F172A" } : {},
            ]}
        >
            <View style={styles.headerRow}>
                <Text style={[styles.price, { color: cardAccent }]}>{formatPrice(numericPrice)}</Text>
            </View>

            <View style={styles.row}>
                <View style={styles.textArea}>
                    <Text style={styles.title} numberOfLines={2}>
                        {name}
                    </Text>
                    <Text style={styles.description} numberOfLines={2}>
                        {description}
                    </Text>
                    <View style={styles.ratingRow}>
                        <Icon name="star" size={16} color={cardAccent} />
                        <Text style={styles.ratingValue}>{averageLabel}</Text>
                        <Text style={styles.ratingCount}>({count})</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <View style={[styles.metaChip, { backgroundColor: `${cardAccent}12` }]}>
                            <Icon name="clock" size={14} color={cardAccent} />
                            <Text style={[styles.metaText, { color: cardAccent }]}>{eta}</Text>
                        </View>
                        <View style={styles.metaChip}>
                            <Icon name="dollar" size={14} color="#0F172A" />
                            <Text style={styles.metaText}>Kampus indirimi</Text>
                        </View>
                    </View>
                </View>
                {imageUrl ? (
                    <View style={styles.imageShell}>
                        <Image
                            source={{ uri: imageUrl }}
                            style={styles.image}
                            contentFit="cover"
                            transition={300}
                        />
                    </View>
                ) : null}
            </View>

            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.secondaryCta, { borderColor: `${cardAccent}35`, backgroundColor: `${cardAccent}10` }]}
                    onPress={() => setSheetVisible(true)}
                >
                    <Text style={[styles.secondaryLabel, { color: cardAccent }]}>Deneyimini paylas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={handleAdd}
                    style={[styles.primaryCta, { backgroundColor: cardAccent }]}
                >
                    <Text style={styles.primaryLabel}>Cantaya ekle</Text>
                </TouchableOpacity>
            </View>

            <ReviewSheet
                visible={sheetVisible}
                onClose={() => setSheetVisible(false)}
                onSubmit={handleSubmitReview}
                submitting={isSubmitting}
                initialRating={currentUserReview?.rating}
                initialComment={currentUserReview?.comment}
            />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        gap: 12,
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
    },
    price: {
        fontFamily: "ChairoSans",
        fontSize: 20,
    },
    row: {
        flexDirection: "row",
        gap: 12,
    },
    textArea: {
        flex: 1,
        gap: 6,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: "#0F172A",
    },
    description: {
        fontFamily: "ChairoSans",
        color: "#475569",
        lineHeight: 18,
    },
    ratingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 2,
    },
    ratingValue: {
        fontFamily: "ChairoSans",
        color: "#0F172A",
    },
    ratingCount: {
        fontFamily: "ChairoSans",
        color: "#94A3B8",
        fontSize: 13,
    },
    metaRow: {
        flexDirection: "row",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 6,
    },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "#F1F5F9",
    },
    metaText: {
        fontFamily: "ChairoSans",
        color: "#0F172A",
        fontSize: 13,
    },
    imageShell: {
        width: 100,
        height: 100,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#F1F5F9",
    },
    image: {
        width: "100%",
        height: "100%",
    },
    actions: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    secondaryCta: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
    },
    secondaryLabel: {
        fontFamily: "ChairoSans",
        textAlign: "center",
    },
    primaryCta: {
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 999,
    },
    primaryLabel: {
        fontFamily: "ChairoSans",
        color: "#FFFFFF",
    },
});

export default memo(MenuCard);
