import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";

import BottomNavigation from "@/src/features/navigation/BottomNavigation";

export default function TabLayout() {
    return (
        <Tabs
            initialRouteName="home"
            tabBar={(props: BottomTabBarProps) => <BottomNavigation {...props} />}
            screenOptions={{
                headerShown: false,
                tabBarHideOnKeyboard: true,
                tabBarShowLabel: false,
            }}
        >
            <Tabs.Screen name="home" options={{ title: "HungrieApp" }} />
            <Tabs.Screen name="search/index" options={{ title: "HungrieApp" }} />
            <Tabs.Screen name="cart" options={{ title: "HungrieApp" }} />
            <Tabs.Screen name="profile" options={{ title: "HungrieApp" }} />
            <Tabs.Screen name="categories" options={{ href: null, title: "HungrieApp" }} />
        </Tabs>
    );
}
