import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DeviceEventEmitter,
    FlatList,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    PanResponder,
    AppState,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import LanguageToggle from "@/components/LanguageToggle";
import { illustrations } from "@/constants/mediaCatalog";
import { getRestaurantImageSource } from "@/lib/assets";
import useHome from "@/src/hooks/useHome";
import useOrderStatus, { type PendingOrderStatus } from "@/src/hooks/useOrderStatus";
import { addressStore } from "@/src/features/address/addressStore";
import { useDefaultAddress } from "@/src/features/address/hooks";
import { makeShadow } from "@/src/lib/shadowStyle";
import { CATEGORY_CARDS } from "@/src/lib/categoryCards";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import { autoCancelExpiredPendingOrders, getOrderApprovalDeadlineMs, subscribeUserOrders } from "@/src/services/firebaseOrders";
import { useTheme } from "@/src/theme/themeContext";
import useAuthStore from "@/store/auth.store";
import { useFavoritesStore } from "@/store/favorites.store";
import type { Address, Order } from "@/src/domain/types";

const HeroArt = illustrations.rider;
const WEB_MAX_WIDTH = 960;
const CONTENT_HORIZONTAL_PADDING = 16;
const autoCancelingHomeOrderIds = new Set<string>();

const fallbackRestaurantMeta = [
    { rating: "4.8", eta: "20-25 dk", minBasket: "Min. 120 TL" },
    { rating: "4.7", eta: "25-30 dk", minBasket: "Min. 90 TL" },
    { rating: "4.6", eta: "15-20 dk", minBasket: "Min. 120 TL" },
    { rating: "4.7", eta: "20-25 dk", minBasket: "Min. 90 TL" },
];

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

const isRestaurantOpenForOrdering = (restaurant: any) => {
    const rawStatus = String(restaurant?.status || "").trim().toLowerCase();
    const isEnabled =
        restaurant?.isActive === false ||
        restaurant?.isOpen === false ||
        ["closed", "kapalı", "kapali", "inactive", "disabled", "offline"].includes(rawStatus)
            ? false
            : true;
    if (!isEnabled) return false;

    const open = restaurant?.openingTime || restaurant?.opening_time;
    const close = restaurant?.closingTime || restaurant?.closing_time;
    return isCurrentTimeWithinOpeningHours(open, close) !== false;
};

const formatEtaLabel = (restaurant: any, fallbackEta: string, isTurkish: boolean) => {
    const etaMin = parseNumericValue(restaurant?.deliveryEtaMin);
    const etaMax = parseNumericValue(restaurant?.deliveryEtaMax);
    if (etaMin !== null && etaMax !== null) {
        return `${Math.round(etaMin)}-${Math.round(etaMax)} ${isTurkish ? "dk." : "min"}`;
    }

    const storedRange = parseEtaRange(String(restaurant?.deliveryTime || restaurant?.eta || ""));
    if (storedRange) {
        return `${storedRange.min}-${storedRange.max} ${isTurkish ? "dk." : "min"}`;
    }

    const etaAverage = parseNumericValue(restaurant?.deliveryEtaAverage ?? restaurant?.etaMinutes);
    if (etaAverage !== null) {
        const rounded = Math.max(10, Math.round(etaAverage / 5) * 5);
        return `${Math.max(10, rounded - 5)}-${rounded + 5} ${isTurkish ? "dk." : "min"}`;
    }

    return isTurkish ? fallbackEta : fallbackEta.replace("dk", "min");
};

const formatMinimumOrderLabel = (restaurant: any, fallbackMinBasket: string, isTurkish: boolean) => {
    const minimumOrderAmount =
        parseNumericValue(restaurant?.minimumOrderAmount) ??
        parseNumericValue(restaurant?.minimumOrder) ??
        parseNumericValue(restaurant?.minOrderAmount) ??
        parseNumericValue(restaurant?.minBasketAmount);
    const fallbackAmount = parseNumericValue(fallbackMinBasket) ?? 0;
    const amount = minimumOrderAmount && minimumOrderAmount > 0 ? minimumOrderAmount : fallbackAmount;
    return isTurkish ? `Min. ${Math.round(amount)} ₺` : `Min ${Math.round(amount)} TL`;
};

const formatRatingLabel = (restaurant: any, fallbackRating: string) => {
    const rating = parseNumericValue(restaurant?.ratingAverage ?? restaurant?.rating);
    if (rating === null || rating <= 0) return fallbackRating;
    return rating.toFixed(1);
};

const formatCompactCount = (restaurant: any, fallbackCount: number) => {
    const ratingCount = parseNumericValue(restaurant?.ratingCount);
    const resolvedCount = ratingCount !== null ? Math.max(0, Math.round(ratingCount)) : fallbackCount;
    if (resolvedCount >= 1000) {
        const compact = (resolvedCount / 1000).toFixed(1).replace(/\.0$/, "");
        return `(${compact}k)`;
    }
    return `(${resolvedCount})`;
};

const normalizeRestaurantId = (restaurant: any, fallback: string) => {
    const raw =
        restaurant?.id ||
        restaurant?.$id ||
        restaurant?.slug ||
        restaurant?.code ||
        restaurant?.handle ||
        restaurant?.name ||
        fallback;

    return String(raw)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
};

