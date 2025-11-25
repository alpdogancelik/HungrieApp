import { useCallback, useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";

import MenuCard from "@/components/MenuCard";
import Icon from "@/components/Icon";
import useServerResource from "@/lib/useServerResource";
import { getRestaurant, getRestaurantMenu } from "@/lib/api";
import { resolveRestaurantImageSource } from "@/lib/assets";
import type { MenuItem } from "@/type";
import { makeShadow } from "@/src/lib/shadowStyle";

type Restaurant = {
    name?: string;
    description?: string;
    cuisine?: string;
    rating?: number;
    reviewCount?: number;
    deliveryTime?: string;
    deliveryFee?: string | number;
    address?: string;
    imageUrl?: string;
    image_url?: string;
};

type Palette = {
    primary: string;
    secondary: string;
    accent: string;
};

const paletteMap: Record<string, Palette> = {
    "ada-pizza": { primary: "#FF7A00", secondary: "#FFD29D", accent: "#0F172A" },
    "alacarte-cafe": { primary: "#D7263D", secondary: "#F9C6D0", accent: "#1B202C" },
    "hot-n-fresh": { primary: "#FF4D67", secondary: "#FFC4D6", accent: "#0E111B" },
    lavish: { primary: "#845EC2", secondary: "#D4C2FF", accent: "#0A0F1E" },
    munchies: { primary: "#D96704", secondary: "#FFD9B0", accent: "#0F1628" },
    "root-kitchen-coffee": { primary: "#0E7C7B", secondary: "#B6F3E2", accent: "#04101A" },
    "lombard-kitchen": { primary: "#0A3F2F", secondary: "#C3E7DD", accent: "#041212" },
    burgerhouse: { primary: "#FF9F1C", secondary: "#FFE8C7", accent: "#0F172A" },
    default: { primary: "#0F75F3", secondary: "#CDE3FF", accent: "#0A1123" },
};

const normalizeId = (value?: string) => (value || "default").toLowerCase().replace(/[^a-z0-9]+/g, "-");

const formatCurrency = (value?: string | number) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const withDefaultDescription = (description?: string, name?: string) =>
    description || `${name || "Bu mutfak"} kampüsü doyuruyor.`;

const MetaBadge = ({
    icon,
    label,
    value,
    palette,
}: {
    icon: "clock" | "star" | "dollar" | "location";
    label: string;
    value: string;
    palette: Palette;
}) => (
    <View style={[styles.metaBadge, { borderColor: `${palette.primary}30`, backgroundColor: "#fff" }]}>
        <View style={[styles.metaIcon, { backgroundColor: `${palette.primary}12` }]}>
            <Icon name={icon} size={16} color={palette.primary} />
        </View>
        <View style={{ gap: 2 }}>
            <Text style={[styles.metaBadgeValue, { color: palette.accent }]}>{value}</Text>
            <Text style={styles.metaBadgeLabel}>{label}</Text>
        </View>
    </View>
);

const Tag = ({ label, palette }: { label: string; palette: Palette }) => (
    <View style={[styles.tag, { backgroundColor: `${palette.secondary}50` }]}>
        <Text style={[styles.tagText, { color: palette.accent }]}>{label}</Text>
    </View>
);

const RestaurantDetailsScreen = () => {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const restaurantId = useMemo(() => (id ? String(id) : ""), [id]);
    const ready = Boolean(restaurantId);

    const restaurantParams = useMemo(() => (restaurantId ? restaurantId : undefined), [restaurantId]);
    const menuParams = useMemo(() => (ready ? { restaurantId } : undefined), [ready, restaurantId]);
    const palette = paletteMap[normalizeId(restaurantId)] || paletteMap.default;

    const fetchRestaurant = useCallback(
        async (incomingId?: string) => {
            const targetId = incomingId ?? restaurantId;
            if (!targetId) {
                throw new Error("Restaurant id is missing.");
            }
            return getRestaurant(targetId);
        },
        [restaurantId],
    );

    const fetchMenu = useCallback(
        async (payload?: { restaurantId: string }) => {
            const targetId = payload?.restaurantId ?? restaurantId;
            if (!targetId) {
                throw new Error("Restaurant id is missing.");
            }
            return getRestaurantMenu({ restaurantId: targetId });
        },
        [restaurantId],
    );

    const {
        data: restaurant,
        loading: restaurantLoading,
        error: restaurantError,
    } = useServerResource<Restaurant, string | undefined>({
        fn: fetchRestaurant,
        params: restaurantParams,
        immediate: ready,
        skipAlert: true,
    });

    const {
        data: menu,
        loading: menuLoading,
    } = useServerResource<MenuItem[], { restaurantId: string } | undefined>({
        fn: fetchMenu,
        params: menuParams,
        immediate: ready,
        skipAlert: true,
    });

    const heroSource = useMemo(() => {
        const candidate = resolveRestaurantImageSource(restaurant?.imageUrl || restaurant?.image_url);
        if (!candidate) return null;
        return typeof candidate === "number" ? candidate : { uri: candidate };
    }, [restaurant]);

    const vibeTags = useMemo(() => {
        const tags = new Set<string>();
        if (restaurant?.cuisine) tags.add(restaurant.cuisine);
        if ((restaurant?.rating || 0) >= 4.6) tags.add("Kampüs favorisi");
        if (restaurant?.deliveryTime) tags.add(`${restaurant.deliveryTime} dk`);
        tags.add("Günün menüsü");
        return Array.from(tags).slice(0, 4);
    }, [restaurant]);

    const renderMenu = () => {
        if (menuLoading) {
            return <ActivityIndicator color={palette.primary} style={styles.loading} />;
        }
        if (!menu?.length) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No menu items yet</Text>
                    <Text style={styles.emptyCopy}>This restaurant has not published its menu.</Text>
                </View>
            );
        }
        return menu.map((item, index) => (
            <MenuCard key={item.$id || item.id || `${item.name}-${index}`} item={item} accentColor={palette.primary} />
        ));
    };

    const renderBody = () => {
        if (restaurantLoading) {
            return <ActivityIndicator color={palette.primary} style={styles.loading} />;
        }
        if (restaurantError || !restaurant) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Restaurant not found</Text>
                    <Text style={styles.emptyCopy}>{restaurantError || "Please try again later."}</Text>
                    <TouchableOpacity style={[styles.retryButton, { backgroundColor: palette.primary }]} onPress={() => router.back()}>
                        <Text style={styles.retryLabel}>Go back</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        const description = withDefaultDescription(restaurant.description, restaurant.name);

        return (
            <>
                <View style={styles.heroWrapper}>
                    {heroSource ? <Image source={heroSource} style={styles.heroImage} contentFit="cover" /> : null}
                    <View style={styles.heroOverlay} />
                    <View style={styles.heroTop}>
                        <TouchableOpacity onPress={() => router.back()} style={[styles.roundButton, { backgroundColor: "#FFFFFF" }]}>
                            <Icon name="arrowBack" size={18} color={palette.accent} />
                        </TouchableOpacity>
                        <View style={[styles.roundButton, { backgroundColor: "#FFFFFF" }]}>
                            <Icon name="bag" size={18} color={palette.accent} />
                        </View>
                    </View>
                    <View style={styles.heroContent}>
                        <View style={styles.heroLabelRow}>
                            <Text style={[styles.heroLabel, { color: "#fff" }]}>Günün önerisi</Text>
                            <View style={[styles.heroDot, { backgroundColor: "#fff" }]} />
                            <Text style={[styles.heroLabel, { color: "#fff" }]}>Sıcak & taze</Text>
                        </View>
                        <Text style={[styles.title, { color: "#FFFFFF" }]} numberOfLines={2}>
                            {restaurant.name}
                        </Text>
                        {restaurant.cuisine ? (
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {restaurant.cuisine}
                            </Text>
                        ) : null}
                        <View style={styles.metaBadgeRow}>
                            {restaurant.rating ? (
                                <MetaBadge
                                    icon="star"
                                    label={`${restaurant.reviewCount ?? 0} yorum`}
                                    value={restaurant.rating.toFixed(1)}
                                    palette={palette}
                                />
                            ) : null}
                            {restaurant.deliveryTime ? (
                                <MetaBadge icon="clock" label="Teslimat" value={`${restaurant.deliveryTime} dk`} palette={palette} />
                            ) : null}
                            <MetaBadge
                                icon="dollar"
                                label="Ücret"
                                value={formatCurrency(restaurant.deliveryFee)}
                                palette={palette}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.sheet}>
                    <View style={[styles.infoCard, { borderColor: `${palette.primary}25` }]}>
                        <Text style={[styles.sectionEyebrow, { color: palette.primary }]}>Masa Arkası</Text>
                        <Text style={styles.description}>{description}</Text>
                        <View style={styles.tagRow}>
                            {vibeTags.map((tag) => (
                                <Tag key={tag} label={tag} palette={palette} />
                            ))}
                        </View>
                    </View>

                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>Menü</Text>
                    </View>
                    {renderMenu()}
                </View>
            </>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.content}>{renderBody()}</ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#F7F8FC",
    },
    content: {
        paddingBottom: 48,
    },
    loading: {
        marginTop: 40,
    },
    heroWrapper: {
        position: "relative",
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 32,
        overflow: "hidden",
        minHeight: 240,
        ...makeShadow({
            color: "#0A0F1E",
            offsetY: 10,
            blurRadius: 20,
            opacity: 0.18,
            elevation: 10,
        }),
    },
    heroImage: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
    },
    heroOverlay: {
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.15)",
    },
    heroTop: {
        position: "absolute",
        top: 16,
        left: 16,
        right: 16,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 2,
    },
    roundButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    heroContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        paddingTop: 120,
        gap: 10,
    },
    heroLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: 0.95,
    },
    heroLabel: {
        fontFamily: "Ezra-Medium",
        letterSpacing: 0.4,
        color: "#FFF",
    },
    heroDot: {
        width: 6,
        height: 6,
        borderRadius: 999,
    },
    title: {
        fontFamily: "Ezra-Bold",
        fontSize: 30,
    },
    subtitle: {
        color: "rgba(255,255,255,0.9)",
        fontFamily: "Ezra-Medium",
    },
    metaBadgeRow: {
        flexDirection: "row",
        gap: 10,
        flexWrap: "wrap",
        marginTop: 4,
    },
    metaBadge: {
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: "#fff",
    },
    metaIcon: {
        width: 32,
        height: 32,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    metaBadgeValue: {
        fontFamily: "Ezra-Bold",
        fontSize: 18,
    },
    metaBadgeLabel: {
        fontFamily: "Ezra-Medium",
        fontSize: 12,
        color: "#475569",
    },
    sheet: {
        marginTop: -26,
        paddingTop: 32,
        paddingHorizontal: 16,
        backgroundColor: "#F7F8FC",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        gap: 20,
    },
    infoCard: {
        backgroundColor: "#FFFFFF",
        padding: 18,
        borderRadius: 20,
        borderWidth: 1,
        gap: 10,
        ...makeShadow({
            color: "#0A0F1E",
            offsetY: 6,
            blurRadius: 12,
            opacity: 0.06,
            elevation: 6,
        }),
    },
    sectionEyebrow: {
        fontFamily: "Ezra-SemiBold",
        letterSpacing: 1,
        textTransform: "uppercase",
        fontSize: 12,
    },
    description: {
        color: "#1E293B",
        fontFamily: "Ezra-Regular",
        lineHeight: 20,
    },
    tagRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tag: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
    },
    tagText: {
        fontFamily: "Ezra-SemiBold",
        fontSize: 13,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sectionTitle: {
        fontFamily: "Ezra-Bold",
        fontSize: 22,
        color: "#0F172A",
    },
    sectionHint: {
        fontFamily: "Ezra-SemiBold",
        fontSize: 13,
        color: "#64748B",
    },
    emptyState: {
        paddingHorizontal: 20,
        alignItems: "center",
        gap: 8,
    },
    emptyTitle: {
        fontFamily: "Ezra-Bold",
        fontSize: 18,
        color: "#0F172A",
    },
    emptyCopy: {
        color: "#64748B",
        textAlign: "center",
    },
    retryButton: {
        marginTop: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
    },
    retryLabel: {
        color: "#fff",
        fontFamily: "Ezra-SemiBold",
    },
});

export default RestaurantDetailsScreen;
