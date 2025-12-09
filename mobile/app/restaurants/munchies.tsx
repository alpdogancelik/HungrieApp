import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { getCategoryLabel as translateCategoryLabel } from "@/src/lib/categoryLabels";

// Local Munchies data
// eslint-disable-next-line @typescript-eslint/no-var-requires
const munchiesData = require("../../data/munchies-firestore.json");

const CATEGORY_ORDER = ["burgers", "wraps", "toast", "gozleme", "crispy", "soups", "drinks"];

type MenuEntry = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categories?: string[];
};

const formatPrice = (value?: number) => `TRY ${Number(value ?? 0).toFixed(2)}`;

const groupByCategory = (items: MenuEntry[]) => {
    const bucket: Record<string, MenuEntry[]> = {};
    items.forEach((item) => {
        const categories = Array.isArray(item.categories) && item.categories.length ? item.categories : ["diger"];
        categories.forEach((cat) => {
            const key = String(cat);
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(item);
        });
    });
    return bucket;
};

const MenuList = ({ items, addLabel }: { items: MenuEntry[]; addLabel: string }) => {
    const { addItem } = useCartStore();
    if (!items.length) return null;

    return (
        <View style={styles.cardGrid}>
            {items.map((item) => (
                <View key={item.id} style={styles.menuCard}>
                    <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.menuTitle}>{item.name}</Text>
                        {item.description ? (
                            <Text style={styles.menuDesc} numberOfLines={2}>
                                {item.description}
                            </Text>
                        ) : null}
                    </View>
                    <View style={styles.menuRight}>
                        <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() =>
                            addItem({
                                id: String(item.id),
                                name: item.name,
                                price: Number(item.price || 0),
                                image_url: "",
                                customizations: [],
                            })
                        }
                    >
                        <Text style={styles.addButtonText}>{addLabel}</Text>
                    </TouchableOpacity>
                    </View>
                </View>
            ))}
        </View>
    );
};

const MunchiesPage = () => {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const restaurant = munchiesData?.restaurants?.[0] ?? {};
    const menuItems: MenuEntry[] = Array.isArray(munchiesData?.menus) ? munchiesData.menus : [];
    const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);
    const firstAvailable = CATEGORY_ORDER.find((key) => grouped[key]?.length) || CATEGORY_ORDER[0];
    const [activeCategory, setActiveCategory] = useState<string>(firstAvailable);
    const activeItems = grouped[activeCategory] || [];
    const cartItems = useCartStore((state) => state.items);
    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Icon name="arrowBack" size={18} color="#3A1C00" />
                    </TouchableOpacity>
                    <View style={styles.heroGlow} />
                    <View style={styles.heroInner}>
                        <Image source={require("@/assets/restaurantlogo/munchieslogo.jpg")} style={styles.heroLogo} contentFit="cover" />
                        <View style={styles.heroMeta}>
                            <Text style={styles.heroBadge}>Munchies Food & Beverages                                (+90 533 882 48 88)</Text>
                            <Text style={styles.heroTitle}>{restaurant.name || "Munchies"}</Text>
                            <Text style={styles.heroSubtitle}>Burger · Wrap · Tost · Gözleme · Çıtır Lezzetler</Text>
                            <View style={styles.heroChips}>
                                <View style={[styles.heroChip, { backgroundColor: "#F6C45322", borderColor: "#F6C453" }]}>
                                    <Text style={[styles.heroChipText, { color: "#F6C453" }]}>Kalkanlı</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.sheet}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                        {CATEGORY_ORDER.map((key) => {
                            const label = translateCategoryLabel(key, locale as any);
                            const selected = activeCategory === key;
                            const available = (grouped[key] || []).length > 0;
                            if (!available) return null;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[styles.tabChip, selected && styles.tabChipActive]}
                                    onPress={() => setActiveCategory(key)}
                                >
                                    <Text style={[styles.tabChipText, selected && styles.tabChipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <MenuList items={activeItems} addLabel={t("restaurantUi.addToCart")} />
                </View>
            </ScrollView>

            <TouchableOpacity style={styles.cartFab} onPress={() => router.push("/(tabs)/cart")}>
                <Icon name="cart" size={18} color="#3A1C00" />
                <Text style={styles.cartFabText}>{t("restaurantUi.cart", { count: cartCount })}</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#FFF7EB" },
    scrollContent: { paddingBottom: 120 },
    hero: { marginHorizontal: 16, marginTop: 14, marginBottom: 10 },
    backButton: {
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 2,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#FFD8A9",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#F6C453",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
    },
    heroGlow: {
        position: "absolute",
        inset: 0,
        borderRadius: 32,
        backgroundColor: "#FEE7C3",
        opacity: 0.9,
    },
    heroInner: {
        flexDirection: "row",
        gap: 16,
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: "#F6C453",
        overflow: "hidden",
        backgroundColor: "#FFD8A9",
    },
    heroLogo: { width: 110, height: 110, borderRadius: 24, borderWidth: 1, borderColor: "#F6C45355" },
    heroMeta: { flex: 1, gap: 8, justifyContent: "center" },
    heroBadge: { color: "#BF360C", fontSize: 12, letterSpacing: 1, fontWeight: "600" },
    heroTitle: { color: "#3A1C00", fontSize: 26, fontWeight: "700" },
    heroSubtitle: { color: "#6B3A00", fontSize: 14, lineHeight: 18 },
    heroChips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: "#FFF1DA",
        borderWidth: 1,
        borderColor: "#F6C453",
    },
    heroChipText: { color: "#BF360C", fontSize: 12, fontWeight: "600" },
    sheet: {
        marginHorizontal: 12,
        marginBottom: 16,
        padding: 14,
        backgroundColor: "#FFF0DB",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#F6C453",
        gap: 12,
    },
    tabRow: { gap: 8, paddingVertical: 4 },
    tabChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#F6C453",
        backgroundColor: "#FFE9C9",
    },
    tabChipActive: {
        borderColor: "#BF360C",
        backgroundColor: "#FFD8A9",
    },
    tabChipText: { color: "#6B3A00", fontSize: 13, fontWeight: "500" },
    tabChipTextActive: { color: "#3A1C00", fontSize: 13, fontWeight: "700" },
    cardGrid: { gap: 12 },
    menuCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        backgroundColor: "#FFF7EB",
        borderColor: "#F6C453",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 14,
        elevation: 6,
    },
    menuTitle: { fontSize: 16, color: "#3A1C00", fontWeight: "700" },
    menuDesc: { fontSize: 13, color: "#7B4A12" },
    menuRight: { alignItems: "flex-end", gap: 8 },
    menuPrice: { fontSize: 16, color: "#BF360C", fontWeight: "700" },
    addButton: {
        backgroundColor: "#FFB703",
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
    },
    addButtonText: { color: "#3A1C00", fontSize: 12, fontWeight: "700" },
    cartFab: {
        position: "absolute",
        bottom: 20,
        right: 20,
        backgroundColor: "#FFB703",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#BF360C",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 12,
        elevation: 8,
    },
    cartFabText: { color: "#3A1C00", fontSize: 14, fontWeight: "700" },
});

export default MunchiesPage;