const renderAddressLine = (address: any) =>
    [address?.line1, address?.block].filter(Boolean).join(", ") ||
    [address?.city, address?.country].filter(Boolean).join(", ");

const renderAddressDetail = (address: Address) => [address.room, address.city, address.country].filter(Boolean).join(", ");

const renderAddressDisplay = (address: any, fallbackAddress: string) => {
    if (!address) return fallbackAddress;

    const label = String(address?.label || "").trim();
    const block = String(address?.block || "").trim();

    if (label && block) return `${label} ${block}`;
    if (label) return label;
    return renderAddressLine(address) || fallbackAddress;
};

const getCuisineLabel = (restaurant: any, isTurkish: boolean) => {
    const rawCuisine = String(restaurant?.cuisine || restaurant?.category || "").trim();
    if (rawCuisine) return rawCuisine;
    return isTurkish ? "Lezzetler" : "Cuisine";
};

const getCuisineTags = (restaurant: any, isTurkish: boolean) => {
    const sourceValues = [
        restaurant?.cuisine,
        restaurant?.category,
        restaurant?.categories,
        restaurant?.tags,
        restaurant?.cuisines,
    ].filter(Boolean);

    const items = sourceValues.flatMap((value) => {
        if (Array.isArray(value)) return value;
        return String(value).split(/[,\u2022|/]+/);
    });

    const normalized = items
        .map((item) => String(item).trim())
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index);

    if (normalized.length) return normalized.slice(0, 3);
    return [isTurkish ? "Lezzetler" : "Cuisine"];
};

