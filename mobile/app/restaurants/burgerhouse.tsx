// app/(restaurants)/burgerhouse.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { getCategoryLabel as translateCategoryLabel } from "@/src/lib/categoryLabels";

// eslint-disable-next-line @typescript-eslint/no-var-requires
import burgerHouseData from "@/data/burgerhouse-firestore.json";

const RESTAURANT_ID = String(burgerHouseData?.restaurants?.[0]?.id || "burger-house");
const RESTAURANT_PHONE = "(+90 539 113 92 00 · +90 533 886 03 04)";
const HERO_KICKER = "Burger House";
const HERO_SUBTITLE = "Burger · Wrap · Chicken · Ice Cream";
const OPENING_HOURS = "09:00 - 23:00";

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

/** Burger House theme (night + neon orange) */
const THEME = {
    bgTop: "#07070A",
    bgMid: "#0B0B10",
    bgBottom: "#060608",

    surface: "rgba(17,17,24,0.92)",
    surface2: "rgba(20,20,28,0.92)",
    sheet: "rgba(14,14,18,0.78)",

    ink: "#FEEFE5",
    muted: "rgba(254,239,229,0.70)",

    line: "rgba(254,239,229,0.10)",
    lineSoft: "rgba(254,239,229,0.06)",

    accent: "#FF6B1A",
    accentSoft: "rgba(255,107,26,0.14)",
    accentSoft2: "rgba(255,107,26,0.22)",

    ember: "#E25500",
    coal: "#0B090E",
};

const shadow = {
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.28 : 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
};

const CardPress = ({
    children,
    onPress,
    style,
}: {
    children: ReactNode;
    onPress?: () => void;
    style?: any;
}) => (
    <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
            styles.cardBase,
            style,
            pressed && onPress ? { transform: [{ scale: 0.992 }], opacity: 0.985 } : null,
        ]}
    >
        {children}
    </Pressable>
);

const MenuList = ({ items, addLabel }: { items: MenuEntry[]; addLabel: string }) => {
    const { addItem } = useCartStore();
    if (!items.length) return null;

    return (
        <View style={styles.menuList}>
            {items.map((item) => (
                <Pressable
                    key={String(item.id)}
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
                    style={({ pressed }) => [styles.menuCard, pressed ? styles.menuCardPressed : null]}
                >
                    <View style={styles.menuAccentRail} />

                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={styles.menuTopRow}>
                            <Text style={styles.menuTitle} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
                        </View>

                        {item.description ? (
                            <Text style={styles.menuDesc} numberOfLines={2}>
                                {item.description}
                            </Text>
                        ) : (
                            <Text style={styles.menuDesc} numberOfLines={1}>
                                {" "}
                            </Text>
                        )}

                        <View style={styles.menuBottomRow}>
                            <View style={{ flex: 1 }} />
                            <View style={styles.addPill}>
                                <Text style={styles.addPillText}>{addLabel}</Text>
                            </View>
                        </View>
                    </View>
                </Pressable>
            ))}
        </View>
    );
};

