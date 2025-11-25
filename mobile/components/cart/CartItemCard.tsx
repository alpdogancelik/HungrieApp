import { Image } from "expo-image";
import { Text, TouchableOpacity, View } from "react-native";
import { images } from "@/constants/mediaCatalog";
import Icon from "@/components/Icon";
import type { CartItemType } from "@/type";
import { cardShadow } from "./styles";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";

type Props = {
    item: CartItemType;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
};

const CartItemCard = ({ item, onIncrease, onDecrease, onRemove }: Props) => {
    if (!item) return null;

    const price = Number(item.price ?? 0);
    const quantity = Number(item.quantity ?? 1);
    const customizationTotal = getCustomizationsTotal(item.customizations);
    const total = (price + customizationTotal) * quantity;
    const chips = (item.customizations || []).map((c) => c.name).join(" / ");

    return (
        <View className="bg-white rounded-[32px] flex-row gap-4 p-4" style={cardShadow}>
            <View className="w-24 h-24 rounded-3xl bg-[#FFF4EC] items-center justify-center overflow-hidden">
                <Image
                    source={item.image_url ? { uri: item.image_url } : images.burgerTwo}
                    className="w-full h-full"
                    contentFit="cover"
                    transition={200}
                />
            </View>
            <View className="flex-1 justify-between">
                <View className="gap-1">
                    <Text className="text-xl font-ezra-bold text-dark-100" numberOfLines={1}>
                        {item.name}
                    </Text>
                    {chips ? (
                        <Text className="body-medium text-dark-60" numberOfLines={1}>
                            {chips}
                        </Text>
                    ) : (
                        <Text className="body-medium text-dark-60">Campus favorite</Text>
                    )}
                </View>
                <View className="flex-row items-center gap-3">
                    <TouchableOpacity className="size-10 rounded-full bg-[#FFE4D4] items-center justify-center" onPress={onDecrease}>
                        <Icon name="minus" size={16} color="#FE8C00" />
                    </TouchableOpacity>
                    <Text className="paragraph-semibold text-dark-100">{item.quantity}</Text>
                    <TouchableOpacity className="size-10 rounded-full bg-[#FE8C00] items-center justify-center" onPress={onIncrease}>
                        <Icon name="plus" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>
            <View className="items-end justify-between">
                <TouchableOpacity className="size-10 rounded-full bg-[#FFE4D4] items-center justify-center" onPress={onRemove}>
                    <Icon name="trash" size={18} color="#FF5C5C" />
                </TouchableOpacity>
                <Text className="paragraph-semibold text-dark-100">{formatCurrency(total)}</Text>
            </View>
        </View>
    );
};

export default CartItemCard;