export function HomeTabScreen() {
    useWebDocumentTitle();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useStableWindowDimensions();
    const { t, i18n } = useTranslation();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { heroLoading, restaurants, restaurantsLoading } = useHome();
    const { defaultAddress, addresses } = useDefaultAddress();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const currentUser = useAuthStore((state) => state.user);
    const favoriteScope = currentUser?.accountId || currentUser?.id || "guest";
    const favoritesByScope = useFavoritesStore((state) => state.favoritesByScope);
    const favoriteScopesLoaded = useFavoritesStore((state) => state.loadedScopes);
    const favoriteIds = favoritesByScope[favoriteScope] || [];
    const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
    const hydrateFavorites = useFavoritesStore((state) => state.hydrateFavorites);
    const isTurkish = i18n.language?.startsWith("tr");
    const fallbackAddress = isTurkish ? "Adres seç" : t("deliverTo.subtitle");
    const addressValue = renderAddressDisplay(defaultAddress, fallbackAddress);
    const restaurantList = Array.isArray(restaurants) ? restaurants : [];
    const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
    const [restaurantStatusTick, setRestaurantStatusTick] = useState(() => Math.floor(Date.now() / 60000));
    const sortedRestaurantList = useMemo(() => {
        const indexed = restaurantList.map((restaurant, index) => ({ restaurant, index }));
        indexed.sort((a, b) => {
            const aOpen = isRestaurantOpenForOrdering(a.restaurant);
            const bOpen = isRestaurantOpenForOrdering(b.restaurant);
            if (aOpen !== bOpen) return aOpen ? -1 : 1;

            const aFavorite = favoriteIdSet.has(normalizeRestaurantId(a.restaurant, String(a.index)));
            const bFavorite = favoriteIdSet.has(normalizeRestaurantId(b.restaurant, String(b.index)));
            if (aFavorite === bFavorite) return a.index - b.index;
            return aFavorite ? -1 : 1;
        });
        return indexed.map((entry) => entry.restaurant);
    }, [favoriteIdSet, restaurantList, restaurantStatusTick]);
    const [sheetVisible, setSheetVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(defaultAddress?.id ?? null);
    const heroScrollRef = useRef<ScrollView>(null);
    const [heroWidth, setHeroWidth] = useState(0);
    const [activeHeroSlide, setActiveHeroSlide] = useState(0);
    const viewportWidth = windowWidth > 0 ? windowWidth : Platform.OS === "web" ? WEB_MAX_WIDTH : 390;
    const expectedHeroWidth =
        Math.min(Platform.OS === "web" ? WEB_MAX_WIDTH : viewportWidth, viewportWidth) - CONTENT_HORIZONTAL_PADDING * 2;
    const heroSlideWidth = Math.max(0, heroWidth || expectedHeroWidth);

    useEffect(() => {
        setSelectedId(defaultAddress?.id ?? null);
    }, [defaultAddress?.id]);

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

    useEffect(() => {
        if (favoriteScopesLoaded[favoriteScope]) return;
        void hydrateFavorites(favoriteScope);
    }, [favoriteScope, favoriteScopesLoaded, hydrateFavorites]);

    const categories = useMemo(
        () =>
            CATEGORY_CARDS.map((item) => ({
                ...item,
                label: isTurkish ? item.tr : item.en,
            })),
        [isTurkish],
    );

    const handleAddressPress = () => {
        if (!isAuthenticated) {
            showUserMessage(
                isTurkish ? "Giriş gerekli" : "Sign in required",
                isTurkish
                    ? "Adreslerini yönetmek için lütfen giriş yapın."
                    : "Please sign in to manage your delivery addresses.",
            );
            router.push("/sign-in");
            return;
        }
        if (Platform.OS === "web" && typeof document !== "undefined") {
            (document.activeElement as HTMLElement | null)?.blur?.();
        }
        setSheetVisible(true);
    };

    const handleUseAddress = useCallback(async () => {
        if (!selectedId) return;
        await addressStore.setDefault(selectedId);
        const updated = addresses.find((address) => address.id === selectedId);
        if (updated) {
            DeviceEventEmitter.emit("app/addressChanged", updated);
        }
        setSheetVisible(false);
    }, [addresses, selectedId]);

    const openManageAddresses = () => {
        setSheetVisible(false);
        router.push("/ManageAddresses");
    };

    const openSearch = useCallback(() => {
        router.push("/search");
    }, [router]);

    const openCategories = useCallback(() => {
        router.push("/categories");
    }, [router]);

    const openCategorySearch = (category: (typeof categories)[number]) => {
        router.push({
            pathname: "/search",
            params: { query: category.label, category: category.searchKey, refresh: String(Date.now()) },
        });
    };

    const heroSlides = useMemo(
        () => [
            {
                key: "restaurants",
                eyebrow: t("home.hero.eyebrow"),
                title: t("home.hero.title"),
                subtitle: isTurkish
                    ? "Kampüs çevresindeki lezzetler kapına gelsin, sen keyfine bak."
                    : "Campus favorites delivered right to your door.",
                cta: t("home.hero.cta"),
                colors: ["#EA1E2C", "#FF5F14", "#FF8A00"] as const,
                art: <HeroArt width={92} height={92} />,
                onPress: openSearch,
            },
            {
                key: "categories",
                eyebrow: isTurkish ? "Kategoriler" : "Categories",
                title: isTurkish ? "Canın ne isterse hızlıca bul." : "Find whatever you are craving.",
                subtitle: isTurkish ? "Burger, pizza, kebap ve daha fazlası tek dokunuşta." : "Burger, pizza, kebab and more in one tap.",
                cta: isTurkish ? "Kategorilere bak" : "Browse categories",
                colors: ["#FB5607", "#FF7A00", "#FFB000"] as const,
                art: <Ionicons name="fast-food" size={76} color="rgba(255,255,255,0.92)" />,
                onPress: openCategories,
            },
            {
                key: "search",
                eyebrow: isTurkish ? "Hızlı arama" : "Quick search",
                title: isTurkish ? "Favori lezzetini saniyede ara." : "Search your favorites in seconds.",
                subtitle: isTurkish ? "Restoran ya da yemek adı yaz, en iyi seçenekleri gösterelim." : "Type a restaurant or dish and see the best matches.",
                cta: isTurkish ? "Aramaya git" : "Start searching",
                colors: ["#FF3D00", "#FF8A00", "#FFC247"] as const,
                art: <Ionicons name="search-circle" size={86} color="rgba(255,255,255,0.92)" />,
                onPress: openSearch,
            },
        ],
        [isTurkish, openCategories, openSearch, t],
    );

    const updateHeroSlideFromOffset = useCallback(
        (offsetX: number) => {
            if (!heroSlideWidth) return;
            const nextIndex = Math.round(offsetX / heroSlideWidth);
            const clampedIndex = Math.max(0, Math.min(heroSlides.length - 1, nextIndex));
            setActiveHeroSlide((current) => (current === clampedIndex ? current : clampedIndex));
        },
        [heroSlideWidth, heroSlides.length],
    );

    const handleHeroScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            updateHeroSlideFromOffset(event.nativeEvent.contentOffset.x);
        },
        [updateHeroSlideFromOffset],
    );

    const handleHeroMomentumEnd = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            updateHeroSlideFromOffset(event.nativeEvent.contentOffset.x);
        },
        [updateHeroSlideFromOffset],
    );

    const goToHeroSlide = useCallback(
        (index: number) => {
            if (!heroSlideWidth) return;
            setActiveHeroSlide(index);
            heroScrollRef.current?.scrollTo({ x: index * heroSlideWidth, animated: true });
        },
        [heroSlideWidth],
    );

    const heroSwipeResponder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponder: (_, gestureState) => {
                    const horizontalMove = Math.abs(gestureState.dx);
                    const verticalMove = Math.abs(gestureState.dy);
                    return horizontalMove > 10 && horizontalMove > verticalMove * 1.15;
                },
                onMoveShouldSetPanResponderCapture: (_, gestureState) => {
                    const horizontalMove = Math.abs(gestureState.dx);
                    const verticalMove = Math.abs(gestureState.dy);
                    return horizontalMove > 10 && horizontalMove > verticalMove * 1.15;
                },
                onPanResponderRelease: (_, gestureState) => {
                    const threshold = Math.max(36, heroSlideWidth * 0.12);
                    if (gestureState.dx <= -threshold) {
                        goToHeroSlide(Math.min(heroSlides.length - 1, activeHeroSlide + 1));
                    } else if (gestureState.dx >= threshold) {
                        goToHeroSlide(Math.max(0, activeHeroSlide - 1));
                    }
                },
                onPanResponderTerminationRequest: () => false,
            }),
        [activeHeroSlide, goToHeroSlide, heroSlideWidth, heroSlides.length],
    );

    const requireSignInForFavorite = useCallback(() => {
        showUserMessage(
            isTurkish ? "Giriş gerekli" : "Sign in required",
            isTurkish
                ? "Favorilere restoran eklemek için lütfen giriş yapın."
                : "Please sign in to add restaurants to your favourites.",
        );
        router.push("/sign-in");
    }, [isTurkish, router]);

    const handleToggleFavorite = useCallback(
        (restaurantId: string) => {
            if (!isAuthenticated) {
                requireSignInForFavorite();
                return;
            }

            toggleFavorite(favoriteScope, restaurantId);
        },
        [favoriteScope, isAuthenticated, requireSignInForFavorite, toggleFavorite],
    );

    const renderAddressItem = useCallback(
        ({ item }: { item: Address }) => {
            const isSelected = item.id === selectedId;
            return (
                <Pressable
                    onPress={() => setSelectedId(item.id)}
                    style={[styles.addressItem, isSelected ? styles.addressItemSelected : styles.addressItemIdle]}
                >
                    <View style={styles.addressItemContent}>
                        <Text style={styles.addressItemLabel}>{item.label}</Text>
                        <Text style={styles.addressItemLine} numberOfLines={1}>
                            {renderAddressLine(item)}
                        </Text>
                        {renderAddressDetail(item) ? (
                            <Text style={styles.addressItemDetail} numberOfLines={1}>
                                {renderAddressDetail(item)}
                            </Text>
                        ) : null}
                    </View>
                    <View style={[styles.radioOuter, { borderColor: isSelected ? "#FE8C00" : "#CBD5E1" }]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                </Pressable>
            );
        },
        [selectedId, styles],
    );

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.content,
                    {
                        paddingTop: Math.max(insets.top, 16),
                        paddingBottom: 136 + Math.max(insets.bottom, 12),
                    },
                ]}
            >
                <Pressable style={styles.headerCard} onPress={handleAddressPress}>
                    <View style={styles.headerAddressRow}>
                        <View style={styles.addressIcon}>
                            <Ionicons name="location-sharp" size={20} color="#FF7A00" />
                        </View>
                        <View style={styles.addressCopy}>
                            <Text style={styles.addressLabel}>{isTurkish ? "Teslimat adresi" : "Delivery address"}</Text>
                            <View style={styles.addressValueRow}>
                                <Text style={styles.addressValue} numberOfLines={1}>
                                    {addressValue}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color="#6B7280" />
                            </View>
                        </View>
                    </View>
                    <View style={styles.languageShell}>
                        <LanguageToggle showLabel={false} />
                    </View>
                </Pressable>

                {heroLoading ? (
                    <View style={styles.heroSkeleton} />
                ) : (
                    <View
                        {...heroSwipeResponder.panHandlers}
                        style={styles.heroWrap}
                        onLayout={(event) => {
                            const nextWidth = event.nativeEvent.layout.width;
                            if (nextWidth && nextWidth !== heroWidth) {
                                setHeroWidth(nextWidth);
                            }
                        }}
                    >
                        <ScrollView
                            ref={heroScrollRef}
                            horizontal
                            pagingEnabled
                            snapToInterval={heroSlideWidth || undefined}
                            decelerationRate="fast"
                            bounces={false}
                            directionalLockEnabled
                            nestedScrollEnabled
                            keyboardShouldPersistTaps="handled"
                            showsHorizontalScrollIndicator={false}
                            onScroll={handleHeroScroll}
                            onMomentumScrollEnd={handleHeroMomentumEnd}
                            scrollEventThrottle={16}
                            style={styles.heroSlider}
                        >
                            {heroSlides.map((slide) => (
                                <LinearGradient
                                    key={slide.key}
                                    colors={slide.colors}
                                    start={{ x: 0, y: 0.12 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[styles.heroCard, { width: heroSlideWidth }]}
                                >
                                    <View style={styles.heroGlow} />
                                    <View style={styles.heroContent}>
                                        <View style={styles.heroBadge}>
                                            <Text style={styles.heroBadgeText}>{slide.eyebrow}</Text>
                                        </View>
                                        <Text style={styles.heroTitle}>{slide.title}</Text>
                                        <Text style={styles.heroSubtitle}>{slide.subtitle}</Text>
                                        <Pressable style={styles.heroButton} onPress={slide.onPress}>
                                            <Text style={styles.heroButtonText}>{slide.cta}</Text>
                                            <Ionicons name="arrow-forward" size={18} color="#F05A14" />
                                        </Pressable>
                                    </View>
                                    <View style={styles.heroArtWrap}>{slide.art}</View>
                                </LinearGradient>
                            ))}
                        </ScrollView>
                        <View style={styles.heroDots}>
                            {heroSlides.map((slide, index) => (
                                <Pressable
                                    key={slide.key}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Hero slide ${index + 1}`}
                                    onPress={() => goToHeroSlide(index)}
                                    style={styles.heroDotHit}
                                >
                                    <View style={[styles.heroDot, activeHeroSlide === index ? styles.heroDotActive : null]} />
                                </Pressable>
                            ))}
                        </View>
                    </View>
                )}

                <View style={styles.categoryHeaderRow}>
                    <Text style={styles.categoryHeaderTitle}>{isTurkish ? "Kategoriler" : "Categories"}</Text>
                    <Pressable style={styles.viewAllButton} onPress={openCategories}>
                        <Text style={styles.viewAllText}>{isTurkish ? "Tümünü gör >" : "See all >"}</Text>
                    </Pressable>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryRow}
                >
                    {categories.map((category) => (
                        <Pressable key={category.id} style={styles.categoryCard} onPress={() => openCategorySearch(category)}>
                            <View style={styles.categoryIconShell}>
                                {category.image ? (
                                    <Image source={category.image} style={styles.categoryImage} contentFit="contain" transition={150} />
                                ) : (
                                    <Ionicons name="grid-outline" size={24} color="#FF7A00" />
                                )}
                            </View>
                            <Text style={styles.categoryLabel}>{category.label}</Text>
                        </Pressable>
                    ))}
                </ScrollView>

                <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>{t("home.restaurantsTitle")}</Text>
                </View>

                <View style={styles.restaurantGrid}>
                    {(restaurantsLoading ? Array.from({ length: 4 }) : sortedRestaurantList).map((restaurant: any, index: number) => {
                        if (restaurantsLoading) {
                            return <View key={`skeleton-${index}`} style={styles.restaurantSkeleton} />;
                        }

                        const meta = fallbackRestaurantMeta[index % fallbackRestaurantMeta.length];
                        const restaurantId = normalizeRestaurantId(restaurant, String(index));
                        const imageUrl = restaurant?.imageUrl || restaurant?.image_url;
                        const source = getRestaurantImageSource(
                            imageUrl,
                            undefined,
                            restaurant?.name || (isTurkish ? "Restoran" : "Restaurant"),
                        );
                        const etaLabel = formatEtaLabel(restaurant, meta.eta, isTurkish);
                        const minBasketLabel = formatMinimumOrderLabel(restaurant, meta.minBasket, isTurkish);
                        const ratingLabel = formatRatingLabel(restaurant, meta.rating);
                        const ratingCountLabel = formatCompactCount(restaurant, index === 0 ? 1200 : index === 1 ? 890 : index === 2 ? 1100 : 650);
                        const cuisineLabel = getCuisineLabel(restaurant, isTurkish);
                        const cuisineTags = getCuisineTags(restaurant, isTurkish).slice(0, 2);
                        const isFavorite = favoriteIdSet.has(restaurantId);
                        const restaurantIsOpen = isRestaurantOpenForOrdering(restaurant);

                        return (
                            <View key={`${restaurantId}-${index}`} style={styles.restaurantCardShell}>
                                <Pressable
                                    style={[styles.restaurantCard, restaurantIsOpen ? null : styles.restaurantCardClosed]}
                                    onPress={() =>
                                        router.push({
                                            pathname: "/restaurants/[id]",
                                            params: { id: restaurantId },
                                        })
                                    }
                                >
                                    <View style={[styles.deliveryTag, restaurantIsOpen ? null : styles.deliveryTagClosed]}>
                                        <Text style={[styles.deliveryTagText, restaurantIsOpen ? null : styles.deliveryTagTextClosed]}>
                                            {restaurantIsOpen ? etaLabel : isTurkish ? "Kapalı" : "Closed"}
                                        </Text>
                                    </View>

                                    <Pressable
                                        style={[styles.favoriteButton, isFavorite ? styles.favoriteButtonActive : null]}
                                        hitSlop={8}
                                        onPress={(event) => {
                                            event.stopPropagation();
                                            handleToggleFavorite(restaurantId);
                                        }}
                                    >
                                        <Ionicons
                                            name={isFavorite ? "heart" : "heart-outline"}
                                            size={22}
                                            color={isFavorite ? "#E5484D" : restaurantIsOpen ? "#111827" : "#94A3B8"}
                                        />
                                    </Pressable>

                                    <View style={[styles.restaurantImageFrame, restaurantIsOpen ? null : styles.restaurantImageFrameClosed]}>
                                        <Image
                                            source={source}
                                            style={[styles.restaurantImage, restaurantIsOpen ? null : styles.restaurantImageClosed]}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            priority={index < 2 ? "high" : "normal"}
                                            transition={index < 2 ? 0 : 150}
                                        />
                                    </View>

                                    <Text
                                        style={[styles.restaurantName, restaurantIsOpen ? null : styles.restaurantTextClosed]}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {restaurant?.name || (isTurkish ? "Restoran" : "Restaurant")}
                                    </Text>

                                    <View style={styles.restaurantRatingRow}>
                                        <Ionicons name="star" size={15} color={restaurantIsOpen ? "#F7B500" : "#CBD5E1"} />
                                        <Text style={[styles.restaurantRatingText, restaurantIsOpen ? null : styles.restaurantTextClosed]}>{ratingLabel}</Text>
                                        <Text style={[styles.restaurantRatingCount, restaurantIsOpen ? null : styles.restaurantMutedTextClosed]}>{ratingCountLabel}</Text>
                                    </View>

                                    <Text style={[styles.restaurantMetaText, restaurantIsOpen ? null : styles.restaurantMutedTextClosed]} numberOfLines={1}>
                                        {minBasketLabel} • {cuisineLabel}
                                    </Text>

                                    <View style={styles.restaurantCuisineRow}>
                                        {cuisineTags.map((tag) => (
                                            <View
                                                key={`${restaurantId}-${tag}`}
                                                style={[styles.restaurantCuisineChip, restaurantIsOpen ? null : styles.restaurantCuisineChipClosed]}
                                            >
                                                <Text
                                                    style={[styles.restaurantCuisineChipText, restaurantIsOpen ? null : styles.restaurantMutedTextClosed]}
                                                    numberOfLines={1}
                                                >
                                                    {tag}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </Pressable>
                            </View>
                        );
                    })}
                </View>

                <OrderStatusCard />
            </ScrollView>

            <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
                <View style={styles.modalBackdrop}>
                    <Pressable style={styles.modalDismissArea} onPress={() => setSheetVisible(false)} />
                    <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>{t("deliverTo.modalTitle")}</Text>
                        {addresses.length ? (
                            <FlatList
                                data={addresses}
                                keyExtractor={(item) => item.id}
                                renderItem={renderAddressItem}
                                contentContainerStyle={{ paddingBottom: 16 }}
                            />
                        ) : (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>{t("deliverTo.emptyTitle")}</Text>
                                <Text style={styles.emptySubtitle}>{t("deliverTo.emptySubtitle")}</Text>
                            </View>
                        )}
                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.manageButton} onPress={openManageAddresses}>
                                <Text style={styles.manageButtonText}>{t("deliverTo.manage")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={!selectedId}
                                style={[styles.useButton, selectedId ? styles.useButtonEnabled : styles.useButtonDisabled]}
                                onPress={handleUseAddress}
                            >
                                <Text style={styles.useButtonText}>{t("deliverTo.useThis")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const OrderStatusCard = () => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user, isAuthenticated } = useAuthStore();
    const userId = useMemo(() => user?.id ?? user?.$id ?? user?.accountId ?? "", [user?.id, user?.$id, user?.accountId]);
    const [latestOrder, setLatestOrder] = useState<Order | null>(null);
    const orderId = latestOrder?.id ?? "";
    const { status } = useOrderStatus(orderId);

    useEffect(() => {
        if (!isAuthenticated || !userId) {
            setLatestOrder(null);
            return;
        }
        return subscribeUserOrders(userId, (orders) => {
            void autoCancelExpiredPendingOrders(orders || [], {
                inFlightIds: autoCancelingHomeOrderIds,
                onError: (error) => {
                    console.warn("[orders] Failed to auto-cancel expired pending order from home", error);
                },
            });
            const pendingOrder = orders.find((order) => order.status === "pending");
            setLatestOrder(pendingOrder ?? null);
        });
    }, [isAuthenticated, userId]);

    useEffect(() => {
        if (!latestOrder || latestOrder.status !== "pending") return undefined;

        const deadlineMs = getOrderApprovalDeadlineMs(latestOrder);
        if (!deadlineMs) return undefined;

        const runCleanup = () => {
            void autoCancelExpiredPendingOrders([latestOrder], {
                inFlightIds: autoCancelingHomeOrderIds,
                onError: (error) => {
                    console.warn("[orders] Failed to auto-cancel expired pending order from home timer", error);
                },
            });
        };

        const delayMs = Math.max(0, deadlineMs - Date.now());
        if (delayMs === 0) {
            runCleanup();
            return undefined;
        }

        const timer = setTimeout(runCleanup, delayMs);
        return () => clearTimeout(timer);
    }, [latestOrder]);

    const statusKey: PendingOrderStatus | null = orderId ? status : null;
    if (!statusKey || !latestOrder) return null;

    const stateMap: Record<PendingOrderStatus, { color: string; icon: "time-outline" | "checkmark" | "close"; title: string; subtitle: string }> = {
        awaiting_confirmation: {
            color: theme.colors.primary,
            icon: "time-outline",
            title: t("home.orderStatus.waitingTitle"),
            subtitle: t("home.orderStatus.waitingSubtitle"),
        },
        confirmed: {
            color: "#16A34A",
            icon: "checkmark",
            title: t("home.orderStatus.confirmedTitle"),
            subtitle: t("home.orderStatus.confirmedSubtitle"),
        },
        rejected: {
            color: "#DC2626",
            icon: "close",
            title: t("home.orderStatus.rejectedTitle"),
            subtitle: t("home.orderStatus.rejectedSubtitle"),
        },
    };

    const current = stateMap[statusKey];

    return (
        <View style={[styles.orderCard, { backgroundColor: `${current.color}10`, borderColor: `${current.color}26` }]}>
            <View style={[styles.orderIcon, { backgroundColor: `${current.color}18` }]}>
                <Ionicons name={current.icon} size={18} color={current.color} />
            </View>
            <View style={styles.orderContent}>
                <Text style={styles.orderTitle}>{current.title}</Text>
                <Text style={styles.orderSubtitle}>{current.subtitle}</Text>
            </View>
        </View>
    );
};

const createStyles = (theme: ReturnType<typeof useTheme>["theme"]) =>
    StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: "#FAF8FB",
        },
        content: {
            paddingHorizontal: 16,
            gap: 14,
            backgroundColor: "#FAF8FB",
        },
        headerCard: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 13,
            paddingVertical: 10,
            borderRadius: 26,
            backgroundColor: "#FFFFFF",
            ...makeShadow({ color: "#C9D2E3", offsetY: 8, blurRadius: 24, opacity: 0.16, elevation: 10 }),
        },
        headerAddressRow: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            minWidth: 0,
            gap: 10,
        },
        addressIcon: {
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFF6EA",
        },
        addressCopy: {
            flex: 1,
            minWidth: 0,
            justifyContent: "center",
        },
        addressLabel: {
            fontFamily: "ChairoSans",
            fontSize: 10,
            lineHeight: 12,
            color: "#6B7280",
        },
        addressValueRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 1,
        },
        addressValue: {
            flex: 1,
            fontFamily: "ChairoSans",
            fontSize: 13,
            lineHeight: 16,
            color: "#111827",
        },
        languageShell: {
            flexShrink: 0,
            transform: [{ scale: 0.78 }],
        },
        heroWrap: {
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "#FF6A00",
        },
        heroSlider: {
            width: "100%",
        },
        heroCard: {
            minHeight: 136,
            borderRadius: 24,
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 24,
            flexDirection: "row",
            overflow: "hidden",
        },
        heroGlow: {
            position: "absolute",
            right: -36,
            top: -6,
            width: 152,
            height: 152,
            borderRadius: 76,
            backgroundColor: "rgba(255,173,72,0.18)",
        },
        heroContent: {
            flex: 1,
            maxWidth: "58%",
            zIndex: 1,
        },
        heroBadge: {
            alignSelf: "flex-start",
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.18)",
            paddingHorizontal: 9,
            paddingVertical: 3,
            marginBottom: 7,
        },
        heroBadgeText: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 14,
            color: "#FFFFFF",
        },
        heroTitle: {
            fontFamily: "ChairoSans",
            fontSize: 19,
            lineHeight: 22,
            color: "#FFFFFF",
        },
        heroSubtitle: {
            marginTop: 6,
            fontFamily: "ChairoSans",
            fontSize: 11,
            lineHeight: 14,
            color: "rgba(255,255,255,0.92)",
        },
        heroButton: {
            marginTop: 9,
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 13,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: "#FFFFFF",
        },
        heroButtonText: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 14,
            color: "#F05A14",
        },
        heroArtWrap: {
            flex: 1,
            alignItems: "flex-end",
            justifyContent: "center",
            marginRight: -2,
            marginTop: 2,
        },
        heroDots: {
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
        },
        heroDot: {
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: "rgba(255,255,255,0.7)",
        },
        heroDotHit: {
            width: 18,
            height: 18,
            alignItems: "center",
            justifyContent: "center",
        },
        heroDotActive: {
            backgroundColor: "#FFFFFF",
        },
        heroSkeleton: {
            height: 136,
            borderRadius: 24,
            backgroundColor: "#F3E7DB",
        },
        categoryRow: {
            gap: 10,
            paddingRight: 10,
        },
        categoryHeaderRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: -2,
        },
        categoryHeaderTitle: {
            fontFamily: "ChairoSans",
            fontSize: 17,
            lineHeight: 21,
            color: "#16213E",
        },
        categoryCard: {
            width: 72,
            alignItems: "center",
            gap: 8,
        },
        categoryIconShell: {
            width: 62,
            height: 62,
            borderRadius: 18,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#F4F1EC",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            ...makeShadow({ color: "#D6DDEA", offsetY: 6, blurRadius: 18, opacity: 0.1, elevation: 6 }),
        },
        categoryImage: {
            width: "72%",
            height: "72%",
        },
        categoryLabel: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 15,
            color: "#1F2937",
            textAlign: "center",
        },
        viewAllButton: {
            alignSelf: "flex-end",
            paddingVertical: 2,
        },
        viewAllText: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 15,
            color: "#F05A14",
        },
        sectionRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 4,
        },
        sectionTitle: {
            fontFamily: "ChairoSans",
            fontSize: 17,
            lineHeight: 21,
            color: "#16213E",
        },
        restaurantGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            rowGap: 12,
        },
        restaurantCardShell: {
            width: "48%",
        },
        restaurantCard: {
            position: "relative",
            minHeight: 220,
            borderRadius: 22,
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 14,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#EDF1F6",
            ...makeShadow({ color: "#CDD6E4", offsetY: 10, blurRadius: 26, opacity: 0.15, elevation: 9 }),
        },
        restaurantCardClosed: {
            backgroundColor: "#F8FAFC",
            borderColor: "#E5E7EB",
            opacity: 0.78,
        },
        deliveryTag: {
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 2,
            borderRadius: 999,
            backgroundColor: "#E8F9ED",
            paddingHorizontal: 8,
            paddingVertical: 3,
        },
        deliveryTagClosed: {
            backgroundColor: "#E5E7EB",
        },
        deliveryTagText: {
            fontFamily: "ChairoSans",
            fontSize: 11,
            lineHeight: 14,
            color: "#2B9A59",
        },
        deliveryTagTextClosed: {
            color: "#64748B",
        },
        favoriteButton: {
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
        },
        favoriteButtonActive: {
            backgroundColor: "#FFF1F1",
        },
        restaurantImageFrame: {
            width: 68,
            height: 68,
            borderRadius: 18,
            alignSelf: "center",
            overflow: "hidden",
            marginTop: 10,
            marginBottom: 10,
            backgroundColor: "#FFF7EA",
        },
        restaurantImageFrameClosed: {
            backgroundColor: "#E5E7EB",
        },
        restaurantImage: {
            width: "100%",
            height: "100%",
        },
        restaurantImageClosed: {
            opacity: 0.55,
        },
        restaurantName: {
            fontFamily: "ChairoSans",
            fontSize: 15,
            lineHeight: 19,
            color: "#101828",
            minHeight: 19,
        },
        restaurantTextClosed: {
            color: "#64748B",
        },
        restaurantMutedTextClosed: {
            color: "#94A3B8",
        },
        restaurantRatingRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
        },
        restaurantRatingText: {
            fontFamily: "ChairoSans",
            fontSize: 13,
            lineHeight: 16,
            color: "#111827",
        },
        restaurantRatingCount: {
            fontFamily: "ChairoSans",
            fontSize: 13,
            lineHeight: 16,
            color: "#6B7280",
        },
        restaurantMetaText: {
            marginTop: 6,
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 16,
            color: "#5B6475",
            minHeight: 16,
        },
        restaurantCuisineRow: {
            flexDirection: "row",
            gap: 6,
            marginTop: 8,
            minHeight: 28,
            overflow: "hidden",
        },
        restaurantCuisineChip: {
            height: 28,
            paddingHorizontal: 8,
            borderRadius: 999,
            backgroundColor: "#F6F8FB",
            maxWidth: 84,
            alignItems: "center",
            justifyContent: "center",
        },
        restaurantCuisineChipClosed: {
            backgroundColor: "#EEF2F7",
        },
        restaurantCuisineChipText: {
            fontFamily: "ChairoSans",
            fontSize: 11,
            lineHeight: 14,
            color: "#475569",
            maxWidth: 68,
            textAlign: "center",
        },
        restaurantSkeleton: {
            width: "48%",
            height: 212,
            borderRadius: 22,
            backgroundColor: "#F3E7DB",
        },
        orderCard: {
            marginTop: 4,
            borderRadius: 24,
            borderWidth: 1,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        orderIcon: {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
        },
        orderContent: {
            flex: 1,
            gap: 2,
        },
        orderTitle: {
            fontSize: 15,
            lineHeight: 19,
            color: "#111827",
            fontFamily: "ChairoSans",
        },
        orderSubtitle: {
            fontSize: 13,
            lineHeight: 17,
            color: "#475569",
            fontFamily: "ChairoSans",
        },
        modalBackdrop: {
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
        },
        modalDismissArea: {
            flex: 1,
        },
        modalSheet: {
            maxHeight: "75%",
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            paddingHorizontal: 20,
            paddingTop: 16,
            rowGap: 16,
        },
        modalHandle: {
            height: 4,
            width: 64,
            borderRadius: 999,
            backgroundColor: "#E5E7EB",
            alignSelf: "center",
        },
        modalTitle: {
            fontSize: 21,
            lineHeight: 25,
            color: "#111827",
            fontFamily: "ChairoSans",
        },
        addressItem: {
            flexDirection: "row",
            alignItems: "center",
            columnGap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 24,
            borderWidth: 1,
            marginBottom: 12,
        },
        addressItemSelected: {
            borderColor: "#FE8C00",
            backgroundColor: "rgba(254, 140, 0, 0.05)",
        },
        addressItemIdle: {
            borderColor: "#E5E7EB",
            backgroundColor: "#FFFFFF",
        },
        addressItemContent: {
            flex: 1,
        },
        addressItemLabel: {
            fontSize: 17,
            lineHeight: 23,
            color: "#111827",
            fontFamily: "ChairoSans",
        },
        addressItemLine: {
            fontSize: 15,
            lineHeight: 21,
            color: "#4B5563",
            fontFamily: "ChairoSans",
        },
        addressItemDetail: {
            fontSize: 13,
            lineHeight: 17,
            color: "#94A3B8",
            fontFamily: "ChairoSans",
        },
        radioOuter: {
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            alignItems: "center",
            justifyContent: "center",
        },
        radioInner: {
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: "#FE8C00",
        },
        emptyState: {
            paddingVertical: 40,
            alignItems: "center",
            rowGap: 8,
        },
        emptyTitle: {
            fontSize: 17,
            lineHeight: 23,
            color: "#1F2937",
            fontFamily: "ChairoSans",
        },
        emptySubtitle: {
            fontSize: 15,
            lineHeight: 21,
            color: "#475569",
            textAlign: "center",
            fontFamily: "ChairoSans",
        },
        actionsRow: {
            flexDirection: "row",
            columnGap: 12,
        },
        manageButton: {
            flex: 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            paddingVertical: 12,
            alignItems: "center",
        },
        manageButtonText: {
            fontSize: 17,
            lineHeight: 23,
            color: "#1F2937",
            fontFamily: "ChairoSans",
        },
        useButton: {
            flex: 1,
            borderRadius: 999,
            paddingVertical: 12,
            alignItems: "center",
        },
        useButtonEnabled: {
            backgroundColor: "#FE8C00",
        },
        useButtonDisabled: {
            backgroundColor: "#FDBA74",
        },
        useButtonText: {
            fontSize: 17,
            lineHeight: 23,
            color: "#FFFFFF",
            fontFamily: "ChairoSans",
        },
    });

export default HomeTabScreen;
