import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useTheme } from "@/src/theme/themeContext";
import CartButton from "@/components/CartButton";
import RestaurantCard from "@/components/RestaurantCard";
import Icon from "@/components/Icon";
import { images } from "@/constants/mediaCatalog";
import BurgerImg from "@/assets/images/Burger.png";
import DurumImg from "@/assets/images/durum.png";
import TavaImg from "@/assets/images/tava.png";
import FriesImg from "@/assets/images/Fries.png";
import GrillsImg from "@/assets/images/grills.png";
import PastaImg from "@/assets/images/pasta.png";
import DrinksImg from "@/assets/images/drinks.png";
import DietImg from "@/assets/images/diet.png";
import FastfoodImg from "@/assets/images/fastfood.png";
import SaladsImg from "@/assets/images/salads.png";
import { Chip, Stepper, Card } from "@/src/components/componentRegistry";
import { SearchResult, SearchSort } from "@/src/hooks/useSearch";
import { useSearchScreen } from "./hooks/useSearchScreen";

const SORT_OPTIONS: { id: SearchSort; label: string }[] = [
    { id: "relevance", label: "Top match" },
    { id: "eta", label: "Fastest" },
    { id: "price", label: "Budget" },
];

const CATEGORY_ICONS: Record<string, any> = {
    burgers: BurgerImg,
    burger: BurgerImg,
    "burger -ekstralar": FriesImg,
    "burger-extras": FriesImg,
    durumler: DurumImg,
    wraps: DurumImg,
    "fast food menüleri": FastfoodImg,
    "fast-food": FastfoodImg,
    fastfood: FastfoodImg,
    diet: DietImg,
    "diyet menüler": DietImg,
    grills: GrillsImg,
    "ızgara çeşitleri": GrillsImg,
    pasta: PastaImg,
    makarnalar: PastaImg,
    salads: SaladsImg,
    salatalar: SaladsImg,
    pan: TavaImg,
    "tava yemekleri": TavaImg,
    drinks: DrinksImg,
    içecekler: DrinksImg,
};

