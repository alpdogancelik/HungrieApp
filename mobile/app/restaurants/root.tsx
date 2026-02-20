// app/(restaurants)/root.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { getCategoryLabel as translateCategoryLabel } from "@/src/lib/categoryLabels";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rootData = require("../../data/root-firestore.json");

const RESTAURANT_ID = String(rootData?.restaurants?.[0]?.id || "root-kitchen-coffee");
const HERO_KICKER = "Root Kitchen & Coffee";
const HERO_SUBTITLE = "Burgers · Pasta · Pizza · Wraps · Bowls · Coffee";

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

const BASE_CATEGORY_ORDER = [
    "burgers",
    "burger",
    "pasta",
    "makarna",
    "pizza",
    "pizzas",
    "tenders",
    "wrap",
    "wraps",
    "mains",
    "main_courses",
    "snacks",
    "atistirmalik",
    "salads",
    "salad",
    "bowls",
    "extras",
    "sides",
    "drinks_cold",
    "drinks_hot",
    "drinks",
];

const sortCategories = (keys: string[]) =>
    [...keys].sort((a, b) => {
        const ia = BASE_CATEGORY_ORDER.indexOf(a);
        const ib = BASE_CATEGORY_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

/** ROOT theme: monochrome + warm coffee accent (clean, premium, not dark) */
const THEME = {
    bgTop: "#F7F7F6",
    bgMid: "#EFEFED",
    bgBottom: "#FFFFFF",

    surface: "rgba(255,255,255,0.86)",
    surface2: "rgba(255,255,255,0.92)",
    sheet: "rgba(255,255,255,0.78)",

    ink: "#101010",
    muted: "rgba(16,16,16,0.62)",

    line: "rgba(16,16,16,0.10)",
    lineSoft: "rgba(16,16,16,0.06)",

    coffee: "#C9A27A",
    coffeeSoft: "rgba(201,162,122,0.16)",
    coffeeSoft2: "rgba(201,162,122,0.24)",

    charcoal: "#2A2A2A",
    charcoalSoft: "rgba(42,42,42,0.12)",
};

const shadow = {
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.08 : 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
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
            styles.card,
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
                <View key={String(item.id)} style={styles.menuCard}>
                    <LinearGradient
                        colors={["rgba(201,162,122,0.55)", "rgba(201,162,122,0.10)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.menuAccent}
                    />

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
                            <Pressable
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
                                style={({ pressed }) => [
                                    styles.addPill,
                                    pressed ? { transform: [{ scale: 0.985 }], opacity: 0.98 } : null,
                                ]}
                            >
                                <Text style={styles.addPillText}>{addLabel}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            ))}
        </View>
    );
};

