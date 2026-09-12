import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Animated,
    LayoutChangeEvent,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { getRestaurantImageSource } from "@/lib/assets";
import useServerResource from "@/lib/useServerResource";
import { getRestaurantBundle } from "@/src/data/menuRepository";
import { useFavoritesStore } from "@/src/data/favoritesRepository";
import { StandaloneBottomNavigation } from "@/src/features/navigation/BottomNavigation";
import { useMenuItemImage } from "@/src/features/restaurantMenu/hooks/useMenuItemImage";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useTheme } from "@/src/theme/themeContext";
import useAuthStore from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";

import MenuItemRow from "./MenuItemRow";
import { createMenuSections, formatTry, getEta, getPromotionText, isRestaurantOpen, parseNumber } from "./menuUtils";
import type { MenuCategory, MenuEntry, Restaurant } from "./types";

const ORANGE = "#FF5A1F";
const HERO_HEIGHT = 218;
const COMPACT_HEADER_HEIGHT = 46;
const CATEGORY_BAR_HEIGHT = 49;
const SCROLL_SPY_GAP = 8;
const PROGRAMMATIC_SCROLL_TIMEOUT = 900;
const TAB_COLOR_DURATION = 180;
const UNDERLINE_DURATION = 220;
const TAB_HORIZONTAL_COMFORT = 16;
type Bundle = { restaurant: Restaurant; categories: MenuCategory[]; items: MenuEntry[] };
type TabMetric = { x: number; width: number };

