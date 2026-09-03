// /(tabs)/search/index.tsx — V3 (Professional: Big 2 buttons + Restaurants 2x2 grid)

import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { useMemo } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

import Icon from "@/components/Icon";
import { Chip, Stepper } from "@/src/components/componentRegistry";
import type { SearchResult } from "@/src/hooks/useSearch";

import { useSearchScreenV3 } from "@/src/hooks/useSearchScreenV3";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import { useTheme } from "@/src/theme/themeContext";

//restaurant logos (assets/restaurantlogo)
import AdaPizzaLogo from "@/assets/restaurantlogo/adapizzalogo.jpg";
import AlaCarteLogo from "@/assets/restaurantlogo/alacartelogo.jpg";
import LavishLogo from "@/assets/restaurantlogo/lavishlogo.jpg";
import MunchiesLogo from "@/assets/restaurantlogo/munchieslogo.jpg";
import RootLogo from "@/assets/restaurantlogo/rootlogo.jpg";
import LombardLogo from "@/assets/restaurantlogo/lombardlogo.jpg";
import BurgerHouseLogo from "@/assets/restaurantlogo/burgerhouselogo.jpg";
import VoyLogo from "@/assets/restaurantlogo/voylogo.jpg";
import ErtoLogo from "@/assets/restaurantlogo/ertologo.jpg";

const BRAND = {
    bgTop: "#FFF7EF",
    bgBottom: "#FFFEFC",

    surface: "#FFFFFF",
    soft: "#FFF1E6",

    accent: "#D94F23",
    accent2: "#F08A2B",

    ink: "#1F120B",
    muted: "rgba(31,18,11,0.62)",
    muted2: "rgba(31,18,11,0.46)",
};

const R = { xl: 28, lg: 22, md: 18, sm: 14 };
const S = { xl: 22, lg: 16, md: 14, sm: 10, xs: 6 };

const RESTAURANT_LOGOS = {
    adapizza: AdaPizzaLogo,
    alacarte: AlaCarteLogo,
    lavish: LavishLogo,
    munchies: MunchiesLogo,
    root: RootLogo,
    lombard: LombardLogo,
    burgerhouse: BurgerHouseLogo,
    voy: VoyLogo,
    erto: ErtoLogo,
} as const;

type RestaurantKey = keyof typeof RESTAURANT_LOGOS;

const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const RESTAURANT_KEY_MAP: Record<string, RestaurantKey> = {
    adapizza: "adapizza",
    alacarte: "alacarte",
    alacartecafe: "alacarte",
    lavish: "lavish",
    munchies: "munchies",
    root: "root",
    rootkitchencoffee: "root",
    lombard: "lombard",
    lombardkitchen: "lombard",
    burgerhouse: "burgerhouse",
    voy: "voy",
    erto: "erto",
    ertocafe: "erto",
};

const resolveRestaurantKey = (input?: any): RestaurantKey | null => {
    const candidates = [
        input?.slug,
        input?.code,
        input?.alias,
        input?.handle,
        typeof input?.id === "string" ? input.id : undefined,
        typeof input?.$id === "string" ? input.$id : undefined,
        input?.name,
        typeof input === "string" ? input : undefined,
    ];

    for (const c of candidates) {
        if (typeof c !== "string") continue;
        const k = normalize(c);
        if (!k) continue;
        if (RESTAURANT_KEY_MAP[k]) return RESTAURANT_KEY_MAP[k];
        if ((RESTAURANT_LOGOS as any)[k]) return k as RestaurantKey;
    }
    return null;
};

const formatPrice = (value?: number | string) => {
    if (value === undefined || value === null) return "₺0.00";
    const parsed =
        typeof value === "string"
            ? Number(value.replace(/[^\d.,-]/g, "").replace(",", "."))
            : Number(value);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    return `₺${amount.toFixed(2)}`;
};

const isBadUri = (u: string) => {
    const v = u.trim().toLowerCase();
    return !v || v === "null" || v === "undefined" || v === "nan";
};

