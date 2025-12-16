// app/(restaurants)/alacarte.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
    Directions,
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
    Pressable,
} from "react-native-gesture-handler";

import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { getCategoryLabel as translateCategoryLabel } from "@/src/lib/categoryLabels";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const alacarteData = require("../../data/alacarte-cafe-firestore.json");

const RESTAURANT_ID = String(alacarteData?.restaurants?.[0]?.id || "alacarte-cafe");
const RESTAURANT_PHONE = "(+90 539 100 66 68)";
const HERO_KICKER = "Alacarte Cafe · Fast Food & Grill";
const HERO_SUBTITLE = "Fast food · Izgara · Makarna · Salata";

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
    "mains",
    "burgers",
    "wraps",
    "pizza",
    "pizzas",
    "grill",
    "chicken",
    "pasta",
    "salads",
    "crispy",
    "toast",
    "gozleme",
    "sides",
    "chips",
    "snacks",
    "drinks_cold",
    "drinks_hot",
    "drinks",
    "sauces",
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

/** Ala Carte theme (cherry + espresso) */
const THEME = {
    bgTop: "#FFF6F2",
    bgMid: "#FFEDE8",
    bgBottom: "#FFFFFF",

    surface: "rgba(255,255,255,0.88)",
    surface2: "rgba(255,255,255,0.94)",
    sheet: "rgba(255,255,255,0.78)",

    ink: "#1E0E10",
    muted: "rgba(30,14,16,0.62)",
    line: "rgba(30,14,16,0.10)",
    lineSoft: "rgba(30,14,16,0.06)",

    accent: "#B11D2E",
    accentSoft: "rgba(177,29,46,0.12)",

    rose: "#E2515E",
    roseSoft: "rgba(226,81,94,0.10)",
};

const shadow = {
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.09 : 0.12,
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
        enabled={!!onPress}
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
        <View style={styles.cardGrid}>
            {items.map((item) => (
                <CardPress key={String(item.id)} style={styles.menuCard}>
                    <View style={styles.menuAccent} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.menuTitle} numberOfLines={1}>
                            {item.name}
                        </Text>
                        {item.description ? (
                            <Text style={styles.menuDesc} numberOfLines={2}>
                                {item.description}
                            </Text>
                        ) : (
                            <Text style={styles.menuDesc} numberOfLines={1}>
                                {" "}
                            </Text>
                        )}
                    </View>

                    <View style={styles.menuRight}>
                        <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>

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
                                styles.addButton,
                                pressed ? { transform: [{ scale: 0.98 }], opacity: 0.98 } : null,
                            ]}
                        >
                            <Text style={styles.addButtonText}>{addLabel}</Text>
                        </Pressable>
                    </View>
                </CardPress>
            ))}
        </View>
    );
};

