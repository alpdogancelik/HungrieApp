import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Image, type ImageSource } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Keyboard,
    Pressable,
    RefreshControl,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { getRestaurantImageSource } from "@/lib/assets";
import { formatCurrency } from "@/lib/cart.utils";
import { useFavoritesStore } from "@/src/data/favoritesRepository";
import { useMenuItemImage } from "@/src/features/restaurantMenu/hooks/useMenuItemImage";
import type { SearchResult } from "@/src/hooks/useSearch";
import { useSearchScreenV3 } from "@/src/hooks/useSearchScreenV3";
import { CATEGORY_CARDS } from "@/src/lib/categoryCards";
import { makeShadow } from "@/src/lib/shadowStyle";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import { useTheme } from "@/src/theme/themeContext";
import useAuthStore from "@/store/auth.store";

const ORANGE = "#FF5A00";
const PAGE_PADDING = 22;
const cuisineCardShadow = makeShadow({ color: "#8B6D55", offsetY: 6, blurRadius: 14, opacity: 0.06, elevation: 2 });
const restaurantCardShadow = makeShadow({ color: "#101828", offsetY: 4, blurRadius: 12, opacity: 0.08, elevation: 2 });
const CUISINE_IMAGES: Record<string, ImageSource> = {
    doner: require("../../../assets/Categories/Doner_Resized.png"),
    burger: require("../../../assets/Categories/Hamburger_Resized.png"),
    pizza: require("../../../assets/Categories/Pizza_Resized.png"),
    kebap: require("../../../assets/Categories/Kebap_Resized.png"),
    durum: require("../../../assets/Categories/Durum_Resized.png"),
    izgara: require("../../../assets/Categories/Kofte_Resized.png"),
    kahve: require("../../../assets/Categories/Kahve_Resized.png"),
    lahmacun: require("../../../assets/Categories/Lahmacun_Pide_Resized.png"),
    tatli: require("../../../assets/Categories/Tatli_Resized.png"),
    salata: require("../../../assets/Categories/Salata_Resized.png"),
    makarna: require("../../../assets/Categories/Makarna_Resized.png"),
    icecek: require("../../../assets/Categories/Icecekler_Resized.png"),
    tavuk: require("../../../assets/Categories/Tavuk_Resized.png"),
    sos: require("../../../assets/Categories/Soslar_Resized.png"),
};

type Palette = {
    page: string;
    surface: string;
    text: string;
    secondary: string;
    tertiary: string;
    border: string;
    recentBorder: string;
    pressed: string;
    placeholder: string;
};

type SearchEntry = { kind: "restaurant"; value: any; key: string };
type SearchSection = { key: "restaurants"; title: string; data: SearchEntry[] };

const palette = (dark: boolean): Palette => dark
    ? {
        page: "#0F1115", surface: "#171A20", text: "#F5F7FA", secondary: "#98A2B3",
        tertiary: "#7D8798", border: "#2A2E35", recentBorder: "#667085", pressed: "#20242B", placeholder: "#242830",
    }
    : {
        page: "#FAFBFC", surface: "#FFFFFF", text: "#111318", secondary: "#667085",
        tertiary: "#98A2B3", border: "#EAECF0", recentBorder: "#B8C0CC", pressed: "#F5F6F8", placeholder: "#F2F4F7",
    };

const normalizeId = (value: unknown) => String(value ?? "").trim();
const restaurantId = (restaurant: any, fallback = "") => normalizeId(
    restaurant?.id ?? restaurant?.$id ?? restaurant?.restaurantId ?? restaurant?.restaurant_id ?? fallback,
);
const dishRestaurantId = (dish: SearchResult) => normalizeId(
    dish.restaurantId ?? (dish as any).restaurant_id ?? (dish as any).restaurant?.id,
);
const parseNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};

const restaurantCuisine = (restaurant: any, fallback: string) => {
    const direct = String(restaurant?.cuisine || restaurant?.category || "").trim();
    if (direct) return direct;
    const categories = Array.isArray(restaurant?.categories)
        ? restaurant.categories.map((entry: unknown) => String(entry || "").trim()).filter(Boolean).slice(0, 2).join(" · ")
        : "";
    return categories || fallback;
};