const isValidUri = (u: string) => {
    const v = u.trim();
    if (isBadUri(v)) return false;
    return (
        v.startsWith("http://") ||
        v.startsWith("https://") ||
        v.startsWith("file://") ||
        v.startsWith("content://") ||
        v.startsWith("data:image/")
    );
};

const cardShadow = makeShadow({ color: "#000", offsetY: 12, blurRadius: 24, opacity: 0.1, elevation: 6 });

const SearchInput = ({
    value,
    onChange,
    onSubmit,
    loading,
    onClear,
    placeholder,
}: {
    value: string;
    onChange: (t: string) => void;
    onSubmit: () => void;
    loading?: boolean;
    onClear: () => void;
    placeholder: string;
}) => {
    const { theme } = useTheme();
    return (
    <View style={[styles.searchBar, { backgroundColor: theme.colors.input, borderColor: theme.colors.border }]}>
        <Ionicons name="search-outline" size={22} color={theme.colors.textSecondary} />
        <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.muted}
            style={[styles.searchInput, { color: theme.colors.ink }]}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={onSubmit}
        />
        {loading ? (
            <ActivityIndicator size="small" color={BRAND.accent} />
        ) : value ? (
            <Pressable onPress={onClear} hitSlop={10} style={styles.searchAction}>
                <Ionicons name="close-outline" size={18} color={theme.colors.muted} />
            </Pressable>
        ) : null}
    </View>
    );
};

const SegmentButtons = ({
    value,
    onChange,
    mealsLabel,
    restaurantsLabel,
}: {
    value: "meals" | "restaurants";
    onChange: (v: "meals" | "restaurants") => void;
    mealsLabel: string;
    restaurantsLabel: string;
}) => {
    const { theme } = useTheme();
    return (
    <View style={styles.segmentRow}>
        {(["meals", "restaurants"] as const).map((k) => {
            const active = value === k;
            const label = k === "meals" ? mealsLabel : restaurantsLabel;

            return (
                <Pressable
                    key={k}
                    onPress={() => onChange(k)}
                    style={({ pressed }) => [
                        styles.segmentBtnWrap,
                        pressed ? { transform: [{ scale: 0.99 }], opacity: 0.98 } : null,
                    ]}
                >
                    <LinearGradient
                        colors={active ? [BRAND.accent, BRAND.accent2] : [theme.colors.surface, theme.colors.surface]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.segmentBtn, !active && { borderColor: theme.colors.border }]}
                    >
                        <View style={styles.segmentInner}>
                            <Ionicons
                                name={k === "meals" ? "restaurant-outline" : "storefront-outline"}
                                size={18}
                                color={active ? "#FFFFFF" : theme.colors.ink}
                            />
                            <Text style={[styles.segmentText, active ? { color: "#fff" } : { color: theme.colors.ink }]}>
                                {label}
                            </Text>
                        </View>
                    </LinearGradient>
                </Pressable>
            );
        })}
    </View>
    );
};

