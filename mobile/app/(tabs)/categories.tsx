import { useMemo, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { CATEGORY_CARDS } from "@/src/lib/categoryCards";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import { useTheme } from "@/src/theme/themeContext";

const COLORS = {
    bgTop: "#FFFAF6",
    bgBottom: "#FFF4EB",
    ink: "#18233A",
    muted: "#98A0AF",
    line: "#DFE4EC",
    card: "#FFFFFF",
    accent: "#F28C28",
};

const cardShadow = makeShadow({
    color: "#8B6D55",
    offsetY: 10,
    blurRadius: 22,
    opacity: Platform.OS === "ios" ? 0.08 : 0.12,
    elevation: 4,
});

export default function CategoriesScreen() {
    useWebDocumentTitle();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useBottomTabBarHeight();
    const { i18n } = useTranslation();
    const { theme, variant } = useTheme();
    const isTurkish = i18n.language?.startsWith("tr");
    const [query, setQuery] = useState("");

    const categories = useMemo(
        () =>
            CATEGORY_CARDS.map((item) => ({
                ...item,
                label: isTurkish ? item.tr : item.en,
            })),
        [isTurkish],
    );

    const visibleCategories = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US");
        if (!normalizedQuery) return categories;
        return categories.filter((category) =>
            category.label.toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US").includes(normalizedQuery),
        );
    }, [categories, isTurkish, query]);

    const openCategory = (category: (typeof categories)[number]) => {
        router.push({
            pathname: "/search",
            params: { query: category.label, category: category.searchKey, refresh: String(Date.now()) },
        });
    };

    return (
        <LinearGradient colors={variant === "dark" ? [theme.colors.background, theme.colors.surface] : [COLORS.bgTop, COLORS.bgBottom]} style={styles.screen}>
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={31} color={theme.colors.ink} />
                    </Pressable>
                    <Text maxFontSizeMultiplier={1.05} style={[styles.title, { color: theme.colors.ink }]}>
                        {isTurkish ? "Kategoriler" : "Categories"}
                    </Text>
                    <View style={styles.headerSpacer} />
                </View>

                <View style={[styles.searchBar, { backgroundColor: theme.colors.input, borderColor: theme.colors.border }]}>
                    <Ionicons name="search-outline" size={28} color="#7D8594" />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={isTurkish ? "Kategori ara" : "Search category"}
                        placeholderTextColor={theme.colors.muted}
                        style={[styles.searchInput, { color: theme.colors.ink }]}
                        returnKeyType="search"
                        autoCorrect={false}
                        maxFontSizeMultiplier={1.05}
                    />
                    {query ? (
                        <Pressable onPress={() => setQuery("")} hitSlop={10}>
                            <Ionicons name="close-circle" size={22} color={COLORS.muted} />
                        </Pressable>
                    ) : null}
                </View>

                <FlatList
                    data={visibleCategories}
                    keyExtractor={(item) => item.id}
                    numColumns={3}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        styles.listContent,
                        { paddingBottom: Math.max(tabBarHeight + insets.bottom + 24, 112) },
                    ]}
                    columnWrapperStyle={styles.gridRow}
                    ListHeaderComponent={
                        <Text maxFontSizeMultiplier={1.05} style={[styles.sectionTitle, { color: theme.colors.ink }]}>
                            {isTurkish ? "Tüm kategoriler" : "All categories"}
                        </Text>
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text maxFontSizeMultiplier={1.05} style={styles.emptyText}>
                                {isTurkish ? "Kategori bulunamadı" : "No categories found"}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <Pressable onPress={() => openCategory(item)} style={styles.cardPressable}>
                            {({ pressed }) => (
                                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed ? styles.cardPressed : null]}>
                                    <Image source={item.image} style={styles.categoryImage} contentFit="contain" transition={120} />
                                    <Text
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.72}
                                        maxFontSizeMultiplier={1}
                                        style={[styles.categoryLabel, { color: theme.colors.ink }]}
                                    >
                                        {item.label}
                                    </Text>
                                </View>
                            )}
                        </Pressable>
                    )}
                />
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = createAdaptiveStyleSheet({
    screen: {
        flex: 1,
    },
    safe: {
        flex: 1,
    },
    header: {
        height: 72,
        paddingHorizontal: 22,
        flexDirection: "row",
        alignItems: "center",
    },
    backButton: {
        width: 46,
        height: 46,
        justifyContent: "center",
    },
    title: {
        flex: 1,
        textAlign: "center",
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 28,
        fontWeight: "700",
    },
    headerSpacer: {
        width: 46,
    },
    searchBar: {
        minHeight: 62,
        marginHorizontal: 22,
        marginTop: 10,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: COLORS.line,
        backgroundColor: "rgba(255,255,255,0.92)",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        gap: 12,
    },
    searchInput: {
        flex: 1,
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 18,
        paddingVertical: 10,
    },
    listContent: {
        paddingHorizontal: 22,
        paddingTop: 28,
    },
    sectionTitle: {
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 26,
        fontWeight: "700",
        marginBottom: 18,
    },
    gridRow: {
        justifyContent: "space-between",
        marginBottom: 16,
    },
    cardPressable: {
        width: "30.6%",
    },
    card: {
        width: "100%",
        aspectRatio: 0.84,
        borderRadius: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E8EDF5",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 20,
        paddingHorizontal: 8,
        paddingBottom: 16,
        overflow: "hidden",
        ...cardShadow,
    },
    cardPressed: {
        opacity: 0.86,
        transform: [{ scale: 0.98 }],
    },
    categoryImage: {
        width: "82%",
        height: "58%",
    },
    categoryLabel: {
        width: "100%",
        textAlign: "center",
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 18,
        fontWeight: "600",
    },
    emptyState: {
        paddingVertical: 48,
        alignItems: "center",
    },
    emptyText: {
        color: COLORS.muted,
        fontFamily: "ChairoSans",
        fontSize: 17,
    },
});
