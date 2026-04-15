import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import { useCartStore } from "@/store/cart.store";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";
import { makeShadow } from "@/src/lib/shadowStyle";
const WEB_MAX_WIDTH = 960;
const BAR_HEIGHT = 88;
const ACTIVE_ICON_COLOR = "#F28C28";
const INACTIVE_ICON_COLOR = "#8A8178";
const USE_NATIVE_DRIVER = Platform.OS !== "web";

const formatCartTotal = (amount: number, isTurkish: boolean) => {
    const rounded = Math.round(amount);
    return isTurkish ? `${rounded} TL` : `${rounded} TL`;
};

function HungrieTabBar({ state, navigation }: BottomTabBarProps) {
    const { i18n } = useTranslation();
    const { width } = useStableWindowDimensions();
    const cartItems = useCartStore((state) => state.items);
    const cartTotal = useCartStore((state) => state.getTotalPrice());
    const effectiveWidth = Platform.OS === "web" ? Math.min(width, WEB_MAX_WIDTH) : width;
    const insets = useSafeAreaInsets();
    const isTurkish = i18n.language?.startsWith("tr");
    const OUTER_MARGIN = 18;
    const INNER_PAD = 16;
    const containerW = effectiveWidth - OUTER_MARGIN * 2;
    const normalizeRouteName = (name: string) => name.split("/")[0];
    const routeOrder = ["home", "search", "cart", "profile"];
    const orderedRoutes = [
        ...routeOrder
            .map((name) => state.routes.find((route) => normalizeRouteName(route.name) === name))
            .filter(Boolean),
        ...state.routes.filter((route) => !routeOrder.includes(normalizeRouteName(route.name))),
    ] as typeof state.routes;
    const measuredBarWidth = useRef(0);
    const fallbackTabW = (containerW - INNER_PAD * 2) / orderedRoutes.length;
    const tabW =
        measuredBarWidth.current > 0
            ? (measuredBarWidth.current - INNER_PAD * 2) / orderedRoutes.length
            : fallbackTabW;
    const translateX = useRef(new Animated.Value(0)).current;
    const activeRouteKey = state.routes[state.index]?.key;
    const activeIndex = Math.max(
        0,
        orderedRoutes.findIndex((route) => route.key === activeRouteKey),
    );

    useEffect(() => {
        Animated.timing(translateX, {
            toValue: tabW * activeIndex,
            duration: 200,
            useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
    }, [activeIndex, tabW, translateX]);

    const bottom = Math.max(insets.bottom, 10) - 15;
    const handleLayout = (event: LayoutChangeEvent) => {
        measuredBarWidth.current = event.nativeEvent.layout.width;
    };

    return (
        <View
            onLayout={handleLayout}
            style={[
                styles.bar,
                {
                    left: OUTER_MARGIN,
                    right: OUTER_MARGIN,
                    bottom,
                    paddingHorizontal: INNER_PAD,
                },
            ]}
        >
            {/* kayan highlight */}
            <Animated.View
                style={[
                    styles.indicator,
                    {
                        pointerEvents: "none",
                        left: INNER_PAD,
                        width: tabW,
                        transform: [{ translateX }],
                    },
                ]}
            />

            {orderedRoutes.map((route) => {
                const focused = route.key === activeRouteKey;
                const baseName = normalizeRouteName(route.name);
                const label =
                    baseName === "home"
                        ? isTurkish ? "Ana Sayfa" : "Home"
                        : baseName === "search"
                          ? isTurkish ? "Ara" : "Search"
                          : baseName === "cart"
                            ? isTurkish ? "Sepet" : "Bag"
                            : isTurkish ? "Profil" : "Profile";
                const cartCount = baseName === "cart" ? cartItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
                const showCartSummary = baseName === "cart" && cartCount > 0;
                const onPress = () => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };
                const color = focused ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR;
                let iconNode;
                if (baseName === "home") {
                    iconNode = <Icon name="home" size={24} color={color} />;
                } else if (baseName === "search") {
                    iconNode = <Icon name="search" size={24} color={color} />;
                } else if (baseName === "cart") {
                    iconNode = <Icon name="bag" size={24} color={color} />;
                } else {
                    iconNode = <Icon name="profile" size={24} color={color} />;
                }
                return (
                    <Pressable
                        key={route.key}
                        onPress={onPress}
                        hitSlop={10}
                        style={[styles.tabPressable, showCartSummary ? styles.tabPressableCart : null]}
                    >
                        <View style={[styles.iconWrap, focused ? styles.iconWrapActive : null]}>
                            <View style={styles.iconFrame}>{iconNode}</View>
                            {showCartSummary ? (
                                <View style={styles.cartCountBadge}>
                                    <Text style={styles.cartCountBadgeText}>{cartCount}</Text>
                                </View>
                            ) : null}
                        </View>
                        {showCartSummary ? (
                            <View style={styles.cartTotalPill}>
                                <Text style={styles.cartTotalPillText}>{formatCartTotal(cartTotal, isTurkish)}</Text>
                            </View>
                        ) : (
                            <Text style={[styles.label, focused ? styles.labelActive : null]}>{label}</Text>
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function TabLayout() {
    return (
        <Tabs
            initialRouteName="home"
            tabBar={(props: BottomTabBarProps) => <HungrieTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: false,
                tabBarHideOnKeyboard: true,
            }}
        >
            <Tabs.Screen name="home" />
            <Tabs.Screen
                name="search/index"
                options={{
                    title: "Search",
                    unmountOnBlur: true,
                }}
            />
            <Tabs.Screen name="cart" />
            <Tabs.Screen name="profile" />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: "absolute",
        height: BAR_HEIGHT,
        borderRadius: 40,
        backgroundColor: "#F7EBDD",
        borderWidth: 1,
        borderColor: "#F1DDC6",
        flexDirection: "row",
        alignItems: "center",
        ...makeShadow({ color: "#C9A778", offsetY: 10, blurRadius: 24, opacity: 0.2, elevation: 12 }),
    },
    indicator: {
        position: "absolute",
        top: 0,
        bottom: 0,
    },
    tabPressable: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
    },
    tabPressableCart: {
        gap: 0,
    },
    iconWrap: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
    },
    iconWrapActive: {
        backgroundColor: "#FDE3C6",
        borderWidth: 1,
        borderColor: "#F7C99A",
    },
    iconFrame: {
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#8D7B6D",
    },
    labelActive: {
        color: "#B85C16",
    },
    cartCountBadge: {
        position: "absolute",
        top: -3,
        right: -2,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 4,
        backgroundColor: "#FF8A00",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#F7EBDD",
    },
    cartCountBadgeText: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        lineHeight: 12,
        color: "#FFFFFF",
    },
    cartTotalPill: {
        minWidth: 70,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "#FF8A00",
        alignItems: "center",
        justifyContent: "center",
        marginTop: -2,
    },
    cartTotalPillText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 14,
        color: "#FFFFFF",
    },
});