const parseMoney = (value?: number | string) => {
    const numeric =
        typeof value === "string"
            ? Number(value.replace(/[^\d.,-]/g, "").replace(",", "."))
            : Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatPrice = (value?: number | string) => `TRY ${parseMoney(value).toFixed(2)}`;

const resolveImage = (item: SearchResult) => {
    const raw = (item as any).image_url || (item as any).imageUrl || item.restaurantImage;
    if (typeof raw === "string" && raw.trim()) return { uri: raw };
    if (typeof raw === "number") return raw;
    if (raw && typeof raw === "object" && typeof (raw as any).uri === "string") return raw;
    return images.logo;
};

const getEtaLabel = (item: SearchResult) => {
    const eta =
        (item as any).eta ?? (item as any).deliveryTime ?? (item as any).delivery_time ?? (item as any).duration;
    if (typeof eta === "number" && Number.isFinite(eta)) return `${eta} dk`;
    if (typeof eta === "string" && eta.trim()) return eta;
    return null;
};

const SearchBar = ({
    value,
    onDebouncedChange,
    onSubmit,
    loading,
}: {
    value: string;
    onDebouncedChange: (text: string) => void;
    onSubmit: (text: string) => void;
    loading?: boolean;
}) => {
    const { theme } = useTheme();
    const [text, setText] = useState(value);

    useEffect(() => setText(value), [value]);

    useEffect(() => {
        const timer = setTimeout(() => onDebouncedChange(text), 200);
        return () => clearTimeout(timer);
    }, [text, onDebouncedChange]);

    return (
        <View style={[styles.searchBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <Icon name="search" size={18} color={theme.colors.muted} />
            <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Search by meal, ingredient, or place"
                placeholderTextColor={theme.colors.muted}
                style={[styles.searchInput, { color: theme.colors.ink }]}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => onSubmit(text)}
            />
            {loading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : text ? (
                <TouchableOpacity onPress={() => setText("")} hitSlop={10}>
                    <Icon name="close" size={16} color={theme.colors.muted} />
                </TouchableOpacity>
            ) : null}
        </View>
    );
};

const RecentSearches = ({
    items,
    onSelect,
    onClear,
}: {
    items: string[];
    onSelect: (value: string) => void;
    onClear: () => void;
}) => {
    const { theme } = useTheme();
    if (!items.length) return null;
    return (
        <View style={{ gap: 8 }}>
            <View style={styles.recentHeader}>
                <Text style={[styles.recentLabel, { color: theme.colors.muted }]}>Recent searches</Text>
                <TouchableOpacity onPress={onClear} hitSlop={8}>
                    <Text style={[styles.recentClear, { color: theme.colors.primary }]}>Clear</Text>
                </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentChips}>
                {items.map((entry) => (
                    <Chip key={entry} label={entry} onPress={() => onSelect(entry)} />
                ))}
            </ScrollView>
        </View>
    );
};

const ResultCard = ({
    item,
    quantity,
    onQuantityChange,
}: {
    item: SearchResult;
    quantity: number;
    onQuantityChange: (value: number) => void;
}) => {
    const { theme } = useTheme();
    const eta = getEtaLabel(item);
    const category = item.categories?.[0];

    return (
        <Card style={[styles.resultCard, { borderColor: theme.colors.border }]} elevation={2}>
            <View style={styles.resultImageShell}>
                <Image source={resolveImage(item)} style={styles.resultImage} contentFit="cover" />
                {eta ? (
                    <View style={[styles.resultBadge, { backgroundColor: `${theme.colors.surface}DD` }]}>
                        <Icon name="clock" size={12} color={theme.colors.primary} />
                        <Text style={[styles.resultBadgeText, { color: theme.colors.ink }]}>{eta}</Text>
                    </View>
                ) : null}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.resultTitle, { color: theme.colors.ink }]} numberOfLines={2}>
                    {item.name}
                </Text>
                <Text style={[styles.resultSubtitle, { color: theme.colors.muted }]} numberOfLines={1}>
                    {item.restaurantName || "Campus kitchen"}
                </Text>
                {item.description ? (
                    <Text style={[styles.resultDescription, { color: theme.colors.muted }]} numberOfLines={2}>
                        {item.description}
                    </Text>
                ) : null}

                <View style={styles.resultMetaRow}>
                    <View style={[styles.metaPill, { backgroundColor: `${theme.colors.border}70` }]}>
                        <Icon name="star" size={12} color="#FFB703" />
                        <Text style={[styles.metaText, { color: theme.colors.ink }]}>
                            {(item.restaurantRating ?? 4.5).toFixed(1)}
                        </Text>
                    </View>
                    {category ? (
                        <View style={[styles.metaPill, { backgroundColor: `${theme.colors.border}70` }]}>
                            <Text style={[styles.metaText, { color: theme.colors.ink }]}>{category}</Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.resultFooter}>
                    <View style={[styles.pricePill, { backgroundColor: `${theme.colors.border}70` }]}>
                        <Text style={[styles.priceText, { color: theme.colors.ink }]}>{formatPrice(item.price)}</Text>
                        <View style={styles.dot} />
                        <Text style={[styles.priceSub, { color: theme.colors.muted }]}>Add & customize</Text>
                    </View>
                    <Stepper value={quantity} min={0} max={10} onChange={onQuantityChange} />
                </View>
            </View>
        </Card>
    );
};

