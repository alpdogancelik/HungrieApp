// app/(restaurants)/adapizza.tsx
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
import { getCategoryLabel } from "@/src/lib/categoryLabels";

// eslint-disable-next-line @typescript-eslint/no-var-requires
import adaPizzaData from "@/data/ada-pizza-firestore.json";

const RESTAURANT_ID = String(adaPizzaData?.restaurants?.[0]?.id || "ada-pizza");
const RESTAURANT_PHONE = "(+90 533 882 78 79)";

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
        const categories =
            Array.isArray(item.categories) && item.categories.length ? item.categories : ["diger"];
        categories.forEach((cat) => {
            const key = String(cat);
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(item);
        });
    });
    return bucket;
};

const BASE_CATEGORY_ORDER = [
    "pizza",
    "pizzas",
    "wraps",
    "durumler",
    "burgers",
    "mains",
    "grill",
    "chicken",
    "pasta",
    "salads",
    "snacks",
    "crispy",
    "chips",
    "sides",
    "sauces",
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

/** Ada Pizza theme */
const THEME = {
    bgTop: "#FFF6EC",
    bgMid: "#FFEFE1",
    bgBottom: "#FFFDFB",
    surface: "rgba(255,255,255,0.88)",
    surface2: "rgba(255,251,246,0.94)",
    ink: "#24140E",
    muted: "rgba(36,20,14,0.62)",
    line: "rgba(36,20,14,0.10)",
    lineSoft: "rgba(36,20,14,0.06)",
    accent: "#D94F23",
    accentSoft: "rgba(217,79,35,0.12)",
    amber: "#F6B93B",
    amberSoft: "rgba(246,185,59,0.22)",
};

const shadow = {
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.09 : 0.14,
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
                        ) : null}
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

export default function AdaPizzaPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();

    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const restaurant = adaPizzaData?.restaurants?.[0] ?? {};
    const menuItems: MenuEntry[] = Array.isArray(adaPizzaData?.menus) ? adaPizzaData.menus : [];

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

    // 🧷 Swipe lock: fling + pan aynı anda tetiklenmesin
    const swipeLockRef = useRef(0);
    const fireSwipe = (dir: 1 | -1) => {
        const now = Date.now();
        if (now - swipeLockRef.current < 260) return;
        swipeLockRef.current = now;
        goToIndex(activeIndex + dir);
    };

    // ✅ Daha “native” his: Fling (hızlı swipe) + Pan (yavaş swipe)
    // ✅ runOnJS(true) şart (yoksa cihazda saçmalar/crash)
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

                            <View style={styles.heroDecorA} pointerEvents="none" />
                            <View style={styles.heroDecorB} pointerEvents="none" />

                            <CardPress style={styles.heroCard}>
                                <View style={styles.heroRow}>
                                    <View style={styles.logoShell}>
                                        <Image
                                            source={require("@/assets/restaurantlogo/adapizzalogo.jpg")}
                                            style={styles.logoImg}
                                            contentFit="cover"
                                        />
                                    </View>

                                    <View style={{ flex: 1, gap: 6 }}>
                                        <View style={styles.heroTopLine}>
                                            <Text style={styles.heroKicker}>{restaurant.name || "Ada Pizza"}</Text>
                                            <Text style={styles.heroPhone}>{RESTAURANT_PHONE}</Text>
                                        </View>

                                        <Text style={styles.heroTitle}>{restaurant.name || "Ada Pizza"}</Text>
                                        <Text style={styles.heroSubtitle}>Pizza · Dürüm · Burger · Ana Yemekler</Text>

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
                                        const label = getCategoryLabel(key, locale as any);
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
                                                <Text style={[styles.tabChipText, selected ? styles.tabChipTextActive : null]}>
                                                    {label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>

                                {/* Menu: swipe left/right */}
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
                            colors={[THEME.amber, "#FFD36A"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cartFabInner}
                        >
                            {/* ✅ ikon görünürlüğü: koyu bubble + beyaz ikon */}
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

    heroDecorA: {
        position: "absolute",
        top: 0,
        right: -70,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: THEME.accentSoft,
        opacity: 0.9,
    },
    heroDecorB: {
        position: "absolute",
        top: 130,
        left: -90,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: THEME.amberSoft,
        opacity: 0.75,
    },

    card: {
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        backgroundColor: THEME.surface,
        ...shadow,
    },

    heroCard: { padding: 16, overflow: "hidden", zIndex: 1 },

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

    heroTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heroKicker: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.accent, letterSpacing: 0.6 },
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
        borderColor: "rgba(217,79,35,0.18)",
    },
    heroChipText: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.accent },

    sheetWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22 },
    sheetCard: { padding: 12, backgroundColor: "rgba(255,255,255,0.82)" },

    // ✅ Tabs: artık “yazı” değil “chip”
    tabRow: { gap: 10, paddingVertical: 6, paddingHorizontal: 2 },
    tabChip: {
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(36,20,14,0.10)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
    },
    tabChipActive: {
        backgroundColor: "rgba(217,79,35,0.12)",
        borderColor: "rgba(217,79,35,0.28)",
    },
    tabDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(36,20,14,0.22)",
    },
    tabDotActive: {
        backgroundColor: THEME.accent,
    },
    tabChipText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "rgba(36,20,14,0.70)",
    },
    tabChipTextActive: {
        color: THEME.ink,
    },

    cardGrid: { gap: 12 },

    menuCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        padding: 14,
        borderRadius: 22,
        backgroundColor: "rgba(255,252,248,0.94)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: THEME.lineSoft,
        ...shadow,
    },
    menuAccent: {
        width: 3,
        alignSelf: "stretch",
        borderRadius: 2,
        backgroundColor: "rgba(217,79,35,0.55)",
        marginRight: 2,
    },

    menuTitle: { fontFamily: "ChairoSans", fontSize: 16, color: THEME.ink },
    menuDesc: { fontFamily: "ChairoSans", fontSize: 13, color: "rgba(36,20,14,0.58)", lineHeight: 17 },

    menuRight: { alignItems: "flex-end", gap: 10, paddingLeft: 10 },
    menuPrice: { fontFamily: "ChairoSans", fontSize: 14, color: THEME.accent, letterSpacing: 0.2 },

    addButton: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: "rgba(246,185,59,0.22)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(246,185,59,0.55)",
    },
    addButtonText: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.ink },

    cartFab: { position: "absolute" },
    cartFabInner: {
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(36,20,14,0.14)",
        ...shadow,
    },

    // ✅ ikon görünürlüğü fix
    cartIconBubble: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(36,20,14,0.92)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.22)",
    },
    cartFabText: { fontFamily: "ChairoSans", fontSize: 14, color: THEME.ink },
});
