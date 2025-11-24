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
    deliveryTime?: string;
    address?: string;
    imageUrl?: string;
    image_url?: string;
};

const RestaurantDetailsScreen = () => {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const restaurantId = useMemo(() => (id ? String(id) : ""), [id]);
    const ready = Boolean(restaurantId);

    const restaurantParams = useMemo(() => (restaurantId ? restaurantId : undefined), [restaurantId]);
    const menuParams = useMemo(() => (ready ? { restaurantId } : undefined), [ready, restaurantId]);

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

    const renderMenu = () => {
        if (menuLoading) {
            return <ActivityIndicator color="#FF8C42" style={styles.loading} />;
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
            <MenuCard key={item.$id || item.id || `${item.name}-${index}`} item={item} />
        ));
    };

    const renderBody = () => {
        if (restaurantLoading) {
            return <ActivityIndicator color="#FF8C42" style={styles.loading} />;
        }
        if (restaurantError || !restaurant) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Restaurant not found</Text>
                    <Text style={styles.emptyCopy}>{restaurantError || "Please try again later."}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
                        <Text style={styles.retryLabel}>Go back</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <>
                {heroSource ? <Image source={heroSource} style={styles.heroImage} contentFit="cover" /> : null}
                <View style={styles.heading}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Icon name="arrowBack" size={20} color="#0F172A" />
                    </TouchableOpacity>
                    <View style={styles.titleBlock}>
                        <Text style={styles.title}>{restaurant.name}</Text>
                        {restaurant.cuisine ? <Text style={styles.subtitle}>{restaurant.cuisine}</Text> : null}
                    </View>
                </View>
                {restaurant.description ? (
                    <Text style={styles.description}>{restaurant.description}</Text>
                ) : null}
                <View style={styles.metaRow}>
                    {restaurant.deliveryTime ? (
                        <View style={styles.metaPill}>
                            <Text style={styles.metaLabel}>Delivery</Text>
                            <Text style={styles.metaValue}>{restaurant.deliveryTime} min</Text>
                        </View>
                    ) : null}
                    {restaurant.rating ? (
                        <View style={styles.metaPill}>
                            <Text style={styles.metaLabel}>Rating</Text>
                            <Text style={styles.metaValue}>{restaurant.rating.toFixed(1)}</Text>
                        </View>
                    ) : null}
                </View>

                <Text style={styles.sectionTitle}>Menu</Text>
                {renderMenu()}
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
        backgroundColor: "#F8FAFC",
    },
    content: {
        paddingBottom: 40,
        gap: 16,
    },
    loading: {
        marginTop: 40,
    },
    heading: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 20,
        marginTop: -20,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        ...makeShadow({
            color: "#1F2937",
            offsetY: 2,
            blurRadius: 6,
            opacity: 0.1,
            elevation: 4,
        }),
    },
    heroImage: {
        width: "100%",
        height: 220,
    },
    titleBlock: {
        flex: 1,
    },
    title: {
        fontFamily: "Ezra-Bold",
        fontSize: 28,
        color: "#0F172A",
    },
    subtitle: {
        color: "#475569",
        fontFamily: "Ezra-Medium",
        marginTop: 4,
    },
    description: {
        paddingHorizontal: 20,
        color: "#475569",
        fontFamily: "Ezra-Regular",
    },
    metaRow: {
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 20,
    },
    metaPill: {
        backgroundColor: "#fff",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    metaLabel: {
        color: "#94A3B8",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 1.5,
    },
    metaValue: {
        fontFamily: "Ezra-SemiBold",
        fontSize: 16,
        color: "#0F172A",
    },
    sectionTitle: {
        paddingHorizontal: 20,
        fontFamily: "Ezra-Bold",
        fontSize: 22,
        color: "#0F172A",
        marginTop: 8,
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
        color: "#475569",
        textAlign: "center",
    },
    retryButton: {
        marginTop: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: "#FF8C42",
    },
    retryLabel: {
        color: "#fff",
        fontFamily: "Ezra-SemiBold",
    },
});

export default RestaurantDetailsScreen;
