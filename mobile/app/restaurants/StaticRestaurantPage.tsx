import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Asset } from "expo-asset";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import Icon from "@/components/Icon";
import { useCartStore } from "@/store/cart.store";
import { resolveRestaurantImageSource } from "@/lib/assets";
import { getCategoryLabel } from "@/src/lib/categoryLabels";

type MenuEntry = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categories?: string[];
};

type Category = { id: string; name: string };

type StaticPageConfig = {
    data: any;
    palette: {
        primary: string;
        secondary: string;
        accent: string;
    };
    subtitle?: string;
    badge?: string;
    categoryOrder?: string[];
    categoryTitles?: Record<string, string>;
};

const formatPrice = (value?: number) => `TRY ${Number(value ?? 0).toFixed(2)}`;

const groupByCategory = (items: MenuEntry[]) => {
    const bucket: Record<string, MenuEntry[]> = {};
    items.forEach((item) => {
        const categories = Array.isArray(item.categories) && item.categories.length ? item.categories : ["other"];
        categories.forEach((cat) => {
            const key = String(cat);
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(item);
        });
    });
    return bucket;
};

export const createStaticRestaurantPage = ({
    data,
    palette,
    subtitle,
    badge,
    categoryOrder,
    categoryTitles,
}: StaticPageConfig) => {
    const Page = () => {
        const router = useRouter();
        const { t, i18n } = useTranslation();
        const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
        const restaurant = data?.restaurants?.[0] ?? {};
        const menuItems: MenuEntry[] = Array.isArray(data?.menus) ? data.menus : [];
        const categories: Category[] = Array.isArray(data?.categories) ? data.categories : [];
        const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);
        const inferredOrder =
            categoryOrder && categoryOrder.length
                ? categoryOrder
                : categories.length
                    ? categories.map((c) => c.id)
                    : Object.keys(grouped);
        const firstAvailable = inferredOrder.find((key) => grouped[key]?.length) || inferredOrder[0] || "other";
        const [activeCategory, setActiveCategory] = useState<string>(firstAvailable);
        const activeItems = grouped[activeCategory] || [];
        const cartItems = useCartStore((state) => state.items);
        const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

        const heroImage = resolveRestaurantImageSource(restaurant.imageUrl || restaurant.image_url);
        const heroSource =
            typeof heroImage === "number"
                ? { uri: Asset.fromModule(heroImage).uri }
                : heroImage
                    ? { uri: heroImage }
                    : undefined;

        return (
            <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.secondary }]}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={[styles.hero, { backgroundColor: palette.secondary, borderColor: palette.primary }]}>
                        <TouchableOpacity style={[styles.backButton, { borderColor: palette.primary }]} onPress={() => router.back()}>
                            <Icon name="arrowBack" size={18} color={palette.accent} />
                        </TouchableOpacity>
                        <View style={[styles.heroGlow, { backgroundColor: palette.secondary }]} />
                        <View style={[styles.heroInner, { borderColor: palette.primary, backgroundColor: palette.secondary }]}>
                            {heroSource ? (
                                <Image source={heroSource} style={[styles.heroLogo, { borderColor: `${palette.primary}55` }]} contentFit="cover" />
                            ) : null}
                            <View style={styles.heroMeta}>
                                {restaurant.cuisine ? (
                                    <Text style={[styles.heroBadge, { color: palette.accent }]}>{restaurant.cuisine}</Text>
                                ) : null}
                                <Text style={[styles.heroTitle, { color: palette.accent }]}>{restaurant.name || "Restoran"}</Text>
                                <Text style={[styles.heroSubtitle, { color: palette.accent }]} numberOfLines={2}>
                                    {subtitle || restaurant.description || "Menüyü inceleyip hemen sipariş ver."}
                                </Text>
                                <View style={styles.heroChips}>
                                    {badge ? (
                                        <View style={[styles.heroChip, { borderColor: palette.primary, backgroundColor: `${palette.primary}12` }]}>
                                            <Text style={[styles.heroChipText, { color: palette.accent }]}>{badge}</Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.sheet, { borderColor: palette.primary, backgroundColor: `${palette.secondary}AA` }]}>
                        <Text style={[styles.sheetTitle, { color: palette.accent }]}>{t("restaurantUi.menu")}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                            {inferredOrder.map((cat) => {
                                const label =
                                    categoryTitles?.[cat] ||
                                    categories.find((c) => c.id === cat)?.name ||
                                    getCategoryLabel(cat, locale as any);
                                const isActive = activeCategory === cat;
                                return (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[
                                            styles.tabChip,
                                            {
                                                borderColor: isActive ? palette.accent : palette.primary,
                                                backgroundColor: isActive ? `${palette.primary}22` : `${palette.secondary}EE`,
                                            },
                                        ]}
                                        onPress={() => setActiveCategory(cat)}
                                    >
                                        <Text
                                            style={[
                                                styles.tabChipText,
                                                { color: isActive ? palette.accent : palette.accent },
                                                isActive ? styles.tabChipTextActive : null,
                                            ]}
                                        >
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.cardGrid}>
                            {activeItems.map((item) => (
                                <View key={item.id} style={[styles.menuCard, { borderColor: palette.primary, backgroundColor: `${palette.secondary}EE` }]}>
                                    <View style={{ flex: 1, gap: 6 }}>
                                        <Text style={[styles.menuTitle, { color: palette.accent }]}>{item.name}</Text>
                                        {item.description ? (
                                            <Text style={[styles.menuDesc, { color: palette.accent }]} numberOfLines={2}>
                                                {item.description}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <View style={styles.menuRight}>
                                        <Text style={[styles.menuPrice, { color: palette.primary }]}>{formatPrice(item.price)}</Text>
                                        <TouchableOpacity
                                            style={[styles.addButton, { backgroundColor: palette.primary }]}
                                            onPress={() =>
                                                useCartStore.getState().addItem({
                                                    id: String(item.id),
                                                    name: item.name,
                                                    price: Number(item.price || 0),
                                                    image_url: "",
                                                    customizations: [],
                                                })
                                            }
                                        >
                                        <Text style={[styles.addButtonText, { color: palette.accent }]}>{t("restaurantUi.addToCart")}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>

                <TouchableOpacity
                    style={[styles.cartFab, { backgroundColor: palette.primary, borderColor: palette.accent }]}
                    onPress={() => router.push("/(tabs)/cart")}
                >
                    <Icon name="bag" size={18} color={palette.accent} />
                    <Text style={[styles.cartFabText, { color: palette.accent }]}>{t("restaurantUi.cart", { count: cartCount })}</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    };

    return Page;
};

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 120, gap: 16 },
    hero: {
        position: "relative",
        borderRadius: 32,
        borderWidth: 1,
        padding: 14,
        overflow: "hidden",
    },
    backButton: {
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 2,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#FFF",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
    },
    heroGlow: {
        position: "absolute",
        inset: 0,
        borderRadius: 32,
        opacity: 0.9,
    },
    heroInner: {
        flexDirection: "row",
        gap: 16,
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        overflow: "hidden",
    },
    heroLogo: { width: 110, height: 110, borderRadius: 24, borderWidth: 1 },
    heroMeta: { flex: 1, gap: 8, justifyContent: "center" },
    heroBadge: { fontSize: 12, letterSpacing: 0.5, fontWeight: "600" },
    heroTitle: { fontSize: 26, fontWeight: "700" },
    heroSubtitle: { fontSize: 14, lineHeight: 18 },
    heroChips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: "#FFF",
    },
    heroChipText: { fontSize: 12, fontWeight: "600" },
    sheet: {
        marginHorizontal: 0,
        marginBottom: 16,
        padding: 14,
        borderRadius: 24,
        borderWidth: 1,
        gap: 12,
    },
    sheetTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    tabRow: { gap: 8, paddingVertical: 4 },
    tabChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
    },
    tabChipText: { fontSize: 13, fontWeight: "500" },
    tabChipTextActive: { fontWeight: "700" },
    cardGrid: { gap: 12 },
    menuCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 10,
        elevation: 4,
    },
    menuTitle: { fontSize: 16, fontWeight: "700" },
    menuDesc: { fontSize: 13 },
    menuRight: { alignItems: "flex-end", gap: 8 },
    menuPrice: { fontSize: 16, fontWeight: "700" },
    addButton: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
    },
    addButtonText: { fontSize: 12, fontWeight: "700" },
    cartFab: {
        position: "absolute",
        bottom: 20,
        right: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 10,
        elevation: 6,
    },
    cartFabText: { fontSize: 14, fontWeight: "700" },
});

export default createStaticRestaurantPage;
