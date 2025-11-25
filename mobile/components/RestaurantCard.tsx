import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { images } from "@/constants/mediaCatalog";
import { resolveRestaurantImageSource } from "@/lib/assets";
import Icon from "./Icon";

type Restaurant = {
    id: number;
    name: string;
    cuisine?: string;
    rating?: number;
    reviewCount?: number;
    deliveryTime?: string;
    deliveryFee?: string;
    imageUrl?: string | number;
};

interface Props {
    restaurant: Restaurant;
    onPress?: () => void;
}

const formatCurrency = (value?: string | number) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const RestaurantCard = ({ restaurant, onPress }: Props) => {
    const {
        name,
        cuisine,
        rating,
        reviewCount,
        deliveryTime,
        deliveryFee,
        imageUrl,
    } = restaurant;
    const badgeText = rating ? `${Number(rating).toFixed(1)}` : "New";

    const resolvedImage = resolveRestaurantImageSource(imageUrl);
    const imageSource =
        typeof resolvedImage === "number"
            ? resolvedImage
            : resolvedImage
                ? { uri: resolvedImage }
                : images.logo;

    return (
        <TouchableOpacity activeOpacity={0.9} className="restaurant-card" onPress={onPress}>
            <View className="w-28 h-28 rounded-3xl overflow-hidden bg-primary/10">
                <Image
                    source={imageSource}
                    className="w-full h-full"
                    contentFit="cover"
                    transition={300}
                />
            </View>
            <View className="flex-1 gap-2">
                <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-lg font-ezra-bold text-dark-100 flex-1" numberOfLines={1}>
                        {name}
                    </Text>
                    <View className="rating-pill">
                        <Icon name="star" size={14} color="#FFB703" style={{ marginRight: 4 }} />
                        <Text className="paragraph-semibold text-dark-100">{badgeText}</Text>
                    </View>
                </View>
                <Text className="body-medium">{cuisine || "World Kitchen"}</Text>
                <View className="flex-row flex-wrap gap-2">
                    {deliveryTime && (
                        <View className="info-chip">
                            <Icon name="clock" size={14} color="#FE8C00" />
                            <Text className="body-medium text-dark-80">{deliveryTime} min</Text>
                        </View>
                    )}
                    {deliveryFee && (
                        <View className="info-chip">
                            <Icon name="dollar" size={14} color="#FE8C00" />
                            <Text className="body-medium text-dark-80">{`${formatCurrency(deliveryFee)} fee`}</Text>
                        </View>
                    )}
                    {reviewCount !== undefined && (
                        <View className="info-chip">
                            <Icon name="profile" size={14} color="#FE8C00" />
                            <Text className="body-medium text-dark-80">{reviewCount} reviews</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
};

export default memo(RestaurantCard);

