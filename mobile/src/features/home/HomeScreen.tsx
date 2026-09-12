import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    DeviceEventEmitter,
    FlatList,
    Image as NativeImage,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { addressStore } from "@/src/data/addressRepository";
import { useFavoritesStore } from "@/src/data/favoritesRepository";
import type { Address } from "@/src/domain/types";
import { useDefaultAddress } from "@/src/features/address/hooks";
import useHome from "@/src/hooks/useHome";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useTheme } from "@/src/theme/themeContext";
import useAuthStore from "@/store/auth.store";

const ORANGE = "#FF5A1F";
const HERO_IMAGE = require("../../../assets/home/Burger_Home.png");
const PIZZA_CARD_IMAGE = require("../../../assets/home/restaurant-pizza.webp");
const CAFE_CARD_IMAGE = require("../../../assets/home/restaurant-cafe.webp");
const ADDRESS_PIN_IMAGE = require("../../../assets/home/location-pin.png");
const CATEGORY_BURGER_IMAGE = require("../../../assets/home/category-burger.png");
const CATEGORY_PIZZA_IMAGE = require("../../../assets/home/category-pizza.png");
const CATEGORY_DURUM_IMAGE = require("../../../assets/home/category-durum.png");
const CATEGORY_KEBAP_IMAGE = require("../../../assets/home/category-kebap.png");
const CATEGORY_SALATA_IMAGE = require("../../../assets/home/category-salata.png");
const FALLBACK_META = [
    { eta: "25–35 min", minimum: 0 },
    { eta: "20–30 min", minimum: 1 },
    { eta: "20–30 min", minimum: 0 },
    { eta: "25–35 min", minimum: 0 },
] as const;
const CATEGORIES = [
    { id: "burger", searchKey: "burger", en: "Burgers", tr: "Burger", image: CATEGORY_BURGER_IMAGE },
    { id: "pizza", searchKey: "pizza", en: "Pizza", tr: "Pizza", image: CATEGORY_PIZZA_IMAGE },
    { id: "wraps", searchKey: "durum", en: "Wraps", tr: "Dürüm", image: CATEGORY_DURUM_IMAGE },
    { id: "kebabs", searchKey: "kebap", en: "Kebabs", tr: "Kebap", image: CATEGORY_KEBAP_IMAGE },
    { id: "salads", searchKey: "salata", en: "Salads", tr: "Salata", image: CATEGORY_SALATA_IMAGE },
] as const;

const parseNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};
const normalizeRestaurantId = (restaurant: any, fallback: string) =>
    String(restaurant?.id || restaurant?.$id || restaurant?.slug || restaurant?.code || restaurant?.name || fallback)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
const clockMinutes = (value: unknown) => {
    const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};
const isRestaurantOpen = (restaurant: any) => {
    const status = String(restaurant?.status || "").trim().toLowerCase();
    if (
        restaurant?.isActive === false ||
        restaurant?.isOpen === false ||
        ["closed", "kapalı", "kapali", "inactive", "disabled", "offline"].includes(status)
    ) return false;
    const opens = clockMinutes(restaurant?.openingTime || restaurant?.opening_time);
    const closes = clockMinutes(restaurant?.closingTime || restaurant?.closing_time);
    if (opens === null || closes === null || opens === closes) return true;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    return opens < closes ? current >= opens && current < closes : current >= opens || current < closes;
};
const rating = (restaurant: any) => {
    const value = parseNumber(restaurant?.ratingAverage ?? restaurant?.rating);
    return value && value > 0 ? value.toFixed(1) : null;
};
const reviewCount = (restaurant: any) =>
    Math.max(0, Math.round(parseNumber(restaurant?.ratingCount ?? restaurant?.reviewCount ?? restaurant?.reviewsCount) ?? 0));
