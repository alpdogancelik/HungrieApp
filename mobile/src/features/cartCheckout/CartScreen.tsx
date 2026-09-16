import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { getRestaurantImageSource } from "@/lib/assets";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";
import { getRestaurantMenu } from "@/src/data/menuRepository";
import { getRestaurant } from "@/src/data/restaurantRepository";
import { useTheme } from "@/src/theme/themeContext";
import { useCartStore } from "@/store/cart.store";
import type { CartItemType } from "@/src/domain/types";
import {
    cartLineKey,
    extractRecommendations,
    FOOTER_CONTENT_HEIGHT,
    MINIMUM_ORDER_TOTAL,
    ORANGE,
    resolveCartRestaurantId,
    restaurantEta,
    restaurantRating,
    restaurantReviewCount,
    type Recommendation,
} from "./cartCheckoutModel";

const CartScreen = () => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { i18n, t } = useTranslation();
    const { variant } = useTheme();
    const dark = variant === "dark";
    const styles = useMemo(() => createStyles(dark), [dark]);
    const turkish = i18n.language?.toLowerCase().startsWith("tr");
    const copy = (en: string, tr: string) => turkish ? tr : en;

    const items = useCartStore((state) => state.items);
    const subtotal = useCartStore((state) => state.totalPrice);
    const increaseQty = useCartStore((state) => state.increaseQty);
    const decreaseQty = useCartStore((state) => state.decreaseQty);
    const removeItem = useCartStore((state) => state.removeItem);
    const clearCart = useCartStore((state) => state.clearCart);
    const addItem = useCartStore((state) => state.addItem);

    const restaurantId = useMemo(() => resolveCartRestaurantId(items), [items]);
    const [restaurant, setRestaurant] = useState<any>(null);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [recommendationsLoading, setRecommendationsLoading] = useState(false);
    const belowMinimum = subtotal < MINIMUM_ORDER_TOTAL;
    const navigationClearance = 45 + Math.max(insets.bottom, Platform.OS === "web" ? 8 : 0);

    useEffect(() => {
        setRestaurant(null);
        if (!restaurantId) return;
        let mounted = true;
        void getRestaurant(restaurantId).then((result) => {
            if (mounted && result) setRestaurant(result);
        }).catch(() => undefined);
        return () => { mounted = false; };
    }, [restaurantId]);

    useEffect(() => {
        if (!restaurantId || !items.length) {
            setRecommendations([]);
            return;
        }
        let mounted = true;
        const cartIds = new Set(items.map((item) => String(item.id)));
        setRecommendations([]);
        setRecommendationsLoading(true);
        void getRestaurantMenu({ restaurantId }).then((menu) => {
            const resolved = extractRecommendations(menu || [], restaurantId, cartIds);
            if (mounted) setRecommendations(resolved);
        }).catch(() => { if (mounted) setRecommendations([]); }).finally(() => {
            if (mounted) setRecommendationsLoading(false);
        });
        return () => { mounted = false; };
    }, [items, restaurantId]);

    const confirmClearCart = () => Alert.alert(
        copy("Clear cart?", "Sepet temizlensin mi?"),
        copy("All products in this cart will be removed.", "Sepetteki tüm ürünler kaldırılacak."),
        [
            { text: t("common.cancel"), style: "cancel" },
            { text: copy("Clear", "Temizle"), style: "destructive", onPress: clearCart },
        ],
    );

    const showPromotionUnavailable = () => Alert.alert(
        copy("Promotion codes", "İndirim kodları"),
        copy("Promotion-code entry is not available yet.", "İndirim kodu girişi henüz kullanılamıyor."),
    );

    const addRecommendation = (item: Recommendation) => addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.imageUrl || "",
        restaurantId: item.restaurantId,
        customizations: [],
    });

    if (!items.length) {
        return (
            <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
                <StatusBar style={dark ? "light" : "dark"} />
                <TransactionHeader title={copy("Cart", "Sepet")} styles={styles} />
                <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><Ionicons color={ORANGE} name="cart-outline" size={34} /></View>
                    <Text style={styles.emptyTitle}>{t("cart.empty.title")}</Text>
                    <Text style={styles.emptyMessage}>{t("cart.empty.subtitle")}</Text>
                    <Pressable accessibilityRole="button" onPress={() => router.replace("/home")} style={styles.emptyButton}><Text style={styles.emptyButtonText}>{t("cart.empty.cta")}</Text></Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const restaurantName = restaurant?.name || copy("Restaurant", "Restoran");
    const rating = restaurantRating(restaurant);
    const reviews = restaurantReviewCount(restaurant);
    const eta = restaurantEta(restaurant, Boolean(turkish));
    const restaurantSource = getRestaurantImageSource(restaurant?.logoUrl || restaurant?.logo || restaurant?.imageUrl || restaurant?.image_url, undefined, restaurantName);

    const header = (
        <>
            <View style={styles.restaurantSummary}>
                <Pressable
                    accessibilityLabel={copy(`Open ${restaurantName} menu`, `${restaurantName} menüsünü aç`)}
                    accessibilityRole="button"
                    disabled={!restaurantId}
                    onPress={() => {
                        if (restaurantId) router.push({ pathname: "/restaurants/[id]", params: { id: restaurantId } });
                    }}
                    style={styles.restaurantMain}
                >
                    <View style={styles.restaurantMainContent}>
                        <View style={styles.restaurantLogoShell}><Image contentFit="contain" source={restaurantSource} style={styles.restaurantLogo} /></View>
                        <View style={styles.flex}>
                            <Text numberOfLines={1} style={styles.restaurantName}>{restaurantName}</Text>
                            <View style={styles.restaurantMeta}>
                                <Ionicons color="#FFB800" name="star" size={14} />
                                <Text numberOfLines={1} style={styles.restaurantMetaText}>{rating || copy("New", "Yeni")}{reviews ? ` (${reviews})` : ""} · {eta}</Text>
                            </View>
                            <Text style={styles.restaurantMinimum}>{copy("Minimum order", "Min. sipariş tutarı")} {formatCurrency(MINIMUM_ORDER_TOTAL)}</Text>
                        </View>
                    </View>
                </Pressable>
                <Pressable accessibilityLabel={copy("Clear cart", "Sepeti temizle")} accessibilityRole="button" hitSlop={8} onPress={confirmClearCart} style={styles.iconButton}><Ionicons color={styles.muted.color} name="trash-outline" size={20} /></Pressable>
            </View>

            <View style={styles.pagePadding}>
                <Pressable accessibilityRole="button" onPress={showPromotionUnavailable} style={styles.discountRow}>
                    <View style={styles.discountIcon}><Ionicons color={ORANGE} name="pricetag-outline" size={22} /></View>
                    <View style={styles.flex}><Text style={styles.discountTitle}>{copy("Enter discount code", "İndirim kodu gir")}</Text><Text style={styles.discountSubtitle}>{copy("Add a coupon or campaign code", "Kupon veya kampanya kodu ekle")}</Text></View>
                    <Ionicons color={styles.text.color} name="chevron-forward" size={18} />
                </Pressable>
                <Text style={styles.sectionTitle}>{copy("Products", "Ürünler")}</Text>
            </View>
        </>
    );

    const footer = recommendations.length || recommendationsLoading ? (
        <View style={styles.recommendationSection}>
            <View style={styles.recommendationHeader}><Text style={styles.recommendationTitle}>{copy("Goes well with", "Yanında iyi gider")}</Text>{recommendations.length ? <Text style={styles.seeAll}>{copy("See all", "Tümünü gör")}</Text> : null}</View>
            {recommendationsLoading && !recommendations.length ? <ActivityIndicator color={ORANGE} style={styles.loader} /> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendationList}>
                    {recommendations.slice(0, 8).map((item) => <RecommendationCard item={item} key={item.id} onAdd={() => addRecommendation(item)} styles={styles} />)}
                </ScrollView>
            )}
        </View>
    ) : null;

    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
            <StatusBar style={dark ? "light" : "dark"} />
            <TransactionHeader title={copy("Cart", "Sepet")} styles={styles} />
            <FlatList
                contentContainerStyle={{ paddingBottom: FOOTER_CONTENT_HEIGHT + navigationClearance + 20 }}
                data={items}
                ItemSeparatorComponent={() => <View style={styles.itemDivider} />}
                keyExtractor={cartLineKey}
                ListFooterComponent={footer}
                ListHeaderComponent={header}
                renderItem={({ item }) => <CartItemRow item={item} onDecrease={() => decreaseQty(item.id, item.customizations || [])} onIncrease={() => increaseQty(item.id, item.customizations || [])} onRemove={() => removeItem(item.id, item.customizations || [])} styles={styles} />}
                showsVerticalScrollIndicator={false}
            />
            <TransactionFooter
                amount={formatCurrency(subtotal)}
                disabled={belowMinimum}
                label={belowMinimum ? copy(`Add ${formatCurrency(MINIMUM_ORDER_TOTAL - subtotal)} more`, `${formatCurrency(MINIMUM_ORDER_TOTAL - subtotal)} daha ekle`) : copy("Proceed to payment", "Ödemeye Geç")}
                bottom={navigationClearance}
                onPress={() => router.push("/checkout")}
                safeBottom={8}
                styles={styles}
                totalLabel={copy("Total", "Toplam")}
            />
        </SafeAreaView>
    );
};

