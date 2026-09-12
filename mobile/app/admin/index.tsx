import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/theme/themeContext";
import { makeShadow } from "@/src/lib/shadowStyle";

const modules = [
    {
        title: "Operations",
        description: "Review live orders, update statuses, and manage restaurant menus.",
        icon: "speedometer-outline" as const,
        route: "/admin/SuperAdminDashboard",
        cta: "Open operations",
    },
    {
        title: "Users",
        description: "Customer and staff management will be added here.",
        icon: "people-outline" as const,
        route: null,
        cta: "Coming soon",
    },
    {
        title: "Restaurants",
        description: "Restaurant onboarding, ownership, and availability tools will be added here.",
        icon: "storefront-outline" as const,
        route: null,
        cta: "Coming soon",
    },
    {
        title: "Security",
        description: "Admin access requires matching Firebase and Supabase authorization.",
        icon: "shield-checkmark-outline" as const,
        route: null,
        cta: "Dual-role protected",
    },
];

export default function AdminPanel() {
    const router = useRouter();
    const { theme } = useTheme();

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View style={[styles.headerIcon, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                        <Ionicons name="shield-checkmark-outline" size={26} color="#FE8C00" />
                    </View>
                    <View style={styles.headerCopy}>
                        <Text style={[styles.title, { color: theme.colors.ink }]}>Admin Panel</Text>
                        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                            Secure workspace for platform operations.
                        </Text>
                    </View>
                </View>

                <View style={styles.grid}>
                    {modules.map((item) => {
                        const enabled = Boolean(item.route);
                        return (
                            <Pressable
                                key={item.title}
                                disabled={!enabled}
                                onPress={() => {
                                    if (item.route) router.push(item.route as any);
                                }}
                                style={({ pressed }) => [
                                    styles.card,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        opacity: enabled ? 1 : 0.72,
                                        transform: [{ scale: pressed ? 0.99 : 1 }],
                                    },
                                ]}
                            >
                                <View style={styles.cardTop}>
                                    <View style={styles.moduleIcon}>
                                        <Ionicons name={item.icon} size={22} color="#FE8C00" />
                                    </View>
                                    <Ionicons name={enabled ? "chevron-forward" : "lock-closed-outline"} size={18} color={theme.colors.textSecondary} />
                                </View>
                                <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>{item.title}</Text>
                                <Text style={[styles.cardBody, { color: theme.colors.textSecondary }]}>{item.description}</Text>
                                <Text style={[styles.cardCta, { color: enabled ? "#FE8C00" : theme.colors.muted }]}>{item.cta}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 28,
        paddingBottom: 120,
        gap: 22,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    headerIcon: {
        width: 54,
        height: 54,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    headerCopy: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 32,
        lineHeight: 38,
    },
    subtitle: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 21,
    },
    grid: {
        gap: 14,
    },
    card: {
        borderWidth: 1,
        borderRadius: 22,
        padding: 18,
        gap: 10,
        ...makeShadow({ color: "#111827", offsetY: 8, blurRadius: 24, opacity: 0.08, elevation: 5 }),
    },
    cardTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    moduleIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: "#FFF3E1",
        alignItems: "center",
        justifyContent: "center",
    },
    cardTitle: {
        fontFamily: "ChairoSans",
        fontSize: 22,
        lineHeight: 28,
    },
    cardBody: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
    },
    cardCta: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 20,
    },
});
