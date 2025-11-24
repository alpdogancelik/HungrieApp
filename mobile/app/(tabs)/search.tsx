import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
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
import useAsyncResource from "@/lib/useAsyncResource";
import { getCategories } from "@/lib/firebaseAuth";
import type { MenuItem } from "@/type";
import { Chip, Stepper, Card } from "@/src/components/componentRegistry";
import useSearch, { SearchSort } from "@/src/hooks/useSearch";
import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import "@/src/lib/i18n";

const sortOptions: { id: SearchSort; label: string }[] = [
    { id: "relevance", label: "Relevance" },
    { id: "eta", label: "ETA" },
    { id: "price", label: "Price" },
];

const parsePrice = (value?: number | string) => `TRY ${Number(value ?? 0).toFixed(2)}`;
const parseEta = (item: Partial<MenuItem>) => item.deliveryTime ?? item.eta ?? "20";

const SearchBar = ({ value, onDebouncedChange }: { value: string; onDebouncedChange: (text: string) => void }) => {
    const [text, setText] = useState(value);

    useEffect(() => setText(value), [value]);

    useEffect(() => {
        const handler = setTimeout(() => {
            onDebouncedChange(text);
        }, 250);
        return () => clearTimeout(handler);
    }, [text, onDebouncedChange]);

    return (
        <View style={styles.searchBar}>
            <Icon name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
            <TextInput
                placeholder='Type a craving or ingredient, for example "crispy taco"'
                placeholderTextColor="#94A3B8"
                value={text}
                onChangeText={setText}
                style={styles.searchInput}
                returnKeyType="search"
            />
        </View>
    );
};

const CategoryRow = ({
    categories,
    selected,
    onSelect,
    loading,
}: {
    categories: any[];
    selected?: string;
    onSelect: (id?: string) => void;
    loading: boolean;
}) => {
    if (loading) {
        return (
            <View style={styles.categorySkeletonRow}>
                {[...Array(4)].map((_, index) => (
                    <View key={index} style={styles.categorySkeleton} />
                ))}
            </View>
        );
    }
    return (
        <FlatList
            data={[{ id: "all", name: "All" }, ...categories]}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryListContent}
            renderItem={({ item }) => (
                <Chip
                    label={item.name}
                    selected={item.id === "all" ? !selected : selected?.toLowerCase() === item.name.toLowerCase()}
                    onPress={() => (item.id === "all" ? onSelect(undefined) : onSelect(item.name))}
                />
            )}
        />
    );
};

const SearchResultCard = ({
    item,
    quantity,
    onQuantityChange,
}: {
    item: MenuItem;
    quantity: number;
    onQuantityChange: (value: number) => void;
}) => (
    <Card style={styles.resultCard}>
        <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.resultTitle} numberOfLines={2}>
                {item.name}
            </Text>
            {item.description ? (
                <Text style={styles.resultDescription} numberOfLines={2}>
                    {item.description}
                </Text>
            ) : null}
            <View style={styles.resultMetaRow}>
                <Text style={styles.resultPrice}>{parsePrice(item.price)}</Text>
                <Text style={styles.resultEta}>{parseEta(item)} min</Text>
            </View>
        </View>
        <Stepper value={quantity} min={0} max={10} onChange={onQuantityChange} />
    </Card>
);

const SkeletonList = () => (
    <View style={styles.skeletonContainer}>
        {[...Array(3)].map((_, index) => (
            <View key={index} style={styles.resultSkeleton} />
        ))}
    </View>
);