const RestaurantMenuScreen = () => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { i18n } = useTranslation();
    const { variant } = useTheme();
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const restaurantId = Array.isArray(id) ? id[0] : id || "";
    const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
    const isTurkish = locale === "tr";
    const isDark = variant === "dark";
    const styles = useMemo(() => createStyles(isDark), [isDark]);
    const colors = useMemo(() => palette(isDark), [isDark]);
    const scrollRef = useRef<ScrollView>(null);
    const compactSearchInputRef = useRef<TextInput>(null);
    const scrollAnimation = useRef(new Animated.Value(0)).current;
    const searchVisibilityOverride = useRef(new Animated.Value(0)).current;
    const normalTabsRef = useRef<ScrollView>(null);
    const stickyTabsRef = useRef<ScrollView>(null);
    const sheetYRef = useRef(0);
    const categoryBarYRef = useRef(0);
    const categoryStickyThresholdRef = useRef(0);
    const sheetMeasuredRef = useRef(false);
    const categoryBarMeasuredRef = useRef(false);
    const sectionOffsetsRef = useRef<Record<string, number>>({});
    const tabMetricsRef = useRef<Record<string, TabMetric>>({});
    const tabColorValuesRef = useRef<Record<string, Animated.Value>>({});
    const underlineX = useRef(new Animated.Value(0)).current;
    const underlineWidth = useRef(new Animated.Value(0)).current;
    const underlineInitializedRef = useRef(false);
    const tabViewportWidthRef = useRef(0);
    const tabContentWidthRef = useRef(0);
    const tabHorizontalOffsetRef = useRef(0);
    const verticalViewportHeightRef = useRef(0);
    const verticalContentHeightRef = useRef(0);
    const unfilteredContentHeightRef = useRef(0);
    const menuResultsYRef = useRef(0);
    const scrollYRef = useRef(0);
    const activeRef = useRef("");
    const activeBeforeSearchRef = useRef("");
    const wasSearchActiveRef = useRef(false);
    const searchRevealScrollRef = useRef(false);
    const programmaticTargetRef = useRef<{ key: string; y: number } | null>(null);
    const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const authenticated = useAuthStore((state) => state.isAuthenticated);
    const user = useAuthStore((state) => state.user);
    const scope = user?.accountId || user?.id || "guest";
    const favoritesByScope = useFavoritesStore((state) => state.favoritesByScope);
    const favorites = favoritesByScope[scope] || [];
    const loaded = useFavoritesStore((state) => state.loadedScopes);
    const hydrate = useFavoritesStore((state) => state.hydrateFavorites);
    const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
    const addItem = useCartStore((state) => state.addItem);

    const [query, setQuery] = useState("");
    const [active, setActive] = useState("");
    const [stickyVisible, setStickyVisible] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [searchInteractive, setSearchInteractive] = useState(false);
    const [searchFadeEnd, setSearchFadeEnd] = useState(320);
    const [categoryReady, setCategoryReady] = useState(false);
    const [infoVisible, setInfoVisible] = useState(false);
    const [selected, setSelected] = useState<{ item: MenuEntry; imageUrl?: string } | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [selectedCustomizationIds, setSelectedCustomizationIds] = useState<string[]>([]);
    const compactTopHeight = insets.top + COMPACT_HEADER_HEIGHT;
    const stickyHeight = compactTopHeight + CATEGORY_BAR_HEIGHT;
    const scrollBottomPadding = 62 + insets.bottom;
    const normalizedQuery = query.trim().toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-GB");
    const isSearchActive = normalizedQuery.length > 0;
    const keepSearchVisible = searchFocused || isSearchActive;
    const scrollSearchOpacity = scrollAnimation.interpolate({
        inputRange: [0, Math.max(1, searchFadeEnd)],
        outputRange: [0, 1],
        extrapolate: "clamp",
    });
    const searchOpacity = Animated.add(scrollSearchOpacity, searchVisibilityOverride).interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: "clamp",
    });
    const scrollSearchTranslateY = scrollAnimation.interpolate({
        inputRange: [0, Math.max(1, searchFadeEnd)],
        outputRange: [-8, 0],
        extrapolate: "clamp",
    });
    const searchTranslateY = Animated.multiply(
        scrollSearchTranslateY,
        Animated.subtract(1, searchVisibilityOverride),
    );
    const categoryTranslateY = scrollAnimation.interpolate({
        inputRange: [0, Math.max(1, searchFadeEnd)],
        outputRange: [Math.max(1, searchFadeEnd), 0],
        extrapolateLeft: "extend",
        extrapolateRight: "clamp",
    });
    const searchResultsMinHeight = isSearchActive && unfilteredContentHeightRef.current > 0
        ? Math.max(260, unfilteredContentHeightRef.current - sheetYRef.current - menuResultsYRef.current - scrollBottomPadding)
        : undefined;
    const heroPullTranslateY = scrollAnimation.interpolate({
        inputRange: [-HERO_HEIGHT, 0],
        outputRange: [-HERO_HEIGHT / 2, 0],
        extrapolateLeft: "extend",
        extrapolateRight: "clamp",
    });
    const heroPullScale = scrollAnimation.interpolate({
        inputRange: [-HERO_HEIGHT, 0],
        outputRange: [2, 1],
        extrapolateLeft: "extend",
        extrapolateRight: "clamp",
    });

    useEffect(() => { if (!loaded[scope]) void hydrate(scope); }, [hydrate, loaded, scope]);
    useEffect(() => {
        searchVisibilityOverride.setValue(keepSearchVisible ? 1 : 0);
    }, [keepSearchVisible, searchVisibilityOverride]);
    useEffect(() => () => {
        if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    }, []);
    const fetchBundle = useCallback(async (target?: string) => {
        if (!target) throw new Error("Restaurant id is missing.");
        return getRestaurantBundle(target) as Promise<Bundle | null>;
    }, []);
    const { data: bundle, loading, error, refetch } = useServerResource<Bundle | null, string | undefined>({ fn: fetchBundle, params: restaurantId || undefined, immediate: true, skipAlert: true });
    const restaurant = bundle?.restaurant || null;
    const allSections = useMemo(() => createMenuSections(bundle?.items || [], bundle?.categories || [], locale), [bundle?.categories, bundle?.items, locale]);
    const sections = useMemo(() => {
        if (!normalizedQuery) return allSections;
        return allSections.map((section) => ({ ...section, data: section.data.filter((item) => `${item.name} ${item.description || ""}`.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-GB").includes(normalizedQuery)) })).filter((section) => section.data.length);
    }, [allSections, locale, normalizedQuery]);
    const hasNoSearchResults = isSearchActive && !sections.length;
    const tabSections = hasNoSearchResults ? allSections : sections;
    const emptySearchPaddingTop = hasNoSearchResults
        ? Math.max(54, scrollYRef.current + stickyHeight - sheetYRef.current - menuResultsYRef.current + 54)
        : 54;
    useEffect(() => {
        if (isSearchActive && !wasSearchActiveRef.current) {
            activeBeforeSearchRef.current = activeRef.current;
        } else if (!isSearchActive && wasSearchActiveRef.current) {
            const previousKey = activeBeforeSearchRef.current;
            if (previousKey && allSections.some((section) => section.key === previousKey)) {
                activeRef.current = previousKey;
                setActive(previousKey);
            }
            activeBeforeSearchRef.current = "";
        }
        wasSearchActiveRef.current = isSearchActive;
    }, [allSections, isSearchActive]);
    useEffect(() => {
        const validKeys = new Set(sections.map((section) => section.key));
        Object.keys(sectionOffsetsRef.current).forEach((key) => { if (!validKeys.has(key)) delete sectionOffsetsRef.current[key]; });
        Object.keys(tabMetricsRef.current).forEach((key) => { if (!validKeys.has(key)) delete tabMetricsRef.current[key]; });
        Object.keys(tabColorValuesRef.current).forEach((key) => { if (!validKeys.has(key)) delete tabColorValuesRef.current[key]; });
        if (!sections.length) return;
        const nextActive = sections.some((section) => section.key === activeRef.current) ? activeRef.current : sections[0]?.key || "";
        activeRef.current = nextActive;
        setActive(nextActive);
    }, [sections]);

    const normalizedId = restaurantId.trim().toLowerCase();
    const favorite = favorites.includes(normalizedId);
    const open = isRestaurantOpen(restaurant);
    const rating = parseNumber(restaurant?.ratingAverage);
    const ratingCount = Math.max(0, Math.round(parseNumber(restaurant?.ratingCount) || 0));
    const cuisine = String(restaurant?.cuisine || (isTurkish ? "Restoran" : "Restaurant"));
    const minimum = parseNumber(restaurant?.minimumOrderAmount ?? restaurant?.minimumOrder ?? restaurant?.minOrderAmount ?? restaurant?.minBasketAmount);
    const promotion = getPromotionText(restaurant, locale);
    const logoSource = restaurant ? getRestaurantImageSource(restaurant.imageUrl || restaurant.image_url, undefined, `${restaurant.id || restaurantId} ${restaurant.name || ""}`) : null;
    const heroItem = useMemo(() => {
        const items = bundle?.items || [];
        return items.find((item) => `${item.name} ${item.category || ""} ${item.categories || ""}`.toLowerCase().includes("pizza")) || items[0];
    }, [bundle?.items]);
    const heroImage = useMenuItemImage({ name: heroItem?.name || "", category: "pizza", cuisine, explicitImageUrl: heroItem?.image_url || heroItem?.imageUrl });
    const heroSource = heroImage.bestImageUrl ? { uri: heroImage.bestImageUrl } : logoSource;

    const favoritePress = () => {
        if (!authenticated) {
            showUserMessage(isTurkish ? "Giriş gerekli" : "Sign in required", isTurkish ? "Favorilere restoran eklemek için lütfen giriş yapın." : "Please sign in to add restaurants to your favourites.");
            router.push("/sign-in");
            return;
        }
        toggleFavorite(scope, normalizedId);
    };
    const addToCart = useCallback((item: MenuEntry, imageUrl?: string, count = 1, customizations = item.customizations || []) => {
        if (!open) {
            showUserMessage(isTurkish ? "Restoran kapalı" : "Restaurant closed", isTurkish ? "Bu restoran şu anda sipariş almıyor." : "This restaurant is not accepting orders right now.");
            return;
        }
        for (let index = 0; index < count; index += 1) addItem({ id: String(item.id), name: item.name, price: Number(item.price || 0), image_url: imageUrl || item.image_url || item.imageUrl || "", restaurantId: restaurantId || item.restaurantId, customizations });
    }, [addItem, isTurkish, open, restaurantId]);
    const setActiveCategory = useCallback((key: string) => {
        if (!key || activeRef.current === key) return;
        activeRef.current = key;
        setActive(key);
    }, []);
    const releaseProgrammaticScroll = useCallback(() => {
        programmaticTargetRef.current = null;
        if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
        programmaticTimerRef.current = null;
    }, []);
    const tabColorValue = useCallback((key: string) => {
        if (!tabColorValuesRef.current[key]) {
            tabColorValuesRef.current[key] = new Animated.Value(key === activeRef.current ? 1 : 0);
        }
        return tabColorValuesRef.current[key];
    }, []);
    const animateUnderlineTo = useCallback((key: string, animated = true) => {
        const metric = tabMetricsRef.current[key];
        if (!metric) return;
        const targetX = metric.x + 10;
        const targetWidth = Math.max(0, metric.width - 20);
        underlineX.stopAnimation();
        underlineWidth.stopAnimation();
        if (!underlineInitializedRef.current || !animated) {
            underlineInitializedRef.current = true;
            underlineX.setValue(targetX);
            underlineWidth.setValue(targetWidth);
            return;
        }
        Animated.parallel([
            Animated.timing(underlineX, { toValue: targetX, duration: UNDERLINE_DURATION, useNativeDriver: false }),
            Animated.timing(underlineWidth, { toValue: targetWidth, duration: UNDERLINE_DURATION, useNativeDriver: false }),
        ]).start();
    }, [underlineWidth, underlineX]);
    const scrollTabsToCategory = useCallback((key: string, animated = true) => {
        const metric = tabMetricsRef.current[key];
        const viewportWidth = tabViewportWidthRef.current;
        if (!metric || viewportWidth <= 0) return;
        const currentOffset = tabHorizontalOffsetRef.current;
        const comfortableLeft = currentOffset + TAB_HORIZONTAL_COMFORT;
        const comfortableRight = currentOffset + viewportWidth - TAB_HORIZONTAL_COMFORT;
        if (metric.x >= comfortableLeft && metric.x + metric.width <= comfortableRight) return;
        const maxOffset = Math.max(0, tabContentWidthRef.current - viewportWidth);
        const centeredOffset = metric.x + metric.width / 2 - viewportWidth / 2;
        const x = Math.max(0, Math.min(maxOffset, centeredOffset));
        normalTabsRef.current?.scrollTo({ x, animated });
        stickyTabsRef.current?.scrollTo({ x, animated });
    }, []);
    useEffect(() => {
        if (!active) return;
        for (const section of sections) {
            const value = tabColorValue(section.key);
            value.stopAnimation();
            Animated.timing(value, {
                toValue: section.key === active ? 1 : 0,
                duration: TAB_COLOR_DURATION,
                useNativeDriver: false,
            }).start();
        }
        animateUnderlineTo(active);
        const frame = requestAnimationFrame(() => scrollTabsToCategory(active));
        return () => cancelAnimationFrame(frame);
    }, [active, animateUnderlineTo, scrollTabsToCategory, sections, tabColorValue]);
    const sectionDocumentY = useCallback((key: string) => {
        const localY = sectionOffsetsRef.current[key];
        return typeof localY === "number" ? sheetYRef.current + menuResultsYRef.current + localY : null;
    }, []);
    const updateSearchFadeThreshold = useCallback(() => {
        if (!sheetMeasuredRef.current || !categoryBarMeasuredRef.current) return;
        const threshold = sheetYRef.current + categoryBarYRef.current - compactTopHeight;
        if (threshold <= 0) return;
        categoryStickyThresholdRef.current = threshold;
        setSearchFadeEnd((current) => Math.abs(current - threshold) < 0.5 ? current : threshold);
        setCategoryReady(true);
    }, [compactTopHeight]);
    const updateScrollSpy = useCallback((scrollY: number) => {
        if (programmaticTargetRef.current || !sections.length) return;
        const marker = scrollY + stickyHeight + SCROLL_SPY_GAP;
        let nextKey = sections[0].key;
        for (const section of sections) {
            const sectionY = sectionDocumentY(section.key);
            if (sectionY === null || sectionY > marker) break;
            nextKey = section.key;
        }
        setActiveCategory(nextKey);
    }, [sectionDocumentY, sections, setActiveCategory, stickyHeight]);
    const handleVerticalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = Math.max(0, event.nativeEvent.contentOffset.y);
        const previousY = scrollYRef.current;
        scrollYRef.current = y;
        setSearchInteractive((current) => {
            const next = y > 2;
            return current === next ? current : next;
        });
        const stickyThreshold = categoryStickyThresholdRef.current;
        const shouldStick = stickyThreshold > 0 && y >= stickyThreshold;
        setStickyVisible((current) => current === shouldStick ? current : shouldStick);
        if (searchRevealScrollRef.current && shouldStick) {
            searchRevealScrollRef.current = false;
        } else if (!searchRevealScrollRef.current && searchFocused && !isSearchActive && previousY > y && y < stickyThreshold) {
            compactSearchInputRef.current?.blur();
            setSearchFocused(false);
        }
        const target = programmaticTargetRef.current;
        if (target) {
            if (Math.abs(y - target.y) <= 2) releaseProgrammaticScroll();
            return;
        }
        const maxScrollY = Math.max(0, event.nativeEvent.contentSize.height - event.nativeEvent.layoutMeasurement.height);
        if (maxScrollY > 0 && y >= maxScrollY - 2 && sections.length) {
            setActiveCategory(sections[sections.length - 1].key);
            return;
        }
        updateScrollSpy(y);
    }, [isSearchActive, releaseProgrammaticScroll, searchFocused, sections, setActiveCategory, updateScrollSpy]);
    const animatedVerticalScroll = useMemo(() => Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollAnimation } } }],
        { useNativeDriver: true, listener: handleVerticalScroll },
    ), [handleVerticalScroll, scrollAnimation]);
    const handleScrollSettled = useCallback(() => {
        releaseProgrammaticScroll();
        const maxScrollY = Math.max(0, verticalContentHeightRef.current - verticalViewportHeightRef.current);
        if (maxScrollY > 0 && scrollYRef.current >= maxScrollY - 2 && sections.length) {
            setActiveCategory(sections[sections.length - 1].key);
            return;
        }
        updateScrollSpy(scrollYRef.current);
    }, [releaseProgrammaticScroll, sections, setActiveCategory, updateScrollSpy]);
    const handleUserDrag = useCallback(() => {
        searchRevealScrollRef.current = false;
        releaseProgrammaticScroll();
    }, [releaseProgrammaticScroll]);
    const selectCategory = useCallback((key: string) => {
        const sectionY = sectionDocumentY(key);
        if (sectionY === null) return;
        const maxScrollY = Math.max(0, verticalContentHeightRef.current - verticalViewportHeightRef.current);
        const targetY = Math.max(0, Math.min(maxScrollY, sectionY - stickyHeight));
        const stickyTriggerY = categoryStickyThresholdRef.current;
        setActiveCategory(key);
        setStickyVisible(targetY >= stickyTriggerY);
        scrollTabsToCategory(key);
        releaseProgrammaticScroll();
        programmaticTargetRef.current = { key, y: targetY };
        programmaticTimerRef.current = setTimeout(handleScrollSettled, PROGRAMMATIC_SCROLL_TIMEOUT);
        scrollRef.current?.scrollTo({ y: targetY, animated: true });
    }, [compactTopHeight, handleScrollSettled, releaseProgrammaticScroll, scrollTabsToCategory, sectionDocumentY, setActiveCategory, stickyHeight]);
    const measureTab = useCallback((key: string, event: LayoutChangeEvent) => {
        tabMetricsRef.current[key] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width };
        if (key === activeRef.current) {
            animateUnderlineTo(key, underlineInitializedRef.current);
            scrollTabsToCategory(key, false);
        }
    }, [animateUnderlineTo, scrollTabsToCategory]);
    const focusCompactSearch = useCallback(() => {
        const stickyThreshold = categoryStickyThresholdRef.current;
        if (stickyThreshold > 0 && scrollYRef.current < stickyThreshold) {
            searchRevealScrollRef.current = true;
            scrollRef.current?.scrollTo({ y: stickyThreshold, animated: true });
        }
        searchVisibilityOverride.setValue(1);
        setSearchFocused(true);
        requestAnimationFrame(() => compactSearchInputRef.current?.focus());
    }, [searchVisibilityOverride]);
    const renderCategoryTabs = (tabRef: RefObject<ScrollView | null>, recordLayout: boolean) => (
        <View
            onLayout={(event) => {
                if (recordLayout) tabViewportWidthRef.current = event.nativeEvent.layout.width;
                else scrollTabsToCategory(activeRef.current, false);
            }}
            style={styles.tabsViewport}
        >
            <ScrollView
                contentContainerStyle={styles.tabsContent}
                horizontal
                onContentSizeChange={(width) => {
                    if (recordLayout) {
                        tabContentWidthRef.current = width;
                        scrollTabsToCategory(activeRef.current, false);
                    }
                }}
                onScroll={recordLayout ? undefined : (event) => { tabHorizontalOffsetRef.current = event.nativeEvent.contentOffset.x; }}
                ref={tabRef}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                style={styles.tabs}
            >
                {tabSections.map((section) => {
                    const colorProgress = tabColorValue(section.key);
                    const enabled = sections.some((candidate) => candidate.key === section.key);
                    return (
                        <Pressable
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active === section.key }}
                            disabled={!enabled}
                            key={section.key}
                            onLayout={recordLayout ? (event) => measureTab(section.key, event) : undefined}
                            onPress={() => selectCategory(section.key)}
                            style={styles.tabButton}
                        >
                            <Animated.Text
                                numberOfLines={1}
                                style={[
                                    styles.tabText,
                                    { color: colorProgress.interpolate({ inputRange: [0, 1], outputRange: [colors.secondary, ORANGE] }) },
                                ]}
                            >
                                {section.label}
                            </Animated.Text>
                        </Pressable>
                    );
                })}
                {tabSections.length ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.tabUnderline, { width: underlineWidth, transform: [{ translateX: underlineX }] }]}
                    />
                ) : null}
            </ScrollView>
        </View>
    );

    if (!restaurantId) return <StateScreen message={isTurkish ? "Restoran kimliği eksik." : "Restaurant id is missing."} onBack={() => router.back()} styles={styles} />;
    if (loading && !bundle) return <View style={styles.loading}><StatusBar style={isDark ? "light" : "dark"} /><ActivityIndicator color={ORANGE} size="large" /></View>;
    if (error || !restaurant) return <StateScreen message={isTurkish ? "Menü yüklenemedi." : "The menu could not be loaded."} onBack={() => router.back()} onRetry={() => void refetch()} styles={styles} />;

    return (
        <View style={styles.screen}>
            <StatusBar style={!isDark && (searchInteractive || stickyVisible) ? "dark" : "light"} />
            <Animated.ScrollView
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                onMomentumScrollEnd={handleScrollSettled}
                onContentSizeChange={(_, height) => {
                    verticalContentHeightRef.current = height;
                    if (!isSearchActive) unfilteredContentHeightRef.current = height;
                }}
                onLayout={(event) => { verticalViewportHeightRef.current = event.nativeEvent.layout.height; }}
                onScroll={animatedVerticalScroll}
                onScrollBeginDrag={handleUserDrag}
                onScrollEndDrag={(event) => {
                    if (Math.abs(event.nativeEvent.velocity?.y || 0) < 0.05) handleScrollSettled();
                }}
                ref={scrollRef}
                scrollEventThrottle={16}
                scrollEnabled={!hasNoSearchResults}
                contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.hero}>
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.heroMedia,
                            { transform: [{ translateY: heroPullTranslateY }, { scale: heroPullScale }] },
                        ]}
                    >
                        {heroSource ? <Image contentFit="cover" source={heroSource} style={StyleSheet.absoluteFillObject} /> : null}
                        <View style={styles.heroShade} />
                    </Animated.View>
                    <SafeAreaView edges={["top", "left", "right"]} style={styles.heroControls}>
                        <RoundButton icon="chevron-back" label={isTurkish ? "Geri" : "Back"} onPress={() => router.back()} />
                        <View style={styles.heroActions}><RoundButton icon="search" label={isTurkish ? "Ara" : "Search"} onPress={focusCompactSearch} /><RoundButton active={favorite} icon={favorite ? "heart" : "heart-outline"} label="Favorite" onPress={favoritePress} /><RoundButton icon="ellipsis-horizontal" label="Information" onPress={() => setInfoVisible(true)} /></View>
                    </SafeAreaView>
                </View>
                <View onLayout={(event) => { sheetYRef.current = event.nativeEvent.layout.y; sheetMeasuredRef.current = true; updateSearchFadeThreshold(); }} style={styles.sheet}>
                    <View style={styles.identityRow}><View style={styles.logo}>{logoSource ? <Image contentFit="contain" source={logoSource} style={styles.logoImage} /> : null}</View><View style={styles.identityCopy}><Text style={styles.restaurantName}>{restaurant.name || "Restaurant"}</Text><Text style={styles.cuisine}>{cuisine}</Text><Pressable onPress={() => router.push({ pathname: "/restaurant-reviews/[id]", params: { id: restaurantId } })} style={styles.ratingRow}><Ionicons color="#FFB800" name="star" size={15} /><Text style={styles.rating}>{rating ? rating.toFixed(1) : isTurkish ? "Yeni" : "New"}</Text>{ratingCount ? <Text style={styles.ratingCount}>({ratingCount})</Text> : null}<View style={[styles.statusDot, !open && styles.statusDotClosed]} /><Text style={styles.statusText}>{open ? (isTurkish ? "Açık" : "Open") : (isTurkish ? "Kapalı" : "Closed")}</Text></Pressable></View></View>
                    <View style={styles.metaRow}><Meta icon="time-outline" label={isTurkish ? "Teslimat süresi" : "Delivery time"} styles={styles} value={getEta(restaurant, isTurkish)} /><View style={styles.metaDivider} /><Meta icon="bicycle-outline" label={isTurkish ? "Minimum tutar" : "Minimum order"} styles={styles} value={minimum !== null ? formatTry(minimum, locale) : "—"} /><View style={styles.metaDivider} /><Pressable onPress={() => router.push({ pathname: "/restaurant-reviews/[id]", params: { id: restaurantId } })} style={styles.metaItem}><Ionicons color={ORANGE} name="chatbubble-ellipses-outline" size={18} /><Text numberOfLines={1} style={styles.metaValue}>{ratingCount || "—"}</Text><Text numberOfLines={1} style={styles.metaLabel}>{isTurkish ? "Yorumlar" : "Reviews"}</Text></Pressable></View>
                    <View style={styles.courierStrip}><Ionicons color="#147A48" name="bicycle" size={19} /><Text style={styles.courierText}>{isTurkish ? "Hungrie kuryesiyle teslimat" : "Delivered by a Hungrie courier"}</Text><Ionicons color="#147A48" name="checkmark-circle" size={18} /></View>
                    {promotion ? <View style={styles.promoStrip}><Ionicons color={ORANGE} name="pricetag" size={17} /><Text style={styles.promoText}>{promotion}</Text></View> : null}
                    <View
                        onLayout={(event) => { categoryBarYRef.current = event.nativeEvent.layout.y; categoryBarMeasuredRef.current = true; updateSearchFadeThreshold(); }}
                        pointerEvents={categoryReady ? "none" : "auto"}
                        style={categoryReady ? styles.categorySpacer : undefined}
                    >
                        {renderCategoryTabs(normalTabsRef, true)}
                    </View>
                    <View
                        onLayout={(event) => { menuResultsYRef.current = event.nativeEvent.layout.y; }}
                        style={searchResultsMinHeight ? { minHeight: searchResultsMinHeight } : undefined}
                    >
                        {!sections.length ? (
                            <View style={[styles.emptySearchState, { paddingTop: emptySearchPaddingTop }]}>
                                <Ionicons color={colors.secondary} name="search-outline" size={30} />
                                <Text style={styles.emptySearchTitle}>{isSearchActive ? (isTurkish ? "Sonuç bulunamadı" : "No menu items found") : (isTurkish ? "Menü ürünü bulunamadı" : "No menu items available")}</Text>
                                {isSearchActive ? <Text style={styles.emptySearchCopy}>{isTurkish ? "Başka bir arama terimi deneyin." : "Try another search term."}</Text> : null}
                            </View>
                        ) : null}
                        {sections.map((section) => <View key={section.key} onLayout={(event) => { sectionOffsetsRef.current[section.key] = event.nativeEvent.layout.y; }}><Text style={styles.sectionTitle}>{section.label} <Text style={styles.sectionCount}>({section.data.length} {isTurkish ? "ürün" : section.data.length === 1 ? "item" : "items"})</Text></Text>{section.data.map((item) => <MenuItemRow category={section.key} colors={{ text: colors.text, secondary: colors.secondary, border: colors.border, imageFallback: colors.mutedSurface }} cuisine={cuisine} disabled={!open} item={item} key={`${section.key}-${item.id}`} locale={locale} onAdd={(entry, imageUrl) => { if (entry.customizations?.length) { setSelected({ item: entry, imageUrl }); setQuantity(1); setSelectedCustomizationIds([]); } else addToCart(entry, imageUrl, 1, []); }} onOpen={(entry, imageUrl) => { setSelected({ item: entry, imageUrl }); setQuantity(1); setSelectedCustomizationIds([]); }} />)}</View>)}
                    </View>
                </View>
            </Animated.ScrollView>
            <Animated.View
                pointerEvents={searchInteractive || keepSearchVisible || stickyVisible ? "auto" : "none"}
                style={[
                    styles.stickySearchNavigation,
                    { height: compactTopHeight, paddingTop: insets.top },
                    { opacity: searchOpacity, transform: [{ translateY: searchTranslateY }] },
                ]}
            >
                <View style={styles.compactHeader}>
                    <Pressable accessibilityLabel={isTurkish ? "Geri" : "Back"} hitSlop={10} onPress={() => router.back()} style={styles.compactIconButton}><Ionicons color={colors.text} name="chevron-back" size={23} /></Pressable>
                    <View style={styles.compactSearchBox}>
                        <Ionicons color={colors.secondary} name="search" size={17} />
                        <TextInput
                            onBlur={() => {
                                setSearchFocused(false);
                                searchVisibilityOverride.setValue(isSearchActive ? 1 : 0);
                            }}
                            onChangeText={(value) => {
                                setQuery(value);
                                if (value.trim()) searchVisibilityOverride.setValue(1);
                            }}
                            onFocus={() => {
                                searchVisibilityOverride.setValue(1);
                                setSearchFocused(true);
                            }}
                            placeholder={isTurkish ? "Menüde ara" : "Search the menu"}
                            placeholderTextColor={colors.secondary}
                            ref={compactSearchInputRef}
                            style={styles.compactSearchInput}
                            value={query}
                        />
                        {query ? <Pressable accessibilityLabel={isTurkish ? "Aramayı temizle" : "Clear search"} hitSlop={8} onPress={() => { setQuery(""); searchVisibilityOverride.setValue(1); setSearchFocused(true); compactSearchInputRef.current?.focus(); }}><Ionicons color={colors.secondary} name="close-circle" size={18} /></Pressable> : null}
                    </View>
                    <Pressable accessibilityLabel={isTurkish ? "Yorumlar" : "Reviews"} hitSlop={10} onPress={() => router.push({ pathname: "/restaurant-reviews/[id]", params: { id: restaurantId } })} style={styles.compactIconButton}><Ionicons color={colors.text} name="chatbubble-ellipses-outline" size={20} /></Pressable>
                </View>
            </Animated.View>
            {categoryReady ? (
                <Animated.View
                    style={[
                        styles.stickyCategoryNavigation,
                        {
                            top: compactTopHeight,
                            transform: [{ translateY: categoryTranslateY }],
                        },
                    ]}
                >
                    {renderCategoryTabs(stickyTabsRef, false)}
                </Animated.View>
            ) : null}
            <StandaloneBottomNavigation />
            <InfoModal insets={insets.bottom} open={open} restaurant={restaurant} setVisible={setInfoVisible} styles={styles} visible={infoVisible} />
            <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={Boolean(selected)}><View style={styles.modalBackdrop}><Pressable onPress={() => setSelected(null)} style={styles.modalDismiss} />{selected ? <View style={[styles.mealSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}><Pressable onPress={() => setSelected(null)} style={styles.closeButton}><Ionicons color={colors.text} name="close" size={22} /></Pressable>{selected.imageUrl ? <Image contentFit="cover" source={{ uri: selected.imageUrl }} style={styles.mealImage} /> : null}<Text style={styles.mealTitle}>{selected.item.name}</Text>{selected.item.description ? <Text style={styles.mealDescription}>{selected.item.description}</Text> : null}{selected.item.customizations?.length ? <View style={styles.options}><Text style={styles.optionsTitle}>{isTurkish ? "Seçenekler" : "Options"}</Text>{selected.item.customizations.map((option) => { const checked = selectedCustomizationIds.includes(option.id); return <Pressable key={option.id} onPress={() => setSelectedCustomizationIds((current) => checked ? current.filter((id) => id !== option.id) : [...current, option.id])} style={styles.optionRow}><Ionicons color={checked ? ORANGE : colors.secondary} name={checked ? "checkbox" : "square-outline"} size={21} /><Text style={styles.optionName}>{option.name}</Text><Text style={styles.optionPrice}>+{formatTry(option.price, locale)}</Text></Pressable>; })}</View> : null}<View style={styles.mealFooter}><View style={styles.stepper}><Pressable onPress={() => setQuantity((value) => Math.max(1, value - 1))}><Ionicons color={ORANGE} name="remove" size={22} /></Pressable><Text style={styles.quantity}>{quantity}</Text><Pressable onPress={() => setQuantity((value) => value + 1)}><Ionicons color={ORANGE} name="add" size={22} /></Pressable></View><Pressable disabled={!open} onPress={() => { addToCart(selected.item, selected.imageUrl, quantity, (selected.item.customizations || []).filter((option) => selectedCustomizationIds.includes(option.id))); setSelected(null); }} style={[styles.addMealButton, !open && styles.disabled]}><Text style={styles.addMealText}>{isTurkish ? "Sepete ekle" : "Add to cart"} · {formatTry((selected.item.price + (selected.item.customizations || []).filter((option) => selectedCustomizationIds.includes(option.id)).reduce((sum, option) => sum + option.price, 0)) * quantity, locale)}</Text></Pressable></View></View> : null}</View></Modal>
        </View>
    );
};

