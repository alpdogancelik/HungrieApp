import { Redirect, Tabs } from "expo-router";
import React, { useRef, useEffect } from "react";
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import useAuthStore from "@/store/auth.store";
import Icon from "@/components/Icon";
import { isAuthRequired } from "@/lib/runtimeEnv";
import { makeShadow } from "@/src/lib/shadowStyle";

const authGuardEnabled = isAuthRequired();

function HungrieTabBar({ state, navigation }: BottomTabBarProps) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const OUTER_MARGIN = 16;
    const INNER_PAD = 10;
    const bubbleSize = 44;
    const containerW = width - OUTER_MARGIN * 2;
    const tabW = (containerW - INNER_PAD * 2) / state.routes.length;
    const translateX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(translateX, {
            toValue: tabW * state.index + (tabW - bubbleSize) / 2,
            duration: 200,
            useNativeDriver: true,
        }).start();
    }, [state.index, tabW]);

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
                        width: bubbleSize,
                        height: bubbleSize,
                        borderRadius: bubbleSize / 2,
                        transform: [{ translateX }],
                    },
                ]}
            />

            {state.routes.map((route, index) => {
                const focused = state.index === index;
                const onPress = () => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };
                const color = focused ? "#FE8C00" : "#6B7280";
                let iconNode;
                if (route.name === "home") {
                    iconNode = <Icon name="home" size={24} color={color} />;
                } else if (route.name === "search") {
                    iconNode = <Icon name="searchTab" size={24} color={color} />;
                } else if (route.name === "cart") {
                    iconNode = <Icon name="bag" size={24} color={color} />;
                } else {
                    iconNode = <Icon name="profile" size={24} color={color} />;
                }
                return (
                    <Pressable
                        key={route.key}
                        onPress={onPress}
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
            <Tabs.Screen name="search" />
            <Tabs.Screen name="cart" />
            <Tabs.Screen name="profile" />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: "absolute",
        height: 72,
        borderRadius: 999,
        backgroundColor: "#F8EFE5",
        flexDirection: "row",
        alignItems: "center",
        ...makeShadow({ color: "#000", offsetY: 4, blurRadius: 16, opacity: 0.1, elevation: 8 }),
    },
    indicator: {
        position: "absolute",
        left: 10,
        backgroundColor: "rgba(254,140,0,0.16)",
    },
});



