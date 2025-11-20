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
import { useLocalSearchParams } from "expo-router";
import CartButton from "@/components/CartButton";
import { images } from "@/constants";
import useAppwrite from "@/lib/useAppwrite";
import { getCategories } from "@/lib/firebaseAuth";
import type { MenuItem } from "@/type";
import { Chip, Stepper, Card } from "@/src/components";
import useSearch, { SearchSort } from "@/src/hooks/useSearch";
import { useCartStore } from "@/store/cart.store";

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
            <Image source={images.search} style={styles.searchIcon} contentFit="contain" />
            <TextInput
                placeholder="Search for pizzas, burgers..."
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
    const { query: initialQuery, category: initialCategory } = useLocalSearchParams<{ query?: string; category?: string }>();
    const {
        query,
        setQuery,
        category,
        setCategory,
        sort,
        setSort,
        results,
        loading,
        error,
        refetch,
    } = useSearch({
        initialQuery: typeof initialQuery === "string" ? initialQuery : "",
        initialCategory: typeof initialCategory === "string" ? initialCategory : undefined,
    });
    const { data: categoriesData, loading: categoriesLoading } = useAppwrite({ fn: getCategories });
    const { items, addItem, increaseQty, decreaseQty, removeItem } = useCartStore();

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
                    <Image source={images.emptyState} style={styles.emptyImage} contentFit="contain" />
                    <Text style={styles.emptyTitle}>Bir şeyler ters gitti</Text>
                    <Text style={styles.emptyDescription}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={refetch}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        if (showEmpty) {
            return (
                <View style={styles.emptyState}>
                    <Image source={images.emptyState} style={styles.emptyImage} contentFit="contain" />
                    <Text style={styles.emptyTitle}>No meals found</Text>
                    <Text style={styles.emptyDescription}>Try adjusting your search or filters.</Text>
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
                                <Text style={styles.headerSubtitle}>Filters update results instantly</Text>
                            </View>
                            <CartButton />
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
    headerEyebrow: { color: "#FF8C42", fontFamily: "QuickSand-SemiBold", fontSize: 12, letterSpacing: 1 },
    headerTitle: { fontFamily: "QuickSand-Bold", fontSize: 24, color: "#0F172A" },
    headerSubtitle: { color: "#475569", marginTop: 4 },
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
    searchInput: { flex: 1, fontFamily: "QuickSand-Medium", fontSize: 16, color: "#0F172A" },
    sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
    resultTitle: { fontFamily: "QuickSand-Bold", fontSize: 18, color: "#0F172A" },
    resultDescription: { color: "#475569" },
    resultMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    resultPrice: { color: "#FF8C42", fontFamily: "QuickSand-Bold" },
    resultEta: { color: "#475569", fontFamily: "QuickSand-Medium" },
    skeletonContainer: { gap: 12, padding: 20 },
    resultSkeleton: { height: 90, borderRadius: 24, backgroundColor: "#E2E8F0" },
    emptyState: { alignItems: "center", gap: 12, padding: 32 },
    emptyImage: { width: 160, height: 160 },
    emptyTitle: { fontFamily: "QuickSand-Bold", fontSize: 18, color: "#0F172A" },
    emptyDescription: { color: "#475569", textAlign: "center" },
    retryButton: {
        marginTop: 8,
        borderRadius: 24,
        backgroundColor: "#FF8C42",
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    retryButtonText: { color: "#fff", fontFamily: "QuickSand-SemiBold" },
});

export default Search;
