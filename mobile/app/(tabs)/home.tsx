import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import CartButton from "@/components/CartButton";
import LanguageToggle from "@/components/LanguageToggle";
import { illustrations } from "@/constants/mediaCatalog";
import useHome from "@/src/hooks/useHome";
import { Card, SectionHeader } from "@/src/components/componentRegistry";
import { useTheme, ThemeDefinition } from "@/src/theme/themeContext";
import { DeliverToHeader } from "@/src/features/address/addressFeature";
import Icon from "@/components/Icon";
import { makeShadow } from "@/src/lib/shadowStyle";
import { getRestaurantImageSource } from "@/lib/assets";
import useAuthStore from "@/store/auth.store";
import type { Order } from "@/src/domain/types";
import useOrderStatus, { type PendingOrderStatus } from "@/src/hooks/useOrderStatus";
import { subscribeUserOrders } from "@/src/services/firebaseOrders";
import GodzillaIceCream from "@/assets/godzilla/VCTRLY-godzila-ice-cream-food.svg";
import GodzillaReading from "@/assets/godzilla/VCTRLY-godzila-reading-book-magazine.svg";
import GodzillaOffice from "@/assets/godzilla/VCTRLY-godzila-work-office-business.svg";
import GodzillaBusy from "@/assets/godzilla/VCTRLY-godzila-work-worker-busy-confused.svg";

const CourierIllustration = illustrations.foodieCelebration;
const WINE_RED = "#7F021F";
const languageHintKey = "home.languageHint";
const normalizeRestaurantId = (restaurant: any, fallback: string) => {
    const raw =
        restaurant?.id ||
        restaurant?.$id ||
        restaurant?.slug ||
        restaurant?.code ||
        restaurant?.handle ||
        restaurant?.name ||
        fallback;
    return String(raw)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
};

