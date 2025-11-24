import { useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    FlatList,
    StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import CartButton from "@/components/CartButton";
import LanguageToggle from "@/components/LanguageToggle";
import MenuCard from "@/components/MenuCard";
import RestaurantCard from "@/components/RestaurantCard";
import { illustrations } from "@/constants/mediaCatalog";
import useHome from "@/src/hooks/useHome";
import { Chip, Card, SectionHeader } from "@/src/components/componentRegistry";
import { useTheme, ThemeDefinition } from "@/src/theme/themeContext";
import { DeliverToHeader } from "@/src/features/address/addressFeature";
import Icon from "@/components/Icon";
import { makeShadow } from "@/src/lib/shadowStyle";

const CourierIllustration = illustrations.foodieCelebration;

export default function HomeTabScreen() {
    const {
        userName,
        menu,
        menuLoading,
        heroLoading,
        restaurants,
        restaurantsLoading,
        categories,
        categoriesLoading,
        quickActions,
    } = useHome();
    const [activeCategory, setActiveCategory] = useState("all");
    const router = useRouter();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const filteredMenu = useMemo(() => {
        if (!menu) return [];
        if (activeCategory === "all") return menu.slice(0, 4);
        const categoryLower = activeCategory.toLowerCase();
        return menu.filter((item: any) => item.categories?.includes(categoryLower)).slice(0, 4);
    }, [menu, activeCategory]);

    const renderCategory = ({ item }: { item: any }) => (
        <Chip
            label={item.name}
            icon={item.icon ? <Image source={item.icon} style={styles.chipIcon} contentFit="contain" /> : undefined}
            selected={activeCategory === item.id}
            onPress={() => setActiveCategory(item.id)}
        />
    );

    const renderQuickAction = (action: any) => (
        <TouchableOpacity key={action.id} style={styles.quickCardWrapper} onPress={() => router.push(action.target as any)}>
            <Card style={styles.quickCard}>
                <View style={styles.quickCardIconBubble}>
                    <Icon name={action.icon} size={20} color={theme.colors.primary} style={styles.quickCardIcon} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.quickCardLabel}>{action.label}</Text>
                    {action.description ? <Text style={styles.quickCardDescription}>{action.description}</Text> : null}
                </View>
            </Card>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.header}>
                    <View style={styles.deliveryWrapper}>
                        <DeliverToHeader fallbackLabel={userName} />
                    </View>
                    <View style={styles.headerActions}>
                        <LanguageToggle />
                        <CartButton />
                    </View>
                </View>

                {heroLoading ? (
                    <View style={styles.heroSkeleton} />
                ) : (
                    <LinearGradient
                        colors={[theme.colors.primary, `${theme.colors.primary}D9`]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroCard}
                    >
                        <View style={styles.heroTextArea}>
                            <Text style={styles.heroEyebrow}>{t("home.hero.eyebrow")}</Text>
                            <Text style={styles.heroTitle}>{t("home.hero.title")}</Text>
                            <Text style={styles.heroSubtitle}>{t("home.hero.subtitle")}</Text>
                            <TouchableOpacity style={styles.heroCta} onPress={() => router.push("/search")}>
                                <Text style={styles.heroCtaText}>{t("home.hero.cta")}</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.heroIllustration}>
                            <CourierIllustration width={130} height={130} />
                        </View>
                    </LinearGradient>
                )}

                <TouchableOpacity style={styles.searchShortcut} onPress={() => router.push("/search")}>
                    <View style={styles.searchShortcutIcon}>
                        <Icon name="search" size={20} color={theme.colors.primary} />
                    </View>
                    <View style={styles.searchShortcutText}>
                        <Text style={styles.searchShortcutTitle}>{t("home.searchShortcut.title")}</Text>
                        <Text style={styles.searchShortcutSubtitle}>{t("home.searchShortcut.subtitle")}</Text>
                    </View>
                    <View style={styles.searchShortcutBadge}>
                        <Text style={styles.searchShortcutBadgeText}>{t("home.searchShortcut.cta")}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.statRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{restaurants?.length ?? 0}</Text>
                        <Text style={styles.statLabel}>{t("home.stats.restaurants.label")}</Text>
                        <Text style={styles.statHelper}>{t("home.stats.restaurants.helper")}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{menu?.length ?? 0}</Text>
                        <Text style={styles.statLabel}>{t("home.stats.menu.label")}</Text>
                        <Text style={styles.statHelper}>{t("home.stats.menu.helper")}</Text>
                    </View>
                </View>

                <View style={styles.categoriesContainer}>
                    <Text style={styles.categoryHint}>{t("home.categoryHint")}</Text>
                    {categoriesLoading ? (
                        <View style={styles.categorySkeletonRow}>
                            {[...Array(4)].map((_, index) => (
                                <View key={index} style={styles.categorySkeleton} />
                            ))}
                        </View>
                    ) : (
                        <FlatList
                            data={categories}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.categoryListContent}
                            renderItem={renderCategory}
                            keyExtractor={(item, index) => String(item.id ?? index)}
                        />
                    )}
                </View>

                <View style={styles.section}>
                    <SectionHeader title={t("home.quickActionsTitle")} />
                    <View style={styles.quickGrid}>
                        {quickActions.map(renderQuickAction)}
                    </View>
                </View>

                <View style={styles.section}>
                    <SectionHeader title={t("home.featuredTitle")} onActionPress={() => router.push("/search")} />
                    {menuLoading ? (
                        <ActivityIndicator color="#FF8C42" />
                    ) : (
                        <View style={styles.gridGap}>
                            {filteredMenu.map((item: any, index: number) => (
                                <MenuCard
                                    key={item.$id || item.id || `${item.name}-${index}`}
                                    item={item}
                                    onPress={() => router.push({ pathname: "/search", params: { query: item.name } })}
                                />
                            ))}
                        </View>
                    )}
                </View>

                    <View style={styles.section}>
                    <SectionHeader title={t("home.restaurantsTitle")} />
                    {restaurantsLoading ? (
                        <ActivityIndicator color="#FF8C42" />
                    ) : (
                        <View style={styles.gridGap}>
                            {(restaurants || []).map((restaurant: any, index: number) => (
                                <RestaurantCard
                                    key={String(restaurant.id ?? restaurant.$id ?? index)}
                                    restaurant={restaurant}
                                    onPress={() => {
                                        const restaurantId = String(restaurant.id ?? restaurant.$id ?? restaurant.key ?? index);
                                        router.push(`/restaurants/${encodeURIComponent(restaurantId)}`);
                                    }}
                                />
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const createStyles = (theme: ThemeDefinition) =>
    StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: theme.colors.surface },
        scrollContent: { paddingBottom: theme.spacing["2xl"] * 3, backgroundColor: theme.colors.surface, gap: theme.spacing.lg },
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.xl,
        },
        deliveryWrapper: { flex: 1, paddingRight: theme.spacing.md },
        headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
        heroCard: {
            marginHorizontal: theme.spacing.lg,
            borderRadius: theme.radius["2xl"],
            padding: theme.spacing.lg,
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
            ...makeShadow({
                color: theme.colors.ink,
                offsetY: 10,
                blurRadius: 20,
                opacity: 0.12,
                elevation: 8,
            }),
        },
        heroSkeleton: {
            marginHorizontal: theme.spacing.lg,
            borderRadius: theme.radius["2xl"],
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.border,
            height: 140,
        },
        heroTextArea: { flex: 1, gap: theme.spacing.sm },
        heroEyebrow: {
            color: theme.colors.surface,
            fontFamily: "Ezra-SemiBold",
            textTransform: "uppercase",
            fontSize: 12,
            opacity: 0.8,
        },
        heroTitle: { color: theme.colors.surface, fontFamily: "Ezra-Bold", fontSize: 26, lineHeight: 32 },
        heroSubtitle: {
            color: theme.colors.surface,
            fontFamily: "Ezra-Medium",
            fontSize: 14,
            opacity: 0.9,
            lineHeight: 20,
        },
        heroCta: {
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            alignSelf: "flex-start",
        },
        heroCtaText: { color: theme.colors.ink, fontFamily: "Ezra-SemiBold" },
        heroIllustration: { width: 130, height: 130, alignItems: "center", justifyContent: "center" },
        searchShortcut: {
            marginHorizontal: theme.spacing.lg,
            marginTop: theme.spacing.sm,
            borderRadius: theme.radius["2xl"],
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.md,
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
        },
        searchShortcutIcon: {
            width: 44,
            height: 44,
            borderRadius: 999,
            backgroundColor: `${theme.colors.primary}20`,
            alignItems: "center",
            justifyContent: "center",
        },
        searchShortcutText: { flex: 1 },
        searchShortcutTitle: { fontFamily: "Ezra-Bold", fontSize: 18, color: theme.colors.ink },
        searchShortcutSubtitle: { color: theme.colors.muted, marginTop: 4, fontFamily: "Ezra-Medium" },
        searchShortcutBadge: {
            borderRadius: 999,
            backgroundColor: theme.colors.primary,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
        },
        searchShortcutBadgeText: { color: theme.colors.surface, fontFamily: "Ezra-SemiBold" },
        statRow: {
            flexDirection: "row",
            gap: theme.spacing.md,
            marginHorizontal: theme.spacing.lg,
        },
        statCard: {
            flex: 1,
            borderRadius: theme.radius["2xl"],
            padding: theme.spacing.md,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        statValue: { fontFamily: "Ezra-Bold", fontSize: 28, color: theme.colors.ink },
        statLabel: { color: theme.colors.muted, marginTop: theme.spacing.xs, fontFamily: "Ezra-Medium" },
        statHelper: { color: theme.colors.muted, fontFamily: "Ezra-Medium", marginTop: 4, lineHeight: 18 },
        chipIcon: { width: 18, height: 18 },
        categoriesContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
        categoryHint: { fontFamily: "Ezra-Bold", color: theme.colors.ink, marginBottom: theme.spacing.sm },
        categorySkeletonRow: {
            flexDirection: "row",
            gap: theme.spacing.sm,
        },
        categorySkeleton: {
            flex: 1,
            height: 48,
            borderRadius: theme.radius["2xl"],
            backgroundColor: theme.colors.border,
        },
        categoryListContent: {
            gap: theme.spacing.sm,
            paddingRight: theme.spacing.lg,
        },
        section: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
        quickGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.md,
        },
        quickCardWrapper: {
            width: "47%",
        },
        quickCard: {
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
            borderRadius: theme.radius["2xl"],
            backgroundColor: theme.colors.surface,
            ...makeShadow({
                color: theme.colors.ink,
                offsetY: 4,
                blurRadius: 10,
                opacity: 0.05,
            }),
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
        },
        quickCardIconBubble: {
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${theme.colors.primary}12`,
        },
        quickCardIcon: { width: 32, height: 32 },
        quickCardLabel: { fontFamily: "Ezra-SemiBold", color: theme.colors.ink },
        quickCardDescription: { color: theme.colors.muted, fontFamily: "Ezra-Medium", lineHeight: 18 },
        gridGap: {
            gap: theme.spacing.md,
        },
    });

