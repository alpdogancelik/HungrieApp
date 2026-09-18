import type { CursorPage, PublicRestaurantReview, RestaurantReviewSummaryV2 } from "@hungrie/domain";
import { mergePublicReviewPages, safeNextPublicReviewCursor } from "./publicReviewPageModel";

export type PublicReviewPageState = {
    restaurantName: string;
    summary: RestaurantReviewSummaryV2 | null;
    reviews: PublicRestaurantReview[];
    nextCursor: string | null;
    initialLoading: boolean;
    refreshing: boolean;
    loadingMore: boolean;
    initialError: "offline" | "service" | null;
    refreshError: boolean;
    pageError: boolean;
};

export type PublicReviewPageDependencies = {
    loadRestaurantName: () => Promise<string>;
    loadSummary: (force: boolean) => Promise<RestaurantReviewSummaryV2>;
    loadPage: (cursor: string | null, force: boolean) => Promise<CursorPage<PublicRestaurantReview>>;
    isOffline: () => Promise<boolean>;
};

export const createPublicReviewPageController = (
    dependencies: PublicReviewPageDependencies,
    publish: (state: PublicReviewPageState) => void,
) => {
    let generation = 0;
    let refreshPromise: Promise<void> | null = null;
    let pagePromise: Promise<void> | null = null;
    let state: PublicReviewPageState = {
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
    };
    const update = (patch: Partial<PublicReviewPageState>) => {
        state = { ...state, ...patch };
        publish(state);
    };

    const refresh = (force = true) => {
        if (refreshPromise) return refreshPromise;
        const requestGeneration = ++generation;
        update({
            initialLoading: state.summary === null && state.reviews.length === 0,
            refreshing: state.summary !== null || state.reviews.length > 0,
            initialError: null,
            refreshError: false,
            pageError: false,
        });
        const request = Promise.all([
            dependencies.loadRestaurantName(),
            dependencies.loadSummary(force),
            dependencies.loadPage(null, force),
        ]).then(([restaurantName, summary, page]) => {
            if (requestGeneration !== generation) return;
            update({
                restaurantName,
                summary,
                reviews: mergePublicReviewPages([], page.items),
                nextCursor: safeNextPublicReviewCursor(null, page.nextCursor),
                initialLoading: false,
                refreshing: false,
            });
        }).catch(async () => {
            if (requestGeneration !== generation) return;
            const offline = await dependencies.isOffline().catch(() => false);
            if (requestGeneration !== generation) return;
            update({
                initialLoading: false,
                refreshing: false,
                initialError: state.summary === null && state.reviews.length === 0 ? (offline ? "offline" : "service") : null,
                refreshError: state.summary !== null || state.reviews.length > 0,
            });
        }).finally(() => {
            if (refreshPromise === request) refreshPromise = null;
        });
        refreshPromise = request;
        return request;
    };

    const loadMore = () => {
        const cursor = state.nextCursor;
        if (!cursor || pagePromise || refreshPromise) return pagePromise || Promise.resolve();
        const requestGeneration = generation;
        update({ loadingMore: true, pageError: false });
        const request = dependencies.loadPage(cursor, false).then((page) => {
            if (requestGeneration !== generation) return;
            update({
                reviews: mergePublicReviewPages(state.reviews, page.items),
                nextCursor: safeNextPublicReviewCursor(cursor, page.nextCursor),
                loadingMore: false,
            });
        }).catch(() => {
            if (requestGeneration === generation) update({ loadingMore: false, pageError: true });
        }).finally(() => {
            if (pagePromise === request) pagePromise = null;
        });
        pagePromise = request;
        return request;
    };

    return { refresh, loadMore, getState: () => state, dispose: () => { generation += 1; } };
};