const LogoCircle = ({ target, size = 46 }: { target: any; size?: number }) => {
    const { theme } = useTheme();
    const key = resolveRestaurantKey(target);
    const logo = key ? RESTAURANT_LOGOS[key] : null;

    const initials = String(target?.name ?? target ?? "H")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase();

    return (
        <View style={[styles.logoWrap, { width: size, height: size, borderRadius: size / 2 }]}>
            <LinearGradient
                colors={[theme.colors.surfaceElevated, theme.colors.surfaceMuted]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
            />
            <View style={[styles.logoRing, { borderRadius: size / 2 }]} />
            {logo ? (
                <Image source={logo} style={{ width: size - 14, height: size - 14 }} contentFit="contain" />
            ) : (
                <Text style={styles.logoFallback}>{initials || "H"}</Text>
            )}
        </View>
    );
};

const MealCard = ({
    item,
    quantity,
    onQuantityChange,
}: {
    item: SearchResult;
    quantity: number;
    onQuantityChange: (n: number) => void;
}) => {
    const { theme } = useTheme();
    const raw =
        (item as any).image_url ||
        (item as any).imageUrl ||
        (item as any).image ||
        (item as any).photo ||
        (item as any).restaurantImage;

    const src =
        typeof raw === "number"
            ? raw
            : typeof raw === "string" && isValidUri(raw)
                ? { uri: raw.trim() }
                : null;

    return (
        <View style={[styles.card, styles.mealRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {src ? <Image source={src} style={styles.mealImg} contentFit="cover" /> : <View style={styles.mealImgFallback} />}

            <View style={styles.mealContent}>
                <View style={styles.mealHeaderRow}>
                    <View style={styles.mealCopy}>
                        <Text style={[styles.mealTitle, { color: theme.colors.ink }]} numberOfLines={1}>
                            {item.name}
                        </Text>
                        <Text style={[styles.mealSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                            {item.restaurantName || ""}
                        </Text>
                    </View>
                    <Text style={styles.price}>{formatPrice(item.price)}</Text>
                </View>

                <View style={styles.rowBottom}>
                    <View />
                    {quantity > 0 ? (
                        <Stepper value={quantity} min={0} max={10} onChange={onQuantityChange} />
                    ) : (
                        <Pressable onPress={() => onQuantityChange(1)} style={styles.addBtn} hitSlop={8}>
                            <LinearGradient
                                colors={[BRAND.accent, BRAND.accent2]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.addCircle}
                            >
                                <Text style={styles.addText}>+</Text>
                            </LinearGradient>
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
};

const RestaurantCard = ({
    restaurant,
    onPress,
    cuisineFallback,
    ctaLabel,
}: {
    restaurant: any;
    onPress: () => void;
    cuisineFallback: string;
    ctaLabel: string;
}) => {
    const { theme } = useTheme();
    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.restaurantCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && { opacity: 0.98 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <LogoCircle target={restaurant} size={46} />
                <View style={styles.restaurantTextWrap}>
                    <Text style={[styles.rName, { color: theme.colors.ink }]} numberOfLines={1}>
                        {restaurant.name}
                    </Text>
                    <Text style={[styles.rCuisine, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                        {restaurant.cuisine || cuisineFallback}
                    </Text>
                </View>
            </View>

            <View style={styles.goPill}>
                <Text style={styles.goPillText}>{ctaLabel}</Text>
                <Icon name="arrowDown" size={12} color={BRAND.accent} style={{ transform: [{ rotate: "-90deg" }] }} />
            </View>
        </Pressable>
    );
};

const EmptyState = ({ title, description }: { title: string; description: string }) => {
    const { theme } = useTheme();
    return (
        <View style={[styles.card, styles.empty, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceMuted }]}>
                <Icon name="search" size={18} color={theme.colors.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>{title}</Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>{description}</Text>
        </View>
    );
};

export default function Search() {
    const { theme, variant } = useTheme();
    useWebDocumentTitle();
    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useBottomTabBarHeight();

    const {
        query,
        setQuery,

        segment,
        setSegment,

        mealsFlat,
        restaurantsGrid,

        loading,
        restaurantsLoading,

        recentSearches,
        persistRecent,
        clearRecents,

        refreshing,
        handleRefresh,

        getCartId,
        getQuantity,
        handleQuantityChange,

        submitQuery,
        clearAll,
    } = useSearchScreenV3();

    const data = useMemo(() => (segment === "meals" ? mealsFlat : restaurantsGrid), [mealsFlat, restaurantsGrid, segment]);
    const padBottom = tabBarHeight + insets.bottom + 18;

const goRestaurant = (restaurant: any, index: number) => {
    const primary = restaurant?.id ?? restaurant?.$id;
    const target = primary ? String(primary) : resolveRestaurantKey(restaurant) ?? String(restaurant?.slug ?? restaurant?.code ?? restaurant?.name ?? index);
    router.push({
        pathname: "/restaurants/[id]",
        params: { id: target },
    });
};

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
            <LinearGradient
                colors={variant === "dark" ? [theme.colors.background, theme.colors.surface] : [BRAND.bgTop, BRAND.bgBottom]}
                style={{ flex: 1 }}
            >
                {/* ===== Header (clean) ===== */}
                <View style={styles.header}>
                    <View style={styles.topRow}>
                        <View>
                            <Text style={[styles.topTitle, { color: theme.colors.ink }]}>{t("search.title")}</Text>
                        </View>
                    </View>

                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        onSubmit={submitQuery}
                        loading={loading}
                        onClear={clearAll}
                        placeholder={t("search.placeholder")}
                    />

                    <SegmentButtons
                        value={segment}
                        onChange={setSegment}
                        mealsLabel={t("search.tabs.meals")}
                        restaurantsLabel={t("search.tabs.restaurants")}
                    />
                </View>

                {/* ===== List ===== */}
                <FlatList
                    key={segment} // numColumns değişince layout stabil
                    data={data as any[]}
                    numColumns={segment === "restaurants" ? 2 : 1}
                    keyExtractor={(item: any, idx) => {
                        if (segment === "meals") return getCartId(item as SearchResult);
                        return String(item?.id ?? item?.$id ?? item?.slug ?? item?.code ?? item?.name ?? idx);
                    }}
                    contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: padBottom, paddingTop: 6 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND.accent} />}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={
                        !query.trim() && recentSearches.length ? (
                            <View style={{ gap: 10, marginBottom: 14 }}>
                                <View style={styles.sectionHeader}>
                                    <Text style={[styles.sectionTitle, { color: theme.colors.ink }]}>{t("search.recentLabel")}</Text>
                                    <Pressable onPress={clearRecents} hitSlop={10}>
                                        <Text style={styles.linkText}>{t("search.clear")}</Text>
                                    </Pressable>
                                </View>

                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                                    {recentSearches.map((t) => (
                                        <Chip
                                            key={t}
                                            label={t}
                                            onPress={() => {
                                                setQuery(t);
                                                persistRecent(t);
                                            }}
                                        />
                                    ))}
                                </View>
                            </View>
                        ) : null
                    }
                    ListEmptyComponent={
                        !loading && !restaurantsLoading ? (
                            <EmptyState title={t("search.empty.title")} description={t("search.empty.body")} />
                        ) : (
                            <View style={{ paddingVertical: 18, alignItems: "center" }}>
                                <ActivityIndicator color={BRAND.accent} />
                            </View>
                        )
                    }
                    renderItem={({ item, index }) => {
                        if (segment === "restaurants") {
                            return (
                                <View style={{ flex: 1, marginRight: index % 2 === 0 ? 12 : 0, marginBottom: 12 }}>
                                    <RestaurantCard
                                        restaurant={item}
                                        onPress={() => goRestaurant(item, index)}
                                        cuisineFallback={t("search.cuisineFallback")}
                                        ctaLabel={t("search.openCta")}
                                    />
                                </View>
                            );
                        }

                        const cartId = getCartId(item as SearchResult);
                        const qty = getQuantity(cartId);

                        return (
                            <View style={{ marginBottom: 12 }}>
                                <MealCard
                                    item={item as SearchResult}
                                    quantity={qty}
                                    onQuantityChange={(n) => handleQuantityChange(item as SearchResult, n)}
                                />
                            </View>
                        );
                    }}
                />
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = createAdaptiveStyleSheet({
    safeArea: { flex: 1, backgroundColor: BRAND.bgTop },

    header: {
        paddingHorizontal: S.lg,
        paddingTop: 8,
        paddingBottom: 12,
        gap: 14,
    },

    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    topTag: { fontFamily: "ChairoSans", color: BRAND.muted2, letterSpacing: 1.2 },
    topTitle: { fontFamily: "ChairoSans", fontSize: 30, color: BRAND.ink, letterSpacing: -0.5 },

    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 18,
        height: 54,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.96)",
        borderWidth: 1,
        borderColor: "rgba(31,18,11,0.06)",
        ...(cardShadow as object),
    },
    searchInput: { flex: 1, fontFamily: "ChairoSans", fontSize: 16, color: BRAND.ink },
    searchAction: {
        width: 28,
        alignItems: "center",
        justifyContent: "center",
    },

    segmentRow: { flexDirection: "row", gap: 12 },
    segmentBtnWrap: { flex: 1, borderRadius: 18, overflow: "hidden" },
    segmentBtn: {
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0)",
        alignItems: "center",
        justifyContent: "center",
        ...(cardShadow as object),
    },
    segmentInner: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    segmentText: { fontFamily: "ChairoSans", fontSize: 15, lineHeight: 18, letterSpacing: -0.2, textAlign: "center" },

    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: { fontFamily: "ChairoSans", fontSize: 18, color: BRAND.ink, letterSpacing: -0.2 },
    linkText: { fontFamily: "ChairoSans", fontSize: 12, color: BRAND.muted },

    card: {
        backgroundColor: BRAND.surface,
        borderRadius: R.lg,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(31,18,11,0.06)",
        ...(cardShadow as object),
    },

    logoWrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
    logoRing: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: "rgba(217,79,35,0.12)" },
    logoFallback: { fontFamily: "ChairoSans", fontSize: 16, color: BRAND.accent },

    mealRow: {
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    mealImg: { width: 88, height: 88, borderRadius: 18, backgroundColor: BRAND.soft },
    mealImgFallback: {
        width: 88,
        height: 88,
        borderRadius: 18,
        backgroundColor: BRAND.soft,
    },
    mealContent: {
        flex: 1,
        minWidth: 0,
        justifyContent: "space-between",
        gap: 12,
    },
    mealHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
    },
    mealCopy: {
        flex: 1,
        minWidth: 0,
        gap: 4,
    },
    mealTitle: { fontFamily: "ChairoSans", fontSize: 16, color: BRAND.ink },
    mealSub: { fontFamily: "ChairoSans", fontSize: 12, color: BRAND.muted },
    rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    price: { fontFamily: "ChairoSans", fontSize: 14, color: BRAND.accent, flexShrink: 0 },

    addBtn: { borderRadius: 20, overflow: "hidden" },
    addCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
    addText: {
        color: "#fff",
        fontSize: 18,
        lineHeight: 18,
        fontFamily: "ChairoSans",
        textAlign: "center",
        marginTop: Platform.OS === "android" ? -2 : -1,
        includeFontPadding: false,
        textAlignVertical: "center",
    },

    restaurantCard: {
        padding: 14,
        gap: 12,
        justifyContent: "space-between",
        minHeight: 110,
    },
    restaurantTextWrap: {
        flex: 1,
        minWidth: 0,
        gap: 4,
    },
    rName: { fontFamily: "ChairoSans", fontSize: 14, color: BRAND.ink },
    rCuisine: { fontFamily: "ChairoSans", fontSize: 12, color: BRAND.muted, lineHeight: 16 },
    goPill: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        height: 30,
        borderRadius: 999,
        backgroundColor: "rgba(255,241,230,0.9)",
        borderWidth: 1,
        borderColor: "rgba(217,79,35,0.14)",
    },
    goPillText: { fontFamily: "ChairoSans", fontSize: 12, color: BRAND.accent },

    empty: { padding: 18, borderRadius: R.xl, alignItems: "center", gap: 8 },
    emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.soft, alignItems: "center", justifyContent: "center" },
    emptyTitle: { fontFamily: "ChairoSans", fontSize: 16, color: BRAND.ink },
    emptyDesc: { fontFamily: "ChairoSans", fontSize: 12, color: BRAND.muted, textAlign: "center" },
});