type Styles = ReturnType<typeof createStyles>;

const TransactionHeader = ({ title, styles }: { title: string; styles: Styles }) => (
    <View style={styles.header}><Text numberOfLines={1} style={styles.headerTitle}>{title}</Text></View>
);

const CartItemRow = ({ item, onIncrease, onDecrease, onRemove, styles }: { item: CartItemType; onIncrease: () => void; onDecrease: () => void; onRemove: () => void; styles: Styles }) => {
    const { i18n } = useTranslation();
    const turkish = i18n.language?.startsWith("tr");
    const unitPrice = Number(item.price || 0) + getCustomizationsTotal(item.customizations);
    const modifiers = (item.customizations || []).map((option) => option.name).filter(Boolean).join(", ");
    const source = getRestaurantImageSource(item.image_url, undefined, item.name);
    return <View style={styles.cartItemRow}>
        <Image contentFit="cover" source={source} style={styles.productImage} />
        <View style={styles.cartItemContent}>
            <View style={styles.cartItemTop}><Text numberOfLines={2} style={styles.productName}>{item.name}</Text><Pressable accessibilityLabel={turkish ? "Ürünü kaldır" : "Remove product"} accessibilityRole="button" hitSlop={8} onPress={onRemove} style={styles.removeButton}><Ionicons color="#E52521" name="trash-outline" size={19} /></Pressable></View>
            {modifiers ? <Text numberOfLines={2} style={styles.modifierText}>{modifiers}</Text> : null}
            <Text style={styles.productPrice}>{formatCurrency(unitPrice)}</Text>
            <View style={styles.stepper}>
                <Pressable accessibilityLabel={turkish ? "Azalt" : "Decrease"} accessibilityRole="button" hitSlop={5} onPress={onDecrease} style={styles.minusButton}><Ionicons color={styles.text.color} name="remove" size={17} /></Pressable>
                <Text style={styles.quantity}>{item.quantity}</Text>
                <Pressable accessibilityLabel={turkish ? "Artır" : "Increase"} accessibilityRole="button" hitSlop={5} onPress={onIncrease} style={styles.plusButton}><Ionicons color="#FFFFFF" name="add" size={19} /></Pressable>
            </View>
        </View>
    </View>;
};