const RoundButton = ({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) => <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={staticStyles.roundButton}><Ionicons color={active ? ORANGE : "#111827"} name={icon} size={22} /></Pressable>;
const Meta = ({ icon, value, label, styles }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; styles: ReturnType<typeof createStyles> }) => <View style={styles.metaItem}><Ionicons color={ORANGE} name={icon} size={18} /><Text numberOfLines={1} style={styles.metaValue}>{value}</Text><Text numberOfLines={1} style={styles.metaLabel}>{label}</Text></View>;
const StateScreen = ({ message, onBack, onRetry, styles }: { message: string; onBack: () => void; onRetry?: () => void; styles: ReturnType<typeof createStyles> }) => <SafeAreaView style={styles.stateScreen}><Pressable onPress={onBack} style={styles.stateBack}><Ionicons color={styles.icon.color} name="chevron-back" size={24} /></Pressable><Text style={styles.stateMessage}>{message}</Text>{onRetry ? <Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable> : null}</SafeAreaView>;
const InfoModal = ({ visible, setVisible, restaurant, open, insets, styles }: { visible: boolean; setVisible: (value: boolean) => void; restaurant: Restaurant; open: boolean; insets: number; styles: ReturnType<typeof createStyles> }) => <Modal animationType="slide" onRequestClose={() => setVisible(false)} transparent visible={visible}><View style={styles.modalBackdrop}><Pressable onPress={() => setVisible(false)} style={styles.modalDismiss} /><View style={[styles.modalSheet, { paddingBottom: Math.max(insets, 20) }]}><View style={styles.handle} /><Text style={styles.modalTitle}>{restaurant.name}</Text><Text style={styles.modalCopy}>{restaurant.description || restaurant.cuisine}</Text><Text style={styles.modalCopy}>{String(restaurant.address || restaurant.location || restaurant.district || restaurant.city || "")}</Text><View style={styles.openRow}><View style={[styles.openDot, !open && styles.closedDot]} /><Text style={styles.openText}>{open ? "Open" : "Closed"}</Text></View></View></View></Modal>;