const restaurantEta = (restaurant: any, locale: "tr" | "en") => {
    const minimum = parseNumber(restaurant?.deliveryEtaMin ?? restaurant?.delivery_eta_min_minutes);
    const maximum = parseNumber(restaurant?.deliveryEtaMax ?? restaurant?.delivery_eta_max_minutes);
    const suffix = locale === "tr" ? "dk" : "min";
    if (minimum !== null && maximum !== null) return `${Math.round(minimum)}–${Math.round(maximum)} ${suffix}`;
    const raw = String(restaurant?.deliveryTime ?? restaurant?.eta ?? "").trim();
    const range = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) return `${range[1]}–${range[2]} ${suffix}`;
    const single = raw.match(/\d+/);
    return single ? `${single[0]} ${suffix}` : null;
};

const restaurantMinimum = (restaurant: any) => {
    const value = parseNumber(
        restaurant?.minimumOrderAmount ?? restaurant?.minimumOrder ?? restaurant?.minOrderAmount ?? restaurant?.minBasketAmount,
    );
    return value === null ? null : formatCurrency(value);
};

const restaurantRating = (restaurant: any) => {
    const value = parseNumber(restaurant?.ratingAverage);
    return value !== null && value > 0 ? value.toFixed(1) : null;
};

const restaurantReviewCount = (restaurant: any) => {
    const value = parseNumber(restaurant?.ratingCount);
    return value !== null && value > 0 ? Math.round(value) : null;
};

const SearchField = ({ colors, value, focused, loading, placeholder, accessibilityLabel, onChange, onClear, onFocusChange, onSubmit }: {
    colors: Palette; value: string; focused: boolean; loading: boolean; placeholder: string; accessibilityLabel: string;
    onChange: (value: string) => void; onClear: () => void; onFocusChange: (focused: boolean) => void; onSubmit: () => void;
}) => (
    <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: focused ? ORANGE : colors.border }]}>
        <Ionicons color={colors.secondary} name="search-outline" size={19} />
        <TextInput
            accessibilityLabel={accessibilityLabel}
            autoCorrect={false}
            onBlur={() => onFocusChange(false)}
            onChangeText={onChange}
            onFocus={() => onFocusChange(true)}
            onSubmitEditing={onSubmit}
            placeholder={placeholder}
            placeholderTextColor={colors.tertiary}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
            value={value}
        />
        {loading ? <ActivityIndicator color={ORANGE} size="small" /> : value ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={onClear} style={styles.clearSearch}>
                <Ionicons color={colors.tertiary} name="close-circle" size={18} />
            </Pressable>
        ) : null}
    </View>
);

const RecentChip = ({ colors, label, onPress, searchLabel }: {
    colors: Palette; label: string; onPress: () => void; searchLabel: string;
}) => (
    <Pressable
        accessibilityLabel={searchLabel}
        onPress={onPress}
        style={styles.recentChipPressable}
    >
        {({ pressed }) => (
            <View style={[styles.recentChipSurface, { backgroundColor: pressed ? colors.pressed : colors.surface, borderColor: colors.recentBorder }]}>
                <Text numberOfLines={1} style={[styles.recentChipText, { color: colors.secondary }]}>{label}</Text>
            </View>
        )}
    </Pressable>
);

const PopularChip = ({ colors, label, onPress, accessibilityLabel }: { colors: Palette; label: string; onPress: () => void; accessibilityLabel: string }) => (
    <Pressable
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={styles.popularChipPressable}
    >
        {({ pressed }) => (
            <View style={[styles.popularChipSurface, { backgroundColor: pressed ? colors.pressed : colors.surface, borderColor: colors.recentBorder }]}>
                <Text style={[styles.chipText, { color: colors.secondary }]}>{label}</Text>
            </View>
        )}
    </Pressable>
);

const CuisineCard = ({ colors, image, label, onPress, accessibilityLabel }: { colors: Palette; image: ImageSource; label: string; onPress: () => void; accessibilityLabel: string }) => (
    <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.cuisineCardPressable}>
        {({ pressed }) => (
            <View style={[styles.cuisineCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.cuisineCardPressed]}>
                <Image cachePolicy="memory-disk" contentFit="cover" source={image} style={styles.cuisineImage} transition={120} />
                <View style={styles.cuisineFooter}>
                    <Text numberOfLines={2} style={[styles.cuisineTitle, { color: colors.text }]}>{label}</Text>
                </View>
            </View>
        )}
    </Pressable>
);

