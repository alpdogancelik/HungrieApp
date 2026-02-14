import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import useServerResource from "@/lib/useServerResource";
import { getRestaurant, getRestaurantMenu, getRestaurantCategories } from "@/lib/api";
import { getRestaurantImageSource } from "@/lib/assets";
import { getCategoryLabel } from "@/src/lib/categoryLabels";

type MenuEntry = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categories?: string[] | string;
    restaurantId?: string;
};

type Restaurant = {
    id?: string;
    name?: string;
    phone?: string;
    cuisine?: string;
    imageUrl?: string | number;
    image_url?: string | number;
    openingTime?: string;
    closingTime?: string;
};

type Category = {
    id?: string;
    name?: string;
    slug?: string;
};

const formatPrice = (value?: number | string) => `TRY ${Number(value ?? 0).toFixed(2)}`;

const groupByCategory = (items: MenuEntry[]) => {
    const bucket: Record<string, MenuEntry[]> = {};
    items.forEach((item) => {
        const rawCats = item.categories;
        const categories = Array.isArray(rawCats)
            ? rawCats
            : rawCats
                ? [rawCats]
                : [typeof (item as any).category === "string" ? (item as any).category : "diger"];
        categories.forEach((cat) => {
            const key = String(cat || "diger").toLowerCase();
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

// Shared theme (adapted from Ada Pizza)
const THEME = {
    bgTop: "#FFF6EC",
    bgMid: "#FFEFE1",
    bgBottom: "#FFFDFB",
    surface: "rgba(255,255,255,0.90)",
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
    shadowOpacity: Platform.OS === "ios" ? 0.08 : 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
};

const CardPress = ({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: any }) => (
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

const MenuList = ({
    items,
    addLabel,
    restaurantId,
    onAdded,
}: {
    items: MenuEntry[];
    addLabel: string;
    restaurantId: string;
    onAdded?: (itemName: string) => void;
}) => {
    const { addItem } = useCartStore();
    const handleAddToCart = (item: MenuEntry) => {
        const before = useCartStore.getState().getTotalItems();
        addItem({
            id: String(item.id),
            name: item.name,
            price: Number(item.price || 0),
            image_url: "",
            restaurantId: restaurantId || item.restaurantId,
            customizations: [],
        });
        const after = useCartStore.getState().getTotalItems();
        if (after > before) {
            onAdded?.(item.name);
        }
    };

    if (!items.length) return null;

    return (
        <View style={styles.menuList}>
            {items.map((item) => (
                <View key={String(item.id)} style={styles.menuCard}>
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
                        ) : null}

                        <View style={styles.menuBottomRow}>
                            <View style={{ flex: 1 }} />
                            <Pressable
                                onPress={() => handleAddToCart(item)}
                                style={({ pressed }) => [
                                    styles.addPill,
                                    pressed ? { transform: [{ scale: 0.985 }], opacity: 0.96 } : null,
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

export default function RestaurantDetailsScreen({ initialId }: { initialId?: string } = {}) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const routeId = id ? String(id) : undefined;
    const restaurantId = useMemo(() => routeId || initialId || "", [routeId, initialId]);
    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";

    const restaurantParams = useMemo(() => (restaurantId ? restaurantId : undefined), [restaurantId]);
    const menuParams = useMemo(() => (restaurantId ? { restaurantId } : undefined), [restaurantId]);

    const fetchRestaurant = useCallback(
        async (targetId?: string) => {
            const finalId = targetId ?? restaurantId;
            if (!finalId) throw new Error("Restaurant id is missing.");
            const data = await getRestaurant(finalId);
            return (data as Restaurant) || ({ id: finalId, name: finalId } as Restaurant);
        },
        [restaurantId],
    );

    const {
        data: restaurant,
        loading: restaurantLoading,
        error: restaurantError,
    } = useServerResource<Restaurant, string | undefined>({
        fn: fetchRestaurant,
        params: restaurantParams,
        immediate: true,
        skipAlert: true,
    });
    const openingHours = useMemo(() => {
        const open = restaurant?.openingTime || (restaurant as any)?.opening_time;
        const close = restaurant?.closingTime || (restaurant as any)?.closing_time;
        if (!open || !close) return null;
        return `${open} - ${close}`;
    }, [restaurant]);

    const fetchMenu = useCallback(
        async (payload?: { restaurantId: string }) => {
            const targetId = payload?.restaurantId ?? restaurantId;
            if (!targetId) throw new Error("Restaurant id is missing.");
            return getRestaurantMenu({ restaurantId: targetId });
        },
        [restaurantId],
    );

    const {
        data: menu,
        loading: menuLoading,
    } = useServerResource<MenuEntry[], { restaurantId: string } | undefined>({
        fn: fetchMenu,
        params: menuParams,
        immediate: true,
        skipAlert: true,
    });

    const fetchCategories = useCallback(
        async (payload?: { restaurantId: string }) => {
            const targetId = payload?.restaurantId ?? restaurantId;
            if (!targetId) throw new Error("Restaurant id is missing.");
            return getRestaurantCategories(targetId);
        },
        [restaurantId],
    );

    const { data: categories } = useServerResource<Category[], string | { restaurantId: string }>({
        fn: async (payload?: string | { restaurantId: string }) => {
            const targetId =
                typeof payload === "string" ? payload : payload?.restaurantId ?? restaurantId;
            if (!targetId) throw new Error("Restaurant id is missing.");
            return fetchCategories({ restaurantId: targetId });
        },
        params: restaurantId ? { restaurantId } : undefined,
        immediate: true,
        skipAlert: true,
    });

    const menuItems = Array.isArray(menu) ? menu : [];
    const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);

    const categoryKeys = useMemo(() => {
        const withItems = Object.keys(grouped).filter((key) => (grouped[key] || []).length > 0);
        const fromCategories =
            Array.isArray(categories) && categories.length
                ? categories
                      .map((c) => String(c.slug || c.id || c.name || "").toLowerCase())
                      .filter((slug) => slug && (grouped[slug] || []).length > 0)
                : [];
        const merged = Array.from(new Set([...fromCategories, ...withItems]));
        return sortCategories(merged);
    }, [categories, grouped]);
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
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [addedToastVisible, setAddedToastVisible] = useState(false);
    const [addedToastText, setAddedToastText] = useState("");
    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastScale = useRef(new Animated.Value(0.98)).current;

    const onSelectCategory = (key: string) => {
        setActiveCategory(key);
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
    };
    const showAddedToast = (itemName: string) => {
        setAddedToastText(itemName);
        setAddedToastVisible(true);
        Animated.parallel([
            Animated.timing(toastOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
            Animated.timing(toastScale, { toValue: 1, duration: 170, useNativeDriver: true }),
        ]).start();
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            Animated.parallel([
                Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
                Animated.timing(toastScale, { toValue: 0.98, duration: 220, useNativeDriver: true }),
            ]).start(() => setAddedToastVisible(false));
        }, 1100);
    };

    useEffect(
        () => () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        },
        [],
    );

    const heroSource = getRestaurantImageSource(restaurant?.imageUrl || restaurant?.image_url);
    const phoneLabel = restaurant?.phone || "(+90) 000 000 00 00";
    const heroSubtitle = restaurant?.cuisine || "World Kitchen";
    const displayName = restaurant?.name || restaurantId || "Restaurant";

    const renderContent = () => {
        if (restaurantLoading || menuLoading) {
            return (
                <View style={[styles.sheetWrap, { paddingTop: 40 }]}>
                    <Text style={styles.heroTitle}>Loading...</Text>
                </View>
            );
        }

        const missingRestaurant = restaurantError || !restaurant;
        if (missingRestaurant && !menuItems.length) {
            return (
                <View style={[styles.sheetWrap, { paddingTop: 40 }]}>
                    <Text style={styles.heroTitle}>Restaurant not found</Text>
                    <Pressable onPress={() => router.back()} style={styles.tabPill}>
                        <Text style={styles.tabText}>Go back</Text>
                    </Pressable>
                </View>
            );
        }

        return (
            <>
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
                                <Image source={heroSource} style={styles.logoImg} contentFit="cover" />
                            </View>

                            <View style={{ flex: 1, gap: 6 }}>
                                <View style={styles.heroTopLine}>
                                    <Text style={styles.heroKicker}>{displayName}</Text>
                                    <Text style={styles.heroPhone}>{phoneLabel}</Text>
                                </View>

                                <Text style={styles.heroTitle}>{displayName}</Text>
                                <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>

                                <View style={styles.heroChipRow}>
                                    <View style={styles.heroChip}>
                                        <Text style={styles.heroChipText}>Kalkanlı</Text>
                                    </View>
                                    {openingHours ? (
                                        <View style={[styles.heroChip, { backgroundColor: THEME.accentSoft }]}>
                                            <Text style={[styles.heroChipText, { color: THEME.accent }]}>
                                                {openingHours}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        </View>
                    </CardPress>
                </View>

                {/* SHEET */}
                <View style={styles.sheetWrap}>
                    <View style={styles.sheetCard}>
                        {/* Tabs rail */}
                        <View style={styles.tabRail}>
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
                                            onPress={() => onSelectCategory(key)}
                                            style={({ pressed }) => [
                                                styles.tabPill,
                                                selected ? styles.tabPillActive : null,
                                                pressed ? { transform: [{ scale: 0.985 }] } : null,
                                            ]}
                                        >
                                            <View style={[styles.tabDot, selected ? styles.tabDotActive : null]} />
                                            <Text style={[styles.tabText, selected ? styles.tabTextActive : null]}>{label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        {/* Menu */}
                        <View style={{ paddingTop: 14 }}>
                            <MenuList
                                items={activeItems}
                                addLabel={t("restaurantUi.addToCart")}
                                restaurantId={restaurantId}
                                onAdded={showAddedToast}
                            />
                        </View>
                    </View>
                </View>
            </>
        );
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
                    {renderContent()}
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
                        <View style={styles.cartIconBubble}>
                            <Icon name="cart" size={18} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cartFabText}>{t("restaurantUi.cart", { count: cartCount })}</Text>
                    </LinearGradient>
                </Pressable>

                {addedToastVisible ? (
                    <View pointerEvents="none" style={styles.toastOverlay}>
                        <Animated.View style={[styles.toastCard, { opacity: toastOpacity, transform: [{ scale: toastScale }] }]}>
                            <View style={styles.toastIconWrap}>
                                <Icon name="check" size={16} color="#FFFFFF" />
                            </View>
                            <Text style={styles.toastTitle}>Added to cart</Text>
                            <Text style={styles.toastBody} numberOfLines={1}>
                                {addedToastText}
                            </Text>
                        </Animated.View>
                    </View>
                ) : null}
            </LinearGradient>
        </SafeAreaView>
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

    cardBase: {
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
    sheetCard: {
        borderRadius: 26,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(36,20,14,0.08)",
        padding: 12,
        ...shadow,
    },

    tabRail: {
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.62)",
        borderWidth: 1.2,
        borderColor: "rgba(36,20,14,0.20)",
        padding: 8,
    },
    tabRow: { gap: 10, paddingHorizontal: 6, paddingVertical: 2 },

    tabPill: {
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.96)",
        borderWidth: 1.35,
        borderColor: "rgba(36,20,14,0.26)",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    tabPillActive: {
        backgroundColor: "rgba(217,79,35,0.12)",
        borderColor: "rgba(217,79,35,0.62)",
        borderWidth: 1.8,
    },

    tabDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "rgba(36,20,14,0.22)" },
    tabDotActive: { backgroundColor: THEME.accent },
    tabText: { fontFamily: "ChairoSans", fontSize: 14, color: "rgba(36,20,14,0.74)" },
    tabTextActive: { color: THEME.ink },

    menuList: { gap: 14 },
    menuCard: {
        flexDirection: "row",
        borderRadius: 26,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(36,20,14,0.08)",
        padding: 14,
        ...shadow,
    },
    menuCardPressed: { transform: [{ scale: 0.992 }], opacity: 0.99 },

    menuAccentRail: {
        width: 5,
        borderRadius: 3,
        backgroundColor: "rgba(217,79,35,0.35)",
        marginRight: 12,
    },

    menuTopRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
    },
    menuTitle: { fontFamily: "ChairoSans", fontSize: 18, color: THEME.ink, flex: 1 },
    menuPrice: { fontFamily: "ChairoSans", fontSize: 16, color: THEME.accent, letterSpacing: 0.2 },

    menuDesc: {
        marginTop: 6,
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "rgba(36,20,14,0.56)",
        lineHeight: 18,
    },

    menuBottomRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },

    addPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: "rgba(217,79,35,0.10)",
        borderWidth: 1.2,
        borderColor: "rgba(217,79,35,0.22)",
    },
    addPillText: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.ink, letterSpacing: 0.2 },

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
    toastOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    toastCard: {
        minWidth: 220,
        maxWidth: "78%",
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: 1,
        borderColor: "rgba(36,20,14,0.12)",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingVertical: 16,
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 20,
        elevation: 10,
    },
    toastIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: "#16A34A",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 8,
    },
    toastTitle: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: THEME.ink,
    },
    toastBody: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.muted,
    },
});