const palette = (dark: boolean) => ({ background: dark ? "#0F1115" : "#FFFFFF", surface: dark ? "#171A20" : "#FFFFFF", mutedSurface: dark ? "#22262E" : "#F3F3F3", text: dark ? "#F8FAFC" : "#111827", secondary: dark ? "#AAB7C8" : "#667085", border: dark ? "#2A2E35" : "#E5E7EB" });
const staticStyles = StyleSheet.create({ roundButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 } });

const createStyles = (dark: boolean) => {
    const c = palette(dark);
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.background }, loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }, hero: { height: HERO_HEIGHT, backgroundColor: c.mutedSurface }, heroMedia: { ...StyleSheet.absoluteFillObject }, heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.13)" }, heroControls: { paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 12 : 5, flexDirection: "row", justifyContent: "space-between" }, heroActions: { flexDirection: "row", gap: 10 },
        sheet: { marginTop: -24, borderTopLeftRadius: 27, borderTopRightRadius: 27, overflow: "hidden", backgroundColor: c.surface, paddingTop: 22 }, identityRow: { flexDirection: "row", paddingHorizontal: 18, alignItems: "center" }, logo: { width: 56, height: 56, borderRadius: 15, borderWidth: 1, borderColor: c.border, backgroundColor: c.mutedSurface, alignItems: "center", justifyContent: "center", overflow: "hidden" }, logoImage: { width: "100%", height: "100%" }, identityCopy: { flex: 1, marginLeft: 13 }, restaurantName: { color: c.text, fontSize: 23, lineHeight: 28, fontWeight: "800", letterSpacing: -0.5 }, cuisine: { color: c.secondary, fontSize: 13, lineHeight: 18 }, ratingRow: { marginTop: 3, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4 }, rating: { color: c.text, fontSize: 13, fontWeight: "700" }, ratingCount: { color: c.secondary, fontSize: 12 }, statusDot: { width: 6, height: 6, marginLeft: 3, borderRadius: 3, backgroundColor: "#1B9A59" }, statusDotClosed: { backgroundColor: "#EF4444" }, statusText: { color: "#1B9A59", fontSize: 12, fontWeight: "700" },
        metaRow: { marginTop: 20, minHeight: 72, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border, flexDirection: "row", alignItems: "center" }, metaItem: { flex: 1, alignItems: "center", paddingHorizontal: 4 }, metaValue: { color: c.text, marginTop: 3, fontSize: 12.5, fontWeight: "700" }, metaLabel: { color: c.secondary, marginTop: 2, fontSize: 9.5 }, metaDivider: { width: StyleSheet.hairlineWidth, height: 37, backgroundColor: c.border }, courierStrip: { minHeight: 41, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: dark ? "#103224" : "#E9F9EF" }, courierText: { flex: 1, color: dark ? "#8FE0B2" : "#147A48", fontSize: 12.5, fontWeight: "600" }, promoStrip: { minHeight: 41, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: dark ? "#382319" : "#FFF1E8" }, promoText: { flex: 1, color: dark ? "#FFB18E" : "#B9380B", fontSize: 12.5, fontWeight: "600" },
        searchBox: { height: 44, marginHorizontal: 16, marginTop: 12, borderRadius: 12, backgroundColor: c.mutedSurface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, height: "100%", color: c.text, fontSize: 14 }, tabsViewport: { height: CATEGORY_BAR_HEIGHT, backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, tabs: { height: CATEGORY_BAR_HEIGHT }, tabsContent: { position: "relative", paddingHorizontal: 10 }, tabButton: { height: CATEGORY_BAR_HEIGHT - 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }, tabText: { fontSize: 13, fontWeight: "600" }, tabUnderline: { position: "absolute", bottom: 0, left: 0, height: 3, borderRadius: 2, backgroundColor: ORANGE }, sectionTitle: { color: c.text, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, fontSize: 20, lineHeight: 25, fontWeight: "800" }, sectionCount: { color: c.secondary, fontSize: 11.5, fontWeight: "500" }, emptySearchState: { minHeight: 220, paddingHorizontal: 28, paddingTop: 54, alignItems: "center" }, emptySearchTitle: { color: c.text, marginTop: 12, fontSize: 17, lineHeight: 22, fontWeight: "700", textAlign: "center" }, emptySearchCopy: { color: c.secondary, marginTop: 6, fontSize: 13, lineHeight: 18, textAlign: "center" },
        categorySpacer: { opacity: 0 },
        stickySearchNavigation: { position: "absolute", zIndex: 30, elevation: 12, top: 0, left: 0, right: 0, backgroundColor: c.surface },
        stickyCategoryNavigation: { position: "absolute", zIndex: 20, elevation: 10, left: 0, right: 0, height: CATEGORY_BAR_HEIGHT },
        compactHeader: { height: COMPACT_HEADER_HEIGHT, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", backgroundColor: c.surface }, compactIconButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, compactTitle: { flex: 1, color: c.text, marginHorizontal: 5, fontSize: 15, fontWeight: "700" }, compactSearchBox: { flex: 1, height: 34, marginHorizontal: 4, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.mutedSurface }, compactSearchInput: { flex: 1, height: "100%", color: c.text, fontSize: 13 },
        modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.5)" }, modalDismiss: { flex: 1 }, modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, backgroundColor: c.surface }, handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: "center", marginBottom: 18 }, modalTitle: { color: c.text, fontSize: 22, fontWeight: "800" }, modalCopy: { color: c.secondary, marginTop: 9, fontSize: 14, lineHeight: 20 }, openRow: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 8 }, openDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#1B9A59" }, closedDot: { backgroundColor: "#EF4444" }, openText: { color: c.text, fontSize: 14, fontWeight: "700" },
        mealSheet: { maxHeight: "86%", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, backgroundColor: c.surface }, closeButton: { position: "absolute", zIndex: 2, top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }, mealImage: { height: 180, margin: -18, marginBottom: 18, borderTopLeftRadius: 26, borderTopRightRadius: 26 }, mealTitle: { color: c.text, fontSize: 22, fontWeight: "800" }, mealDescription: { color: c.secondary, marginTop: 8, fontSize: 14, lineHeight: 20 }, options: { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, optionsTitle: { color: c.text, marginVertical: 10, fontSize: 15, fontWeight: "800" }, optionRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 9 }, optionName: { flex: 1, color: c.text, fontSize: 14 }, optionPrice: { color: c.secondary, fontSize: 13, fontWeight: "600" }, mealFooter: { marginTop: 20, flexDirection: "row", gap: 12 }, stepper: { width: 112, height: 49, borderRadius: 14, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-around" }, quantity: { color: c.text, fontSize: 16, fontWeight: "800" }, addMealButton: { flex: 1, height: 49, borderRadius: 14, backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" }, addMealText: { color: "#FFF", fontSize: 14, fontWeight: "800" }, disabled: { opacity: 0.5 },
        stateScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.background }, stateBack: { position: "absolute", top: 60, left: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" }, stateMessage: { color: c.text, fontSize: 17, textAlign: "center" }, retry: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, backgroundColor: ORANGE }, retryText: { color: "#FFF", fontWeight: "700" }, icon: { color: c.text },
    });
};

export default RestaurantMenuScreen;