export default function HomeTabScreen() {
    const { userName, heroLoading, restaurants, restaurantsLoading } = useHome();
    const router = useRouter();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const displayName = (userName || "Hungrie User").trim();
    const isWeb = Platform.OS === "web";
    const effectiveWidth = isWeb ? Math.min(windowWidth, 960) : windowWidth;
    const restaurantCount = (restaurants || []).length;
    const baseColumns = isWeb && effectiveWidth >= 860 ? 3 : 2;
    const gridColumns = restaurantCount === 1 ? 1 : baseColumns;
    const gridJustify = restaurantCount < gridColumns ? "center" : gridColumns >= 3 ? "flex-start" : "space-between";

    const safeTop = Math.max(insets.top, 12);
    const headerPaddingTop = safeTop + theme.spacing.md;

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View pointerEvents="none" style={styles.bgLayer}>
                    <View style={styles.bgTopLeft}>
                        <GodzillaIceCream width={90} height={90} />
                    </View>
                    <View style={styles.bgMidRight}>
                        <GodzillaReading width={110} height={110} />
                    </View>
                    <View style={styles.bgCenter}>
                        <GodzillaOffice width={140} height={140} />
                    </View>
                    <View style={styles.bgBottomLeft}>
                        <GodzillaBusy width={120} height={120} />
                    </View>
                    <View style={styles.bgMidLeft}>
                        <GodzillaReading width={90} height={90} />
                    </View>
                    <View style={styles.bgBottomRight}>
                        <GodzillaIceCream width={110} height={110} />
                    </View>
                </View>

                <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
                    <View style={styles.deliveryWrapper}>
                        <View style={styles.deliveryRow}>
                            <DeliverToHeader />
                        </View>
                        <Text style={styles.deliveryName}>{displayName}</Text>
                    </View>
                    <View style={styles.headerActionsColumn}>
                        <Text style={styles.languageLabel}>{t(languageHintKey)}</Text>
                        <LanguageToggle />
                    </View>
                    <CartButton />
                </View>

                {heroLoading ? (
                    <View style={styles.heroSkeleton} />
                ) : (
                    <LinearGradient
                        colors={[WINE_RED, `${theme.colors.primary}E6`]}
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
                        <View style={styles.titleRow}>
                            <Text style={styles.searchShortcutTitle}>
                                {`${t("home.searchShortcut.title")} ${displayName}`}
                            </Text>
                        </View>
                        <Text style={styles.searchShortcutSubtitle}>{t("home.searchShortcut.subtitle")}</Text>
                    </View>
                    <View style={styles.searchShortcutBadge}>
                        <Text style={styles.searchShortcutBadgeText}>{t("home.searchShortcut.cta")}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.section}>
                    <SectionHeader title={t("home.restaurantsTitle")} />
                    {restaurantsLoading ? (
                        <ActivityIndicator color="#FE8C00" />
                    ) : (
                        <View style={[styles.gridGap, { justifyContent: gridJustify }]}>
                            {(restaurants || []).map((restaurant: any, index: number) => {
                                const restaurantId = normalizeRestaurantId(restaurant, String(index));
                                return (
                                    <RestaurantGridTile
                                        key={restaurantId}
                                        restaurant={restaurant}
                                        columns={gridColumns}
                                        campusOnly={restaurantId === "root" || restaurantId === "root-kitchen-coffee"}
                                        onPress={() =>
                                            router.push({
                                                pathname: "/restaurants/[id]",
                                                params: { id: restaurantId },
                                            })
                                        }
                                    />
                                );
                            })}
                        </View>
                    )}
                </View>

                <View style={styles.section}>
                    <OrderStatusStrip />
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>2026 ©HungrieApp Inc.</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const OrderStatusStrip = () => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const userId = useMemo(
        () => user?.id ?? user?.$id ?? user?.accountId ?? "guest",
        [user?.$id, user?.accountId, user?.id],
    );
    const [latestOrder, setLatestOrder] = useState<Order | null>(null);
    const orderId = latestOrder?.id ?? "";
    const { status: pendingStatus } = useOrderStatus(orderId);

    useEffect(() => {
        if (!userId) return;
        return subscribeUserOrders(userId, (orders) => {
            const pendingOrder = orders.find((order) => order.status === "pending");
            setLatestOrder(pendingOrder ?? null);
        });
    }, [userId]);

    const statusKey: PendingOrderStatus | null = orderId ? pendingStatus : null;
    if (!latestOrder || !statusKey) return null;

    const palette: Record<
        PendingOrderStatus,
        { icon: string; color: string; title: string; subtitle: string; badge: string }
    > = {
        awaiting_confirmation: {
            icon: "clock",
            color: theme.colors.primary,
            title: t("home.orderStatus.waitingTitle"),
            subtitle: t("home.orderStatus.waitingSubtitle"),
            badge: t("home.orderStatus.waitingTag"),
        },
        confirmed: {
            icon: "check",
            color: "#16A34A",
            title: t("home.orderStatus.confirmedTitle"),
            subtitle: t("home.orderStatus.confirmedSubtitle"),
            badge: t("home.orderStatus.confirmedTag"),
        },
        rejected: {
            icon: "close",
            color: "#DC2626",
            title: t("home.orderStatus.rejectedTitle"),
            subtitle: t("home.orderStatus.rejectedSubtitle"),
            badge: t("home.orderStatus.rejectedTag"),
        },
    };

    const state = palette[statusKey];

    return (
        <Card
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.md,
                borderRadius: theme.radius["2xl"],
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: `${state.color}0D`,
                borderWidth: 1,
                borderColor: `${state.color}26`,
            }}
        >
            <View
                style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    borderWidth: 2,
                    borderColor: state.color,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${state.color}12`,
                }}
            >
                <Icon name={state.icon as any} size={20} color={state.color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "ChairoSans", color: theme.colors.ink, fontSize: 16 }}>{state.title}</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4, fontFamily: "ChairoSans" }}>{state.subtitle}</Text>
            </View>
            <View
                style={{
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: 999,
                    backgroundColor: `${state.color}16`,
                }}
            >
                <Text style={{ color: state.color, fontFamily: "ChairoSans" }}>{state.badge}</Text>
            </View>
        </Card>
    );
};

const RestaurantGridTile = ({
    restaurant,
    onPress,
    campusOnly = false,
    columns = 2,
}: {
    restaurant: any;
    onPress: () => void;
    campusOnly?: boolean;
    columns?: number;
}) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const { name, imageUrl } = restaurant || {};
    const fallbackName = name || "Restaurant";
    const campusLabel = campusOnly ? t("home.campusOnlyTag") : null;
    const tileWidth = columns <= 1 ? "100%" : columns >= 3 ? "31%" : "48%";
    const logoSize = columns >= 3 ? 100 : 90;
    const logoIconOffset = Math.round((logoSize - 32) / 2);
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={{
                width: tileWidth,
                aspectRatio: 1,
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius["2xl"],
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                ...makeShadow({
                    color: theme.colors.ink,
                    offsetY: 6,
                    blurRadius: 14,
                    opacity: 0.06,
                    elevation: 4,
                }),
            }}
        >
            <View
                style={{
                    width: logoSize,
                    height: logoSize,
                    borderRadius: theme.radius.xl,
                    overflow: "hidden",
                    backgroundColor: `${theme.colors.primary}12`,
                }}
            >
                <Icon
                    name="home"
                    size={32}
                    color={theme.colors.primary}
                    style={{ position: "absolute", top: logoIconOffset, left: logoIconOffset }}
                />
                <RestaurantImage imageUrl={imageUrl} />
            </View>
            <Text
                style={{
                    fontFamily: "ChairoSans",
                    fontSize: 18,
                    color: theme.colors.ink,
                }}
                numberOfLines={1}
            >
                {fallbackName}
            </Text>
            {campusLabel ? (
                <Text
                    style={{
                        fontFamily: "ChairoSans",
                        fontSize: 12,
                        color: theme.colors.muted,
                    }}
                    numberOfLines={1}
                >
                    {campusLabel}
                </Text>
            ) : null}
        </TouchableOpacity>
    );
};

const RestaurantImage = ({ imageUrl }: { imageUrl: any }) => {
    const source = getRestaurantImageSource(imageUrl);
    return <Image source={source} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={300} />;
};

const createStyles = (theme: ThemeDefinition) =>
    StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: theme.colors.surface },
        scrollContent: { paddingBottom: theme.spacing["2xl"] * 3, backgroundColor: theme.colors.surface, gap: theme.spacing.lg },
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.xl,
            gap: theme.spacing.md,
        },
        bgLayer: { position: "absolute", inset: 0 },
        bgTopLeft: { position: "absolute", top: 40, left: -20, opacity: 0.08 },
        bgMidRight: { position: "absolute", top: 220, right: -10, opacity: 0.08 },
        bgCenter: { position: "absolute", top: 420, left: "25%", opacity: 0.06 },
        bgBottomLeft: { position: "absolute", top: 700, left: -10, opacity: 0.07 },
        bgMidLeft: { position: "absolute", top: 520, left: -30, opacity: 0.06, transform: [{ rotate: "-12deg" }] },
        bgBottomRight: { position: "absolute", top: 880, right: -30, opacity: 0.07, transform: [{ rotate: "10deg" }] },
        deliveryWrapper: { flex: 1, paddingRight: theme.spacing.md },
        deliveryRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
        headerActionsColumn: { alignItems: "flex-end", gap: 4, marginTop: 2 },
        languageLabel: { fontFamily: "ChairoSans", color: theme.colors.muted, fontSize: 12, paddingRight: theme.spacing.sm, textAlign: "right" },
        //Added missing deliveryName style to avoid TS error when referenced in JSX
        deliveryName: {
            fontFamily: "ChairoSans",
            fontSize: 18,
            color: theme.colors.ink,
            marginTop: 4,
        },
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
            fontFamily: "ChairoSans",
            textTransform: "uppercase",
            fontSize: 12,
            opacity: 0.8,
        },
        heroTitle: { color: theme.colors.surface, fontFamily: "ChairoSans", fontSize: 26, lineHeight: 32 },
        heroSubtitle: {
            color: theme.colors.surface,
            fontFamily: "ChairoSans",
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
        heroCtaText: { color: theme.colors.ink, fontFamily: "ChairoSans" },
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
        searchShortcutTitle: { fontFamily: "ChairoSans", fontSize: 18, color: theme.colors.ink },
        searchShortcutSubtitle: { color: theme.colors.muted, marginTop: 4, fontFamily: "ChairoSans" },
        searchShortcutBadge: {
            borderRadius: 999,
            backgroundColor: theme.colors.primary,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
        },
        searchShortcutBadgeText: { color: theme.colors.surface, fontFamily: "ChairoSans" },
        searchArtwork: {
            position: "absolute",
            right: 74,
            bottom: -2,
        },
        titleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
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
        statValue: { fontFamily: "ChairoSans", fontSize: 28, color: theme.colors.ink },
        statLabel: { color: theme.colors.muted, marginTop: theme.spacing.xs, fontFamily: "ChairoSans" },
        statHelper: { color: theme.colors.muted, fontFamily: "ChairoSans", marginTop: 4, lineHeight: 18 },
        chipIcon: { width: 18, height: 18 },
        categoriesContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
        categoryHint: { fontFamily: "ChairoSans", color: theme.colors.ink, marginBottom: theme.spacing.sm },
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
        gridGap: {
            gap: theme.spacing.md,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
        },
        studyFuelBadge: {
            position: "absolute",
            right: -8,
            bottom: -8,
        },
        footer: { alignItems: "center", paddingVertical: theme.spacing.lg },
        footerText: { fontFamily: "ChairoSans", color: theme.colors.muted },
    });
