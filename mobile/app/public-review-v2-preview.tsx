import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PublicRestaurantReviewsView from "@/src/features/reviews/PublicRestaurantReviewsView";
import type { PublicReviewPageState } from "@/src/features/reviews/publicReviewPageController";
import { useTheme } from "@/src/theme/themeContext";

type FixtureState = "ready" | "loading" | "empty" | "offline" | "error" | "pageError" | "loadingMore";

const reviews = [
    { reviewId: "fixture-1", overallRating: 4.5, tasteRating: 5 as const, speedRating: 4 as const, date: "2026-09-14", comment: "Fresh and quick. Everything arrived warm. Uzun yorum ve büyük metin düzeni için ek fixture içeriği.", items: [{ menuItemId: "pizza", name: "Very long configured Margherita snapshot name", quantity: 2 }, { menuItemId: "ayran", name: "Ayran", quantity: 1 }] },
    { reviewId: "fixture-2", overallRating: 4.5, tasteRating: 4 as const, speedRating: 5 as const, date: "2026-09-03", comment: "", items: [{ menuItemId: "pasta", name: "Pasta", quantity: 1 }] },
];

export default function PublicReviewV2Preview() {
    const { i18n } = useTranslation();
    const { theme, variant, toggleTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const [fixture, setFixture] = useState<FixtureState>("ready");
    const locale = i18n.language?.startsWith("tr") ? "tr" as const : "en" as const;
    const state = useMemo<PublicReviewPageState>(() => ({
        restaurantName: "Ada Pizza & Very Long Restaurant Name",
        summary: fixture === "loading" || fixture === "offline" || fixture === "error" ? null : { restaurantId: "fixture", overallRating: fixture === "empty" ? null : 4.5, tasteRating: fixture === "empty" ? null : 4.6, speedRating: fixture === "empty" ? null : 4.4, reviewCount: fixture === "empty" ? 0 : 24 },
        reviews: ["ready", "pageError", "loadingMore"].includes(fixture) ? reviews : [],
        nextCursor: ["ready", "pageError", "loadingMore"].includes(fixture) ? "opaque-fixture-cursor" : null,
        initialLoading: fixture === "loading",
        refreshing: false,
        loadingMore: fixture === "loadingMore",
        initialError: fixture === "offline" ? "offline" : fixture === "error" ? "service" : null,
        refreshError: false,
        pageError: fixture === "pageError",
    }), [fixture]);
    if (!__DEV__) return <Redirect href="/" />;
    return <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ScrollView horizontal style={[styles.controlsScroll, { marginTop: insets.top }]} contentContainerStyle={styles.controls} showsHorizontalScrollIndicator={false}>
            <Button label={locale === "tr" ? "English" : "Türkçe"} onPress={() => void i18n.changeLanguage(locale === "tr" ? "en" : "tr")} />
            <Button label={variant === "dark" ? "Light" : "Dark"} onPress={toggleTheme} />
            {(["ready", "loading", "empty", "offline", "error", "pageError", "loadingMore"] as FixtureState[]).map((value) => <Button key={value} label={value} onPress={() => setFixture(value)} />)}
        </ScrollView>
        <Text style={[styles.note, { color: theme.colors.textSecondary }]}>Fixture only · no repository or network calls</Text>
        <View style={styles.preview}><PublicRestaurantReviewsView locale={locale} onBack={() => undefined} onLoadMore={() => setFixture("loadingMore")} onRefresh={() => undefined} onRetry={() => setFixture("ready")} state={state} /></View>
    </View>;
}

const Button = ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>;
const styles = StyleSheet.create({
    root: { flex: 1 }, preview: { flex: 1 }, controlsScroll: { flexGrow: 0, maxHeight: 64 }, controls: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: "center" }, button: { minHeight: 44, borderRadius: 12, backgroundColor: "#FE8C00", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#FFFFFF", fontFamily: "ChairoSans", fontWeight: "700" }, note: { paddingHorizontal: 14, paddingVertical: 6, fontFamily: "ChairoSans", fontSize: 12 },
});
