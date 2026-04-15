import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import Icon from "@/components/Icon";
import { getRestaurant, getRestaurantCategories, getRestaurantMenu } from "@/lib/api";
import { getRestaurantImageSource } from "@/lib/assets";
import useServerResource from "@/lib/useServerResource";
import { getCategoryLabel } from "@/src/lib/categoryLabels";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useCartStore } from "@/store/cart.store";

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

const THEME = {
    bg: "#FFF8F2",
    bgTop: "#FFF5EB",
    bgBottom: "#FFFCF8",
    card: "#FFFFFF",
    cardSoft: "#FFF9F3",
    ink: "#251B17",
    muted: "#7E7167",
    subtle: "#A39489",
    line: "rgba(37,27,23,0.08)",
    lineSoft: "rgba(37,27,23,0.05)",
    accent: "#F28C28",
    accentStrong: "#E46F10",
    accentSoft: "rgba(242,140,40,0.12)",
    cartStart: "#F6BF43",
    cartEnd: "#FFD46F",
    open: "#23A167",
    openSoft: "rgba(35,161,103,0.12)",
};

const shadow = makeShadow({
    color: "#8F6543",
    offsetY: 12,
    blurRadius: 26,
    opacity: Platform.OS === "ios" ? 0.08 : 0.12,
    elevation: 5,
});

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

const formatPrice = (price?: number | string) => `${Number(price ?? 0).toFixed(0)} ₺`;

const groupByCategory = (items: MenuEntry[]) => {
    const bucket: Record<string, MenuEntry[]> = {};

    items.forEach((item) => {
        const rawCats = item.categories;
        const categories = Array.isArray(rawCats)
            ? rawCats
            : rawCats
                ? [rawCats]
                : [typeof (item as { category?: string }).category === "string" ? String((item as { category?: string }).category) : "diger"];

        categories.forEach((cat) => {
            const key = String(cat || "diger").toLowerCase();
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(item);
        });
    });

    return bucket;
};

