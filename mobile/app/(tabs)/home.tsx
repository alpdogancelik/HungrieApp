import { useCallback, useEffect, useMemo, useState } from "react";
import { DeviceEventEmitter, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import Icon from "@/components/Icon";
import LanguageToggle from "@/components/LanguageToggle";
import { illustrations } from "@/constants/mediaCatalog";
import { getRestaurantImageSource } from "@/lib/assets";
import useHome from "@/src/hooks/useHome";
import useOrderStatus, { type PendingOrderStatus } from "@/src/hooks/useOrderStatus";
import { makeShadow } from "@/src/lib/shadowStyle";
import { addressStore } from "@/src/features/address/addressStore";
import { useDefaultAddress } from "@/src/features/address/hooks";
import { subscribeUserOrders } from "@/src/services/firebaseOrders";
import { useTheme } from "@/src/theme/themeContext";
import useAuthStore from "@/store/auth.store";
import type { Address, Order } from "@/src/domain/types";

const HeroArt = illustrations.foodieCelebration;

const restaurantMeta = [
    { rating: "4.8", eta: "15-20 dk", minBasket: "Min. 120 TL" },
    { rating: "4.7", eta: "18-25 dk", minBasket: "Min. 90 TL" },
    { rating: "4.9", eta: "10-15 dk", minBasket: "Min. 80 TL" },
    { rating: "4.6", eta: "20-30 dk", minBasket: "Min. 100 TL" },
];

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

const renderAddressLine = (address: any) =>
    [address?.line1, address?.block].filter(Boolean).join(", ") ||
    [address?.city, address?.country].filter(Boolean).join(", ");

const renderAddressDetail = (address: Address) => [address.room, address.city, address.country].filter(Boolean).join(", ");

const renderAddressDisplay = (address: any, fallbackAddress: string) => {
    if (!address) return fallbackAddress;

    const label = String(address?.label || "").trim();
    const block = String(address?.block || "").trim();

    if (label && block) return `${label} (${block})`;
    if (label) return label;
    return renderAddressLine(address) || fallbackAddress;
};

export function HomeTabScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { heroLoading, restaurants, restaurantsLoading } = useHome();
    const { defaultAddress, addresses } = useDefaultAddress();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const isTurkish = i18n.language?.startsWith("tr");
    const fallbackAddress = t("deliverTo.subtitle");
    const addressValue = renderAddressDisplay(defaultAddress, fallbackAddress);
    const restaurantList = Array.isArray(restaurants) ? restaurants : [];
    const [sheetVisible, setSheetVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(defaultAddress?.id ?? null);

    useEffect(() => {
        setSelectedId(defaultAddress?.id ?? null);
    }, [defaultAddress?.id]);

    const handleAddressPress = () => {
        if (!isAuthenticated) {
            router.push("/sign-in");
            return;
        }
        setSheetVisible(true);
    };

    const handleUseAddress = useCallback(async () => {
        if (!selectedId) return;
        await addressStore.setDefault(selectedId);
        const updated = addresses.find((address) => address.id === selectedId);
        if (updated) {
            DeviceEventEmitter.emit("app/addressChanged", updated);
        }
        setSheetVisible(false);
    }, [addresses, selectedId]);

    const openManageAddresses = () => {
        setSheetVisible(false);
        router.push("/ManageAddresses");
    };

    const renderAddressItem = useCallback(
        ({ item }: { item: Address }) => {
            const isSelected = item.id === selectedId;
            return (
                <Pressable
                    onPress={() => setSelectedId(item.id)}
                    style={[styles.addressItem, isSelected ? styles.addressItemSelected : styles.addressItemIdle]}
                >
                    <View style={styles.addressItemContent}>
                        <Text style={styles.addressItemLabel}>{item.label}</Text>
                        <Text style={styles.addressItemLine} numberOfLines={1}>
                            {renderAddressLine(item)}
                        </Text>
                        {renderAddressDetail(item) ? (
                            <Text style={styles.addressItemDetail} numberOfLines={1}>
                                {renderAddressDetail(item)}
                            </Text>
                        ) : null}
                    </View>
                    <View style={[styles.radioOuter, { borderColor: isSelected ? "#FE8C00" : "#CBD5E1" }]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                </Pressable>
            );
        },
        [selectedId, styles],
    );

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.content,
                    {
                        paddingTop: Math.max(insets.top, 18) + 4,
                        paddingBottom: 132 + Math.max(insets.bottom, 12),
                    },
                ]}
            >
                <View style={styles.header}>
                    <Pressable style={styles.topBar} onPress={handleAddressPress}>
                        <View style={styles.topBarAddress}>
                            <View style={styles.addressIcon}>
                                <Ionicons name="location-sharp" size={18} color="#FF9800" />
                            </View>
                            <View style={styles.addressText}>
                                <Text style={styles.addressHint}>{t("deliverTo.eyebrow")}</Text>
                                <Text style={styles.topBarValue} numberOfLines={1}>
                                    {addressValue}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.topBarActions}>
                            <LanguageToggle showLabel={false} />
                        </View>
                    </Pressable>
                </View>

                {heroLoading ? (
                    <View style={styles.heroSkeleton} />
                ) : (
                    <View style={styles.heroShell}>
                        <LinearGradient
                            colors={["#AE0F24", "#D65320", "#FF9800"]}
                            start={{ x: 0, y: 0.1 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroCard}
                        >
                            <View style={styles.heroContent}>
                                <Text style={styles.heroEyebrow}>{t("home.hero.eyebrow")}</Text>
                                <Text style={styles.heroTitle}>{t("home.hero.title")}</Text>
                                <Text style={styles.heroSubtitle}>{t("home.hero.subtitle")}</Text>
                                <Pressable style={styles.heroButton} onPress={() => router.push("/search")}>
                                    <Text style={styles.heroButtonText}>{t("home.hero.cta")}</Text>
                                </Pressable>
                            </View>
                            <View style={styles.heroArtWrap}>
                                <View style={styles.heroGlow} />
                                <HeroArt width={124} height={124} />
                            </View>
                        </LinearGradient>
                    </View>
                )}

                <View style={styles.sectionHeader}>
                    <View>
                        <Text style={styles.sectionTitle}>{t("home.restaurantsTitle")}</Text>
                    </View>
                </View>

                <View style={styles.restaurantGrid}>
                    {(restaurantsLoading ? Array.from({ length: 2 }) : restaurantList).map((restaurant: any, index: number) => {
                        if (restaurantsLoading) {
                            return <View key={`skeleton-${index}`} style={styles.restaurantSkeleton} />;
                        }

                        const meta = restaurantMeta[index % restaurantMeta.length];
                        const restaurantId = normalizeRestaurantId(restaurant, String(index));
                        const imageUrl = restaurant?.imageUrl || restaurant?.image_url;
                        const source = getRestaurantImageSource(
                            imageUrl,
                            undefined,
                            restaurant?.name || (isTurkish ? "Restoran" : "Restaurant"),
                        );
                        const etaLabel = isTurkish ? meta.eta : meta.eta.replace("dk", "min");
                        const minBasketAmount = meta.minBasket.match(/\d+/)?.[0] ?? "0";
                        const minBasketLabel = isTurkish ? `Min. ${minBasketAmount} ₺` : `Min ${minBasketAmount} ₺`;

                        return (
                            <View key={`${restaurantId}-${index}`} style={styles.restaurantCardShell}>
                                <Pressable
                                    style={styles.restaurantCard}
                                    onPress={() =>
                                        router.push({
                                            pathname: "/restaurants/[id]",
                                            params: { id: restaurantId },
                                        })
                                    }
                                >
                                    <View style={styles.restaurantImageFrame}>
                                        <Image source={source} style={styles.restaurantImage} contentFit="cover" transition={250} />
                                    </View>
                                    <View style={styles.restaurantContent}>
                                        <Text style={styles.restaurantName} numberOfLines={2}>
                                            {restaurant?.name || (isTurkish ? "Restoran" : "Restaurant")}
                                        </Text>
                                        <View style={styles.ratingRow}>
                                            <Text style={styles.ratingSummary}>⭐ {meta.rating} ★★★★★</Text>
                                            <Text style={styles.ratingCount}>{index === 0 ? "(1.2k)" : "(890)"}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <View style={styles.metaBlock}>
                                                <View style={styles.inlineMeta}>
                                                    <Icon name="clock" size={14} color="#FF9800" />
                                                    <Text style={styles.metaText}>{etaLabel}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.metaDivider}>·</Text>
                                            <View style={styles.metaBlock}>
                                                <View style={styles.inlineMeta}>
                                                    <Icon name="bag" size={14} color="#FF9800" />
                                                    <Text style={styles.metaText}>{minBasketLabel}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </Pressable>
                            </View>
                        );
                    })}
                </View>

                <OrderStatusCard />
            </ScrollView>

            <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
                <View style={styles.modalBackdrop}>
                    <Pressable style={styles.modalDismissArea} onPress={() => setSheetVisible(false)} />
                    <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>{t("deliverTo.modalTitle")}</Text>
                        {addresses.length ? (
                            <FlatList
                                data={addresses}
                                keyExtractor={(item) => item.id}
                                renderItem={renderAddressItem}
                                contentContainerStyle={{ paddingBottom: 16 }}
                            />
                        ) : (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>{t("deliverTo.emptyTitle")}</Text>
                                <Text style={styles.emptySubtitle}>{t("deliverTo.emptySubtitle")}</Text>
                            </View>
                        )}
                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.manageButton} onPress={openManageAddresses}>
                                <Text style={styles.manageButtonText}>{t("deliverTo.manage")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={!selectedId}
                                style={[styles.useButton, selectedId ? styles.useButtonEnabled : styles.useButtonDisabled]}
                                onPress={handleUseAddress}
                            >
                                <Text style={styles.useButtonText}>{t("deliverTo.useThis")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const OrderStatusCard = () => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user } = useAuthStore();
    const userId = useMemo(() => user?.id ?? user?.$id ?? user?.accountId ?? "guest", [user?.id, user?.$id, user?.accountId]);
    const [latestOrder, setLatestOrder] = useState<Order | null>(null);
    const orderId = latestOrder?.id ?? "";
    const { status } = useOrderStatus(orderId);

    useEffect(() => {
        if (!userId) return;
        return subscribeUserOrders(userId, (orders) => {
            const pendingOrder = orders.find((order) => order.status === "pending");
            setLatestOrder(pendingOrder ?? null);
        });
    }, [userId]);

    const statusKey: PendingOrderStatus | null = orderId ? status : null;
    if (!statusKey || !latestOrder) return null;

    const stateMap: Record<PendingOrderStatus, { color: string; icon: "clock" | "check" | "close"; title: string; subtitle: string }> = {
        awaiting_confirmation: {
            color: theme.colors.primary,
            icon: "clock",
            title: t("home.orderStatus.waitingTitle"),
            subtitle: t("home.orderStatus.waitingSubtitle"),
        },
        confirmed: {
            color: "#16A34A",
            icon: "check",
            title: t("home.orderStatus.confirmedTitle"),
            subtitle: t("home.orderStatus.confirmedSubtitle"),
        },
        rejected: {
            color: "#DC2626",
            icon: "close",
            title: t("home.orderStatus.rejectedTitle"),
            subtitle: t("home.orderStatus.rejectedSubtitle"),
        },
    };

    const current = stateMap[statusKey];

    return (
        <View style={[styles.orderCard, { backgroundColor: `${current.color}10`, borderColor: `${current.color}26` }]}>
            <View style={[styles.orderIcon, { backgroundColor: `${current.color}18` }]}>
                <Icon name={current.icon} size={18} color={current.color} />
            </View>
            <View style={styles.orderContent}>
                <Text style={styles.orderTitle}>{current.title}</Text>
                <Text style={styles.orderSubtitle}>{current.subtitle}</Text>
            </View>
        </View>
    );
};

