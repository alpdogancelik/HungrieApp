import { memo, useCallback, useMemo, useState } from "react";
import { Alert, Platform, Text, ToastAndroid, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useCartStore } from "@/store/cart.store";
import Icon from "./Icon";
import ReviewSheet from "@/src/features/reviews/ReviewSheet";
import { useProductReviews } from "@/src/features/reviews/useProductReviews";

type MenuCardProps = {
    item: any;
    onPress?: () => void;
};

const showToast = (message: string) => {
    if (Platform.OS === "android") {
        ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
        Alert.alert("Review", message);
    }
};

const MenuCard = ({ item, onPress }: MenuCardProps) => {
    const { $id, image_url, imageUrl: fallbackImageUrl, name, price } = item || {};
    const resolvedImage = image_url || fallbackImageUrl;
    const imageUrl = resolvedImage?.startsWith("http") ? resolvedImage : undefined;
    const { addItem } = useCartStore();
    const numericPrice = Number(price || 0);
    const fallbackProductId = $id ?? item?.id ?? name;
    const productId = fallbackProductId ? String(fallbackProductId) : `menu-${Date.now()}`;
    const { average, count, currentUserReview, submitReview, isSubmitting } = useProductReviews(productId);
    const [sheetVisible, setSheetVisible] = useState(false);
    const averageLabel = useMemo(() => average.toFixed(1), [average]);

    const handleAdd = useCallback(() => {
        addItem({
            id: String($id || item?.id || `menu-${Date.now()}`),
            name: name || "Menu Item",
            price: numericPrice || 0,
            image_url: imageUrl || '',
            customizations: [],
        });
    }, [$id, addItem, imageUrl, item?.id, name, numericPrice]);

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
            onPress={onPress ?? (() => { })}
            className="menu-card"
            style={Platform.OS === 'android' ? { elevation: 6, shadowColor: '#0F172A' } : {}}
        >
            <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1 gap-2">
                    <Text className="body-medium uppercase text-dark-60 tracking-[2px]">chef's pick</Text>
                    <Text className="text-2xl font-ezra-bold text-dark-100" numberOfLines={2}>{name}</Text>
                    <Text className="paragraph-semibold text-primary-dark">TRY {numericPrice.toFixed(2)}</Text>
                    <View className="flex-row items-center gap-2">
                        <Icon name="star" size={16} color="#FE8C00" />
                        <Text className="paragraph-semibold text-dark-100">{averageLabel}</Text>
                        <Text className="body-medium text-dark-60">({count})</Text>
                    </View>
                </View>
                {imageUrl && (
                    <Image
                        source={{ uri: imageUrl }}
                        className="h-24 w-24 -mr-3 -mt-4"
                        contentFit="cover"
                        transition={300}
                    />
                )}
            </View>

            <View className="mt-5 gap-3">
                <TouchableOpacity
                    className="self-start px-4 py-2 rounded-full border border-primary/20 bg-primary/10"
                    onPress={() => setSheetVisible(true)}
                >
                    <Text className="paragraph-semibold text-primary-dark">Share your experience</Text>
                </TouchableOpacity>
            </View>

            <View className="mt-3 flex-row items-center justify-between">
                <View className="chip bg-primary/10 border-transparent">
                    <Text className="body-medium text-primary-dark">15-25 min</Text>
                </View>
                <TouchableOpacity
                    onPress={handleAdd}
                    className="px-4 py-2 rounded-full bg-dark-100"
                >
                    <Text className="paragraph-semibold text-white">Add to bag</Text>
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

export default memo(MenuCard);

