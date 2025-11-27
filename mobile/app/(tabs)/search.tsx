import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import CartButton from "@/components/CartButton";
import RestaurantCard from "@/components/RestaurantCard";
import { images } from "@/constants/mediaCatalog";
import { storage } from "@/src/lib/storage";
import { Chip, Stepper, Card } from "@/src/components/componentRegistry";
import useSearch, { SearchCategory, SearchResult, SearchSort } from "@/src/hooks/useSearch";
import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { useTheme } from "@/src/theme/themeContext";
import "@/src/lib/i18n";

const sortOptions: { id: SearchSort; label: string }[] = [
    { id: "relevance", label: "Relevance" },
    { id: "eta", label: "Fastest" },
    { id: "price", label: "Price" },
];

const RECENT_SEARCHES_KEY = "hungrie_search_recents";
const WINE_RED = "#7F021F";

const parsePriceValue = (value?: number | string) => {
    const numeric =
        typeof value === "string" ? Number(value.replace(/[^\d.,-]/g, "").replace(",", ".")) : Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatPrice = (value?: number | string) => `TRY ${parsePriceValue(value).toFixed(2)}`;

const parseEtaValue = (item: Partial<SearchResult>) => {
    const raw = item.deliveryTime ?? (item as any)?.eta ?? 20;
    if (typeof raw === "string") {
        const match = raw.match(/\d+/);
        if (match) return Number(match[0]);
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 20;
};

const etaLabel = (item: Partial<SearchResult>) => `${parseEtaValue(item)} min`;

const resolveImage = (item: SearchResult) => {
    const raw = (item as any).image_url || (item as any).imageUrl || item.restaurantImage;
    const uriFromObject =
        typeof raw === "object" && raw !== null
            ? (raw as any).uri || (raw as any).url || (raw as any).imageUrl || null
            : null;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") return { uri: raw };
    if (typeof uriFromObject === "string") return { uri: uriFromObject };
    return images.logo;
};

const SearchBar = ({
    value,
    onDebouncedChange,
    onClear,
}: {
    value: string;
    onDebouncedChange: (text: string) => void;
    onClear?: () => void;
}) => {
    const { theme } = useTheme();
    const [text, setText] = useState(value);

    useEffect(() => setText(value), [value]);

    useEffect(() => {
        const handler = setTimeout(() => {
            onDebouncedChange(text);
        }, 250);
        return () => clearTimeout(handler);
    }, [text, onDebouncedChange]);

    return (
        <View style={[styles.searchBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <Icon name="search" size={20} color={theme.colors.muted} style={styles.searchIcon} />
            <TextInput
                placeholder='Type a craving or ingredient, for example "crispy taco"'
                placeholderTextColor={theme.colors.muted}
                value={text}
                onChangeText={setText}
                style={[styles.searchInput, { color: theme.colors.ink }]}
                returnKeyType="search"
            />
            {text.length ? (
                <TouchableOpacity
                    onPress={() => {
                        setText("");
                        onClear?.();
                    }}
                >
                    <Icon name="close" size={18} color={theme.colors.muted} />
                </TouchableOpacity>
            ) : null}
        </View>
    );
};

const CategoryRow = ({
    categories,
    selected,
    onSelect,
    loading,
}: {
    categories: SearchCategory[];
    selected?: string;
    onSelect: (id?: string) => void;
    loading: boolean;
}) => {
    const { theme } = useTheme();
    if (loading && !categories.length) {
        return (
            <View style={styles.categorySkeletonRow}>
                {[...Array(4)].map((_, index) => (
                    <View key={index} style={[styles.categorySkeleton, { backgroundColor: theme.colors.border }]} />
                ))}
            </View>
        );
    }
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryListContent}>
            <Chip label="All" selected={!selected} onPress={() => onSelect(undefined)} />
            {categories.map((item) => (
                <Chip
                    key={item.id}
                    label={`${item.name} (${item.count})`}
                    selected={selected?.toLowerCase() === item.name.toLowerCase()}
                    onPress={() => onSelect(item.name)}
                />
            ))}
        </ScrollView>
    );
};

const SearchResultCard = ({
    item,
    quantity,
    onQuantityChange,
}: {
    item: SearchResult;
    quantity: number;
    onQuantityChange: (value: number) => void;
}) => {
    const { theme } = useTheme();
    const categoryLabel = item.categories?.[0];
    const priceLabel = formatPrice(item.price);
    const ratingLabel =
        typeof item.restaurantRating === "number" && Number.isFinite(item.restaurantRating)
            ? item.restaurantRating.toFixed(1)
            : "4.5";
    return (
        <Card style={[styles.resultCard, { borderColor: theme.colors.border }]} elevation={2}>
            <View style={styles.resultImageShell}>
                <Image source={resolveImage(item)} style={styles.resultImage} contentFit="cover" />
                {item.restaurantRating ? (
                    <View
                        style={[
                            styles.ratingPill,
                            { backgroundColor: `${theme.colors.surface}CC`, borderColor: theme.colors.border },
                        ]}
                    >
                        <Icon name="star" size={12} color="#FFB703" />
                        <Text style={[styles.ratingText, { color: theme.colors.ink }]}>
                            {Number(item.restaurantRating).toFixed(1)}
                        </Text>
                    </View>
                ) : null}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.resultTitle, { color: theme.colors.ink }]} numberOfLines={2}>
                    {item.name}
                </Text>
                <Text style={[styles.resultRestaurant, { color: theme.colors.muted }]} numberOfLines={1}>
                    {item.restaurantName || "Campus favourite"}
                </Text>
                {item.description ? (
                    <Text style={[styles.resultDescription, { color: theme.colors.muted }]} numberOfLines={2}>
                        {item.description}
                    </Text>
                ) : null}
                <View style={styles.resultMetaRow}>
                    {item.restaurantReviewCount || (item as any).reviewCount ? (
                        <View style={[styles.metaChip, { backgroundColor: `${theme.colors.border}55` }]}>
                            <Icon name="profile" size={14} color={theme.colors.primary} />
                            <Text style={[styles.metaText, { color: theme.colors.ink }]}>
                                {(item.restaurantReviewCount ?? (item as any).reviewCount) || 0} reviews
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>
            <View style={styles.counterRow}>
                <View style={[styles.priceBadge, { backgroundColor: `${theme.colors.border}55` }]}>
                    <Icon name="star" size={14} color="#FFB703" />
                    <Text style={[styles.metaText, { color: theme.colors.ink }]}>{ratingLabel}</Text>
                    <Text style={[styles.metaText, { color: theme.colors.ink }]}>· {priceLabel}</Text>
                </View>
                <Stepper value={quantity} min={0} max={10} onChange={onQuantityChange} />
            </View>
        </Card>
    );
};

const SkeletonList = () => (
    <View style={styles.skeletonContainer}>
        {[...Array(3)].map((_, index) => (
            <View key={index} style={styles.resultSkeleton} />
        ))}
    </View>
);

const Search = () => {
    const { t } = useTranslation();
    const { theme, variant } = useTheme();
    const { query: initialQuery, category: initialCategory } = useLocalSearchParams<{ query?: string; category?: string }>();
    const {
        query,
        setQuery,
        category,
        setCategory,
        sort,
        setSort,
        results,
        categories,
        restaurants,
        loading,
        restaurantsLoading,
        error,
        refetch,
    } = useSearch({
        initialQuery: typeof initialQuery === "string" ? initialQuery : "",
        initialCategory: typeof initialCategory === "string" ? initialCategory : undefined,
    });
    const { items, addItem, increaseQty, decreaseQty, removeItem } = useCartStore();
    const router = useRouter();
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const headerBackground = variant === "dark" ? "#160D0A" : "#F8FAFC";
    const controlBackground = variant === "dark" ? theme.colors.surface : "#FFFFFF";
    const pageBackground = variant === "dark" ? "#0F0907" : "#F8FAFC";

    const getQuantity = (id: string) =>
        items.filter((entry) => entry.id === id).reduce((total, entry) => total + entry.quantity, 0);

    const handleQuantityChange = (item: SearchResult, nextValue: number) => {
        const id = String(item.$id ?? item.id);
        const current = getQuantity(id);
        if (nextValue === current) return;
        if (nextValue > current) {
            const diff = nextValue - current;
            for (let i = 0; i < diff; i += 1) {
                addItem({
                    id,
                    name: item.name,
                    price: Number(item.price || 0),
                    image_url: (item as any).image_url || (item as any).imageUrl || "",
                    customizations: [],
                });
            }
        } else {
            let remaining = current;
            const diff = current - nextValue;
            for (let i = 0; i < diff; i += 1) {
                if (remaining <= 1) {
                    removeItem(id, []);
                    remaining = 0;
                } else {
                    decreaseQty(id, []);
                    remaining -= 1;
                }
            }
        }
    };

    const filteredResults = useMemo(() => results, [results]);

    const listData = useMemo(
        () => [
            { type: "controls" as const },
            ...filteredResults.map((item) => ({ type: "result" as const, item })),
        ],
        [filteredResults],
    );

    const showEmpty = !loading && !error && filteredResults.length === 0;

    useEffect(() => {
        storage.getItem(RECENT_SEARCHES_KEY).then((raw) => {
            if (!raw) return;
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setRecentSearches(parsed.filter(Boolean));
            } catch {
                /* noop */
            }
        });
    }, []);

    const persistRecent = useCallback(async (term: string) => {
        const normalized = term.trim();
        if (!normalized) return;
        setRecentSearches((prev) => {
            const next = [normalized, ...prev.filter((entry) => entry !== normalized)].slice(0, 6);
            void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const renderFooter = useCallback(() => {
        if (error) {
            return (
                <View style={styles.emptyState}>
                    <Image source={images.deliveryProcess} style={styles.emptyImage} contentFit="cover" />
                    <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>{t("search.offline.title")}</Text>
                    <Text style={[styles.emptyDescription, { color: theme.colors.muted }]}>
                        {t("search.offline.body")}
                    </Text>
                    <TouchableOpacity
                        style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
                        onPress={refetch}
                    >
                        <Text style={styles.retryButtonText}>Refresh feed</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        if (showEmpty) {
            return (
                <View style={styles.emptyState}>
                    <Image source={images.deliveryReview} style={styles.emptyImage} contentFit="cover" />
                    <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>{t("search.empty.title")}</Text>
                    <Text style={[styles.emptyDescription, { color: theme.colors.muted }]}>0 matches</Text>
                    <Text style={[styles.emptyDescription, { color: theme.colors.muted }]}>{t("search.empty.body")}</Text>
                    <TouchableOpacity
                        style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
                        onPress={() => {
                            setCategory(undefined);
                            refetch();
                        }}
                    >
                        <Text style={styles.retryButtonText}>Clear filters</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        if (loading && !filteredResults.length) return <SkeletonList />;
        return null;
    }, [
        error,
        showEmpty,
        loading,
        filteredResults.length,
        theme.colors.ink,
        theme.colors.muted,
        theme.colors.primary,
        refetch,
        setCategory,
    ]);

    useEffect(() => {
        if (typeof initialQuery === "string") setQuery(initialQuery);
        if (typeof initialCategory === "string") setCategory(initialCategory);
    }, [initialQuery, initialCategory, setQuery, setCategory]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: pageBackground }]}>
            <FlatList
                data={listData}
                keyExtractor={(item, index) =>
                    item.type === "controls"
                        ? "controls"
                        : String(
                              ("item" in item ? (item.item as SearchResult).$id ?? (item.item as SearchResult).id : null) ??
                                  index,
                          )
                }
                renderItem={({ item }) => {
                    if (item.type === "controls") {
                        return (
                            <View
                                style={[
                                    styles.controlCard,
                                    {
                                        backgroundColor: controlBackground,
                                        borderColor: theme.colors.border,
                                        shadowColor: "#000",
                                        shadowOpacity: 0.06,
                                        shadowOffset: { width: 0, height: 8 },
                                        shadowRadius: 16,
                                        elevation: 4,
                                    },
                                ]}
                            >
                                <SearchBar
                                    value={query}
                                    onDebouncedChange={(text) => {
                                        setQuery(text);
                                        if (text.trim().length >= 2) void persistRecent(text);
                                    }}
                                    onClear={() => {
                                        setQuery("");
                                        setCategory(undefined);
                                    }}
                                />
                                {recentSearches.length ? (
                                    <View style={styles.recentRow}>
                                        <Text style={[styles.recentLabel, { color: theme.colors.muted }]}>Recent</Text>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.recentChips}
                                        >
                                            {recentSearches.map((entry) => (
                                                <Chip key={entry} label={entry} onPress={() => setQuery(entry)} />
                                            ))}
                                        </ScrollView>
                                    </View>
                                ) : null}
                                <View style={styles.sortRow}>
                                    {sortOptions.map((option) => (
                                        <Chip
                                            key={option.id}
                                            label={option.label}
                                            selected={sort === option.id}
                                            onPress={() => setSort(option.id)}
                                        />
                                    ))}
                                </View>
                                <CategoryRow
                                    categories={categories}
                                    selected={category}
                                    onSelect={(value) => setCategory(value)}
                                    loading={loading && !categories.length}
                                />
                            </View>
                        );
                    }
                    const menuItem = item.item as SearchResult;
                    const id = String(menuItem.$id ?? menuItem.id);
                    return (
                        <SearchResultCard
                            item={menuItem}
                            quantity={getQuantity(id)}
                            onQuantityChange={(value) => handleQuantityChange(menuItem, value)}
                        />
                    );
                }}
                stickyHeaderIndices={[1]}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <View style={[styles.headerContainer, { backgroundColor: headerBackground }]}>
                        <View style={styles.topRow}>
                            <View>
                                <Text style={[styles.headerEyebrow, { color: theme.colors.primary }]}>SEARCH</Text>
                                <Text style={[styles.headerTitle, { color: theme.colors.ink }]}>
                                    Find your favourite food
                                </Text>
                                <Text style={[styles.headerSubtitle, { color: theme.colors.muted }]}>
                                    Filters update results instantly.
                                </Text>
                            </View>
                            <CartButton />
                        </View>
                        <View
                            style={[
                                styles.discoveryCard,
                                { borderColor: `${WINE_RED}30`, backgroundColor: WINE_RED },
                            ]}
                        >
                            <Image source={images.fastDelivery} style={styles.discoveryImage} contentFit="cover" />
                            <View style={styles.discoveryText}>
                                <Text style={[styles.discoveryTitle, { color: theme.colors.surface }]}>
                                    {t("search.discovery.title")}
                                </Text>
                                <Text style={[styles.discoverySubtitle, { color: `${theme.colors.surface}DD` }]}>
                                    {t("search.discovery.subtitle")}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.statsRow}>
                            <View
                                style={[
                                    styles.statPill,
                                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                ]}
                            >
                                <Icon name="search" size={16} color={theme.colors.primary} />
                                <Text style={[styles.statValue, { color: theme.colors.ink }]}>
                                    {filteredResults.length}
                                </Text>
                                <Text style={[styles.statLabel, { color: theme.colors.muted }]}>dishes</Text>
                            </View>
                            <View
                                style={[
                                    styles.statPill,
                                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                ]}
                            >
                                <Icon name="bag" size={16} color={theme.colors.primary} />
                                <Text style={[styles.statValue, { color: theme.colors.ink }]}>
                                    {restaurants.length}
                                </Text>
                                <Text style={[styles.statLabel, { color: theme.colors.muted }]}>kitchens</Text>
                            </View>
                        </View>
                        <View style={styles.sectionHeadingRow}>
                            <View>
                                <Text style={[styles.sectionHeading, { color: theme.colors.ink }]}>Restaurants</Text>
                                <Text style={[styles.sectionMeta, { color: theme.colors.muted }]}>
                                    {restaurantsLoading ? "Checking kitchens..." : `${restaurants.length} matches`}
                                </Text>
                            </View>
                            {restaurantsLoading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
                        </View>
                        {restaurantsLoading ? (
                            <View style={styles.restaurantSkeletonContainer}>
                                {[...Array(2)].map((_, index) => (
                                    <View
                                        key={`restaurant-skel-${index}`}
                                        style={[styles.restaurantSkeleton, { backgroundColor: theme.colors.border }]}
                                    />
                                ))}
                            </View>
                        ) : restaurants.length ? (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 12, paddingVertical: 8 }}
                            >
                                {restaurants.slice(0, 5).map((restaurant) => (
                                    <View
                                        key={String(restaurant.id ?? restaurant.$id ?? restaurant.name)}
                                        style={{ width: 300 }}
                                    >
                                        <RestaurantCard
                                            restaurant={restaurant}
                                            onPress={() =>
                                                router.push({
                                                    pathname: "/search",
                                                    params: { query: restaurant.name },
                                                })
                                            }
                                        />
                                    </View>
                                ))}
                            </ScrollView>
                        ) : (
                            <View style={{ gap: 4 }}>
                                <Text style={[styles.restaurantEmpty, { color: theme.colors.muted }]}>
                                    {t("search.empty.title")}
                                </Text>
                                <Text style={[styles.restaurantEmpty, { color: theme.colors.muted }]}>
                                    {t("search.empty.body")}
                                </Text>
                            </View>
                        )}
                    </View>
                }
                ListFooterComponent={renderFooter}
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    listContent: { paddingBottom: 160, gap: 16 },
    headerContainer: { paddingHorizontal: 20, paddingTop: 20, gap: 16, paddingBottom: 12 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    headerEyebrow: { fontFamily: "Ezra-SemiBold", fontSize: 12, letterSpacing: 1 },
    headerTitle: { fontFamily: "Ezra-Bold", fontSize: 24 },
    headerSubtitle: { marginTop: 4 },
    discoveryCard: {
        flexDirection: "row",
        gap: 12,
        borderRadius: 28,
        borderWidth: 1,
        padding: 12,
        alignItems: "center",
    },
    discoveryImage: { width: 72, height: 72, borderRadius: 20 },
    discoveryText: { flex: 1, gap: 4 },
    discoveryTitle: { fontFamily: "Ezra-Bold", fontSize: 16 },
    discoverySubtitle: { fontFamily: "Ezra-Medium", lineHeight: 18 },
    statsRow: { flexDirection: "row", gap: 12 },
    statPill: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderRadius: 18,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    statValue: { fontFamily: "Ezra-Bold", fontSize: 16 },
    statLabel: { fontFamily: "Ezra-Medium", fontSize: 12 },
    controlCard: {
        marginHorizontal: 20,
        marginBottom: 8,
        borderRadius: 24,
        borderWidth: 1,
        padding: 14,
        gap: 12,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 32,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    searchIcon: { width: 20, height: 20, marginRight: 8 },
    searchInput: { flex: 1, fontFamily: "Ezra-Medium", fontSize: 16 },
    sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    recentRow: { gap: 8 },
    recentLabel: { fontFamily: "Ezra-SemiBold", fontSize: 12 },
    recentChips: { flexDirection: "row", gap: 8 },
    sectionHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
    sectionHeading: { fontFamily: "Ezra-Bold", fontSize: 18 },
    sectionMeta: { fontFamily: "Ezra-Medium", marginTop: 4 },
    restaurantList: { gap: 12 },
    restaurantEmpty: { fontFamily: "Ezra-Medium" },
    restaurantSkeletonContainer: { gap: 12 },
    restaurantSkeleton: { height: 120, borderRadius: 28, marginRight: 12 },
    categorySkeletonRow: {
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 4,
        paddingVertical: 6,
    },
    categoryListContent: {
        paddingVertical: 4,
        gap: 8,
        paddingRight: 12,
    },
    categorySkeleton: {
        width: 80,
        height: 34,
        borderRadius: 17,
    },
    resultCard: { flexDirection: "row", alignItems: "center", gap: 12 },
    resultImageShell: { width: 84, height: 84, borderRadius: 18, overflow: "hidden" },
    resultImage: { width: "100%", height: "100%" },
    ratingPill: {
        position: "absolute",
        top: 8,
        left: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 14,
        borderWidth: 1,
    },
    ratingText: { fontFamily: "Ezra-Bold", fontSize: 12 },
    resultTitle: { fontFamily: "Ezra-Bold", fontSize: 18 },
    resultRestaurant: { fontFamily: "Ezra-Medium" },
    resultDescription: { fontSize: 14 },
    resultMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    metaText: { fontFamily: "Ezra-Medium", fontSize: 13 },
    counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
    priceBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    skeletonContainer: { gap: 12, padding: 20 },
    resultSkeleton: { height: 100, borderRadius: 24, backgroundColor: "#E2E8F0" },
    emptyState: { alignItems: "center", gap: 12, padding: 32 },
    emptyImage: { width: 220, height: 160, borderRadius: 24 },
    emptyTitle: { fontFamily: "Ezra-Bold", fontSize: 18 },
    emptyDescription: { textAlign: "center" },
    retryButton: {
        marginTop: 8,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    retryButtonText: { color: "#fff", fontFamily: "Ezra-SemiBold" },
});

export default Search;