const Search = () => {
    const { t } = useTranslation();
    const { query: initialQuery, category: initialCategory } = useLocalSearchParams<{ query?: string; category?: string }>();
    const {
        query,
        setQuery,
        category,
        setCategory,
        sort,
        setSort,
        results,
        restaurants,
        loading,
        restaurantsLoading,
        error,
        refetch,
    } = useSearch({
        initialQuery: typeof initialQuery === "string" ? initialQuery : "",
        initialCategory: typeof initialCategory === "string" ? initialCategory : undefined,
    });
    const { data: categoriesData, loading: categoriesLoading } = useAsyncResource({ fn: getCategories });
    const { items, addItem, increaseQty, decreaseQty, removeItem } = useCartStore();
    const router = useRouter();

    const listData = useMemo(
        () => [
            { type: "categories" },
            ...results.map((item) => ({ type: "result", item })),
        ],
        [results],
    );

    const getQuantity = (id: string) =>
        items.filter((entry) => entry.id === id).reduce((total, entry) => total + entry.quantity, 0);

    const handleQuantityChange = (item: MenuItem, nextValue: number) => {
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
                    image_url: item.image_url || item.imageUrl || "",
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

    const showEmpty = !loading && !error && results.length === 0;

    const renderItem = ({ item }: { item: any }) => {
        if (item.type === "categories") {
            return (
                <CategoryRow
                    categories={categoriesData || []}
                    selected={category}
                    onSelect={(value) => setCategory(value)}
                    loading={categoriesLoading}
                />
            );
        }
        const menuItem = item.item as MenuItem;
        const id = String(menuItem.$id ?? menuItem.id);
        return (
            <SearchResultCard item={menuItem} quantity={getQuantity(id)} onQuantityChange={(value) => handleQuantityChange(menuItem, value)} />
        );
    };

    const renderFooter = () => {
        if (loading) return <SkeletonList />;
        if (error) {
            return (
                <View style={styles.emptyState}>
                    <Image source={images.deliveryProcess} style={styles.emptyImage} contentFit="cover" />
                    <Text style={styles.emptyTitle}>{t("search.offline.title")}</Text>
                    <Text style={styles.emptyDescription}>
                        {t("search.offline.body")}
                    </Text>
                    <TouchableOpacity style={styles.retryButton} onPress={refetch}>
                        <Text style={styles.retryButtonText}>Refresh feed</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        if (showEmpty) {
            return (
                <View style={styles.emptyState}>
                    <Image source={images.deliveryReview} style={styles.emptyImage} contentFit="cover" />
                    <Text style={styles.emptyTitle}>{t("search.empty.title")}</Text>
                    <Text style={styles.emptyDescription}>0 matches</Text>
                    <Text style={styles.emptyDescription}>
                        {t("search.empty.body")}
                    </Text>
                </View>
            );
        }
        return null;
    };

    const onParamChange = (text: string) => setQuery(text);

    useEffect(() => {
        if (typeof initialQuery === "string") setQuery(initialQuery);
        if (typeof initialCategory === "string") setCategory(initialCategory);
    }, [initialQuery, initialCategory]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <FlatList
                data={listData}
                keyExtractor={(item, index) => (item.type === "categories" ? "categories" : String(('item' in item ? (item.item as MenuItem).$id ?? (item.item as MenuItem).id : null) ?? index))}
                renderItem={renderItem}
                stickyHeaderIndices={[1]}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <View style={styles.headerContainer}>
                        <View style={styles.topRow}>
                            <View>
                                <Text style={styles.headerEyebrow}>SEARCH</Text>
                                <Text style={styles.headerTitle}>Find your favourite food</Text>
                                <Text style={styles.headerSubtitle}>Filters update results instantly.</Text>
                            </View>
                            <CartButton />
                        </View>
                        <View style={styles.discoveryCard}>
                            <Image source={images.fastDelivery} style={styles.discoveryImage} contentFit="cover" />
                            <View style={styles.discoveryText}>
                                <Text style={styles.discoveryTitle}>{t("search.discovery.title")}</Text>
                                <Text style={styles.discoverySubtitle}>
                                    {t("search.discovery.subtitle")}
                                </Text>
                            </View>
                        </View>
                        <SearchBar value={query} onDebouncedChange={onParamChange} />
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
                        <View style={styles.sectionHeadingRow}>
                            <View>
                                <Text style={styles.sectionHeading}>Restaurants</Text>
                                <Text style={styles.sectionMeta}>
                                    {restaurantsLoading ? "Checking kitchens..." : `${restaurants.length} matches`}
                                </Text>
                            </View>
                            {restaurantsLoading ? (
                                <ActivityIndicator size="small" color="#FF8C42" />
                            ) : null}
                        </View>
                        {restaurantsLoading ? (
                            <View style={styles.restaurantSkeletonContainer}>
                                {[...Array(2)].map((_, index) => (
                                    <View key={`restaurant-skel-${index}`} style={styles.restaurantSkeleton} />
                                ))}
                            </View>
                        ) : restaurants.length ? (
                            <View style={styles.restaurantList}>
                                {restaurants.slice(0, 3).map((restaurant) => (
                                    <RestaurantCard
                                        key={String(restaurant.id ?? restaurant.$id ?? restaurant.name)}
                                        restaurant={restaurant}
                                        onPress={() =>
                                            router.push({
                                                pathname: "/search",
                                                params: { query: restaurant.name },
                                            })
                                        }
                                    />
                                ))}
                            </View>
                        ) : (
                            <View style={{ gap: 4 }}>
                                <Text style={styles.restaurantEmpty}>{t("search.empty.title")}</Text>
                                <Text style={styles.restaurantEmpty}>{t("search.empty.body")}</Text>
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
    safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
    listContent: { paddingBottom: 160, gap: 16 },
    headerContainer: { paddingHorizontal: 20, paddingTop: 20, gap: 16, paddingBottom: 12, backgroundColor: "#F8FAFC" },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    headerEyebrow: { color: "#FF8C42", fontFamily: "Ezra-SemiBold", fontSize: 12, letterSpacing: 1 },
    headerTitle: { fontFamily: "Ezra-Bold", fontSize: 24, color: "#0F172A" },
    headerSubtitle: { color: "#475569", marginTop: 4 },
    discoveryCard: {
        flexDirection: "row",
        gap: 12,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: "#FEEAD1",
        padding: 12,
        backgroundColor: "#FFF9F2",
        alignItems: "center",
    },
    discoveryImage: { width: 72, height: 72, borderRadius: 20 },
    discoveryText: { flex: 1, gap: 4 },
    discoveryTitle: { fontFamily: "Ezra-Bold", color: "#0F172A", fontSize: 16 },
    discoverySubtitle: { color: "#475569", fontFamily: "Ezra-Medium", lineHeight: 18 },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 32,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: "#FFFFFF",
    },
    searchIcon: { width: 20, height: 20, marginRight: 8 },
    searchInput: { flex: 1, fontFamily: "Ezra-Medium", fontSize: 16, color: "#0F172A" },
    sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    sectionHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
    sectionHeading: { fontFamily: "Ezra-Bold", fontSize: 18, color: "#0F172A" },
    sectionMeta: { color: "#94A3B8", fontFamily: "Ezra-Medium", marginTop: 4 },
    restaurantList: { gap: 12 },
    restaurantEmpty: { color: "#94A3B8", fontFamily: "Ezra-Medium" },
    restaurantSkeletonContainer: { gap: 12 },
    restaurantSkeleton: { height: 96, borderRadius: 28, backgroundColor: "#E2E8F0" },
    categoryRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: "#F8FAFC",
        borderBottomWidth: 1,
        borderColor: "#E2E8F0",
    },
    categorySkeletonRow: {
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: "#F8FAFC",
    },
    categoryListContent: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    categorySkeleton: {
        width: 80,
        height: 34,
        borderRadius: 17,
        backgroundColor: "#E2E8F0",
    },
    resultCard: { flexDirection: "row", alignItems: "center", gap: 12 },
    resultTitle: { fontFamily: "Ezra-Bold", fontSize: 18, color: "#0F172A" },
    resultDescription: { color: "#475569" },
    resultMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    resultPrice: { color: "#FF8C42", fontFamily: "Ezra-Bold" },
    resultEta: { color: "#475569", fontFamily: "Ezra-Medium" },
    skeletonContainer: { gap: 12, padding: 20 },
    resultSkeleton: { height: 90, borderRadius: 24, backgroundColor: "#E2E8F0" },
    emptyState: { alignItems: "center", gap: 12, padding: 32 },
    emptyImage: { width: 220, height: 160, borderRadius: 24 },
    emptyTitle: { fontFamily: "Ezra-Bold", fontSize: 18, color: "#0F172A" },
    emptyDescription: { color: "#475569", textAlign: "center" },
    retryButton: {
        marginTop: 8,
        borderRadius: 24,
        backgroundColor: "#FF8C42",
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    retryButtonText: { color: "#fff", fontFamily: "Ezra-SemiBold" },
});

export default Search;

