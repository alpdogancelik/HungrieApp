import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { images } from "@/constants/mediaCatalog";
import { getRestaurantImageSource } from "@/lib/assets";
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
    variant?: "list" | "grid";
}

const formatCurrency = (value?: string | number) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const buildImageSource = (rawImage: any) => getRestaurantImageSource(rawImage, images.logo);

const RestaurantCard = ({ restaurant, onPress, variant = "list" }: Props) => {
    const {
        name,
        cuisine,
        rating,
        reviewCount,
        deliveryTime,
        deliveryFee,
        imageUrl,
    } = restaurant;
    const imageSource = buildImageSource(imageUrl);
    const isGrid = variant === "grid";

    const className = isGrid ? undefined : "restaurant-card";

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            className={className}
            onPress={onPress}
            style={isGrid ? styles.tileCard : styles.listCard}
        >
            <View style={isGrid ? styles.tileImageShell : styles.imageShell}>
                <Image
                    source={imageSource}
                    style={styles.image}
                    contentFit="cover"
                    transition={300}
                />
            </View>
            <View style={isGrid ? [styles.info, styles.tileInfo] : styles.info}>
                <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>
                        {name}
                    </Text>
                    {/* Temporarily hide rating pill */}
                    {false && (
                        <View className="rating-pill">
                            <Icon name="star" size={14} color="#FFB703" style={{ marginRight: 4 }} />
                            <Text className="paragraph-semibold text-dark-100">
                                {rating ? `${Number(rating).toFixed(1)}` : "New"}
                            </Text>
                        </View>
                    )}
                </View>
                <Text className="body-medium">{cuisine || "World Kitchen"}</Text>
                <View className="flex-row flex-wrap gap-2">
                    {/* Temporarily hide delivery time */}
                    {false &&
                        deliveryTime && (
                            <View className="info-chip">
                                <Icon name="clock" size={14} color="#FE8C00" />
                                <Text className="body-medium text-dark-80">{deliveryTime} min</Text>
                            </View>
                        )}
                    {/* Temporarily hide delivery fee chip */}
                    {false &&
                        deliveryFee && (
                            <View className="info-chip">
                                <Icon name="dollar" size={14} color="#FE8C00" />
                                <Text className="body-medium text-dark-80">{`${formatCurrency(deliveryFee)} fee`}</Text>
                            </View>
                        )}
                    {/* Temporarily hide review count */}
                    {false &&
                        reviewCount !== undefined && (
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

const styles = StyleSheet.create({
    listCard: { flexDirection: "row", gap: 12 },
    tileCard: { flexDirection: "column", gap: 10, alignItems: "flex-start", width: "100%" },
    imageShell: { width: 112, height: 112, borderRadius: 24, overflow: "hidden", backgroundColor: "#FEF3E7" },
    tileImageShell: { width: "100%", aspectRatio: 1, borderRadius: 18, overflow: "hidden", backgroundColor: "#FEF3E7" },
    image: { width: "100%", height: "100%" },
    info: { flex: 1, gap: 6 },
    tileInfo: { width: "100%", flex: 0 },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
    title: { fontSize: 17, fontFamily: "ChairoSans", color: "#0F172A", flex: 1 },
});

export default memo(RestaurantCard);