export default function AlacartePage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();

    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const restaurant = alacarteData?.restaurants?.[0] ?? {};
    const menuItems: MenuEntry[] = Array.isArray(alacarteData?.menus) ? alacarteData.menus : [];

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

    // swipe lock (aynı anda 2 gesture tetiklenmesin)
    const swipeLockRef = useRef(0);
    const fireSwipe = (dir: 1 | -1) => {
        const now = Date.now();
        if (now - swipeLockRef.current < 260) return;
        swipeLockRef.current = now;
        goToIndex(activeIndex + dir);
    };

    const swipeGesture = useMemo(() => {
        const flingLeft = Gesture.Fling()
            .runOnJS(true)
            .direction(Directions.LEFT)
            .onEnd(() => fireSwipe(1));

        const flingRight = Gesture.Fling()
            .runOnJS(true)
            .direction(Directions.RIGHT)
            .onEnd(() => fireSwipe(-1));

        const pan = Gesture.Pan()
            .runOnJS(true)
            .minDistance(12)
            .activeOffsetX([-18, 18])
            .failOffsetY([-12, 12])
            .onEnd((e) => {
                const TH = 90;
                if (Math.abs(e.translationX) < TH) return;
                if (e.translationX < 0) fireSwipe(1);
                else fireSwipe(-1);
            });

        return Gesture.Race(flingLeft, flingRight, pan);
    }, [activeIndex, categoryKeys.join("|"), activeCategory]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.safeArea}>
                <LinearGradient colors={[THEME.bgTop, THEME.bgMid, THEME.bgBottom]} style={{ flex: 1 }}>
                    <ScrollView
                        ref={scrollRef}
                        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
                        showsVerticalScrollIndicator={false}
                        directionalLockEnabled
                        alwaysBounceHorizontal={false}
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
                                <LinearGradient
                                    colors={["rgba(255,255,255,0.96)", "rgba(255,255,255,0.82)"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.floatingBackInner}
                                >
                                    <Icon name="arrowBack" size={20} color={THEME.ink} />
                                </LinearGradient>
                            </Pressable>

                            <View style={styles.decorA} pointerEvents="none" />
                            <View style={styles.decorB} pointerEvents="none" />

                            <CardPress style={styles.heroCard}>
                                <View style={styles.heroRow}>
                                    <View style={styles.logoShell}>
                                        <Image
                                            source={require("@/assets/restaurantlogo/alacartelogo.jpg")}
                                            style={styles.logoImg}
                                            contentFit="cover"
                                        />
                                    </View>

                                    <View style={{ flex: 1, gap: 6 }}>
                                        <View style={styles.heroTopLine}>
                                            <Text style={styles.heroKicker}>{HERO_KICKER}</Text>
                                            <Text style={styles.heroPhone}>{RESTAURANT_PHONE}</Text>
                                        </View>

                                        <Text style={styles.heroTitle}>{restaurant.name || "Alacarte Cafe"}</Text>
                                        <Text style={styles.heroSubtitle}>{HERO_SUBTITLE}</Text>

                                        <View style={styles.heroChipRow}>
                                            <View style={styles.heroChip}>
                                                <Text style={styles.heroChipText}>Kalkanlı</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </CardPress>
                        </View>

                        {/* SHEET */}
                        <View style={styles.sheetWrap}>
                            <CardPress style={styles.sheetCard}>
                                {/* Tabs */}
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
                                                onPress={() => setActiveCategory(key)}
                                                style={({ pressed }) => [
                                                    styles.tabChip,
                                                    selected ? styles.tabChipActive : null,
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

                                {/* Menu (swipe here) */}
                                <GestureDetector gesture={swipeGesture}>
                                    <View style={{ paddingTop: 10 }}>
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
                            colors={[THEME.accent, THEME.rose]}
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
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: THEME.bgTop },

    heroWrap: { paddingHorizontal: 16, paddingTop: 14, position: "relative" },

    floatingBack: { position: "absolute", top: 10, left: 10, zIndex: 999, elevation: 30 },
    floatingBackInner: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.line,
        ...shadow,
    },

    decorA: {
        position: "absolute",
        top: -20,
        right: -70,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: THEME.accentSoft,
        opacity: 0.95,
    },
    decorB: {
        position: "absolute",
        top: 140,
        left: -90,
        width: 210,
        height: 210,
        borderRadius: 105,
        backgroundColor: THEME.roseSoft,
        opacity: 0.85,
    },

    card: {
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        backgroundColor: THEME.surface,
        ...shadow,
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
    heroKicker: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.accent, letterSpacing: 0.5 },
    heroPhone: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.muted },

    heroTitle: { fontFamily: "ChairoSans", fontSize: 28, color: THEME.ink, letterSpacing: -0.2 },
    heroSubtitle: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.muted, lineHeight: 18 },

    heroChipRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    heroChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: THEME.accentSoft,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(177,29,46,0.20)",
    },
    heroChipText: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.accent },

    sheetWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22 },
    sheetCard: {
        padding: 12,
        backgroundColor: THEME.sheet,
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        ...shadow,
    },

    // Tabs (chip + dot)
    tabRow: { gap: 10, paddingVertical: 6, paddingHorizontal: 2 },
    tabChip: {
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.86)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
    },
    tabChipActive: {
        backgroundColor: "rgba(177,29,46,0.12)",
        borderColor: "rgba(177,29,46,0.28)",
    },
    tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(30,14,16,0.22)" },
    tabDotActive: { backgroundColor: THEME.accent },
    tabText: { fontFamily: "ChairoSans", fontSize: 13, color: "rgba(30,14,16,0.70)" },
    tabTextActive: { color: THEME.ink },

    // Menu cards
    cardGrid: { gap: 12 },

    menuCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        padding: 14,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        ...shadow,
    },
    menuAccent: {
        width: 3,
        alignSelf: "stretch",
        borderRadius: 2,
        backgroundColor: "rgba(177,29,46,0.55)",
        marginRight: 2,
    },

    menuTitle: { fontFamily: "ChairoSans", fontSize: 16, color: THEME.ink },
    menuDesc: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.muted, lineHeight: 17 },

    menuRight: { alignItems: "flex-end", gap: 10, paddingLeft: 10 },
    menuPrice: { fontFamily: "ChairoSans", fontSize: 14, color: THEME.accent, letterSpacing: 0.2 },

    addButton: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: "rgba(177,29,46,0.10)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(177,29,46,0.26)",
    },
    addButtonText: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.ink },

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
        borderColor: "rgba(255,255,255,0.22)",
        ...shadow,
    },
    cartIconBubble: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(30,14,16,0.92)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.18)",
    },
    cartFabText: { fontFamily: "ChairoSans", fontSize: 14, color: "#FFFFFF", letterSpacing: 0.2 },
});
