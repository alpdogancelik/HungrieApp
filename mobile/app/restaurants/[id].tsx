import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { Animated, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

import Icon from "@/components/Icon";
import { getRestaurant, subscribeRestaurant } from "@/src/data/restaurantRepository";
import { getRestaurantCategories, getRestaurantMenu } from "@/src/data/menuRepository";
import { getRestaurantImageSource } from "@/lib/assets";
import useServerResource from "@/lib/useServerResource";
import type { OrderReview } from "@/src/domain/types";
import { getCategoryLabel, normalizeCategoryKey } from "@/src/lib/categoryLabels";
import { makeShadow } from "@/src/lib/shadowStyle";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import MenuItemCard from "@/src/features/restaurantMenu/components/MenuItemCard";
import { calculateRestaurantOrderReviewSummary, fetchRestaurantOrderReviews } from "@/src/data/reviewRepository";
import { useCartStore } from "@/store/cart.store";
import useAuthStore from "@/store/auth.store";
import { useFavoritesStore } from "@/src/data/favoritesRepository";

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
    address?: string;
    city?: string;
    district?: string;
    location?: string;
    imageUrl?: string | number;
    image_url?: string | number;
    openingTime?: string;
    closingTime?: string;
    isActive?: boolean;
    isOpen?: boolean;
    status?: string;
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

type TabKey = "menu" | "categories" | "reviews";

type ReviewSummaryView = {
    count: number;
    average: number;
    speed: number;
    taste: number;
    value: number;
};

const SEGMENT_TABS: Array<{ key: "menu" | "categories" | "reviews"; label: string }> = [
    { key: "menu", label: "Menü" },
    { key: "categories", label: "Kategoriler" },
    { key: "reviews", label: "Yorumlar" },
];

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
    en: new Intl.NumberFormat("tr-TR", {
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

const parseTimeOfDayMinutes = (value: unknown): number | null => {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

const isCurrentTimeWithinOpeningHours = (openingTime: unknown, closingTime: unknown, now = new Date()) => {
    const openMinutes = parseTimeOfDayMinutes(openingTime);
    const closeMinutes = parseTimeOfDayMinutes(closingTime);
    if (openMinutes === null || closeMinutes === null) return null;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (openMinutes === closeMinutes) return true;
    if (openMinutes < closeMinutes) {
        return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
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

const toRelativeReviewDate = (value?: string) => {
    if (!value) return "Az önce";
    const reviewTime = new Date(value).getTime();
    if (!Number.isFinite(reviewTime)) return "Az önce";

    const diff = Date.now() - reviewTime;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "Az önce";
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} dk önce`;
    if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} saat önce`;
    return `${Math.max(1, Math.floor(diff / day))} gün önce`;
};

const maskReviewAuthor = (userName?: string, userId?: string) => {
    const parts = String(userName || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]?.toUpperCase()}**** ${parts[1][0]?.toUpperCase()}`;
    if (parts.length === 1) return `${parts[0][0]?.toUpperCase()}****`;
    const fallback = String(userId || "").trim();
    return fallback ? `${fallback[0]?.toUpperCase()}****` : "Hungrie kullanıcısı";
};

const summarizeReviewItems = (items: OrderReview["itemsSnapshot"]) => {
    if (!Array.isArray(items) || !items.length) return "";
    const preview = items.slice(0, 3).map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`);
    const remaining = items.length - preview.length;
    if (remaining > 0) preview.push(`+${remaining} ürün`);
    return preview.join(", ");
};

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
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const currentUser = useAuthStore((state) => state.user);
    const favoriteScope = currentUser?.accountId || currentUser?.id || "guest";
    const favoritesByScope = useFavoritesStore((state) => state.favoritesByScope);
    const favoriteScopesLoaded = useFavoritesStore((state) => state.loadedScopes);
    const favoriteIds = favoritesByScope[favoriteScope] || [];
    const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
    const hydrateFavorites = useFavoritesStore((state) => state.hydrateFavorites);
    const { id } = useLocalSearchParams<{ id?: string }>();

    const routeId = id ? String(id) : undefined;
    const restaurantId = useMemo(() => routeId || initialId || "", [routeId, initialId]);
    const isFavorite = favoriteIds.includes(String(restaurantId).trim().toLowerCase());
    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const isTurkish = locale === "tr";
    const [restaurantStatusTick, setRestaurantStatusTick] = useState(() => Math.floor(Date.now() / 60000));

    useEffect(() => {
        if (favoriteScopesLoaded[favoriteScope]) return;
        void hydrateFavorites(favoriteScope);
    }, [favoriteScope, favoriteScopesLoaded, hydrateFavorites]);

    useEffect(() => {
        const interval = setInterval(() => {
            setRestaurantStatusTick(Math.floor(Date.now() / 60000));
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                setRestaurantStatusTick(Math.floor(Date.now() / 60000));
            }
        });
        return () => subscription.remove();
    }, []);

    const requireSignInForFavorite = useCallback(() => {
        showUserMessage(
            isTurkish ? "Giriş gerekli" : "Sign in required",
            isTurkish
                ? "Favorilere restoran eklemek için lütfen giriş yapın."
                : "Please sign in to add restaurants to your favourites.",
        );
        router.push("/sign-in");
    }, [isTurkish, router]);

    const handleToggleFavorite = useCallback(() => {
        if (!isAuthenticated) {
            requireSignInForFavorite();
            return;
        }

        toggleFavorite(favoriteScope, restaurantId);
    }, [favoriteScope, isAuthenticated, requireSignInForFavorite, restaurantId, toggleFavorite]);

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
        data: fetchedRestaurant,
        loading: restaurantLoading,
        error: restaurantError,
    } = useServerResource<Restaurant, string | undefined>({
        fn: fetchRestaurant,
        params: restaurantId || undefined,
        immediate: true,
        skipAlert: true,
    });
    const [liveRestaurant, setLiveRestaurant] = useState<Restaurant | null>(null);
    const restaurant = liveRestaurant ?? fetchedRestaurant;

    useEffect(() => {
        if (!restaurantId) {
            setLiveRestaurant(null);
            return undefined;
        }

        return subscribeRestaurant(
            restaurantId,
            (nextRestaurant) => {
                setLiveRestaurant((nextRestaurant as Restaurant | null) || null);
            },
            (error) => {
                console.warn("[restaurant] realtime subscription failed", error);
            },
        );
    }, [restaurantId]);

    useWebDocumentTitle();

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
    const [activeTab, setActiveTab] = useState<TabKey>("menu");
    const [searchQuery, setSearchQuery] = useState("");
    const [reviews, setReviews] = useState<OrderReview[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [reviewsLoaded, setReviewsLoaded] = useState(false);
    const [reviewsError, setReviewsError] = useState<string | null>(null);

    useEffect(() => {
        if (!categoryKeys.length) return;
        if (!activeCategory || !categoryKeys.includes(activeCategory)) {
            setActiveCategory(categoryKeys[0]);
        }
    }, [activeCategory, categoryKeys]);

    useEffect(() => {
        if (activeTab !== "reviews" || reviewsLoaded || !restaurantId) return;

        let cancelled = false;
        const loadReviews = async () => {
            setReviewsLoading(true);
            setReviewsError(null);
            try {
                const fetched = await fetchRestaurantOrderReviews(restaurantId, { limit: 20 });
                if (cancelled) return;
                setReviews(fetched);
                setReviewsLoaded(true);
            } catch (error: any) {
                if (cancelled) return;
                setReviewsError(error?.message || "Yorumlar alınamadı.");
            } finally {
                if (!cancelled) setReviewsLoading(false);
            }
        };

        void loadReviews();
        return () => {
            cancelled = true;
        };
    }, [activeTab, restaurantId, reviewsLoaded]);

    const visibleCategorySections = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return categoryKeys
            .map((key) => {
                const items = grouped[key] || [];
                const filteredItems = query
                    ? items.filter((item) => {
                          const name = String(item.name || "").toLowerCase();
                          const description = String(item.description || "").toLowerCase();
                          return name.includes(query) || description.includes(query);
                      })
                    : items;

                return {
                    key,
                    label: getCategoryLabel(key, locale as "tr" | "en"),
                    items: filteredItems,
                };
            })
            .filter((section) => section.items.length > 0);
    }, [categoryKeys, grouped, locale, searchQuery]);
    useEffect(() => {
        if (!visibleCategorySections.length) return;
        if (!visibleCategorySections.some((section) => section.key === activeCategory)) {
            setActiveCategory(visibleCategorySections[0].key);
        }
    }, [activeCategory, visibleCategorySections]);
    const categoryRows = useMemo(
        () =>
            categoryKeys.map((key) => ({
                key,
                label: getCategoryLabel(key, locale as "tr" | "en"),
                count: (grouped[key] || []).length,
            })),
        [categoryKeys, grouped, locale],
    );

    const openingHours = useMemo(() => {
        const open = restaurant?.openingTime || (restaurant as { opening_time?: string } | undefined)?.opening_time;
        const close = restaurant?.closingTime || (restaurant as { closing_time?: string } | undefined)?.closing_time;
        if (!open || !close) return null;
        return `${open} - ${close}`;
    }, [restaurant]);
    const isWithinOpeningHours = useMemo(() => {
        const open = restaurant?.openingTime || (restaurant as { opening_time?: string } | undefined)?.opening_time;
        const close = restaurant?.closingTime || (restaurant as { closing_time?: string } | undefined)?.closing_time;
        return isCurrentTimeWithinOpeningHours(open, close);
    }, [restaurant, restaurantStatusTick]);

    const displayName = restaurant?.name || restaurantId || (isTurkish ? "Restoran" : "Restaurant");
    const heroSubtitle = restaurant?.cuisine || (isTurkish ? "Kafe ve Izgara" : "Cafe & Grill");
    const heroSource = getRestaurantImageSource(
        restaurant?.imageUrl || restaurant?.image_url,
        undefined,
        `${restaurant?.id || restaurantId} ${restaurant?.name || ""}`,
    );
    const restaurantAverageRating = Number(parseNumericValue(restaurant?.ratingAverage) ?? 0);
    const restaurantRatingCount = Math.max(0, Number(parseNumericValue(restaurant?.ratingCount) ?? 0));
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
    const minimumOrderChipLabel = isTurkish ? minimumOrderLabel.replace("Min. ", "Min. ₺").replace("₺₺", "₺") : minimumOrderLabel;
    const deliveryFeeChipLabel = isTurkish ? deliveryFeeLabel.replace("Teslimat ", "Teslimat ₺").replace("₺₺", "₺") : deliveryFeeLabel;
    const locationLabel =
        String(
            restaurant?.district ||
                restaurant?.city ||
                restaurant?.location ||
                restaurant?.address ||
                (isTurkish ? "Kalkanlı" : "Kalkanli"),
        ).trim() || (isTurkish ? "Kalkanlı" : "Kalkanli");
    const rawStatus = String(restaurant?.status || "").trim().toLowerCase();
    const restaurantIsEnabled =
        restaurant?.isActive === false ||
        restaurant?.isOpen === false ||
        ["closed", "kapalı", "kapali", "inactive", "disabled", "offline"].includes(rawStatus)
            ? false
            : true;
    const restaurantIsActive = restaurantIsEnabled && isWithinOpeningHours !== false;
    const statusLabel = restaurantIsActive ? (isTurkish ? "Açık" : "Open") : isTurkish ? "Kapalı" : "Closed";
    const ratingSummaryLabel = restaurantRatingCount
        ? `${restaurantRatingLabel} ${restaurantReviewCountLabel}`
        : isTurkish
          ? "Yeni (0 yorum)"
          : "New (0 reviews)";
    const aggregateReviewSummary: ReviewSummaryView = useMemo(() => {
        const count = Math.max(0, Math.round(Number(parseNumericValue(restaurant?.ratingCount) ?? 0)));
        if (count <= 0) return { count: 0, average: 0, speed: 0, taste: 0, value: 0 };
        return {
            count,
            average: Number((Number(parseNumericValue(restaurant?.ratingAverage) ?? 0)).toFixed(1)),
            speed: Number((Number(parseNumericValue((restaurant as any)?.speedAverage) ?? 0)).toFixed(1)),
            taste: Number((Number(parseNumericValue((restaurant as any)?.tasteAverage) ?? 0)).toFixed(1)),
            value: Number((Number(parseNumericValue((restaurant as any)?.valueAverage) ?? 0)).toFixed(1)),
        };
    }, [restaurant]);
    const computedReviewSummary = useMemo(() => {
        const summary = calculateRestaurantOrderReviewSummary(reviews);
        return {
            count: summary.count,
            average: summary.averageRating,
            speed: summary.speedAverage,
            taste: summary.tasteAverage,
            value: summary.pricePerformanceAverage ?? summary.valueAverage,
        } satisfies ReviewSummaryView;
    }, [reviews]);
    const reviewSummary: ReviewSummaryView = computedReviewSummary.count > 0 ? computedReviewSummary : aggregateReviewSummary;
    const hasReviewMetrics = reviewSummary.count > 0;

    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const cartTotal = getTotalPrice();
    const openAllReviews = useCallback(() => {
        if (!restaurantId) return;
        router.push({
            pathname: "/restaurant-reviews/[id]",
            params: { id: restaurantId },
        });
    }, [restaurantId, router]);
    const visibleReviews = useMemo(() => reviews.slice(0, 20), [reviews]);

    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastScale = useRef(new Animated.Value(0.98)).current;
    const scrollY = useRef(new Animated.Value(0)).current;
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollRef = useRef<ScrollView | null>(null);
    const categoryRailRef = useRef<ScrollView | null>(null);
    const categorySectionYRef = useRef<Record<string, number>>({});
    const categoryPillXRef = useRef<Record<string, number>>({});
    const categoryPressScrollRef = useRef(false);
    const stickyCategoryRailRef = useRef<ScrollView | null>(null);
    const stickyCategoryPillXRef = useRef<Record<string, number>>({});
    const [addedToastVisible, setAddedToastVisible] = useState(false);
    const [addedToastText, setAddedToastText] = useState("");
    const [stickyHeaderVisible, setStickyHeaderVisible] = useState(false);
    const stickyHeaderVisibleRef = useRef(false);

    useEffect(() => {
        const pillX = categoryPillXRef.current[activeCategory];
        if (pillX !== undefined) {
            categoryRailRef.current?.scrollTo({ x: Math.max(0, pillX - 24), animated: true });
        }

        const stickyPillX = stickyCategoryPillXRef.current[activeCategory];
        if (stickyPillX !== undefined) {
            stickyCategoryRailRef.current?.scrollTo({ x: Math.max(0, stickyPillX - 24), animated: true });
        }
    }, [activeCategory]);

    const scrollToCategory = useCallback((key: string) => {
        setActiveCategory(key);
        categoryPressScrollRef.current = true;

        requestAnimationFrame(() => {
            const y = categorySectionYRef.current[key];
            if (y === undefined) {
                categoryPressScrollRef.current = false;
                return;
            }

            scrollRef.current?.scrollTo({ y: Math.max(0, y + 200), animated: true });
            setTimeout(() => {
                categoryPressScrollRef.current = false;
            }, 450);
        });
    }, []);

    const handleMenuScroll = useCallback(
        (event: any) => {
            const offsetY = Number(event?.nativeEvent?.contentOffset?.y || 0);
            const shouldShowStickyHeader = activeTab === "menu" && offsetY > 360 && visibleCategorySections.length > 0;
            if (stickyHeaderVisibleRef.current !== shouldShowStickyHeader) {
                stickyHeaderVisibleRef.current = shouldShowStickyHeader;
                setStickyHeaderVisible(shouldShowStickyHeader);
            }

            if (activeTab !== "menu" || categoryPressScrollRef.current || !visibleCategorySections.length) return;
            const y = offsetY + 130;
            let nextKey = visibleCategorySections[0]?.key || "";

            for (const section of visibleCategorySections) {
                const sectionY = categorySectionYRef.current[section.key];
                if (sectionY === undefined) continue;
                if (sectionY <= y) nextKey = section.key;
                else break;
            }

            if (nextKey && nextKey !== activeCategory) {
                setActiveCategory(nextKey);
            }
        },
        [activeCategory, activeTab, visibleCategorySections],
    );
    const stickyHeaderAnimatedStyle = {
        opacity: scrollY.interpolate({
            inputRange: [200, 260],
            outputRange: [0, 1],
            extrapolate: "clamp",
        }),
        transform: [
            {
                translateY: scrollY.interpolate({
                    inputRange: [320, 380],
                    outputRange: [-12, 0],
                    extrapolate: "clamp",
                }),
            },
        ],
    };

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
        if (!restaurantIsActive) {
            showUserMessage(
                isTurkish ? "Restoran kapalı" : "Restaurant closed",
                isTurkish
                    ? "Bu restoran şu anda sipariş almıyor. Lütfen açık bir restoran seçin."
                    : "This restaurant is not accepting orders right now. Please choose an open restaurant.",
            );
            return;
        }

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

    const renderCategoryPills = (options?: { sticky?: boolean }) =>
        categoryKeys.map((key) => {
            const active = key === activeCategory;
            const label = getCategoryLabel(key, locale as "tr" | "en");

            return (
                <Pressable
                    key={key}
                    onLayout={(event) => {
                        if (options?.sticky) {
                            stickyCategoryPillXRef.current[key] = event.nativeEvent.layout.x;
                            return;
                        }
                        categoryPillXRef.current[key] = event.nativeEvent.layout.x;
                    }}
                    onPress={() => scrollToCategory(key)}
                    style={[styles.categoryPill, active ? styles.categoryPillActive : null]}
                >
                    <Text style={[styles.categoryText, active ? styles.categoryTextActive : null]}>{label}</Text>
                </Pressable>
            );
        });

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
                                <Text style={styles.title} numberOfLines={1}>
                                    {displayName}
                                </Text>
                                <View style={[styles.statusPill, restaurantIsActive ? null : styles.statusPillClosed]}>
                                    <Text style={[styles.statusText, restaurantIsActive ? null : styles.statusTextClosed]}>{statusLabel}</Text>
                                </View>
                            </View>

                            <Text style={styles.subtitle} numberOfLines={1}>
                                {heroSubtitle}
                            </Text>

                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Icon name="star" size={13} color="#E0A53E" />
                                    <Text style={styles.metaText} numberOfLines={1}>
                                        {ratingSummaryLabel}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <Pressable
                            style={[styles.favoriteButton, isFavorite ? styles.favoriteButtonActive : null]}
                            onPress={handleToggleFavorite}
                        >
                            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={16} color={isFavorite ? "#E5484D" : THEME.subtle} />
                        </Pressable>
                    </View>

                    <View style={styles.infoStatsRow}>
                        <View style={styles.infoStatCard}>
                            <View style={styles.infoStatIconWrap}>
                                <Ionicons name="wallet-outline" size={14} color={THEME.accentStrong} />
                            </View>
                            <View style={styles.infoStatCopy}>
                                <Text style={styles.infoStatLabel}>{isTurkish ? "Min. sipariş" : "Min. order"}</Text>
                                <Text style={styles.infoStatValue}>{minimumOrderChipLabel.replace("Min. ", "")}</Text>
                            </View>
                        </View>
                        <View style={[styles.infoStatCard, styles.infoStatCardLast]}>
                            <View style={styles.infoStatIconWrap}>
                                <Ionicons name="location-outline" size={14} color={THEME.accentStrong} />
                            </View>
                            <View style={styles.infoStatCopy}>
                                <Text style={styles.infoStatLabel}>{isTurkish ? "Konum" : "Location"}</Text>
                                <Text style={styles.infoStatValue} numberOfLines={1}>{locationLabel}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.headerSearchBar}>
                        <Icon name="search" size={15} color={THEME.subtle} />
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder={isTurkish ? "Bu restoranda ara..." : "Search in this restaurant..."}
                            placeholderTextColor={THEME.subtle}
                            style={styles.headerSearchInput}
                            returnKeyType="search"
                        />
                    </View>
                </View>

                <View style={styles.segmentRail}>
                    {SEGMENT_TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        return (
                            <Pressable
                                key={tab.key}
                                onPress={() => setActiveTab(tab.key)}
                                style={[styles.segmentButton, isActive ? styles.segmentButtonActive : null]}
                            >
                                <Text style={[styles.segmentButtonText, isActive ? styles.segmentButtonTextActive : null]} numberOfLines={1}>
                                    {tab.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {activeTab === "menu" ? (
                    <>
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
                                    {renderCategoryPills()}
                                </ScrollView>
                            </View>
                        ) : null}

                        <View style={styles.menuSections}>
                            {visibleCategorySections.map((section) => (
                                <View
                                    key={section.key}
                                    onLayout={(event) => {
                                        categorySectionYRef.current[section.key] = event.nativeEvent.layout.y;
                                    }}
                                    style={styles.menuCategorySection}
                                >
                                    <View style={styles.menuCategoryHeader}>
                                        <Text style={styles.menuCategoryTitle}>{section.label}</Text>
                                        <Text style={styles.menuCategoryCount}>
                                            {isTurkish ? `${section.items.length} ürün` : `${section.items.length} items`}
                                        </Text>
                                    </View>

                                    <View style={styles.menuList}>
                                        {section.items.map((item) => {
                                            const ratingAverage = Number((item as any)?.ratingAverage ?? (item as any)?.rating ?? 0);
                                            const ratingCount = Number((item as any)?.ratingCount ?? 0);

                                            return (
                                                <MenuItemCard
                                                    key={String(item.id)}
                                                    item={item}
                                                    cuisine={restaurant?.cuisine}
                                                    activeCategory={section.key}
                                                    isTurkish={isTurkish}
                                                    addToCartLabel={restaurantIsActive ? t("restaurantUi.addToCart", "Sepete ekle") : isTurkish ? "Kapalı" : "Closed"}
                                                    priceLabel={formatTryPrice(item.price, locale)}
                                                    ratingAverage={ratingAverage}
                                                    ratingCount={ratingCount}
                                                    disabled={!restaurantIsActive}
                                                    onAddToCart={handleAddToCart}
                                                />
                                            );
                                        })}
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                ) : activeTab === "categories" ? (
                    <>
                        <View style={styles.sectionHead}>
                            <Text style={styles.sectionTitle}>{isTurkish ? "Kategoriler" : "Categories"}</Text>
                            <Text style={styles.sectionSubtitle}>{isTurkish ? "Kategoriye dokununca menüye geçilir" : "Tap a category to open in menu tab"}</Text>
                        </View>

                        <View style={styles.menuList}>
                            {categoryRows.map((row) => (
                                <Pressable
                                    key={row.key}
                                    style={styles.categoryRow}
                                    onPress={() => {
                                        setActiveTab("menu");
                                        setTimeout(() => scrollToCategory(row.key), 0);
                                    }}
                                >
                                    <Text style={styles.categoryRowLabel}>{row.label}</Text>
                                    <View style={styles.categoryRowCountPill}>
                                        <Text style={styles.categoryRowCountText}>{row.count}</Text>
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    </>
                ) : (
                    <View style={styles.reviewsSection}>
                        <View style={styles.reviewsHeader}>
                            <Text style={styles.reviewsTitle}>{isTurkish ? "Kullanıcı yorumları" : "Customer reviews"}</Text>
                            <Text style={styles.reviewsSubtitle}>
                                {isTurkish
                                    ? "Teslim edilen siparişlerden gelen gerçek değerlendirmeler"
                                    : "Authentic feedback from delivered orders"}
                            </Text>
                        </View>

                        {reviewsLoading ? (
                            <View style={styles.reviewEmptyCard}>
                                <Text style={styles.reviewCardTitle}>{isTurkish ? "Yorumlar yükleniyor..." : "Loading reviews..."}</Text>
                            </View>
                        ) : null}

                        {!reviewsLoading && reviewsError ? (
                            <View style={styles.reviewEmptyCard}>
                                <Text style={styles.reviewCardTitle}>{isTurkish ? "Yorumlar alınamadı" : "Unable to load reviews"}</Text>
                                <Text style={styles.reviewCardBody}>{reviewsError}</Text>
                                <Pressable style={styles.reviewPreviewCta} onPress={() => setReviewsLoaded(false)}>
                                    <Text style={styles.reviewPreviewCtaText}>{isTurkish ? "Tekrar dene" : "Try again"}</Text>
                                </Pressable>
                            </View>
                        ) : null}

                        {!reviewsLoading && !reviewsError ? (
                            <>
                                {hasReviewMetrics ? (
                                    <View style={styles.reviewSummaryCard}>
                                        <View style={styles.reviewPreviewTopRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.reviewPreviewTitle}>{isTurkish ? "Genel puan" : "Overall rating"}</Text>
                                                <Text style={styles.reviewPreviewCount}>
                                                    {`${reviewSummary.count} ${isTurkish ? "değerlendirme" : "reviews"}`}
                                                </Text>
                                            </View>
                                            <Pressable style={styles.reviewPreviewCta} onPress={openAllReviews}>
                                                <Text style={styles.reviewPreviewCtaText}>{isTurkish ? "Tüm yorumları gör" : "View all reviews"}</Text>
                                            </Pressable>
                                        </View>
                                        <View style={styles.reviewPreviewMetricsRow}>
                                            <View style={styles.reviewPreviewMetric}>
                                                <Text style={styles.reviewPreviewMetricLabel}>{isTurkish ? "Genel" : "Overall"}</Text>
                                                <Text style={styles.reviewPreviewMetricValue}>{reviewSummary.average.toFixed(1)}</Text>
                                            </View>
                                            <View style={styles.reviewPreviewMetric}>
                                                <Text style={styles.reviewPreviewMetricLabel}>{isTurkish ? "Lezzet" : "Taste"}</Text>
                                                <Text style={styles.reviewPreviewMetricValue}>{reviewSummary.taste.toFixed(1)}</Text>
                                            </View>
                                            <View style={styles.reviewPreviewMetric}>
                                                <Text style={styles.reviewPreviewMetricLabel}>{isTurkish ? "Hız" : "Speed"}</Text>
                                                <Text style={styles.reviewPreviewMetricValue}>{reviewSummary.speed.toFixed(1)}</Text>
                                            </View>
                                            <View style={styles.reviewPreviewMetric}>
                                                <Text style={styles.reviewPreviewMetricLabel}>F/P</Text>
                                                <Text style={styles.reviewPreviewMetricValue}>{reviewSummary.value.toFixed(1)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ) : null}

                                {!visibleReviews.length ? (
                                    <View style={styles.reviewEmptyCard}>
                                        <Text style={styles.reviewCardTitle}>{isTurkish ? "Henüz yorum yok" : "No reviews yet"}</Text>
                                        <Text style={styles.reviewCardBody}>
                                            {isTurkish
                                                ? "Teslim edilen sipariş yorumları burada görünecek."
                                                : "Delivered-order reviews will appear here."}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={styles.reviewFeed}>
                                        {visibleReviews.map((review) => {
                                            const itemsText = summarizeReviewItems(review.itemsSnapshot || []);
                                            const pricePerformance = Number(
                                                review.ratings.pricePerformance ?? review.ratings.value ?? 0,
                                            ).toFixed(1);
                                            const comment = String(review.comment || "").trim();
                                            return (
                                                <View key={review.id} style={styles.reviewCard}>
                                                    <View style={styles.reviewCardHeader}>
                                                        <Text style={styles.reviewCardTitle}>
                                                            {`${maskReviewAuthor(review.userName, review.userId)} · ${toRelativeReviewDate(review.createdAt || review.updatedAt)}`}
                                                        </Text>
                                                        <Text style={styles.reviewCardRating}>{review.averageRating.toFixed(1)}</Text>
                                                    </View>
                                                    <Text style={styles.reviewCardMuted}>
                                                        {`${isTurkish ? "Hız" : "Speed"} ${Number(review.ratings.speed || 0).toFixed(1)} · ${
                                                            isTurkish ? "Lezzet" : "Taste"
                                                        } ${Number(review.ratings.taste || 0).toFixed(1)} · F/P ${pricePerformance}`}
                                                    </Text>
                                                    {comment ? <Text style={styles.reviewCardBody}>{comment}</Text> : null}
                                                    {itemsText ? (
                                                        <Text style={styles.reviewCardMuted}>
                                                            {`${isTurkish ? "Sipariş:" : "Order:"} ${itemsText}`}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </>
                        ) : null}
                    </View>
                )}
            </>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <LinearGradient colors={[THEME.bgTop, THEME.bg, THEME.bgBottom]} style={styles.flex}>
                <Animated.ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: true, listener: handleMenuScroll },
                    )}
                    scrollEventThrottle={8}
                    contentContainerStyle={{
                        paddingTop: Math.max(insets.top, 4),
                        paddingHorizontal: 16,
                        paddingBottom: 132 + insets.bottom,
                    }}
                >
                    {renderContent()}
                </Animated.ScrollView>

                {activeTab === "menu" && visibleCategorySections.length ? (
                    <Animated.View
                        pointerEvents={stickyHeaderVisible ? "auto" : "none"}
                        style={[styles.stickyMenuHeader, { top: Math.max(insets.top, 8) }, stickyHeaderAnimatedStyle]}
                    >
                        <View style={styles.stickySearchBar}>
                            <Icon name="search" size={15} color={THEME.subtle} />
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder={isTurkish ? "Bu restoranda ara..." : "Search in this restaurant..."}
                                placeholderTextColor={THEME.subtle}
                                style={styles.stickySearchInput}
                                returnKeyType="search"
                            />
                        </View>

                        <ScrollView
                            ref={stickyCategoryRailRef}
                            horizontal
                            showsHorizontalScrollIndicator={Platform.OS === "web"}
                            contentContainerStyle={styles.stickyCategoryRailContent}
                            style={styles.stickyCategoryRailScroll}
                            scrollEventThrottle={16}
                        >
                            {renderCategoryPills({ sticky: true })}
                        </ScrollView>
                    </Animated.View>
                ) : null}

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

const styles = createAdaptiveStyleSheet({
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
        borderRadius: 26,
        padding: 12,
        backgroundColor: THEME.card,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        ...shadow,
    },
    headerTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    headerBackButton: {
        alignSelf: "flex-start",
        paddingTop: 2,
    },
    headerBackInner: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.line,
    },
    logoShell: {
        width: 48,
        height: 48,
        borderRadius: 14,
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
        minWidth: 0,
        gap: 2,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    title: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 19,
        color: THEME.ink,
    },
    statusPill: {
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 3,
        backgroundColor: THEME.openSoft,
    },
    statusPillClosed: {
        backgroundColor: "rgba(100,116,139,0.12)",
    },
    statusText: {
        fontFamily: "ChairoSans",
        fontSize: 9,
        color: THEME.open,
    },
    statusTextClosed: {
        color: THEME.muted,
    },
    subtitle: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.muted,
    },
    metaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 1,
    },
    metaItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
    },
    metaText: {
        fontFamily: "ChairoSans",
        fontSize: 10,
        color: THEME.ink,
    },
    metaSubtle: {
        fontFamily: "ChairoSans",
        fontSize: 10,
        color: THEME.subtle,
    },
    favoriteButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: THEME.line,
        backgroundColor: THEME.cardSoft,
        alignSelf: "flex-start",
    },
    favoriteButtonActive: {
        backgroundColor: "#FFF1F1",
        borderColor: "rgba(229,72,77,0.16)",
    },
    infoStatsRow: {
        marginTop: 12,
        flexDirection: "row",
        gap: 0,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        overflow: "hidden",
        backgroundColor: "#FFF9F4",
    },
    infoStatCard: {
        flex: 1,
        minHeight: 48,
        paddingHorizontal: 9,
        paddingVertical: 7,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#FFF9F4",
        borderRightWidth: 1,
        borderRightColor: THEME.lineSoft,
    },
    infoStatCardLast: {
        borderRightWidth: 0,
    },
    infoStatIconWrap: {
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    infoStatCopy: {
        flex: 1,
        minWidth: 0,
    },
    infoStatLabel: {
        fontFamily: "ChairoSans",
        fontSize: 9,
        lineHeight: 11,
        color: THEME.muted,
    },
    infoStatValue: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 10,
        lineHeight: 13,
        color: THEME.ink,
    },
    headerSearchBar: {
        marginTop: 12,
        height: 34,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.line,
        backgroundColor: THEME.cardSoft,
        paddingHorizontal: 11,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
    },
    headerSearchInput: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.ink,
        paddingVertical: 0,
        includeFontPadding: false,
    },
    segmentRail: {
        marginTop: 12,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        padding: 5,
        flexDirection: "row",
        gap: 5,
        ...shadow,
    },
    segmentButton: {
        flex: 1,
        height: 36,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
    },
    segmentButtonActive: {
        backgroundColor: THEME.accentSoft,
        borderWidth: 1,
        borderColor: "rgba(242,140,40,0.35)",
    },
    segmentButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.muted,
    },
    segmentButtonTextActive: {
        color: THEME.accentStrong,
    },
    categoryRail: {
        marginTop: 14,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        paddingVertical: 7,
        paddingHorizontal: 7,
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
        gap: 7,
        paddingLeft: 2,
        paddingRight: 8,
        minWidth: "100%",
    },
    categoryPill: {
        height: 36,
        borderRadius: 999,
        paddingHorizontal: 14,
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
        fontSize: 12,
        color: THEME.muted,
    },
    categoryTextActive: {
        color: THEME.accentStrong,
    },
    stickyMenuHeader: {
        position: "absolute",
        left: 16,
        right: 16,
        zIndex: 20,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        backgroundColor: "rgba(255,255,255,0.96)",
        padding: 8,
        gap: 8,
        ...makeShadow({
            color: "#8F6543",
            offsetY: 10,
            blurRadius: 24,
            opacity: Platform.OS === "ios" ? 0.1 : 0.14,
            elevation: 8,
        }),
    },
    stickySearchBar: {
        height: 34,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.line,
        backgroundColor: THEME.cardSoft,
        paddingHorizontal: 11,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
    },
    stickySearchInput: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.ink,
        paddingVertical: 0,
        includeFontPadding: false,
    },
    stickyCategoryRailScroll: {
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
    stickyCategoryRailContent: {
        gap: 7,
        paddingRight: 8,
        minWidth: "100%",
    },
    sectionHead: {
        marginTop: 16,
        marginBottom: 8,
    },
    sectionTitle: {
        fontFamily: "ChairoSans",
        fontSize: 20,
        color: THEME.ink,
    },
    sectionSubtitle: {
        marginTop: 4,
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.muted,
    },
    categoryRow: {
        minHeight: 50,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
        backgroundColor: THEME.card,
        paddingHorizontal: 12,
        paddingVertical: 10,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        ...shadow,
    },
    categoryRowLabel: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: THEME.ink,
    },
    categoryRowCountPill: {
        minWidth: 30,
        paddingHorizontal: 8,
        height: 26,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: THEME.accentSoft,
    },
    categoryRowCountText: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.accentStrong,
    },
    menuList: {
        gap: 10,
    },
    menuSections: {
        gap: 18,
    },
    menuCategorySection: {
        gap: 10,
    },
    menuCategoryHeader: {
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    menuCategoryTitle: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 17,
        color: THEME.ink,
    },
    menuCategoryCount: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.muted,
    },
    cartBar: {
        position: "absolute",
    },
    cartBarInner: {
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 10,
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
        gap: 8,
    },
    cartIconBubble: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(37,27,23,0.88)",
    },
    cartTitle: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.ink,
    },
    cartSubtitle: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: "rgba(37,27,23,0.72)",
    },
    cartCta: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: "rgba(255,255,255,0.8)",
    },
    cartCtaText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
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
    reviewPreviewTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    reviewPreviewTitle: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: THEME.ink,
    },
    reviewPreviewCount: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: THEME.muted,
    },
    reviewPreviewCta: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: THEME.accentSoft,
        borderWidth: 1,
        borderColor: "rgba(242,140,40,0.3)",
    },
    reviewPreviewCtaText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: THEME.accentStrong,
    },
    reviewPreviewMetricsRow: {
        flexDirection: "row",
        gap: 8,
    },
    reviewPreviewMetric: {
        flex: 1,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: THEME.cardSoft,
        borderWidth: 1,
        borderColor: THEME.lineSoft,
    },
    reviewPreviewMetricLabel: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: THEME.muted,
    },
    reviewPreviewMetricValue: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: THEME.accentStrong,
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
