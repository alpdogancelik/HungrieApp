import { Redirect, Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import useAuthStore from "@/store/auth.store";
import Icon from "@/components/Icon";
import { isAuthRequired } from "@/lib/runtimeEnv";
import { makeShadow } from "@/src/lib/shadowStyle";

// Temporary bypass during testing; restore `isAuthRequired()` when auth is re-enabled.
const authGuardEnabled = false && isAuthRequired();
const WEB_MAX_WIDTH = 960;
const BAR_HEIGHT = 74;
const ACTIVE_ICON_COLOR = "#F28C28";
const INACTIVE_ICON_COLOR = "#8A8178";

function HungrieTabBar({ state, navigation }: BottomTabBarProps) {
    const { width } = useWindowDimensions();
    const effectiveWidth = Platform.OS === "web" ? Math.min(width, WEB_MAX_WIDTH) : width;
    const insets = useSafeAreaInsets();
    const OUTER_MARGIN = 18;
    const INNER_PAD = 16;
    const bubbleSize = 48;
    const containerW = effectiveWidth - OUTER_MARGIN * 2;
    const normalizeRouteName = (name: string) => name.split("/")[0];
    const routeOrder = ["home", "search", "cart", "profile"];
    const orderedRoutes = [
        ...routeOrder
            .map((name) => state.routes.find((route) => normalizeRouteName(route.name) === name))
            .filter(Boolean),
        ...state.routes.filter((route) => !routeOrder.includes(normalizeRouteName(route.name))),
    ] as typeof state.routes;
    const tabW = (containerW - INNER_PAD * 2) / orderedRoutes.length;
    const translateX = useRef(new Animated.Value(0)).current;
    const activeRouteKey = state.routes[state.index]?.key;
    const activeIndex = Math.max(
        0,
        orderedRoutes.findIndex((route) => route.key === activeRouteKey),
    );

    useEffect(() => {
        Animated.timing(translateX, {
            toValue: tabW * activeIndex + (tabW - bubbleSize) / 2,
            duration: 200,
            useNativeDriver: true,
        }).start();
    }, [activeIndex, tabW, translateX]);

    const bottom = Math.max(insets.bottom, 10) + 8;

    return (
        <View
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
                pointerEvents="none"
                style={[
                    styles.indicator,
                    {
                        left: INNER_PAD,
                        width: bubbleSize,
                        height: bubbleSize,
                        borderRadius: bubbleSize / 2,
                        transform: [{ translateX }],
                    },
                ]}
            />

            {orderedRoutes.map((route) => {
                const focused = route.key === activeRouteKey;
                const baseName = normalizeRouteName(route.name);
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
                        style={{ width: tabW, alignItems: "center", justifyContent: "center" }}
                    >
                        {iconNode}
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function TabLayout() {
    const { isAuthenticated } = useAuthStore();
    if (authGuardEnabled && !isAuthenticated) return <Redirect href="/sign-in" />;
    return (
        <Tabs
            initialRouteName="home"
            tabBar={(props: BottomTabBarProps) => <HungrieTabBar {...props} />}
            screenOptions={{
                lazy: false,
                headerShown: false,
                tabBarShowLabel: false,
                tabBarHideOnKeyboard: true,
            }}
        >
            <Tabs.Screen name="home" />
            <Tabs.Screen name="search/index" />
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
        backgroundColor: "#FDE3C6",
        borderWidth: 1,
        borderColor: "#F7C99A",
        ...makeShadow({ color: "#F28C28", offsetY: 3, blurRadius: 8, opacity: 0.18, elevation: 4 }),
    },
});