const RecommendationCard = ({ item, onAdd, styles }: { item: Recommendation; onAdd: () => void; styles: Styles }) => {
    const source = getRestaurantImageSource(item.imageUrl, undefined, item.name);
    return <View style={styles.recommendationCard}>
        <Image contentFit="contain" source={source} style={styles.recommendationImage} />
        <View style={styles.recommendationCopy}><Text numberOfLines={1} style={styles.recommendationName}>{item.name}</Text>{item.description ? <Text numberOfLines={1} style={styles.recommendationDescription}>{item.description}</Text> : null}<View style={styles.recommendationBottom}><Text style={styles.recommendationPrice}>{formatCurrency(item.price)}</Text><Pressable accessibilityLabel={`Add ${item.name}`} accessibilityRole="button" hitSlop={6} onPress={onAdd} style={styles.recommendationAdd}><Ionicons color="#FFFFFF" name="add" size={18} /></Pressable></View></View>
    </View>;
};

const TransactionFooter = ({ amount, label, totalLabel, disabled, onPress, bottom, safeBottom, styles }: { amount: string; label: string; totalLabel: string; disabled: boolean; onPress: () => void; bottom: number; safeBottom: number; styles: Styles }) => <View style={[styles.footer, { bottom, paddingBottom: Math.max(safeBottom, 8) }]}>
    <View><Text style={styles.footerLabel}>{totalLabel}</Text><Text style={styles.footerAmount}>{amount}</Text></View>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.primaryDisabled]}><Text numberOfLines={1} style={[styles.primaryText, disabled && styles.primaryTextDisabled]}>{label}</Text>{!disabled ? <Ionicons color="#FFFFFF" name="arrow-forward" size={20} /> : null}</Pressable>
</View>;

