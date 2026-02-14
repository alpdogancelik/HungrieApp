import { Image } from "expo-image";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
const styles = StyleSheet.create({
    card: { backgroundColor: "#FFFFFF", borderRadius: 28, flexDirection: "row", padding: 16, alignItems: "center", columnGap: 16 },
    contentCol: { flex: 1, justifyContent: "space-between", rowGap: 12 },
    title: { fontFamily: "ChairoSans", fontSize: 18, color: "#0F172A" },
    meta: { fontFamily: "ChairoSans", fontSize: 12, color: "#64748B" },
    body: { fontFamily: "ChairoSans", fontSize: 14, color: "#334155" },
    qtyRow: { flexDirection: "row", alignItems: "center", columnGap: 12 },
    circleLight: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFE4D4", alignItems: "center", justifyContent: "center" },
    circlePrimary: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FE8C00", alignItems: "center", justifyContent: "center" },
    qtyText: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    rightCol: { alignItems: "flex-end", justifyContent: "space-between", alignSelf: "stretch", paddingVertical: 4 },
    total: { fontFamily: "ChairoSans", fontSize: 20, color: "#0F172A" },
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
        <View className="bg-white rounded-[28px] flex-row gap-4 p-4 items-center" style={[styles.card, cardShadow]}>
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
            <View className="flex-1 justify-between gap-3" style={styles.contentCol}>
                <View className="gap-1 pr-2">
                    <Text className="text-lg font-ezra-bold text-dark-100" style={styles.title} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text className="caption text-dark-40" style={styles.meta}>
                        {t("cart.screen.item.unitPrice", { price: unitLabel })}
                    </Text>
                    {chips ? (
                        <Text className="body-medium text-dark-60" style={styles.body} numberOfLines={1}>
                            {chips}
                        </Text>
                    ) : (
                        <Text className="body-medium text-dark-60" style={styles.body}>{t("cart.screen.item.noCustomizations")}</Text>
                    )}
                </View>
                <View className="flex-row items-center gap-3" style={styles.qtyRow}>
                    <TouchableOpacity
                        className="size-10 rounded-full bg-[#FFE4D4] items-center justify-center"
                        style={styles.circleLight}
                        onPress={onDecrease}
                        hitSlop={8}
                        accessibilityLabel={t("cart.screen.item.accessibility.decrease")}
                    >
                        <Icon name="minus" size={16} color="#FE8C00" />
                    </TouchableOpacity>
                    <Text className="paragraph-semibold text-dark-100" style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity
                        className="size-10 rounded-full bg-[#FE8C00] items-center justify-center"
                        style={styles.circlePrimary}
                        onPress={onIncrease}
                        hitSlop={8}
                        accessibilityLabel={t("cart.screen.item.accessibility.increase")}
                    >
                        <Icon name="plus" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>
            <View className="items-end justify-between self-stretch py-1" style={styles.rightCol}>
                <TouchableOpacity
                    className="size-10 rounded-full bg-[#FFE4D4] items-center justify-center"
                    style={styles.circleLight}
                    onPress={onRemove}
                    hitSlop={8}
                    accessibilityLabel={t("cart.screen.item.accessibility.remove")}
                >
                    <Icon name="trash" size={18} color="#FF5C5C" />
                </TouchableOpacity>
                <Text className="h4-bold text-dark-100" style={styles.total}>{formatCurrency(total)}</Text>
            </View>
        </View>
    );
};

export default CartItemCard;