const eta = (restaurant: any, fallback: string, isTurkish: boolean) => {
    const minimum = parseNumber(restaurant?.deliveryEtaMin);
    const maximum = parseNumber(restaurant?.deliveryEtaMax);
    if (minimum !== null && maximum !== null) return `${Math.round(minimum)}–${Math.round(maximum)} ${isTurkish ? "dk" : "min"}`;
    const match = String(restaurant?.deliveryTime || restaurant?.eta || "").match(/(\d+)\s*[-–]\s*(\d+)/);
    if (match) return `${match[1]}–${match[2]} ${isTurkish ? "dk" : "min"}`;
    return isTurkish ? fallback.replace("min", "dk") : fallback;
};
const minimumOrder = (restaurant: any, fallback: number) => {
    const value = parseNumber(restaurant?.minimumOrderAmount) ?? parseNumber(restaurant?.minimumOrder) ??
        parseNumber(restaurant?.minOrderAmount) ?? parseNumber(restaurant?.minBasketAmount) ?? fallback;
    return `Min. ${Math.round(value)} TL`;
};
const cuisines = (restaurant: any, isTurkish: boolean) => {
    const values = [restaurant?.cuisine, restaurant?.category, restaurant?.categories, restaurant?.tags, restaurant?.cuisines]
        .filter(Boolean)
        .flatMap((value) => Array.isArray(value) ? value : String(value).split(/[,\u2022|/]+/))
        .map((value) => String(value).trim())
        .filter(Boolean);
    const unique = values.filter((value, index) => values.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
    return (unique.length ? unique : [isTurkish ? "Lezzetler" : "Cuisine"]).slice(0, 3).join(" · ");
};
const location = (restaurant: any) =>
    String(restaurant?.location || restaurant?.district || restaurant?.city || restaurant?.address?.city || "Kalkanli");
const addressTitle = (address: any, fallback: string) => {
    if (!address) return fallback;
    const label = String(address.label || "").trim();
    const block = String(address.block || "").trim();
    return label && block ? `${label}, ${block}` : label || [address.line1, address.city].filter(Boolean).join(", ") || fallback;
};
const addressLine = (address: Address) => [address.line1, address.block, address.city].filter(Boolean).join(", ");

const HomeScreen = () => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { i18n } = useTranslation();
    const { theme, variant } = useTheme();
    const isDark = variant === "dark";
    const styles = useMemo(() => createStyles(isDark), [isDark]);
    const isTurkish = i18n.language?.startsWith("tr");
    const { restaurants, restaurantsLoading } = useHome();
    const { defaultAddress, addresses } = useDefaultAddress();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const currentUser = useAuthStore((state) => state.user);
    const favoriteScope = currentUser?.accountId || currentUser?.id || "guest";
    const favoritesByScope = useFavoritesStore((state) => state.favoritesByScope);
    const loadedScopes = useFavoritesStore((state) => state.loadedScopes);
    const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
    const hydrateFavorites = useFavoritesStore((state) => state.hydrateFavorites);
    const favoriteIds = favoritesByScope[favoriteScope] || [];
    const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
    const [addressSheetVisible, setAddressSheetVisible] = useState(false);
    const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? null);
    const [activeHeroSlide, setActiveHeroSlide] = useState(0);
    const heroScrollRef = useRef<ScrollView>(null);
    const [heroWidth, setHeroWidth] = useState(0);

    useEffect(() => setSelectedAddressId(defaultAddress?.id ?? null), [defaultAddress?.id]);
    useEffect(() => {
        if (!loadedScopes[favoriteScope]) void hydrateFavorites(favoriteScope);
    }, [favoriteScope, hydrateFavorites, loadedScopes]);

    const sortedRestaurants = useMemo(() => {
        const list = Array.isArray(restaurants) ? restaurants : [];
        return list.map((restaurant, index) => ({ restaurant, index })).sort((left, right) => {
            const openDifference = Number(isRestaurantOpen(right.restaurant)) - Number(isRestaurantOpen(left.restaurant));
            if (openDifference) return openDifference;
            const favoriteDifference = Number(favoriteIdSet.has(normalizeRestaurantId(right.restaurant, String(right.index)))) -
                Number(favoriteIdSet.has(normalizeRestaurantId(left.restaurant, String(left.index))));
            return favoriteDifference || left.index - right.index;
        });
    }, [favoriteIdSet, restaurants]);

    const openAddressSelector = () => {
        if (!isAuthenticated) {
            showUserMessage(isTurkish ? "Giriş gerekli" : "Sign in required", isTurkish
                ? "Adreslerini yönetmek için lütfen giriş yapın."
                : "Please sign in to manage your delivery addresses.");
            router.push("/sign-in");
            return;
        }
        setAddressSheetVisible(true);
    };
    const selectAddress = useCallback(async (id: string) => {
        setSelectedAddressId(id);
        await addressStore.setDefault(id);
        const updated = addresses.find((address) => address.id === id);
        if (updated) DeviceEventEmitter.emit("app/addressChanged", updated);
        setAddressSheetVisible(false);
    }, [addresses]);
    const openSearch = useCallback(() => router.push("/search"), [router]);
    const openCategory = (category: (typeof CATEGORIES)[number]) => router.push({
        pathname: "/search",
        params: { query: isTurkish ? category.tr : category.en, category: category.searchKey, refresh: String(Date.now()) },
    });
    const toggleRestaurantFavorite = (id: string) => {
        if (!isAuthenticated) {
            showUserMessage(isTurkish ? "Giriş gerekli" : "Sign in required", isTurkish
                ? "Favorilere restoran eklemek için lütfen giriş yapın."
                : "Please sign in to add restaurants to your favourites.");
            router.push("/sign-in");
            return;
        }
        toggleFavorite(favoriteScope, id);
    };
    const updateHero = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (heroWidth) setActiveHeroSlide(Math.max(0, Math.min(2, Math.round(event.nativeEvent.contentOffset.x / heroWidth))));
    };
    const goToHero = (index: number) => {
        setActiveHeroSlide(index);
        heroScrollRef.current?.scrollTo({ x: index * heroWidth, animated: true });
    };
    const heroSlides = [
        { key: "favorites", eyebrow: isTurkish ? "KAMPÜS FAVORİLERİ" : "CAMPUS FAVORITES", title: isTurkish ? "Harika lezzetler\nkapına kadar\ngelsin" : "Great food\ndelivered to\nyour door", cta: isTurkish ? "Sipariş ver" : "Order now", onPress: openSearch },
        { key: "fast", eyebrow: isTurkish ? "HIZLI TESLİMAT" : "FAST DELIVERY", title: isTurkish ? "Favorilerini\nhızlıca bul\nve sipariş et" : "Find favorites\nand order in\nseconds", cta: isTurkish ? "Keşfet" : "Explore", onPress: openSearch },
        { key: "nearby", eyebrow: isTurkish ? "YAKININDA" : "NEAR YOU", title: isTurkish ? "Kampüsün en iyi\nrestoranları\nburada" : "The best food\nnear campus\nis here", cta: isTurkish ? "Restoranlar" : "View places", onPress: () => router.push("/categories") },
    ];

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
            <View style={styles.fixedHeader}>
                <View style={styles.header}>
                    <View>
                        <View style={styles.wordmarkRow}><Text style={styles.wordmark}>Hungrie</Text><View style={styles.brandDot} /></View>
                        <Text style={styles.tagline}>{isTurkish ? "İyi yemek. Daha güzel bir gün." : "Good food. A better day."}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={isTurkish ? "Bildirimler" : "Notifications"} hitSlop={12} onPress={() => router.push("/orders")} style={styles.notificationButton}>
                        <Ionicons name="notifications-outline" size={26} color={styles.iconColor.color} /><View style={styles.notificationDot} />
                    </Pressable>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 66 + Math.max(insets.bottom, 8) }]}>

                <Pressable accessibilityRole="button" hitSlop={2} onPress={openAddressSelector} style={styles.addressCard}>
                    <NativeImage resizeMode="contain" source={ADDRESS_PIN_IMAGE} style={styles.addressIcon} />
                    <View style={styles.addressCopy}>
                        <Text style={styles.addressEyebrow}>{isTurkish ? "Teslimat adresi" : "Deliver to"}</Text>
                        <Text numberOfLines={1} style={styles.addressValue}>
                            {addressTitle(defaultAddress, isTurkish ? "Teslimat adresi ekle" : "Add delivery address")}
                        </Text>
                    </View>
                    <Ionicons name="chevron-down" size={19} color={styles.mutedIconColor.color} />
                </Pressable>

                <Pressable accessibilityRole="search" hitSlop={5} onPress={openSearch} style={styles.searchField}>
                    <Ionicons name="search-outline" size={23} color={styles.mutedIconColor.color} />
                    <Text numberOfLines={1} style={styles.searchPlaceholder}>{isTurkish ? "Restoran veya mutfak ara..." : "Search for restaurants or cuisines..."}</Text>
                </Pressable>

                <View style={styles.categoryRow}>
                    {CATEGORIES.map((category) => (
                        <Pressable key={category.id} onPress={() => openCategory(category)} style={styles.categoryItem}>
                            <View style={styles.categoryImageShell}><NativeImage resizeMode="contain" source={category.image} style={styles.categoryImage} /></View>
                            <Text numberOfLines={1} style={styles.categoryLabel}>{isTurkish ? category.tr : category.en}</Text>
                        </Pressable>
                    ))}
                    <Pressable onPress={() => router.push("/categories")} style={styles.categoryItem}>
                        <View style={styles.categoryImageShell}><Ionicons name="grid" size={31} color={styles.iconColor.color} /></View>
                        <Text style={styles.categoryLabel}>{isTurkish ? "Daha" : "More"}</Text>
                    </Pressable>
                </View>

                <View onLayout={(event) => setHeroWidth(event.nativeEvent.layout.width)} style={styles.heroViewport}>
                    <ScrollView ref={heroScrollRef} bounces={false} decelerationRate="fast" horizontal onMomentumScrollEnd={updateHero} pagingEnabled showsHorizontalScrollIndicator={false}>
                        {heroSlides.map((slide) => (
                            <View key={slide.key} style={[styles.hero, { width: heroWidth || undefined }]}>
                                <Image contentFit="cover" contentPosition="center" source={HERO_IMAGE} style={styles.heroImage} />
                                <LinearGradient
                                    colors={isDark
                                        ? ["#2B1C11", "#2B1C11", "rgba(43,28,17,0)"]
                                        : ["#FFF0DC", "#FFF0DC", "rgba(255,240,220,0)"]}
                                    locations={[0, 0.46, 0.72]}
                                    pointerEvents="none"
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.heroImageWash}
                                />
                                <View style={styles.heroCopy}>
                                    <Text style={styles.heroEyebrow}>{slide.eyebrow}</Text><Text style={styles.heroTitle}>{slide.title}</Text>
                                    <Pressable hitSlop={8} onPress={slide.onPress} style={styles.heroButton}><Text style={styles.heroButtonText}>{slide.cta}</Text><Ionicons name="arrow-forward" size={16} color="#FFFFFF" /></Pressable>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
                <View style={styles.heroDots}>
                    {heroSlides.map((slide, index) => <Pressable accessibilityLabel={`${isTurkish ? "Kampanya" : "Promotion"} ${index + 1}`} accessibilityRole="button" key={slide.key} onPress={() => goToHero(index)} style={[styles.heroDot, index === activeHeroSlide && styles.heroDotActive]} />)}
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{isTurkish ? "Yakındaki restoranlar" : "Restaurants nearby"}</Text>
                    <Pressable onPress={() => router.push("/search")}><Text style={styles.seeAll}>{isTurkish ? "Tümünü gör" : "See all"}</Text></Pressable>
                </View>
                <View style={styles.restaurantGrid}>
                    {(restaurantsLoading ? Array.from({ length: 2 }) : sortedRestaurants).map((entry: any, index: number) => {
                        if (restaurantsLoading) return <View key={`restaurant-skeleton-${index}`} style={styles.restaurantSkeleton} />;
                        const restaurant = entry.restaurant;
                        const originalIndex = entry.index;
                        const fallback = FALLBACK_META[originalIndex % FALLBACK_META.length];
                        const id = normalizeRestaurantId(restaurant, String(originalIndex));
                        const open = isRestaurantOpen(restaurant);
                        const favorite = favoriteIdSet.has(id);
                        const restaurantRating = rating(restaurant);
                        const restaurantReviewCount = reviewCount(restaurant);
                        const foodHint = `${restaurant?.name || ""} ${restaurant?.cuisine || ""}`.toLowerCase();
                        const source = foodHint.match(/cafe|coffee|kahve|tatlı|tatli|dessert/)
                            ? CAFE_CARD_IMAGE
                            : foodHint.match(/pizza/)
                              ? PIZZA_CARD_IMAGE
                              : originalIndex % 2 === 0
                                ? PIZZA_CARD_IMAGE
                                : CAFE_CARD_IMAGE;
                        return (
                            <Pressable key={`${id}-${originalIndex}`} onPress={() => router.push({ pathname: "/restaurants/[id]", params: { id } })} style={[styles.restaurantCard, !open && styles.closedCard]}>
                                <View style={styles.restaurantImageFrame}>
                                    <Image contentFit="cover" source={source} style={styles.restaurantImage} />
                                    <View style={[styles.etaBadge, !open && styles.closedBadge]}><Text style={[styles.etaText, !open && styles.closedBadgeText]}>{open ? eta(restaurant, fallback.eta, isTurkish) : isTurkish ? "Kapalı" : "Closed"}</Text></View>
                                    <Pressable accessibilityLabel={favorite ? "Remove favorite" : "Add favorite"} hitSlop={8} onPress={(event) => { event.stopPropagation(); toggleRestaurantFavorite(id); }} style={styles.favoriteButton}>
                                        <Ionicons color={favorite ? theme.colors.danger : styles.iconColor.color} name={favorite ? "heart" : "heart-outline"} size={19} />
                                    </Pressable>
                                </View>
                                <View style={styles.restaurantBody}>
                                    <Text numberOfLines={1} style={styles.restaurantName}>{restaurant?.name || (isTurkish ? "Restoran" : "Restaurant")}</Text>
                                    <View style={styles.ratingRow}>
                                        {restaurantReviewCount > 0 && restaurantRating ? (
                                            <>
                                                <Ionicons color="#FFB800" name="star" size={14} />
                                                <Text style={styles.ratingText}>{restaurantRating}</Text>
                                                <Text style={styles.reviewCount}>({restaurantReviewCount})</Text>
                                            </>
                                        ) : (
                                            <Text style={styles.noReviewsText}>{isTurkish ? "Yeni" : "New"}</Text>
                                        )}
                                    </View>
                                    <Text numberOfLines={1} style={styles.restaurantMeta}>{cuisines(restaurant, isTurkish)}</Text>
                                    <Text numberOfLines={1} style={styles.restaurantMeta}>{minimumOrder(restaurant, fallback.minimum)} · {location(restaurant)}</Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>
            <Modal animationType="slide" onRequestClose={() => setAddressSheetVisible(false)} transparent visible={addressSheetVisible}>
                <View style={styles.modalBackdrop}>
                    <Pressable onPress={() => setAddressSheetVisible(false)} style={styles.modalDismiss} />
                    <View style={[styles.addressSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
                        <View style={styles.modalHandle} /><Text style={styles.modalTitle}>{isTurkish ? "Teslimat adresi seç" : "Choose delivery address"}</Text>
                        {addresses.length ? (
                            <FlatList data={addresses} keyExtractor={(item) => item.id} renderItem={({ item }) => {
                                const selected = selectedAddressId === item.id;
                                return <Pressable onPress={() => void selectAddress(item.id)} style={styles.addressOption}><View style={styles.addressOptionCopy}><Text style={styles.addressOptionTitle}>{item.label}</Text><Text numberOfLines={1} style={styles.addressOptionLine}>{addressLine(item)}</Text></View><Ionicons color={selected ? ORANGE : styles.mutedIconColor.color} name={selected ? "radio-button-on" : "radio-button-off"} size={23} /></Pressable>;
                            }} />
                        ) : <Text style={styles.emptyAddresses}>{isTurkish ? "Henüz kayıtlı adres yok." : "No saved addresses yet."}</Text>}
                        <Pressable onPress={() => { setAddressSheetVisible(false); router.push("/ManageAddresses"); }} style={styles.manageAddressButton}><Text style={styles.manageAddressText}>{isTurkish ? "Adresleri yönet" : "Manage addresses"}</Text></Pressable>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const createStyles = (isDark: boolean) => {
    const colors = {
        background: isDark ? "#0F1115" : "#FFFFFF", surface: isDark ? "#171A20" : "#FFFFFF",
        surfaceMuted: isDark ? "#22262E" : "#F7F7F7", text: isDark ? "#F8FAFC" : "#101828",
        secondary: isDark ? "#CBD5E1" : "#667085", border: isDark ? "#2A2E35" : "#E5E7EB",
    };
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 20, paddingTop: 0 },
        fixedHeader: { paddingHorizontal: 20, paddingTop: Platform.OS === "web" ? 14 : 4, backgroundColor: colors.background, zIndex: 10 },
        iconColor: { color: colors.text }, mutedIconColor: { color: colors.secondary },
        header: { minHeight: 50, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
        wordmarkRow: { flexDirection: "row", alignItems: "flex-start", transform: [{ translateY: -6 }] },
        wordmark: { color: colors.text, fontSize: 30, lineHeight: 32, fontWeight: "800", letterSpacing: -1 },
        brandDot: { width: 7, height: 7, marginLeft: 5, marginTop: 4, borderRadius: 4, backgroundColor: ORANGE },
        tagline: { color: colors.secondary, fontSize: 11.5, lineHeight: 17, transform: [{ translateY: -6 }] },
        notificationButton: { width: 32, height: 34, alignItems: "center", justifyContent: "center", marginTop: 1, transform: [{ translateY: -6 }] },
        notificationDot: { position: "absolute", top: 2, right: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF1F2D", borderWidth: 1.5, borderColor: colors.background },
        addressCard: { height: 50, borderWidth: 1, borderColor: isDark ? colors.border : "#000000", borderRadius: 17, backgroundColor: isDark ? colors.surface : "#F3F3F3", marginTop: 0, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" },
        addressIcon: { width: 26, height: 26 },
        addressCopy: { flex: 1, marginLeft: 12 }, addressEyebrow: { color: colors.secondary, fontSize: 11.5, lineHeight: 14 },
        addressValue: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: "500" },
        searchField: { height: 39, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: isDark ? colors.surface : "#F3F3F3", marginTop: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
        searchPlaceholder: { flex: 1, color: colors.secondary, fontSize: 14, lineHeight: 18 },
        categoryRow: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
        categoryItem: { width: "15.2%", alignItems: "center" },
        categoryImageShell: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
        categoryImage: { width: 44, height: 44 },
        categoryLabel: { color: colors.text, marginTop: 4, fontSize: 11.5, lineHeight: 15, fontWeight: "500", textAlign: "center" },
        heroViewport: { height: 149, marginTop: 18, borderRadius: 18, overflow: "hidden", backgroundColor: isDark ? "#2B1C11" : "#FFF0DC" },
        hero: { height: 149, overflow: "hidden", backgroundColor: isDark ? "#2B1C11" : "#FFF0DC" },
        heroImage: { position: "absolute", top: 0, right: 0, width: "50%", height: "100%" },
        heroImageWash: { ...StyleSheet.absoluteFillObject },
        heroCopy: { width: "61%", height: "100%", paddingLeft: 17, paddingTop: 16 },
        heroEyebrow: { color: ORANGE, fontSize: 9, lineHeight: 11, fontWeight: "700", letterSpacing: 0.7 },
        heroTitle: { color: colors.text, marginTop: 5, fontSize: 22, lineHeight: 24, fontWeight: "800", letterSpacing: -0.5 },
        heroButton: { height: 28, minWidth: 108, alignSelf: "flex-start", borderRadius: 999, backgroundColor: ORANGE, marginTop: 8, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
        heroButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
        heroDots: { height: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
        heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? "#4A4F59" : "#D1D5DB" }, heroDotActive: { width: 18, backgroundColor: ORANGE },
        sectionHeader: { minHeight: 24, marginTop: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        sectionTitle: { flexShrink: 1, color: colors.text, fontSize: 17.5, lineHeight: 21, fontWeight: "700", letterSpacing: -0.35 },
        seeAll: { color: ORANGE, fontSize: 14, lineHeight: 18, fontWeight: "600" },
        restaurantGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 6, rowGap: 9 },
        restaurantCard: { width: "48.2%", borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
        closedCard: { opacity: 0.66 }, restaurantImageFrame: { height: 74, position: "relative", backgroundColor: colors.surfaceMuted },
        restaurantImage: { width: "100%", height: "100%" },
        etaBadge: { position: "absolute", left: 6, bottom: 6, minHeight: 18, borderRadius: 999, backgroundColor: "#DDF8E8", paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
        etaText: { color: "#187A43", fontSize: 10, lineHeight: 12, fontWeight: "600" },
        closedBadge: { backgroundColor: isDark ? "#302A2B" : "#F3F4F6" }, closedBadgeText: { color: colors.secondary },
        favoriteButton: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
        restaurantBody: { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 4, gap: 1 },
        restaurantName: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: "600", letterSpacing: -0.2 },
        ratingRow: { height: 18, flexDirection: "row", alignItems: "center", gap: 3 }, ratingText: { color: colors.text, fontSize: 13, fontWeight: "500" },
        reviewCount: { color: colors.secondary, fontSize: 12.5 },
        noReviewsText: { color: colors.secondary, fontSize: 11.5, lineHeight: 14, fontWeight: "500" },
        restaurantMeta: { color: colors.secondary, fontSize: 11, lineHeight: 15 },
        restaurantSkeleton: { width: "48.2%", height: 164, borderRadius: 16, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
        modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2, 6, 23, 0.48)" }, modalDismiss: { flex: 1 },
        addressSheet: { maxHeight: "72%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 10 },
        modalHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: 15 },
        modalTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: "700", marginBottom: 10 },
        addressOption: { minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        addressOptionCopy: { flex: 1, paddingRight: 12 }, addressOptionTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
        addressOptionLine: { color: colors.secondary, marginTop: 3, fontSize: 13 }, emptyAddresses: { color: colors.secondary, fontSize: 15, paddingVertical: 24, textAlign: "center" },
        manageAddressButton: { minHeight: 48, borderRadius: 14, backgroundColor: ORANGE, marginTop: 14, alignItems: "center", justifyContent: "center" },
        manageAddressText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
    });
};

export default HomeScreen;
