import { Redirect, Tabs } from "expo-router";
import useAuthStore from "@/store/auth.store";
import { Text, View } from "react-native";
import Icon, { IconName } from "@/components/Icon";
import cn from "clsx";
import { isAuthRequired } from "@/lib/runtimeEnv";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTranslation } from "react-i18next";

const TabBarIcon = ({ focused, icon, title }: { focused: boolean; icon: IconName; title: string }) => (
    <View className="tab-icon">
        <Icon name={icon} size={24} color={focused ? "#FE8C00" : "#5D5F6D"} />
        <Text className={cn("text-sm font-bold", focused ? "text-primary" : "text-gray-200")}>{title}</Text>
    </View>
);

const authGuardEnabled = isAuthRequired();

export default function TabLayout() {
    const { isAuthenticated } = useAuthStore();
    const { i18n } = useTranslation();
    const isTR = (i18n.language || "").toLowerCase().startsWith("tr");
    const labels = isTR
        ? { home: "Ana Sayfa", search: "Ara", cart: "Sipariş", profile: "Profil" }
        : { home: "Home", search: "Search", cart: "Order", profile: "Profile" };

    if (authGuardEnabled && !isAuthenticated) return <Redirect href="/sign-in" />;

    return (
        <Tabs
            initialRouteName="home"
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: false,
                tabBarStyle: {
                    borderTopLeftRadius: 50,
                    borderTopRightRadius: 50,
                    borderBottomLeftRadius: 50,
                    borderBottomRightRadius: 50,
                    marginHorizontal: 20,
                    height: 80,
                    position: "absolute",
                    bottom: 40,
                    backgroundColor: "white",
                    ...makeShadow({
                        color: "#1a1a1a",
                        offsetY: 2,
                        blurRadius: 4,
                        opacity: 0.1,
                        elevation: 5,
                    }),
                },
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: labels.home,
                    tabBarIcon: ({ focused }) => <TabBarIcon title={labels.home} icon="home" focused={focused} />
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: labels.search,
                    tabBarIcon: ({ focused }) => <TabBarIcon title={labels.search} icon="search" focused={focused} />
                }}
            />
            <Tabs.Screen
                name="cart"
                options={{
                    title: labels.cart,
                    tabBarIcon: ({ focused }) => <TabBarIcon title={labels.cart} icon="bag" focused={focused} />
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: labels.profile,
                    tabBarIcon: ({ focused }) => <TabBarIcon title={labels.profile} icon="profile" focused={focused} />
                }}
            />
        </Tabs>
    );
}