const createStyles = (dark: boolean) => {
    const c = { bg: dark ? "#0F1115" : "#FAFBFC", surface: dark ? "#171A20" : "#FFFFFF", text: dark ? "#F5F7FA" : "#111318", muted: dark ? "#98A2B3" : "#667085", tertiary: dark ? "#778293" : "#98A2B3", border: dark ? "#2A2E35" : "#EAECF0", subtle: dark ? "#22262E" : "#F5F6F8" };
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.bg }, flex: { flex: 1, minWidth: 0 }, text: { color: c.text }, muted: { color: c.muted }, pressed: { opacity: 0.65 }, primaryPressed: { backgroundColor: "#E94F00" },
        header: { height: 52, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, headerTitle: { color: c.text, textAlign: "center", fontSize: 21, lineHeight: 26, fontWeight: "700" },
        restaurantSummary: { minHeight: 82, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, flexDirection: "row", alignItems: "center" }, restaurantMain: { flex: 1, minWidth: 0 }, restaurantMainContent: { flexDirection: "row", alignItems: "center", gap: 12 }, restaurantLogoShell: { width: 56, height: 56, borderRadius: 11, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }, restaurantLogo: { width: "100%", height: "100%" }, restaurantName: { color: c.text, fontSize: 17, lineHeight: 21, fontWeight: "700" }, restaurantMeta: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 4 }, restaurantMetaText: { flex: 1, color: c.muted, fontSize: 12.5, lineHeight: 16 }, restaurantMinimum: { marginTop: 2, color: c.muted, fontSize: 12.5, lineHeight: 16 }, iconButton: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
        pagePadding: { paddingHorizontal: 20 }, discountRow: { width: "100%", minHeight: 72, marginTop: 16, borderWidth: 1, borderStyle: "dashed", borderColor: ORANGE, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface }, discountIcon: { width: 28, alignItems: "center" }, discountTitle: { color: c.text, fontSize: 15, lineHeight: 19, fontWeight: "600" }, discountSubtitle: { marginTop: 2, color: c.muted, fontSize: 12.5, lineHeight: 16 }, sectionTitle: { marginTop: 24, marginBottom: 9, color: c.text, fontSize: 20, lineHeight: 25, fontWeight: "700" },
        cartItemRow: { minHeight: 132, paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: c.surface }, productImage: { width: 76, height: 76, borderRadius: 10, backgroundColor: c.subtle }, cartItemContent: { flex: 1, minWidth: 0 }, cartItemTop: { minHeight: 22, flexDirection: "row", alignItems: "flex-start", gap: 6 }, productName: { flex: 1, color: c.text, fontSize: 15.5, lineHeight: 19, fontWeight: "600" }, removeButton: { width: 32, height: 28, alignItems: "flex-end", justifyContent: "flex-start" }, modifierText: { marginTop: 2, paddingRight: 28, color: c.muted, fontSize: 12.5, lineHeight: 16 }, productPrice: { marginTop: 5, color: ORANGE, fontSize: 15.5, lineHeight: 19, fontWeight: "700" }, stepper: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 12 }, minusButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.subtle }, plusButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: ORANGE }, quantity: { minWidth: 16, color: c.text, fontSize: 14, lineHeight: 18, fontWeight: "600", textAlign: "center" }, itemDivider: { height: StyleSheet.hairlineWidth, marginLeft: 110, backgroundColor: c.border },
        recommendationSection: { paddingTop: 18, paddingBottom: 18, backgroundColor: c.bg }, recommendationHeader: { paddingHorizontal: 20, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, recommendationTitle: { color: c.text, fontSize: 19, lineHeight: 24, fontWeight: "700" }, seeAll: { color: ORANGE, fontSize: 14, lineHeight: 18, fontWeight: "500" }, recommendationList: { paddingHorizontal: 20, gap: 10 }, recommendationCard: { width: 142, minHeight: 180, borderRadius: 15, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }, recommendationImage: { width: "100%", height: 91, backgroundColor: c.subtle }, recommendationCopy: { flex: 1, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 8 }, recommendationName: { color: c.text, fontSize: 13.5, lineHeight: 17, fontWeight: "600" }, recommendationDescription: { marginTop: 1, color: c.muted, fontSize: 11.5, lineHeight: 14 }, recommendationBottom: { flex: 1, minHeight: 36, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 4 }, recommendationPrice: { flexShrink: 1, color: ORANGE, fontSize: 13.5, lineHeight: 17, fontWeight: "700" }, recommendationAdd: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: ORANGE }, loader: { height: 90 },
        footer: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: FOOTER_CONTENT_HEIGHT, paddingTop: 10, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, footerLabel: { color: c.text, fontSize: 12.5, lineHeight: 16, fontWeight: "500" }, footerAmount: { marginTop: 1, color: c.text, fontSize: 21, lineHeight: 25, fontWeight: "700" }, primaryButton: { width: "62%", height: 53, borderRadius: 17, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: ORANGE }, primaryDisabled: { backgroundColor: dark ? "#343942" : "#E4E7EC" }, primaryText: { flexShrink: 1, color: "#FFFFFF", fontSize: 16, lineHeight: 20, fontWeight: "600", textAlign: "center" }, primaryTextDisabled: { color: c.tertiary },
        emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 52 }, emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: dark ? "#3A251C" : "#FFF4EC" }, emptyTitle: { marginTop: 18, color: c.text, fontSize: 24, lineHeight: 30, fontWeight: "700", textAlign: "center" }, emptyMessage: { marginTop: 6, color: c.muted, fontSize: 15, lineHeight: 21, textAlign: "center" }, emptyButton: { minHeight: 50, marginTop: 20, borderRadius: 16, paddingHorizontal: 24, alignItems: "center", justifyContent: "center", backgroundColor: ORANGE }, emptyButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
    });
};

export default CartScreen;
