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
import { fetchRestaurantReviewSummary } from "@/src/services/menuItemReviews";
import { getCategoryLabel, normalizeCategoryKey } from "@/src/lib/categoryLabels";
import { makeShadow } from "@/src/lib/shadowStyle";
import MenuItemCard from "@/src/features/restaurantMenu/components/MenuItemCard";
import { useCartStore } from "@/store/cart.store";
import type { RestaurantReviewSummary } from "@/src/domain/types";

type MenuEntry = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categories?: string[] | string;
    restaurantId?: string;
    image_url?: string;
    imageUrl?: string;
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
    ratingAverage?: number;
    ratingCount?: number;
    deliveryEtaAverage?: number;
    deliveryEtaMin?: number;
    deliveryEtaMax?: number;
    deliveryFee?: number | string;
    deliveryTime?: string | number;
    etaMinutes?: number | string;
    eta?: string | number;
    minimumOrderAmount?: number | string;
    minimumOrder?: number | string;
    minOrderAmount?: number | string;
    minBasketAmount?: number | string;
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
    "wraps",
    "burgers",
    "mains",
    "grills",
    "chicken",
    "snacks",
    "chips",
    "pizzas",
    "pizza",
    "pide",
    "lahmacun",
    "gozleme",
    "tantuni",
    "pasta",
    "salads",
    "soups",
    "sauces",
    "extras",
    "burger-extras",
    "kids-menu",
    "desserts",
    "cold-drinks",
    "hot-drinks",
    "drinks",
    "other",
];

const TRY_FORMATTERS = {
    tr: new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }),
    en: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }),
} as const;

const formatTryPrice = (price: number | string | undefined, locale: "tr" | "en") => {
    const value = Number(price ?? 0);
    return TRY_FORMATTERS[locale].format(Number.isFinite(value) ? value : 0);
};

const parseNumericValue = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const parseEtaRange = (value: unknown) => {
    if (typeof value !== "string") return null;
    const match = value.match(/(\d+)\s*-\s*(\d+)/);
    if (!match) return null;
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
};

const formatEtaLabel = (restaurant: Restaurant | null | undefined, isTurkish: boolean, fallbackLabel: string) => {
    const etaMin = parseNumericValue(restaurant?.deliveryEtaMin);
    const etaMax = parseNumericValue(restaurant?.deliveryEtaMax);
    if (etaMin !== null && etaMax !== null) {
        return `${Math.round(etaMin)}-${Math.round(etaMax)} ${isTurkish ? "dk" : "min"}`;
    }

    const storedRange = parseEtaRange(String(restaurant?.deliveryTime || restaurant?.eta || ""));
    if (storedRange) {
        return `${storedRange.min}-${storedRange.max} ${isTurkish ? "dk" : "min"}`;
    }

    const etaAverage = parseNumericValue(restaurant?.deliveryEtaAverage ?? restaurant?.etaMinutes);
    if (etaAverage !== null) {
        const rounded = Math.max(10, Math.round(etaAverage / 5) * 5);
        return `${Math.max(10, rounded - 5)}-${rounded + 5} ${isTurkish ? "dk" : "min"}`;
    }

    return fallbackLabel;
};

const formatCurrencyLabel = (amount: number, prefix: string, locale: "tr" | "en") =>
    `${prefix} ${formatTryPrice(Math.round(amount), locale)}`;

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
            const key = normalizeCategoryKey(cat || "diger");
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(item);
        });
    });

    return bucket;
};

const slugifyCategory = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u00e7]/g, "c")
        .replace(/[\u011f]/g, "g")
        .replace(/[\u0131]/g, "i")
        .replace(/[\u00f6]/g, "o")
        .replace(/[\u015f]/g, "s")
        .replace(/[\u00fc]/g, "u")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "");

