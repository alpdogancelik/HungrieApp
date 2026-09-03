import { Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import { useCartStore } from "@/store/cart.store";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTheme } from "@/src/theme/themeContext";
const BAR_HEIGHT = Platform.OS === "android" ? 74 : 70;
const INACTIVE_ICON_COLOR = "#8A8178";

const formatCartTotal = (amount: number, isTurkish: boolean) => {
    const rounded = Math.round(amount);
    return isTurkish ? `${rounded} TL` : `${rounded} TL`;
};

function HungrieTabBar({ state, navigation }: BottomTabBarProps) {
    const { theme, variant } = useTheme();
    const { i18n } = useTranslation();
    const cartItems = useCartStore((state) => state.items);
    const cartTotal = useCartStore((state) => state.getTotalPrice());
    const insets = useSafeAreaInsets();
    const isTurkish = i18n.language?.startsWith("tr");
    const OUTER_MARGIN = 16;
    const INNER_PAD = 14;
    const normalizeRouteName = (name: string) => name.split("/")[0];
    const routeOrder = ["home", "search", "cart", "profile"];
    const orderedRoutes = routeOrder
        .map((name) => state.routes.find((route) => normalizeRouteName(route.name) === name))
        .filter(Boolean) as typeof state.routes;
    const activeRouteKey = state.routes[state.index]?.key;

    const bottom = Platform.OS === "android" ? Math.max(insets.bottom, 10) - 0 : Math.max(insets.bottom, 10) - 15;

    return (
        <View
            style={[
                styles.bar,
                {
                    left: OUTER_MARGIN,
                    right: OUTER_MARGIN,
                    bottom,
                    paddingHorizontal: INNER_PAD,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            {orderedRoutes.map((route) => {
                const focused = route.key === activeRouteKey;
                const baseName = normalizeRouteName(route.name);
                const label =
                    baseName === "home"
                        ? isTurkish ? "Ana Sayfa" : "Home"
                        : baseName === "search"
                          ? isTurkish ? "Ara" : "Search"
                          : baseName === "cart"
                            ? isTurkish ? "Sepetim" : "Cart"
                            : isTurkish ? "Profil" : "Profile";
                const cartCount = baseName === "cart" ? cartItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
                const showCartSummary = baseName === "cart" && cartCount > 0;
                const onPress = () => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };
                const color = focused ? theme.colors.primary : variant === "dark" ? theme.colors.textSecondary : INACTIVE_ICON_COLOR;
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
                        android_ripple={{ color: "transparent" }}
                        style={[styles.tabPressable, showCartSummary ? styles.tabPressableCart : null]}
                    >
                        <View style={styles.iconWrap}>
                            {focused ? <View style={styles.iconActiveBubble} /> : null}
                            <View style={styles.iconFrame}>{iconNode}</View>
                            {showCartSummary ? (
                                <View style={styles.cartCountBadge}>
                                    <Text maxFontSizeMultiplier={1} style={styles.cartCountBadgeText}>{cartCount}</Text>
                                </View>
                            ) : null}
                        </View>
                        {showCartSummary ? (
                            <View style={styles.cartTotalPill}>
                                <Text maxFontSizeMultiplier={1.05} style={styles.cartTotalPillText}>{formatCartTotal(cartTotal, isTurkish)}</Text>
                            </View>
                        ) : (
                            <Text
                                maxFontSizeMultiplier={1.05}
                                numberOfLines={1}
                                style={[
                                    styles.label,
                                    { color: theme.colors.textSecondary },
                                    focused ? [styles.labelActive, { color: theme.colors.primary }] : null,
                                ]}
                            >
                                {label}
                            </Text>
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
            <Tabs.Screen name="home" options={{ title: "HungrieApp" }} />
            <Tabs.Screen
                name="search/index"
                options={{
                    title: "HungrieApp",
                }}
            />
            <Tabs.Screen name="cart" options={{ title: "HungrieApp" }} />
            <Tabs.Screen name="profile" options={{ title: "HungrieApp" }} />
            <Tabs.Screen
                name="categories"
                options={{
                    title: "HungrieApp",
                    href: null,
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: "absolute",
        height: BAR_HEIGHT,
        borderRadius: 34,
        backgroundColor: "#F7EBDD",
        borderWidth: 1,
        borderColor: "#F1DDC6",
        flexDirection: "row",
        alignItems: "center",
        ...makeShadow({ color: "#C9A778", offsetY: 10, blurRadius: 24, opacity: 0.2, elevation: 12 }),
    },
    tabPressable: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        backgroundColor: "transparent",
    },
    tabPressableCart: {
        gap: 2,
        justifyContent: "center",
        paddingTop: 2,
    },
    iconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        backgroundColor: "transparent",
    },
    iconActiveBubble: {
        position: "absolute",
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#FDE3C6",
        borderWidth: 1,
        borderColor: "#F7C99A",
    },
    iconFrame: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: Platform.OS === "android" ? 12 : 11,
        color: "#8D7B6D",
    },
    labelActive: {
        color: "#B85C16",
    },
    cartCountBadge: {
        position: "absolute",
        top: -2,
        right: -1,
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
        minWidth: 78,
        paddingHorizontal: 14,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: "#FF8A00",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 0,
    },
    cartTotalPillText: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        lineHeight: 13,
        color: "#FFFFFF",
        textAlign: "center",
        includeFontPadding: false,
    },
});