const sortCategories = (keys: string[]) =>
    [...keys].sort((a, b) => {
        const ia = BASE_CATEGORY_ORDER.indexOf(a);
        const ib = BASE_CATEGORY_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

export default function RestaurantDetailsScreen({ initialId }: { initialId?: string } = {}) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const { addItem, items: cartItems, getTotalItems, getTotalPrice } = useCartStore();
    const { id } = useLocalSearchParams<{ id?: string }>();

    const routeId = id ? String(id) : undefined;
    const restaurantId = useMemo(() => routeId || initialId || "", [routeId, initialId]);
    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const isTurkish = locale === "tr";

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
        params: restaurantId || undefined,
        immediate: true,
        skipAlert: true,
    });

    const fetchMenu = useCallback(
        async (targetId?: string) => {
            const resolvedId = targetId ?? restaurantId;
            if (!resolvedId) throw new Error("Restaurant id is missing.");
            return getRestaurantMenu({ restaurantId: resolvedId });
        },
        [restaurantId],
    );

    const { data: menu, loading: menuLoading } = useServerResource<MenuEntry[], string | undefined>({
        fn: fetchMenu,
        params: restaurantId || undefined,
        immediate: true,
        skipAlert: true,
    });

    const fetchCategories = useCallback(
        async (targetId?: string) => {
            const resolvedId = targetId ?? restaurantId;
            if (!resolvedId) throw new Error("Restaurant id is missing.");
            return getRestaurantCategories(resolvedId);
        },
        [restaurantId],
    );

    const { data: categories } = useServerResource<Category[], string | undefined>({
        fn: fetchCategories,
        params: restaurantId || undefined,
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
                      .map((category) => String(category.slug || category.id || category.name || "").toLowerCase())
                      .filter((slug) => slug && (grouped[slug] || []).length > 0)
                : [];

        return sortCategories(Array.from(new Set([...fromCategories, ...withItems])));
    }, [categories, grouped]);

    const [activeCategory, setActiveCategory] = useState<string>("");

    useEffect(() => {
        if (!categoryKeys.length) return;
        if (!activeCategory || !categoryKeys.includes(activeCategory)) {
            setActiveCategory(categoryKeys[0]);
        }
    }, [activeCategory, categoryKeys]);

    const activeItems = activeCategory ? grouped[activeCategory] || [] : menuItems;
    const sectionSubtitle = `${activeItems.length} ürün`;

    const openingHours = useMemo(() => {
        const open = restaurant?.openingTime || (restaurant as { opening_time?: string } | undefined)?.opening_time;
        const close = restaurant?.closingTime || (restaurant as { closing_time?: string } | undefined)?.closing_time;
        if (!open || !close) return null;
        return `${open} - ${close}`;
    }, [restaurant]);

    const displayName = restaurant?.name || restaurantId || "Restaurant";
    const heroSubtitle = restaurant?.cuisine || "Pizza & Dünya Mutfağı";
    const heroSource = getRestaurantImageSource(
        restaurant?.imageUrl || restaurant?.image_url,
        undefined,
        `${restaurant?.id || restaurantId} ${restaurant?.name || ""}`,
    );

    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const cartTotal = getTotalPrice();

    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastScale = useRef(new Animated.Value(0.98)).current;
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [addedToastVisible, setAddedToastVisible] = useState(false);
    const [addedToastText, setAddedToastText] = useState("");

    const showAddedToast = useCallback(
        (itemName: string) => {
            setAddedToastText(itemName);
            setAddedToastVisible(true);

            Animated.parallel([
                Animated.timing(toastOpacity, {
                    toValue: 1,
                    duration: 170,
                    useNativeDriver: Platform.OS !== "web",
                }),
                Animated.timing(toastScale, {
                    toValue: 1,
                    duration: 170,
                    useNativeDriver: Platform.OS !== "web",
                }),
            ]).start();

            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => {
                Animated.parallel([
                    Animated.timing(toastOpacity, {
                        toValue: 0,
                        duration: 220,
                        useNativeDriver: Platform.OS !== "web",
                    }),
                    Animated.timing(toastScale, {
                        toValue: 0.98,
                        duration: 220,
                        useNativeDriver: Platform.OS !== "web",
                    }),
                ]).start(() => setAddedToastVisible(false));
            }, 1100);
        },
        [toastOpacity, toastScale],
    );

    useEffect(
        () => () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        },
        [],
    );

    const handleAddToCart = (item: MenuEntry) => {
        const before = getTotalItems();
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
            showAddedToast(item.name);
        }
    };

    const renderContent = () => {
        if (restaurantLoading || menuLoading) {
            return (
                <View style={styles.loadingWrap}>
                    <View style={styles.loadingCard} />
                    <View style={[styles.loadingCard, { height: 280 }]} />
                </View>
            );
        }

        if ((restaurantError || !restaurant) && !menuItems.length) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Restaurant not found</Text>
                    <Pressable onPress={() => router.back()} style={styles.emptyButton}>
                        <Text style={styles.emptyButtonText}>Go back</Text>
                    </Pressable>
                </View>
            );
        }

        return (
            <>
                <View style={styles.headerCard}>
                    <View style={styles.headerTop}>
                        <Pressable onPress={() => router.back()} style={styles.headerBackButton}>
                            <View style={styles.headerBackInner}>
                                <Icon name="arrowBack" size={18} color={THEME.ink} />
                            </View>
                        </Pressable>

                        <View style={styles.logoShell}>
                            <Image source={heroSource} style={styles.logoImage} contentFit="cover" />
                        </View>

                        <View style={styles.headerCopy}>
                            <View style={styles.titleRow}>
                                <Text style={styles.title} numberOfLines={2}>
                                    {displayName}
                                </Text>
                                <View style={styles.statusPill}>
                                <Text style={styles.statusText}>{isTurkish ? "Açık" : "Open"}</Text>
                                </View>
                            </View>

                            <Text style={styles.subtitle} numberOfLines={1}>
                                {heroSubtitle}
                            </Text>

                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Icon name="star" size={13} color="#E0A53E" />
                                    <Text style={styles.metaText}>4.8</Text>
                                    <Text style={styles.metaSubtle}>(1.2k)</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Icon name="clock" size={13} color={THEME.accent} />
                                    <Text style={styles.metaText}>25-35 dk</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.infoChips}>
                        <View style={styles.infoChip}>
                            <Text style={styles.infoChipText}>{isTurkish ? "Min. 120 ₺" : "Min 120 ₺"}</Text>
                        </View>
                        <View style={styles.infoChip}>
                            <Text style={styles.infoChipText}>{isTurkish ? "Teslimat 24 ₺" : "Delivery 24 ₺"}</Text>
                        </View>
                        {openingHours ? (
                            <View style={styles.infoChip}>
                                <Text style={styles.infoChipText}>{openingHours}</Text>
                            </View>
                        ) : (
                            <View style={styles.infoChip}>
                                <Text style={styles.infoChipText}>Kalkanlı</Text>
                            </View>
                        )}
                    </View>
                </View>

                {categoryKeys.length ? (
                    <View style={styles.categoryRail}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRailContent}>
                            {categoryKeys.map((key) => {
                                const active = key === activeCategory;
                                const label = getCategoryLabel(key, locale as "tr" | "en");

                                return (
                                    <Pressable
                                        key={key}
                                        onPress={() => setActiveCategory(key)}
                                        style={[styles.categoryPill, active ? styles.categoryPillActive : null]}
                                    >
                                        <Text style={[styles.categoryText, active ? styles.categoryTextActive : null]}>{label}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                ) : null}

                <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>
                        {activeCategory ? getCategoryLabel(activeCategory, locale as "tr" | "en") : t("restaurant.menu", "Menü")}
                    </Text>
                    <Text style={styles.sectionSubtitle}>{sectionSubtitle}</Text>
                </View>

                <View style={styles.menuList}>
                    {activeItems.map((item) => (
                        <View key={String(item.id)} style={styles.menuCard}>
                            <View style={styles.menuMain}>
                                <Text style={styles.menuTitle}>{item.name}</Text>
                                {item.description ? (
                                    <Text style={styles.menuDescription} numberOfLines={2}>
                                        {item.description}
                                    </Text>
                                ) : null}

                                <View style={styles.menuFooter}>
                                    <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>

                                    <Pressable onPress={() => handleAddToCart(item)} style={styles.menuCta}>
                                        <Text style={styles.menuCtaText}>{t("restaurantUi.addToCart", "Sepete ekle")}</Text>
                                    </Pressable>
                                </View>
                            </View>

                            <Pressable onPress={() => handleAddToCart(item)} style={styles.thumbShell}>
                                <View style={styles.thumbInner}>
                                    <Icon name="bag" size={18} color={THEME.accent} />
                                </View>
                            </Pressable>
                        </View>
                    ))}
                </View>
            </>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgBottom]} style={styles.flex}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingTop: Math.max(insets.top, 4),
                        paddingHorizontal: 16,
                        paddingBottom: 132 + insets.bottom,
                    }}
                >
                    {renderContent()}
                </ScrollView>

                <Pressable
                    onPress={() => router.push("/(tabs)/cart")}
                    style={[styles.cartBar, { left: 16, right: 16, bottom: Math.max(insets.bottom, 8) }]}
                >
                    <LinearGradient colors={[THEME.cartStart, THEME.cartEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cartBarInner}>
                        <View style={styles.cartInfo}>
                            <View style={styles.cartIconBubble}>
                                <Icon name="cart" size={18} color="#FFFFFF" />
                            </View>
                            <View>
                                <Text style={styles.cartTitle}>
                                    {isTurkish ? `${cartCount} ürün` : `${cartCount} item${cartCount === 1 ? "" : "s"}`}
                                </Text>
                                <Text style={styles.cartSubtitle}>{formatPrice(cartTotal)}</Text>
                            </View>
                        </View>

                        <View style={styles.cartCta}>
                            <Text style={styles.cartCtaText}>{isTurkish ? "Sepeti Gör" : "View Cart"}</Text>
                        </View>
                    </LinearGradient>
                </Pressable>

                {addedToastVisible ? (
                    <View style={styles.toastOverlay} pointerEvents="none">
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
    flex: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        backgroundColor: THEME.bg,
    },
    loadingWrap: {
        gap: 14,
    },
    loadingCard: {
        height: 170,
        borderRadius: 28,
        backgroundColor: "rgba(255,255,255,0.54)",
        borderWidth: 1,
        borderColor: THEME.lineSoft,
    },
    emptyState: {
        paddingTop: 40,
        alignItems: "center",
        gap: 12,
    },
    emptyTitle: {
        fontFamily: "ChairoSans",
        fontSize: 24,
        color: THEME.ink,
    },
    emptyButton: {
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: THEME.accentSoft,
    },
    emptyButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.accentStrong,
    },
    headerCard: {
        borderRadius: 30,
        padding: 16,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        ...shadow,
    },
    headerTop: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    headerBackButton: {
        paddingTop: 2,
    },
    headerBackInner: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.line,
    },
    logoShell: {
        width: 76,
        height: 76,
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: THEME.line,
        backgroundColor: THEME.cardSoft,
    },
    logoImage: {
        width: "100%",
        height: "100%",
    },
    headerCopy: {
        flex: 1,
        gap: 6,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
    },
    title: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 28,
        lineHeight: 31,
        color: THEME.ink,
    },
    statusPill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: THEME.openSoft,
        marginTop: 2,
    },
    statusText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.open,
    },
    subtitle: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.muted,
    },
    metaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 2,
    },
    metaItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    metaText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.ink,
    },
    metaSubtle: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.subtle,
    },
    infoChips: {
        marginTop: 14,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    infoChip: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: THEME.accentSoft,
    },
    infoChipText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.accentStrong,
    },
    categoryRail: {
        marginTop: 14,
        borderRadius: 24,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        paddingVertical: 8,
        paddingHorizontal: 8,
        ...shadow,
    },
    categoryRailContent: {
        gap: 8,
        paddingLeft: 2,
        paddingRight: 8,
    },
    categoryPill: {
        height: 40,
        borderRadius: 999,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: THEME.line,
    },
    categoryPillActive: {
        backgroundColor: THEME.accentSoft,
        borderColor: "rgba(242,140,40,0.35)",
    },
    categoryText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.muted,
    },
    categoryTextActive: {
        color: THEME.accentStrong,
    },
    sectionHead: {
        marginTop: 18,
        marginBottom: 10,
    },
    sectionTitle: {
        fontFamily: "ChairoSans",
        fontSize: 24,
        color: THEME.ink,
    },
    sectionSubtitle: {
        marginTop: 4,
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.muted,
    },
    menuList: {
        gap: 12,
    },
    menuCard: {
        flexDirection: "row",
        gap: 12,
        borderRadius: 24,
        padding: 14,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        ...shadow,
    },
    menuMain: {
        flex: 1,
    },
    menuTitle: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        lineHeight: 22,
        color: THEME.ink,
    },
    menuDescription: {
        marginTop: 5,
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
        color: THEME.muted,
    },
    menuFooter: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    menuPrice: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: THEME.accentStrong,
    },
    menuCta: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: THEME.accent,
        minWidth: 112,
        alignItems: "center",
    },
    menuCtaText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#FFFFFF",
    },
    thumbShell: {
        width: 70,
        alignItems: "center",
        justifyContent: "center",
    },
    thumbInner: {
        width: 58,
        height: 58,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.line,
    },
    cartBar: {
        position: "absolute",
    },
    cartBarInner: {
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: "rgba(37,27,23,0.10)",
        ...shadow,
    },
    cartInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    cartIconBubble: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(37,27,23,0.88)",
    },
    cartTitle: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.ink,
    },
    cartSubtitle: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "rgba(37,27,23,0.72)",
    },
    cartCta: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "rgba(255,255,255,0.8)",
    },
    cartCtaText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.ink,
    },
    toastOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    toastCard: {
        minWidth: 220,
        maxWidth: "78%",
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.94)",
        borderWidth: 1,
        borderColor: "rgba(37,27,23,0.12)",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingVertical: 16,
        ...makeShadow({ color: "#000", offsetY: 8, blurRadius: 20, opacity: 0.14, elevation: 10 }),
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