const RestaurantResult = memo(({ colors, restaurant, foodItem, locale, favorite, fallback, onPress, onToggleFavorite }: {
    colors: Palette;
    restaurant: any;
    foodItem?: SearchResult;
    locale: "tr" | "en";
    favorite: boolean;
    fallback: string;
    onPress: () => void;
    onToggleFavorite: () => void;
}) => {
    const name = String(restaurant?.name || fallback);
    const id = restaurantId(restaurant);
    const fallbackImage = getRestaurantImageSource(
        restaurant?.imageUrl ?? restaurant?.image_url ?? restaurant?.coverImage ?? restaurant?.logo,
        undefined,
        `${id} ${name}`,
    );
    const foodResolution = useMenuItemImage({
        name: foodItem?.name || name,
        category: (foodItem?.categories || [])[0] || (foodItem as any)?.category_name,
        explicitImageUrl: foodItem?.image_url || foodItem?.imageUrl,
    });
    const foodCandidates = foodItem ? foodResolution.candidates.map((candidate) => candidate.url).filter(Boolean) : [];
    const [candidateIndex, setCandidateIndex] = useState(0);
    const foodImage = foodCandidates[candidateIndex];
    const rating = restaurantRating(restaurant);
    const reviews = restaurantReviewCount(restaurant);
    const eta = restaurantEta(restaurant, locale);
    const minimum = restaurantMinimum(restaurant);
    const cuisine = restaurantCuisine(restaurant, locale === "tr" ? "Mutfak" : "Cuisine");

    useEffect(() => setCandidateIndex(0), [foodItem?.id, id]);

    return (
        <View style={[styles.restaurantCardShell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
                accessibilityLabel={name}
                accessibilityRole="button"
                onPress={onPress}
                style={styles.restaurantCardPressable}
            >
                <Image
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    onError={() => { if (foodImage) setCandidateIndex((current) => current + 1); }}
                    source={foodImage ? { uri: foodImage } : fallbackImage}
                    style={[styles.restaurantCardImage, { backgroundColor: colors.placeholder }]}
                    transition={120}
                />
                <View style={styles.restaurantCardCopy}>
                    <Text numberOfLines={1} style={[styles.restaurantCardName, { color: colors.text }]}>{name}</Text>
                    <View style={styles.restaurantRatingRow}>
                        {rating ? (
                            <View style={styles.restaurantRatingBadge}>
                                <Ionicons color="#FFFFFF" name="star" size={13} />
                                <Text style={styles.restaurantRatingText}>{rating}{reviews ? ` (${reviews})` : ""}</Text>
                            </View>
                        ) : (
                            <View style={[styles.restaurantNewBadge, { backgroundColor: colors.placeholder }]}>
                                <Text style={[styles.restaurantNewText, { color: colors.secondary }]}>{locale === "tr" ? "Yeni" : "New"}</Text>
                            </View>
                        )}
                        <Text numberOfLines={1} style={[styles.restaurantCuisine, { color: colors.secondary }]}>{cuisine}</Text>
                    </View>
                    {(eta || minimum) ? (
                        <View style={styles.restaurantDeliveryRow}>
                            <Ionicons color={colors.secondary} name="bicycle-outline" size={16} />
                            {eta ? <Text numberOfLines={1} style={[styles.restaurantDeliveryText, { color: colors.text }]}>{eta}</Text> : null}
                            {eta && minimum ? <Text style={[styles.restaurantMetaDot, { color: colors.tertiary }]}>·</Text> : null}
                            {minimum ? <Text numberOfLines={1} style={[styles.restaurantDeliveryText, { color: colors.text }]}>Min. {minimum}</Text> : null}
                        </View>
                    ) : null}
                </View>
                <Pressable
                    accessibilityLabel={favorite
                        ? (locale === "tr" ? `${name} favorilerden çıkar` : `Remove ${name} from favorites`)
                        : (locale === "tr" ? `${name} favorilere ekle` : `Add ${name} to favorites`)}
                    accessibilityRole="button"
                    hitSlop={7}
                    onPress={(event) => { event.stopPropagation(); onToggleFavorite(); }}
                    style={[styles.restaurantFavoriteButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <Ionicons color={favorite ? ORANGE : colors.text} name={favorite ? "heart" : "heart-outline"} size={21} />
                </Pressable>
            </Pressable>
        </View>
    );
});
RestaurantResult.displayName = "RestaurantResult";

const SearchLoading = ({ colors }: { colors: Palette }) => (
    <View accessibilityLabel="Loading search results" style={styles.loadingResults}>
        {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.loadingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.loadingImage, { backgroundColor: colors.placeholder }]} />
                <View style={styles.loadingCopy}>
                    <View style={[styles.loadingLinePrimary, { backgroundColor: colors.placeholder }]} />
                    <View style={[styles.loadingLineSecondary, { backgroundColor: colors.placeholder }]} />
                </View>
            </View>
        ))}
    </View>
);