const Search = () => {
    const { theme } = useTheme();
    const {
        query,
        setQuery,
        category,
        sort,
        setSort,
        categories,
        loading,
        restaurantsLoading,
        activeTab,
        setActiveTab,
        recentSearches,
        persistRecent,
        clearRecents,
        refreshing,
        handleRefresh,
        restaurantSection,
        mealSections,
        totalMeals,
        activeCategory,
        setActiveCategory,
        selectedRestaurantId,
        selectedRestaurantName,
        selectRestaurant,
        handleQuantityChange,
        getQuantity,
    } = useSearchScreen();

    const renderRestaurantsTab = () => {
        if (restaurantsLoading) {
            return (
                <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.colors.primary} />
                </View>
            );
        }
        if (!restaurantSection.length) {
            return (
                <View style={styles.emptyContainer}>
                    <Image source={images.deliveryProcess} style={styles.emptyImage} contentFit="cover" />
                    <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>Restoran bulunamadı</Text>
                </View>
            );
        }
        return (
            <View style={{ gap: 12 }}>
                {restaurantSection[0].data.map((restaurant: any, idx: number) => (
                    <RestaurantCard
                        key={String(restaurant.id ?? idx)}
                        restaurant={restaurant}
                        onPress={() => {
                            selectRestaurant(restaurant);
                        }}
                    />
                ))}
            </View>
        );
    };

    const renderMealsTab = () => {
        if (!mealSections.length) {
            return (
                <View style={styles.emptyContainer}>
                    <Image source={images.deliveryReview} style={styles.emptyImage} contentFit="cover" />
                    <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>Yemek bulunamadı</Text>
                </View>
            );
        }

        const activeSection = mealSections.find((s) => s.title === activeCategory) ?? mealSections[0];

        return (
            <View style={{ gap: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabs}>
                    {mealSections.map((section) => {
                        const active = section.title === activeSection.title;
                        const key = section.title.toLowerCase();
                        const icon = CATEGORY_ICONS[key];
                        return (
                            <TouchableOpacity
                                key={section.title}
                                onPress={() => setActiveCategory(section.title)}
                                style={[
                                    styles.tabButton,
                                    {
                                        borderColor: active ? theme.colors.primary : theme.colors.border,
                                        backgroundColor: active ? `${theme.colors.primary}15` : theme.colors.surface,
                                        paddingHorizontal: 14,
                                    },
                                ]}
                            >
                                <View style={styles.tabChipContent}>
                                    {icon ? <Image source={icon} style={styles.tabIcon} contentFit="contain" /> : null}
                                    <Text style={[styles.tabText, { color: active ? theme.colors.primary : theme.colors.ink }]}>
                                        {section.title}
                                    </Text>
                                </View>
                                <Text style={[styles.tabMeta, { color: theme.colors.muted }]}>{section.count} sonuç</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={{ gap: 10 }}>
                    {activeSection.data.map((item: SearchResult, idx: number) => (
                        <ResultCard
                            key={String(item.$id ?? item.id ?? idx)}
                            item={item}
                            quantity={getQuantity(String(item.$id ?? item.id))}
                            onQuantityChange={(value) => handleQuantityChange(item, value)}
                        />
                    ))}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.surface }]}>
            <ScrollView
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
            >
                <View style={styles.pageHeader}>
                    <View>
                        <Text style={[styles.pageTitle, { color: theme.colors.ink }]}>Hungrie Search</Text>
                        <Text style={[styles.pageSubtitle, { color: theme.colors.muted }]}>
                            Yemekleri kategoriye göre listele, restoranları ayrı gör.
                        </Text>
                    </View>
                    <CartButton />
                </View>

                <View style={styles.headerCard}>
                    <SearchBar
                        value={query}
                        loading={loading}
                        onDebouncedChange={(text) => {
                            setQuery(text);
                            if (text.trim().length >= 2) persistRecent(text);
                        }}
                        onSubmit={(text) => persistRecent(text)}
                    />
                    <RecentSearches items={recentSearches} onSelect={(text) => setQuery(text)} onClear={clearRecents} />
                </View>

                <View style={styles.tabRow}>
                    {(["restaurants", "meals"] as const).map((tab) => {
                        const label =
                            tab === "restaurants"
                                ? `Restoranlar (${restaurantSection[0]?.count || 0})`
                                : `Yemekler (${totalMeals})`;
                        const active = activeTab === tab;
                        const disabled = tab === "meals" && !selectedRestaurantId;
                        return (
                            <TouchableOpacity
                                key={tab}
                                onPress={() => {
                                    if (disabled) return;
                                    setActiveTab(tab);
                                }}
                                style={[
                                    styles.tabButton,
                                    {
                                        borderColor: active ? theme.colors.primary : theme.colors.border,
                                        backgroundColor: active ? `${theme.colors.primary}15` : theme.colors.surface,
                                        opacity: disabled ? 0.4 : 1,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.tabText,
                                        { color: active ? theme.colors.primary : disabled ? theme.colors.muted : theme.colors.ink },
                                    ]}
                                >
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {activeTab === "restaurants" ? renderRestaurantsTab() : selectedRestaurantId ? renderMealsTab() : null}

                {!loading && !restaurantSection.length && !mealSections.length ? (
                    <View style={styles.emptyContainer}>
                        <Image source={images.deliveryReview} style={styles.emptyImage} contentFit="cover" />
                        <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>Sonuç bulunamadı</Text>
                        <Text style={[styles.emptySubtitle, { color: theme.colors.muted }]}>
                            Kelimeyi değiştir veya kategoriyi kaldır.
                        </Text>
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    pageHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    pageTitle: { fontFamily: "Ezra-Bold", fontSize: 22 },
    pageSubtitle: { fontFamily: "Ezra-Medium", fontSize: 13 },
    listContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 16 },
    headerCard: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 18,
    },
    searchInput: { flex: 1, fontFamily: "Ezra-Medium", fontSize: 16 },
    sortContent: { gap: 8, paddingRight: 4 },
    categoryRow: { gap: 8, paddingVertical: 6, paddingRight: 6 },
    categorySkeletonRow: { flexDirection: "row", gap: 10 },
    categorySkeleton: { width: 90, height: 34, borderRadius: 17, backgroundColor: "#E2E8F0" },
    recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    recentLabel: { fontFamily: "Ezra-SemiBold", fontSize: 12 },
    recentClear: { fontFamily: "Ezra-SemiBold", fontSize: 12 },
    recentChips: { gap: 8 },
    tabRow: { flexDirection: "row", gap: 10, paddingHorizontal: 4, paddingBottom: 8 },
    tabButton: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
    tabText: { fontFamily: "Ezra-Bold", fontSize: 14 },
    tabMeta: { fontFamily: "Ezra-Medium", fontSize: 12 },
    categoryTabs: { gap: 10, paddingHorizontal: 4, paddingBottom: 4 },
    tabChipContent: { flexDirection: "row", alignItems: "center", gap: 6 },
    tabIcon: { width: 20, height: 20 },
    sectionContainer: { paddingHorizontal: 16, gap: 8 },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    sectionTitle: { fontFamily: "Ezra-Bold", fontSize: 16 },
    sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    sectionBadgeText: { fontFamily: "Ezra-Bold", fontSize: 12 },
    resultCard: {
        flexDirection: "row",
        gap: 12,
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
    },
    resultImageShell: { width: 90, height: 90, borderRadius: 16, overflow: "hidden" },
    resultImage: { width: "100%", height: "100%" },
    resultBadge: {
        position: "absolute",
        top: 8,
        left: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    resultBadgeText: { fontFamily: "Ezra-SemiBold", fontSize: 12 },
    resultTitle: { fontFamily: "Ezra-Bold", fontSize: 16 },
    resultSubtitle: { fontFamily: "Ezra-Medium", fontSize: 13 },
    resultDescription: { fontFamily: "Ezra-Medium", fontSize: 13 },
    resultMetaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    metaPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    metaText: { fontFamily: "Ezra-Medium", fontSize: 12 },
    resultFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    pricePill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
    priceText: { fontFamily: "Ezra-Bold", fontSize: 14 },
    priceSub: { fontFamily: "Ezra-Medium", fontSize: 12 },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#94A3B8" },
    loadingRow: { paddingVertical: 16, alignItems: "center" },
    emptyContainer: { alignItems: "center", gap: 10, padding: 40 },
    emptyImage: { width: 220, height: 160, borderRadius: 20 },
    emptyTitle: { fontFamily: "Ezra-Bold", fontSize: 18 },
    emptySubtitle: { fontFamily: "Ezra-Medium", textAlign: "center" },
});

export default Search;