export default function BurgerHousePage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();

    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const restaurant = burgerHouseData?.restaurants?.[0] ?? {};
    const menuItems: MenuEntry[] = Array.isArray(burgerHouseData?.menus) ? burgerHouseData.menus : [];

    const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);

    const categoryKeys = useMemo(() => {
        const ordered = CATEGORY_ORDER.filter((k) => (grouped[k] || []).length > 0);
        const extras = Object.keys(grouped)
            .filter((k) => !CATEGORY_ORDER.includes(k) && (grouped[k] || []).length > 0)
            .sort((a, b) => a.localeCompare(b));
        return [...ordered, ...extras];
    }, [grouped]);

    const [activeCategory, setActiveCategory] = useState<string>(() => categoryKeys[0] || "");
    useEffect(() => {
        if (!categoryKeys.length) return;
        if (!activeCategory || !categoryKeys.includes(activeCategory)) setActiveCategory(categoryKeys[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoryKeys.join("|")]);

    const activeItems = activeCategory ? grouped[activeCategory] || [] : menuItems;

    const cartItems = useCartStore((s) => s.items);
    const cartCount = cartItems.reduce((acc, it) => acc + it.quantity, 0);

    const scrollRef = useRef<ScrollView>(null);
    const onSelectCategory = (key: string) => {
        setActiveCategory(key);
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={[THEME.bgTop, THEME.bgMid, THEME.bgBottom]} style={{ flex: 1 }}>
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
                    showsVerticalScrollIndicator={false}
                    overScrollMode="never"
                >
                    {/* HERO */}
                    <View style={styles.heroWrap}>
                        <Pressable
                            onPress={() => router.back()}
                            hitSlop={12}
                            style={({ pressed }) => [
                                styles.floatingBack,
                                pressed ? { transform: [{ scale: 0.96 }], opacity: 0.98 } : null,
                            ]}
                        >
                            <View style={styles.floatingBackInner}>
                                <Icon name="arrowBack" size={20} color={THEME.ink} />
                            </View>
                        </Pressable>

                        <View style={styles.decorA} pointerEvents="none" />
                        <View style={styles.decorB} pointerEvents="none" />
                        <View style={styles.decorC} pointerEvents="none" />

                        <CardPress style={styles.heroCard}>
                            <View style={styles.heroRow}>
                                <View style={styles.logoShell}>
                                    <Image
                                        source={require("@/assets/restaurantlogo/burgerhouselogo.jpg")}
                                        style={styles.logoImg}
                                        contentFit="cover"
                                    />
                                </View>

                                <View style={{ flex: 1, gap: 6 }}>
                                    <View style={styles.heroTopLine}>
                                        <Text style={styles.heroKicker}>{HERO_KICKER}</Text>
                                        <Text style={styles.heroPhone}>{RESTAURANT_PHONE}</Text>
                                    </View>

                                    <Text style={styles.heroTitle}>{restaurant.name || "Burger House"}</Text>
                                    <Text style={styles.heroSubtitle}>{HERO_SUBTITLE}</Text>
                                    <Text style={styles.heroSubtitle}>{OPENING_HOURS}</Text>

                                    <View style={styles.heroChipRow}>
                                        <View style={styles.heroChip}>
                                            <Text style={styles.heroChipText}>Kalkanlı / Güzelyurt</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </CardPress>
                    </View>

                    {/* SHEET */}
                    <View style={styles.sheetWrap}>
                        <View style={styles.sheetCard}>
                            {/* ✅ çerçeveli tab rail + pill */}
                            <View style={styles.tabRail}>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.tabRow}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    {categoryKeys.map((key) => {
                                        const selected = activeCategory === key;
                                        const label =
                                            translateCategoryLabel(key, locale as any) ||
                                            CATEGORY_TITLES[key] ||
                                            key;

                                        return (
                                            <Pressable
                                                key={key}
                                                onPress={() => onSelectCategory(key)}
                                                style={({ pressed }) => [
                                                    styles.tabPill,
                                                    selected ? styles.tabPillActive : null,
                                                    pressed ? { transform: [{ scale: 0.985 }] } : null,
                                                ]}
                                            >
                                                <View style={[styles.tabDot, selected ? styles.tabDotActive : null]} />
                                                <Text style={[styles.tabText, selected ? styles.tabTextActive : null]} numberOfLines={1}>
                                                    {label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>

                            <View style={{ paddingTop: 14 }}>
                                <MenuList items={activeItems} addLabel={t("restaurantUi.addToCart")} />
                            </View>
                        </View>
                    </View>
                </ScrollView>

                {/* CART FAB */}
                <Pressable
                    onPress={() => router.push("/(tabs)/cart")}
                    style={({ pressed }) => [
                        styles.cartFab,
                        { bottom: 18 + insets.bottom, right: 18 },
                        pressed ? { transform: [{ scale: 0.985 }], opacity: 0.99 } : null,
                    ]}
                >
                    <LinearGradient
                        colors={[THEME.accent, "#FFB703"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cartFabInner}
                    >
                        <View style={styles.cartIconBubble}>
                            <Icon name="cart" size={18} color={THEME.coal} />
                        </View>
                        <Text style={styles.cartFabText}>{t("restaurantUi.cart", { count: cartCount })}</Text>
                    </LinearGradient>
                </Pressable>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: THEME.bgTop },

    cardBase: {
        borderRadius: 28,
        borderWidth: 1,
        borderColor: "rgba(255,107,26,0.26)",
        backgroundColor: THEME.surface,
        ...shadow,
    },

    heroWrap: { paddingHorizontal: 14, paddingTop: 14, position: "relative" },

    floatingBack: { position: "absolute", top: 10, left: 10, zIndex: 999, elevation: 30 },
    floatingBackInner: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(20,20,24,0.94)",
        borderWidth: 1,
        borderColor: "rgba(255,107,26,0.45)",
        alignItems: "center",
        justifyContent: "center",
        ...shadow,
    },

    decorA: {
        position: "absolute",
        top: -10,
        right: -80,
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: THEME.accentSoft,
        opacity: 0.95,
    },
    decorB: {
        position: "absolute",
        top: 150,
        left: -95,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: "rgba(255,183,3,0.12)",
        opacity: 0.9,
    },
    decorC: {
        position: "absolute",
        top: 80,
        right: 30,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: "rgba(255,255,255,0.06)",
        opacity: 0.7,
    },

    heroCard: { padding: 16, overflow: "hidden" },
    heroRow: { flexDirection: "row", gap: 14, paddingTop: 10 },

    logoShell: {
        width: 96,
        height: 96,
        borderRadius: 26,
        backgroundColor: THEME.surface2,
        borderWidth: 1,
        borderColor: "rgba(255,107,26,0.22)",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    logoImg: { width: 96, height: 96 },

    heroTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    heroKicker: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.accent, letterSpacing: 0.6 },
    heroPhone: { fontFamily: "ChairoSans", fontSize: 12, color: "rgba(254,239,229,0.66)" },

    heroTitle: { fontFamily: "ChairoSans", fontSize: 28, color: THEME.ink, letterSpacing: -0.2 },
    heroSubtitle: { fontFamily: "ChairoSans", fontSize: 13, color: "rgba(254,239,229,0.74)", lineHeight: 18 },

    heroChipRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: "rgba(255,107,26,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,107,26,0.28)",
    },
    heroChipText: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.accent },

    sheetWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 22 },
    sheetCard: {
        padding: 12,
        backgroundColor: THEME.sheet,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: "rgba(255,107,26,0.14)",
        ...shadow,
    },

    // ✅ Çerçeveli tab rail + pill’ler
    tabRail: {
        borderRadius: 999,
        backgroundColor: "rgba(18,18,24,0.78)",
        borderWidth: 1.4,
        borderColor: "rgba(255,107,26,0.22)",
        padding: 8,
    },
    tabRow: { gap: 10, paddingHorizontal: 6, paddingVertical: 2 },

    tabPill: {
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: "rgba(22,22,28,0.92)",
        borderWidth: 1.35,
        borderColor: "rgba(254,239,229,0.16)",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        maxWidth: 220,
    },
    tabPillActive: {
        backgroundColor: "rgba(255,107,26,0.14)",
        borderColor: "rgba(255,107,26,0.55)",
        borderWidth: 1.8,
    },
    tabDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "rgba(254,239,229,0.22)" },
    tabDotActive: { backgroundColor: THEME.accent },
    tabText: { fontFamily: "ChairoSans", fontSize: 14, color: "rgba(254,239,229,0.72)" },
    tabTextActive: { color: THEME.ink },

    // ✅ Ala Carte menü kartları
    menuList: { gap: 14 },

    menuCard: {
        flexDirection: "row",
        borderRadius: 26,
        backgroundColor: "rgba(17,17,24,0.92)",
        borderWidth: 1,
        borderColor: "rgba(254,239,229,0.08)",
        padding: 14,
        overflow: "hidden",
        ...shadow,
    },
    menuCardPressed: { transform: [{ scale: 0.992 }], opacity: 0.99 },

    menuAccentRail: {
        width: 5,
        borderRadius: 3,
        marginRight: 12,
        backgroundColor: "rgba(255,107,26,0.62)",
    },

    menuTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    menuTitle: { fontFamily: "ChairoSans", fontSize: 18, color: THEME.ink, flex: 1 },
    menuPrice: { fontFamily: "ChairoSans", fontSize: 16, color: THEME.accent, letterSpacing: 0.2 },

    menuDesc: { marginTop: 6, fontFamily: "ChairoSans", fontSize: 13, color: "rgba(254,239,229,0.68)", lineHeight: 18 },
    menuBottomRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },

    addPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: "rgba(255,107,26,0.14)",
        borderWidth: 1.2,
        borderColor: "rgba(255,107,26,0.28)",
    },
    addPillText: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.ink, letterSpacing: 0.2 },

    // Cart FAB
    cartFab: { position: "absolute" },
    cartFabInner: {
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.20)",
        ...shadow,
    },
    cartIconBubble: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(255,255,255,0.72)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(0,0,0,0.10)",
    },
    cartFabText: { fontFamily: "ChairoSans", fontSize: 14, color: THEME.coal },
});