export default function SearchScreen() {
    useWebDocumentTitle();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useBottomTabBarHeight();
    const { i18n } = useTranslation();
    const { variant } = useTheme();
    const dark = variant === "dark";
    const colors = useMemo(() => palette(dark), [dark]);
    const locale: "tr" | "en" = i18n.language?.startsWith("tr") ? "tr" : "en";
    const tr = locale === "tr";
    const copy = useCallback((en: string, turkish: string) => tr ? turkish : en, [tr]);
    const [focused, setFocused] = useState(false);
    const {
        query, setQuery, setCategory, mealsFlat, restaurantsGrid, loading, restaurantsLoading, error,
        recentSearches, persistRecent, clearRecents, refreshing, handleRefresh,
        submitQuery, clearAll,
    } = useSearchScreenV3();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const currentUser = useAuthStore((state) => state.user);
    const favoritesByScope = useFavoritesStore((state) => state.favoritesByScope);
    const loadedScopes = useFavoritesStore((state) => state.loadedScopes);
    const hydrateFavorites = useFavoritesStore((state) => state.hydrateFavorites);
    const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
    const favoriteScope = currentUser?.accountId || currentUser?.id || "guest";
    const favoriteIds = favoritesByScope[favoriteScope] || [];
    const favoriteIdSet = useMemo(
        () => new Set(favoriteIds.map((id) => normalizeId(id).toLowerCase())),
        [favoriteIds],
    );

    useEffect(() => {
        if (!loadedScopes[favoriteScope]) void hydrateFavorites(favoriteScope);
    }, [favoriteScope, hydrateFavorites, loadedScopes]);

    const active = query.trim().length > 0;
    const waiting = loading || restaurantsLoading;
    const popular = useMemo(() => tr
        ? ["Pizza", "Burger", "Tavuk", "Makarna", "Kahvaltı", "Tatlı", "Kahve", "Salata"]
        : ["Pizza", "Burger", "Chicken", "Pasta", "Breakfast", "Dessert", "Coffee", "Salad"], [tr]);
    const cuisines = useMemo(() => CATEGORY_CARDS.map((category) => ({
        key: category.id,
        term: tr ? category.tr : category.en,
        label: tr ? category.tr : category.en,
        image: CUISINE_IMAGES[category.id],
    })), [tr]);

    const runSearch = useCallback((term: string) => {
        const value = term.trim();
        if (!value) return;
        setCategory(undefined);
        setQuery(value);
        persistRecent(value);
        Keyboard.dismiss();
    }, [persistRecent, setCategory, setQuery]);
    const changeQuery = useCallback((value: string) => {
        setCategory(undefined);
        setQuery(value);
    }, [setCategory, setQuery]);
    const openRestaurant = useCallback((value: any, fallback = "") => {
        const id = restaurantId(value, fallback);
        if (id) router.push({ pathname: "/restaurants/[id]", params: { id } });
    }, [router]);
    const restaurantFoodById = useMemo(() => {
        const firstFoodByRestaurant = new Map<string, SearchResult>();
        mealsFlat.forEach((dish) => {
            const id = dishRestaurantId(dish).toLowerCase();
            if (id && !firstFoodByRestaurant.has(id)) firstFoodByRestaurant.set(id, dish);
        });
        return firstFoodByRestaurant;
    }, [mealsFlat]);
    const toggleRestaurantFavorite = useCallback((id: string) => {
        const normalizedId = normalizeId(id).toLowerCase();
        if (!normalizedId) return;
        if (!isAuthenticated) {
            showUserMessage(
                copy("Sign in required", "Giriş gerekli"),
                copy(
                    "Please sign in to add restaurants to your favorites.",
                    "Restoranları favorilerine eklemek için lütfen giriş yapın.",
                ),
            );
            router.push("/sign-in");
            return;
        }
        toggleFavorite(favoriteScope, normalizedId);
    }, [copy, favoriteScope, isAuthenticated, router, toggleFavorite]);

    const sections = useMemo<SearchSection[]>(() => {
        if (!active) return [];
        const next: SearchSection[] = [];
        if (restaurantsGrid.length) next.push({
            key: "restaurants",
            title: copy("Restaurants", "Restoranlar"),
            data: restaurantsGrid.map((value: any, index: number) => ({ kind: "restaurant" as const, value, key: `restaurant-${restaurantId(value, String(index))}` })),
        });
        return next;
    }, [active, copy, restaurantsGrid]);

    const discovery = !active ? (
        <View style={styles.discovery}>
            {recentSearches.length ? (
                <View style={styles.discoverySection}>
                    <View style={styles.sectionHeadingRow}>
                        <View style={styles.recentHeadingTitle}>
                            <Ionicons color={ORANGE} name="time-outline" size={22} style={styles.recentHeadingIcon} />
                            <Text style={[styles.discoveryHeading, { color: colors.text }]}>{copy("Recent searches", "Geçmiş Aramalar")}</Text>
                        </View>
                        <Pressable accessibilityRole="button" hitSlop={8} onPress={clearRecents}><Text style={styles.actionText}>{copy("Clear", "Temizle")}</Text></Pressable>
                    </View>
                    <View style={styles.recentRow}>
                        {recentSearches.map((term) => <RecentChip
                            colors={colors} key={term} label={term} onPress={() => runSearch(term)}
                            searchLabel={copy(`${term}, recent search`, `${term}, geçmiş arama`)}
                        />)}
                    </View>
                </View>
            ) : null}
            <View style={styles.discoverySection}>
                <View style={styles.popularHeadingTitle}>
                    <Ionicons color={ORANGE} name="flame" size={22} />
                    <Text style={[styles.discoveryHeading, { color: colors.text }]}>{copy("Popular searches", "Popüler Aramalar")}</Text>
                </View>
                <ScrollView
                    horizontal
                    contentContainerStyle={styles.popularRow}
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                >
                    {popular.map((term) => <PopularChip accessibilityLabel={copy(`Search for ${term}`, `${term} için ara`)} colors={colors} key={term} label={term} onPress={() => runSearch(term)} />)}
                </ScrollView>
            </View>
            <View style={styles.cuisinesSection}>
                <Text style={[styles.discoveryHeading, { color: colors.text }]}>{copy("Cuisines", "Mutfaklar")}</Text>
                <View style={styles.cuisineGrid}>
                    {cuisines.map((cuisine) => <CuisineCard
                        accessibilityLabel={copy(`View ${cuisine.label} cuisine`, `${cuisine.label} mutfağını görüntüle`)} colors={colors}
                        image={cuisine.image} key={cuisine.key} label={cuisine.label} onPress={() => runSearch(cuisine.term)}
                    />)}
                </View>
            </View>
        </View>
    ) : null;

    const header = (
        <View>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>{copy("Search", "Ara")}</Text>
                <Text style={[styles.subtitle, { color: colors.secondary }]}>{copy("Find restaurants, dishes and cuisines.", "Restoran, ürün veya mutfak ara.")}</Text>
                <SearchField
                    accessibilityLabel={copy("Search restaurants, dishes or cuisines", "Restoran, ürün veya mutfak ara")}
                    colors={colors} focused={focused} loading={active && waiting} onChange={changeQuery} onClear={clearAll}
                    onFocusChange={setFocused} onSubmit={submitQuery}
                    placeholder={copy("Search restaurants, dishes or cuisines", "Restoran, ürün veya mutfak ara")} value={query}
                />
            </View>
            {discovery}
        </View>
    );

    const emptyResults = active && !waiting ? (
        <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.placeholder }]}><Ionicons color={colors.secondary} name={error ? "cloud-offline-outline" : "search-outline"} size={27} /></View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{error
                ? copy("Something went wrong", "Bir şeyler ters gitti")
                : copy(`No results for “${query.trim()}”`, `“${query.trim()}” için sonuç bulunamadı`)}</Text>
            <Text style={[styles.emptyBody, { color: colors.secondary }]}>{error
                ? copy("Search results could not be loaded.", "Arama sonuçları yüklenemedi.")
                : copy("Try another search.", "Farklı bir arama deneyin.")}</Text>
            {error ? <Pressable hitSlop={8} onPress={() => void handleRefresh()}><Text style={styles.retryText}>{copy("Try again", "Tekrar dene")}</Text></Pressable> : null}
        </View>
    ) : null;

    const bottomClearance = Math.max(tabBarHeight, 45 + insets.bottom) + 22;
    return (
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: colors.page }]}>
            <StatusBar style={dark ? "light" : "dark"} />
            <SectionList<SearchEntry, SearchSection>
                contentContainerStyle={{ paddingBottom: bottomClearance }}
                contentInsetAdjustmentBehavior="never"
                sections={sections}
                keyExtractor={(item) => item.key}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={active && waiting ? <SearchLoading colors={colors} /> : emptyResults}
                ListHeaderComponent={header}
                refreshControl={<RefreshControl onRefresh={handleRefresh} refreshing={refreshing} tintColor={ORANGE} />}
                renderItem={({ item }) => {
                    if (item.kind === "restaurant") {
                        const id = restaurantId(item.value, item.key);
                        const normalizedId = id.toLowerCase();
                        return <RestaurantResult
                            colors={colors}
                            fallback={copy("Restaurant", "Restoran")}
                            favorite={favoriteIdSet.has(normalizedId)}
                            foodItem={restaurantFoodById.get(normalizedId)}
                            locale={locale}
                            onPress={() => openRestaurant(item.value, id)}
                            onToggleFavorite={() => toggleRestaurantFavorite(id)}
                            restaurant={item.value}
                        />;
                    }
                    return null;
                }}
                renderSectionHeader={({ section }) => <View style={[styles.resultsHeading, { backgroundColor: colors.page }]}><Text style={[styles.resultsHeadingText, { color: colors.text }]}>{section.title}</Text></View>}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                style={{ backgroundColor: colors.page }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    header: { paddingHorizontal: PAGE_PADDING, paddingTop: 17 },
    title: { fontFamily: "ChairoSans", fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.4 },
    subtitle: { marginTop: 2, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, fontWeight: "400" },
    searchField: { width: "100%", height: 46, marginTop: 16, borderRadius: 13, borderWidth: 1, paddingLeft: 14, paddingRight: 4, flexDirection: "row", alignItems: "center", gap: 10 },
    searchInput: {
        flex: 1,
        height: "100%",
        paddingVertical: 10,
        textAlignVertical: "center",
        fontFamily: "ChairoSans",
        fontSize: 14,
        fontWeight: "500",
    },
    clearSearch: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
    discovery: { paddingHorizontal: PAGE_PADDING, paddingTop: 24 },
    discoverySection: { marginBottom: 24, gap: 10 },
    cuisinesSection: { gap: 11 },
    sectionHeadingRow: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    discoveryHeading: { fontFamily: "ChairoSans", fontSize: 18, lineHeight: 22, fontWeight: "700", letterSpacing: -0.2 },
    actionText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 18, fontWeight: "600" },
    recentHeadingTitle: { minWidth: 0, flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 7 },
    recentHeadingIcon: { transform: [{ translateY: -2 }] },
    recentRow: { width: "100%", flexDirection: "row", justifyContent: "flex-start", gap: 8 },
    recentChipPressable: { width: "18%", flexGrow: 0, minWidth: 0, height: 38 },
    recentChipSurface: { flex: 1, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, overflow: "hidden" },
    recentChipText: { maxWidth: "100%", fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, fontWeight: "500" },
    popularHeadingTitle: { flexDirection: "row", alignItems: "center", gap: 7 },
    popularRow: { flexDirection: "row", gap: 8, paddingRight: 2 },
    chipText: { fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 19, fontWeight: "500" },
    popularChipPressable: { height: 38 },
    popularChipSurface: { height: 38, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    cuisineGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", columnGap: 8, rowGap: 12 },
    cuisineCardPressable: { width: "23.2%", height: 112 },
    cuisineCard: { width: "100%", height: "100%", borderRadius: 15, borderWidth: 1, overflow: "hidden", ...(cuisineCardShadow as object) },
    cuisineCardPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
    cuisineImage: { width: "100%", height: 78 },
    cuisineFooter: { flex: 1, minHeight: 34, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
    cuisineTitle: { width: "100%", textAlign: "center", fontFamily: "ChairoSans", fontSize: 11.5, lineHeight: 13, fontWeight: "600" },
    resultsHeading: { paddingHorizontal: PAGE_PADDING, paddingTop: 25, paddingBottom: 10 },
    resultsHeadingText: { fontFamily: "ChairoSans", fontSize: 18, lineHeight: 22, fontWeight: "700" },
    restaurantCardShell: {
        marginHorizontal: PAGE_PADDING,
        marginBottom: 11,
        borderRadius: 16,
        borderWidth: 1,
        overflow: "visible",
        ...(restaurantCardShadow as object),
    },
    restaurantCardPressable: {
        minHeight: 122,
        padding: 9,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "stretch",
    },
    restaurantCardImage: { width: 104, height: 104, borderRadius: 12 },
    restaurantCardCopy: { flex: 1, minWidth: 0, paddingLeft: 12, paddingRight: 38, paddingTop: 3, paddingBottom: 3 },
    restaurantCardName: { fontFamily: "ChairoSans", fontSize: 16, lineHeight: 20, fontWeight: "700" },
    restaurantRatingRow: { minWidth: 0, marginTop: 7, flexDirection: "row", alignItems: "center", gap: 7 },
    restaurantRatingBadge: { height: 25, borderRadius: 8, paddingHorizontal: 7, backgroundColor: "#16B364", flexDirection: "row", alignItems: "center", gap: 4 },
    restaurantRatingText: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 16, fontWeight: "700" },
    restaurantNewBadge: { height: 25, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
    restaurantNewText: { fontFamily: "ChairoSans", fontSize: 12, lineHeight: 15, fontWeight: "600" },
    restaurantCuisine: { flex: 1, minWidth: 0, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 18, fontWeight: "500" },
    restaurantDeliveryRow: { minWidth: 0, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 5 },
    restaurantDeliveryText: { flexShrink: 1, fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
    restaurantMetaDot: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 17 },
    restaurantFavoriteButton: {
        position: "absolute",
        top: 9,
        right: 9,
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        ...(makeShadow({ color: "#101828", offsetY: 2, blurRadius: 7, opacity: 0.12, elevation: 2 }) as object),
    },
    emptyState: { paddingHorizontal: PAGE_PADDING, paddingTop: 44, alignItems: "center" },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    emptyTitle: { marginTop: 13, textAlign: "center", fontFamily: "ChairoSans", fontSize: 16, lineHeight: 21, fontWeight: "700" },
    emptyBody: { marginTop: 4, textAlign: "center", fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 19 },
    retryText: { marginTop: 12, color: ORANGE, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, fontWeight: "600" },
    loadingResults: { paddingHorizontal: PAGE_PADDING, paddingTop: 24 },
    loadingRow: { height: 122, marginBottom: 11, padding: 9, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1 },
    loadingImage: { width: 104, height: 104, borderRadius: 12 },
    loadingCopy: { flex: 1, gap: 9 },
    loadingLinePrimary: { width: "62%", height: 13, borderRadius: 5 },
    loadingLineSecondary: { width: "42%", height: 10, borderRadius: 5 },
});
