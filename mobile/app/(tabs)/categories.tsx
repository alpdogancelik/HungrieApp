import { useMemo } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { FlatList, Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image, type ImageSource } from "expo-image";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
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

const cardShadow = makeShadow({ color: "#8B6D55", offsetY: 6, blurRadius: 14, opacity: 0.06, elevation: 2 });
const CATEGORY_IMAGES: Record<string, ImageSource> = {
    doner: require("../../assets/Categories/Doner_Resized.png"),
    burger: require("../../assets/Categories/Hamburger_Resized.png"),
    pizza: require("../../assets/Categories/Pizza_Resized.png"),
    kebap: require("../../assets/Categories/Kebap_Resized.png"),
    durum: require("../../assets/Categories/Durum_Resized.png"),
    izgara: require("../../assets/Categories/Kofte_Resized.png"),
    kahve: require("../../assets/Categories/Kahve_Resized.png"),
    lahmacun: require("../../assets/Categories/Lahmacun_Pide_Resized.png"),
    tatli: require("../../assets/Categories/Tatli_Resized.png"),
    salata: require("../../assets/Categories/Salata_Resized.png"),
    makarna: require("../../assets/Categories/Makarna_Resized.png"),
    icecek: require("../../assets/Categories/Icecekler_Resized.png"),
    tavuk: require("../../assets/Categories/Tavuk_Resized.png"),
    sos: require("../../assets/Categories/Soslar_Resized.png"),
};

export default function CategoriesScreen() {
    useWebDocumentTitle();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useBottomTabBarHeight();
    const { width } = useWindowDimensions();
    const { i18n } = useTranslation();
    const { theme, variant } = useTheme();
    const isTurkish = i18n.language?.startsWith("tr");
    const cardWidth = (width - 44 - 24) / 4;

    const categories = useMemo(
        () =>
            CATEGORY_CARDS.map((item) => ({
                ...item,
                label: isTurkish ? item.tr : item.en,
                displayImage: CATEGORY_IMAGES[item.id],
            })),
        [isTurkish],
    );

    const openCategory = (category: (typeof categories)[number]) => {
        router.push({
            pathname: "/search",
            params: { query: category.label, category: category.searchKey, refresh: String(Date.now()) },
        });
    };

    return (
        <View style={[styles.screen, { backgroundColor: variant === "dark" ? theme.colors.background : "#FAFBFC" }]}>
            <StatusBar style={variant === "dark" ? "light" : "dark"} />
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
                    </Pressable>
                    <Text maxFontSizeMultiplier={1.05} style={[styles.title, { color: theme.colors.ink }]}>
                        {isTurkish ? "Kategoriler" : "Categories"}
                    </Text>
                    <View style={styles.headerSpacer} />
                </View>

                <FlatList
                    data={categories}
                    key="categories-four-column"
                    keyExtractor={(item) => item.id}
                    numColumns={4}
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
                    renderItem={({ item }) => (
                        <Pressable onPress={() => openCategory(item)} style={[styles.cardPressable, { width: cardWidth, backgroundColor: theme.colors.surface }]}>
                            {({ pressed }) => (
                                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed ? styles.cardPressed : null]}>
                                    <Image cachePolicy="memory-disk" contentFit="contain" source={item.displayImage} style={[styles.categoryImage, { backgroundColor: theme.colors.surface }]} transition={120} />
                                    <View style={[styles.cardFooter, { backgroundColor: theme.colors.surface }]}>
                                        <Text
                                            numberOfLines={2}
                                            maxFontSizeMultiplier={1}
                                            style={[styles.categoryLabel, { color: theme.colors.ink }]}
                                        >
                                            {item.label}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </Pressable>
                    )}
                />
            </SafeAreaView>
        </View>
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
        height: 58,
        paddingHorizontal: 22,
        flexDirection: "row",
        alignItems: "center",
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: "center",
    },
    title: {
        flex: 1,
        textAlign: "center",
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 25,
        fontWeight: "700",
        letterSpacing: -0.2,
    },
    headerSpacer: {
        width: 40,
    },
    listContent: {
        paddingHorizontal: 22,
        paddingTop: 18,
    },
    sectionTitle: {
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 18,
        lineHeight: 22,
        fontWeight: "700",
        letterSpacing: -0.2,
        marginBottom: 12,
    },
    gridRow: {
        justifyContent: "flex-start",
        gap: 8,
        marginBottom: 12,
    },
    cardPressable: {
        flexGrow: 0,
        minWidth: 0,
        borderRadius: 15,
        ...cardShadow,
    },
    card: {
        width: "100%",
        height: 120,
        borderRadius: 15,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E8EDF5",
        overflow: "hidden",
    },
    cardPressed: {
        opacity: 0.86,
        transform: [{ scale: 0.98 }],
    },
    categoryImage: {
        width: "100%",
        height: 80,
    },
    cardFooter: {
        flex: 1,
        minHeight: 38,
        paddingHorizontal: 4,
        alignItems: "center",
        justifyContent: "center",
    },
    categoryLabel: {
        width: "100%",
        textAlign: "center",
        color: COLORS.ink,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 15,
        fontWeight: "600",
    },
});
