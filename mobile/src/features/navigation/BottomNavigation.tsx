import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/theme/themeContext";
import { showUserMessage } from "@/src/lib/showUserMessage";
import useAuthStore from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";

const ORANGE = "#FF5A1F";
const ITEMS = [
    { key: "home", route: "home", en: "Home", tr: "Ana Sayfa", icon: "home" },
    { key: "search", route: "search", en: "Search", tr: "Ara", icon: "search-outline" },
    { key: "cart", route: "cart", en: "Cart", tr: "Sepetim", icon: "bag-outline" },
    { key: "profile", route: "profile", en: "Profile", tr: "Profil", icon: "person-outline" },
] as const;

const normalizeRouteName = (name: string) => name.split("/")[0];
const formatCartTotal = (amount: number) => `${Math.round(amount)} TL`;

type NavigationItem = (typeof ITEMS)[number];

const NavigationBar = ({
    activeRoute = "",
    onNavigate,
}: {
    activeRoute?: string;
    onNavigate: (item: NavigationItem, active: boolean) => void;
}) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { i18n, t } = useTranslation();
    const { variant } = useTheme();
    const isDark = variant === "dark";
    const inactive = isDark ? "#CBD5E1" : "#344054";
    const navigationBackground = isDark ? "#171A20" : "#FFFFFF";
    const isTurkish = i18n.language?.startsWith("tr");
    const isAuthenticated = useAuthStore((authState) => authState.isAuthenticated);
    const cartCount = useCartStore((state) => state.totalItems);
    const cartTotal = useCartStore((state) => state.totalPrice);

    return (
        <View
            accessibilityRole="tablist"
            style={[
                styles.navigation,
                {
                    minHeight: 45 + Math.max(insets.bottom, Platform.OS === "web" ? 8 : 0),
                    paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 8 : 0),
                    backgroundColor: navigationBackground,
                    borderColor: isDark ? "#2A2E35" : "#E5E7EB",
                },
            ]}
        >
            {ITEMS.map((item) => {
                const active = item.route === activeRoute;
                const color = active ? ORANGE : inactive;
                const showCartSummary = item.key === "cart" && cartCount > 0;
                const label = isTurkish ? item.tr : item.en;
                const onPress = () => {
                    if (item.key === "cart" && !isAuthenticated) {
                        showUserMessage(t("authRequired.cartTitle"), t("authRequired.cartBody"));
                        router.push("/sign-in");
                        return;
                    }
                    onNavigate(item, active);
                };
                return (
                    <Pressable
                        accessibilityLabel={showCartSummary
                            ? `${label}, ${cartCount} ${isTurkish ? "ürün" : cartCount === 1 ? "item" : "items"}, ${formatCartTotal(cartTotal)}`
                            : label}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        disabled={active}
                        hitSlop={5}
                        key={item.key}
                        onPress={onPress}
                        style={styles.item}
                    >
                        <View style={styles.iconWrap}>
                            <Ionicons color={color} name={item.icon} size={20} />
                            {showCartSummary ? (
                                <View style={[styles.cartCountBadge, { borderColor: navigationBackground }]}>
                                    <Text maxFontSizeMultiplier={1} style={styles.cartCountBadgeText}>{cartCount}</Text>
                                </View>
                            ) : null}
                        </View>
                        {showCartSummary ? (
                            <View style={styles.cartTotalPill}>
                                <Text maxFontSizeMultiplier={1} numberOfLines={1} style={styles.cartTotalPillText}>
                                    {formatCartTotal(cartTotal)}
                                </Text>
                            </View>
                        ) : (
                            <Text numberOfLines={1} style={[styles.label, { color }, active && styles.activeLabel]}>
                                {label}
                            </Text>
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
};

const BottomNavigation = ({ state, navigation }: BottomTabBarProps) => {
    const activeRoute = normalizeRouteName(state.routes[state.index]?.name || "");

    return (
        <NavigationBar
            activeRoute={activeRoute}
            onNavigate={(item, active) => {
                const route = state.routes.find((candidate) => normalizeRouteName(candidate.name) === item.route);
                if (!route) return;
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
            }}
        />
    );
};

export const StandaloneBottomNavigation = () => {
    const router = useRouter();

    return (
        <NavigationBar
            onNavigate={(item) => {
                if (item.route === "home") router.replace("/(tabs)/home");
                if (item.route === "search") router.replace("/(tabs)/search");
                if (item.route === "cart") router.replace("/(tabs)/cart");
                if (item.route === "profile") router.replace("/(tabs)/profile");
            }}
        />
    );
};

const styles = StyleSheet.create({
    navigation: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 10,
        paddingTop: 3,
    },
    item: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", gap: 1 },
    iconWrap: { width: 24, height: 20, alignItems: "center", justifyContent: "center", position: "relative" },
    label: { fontSize: 10.5, lineHeight: 12, fontWeight: "500" },
    activeLabel: { fontWeight: "600" },
    cartCountBadge: {
        position: "absolute",
        top: -5,
        right: -7,
        minWidth: 15,
        height: 15,
        borderRadius: 8,
        paddingHorizontal: 3,
        backgroundColor: ORANGE,
        borderWidth: 1.5,
        alignItems: "center",
        justifyContent: "center",
    },
    cartCountBadgeText: { color: "#FFFFFF", fontSize: 8.5, lineHeight: 10, fontWeight: "700" },
    cartTotalPill: {
        minWidth: 48,
        height: 14,
        borderRadius: 7,
        paddingHorizontal: 5,
        backgroundColor: ORANGE,
        alignItems: "center",
        justifyContent: "center",
    },
    cartTotalPillText: { color: "#FFFFFF", fontSize: 8.5, lineHeight: 10, fontWeight: "600" },
});

export default BottomNavigation;
