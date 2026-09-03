import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import type { CartItemType } from "@/type";
import { makeShadow } from "@/src/lib/shadowStyle";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";
import { useTheme } from "@/src/theme/themeContext";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";

const cardShadow = makeShadow({
    color: "#0F172A",
    offsetY: 12,
    blurRadius: 20,
    opacity: 0.08,
    elevation: 5,
});
const styles = createAdaptiveStyleSheet({
    card: { backgroundColor: "#FFFFFF", borderRadius: 28, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 },
    topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", columnGap: 12 },
    contentCol: { flex: 1, rowGap: 4, paddingRight: 8, minHeight: 60 },
    title: { fontFamily: "ChairoSans", fontSize: 15, lineHeight: 19, color: "#0F172A" },
    meta: { fontFamily: "ChairoSans", fontSize: 14, color: "#64748B" },
    bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", columnGap: 12, marginTop: 10 },
    qtyRow: { flexDirection: "row", alignItems: "center", columnGap: 8, borderRadius: 999, borderWidth: 1, borderColor: "#F2E7DA", paddingHorizontal: 8, paddingVertical: 4 },
    circleLight: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFF3EA", alignItems: "center", justifyContent: "center" },
    circlePrimary: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FE8C00", alignItems: "center", justifyContent: "center" },
    qtyText: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    total: { fontFamily: "ChairoSans", fontSize: 18, color: "#0F172A" },
    removeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});

type Props = {
    item: CartItemType;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
};

const CartItemCard = ({ item, onIncrease, onDecrease, onRemove }: Props) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    if (!item) return null;
    const price = Number(item.price ?? 0);
    const quantity = Number(item.quantity ?? 1);
    const customizationTotal = getCustomizationsTotal(item.customizations);
    const total = (price + customizationTotal) * quantity;
    const unitLabel = formatCurrency(price + customizationTotal);

    return (
        <View style={[styles.card, cardShadow, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.topRow}>
                <View className="flex-1" style={styles.contentCol}>
                    <Text style={[styles.title, { color: theme.colors.ink }]} numberOfLines={1} ellipsizeMode="tail">
                        {item.name}
                    </Text>
                    <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
                        {unitLabel} x {quantity}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={onRemove}
                    hitSlop={8}
                    accessibilityLabel={t("cart.screen.item.accessibility.remove")}
                >
                    <Icon name="trash" size={20} color="#FF6B6B" />
                </TouchableOpacity>
            </View>
            <View style={styles.bottomRow}>
                <View style={[styles.qtyRow, { borderColor: theme.colors.border }]}>
                    <TouchableOpacity
                        style={[styles.circleLight, { backgroundColor: theme.colors.surfaceMuted }]}
                        onPress={onDecrease}
                        hitSlop={8}
                        accessibilityLabel={t("cart.screen.item.accessibility.decrease")}
                    >
                        <Icon name="minus" size={16} color="#FE8C00" />
                    </TouchableOpacity>
                    <Text style={[styles.qtyText, { color: theme.colors.ink }]}>{item.quantity}</Text>
                    <TouchableOpacity
                        style={styles.circlePrimary}
                        onPress={onIncrease}
                        hitSlop={8}
                        accessibilityLabel={t("cart.screen.item.accessibility.increase")}
                    >
                        <Icon name="plus" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.total, { color: theme.colors.ink }]}>{formatCurrency(total)}</Text>
            </View>
        </View>
    );
};

export default CartItemCard;