const normalizeMenuCategories = (items: MenuEntry[], categories: Category[]) => {
    if (!items.length) return items;
    const categoryMap = new Map<string, string>();

    categories.forEach((category) => {
        const slug = slugifyCategory(category.slug || category.name || category.id);
        if (category.id) categoryMap.set(String(category.id), slug);
        if (category.slug) categoryMap.set(String(category.slug), slug);
        if (category.name) categoryMap.set(String(category.name), slug);
    });

    return items.map((item) => {
        const raw = Array.isArray(item.categories) ? item.categories : item.categories ? [item.categories] : [];
        const normalized = raw
            .map((entry) => normalizeCategoryKey(categoryMap.get(String(entry)) || slugifyCategory(entry)))
            .filter(Boolean);

        return normalized.length ? { ...item, categories: Array.from(new Set(normalized)) } : item;
    });
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

    const menuItems = useMemo(
        () => normalizeMenuCategories(Array.isArray(menu) ? menu : [], Array.isArray(categories) ? categories : []),
        [categories, menu],
    );
    const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);

    const categoryKeys = useMemo(() => {
        const withItems = Object.keys(grouped).filter((key) => (grouped[key] || []).length > 0);
        const fromCategories =
            Array.isArray(categories) && categories.length
                ? categories
                      .map((category) => normalizeCategoryKey(category.slug || category.id || category.name || ""))
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
    const sectionSubtitle = isTurkish ? `${activeItems.length} \u00FCr\u00FCn` : `${activeItems.length} items`;
    const [reviewSummary, setReviewSummary] = useState<RestaurantReviewSummary | null>(null);

    const openingHours = useMemo(() => {
        const open = restaurant?.openingTime || (restaurant as { opening_time?: string } | undefined)?.opening_time;
        const close = restaurant?.closingTime || (restaurant as { closing_time?: string } | undefined)?.closing_time;
        if (!open || !close) return null;
        return `${open} - ${close}`;
    }, [restaurant]);

    const displayName = restaurant?.name || restaurantId || "Restaurant";
    const heroSubtitle = restaurant?.cuisine || "Pizza & World Kitchen";
    const heroSource = getRestaurantImageSource(
        restaurant?.imageUrl || restaurant?.image_url,
        undefined,
        `${restaurant?.id || restaurantId} ${restaurant?.name || ""}`,
    );
    const restaurantAverageRating = Number(restaurant?.ratingAverage ?? reviewSummary?.average ?? 0);
    const restaurantRatingCount = Math.max(0, Number(restaurant?.ratingCount ?? reviewSummary?.count ?? 0));
    const restaurantRatingLabel = restaurantRatingCount ? restaurantAverageRating.toFixed(1) : isTurkish ? "Yeni" : "New";
    const restaurantReviewCountLabel = restaurantRatingCount ? `(${restaurantRatingCount})` : isTurkish ? "(0 yorum)" : "(0 reviews)";
    const restaurantEtaLabel = formatEtaLabel(restaurant, isTurkish, isTurkish ? "25-35 dk" : "25-35 min");
    const minimumOrderAmount =
        parseNumericValue(restaurant?.minimumOrderAmount) ??
        parseNumericValue(restaurant?.minimumOrder) ??
        parseNumericValue(restaurant?.minOrderAmount) ??
        parseNumericValue(restaurant?.minBasketAmount);
    const minimumOrderLabel =
        minimumOrderAmount !== null
            ? formatCurrencyLabel(minimumOrderAmount, isTurkish ? "Min." : "Min.", locale)
            : isTurkish
              ? `Min. ${formatTryPrice(120, locale)}`
              : `Min. ${formatTryPrice(120, locale)}`;
    const deliveryFeeAmount = parseNumericValue(restaurant?.deliveryFee);
    const deliveryFeeLabel =
        deliveryFeeAmount !== null
            ? formatCurrencyLabel(deliveryFeeAmount, isTurkish ? "Teslimat" : "Delivery", locale)
            : isTurkish
              ? `Teslimat ${formatTryPrice(24, locale)}`
              : `Delivery ${formatTryPrice(24, locale)}`;

    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const cartTotal = getTotalPrice();
    const formatReviewDate = (value?: string) => {
        if (!value) return isTurkish ? "Tarih yok" : "No date";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US");
    };
    const formatRatingStars = (rating: number) => {
        const safe = Math.max(1, Math.min(5, Math.round(rating || 0)));
        return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
    };

    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastScale = useRef(new Animated.Value(0.98)).current;
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const categoryRailRef = useRef<ScrollView | null>(null);
    const [addedToastVisible, setAddedToastVisible] = useState(false);
    const [addedToastText, setAddedToastText] = useState("");

    useEffect(() => {
        let mounted = true;
        const loadReviewSummary = async () => {
            if (!restaurantId) {
                setReviewSummary(null);
                return;
            }
            try {
                const summary = await fetchRestaurantReviewSummary(restaurantId);
                if (mounted) setReviewSummary(summary);
            } catch {
                if (mounted) {
                    setReviewSummary({
                        average: 0,
                        count: 0,
                        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                        recentReviews: [],
                        latestByMenuItem: {},
                    });
                }
            }
        };

        void loadReviewSummary();
        return () => {
            mounted = false;
        };
    }, [restaurantId]);

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

    const handleAddToCart = (item: MenuEntry, imageUrl?: string) => {
        const before = getTotalItems();
        addItem({
            id: String(item.id),
            name: item.name,
            price: Number(item.price || 0),
            image_url: imageUrl || "",
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
                                    <Text style={styles.statusText}>{isTurkish ? "A\u00E7\u0131k" : "Open"}</Text>
                                </View>
                            </View>

                            <Text style={styles.subtitle} numberOfLines={1}>
                                {heroSubtitle}
                            </Text>

                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Icon name="star" size={13} color="#E0A53E" />
                                    <Text style={styles.metaText}>{restaurantRatingLabel}</Text>
                                    <Text style={styles.metaSubtle}>{restaurantReviewCountLabel}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Icon name="clock" size={13} color={THEME.accent} />
                                    <Text style={styles.metaText}>{restaurantEtaLabel}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.infoChips}>
                        <View style={styles.infoChip}>
                            <Text style={styles.infoChipText}>{minimumOrderLabel}</Text>
                        </View>
                        <View style={styles.infoChip}>
                            <Text style={styles.infoChipText}>{deliveryFeeLabel}</Text>
                        </View>
                        {openingHours ? (
                            <View style={styles.infoChip}>
                                <Text style={styles.infoChipText}>{openingHours}</Text>
                            </View>
                        ) : (
                            <View style={styles.infoChip}>
                                <Text style={styles.infoChipText}>{isTurkish ? "Kapal\u0131" : "Closed"}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {categoryKeys.length ? (
                    <View style={styles.categoryRail}>
                        <ScrollView
                            ref={categoryRailRef}
                            horizontal
                            showsHorizontalScrollIndicator={Platform.OS === "web"}
                            contentContainerStyle={styles.categoryRailContent}
                            style={styles.categoryRailScroll}
                            scrollEventThrottle={16}
                        >
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
                        {activeCategory ? getCategoryLabel(activeCategory, locale as "tr" | "en") : t("restaurant.menu", "Menu")}
                    </Text>
                    <Text style={styles.sectionSubtitle}>{sectionSubtitle}</Text>
                </View>

                <View style={styles.menuList}>
                    {activeItems.map((item) => {
                        const ratingAverage = Number((item as any)?.ratingAverage ?? (item as any)?.rating ?? 0);
                        const ratingCount = Number((item as any)?.ratingCount ?? 0);
                        const latestReview = reviewSummary?.latestByMenuItem[String(item.id)];

                        return (
                            <MenuItemCard
                                key={String(item.id)}
                                item={item}
                                cuisine={restaurant?.cuisine}
                                activeCategory={activeCategory}
                                isTurkish={isTurkish}
                                addToCartLabel={t("restaurantUi.addToCart", "Sepete ekle")}
                                priceLabel={formatTryPrice(item.price, locale)}
                                ratingAverage={ratingAverage}
                                ratingCount={ratingCount}
                                latestReviewComment={latestReview?.comment}
                                onAddToCart={handleAddToCart}
                            />
                        );
                    })}
                </View>

                {reviewSummary ? (
                    <View style={styles.reviewsSection}>
                        <View style={styles.reviewsHeader}>
                            <Text style={styles.reviewsTitle}>{isTurkish ? "Kullan\u0131c\u0131 Yorumlar\u0131" : "Customer Reviews"}</Text>
                            <Text style={styles.reviewsSubtitle}>
                                {`${reviewSummary.average.toFixed(1)} / 5 - ${reviewSummary.count} ${isTurkish ? "yorum" : "reviews"}`}
                            </Text>
                        </View>

                        <View style={styles.reviewFeed}>
                            {reviewSummary.recentReviews.length ? (
                                reviewSummary.recentReviews.slice(0, 6).map((review) => (
                                    <View key={review.id} style={styles.reviewCard}>
                                        <View style={styles.reviewCardHeader}>
                                            <Text style={styles.reviewCardTitle} numberOfLines={1}>
                                                {review.userName || (isTurkish ? "Hungrie Kullan\u0131c\u0131s\u0131" : "Hungrie User")}
                                            </Text>
                                            <Text style={styles.reviewCardMuted}>{formatReviewDate(review.createdAt || review.updatedAt)}</Text>
                                        </View>
                                        <Text style={styles.reviewCardMuted}>
                                            {review.menuItemName || (isTurkish ? "Men\u00FC \u00FCr\u00FCn\u00FC" : "Menu item")}
                                        </Text>
                                        <Text style={styles.reviewCardRating}>{`${formatRatingStars(review.rating)} ${review.rating}/5`}</Text>
                                        {review.comment ? (
                                            <Text style={styles.reviewCardBody}>{review.comment}</Text>
                                        ) : (
                                            <Text style={styles.reviewCardMuted}>
                                                {isTurkish ? "Sadece y\u0131ld\u0131z puan\u0131 b\u0131rak\u0131ld\u0131." : "Star rating only."}
                                            </Text>
                                        )}
                                    </View>
                                ))
                            ) : (
                                <View style={styles.reviewEmptyCard}>
                                    <Text style={styles.reviewCardTitle}>
                                        {isTurkish ? "Hen\u00FCz yorum yok" : "No reviews yet"}
                                    </Text>
                                    <Text style={styles.reviewCardMuted}>
                                        {isTurkish ? "Tamamlanan sipari\u015Flerden gelen yorumlar burada g\u00F6r\u00FCnecek." : "Reviews from completed orders will appear here."}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                ) : null}
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
                                    {isTurkish ? `${cartCount} \u00FCr\u00FCn` : `${cartCount} item${cartCount === 1 ? "" : "s"}`}
                                </Text>
                                <Text style={styles.cartSubtitle}>{formatTryPrice(cartTotal, locale)}</Text>
                            </View>
                        </View>

                        <View style={styles.cartCta}>
                            <Text style={styles.cartCtaText}>{isTurkish ? "Sepeti g\u00F6r" : "View Cart"}</Text>
                        </View>
                    </LinearGradient>
                </Pressable>

                {addedToastVisible ? (
                    <View style={[styles.toastOverlay, { pointerEvents: "none" as const }]}>
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
    categoryRailScroll: {
        flexGrow: 0,
        ...(Platform.OS === "web"
            ? {
                  overflowX: "auto" as const,
                  overflowY: "hidden" as const,
                  scrollbarWidth: "none" as const,
                  userSelect: "none" as const,
              }
            : {}),
    },
    categoryRailContent: {
        gap: 8,
        paddingLeft: 2,
        paddingRight: 8,
        minWidth: "100%",
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
    reviewsSection: {
        marginTop: 22,
        gap: 12,
    },
    reviewsHeader: {
        gap: 4,
    },
    reviewsTitle: {
        fontFamily: "ChairoSans",
        fontSize: 22,
        color: THEME.ink,
    },
    reviewsSubtitle: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.muted,
    },
    reviewSummaryCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        gap: 10,
        ...shadow,
    },
    reviewDistributionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    reviewDistributionLabel: {
        width: 28,
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.muted,
    },
    reviewDistributionTrack: {
        flex: 1,
        height: 8,
        borderRadius: 999,
        backgroundColor: "#F5E4D6",
        overflow: "hidden",
    },
    reviewDistributionFill: {
        height: "100%",
        borderRadius: 999,
        backgroundColor: THEME.accent,
    },
    reviewDistributionValue: {
        width: 24,
        textAlign: "right",
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.ink,
    },
    reviewFeed: {
        gap: 10,
    },
    reviewCard: {
        borderRadius: 22,
        padding: 14,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        gap: 8,
        ...shadow,
    },
    reviewEmptyCard: {
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        gap: 8,
        ...shadow,
    },
    reviewCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    reviewCardTitle: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: THEME.ink,
    },
    reviewCardRating: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.accentStrong,
    },
    reviewCardBody: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
        color: THEME.muted,
    },
    reviewCardMuted: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.subtle,
    },
    reviewReplyCard: {
        borderRadius: 16,
        paddingHorizontal: 10,
        paddingVertical: 9,
        backgroundColor: "rgba(35,161,103,0.10)",
        gap: 4,
    },
    reviewReplyLabel: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: "#1E7B51",
    },
    reviewReplyText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#1C5F40",
    },
});