export default function RootKitchenPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();

    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const restaurant = rootData?.restaurants?.[0] ?? {};
    const menuItems: MenuEntry[] = Array.isArray(rootData?.menus) ? rootData.menus : [];

    const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);
    const categoryKeys = useMemo(() => sortCategories(Object.keys(grouped)), [grouped]);

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

    const activeIndex = useMemo(() => {
        const i = categoryKeys.indexOf(activeCategory);
        return i >= 0 ? i : 0;
    }, [categoryKeys, activeCategory]);

    const goToIndex = (idx: number) => {
        if (!categoryKeys.length) return;
        const clamped = Math.max(0, Math.min(idx, categoryKeys.length - 1));
        const nextKey = categoryKeys[clamped];
        if (!nextKey || nextKey === activeCategory) return;

        setActiveCategory(nextKey);
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
    };

    const onSelectCategory = (key: string) => {
        setActiveCategory(key);
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
    };

    const panToSwitchCategory = useMemo(() => {
        return Gesture.Pan()
            .activeOffsetX([-22, 22])
            .failOffsetY([-14, 14])
            .onEnd((e) => {
                const THRESHOLD = 60;
                if (Math.abs(e.translationX) < THRESHOLD) return;
                if (e.translationX < 0) goToIndex(activeIndex + 1);
                else goToIndex(activeIndex - 1);
            });
    }, [activeIndex, categoryKeys.join("|"), activeCategory]);

    const phoneRaw = (restaurant as any)?.phone ? String((restaurant as any).phone) : "";
    const phoneText = phoneRaw ? (phoneRaw.includes("(") ? phoneRaw : `(${phoneRaw})`) : "";

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
                        {/* back: her zaman görünür */}
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

                        {/* decor (çok hafif) */}
                        <View style={styles.decorCoffee} pointerEvents="none" />
                        <View style={styles.decorCharcoal} pointerEvents="none" />

                        <CardPress style={styles.heroCard}>
                            <View style={styles.heroRow}>
                                <View style={styles.logoShell}>
                                    <Image
                                        source={require("@/assets/restaurantlogo/rootlogo.jpg")}
                                        style={styles.logoImg}
                                        contentFit="cover"
                                    />
                                </View>

                                <View style={{ flex: 1, gap: 6 }}>
                                    <View style={styles.heroTopLine}>
                                        <Text style={styles.heroKicker}>{HERO_KICKER}</Text>
                                        {phoneText ? <Text style={styles.heroPhone}>{phoneText}</Text> : <View />}
                                    </View>

                                    <Text style={styles.heroTitle}>{restaurant.name || "Root Kitchen"}</Text>
                                    <Text style={styles.heroSubtitle}>{HERO_SUBTITLE}</Text>

                                    <View style={styles.heroChipRow}>
                                        <View style={styles.heroChip}>
                                            <Text style={styles.heroChipText}>Kalkanlı</Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.heroChip,
                                                {
                                                    backgroundColor: "rgba(42,42,42,0.10)",
                                                    borderColor: "rgba(42,42,42,0.14)",
                                                },
                                            ]}
                                        >
                                            <Text style={[styles.heroChipText, { color: THEME.charcoal }]}>
                                                {t("home.campusOnlyTag")}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </CardPress>
                    </View>

                    {/* SHEET */}
                    <View style={styles.sheetWrap}>
                        <CardPress style={styles.sheetCard}>
                            {/* ✅ ÇERÇEVELİ TAB RAIL + DOT PILL */}
                            <View style={styles.tabRail}>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.tabRow}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    {categoryKeys.map((key) => {
                                        const selected = activeCategory === key;
                                        const label = translateCategoryLabel(key, locale as any) ?? key;

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
                                                <Text
                                                    style={[styles.tabText, selected ? styles.tabTextActive : null]}
                                                    numberOfLines={1}
                                                >
                                                    {label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>

                            <GestureDetector gesture={panToSwitchCategory}>
                                <View style={{ paddingTop: 14 }}>
                                    <MenuList items={activeItems} addLabel={t("restaurantUi.addToCart")} />
                                </View>
                            </GestureDetector>
                        </CardPress>
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
                        colors={[THEME.charcoal, "#111111"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cartFabInner}
                    >
                        <View style={styles.cartIconBubble}>
                            <Icon name="cart" size={18} color="#FFFFFF" />
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

    card: {
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        backgroundColor: THEME.surface,
        ...shadow,
    },

    heroWrap: { paddingHorizontal: 16, paddingTop: 14, position: "relative" },

    floatingBack: { position: "absolute", top: 10, left: 10, zIndex: 999, elevation: 30 },
    floatingBackInner: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.line,
        alignItems: "center",
        justifyContent: "center",
        ...shadow,
    },

    decorCoffee: {
        position: "absolute",
        top: -40,
        right: -90,
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: THEME.coffeeSoft2,
        opacity: 0.9,
    },
    decorCharcoal: {
        position: "absolute",
        top: 150,
        left: -100,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: THEME.charcoalSoft,
        opacity: 0.75,
    },

    heroCard: { padding: 16, overflow: "hidden" },
    heroRow: { flexDirection: "row", gap: 14, paddingTop: 10 },

    logoShell: {
        width: 86,
        height: 86,
        borderRadius: 22,
        backgroundColor: THEME.surface2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    logoImg: { width: 86, height: 86 },

    heroTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    heroKicker: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.charcoal, letterSpacing: 0.6 },
    heroPhone: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.muted },

    heroTitle: { fontFamily: "ChairoSans", fontSize: 28, color: THEME.ink, letterSpacing: -0.2 },
    heroSubtitle: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.muted, lineHeight: 18 },

    heroChipRow: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: THEME.coffeeSoft,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(201,162,122,0.30)",
    },
    heroChipText: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.ink },

    sheetWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22 },
    sheetCard: {
        padding: 12,
        backgroundColor: THEME.sheet,
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        ...shadow,
    },

    // ✅ Tab Rail
    tabRail: {
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.60)",
        borderWidth: 1.2,
        borderColor: "rgba(16,16,16,0.12)",
        padding: 6,
    },
    tabRow: { gap: 10, paddingHorizontal: 6, paddingVertical: 2 },

    tabPill: {
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: 1.2,
        borderColor: "rgba(16,16,16,0.12)",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    tabPillActive: {
        backgroundColor: THEME.coffeeSoft2,
        borderColor: "rgba(201,162,122,0.40)",
    },
    tabDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "rgba(16,16,16,0.18)" },
    tabDotActive: { backgroundColor: THEME.charcoal },
    tabText: { fontFamily: "ChairoSans", fontSize: 14, color: "rgba(16,16,16,0.70)" },
    tabTextActive: { color: THEME.ink },

    // ✅ Menu
    menuList: { gap: 14 },

    menuCard: {
        flexDirection: "row",
        borderRadius: 26,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        padding: 14,
        overflow: "hidden",
        ...shadow,
    },
    menuAccent: { width: 4, borderRadius: 3, marginRight: 12 },

    menuTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    menuTitle: { fontFamily: "ChairoSans", fontSize: 18, color: THEME.ink, flex: 1 },
    menuPrice: { fontFamily: "ChairoSans", fontSize: 16, color: THEME.charcoal, letterSpacing: 0.2 },

    menuDesc: { marginTop: 6, fontFamily: "ChairoSans", fontSize: 13, color: "rgba(16,16,16,0.58)", lineHeight: 18 },
    menuBottomRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },

    addPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: THEME.coffeeSoft2,
        borderWidth: 1.2,
        borderColor: "rgba(201,162,122,0.42)",
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.20)",
        ...shadow,
    },
    cartIconBubble: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.18)",
    },
    cartFabText: { fontFamily: "ChairoSans", fontSize: 14, color: "#FFFFFF" },
});
