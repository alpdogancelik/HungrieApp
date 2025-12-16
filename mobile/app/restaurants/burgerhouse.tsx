import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { getCategoryLabel as translateCategoryLabel } from "@/src/lib/categoryLabels";

// Local Burger House data
// eslint-disable-next-line @typescript-eslint/no-var-requires
import burgerHouseData from "@/data/burgerhouse-firestore.json";

const RESTAURANT_ID = String(burgerHouseData?.restaurants?.[0]?.id || "burger-house");

const CATEGORY_ORDER = ["burgers", "wraps", "snacks", "chicken-boxes", "salads", "cold-drinks", "ice-cream", "hot-drinks"];

const CATEGORY_TITLES: Record<string, string> = {
    burgers: "Burgers",
    wraps: "Wraps",
    snacks: "Atıştırmalıklar",
    "chicken-boxes": "Chicken Boxes",
    salads: "Salatalar",
    "cold-drinks": "Soğuk İçecekler",
    "ice-cream": "Dondurma",
    "hot-drinks": "Sıcak İçecekler",
};

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
        const categories = Array.isArray(item.categories) && item.categories.length ? item.categories : ["other"];
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
                                    restaurantId: RESTAURANT_ID,
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

const BurgerHousePage = () => {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const restaurant = burgerHouseData?.restaurants?.[0] ?? {};
    const menuItems: MenuEntry[] = Array.isArray(burgerHouseData?.menus) ? burgerHouseData.menus : [];
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
                        <Icon name="arrowBack" size={18} color="#FEEFE5" />
                    </TouchableOpacity>
                    <View style={styles.heroGlow} />
                    <View style={styles.heroInner}>
                        <Image source={require("@/assets/restaurantlogo/burgerhouselogo.jpg")} style={styles.heroLogo} contentFit="cover" />
                        <View style={styles.heroMeta}>
                            <Text style={styles.heroBadge}>Burger House                                                                             (+90 539 113 92 00 - +90 533 886 03 04)</Text>
                            <Text style={styles.heroTitle}>{restaurant.name || "Burger House"}</Text>
                            <Text style={styles.heroSubtitle}>Burger · Wrap · Chicken · Ice Cream</Text>
                            <View style={styles.heroChips}>
                                <View style={[styles.heroChip, { backgroundColor: "#FF6B1A22", borderColor: "#FF6B1A" }]}>
                                    <Text style={[styles.heroChipText, { color: "#FF6B1A" }]}>Kalkanlı / Güzelyurt</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.sheet}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                        {CATEGORY_ORDER.map((key) => {
                            const label = translateCategoryLabel(key, locale as any) || CATEGORY_TITLES[key] || key;
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

            <TouchableOpacity style={styles.cartFab} onPress={() => router.push("/(tabs)/cart")}>                <Icon name="cart" size={18} color="#0B090E" />
                <Text style={styles.cartFabText}>{t("restaurantUi.cart", { count: cartCount })}</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#080808" },
    scrollContent: { paddingBottom: 120 },
    hero: { marginHorizontal: 14, marginTop: 14, marginBottom: 10 },
    backButton: {
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 2,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "#161616",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#FF6B1A",
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
    },
    heroGlow: {
        position: "absolute",
        inset: 0,
        borderRadius: 30,
        backgroundColor: "#1A1A1A",
        opacity: 0.85,
    },
    heroInner: {
        flexDirection: "row",
        gap: 14,
        padding: 16,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: "#FF6B1A",
        overflow: "hidden",
        backgroundColor: "#0E0E0E",
    },
    heroLogo: { width: 100, height: 100, borderRadius: 24, borderWidth: 1, borderColor: "#FF6B1A55" },
    heroMeta: { flex: 1, gap: 6, justifyContent: "center" },
    heroBadge: { color: "#FF6B1A", fontSize: 12, letterSpacing: 1, fontWeight: "600" },
    heroTitle: { color: "#FEEFE5", fontSize: 26, fontWeight: "800" },
    heroSubtitle: { color: "#E7D6CC", fontSize: 14, lineHeight: 18 },
    heroChips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: "#141414",
        borderWidth: 1,
        borderColor: "#FF6B1A",
    },
    heroChipText: { color: "#FF6B1A", fontSize: 12, fontWeight: "600" },
    sheet: {
        marginHorizontal: 12,
        marginBottom: 16,
        padding: 12,
        backgroundColor: "#0B0B0E",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "#1F1F22",
        gap: 12,
    },
    tabRow: { gap: 8, paddingVertical: 6 },
    tabChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#2A2A2E",
        backgroundColor: "#111116",
    },
    tabChipActive: {
        borderColor: "#FF6B1A",
        backgroundColor: "#20130C",
    },
    tabChipText: { color: "#BFC3CF", fontSize: 13, fontWeight: "500" },
    tabChipTextActive: { color: "#FF6B1A", fontSize: 13, fontWeight: "700" },
    cardGrid: { gap: 12 },
    menuCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        backgroundColor: "#111118",
        borderColor: "#1F1F22",
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 14,
        elevation: 8,
    },
    menuTitle: { fontSize: 16, color: "#FEEFE5", fontWeight: "700" },
    menuDesc: { fontSize: 13, color: "#B6BCC8" },
    menuRight: { alignItems: "flex-end", gap: 8 },
    menuPrice: { fontSize: 16, color: "#FF6B1A", fontWeight: "700" },
    addButton: {
        backgroundColor: "#FF6B1A",
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
    },
    addButtonText: { color: "#0B090E", fontSize: 12, fontWeight: "700" },
    cartFab: {
        position: "absolute",
        bottom: 20,
        right: 20,
        backgroundColor: "#FF6B1A",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E25500",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 12,
        elevation: 8,
    },
    cartFabText: { color: "#0B090E", fontSize: 14, fontWeight: "700" },
});

export default BurgerHousePage;
