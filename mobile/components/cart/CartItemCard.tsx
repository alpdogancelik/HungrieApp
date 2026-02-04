import { Image } from "expo-image";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { images } from "@/constants/mediaCatalog";
import Icon from "@/components/Icon";
import type { CartItemType } from "@/type";
import { makeShadow } from "@/src/lib/shadowStyle";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";

const cardShadow = makeShadow({
    color: "#0F172A",
    offsetY: 12,
    blurRadius: 20,
    opacity: 0.08,
    elevation: 5,
});

type Props = {
    item: CartItemType;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
};

const CartItemCard = ({ item, onIncrease, onDecrease, onRemove }: Props) => {
    const { t } = useTranslation();
    if (!item) return null;
    const price = Number(item.price ?? 0);
    const quantity = Number(item.quantity ?? 1);
    const customizationTotal = getCustomizationsTotal(item.customizations);
    const total = (price + customizationTotal) * quantity;
    const chips = (item.customizations || []).map((c) => c.name).join(" / ");
    const unitLabel = formatCurrency(price + customizationTotal);

    return (
        <View className="bg-white rounded-[28px] flex-row gap-4 p-4 items-center" style={cardShadow}>
            {/* Image hidden per request */}
            {false && (
                <View className="w-20 h-20 rounded-3xl bg-[#FFF4EC] items-center justify-center overflow-hidden">
                    <Image
                        source={item.image_url ? { uri: item.image_url } : images.burgerTwo}
                        className="w-full h-full"
                        contentFit="cover"
                        transition={200}
                    />
                </View>
            )}
            <View className="flex-1 justify-between gap-3">
                <View className="gap-1 pr-2">
                    <Text className="text-lg font-ezra-bold text-dark-100" numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text className="caption text-dark-40">
                        {t("cart.screen.item.unitPrice", { price: unitLabel })}
                    </Text>
                    {chips ? (
                        <Text className="body-medium text-dark-60" numberOfLines={1}>
                            {chips}
                        </Text>
                    ) : (
                        <Text className="body-medium text-dark-60">{t("cart.screen.item.noCustomizations")}</Text>
                    )}
                </View>
                <View className="flex-row items-center gap-3">
                    <TouchableOpacity
                        className="size-10 rounded-full bg-[#FFE4D4] items-center justify-center"
                        onPress={onDecrease}
                        hitSlop={8}
                        accessibilityLabel={t("cart.screen.item.accessibility.decrease")}
                    >
                        <Icon name="minus" size={16} color="#FE8C00" />
                    </TouchableOpacity>
                    <Text className="paragraph-semibold text-dark-100">{item.quantity}</Text>
                    <TouchableOpacity
                        className="size-10 rounded-full bg-[#FE8C00] items-center justify-center"
                        onPress={onIncrease}
                        hitSlop={8}
                        accessibilityLabel={t("cart.screen.item.accessibility.increase")}
                    >
                        <Icon name="plus" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>
            <View className="items-end justify-between self-stretch py-1">
                <TouchableOpacity
                    className="size-10 rounded-full bg-[#FFE4D4] items-center justify-center"
                    onPress={onRemove}
                    hitSlop={8}
                    accessibilityLabel={t("cart.screen.item.accessibility.remove")}
                >
                    <Icon name="trash" size={18} color="#FF5C5C" />
                </TouchableOpacity>
                <Text className="h4-bold text-dark-100">{formatCurrency(total)}</Text>
            </View>
        </View>
    );
};

export default CartItemCard;