const createStyles = (theme: ReturnType<typeof useTheme>["theme"]) =>
    StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: "#FFF8F2",
        },
        content: {
            paddingHorizontal: 20,
            gap: 18,
            backgroundColor: "#FFF8F2",
        },
        header: {
            gap: 6,
        },
        addressHint: {
            fontFamily: "ChairoSans",
            fontSize: 10,
            lineHeight: 12,
            color: "#A48C78",
            textTransform: "uppercase",
        },
        topBar: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "#F2F0F3",
            backgroundColor: "#FFFFFF",
            ...makeShadow({ color: "#98A2B3", offsetY: 12, blurRadius: 28, opacity: 0.12, elevation: 8 }),
        },
        topBarAddress: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            minWidth: 0,
        },
        topBarActions: {
            marginLeft: 6,
            flexShrink: 0,
            transform: [{ scale: 0.9 }],
        },
        addressIcon: {
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFF7EA",
        },
        addressText: {
            marginLeft: 6,
            flex: 1,
            minWidth: 0,
        },
        topBarValue: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 15,
            color: "#16213E",
            flexShrink: 1,
        },
        modalBackdrop: {
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
        },
        modalDismissArea: {
            flex: 1,
        },
        modalSheet: {
            maxHeight: "75%",
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            paddingHorizontal: 20,
            paddingTop: 16,
            rowGap: 16,
        },
        modalHandle: {
            height: 4,
            width: 64,
            borderRadius: 999,
            backgroundColor: "#E5E7EB",
            alignSelf: "center",
        },
        modalTitle: {
            fontSize: 21,
            lineHeight: 25,
            color: "#111827",
            fontFamily: "ChairoSans",
        },
        addressItem: {
            flexDirection: "row",
            alignItems: "center",
            columnGap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 24,
            borderWidth: 1,
            marginBottom: 12,
        },
        addressItemSelected: {
            borderColor: "#FE8C00",
            backgroundColor: "rgba(254, 140, 0, 0.05)",
        },
        addressItemIdle: {
            borderColor: "#E5E7EB",
            backgroundColor: "#FFFFFF",
        },
        addressItemContent: {
            flex: 1,
        },
        addressItemLabel: {
            fontSize: 17,
            lineHeight: 23,
            color: "#111827",
            fontFamily: "ChairoSans",
        },
        addressItemLine: {
            fontSize: 15,
            lineHeight: 21,
            color: "#4B5563",
            fontFamily: "ChairoSans",
        },
        addressItemDetail: {
            fontSize: 13,
            lineHeight: 17,
            color: "#94A3B8",
            fontFamily: "ChairoSans",
        },
        radioOuter: {
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            alignItems: "center",
            justifyContent: "center",
        },
        radioInner: {
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: "#FE8C00",
        },
        emptyState: {
            paddingVertical: 40,
            alignItems: "center",
            rowGap: 8,
        },
        emptyTitle: {
            fontSize: 17,
            lineHeight: 23,
            color: "#1F2937",
            fontFamily: "ChairoSans",
        },
        emptySubtitle: {
            fontSize: 15,
            lineHeight: 21,
            color: "#475569",
            textAlign: "center",
            fontFamily: "ChairoSans",
        },
        actionsRow: {
            flexDirection: "row",
            columnGap: 12,
        },
        manageButton: {
            flex: 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            paddingVertical: 12,
            alignItems: "center",
        },
        manageButtonText: {
            fontSize: 17,
            lineHeight: 23,
            color: "#1F2937",
            fontFamily: "ChairoSans",
        },
        useButton: {
            flex: 1,
            borderRadius: 999,
            paddingVertical: 12,
            alignItems: "center",
        },
        useButtonEnabled: {
            backgroundColor: "#FE8C00",
        },
        useButtonDisabled: {
            backgroundColor: "#E5E7EB",
        },
        useButtonText: {
            fontSize: 17,
            lineHeight: 23,
            color: "#FFFFFF",
            fontFamily: "ChairoSans",
        },
        heroSkeleton: {
            height: 220,
            borderRadius: 40,
            backgroundColor: "#F3E4D6",
        },
        heroShell: {
            borderRadius: 40,
            ...makeShadow({ color: "#B44C18", offsetY: 16, blurRadius: 30, opacity: 0.18, elevation: 10 }),
        },
        heroCard: {
            minHeight: 220,
            borderRadius: 40,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            overflow: "hidden",
        },
        heroContent: {
            flex: 1,
            paddingLeft: 6,
            paddingRight: 10,
        },
        heroEyebrow: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            color: "#FFD092",
            letterSpacing: 0.8,
        },
        heroTitle: {
            marginTop: 6,
            fontFamily: "ChairoSans",
            fontSize: 20,
            lineHeight: 25,
            color: "#FFF9F4",
            maxWidth: 140,
        },
        heroSubtitle: {
            marginTop: 6,
            fontFamily: "ChairoSans",
            fontSize: 11,
            lineHeight: 15,
            color: "rgba(255,249,244,0.88)",
            maxWidth: 138,
        },
        heroButton: {
            alignSelf: "flex-start",
            marginTop: 12,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: "#FFF2DE",
        },
        heroButtonText: {
            fontFamily: "ChairoSans",
            fontSize: 13,
            color: "#16213E",
        },
        heroArtWrap: {
            width: 96,
            height: 96,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 4,
        },
        heroGlow: {
            position: "absolute",
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: "rgba(255,255,255,0.14)",
        },
        sectionHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        sectionTitle: {
            fontFamily: "ChairoSans",
            fontSize: 22,
            lineHeight: 26,
            color: "#15213A",
        },
        restaurantGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 12,
        },
        restaurantSkeleton: {
            width: "48%",
            height: 300,
            borderRadius: 32,
            backgroundColor: "#F1E2D5",
        },
        restaurantCardShell: {
            width: "48%",
            borderRadius: 34,
            ...makeShadow({ color: "#AAB2D5", offsetY: 12, blurRadius: 30, opacity: 0.12, elevation: 5 }),
        },
        restaurantCard: {
            flex: 1,
            borderRadius: 34,
            borderWidth: 1,
            borderColor: "#E8EAF4",
            backgroundColor: "#FFFFFF",
            paddingHorizontal: 12,
            paddingTop: 14,
            paddingBottom: 8,
            overflow: "hidden",
        },
        restaurantImageFrame: {
            width: 92,
            height: 92,
            borderRadius: 26,
            overflow: "hidden",
            backgroundColor: "#FFF5EC",
            alignSelf: "center",
            marginTop: 6,
        },
        restaurantImage: {
            width: "100%",
            height: "100%",
        },
        restaurantContent: {
            paddingTop: 8,
        },
        restaurantName: {
            fontFamily: "ChairoSans",
            fontSize: 17,
            lineHeight: 22,
            textAlign: "center",
            color: "#16213E",
            minHeight: 0,
            paddingHorizontal: 4,
        },
        ratingRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: "#FBF3EA",
        },
        ratingSummary: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            color: "#D89C52",
        },
        ratingCount: {
            marginLeft: 4,
            fontFamily: "ChairoSans",
            fontSize: 12,
            color: "#7D869A",
        },
        metaRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
            paddingTop: 6,
            paddingHorizontal: 12,
            borderTopWidth: 1,
            borderTopColor: "#F3F0EB",
        },
        inlineMeta: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            minWidth: 0,
        },
        metaBlock: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
        },
        metaText: {
            fontFamily: "ChairoSans",
            fontSize: 12,
            color: "#4B556B",
            textAlign: "center",
        },
        metaDivider: {
            marginHorizontal: 6,
            fontFamily: "ChairoSans",
            fontSize: 14,
            color: "#B6B3C2",
        },
        orderCard: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 24,
            borderWidth: 1,
            padding: 16,
            marginTop: 4,
        },
        orderIcon: {
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
        },
        orderContent: {
            flex: 1,
        },
        orderTitle: {
            fontFamily: "ChairoSans",
            fontSize: 14,
            color: theme.colors.ink,
        },
        orderSubtitle: {
            marginTop: 4,
            fontFamily: "ChairoSans",
            fontSize: 12,
            lineHeight: 16,
            color: "#6E625C",
        },
    });

export default HomeTabScreen;
