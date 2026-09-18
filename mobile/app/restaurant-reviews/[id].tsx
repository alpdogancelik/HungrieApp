import { useFocusEffect } from "@react-navigation/native";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useTranslation } from "react-i18next";
import { getRestaurant } from "@/src/data/restaurantRepository";
import {
    getRestaurantReviewSummaryV2,
    listPublishedRestaurantReviewsV2,
    refreshPublishedRestaurantReviewsV2,
    refreshRestaurantReviewSummaryV2,
} from "@/src/data/reviewV2Repository";
import PublicRestaurantReviewsView from "@/src/features/reviews/PublicRestaurantReviewsView";
import { createPublicReviewPageController, type PublicReviewPageState } from "@/src/features/reviews/publicReviewPageController";

const initialState = (): PublicReviewPageState => ({
    restaurantName: "",
    summary: null,
    reviews: [],
    nextCursor: null,
    initialLoading: true,
    refreshing: false,
    loadingMore: false,
    initialError: null,
    refreshError: false,
    pageError: false,
});

export default function RestaurantReviewsScreen() {
    const router = useRouter();
    const { i18n } = useTranslation();
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const restaurantId = Array.isArray(id) ? String(id[0] || "") : String(id || "");
    const locale = i18n.language?.toLowerCase().startsWith("tr") ? "tr" as const : "en" as const;
    const [state, setState] = useState<PublicReviewPageState>(initialState);

    const controller = useMemo(() => createPublicReviewPageController({
        loadRestaurantName: async () => {
            if (!restaurantId) throw new Error("Restaurant unavailable");
            const restaurant = await getRestaurant(restaurantId);
            return String(restaurant?.name || (locale === "tr" ? "Restoran" : "Restaurant"));
        },
        loadSummary: (force) => force
            ? refreshRestaurantReviewSummaryV2(restaurantId)
            : getRestaurantReviewSummaryV2(restaurantId),
        loadPage: (cursor, force) => force && cursor === null
            ? refreshPublishedRestaurantReviewsV2(restaurantId, { limit: 20 })
            : listPublishedRestaurantReviewsV2(restaurantId, { cursor, limit: 20 }),
        isOffline: async () => {
            const network = await Network.getNetworkStateAsync();
            return network.isConnected === false || network.isInternetReachable === false;
        },
    }, setState), [locale, restaurantId]);

    useEffect(() => {
        setState(initialState());
        return () => controller.dispose();
    }, [controller]);

    useFocusEffect(useCallback(() => {
        void controller.refresh(true);
    }, [controller]));

    useEffect(() => {
        const appState = AppState.addEventListener("change", (next) => {
            if (next === "active") void controller.refresh(true);
        });
        const network = Network.addNetworkStateListener((next) => {
            if (next.isConnected && next.isInternetReachable !== false && controller.getState().initialError === "offline") {
                void controller.refresh(true);
            }
        });
        return () => { appState.remove(); network.remove(); };
    }, [controller]);

    const back = useCallback(() => {
        if (router.canGoBack()) router.back();
        else if (restaurantId) router.replace({ pathname: "/restaurants/[id]", params: { id: restaurantId } });
        else router.replace("/");
    }, [restaurantId, router]);

    return <PublicRestaurantReviewsView
        locale={locale}
        onBack={back}
        onLoadMore={() => void controller.loadMore()}
        onRefresh={() => void controller.refresh(true)}
        onRetry={() => state.pageError ? void controller.loadMore() : void controller.refresh(true)}
        state={state}
    />;
}
