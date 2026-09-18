import { Ionicons } from "@expo/vector-icons";
import type { PublicRestaurantReview } from "@hungrie/domain";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/themeContext";
import type { PublicReviewPageState } from "./publicReviewPageController";
import { formatCoarseReviewDate, formatPublicReviewItems, getPublicReviewCopy, type PublicReviewLocale } from "./publicReviewPageModel";

const score = (value: number | null) => value === null ? "—" : value.toFixed(1);
const stars = (value: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(value)));
    return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
};

export default function PublicRestaurantReviewsView({ state, locale, onBack, onRetry, onRefresh, onLoadMore }: {
    state: PublicReviewPageState;
    locale: PublicReviewLocale;
    onBack: () => void;
    onRetry: () => void;
    onRefresh: () => void;
    onLoadMore: () => void;
}) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const copy = getPublicReviewCopy(locale);
    const colors = theme.colors;

    const header = (
        <View style={styles.headerArea}>
            <View style={styles.titleRow}>
                <Pressable accessibilityLabel={locale === "tr" ? "Geri" : "Back"} accessibilityRole="button" hitSlop={8} onPress={onBack} style={[styles.back, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Ionicons name="chevron-back" size={24} color={colors.ink} />
                </Pressable>
                <View style={styles.titleCopy}>
                    <Text style={[styles.title, { color: colors.ink }]}>{state.restaurantName || (locale === "tr" ? "Restoran" : "Restaurant")}</Text>
                    <Text style={[styles.explanation, { color: colors.textSecondary }]}>{copy.explanation}</Text>
                </View>
            </View>
            {state.summary ? (
                <View accessibilityLabel={`${copy.overall} ${score(state.summary.overallRating)}, ${copy.reviews(state.summary.reviewCount)}`} style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
                    <View style={styles.summaryTop}>
                        <View>
                            <Text style={[styles.overall, { color: colors.ink }]}>{score(state.summary.overallRating)}</Text>
                            {state.summary.overallRating !== null ? <Text accessibilityElementsHidden style={[styles.stars, { color: colors.primary }]}>{stars(state.summary.overallRating)}</Text> : null}
                        </View>
                        <Text style={[styles.count, { color: colors.textSecondary }]}>{copy.reviews(state.summary.reviewCount)}</Text>
                    </View>
                    <View style={styles.metrics}>
                        {[[copy.taste, state.summary.tasteRating], [copy.speed, state.summary.speedRating]].map(([label, value]) => (
                            <View accessibilityLabel={`${label} ${score(value as number | null)}`} key={String(label)} style={[styles.metric, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
                                <Text style={[styles.metricValue, { color: colors.ink }]}>{score(value as number | null)}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            ) : null}
            {state.reviews.length ? <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>{copy.recent}</Text> : null}
            {state.refreshError ? <View accessibilityRole="alert" style={[styles.inlineError, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}><Ionicons name="alert-circle-outline" size={19} color={colors.danger} /><Text style={[styles.inlineErrorText, { color: colors.danger }]}>{copy.loadErrorBody}</Text><Pressable accessibilityRole="button" onPress={onRetry}><Text style={[styles.inlineRetry, { color: colors.primary }]}>{copy.retry}</Text></Pressable></View> : null}
        </View>
    );

    if (state.initialLoading) return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right", "bottom"]}>
            <View accessibilityLabel={copy.loading} style={[styles.center, styles.webWidth]}>
                <View style={styles.skeletonTitleRow}>
                    <Pressable accessibilityLabel={locale === "tr" ? "Geri" : "Back"} accessibilityRole="button" hitSlop={8} onPress={onBack} style={[styles.back, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Ionicons name="chevron-back" size={24} color={colors.ink} />
                    </Pressable>
                    <View style={[styles.skeletonTitle, { backgroundColor: colors.surfaceMuted }]} />
                </View>
                <View style={[styles.skeletonSummary, { backgroundColor: colors.surface, borderColor: colors.border }]} />
                {[0, 1].map((item) => <View key={item} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]} />)}
            </View>
        </SafeAreaView>
    );

    if (state.initialError) return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right", "bottom"]}>
            <View style={[styles.errorHeader, styles.webWidth]}>{header}</View>
            <View accessibilityRole="alert" style={styles.stateCenter}>
                <View style={[styles.stateIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name={state.initialError === "offline" ? "cloud-offline-outline" : "alert-circle-outline"} size={34} color={colors.primary} /></View>
                <Text style={[styles.stateTitle, { color: colors.ink }]}>{state.initialError === "offline" ? copy.offlineTitle : copy.loadErrorTitle}</Text>
                <Text style={[styles.stateBody, { color: colors.textSecondary }]}>{state.initialError === "offline" ? copy.offlineBody : copy.loadErrorBody}</Text>
                <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Ionicons name="refresh" size={19} color={colors.onPrimary} /><Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>{copy.retry}</Text></Pressable>
            </View>
        </SafeAreaView>
    );

    const footer = state.nextCursor || state.pageError ? (
        <View style={styles.footer}>
            {state.pageError ? <Text accessibilityRole="alert" style={[styles.pageError, { color: colors.danger }]}>{copy.pageError}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.loadingMore }} disabled={state.loadingMore} onPress={onLoadMore} style={[styles.loadMore, { backgroundColor: colors.surface, borderColor: colors.border }, state.loadingMore && styles.disabled]}>
                {state.loadingMore ? <Ionicons name="hourglass-outline" size={18} color={colors.primary} /> : null}
                <Text style={[styles.loadMoreText, { color: colors.primary }]}>{state.loadingMore ? copy.loadingMore : state.pageError ? copy.retry : copy.loadMore}</Text>
            </Pressable>
        </View>
    ) : <View style={styles.footerSpace} />;

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
            <FlatList<PublicRestaurantReview>
                style={styles.webWidth}
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 16 }]}
                data={state.reviews}
                keyExtractor={(item) => item.reviewId}
                ListHeaderComponent={header}
                ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="chatbubble-ellipses-outline" size={30} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{copy.empty}</Text></View>}
                ListFooterComponent={footer}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                refreshControl={<RefreshControl accessibilityLabel={copy.refreshing} refreshing={state.refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
                renderItem={({ item }) => {
                    const itemText = formatPublicReviewItems(item.items, locale);
                    const date = formatCoarseReviewDate(item.date, locale);
                    return <View accessibilityLabel={`${date}. ${copy.overall} ${item.overallRating.toFixed(1)}. ${copy.taste} ${item.tasteRating}. ${copy.speed} ${item.speedRating}.`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
                        <View style={styles.cardTop}><Text style={[styles.date, { color: colors.textSecondary }]}>{date}</Text><Text style={[styles.cardOverall, { color: colors.primary }]}>{copy.overall} {item.overallRating.toFixed(1)}</Text></View>
                        <View style={styles.cardScores}><Text style={[styles.cardScore, { color: colors.ink }]}>{copy.taste} {item.tasteRating.toFixed(1)}</Text><View style={[styles.dot, { backgroundColor: colors.muted }]} /><Text style={[styles.cardScore, { color: colors.ink }]}>{copy.speed} {item.speedRating.toFixed(1)}</Text></View>
                        {item.comment.trim() ? <Text style={[styles.comment, { color: colors.ink }]}>{item.comment.trim()}</Text> : null}
                        {itemText ? <Text style={[styles.items, { color: colors.textSecondary }]}>{itemText}</Text> : null}
                    </View>;
                }}
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 }, webWidth: Platform.select({ web: { width: "100%", maxWidth: 720, alignSelf: "center" }, default: { width: "100%" } }),
    content: { paddingTop: 10 }, headerArea: { gap: 16, marginHorizontal: 18, marginBottom: 14 }, titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" }, titleCopy: { flex: 1, minWidth: 0 },
    title: { fontFamily: "ChairoSans", fontSize: 25, lineHeight: 32, fontWeight: "800" }, explanation: { marginTop: 2, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 20 },
    summary: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16, ...Platform.select({ android: { elevation: 2 }, web: { boxShadow: "0 8px 22px rgba(15,23,42,0.06)" }, default: { shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } } }) },
    summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, overall: { fontFamily: "ChairoSans", fontSize: 44, lineHeight: 50, fontWeight: "800" }, stars: { fontFamily: "ChairoSans", fontSize: 15, letterSpacing: 1 }, count: { fontFamily: "ChairoSans", fontSize: 14, lineHeight: 20 },
    metrics: { flexDirection: "row", gap: 10 }, metric: { flex: 1, minHeight: 72, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }, metricLabel: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18 }, metricValue: { fontFamily: "ChairoSans", fontSize: 21, lineHeight: 28, fontWeight: "800" },
    sectionTitle: { fontFamily: "ChairoSans", fontSize: 20, lineHeight: 27, fontWeight: "800" }, card: { marginHorizontal: 18, borderWidth: 1, borderRadius: 20, padding: 16, gap: 11, ...Platform.select({ android: { elevation: 1 }, web: { boxShadow: "0 5px 16px rgba(15,23,42,0.05)" }, default: { shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } } }) },
    cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }, date: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18 }, cardOverall: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, fontWeight: "800" }, cardScores: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }, cardScore: { fontFamily: "ChairoSans", fontSize: 14, lineHeight: 20, fontWeight: "700" }, dot: { width: 4, height: 4, borderRadius: 2 }, comment: { fontFamily: "ChairoSans", fontSize: 16, lineHeight: 24 }, items: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 20 }, separator: { height: 12 },
    footer: { paddingVertical: 18, alignItems: "center", gap: 10 }, footerSpace: { height: 14 }, pageError: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 19, textAlign: "center" }, loadMore: { minHeight: 48, minWidth: 210, borderWidth: 1, borderRadius: 24, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, loadMoreText: { fontFamily: "ChairoSans", fontSize: 15, lineHeight: 20, fontWeight: "800" }, disabled: { opacity: 0.64 },
    empty: { marginHorizontal: 18, borderWidth: 1, borderRadius: 20, padding: 26, alignItems: "center", gap: 10 }, emptyText: { fontFamily: "ChairoSans", fontSize: 15, lineHeight: 22, textAlign: "center" }, inlineError: { minHeight: 44, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }, inlineErrorText: { flex: 1, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 19 }, inlineRetry: { fontFamily: "ChairoSans", fontSize: 13, fontWeight: "800" },
    center: { flex: 1, padding: 20, gap: 18 }, skeletonTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 }, skeletonTitle: { width: "62%", height: 34, borderRadius: 10 }, skeletonSummary: { height: 190, borderRadius: 24, borderWidth: 1 }, skeletonCard: { height: 154, borderRadius: 20, borderWidth: 1 }, errorHeader: { paddingHorizontal: 18, paddingTop: 10 }, stateCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }, stateIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" }, stateTitle: { marginTop: 16, fontFamily: "ChairoSans", fontSize: 22, lineHeight: 29, fontWeight: "800", textAlign: "center" }, stateBody: { marginTop: 8, fontFamily: "ChairoSans", fontSize: 15, lineHeight: 22, textAlign: "center" }, primaryButton: { minHeight: 48, marginTop: 20, borderRadius: 24, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryButtonText: { fontFamily: "ChairoSans", fontSize: 15, fontWeight: "800" },
});
