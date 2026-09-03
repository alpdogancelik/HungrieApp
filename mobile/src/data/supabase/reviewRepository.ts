import type { ReviewRepository } from "@/src/data/contracts";
import type { MenuItemReview, OrderReview, RestaurantOrderReviewSummary, RestaurantReviewSummary } from "@/src/domain/types";
import { requireSupabase, throwIfError } from "./utils";

const normalizeLimit = (value?: number) => Math.min(Math.max(Math.floor(Number(value || 30)), 1), 100);

const mapProductReview = (row: any): MenuItemReview => ({
    id: String(row.id || ""),
    reviewKey: String(row.id || ""),
    orderId: String(row.order_id || ""),
    restaurantId: String(row.restaurant_id || ""),
    itemId: String(row.menu_item_id || ""),
    menuItemId: String(row.menu_item_id || ""),
    itemName: row.menu_item_name_snapshot || undefined,
    menuItemName: row.menu_item_name_snapshot || undefined,
    userId: String(row.profile_id || ""),
    userName: row.user_name_snapshot || undefined,
    rating: Number(row.rating || 0) as 1 | 2 | 3 | 4 | 5,
    comment: row.comment || undefined,
    status: row.status === "hidden" ? "hidden" : "published",
    reply: row.reply || undefined,
    replyAt: row.replied_at || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
});

const mapOrderReview = (row: any): OrderReview => ({
    id: String(row.id || ""),
    orderId: String(row.order_id || ""),
    userId: String(row.profile_id || ""),
    userName: row.user_name_snapshot || undefined,
    restaurantId: String(row.restaurant_id || ""),
    restaurantName: row.restaurant_name_snapshot || undefined,
    ratings: {
        speed: Number(row.speed_rating || 1) as 1 | 2 | 3 | 4 | 5,
        taste: Number(row.taste_rating || 1) as 1 | 2 | 3 | 4 | 5,
        value: Number(row.value_rating || 1) as 1 | 2 | 3 | 4 | 5,
        pricePerformance: Number(row.price_performance_rating || row.value_rating || 1) as 1 | 2 | 3 | 4 | 5,
    },
    averageRating: Number(row.average_rating || 0),
    comment: row.comment || undefined,
    itemsSnapshot: Array.isArray(row.items_snapshot) ? row.items_snapshot : [],
    status: row.status === "hidden" ? "hidden" : "published",
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
});

export const calculateRestaurantOrderReviewSummary: ReviewRepository["calculateRestaurantOrderReviewSummary"] = (reviews) => {
    const published = reviews.filter((review) => review.status === "published");
    const count = published.length;
    const avg = (selector: (review: OrderReview) => number) =>
        count ? Number((published.reduce((sum, review) => sum + selector(review), 0) / count).toFixed(1)) : 0;
    return {
        averageRating: avg((review) => review.averageRating),
        count,
        speedAverage: avg((review) => review.ratings.speed),
        tasteAverage: avg((review) => review.ratings.taste),
        valueAverage: avg((review) => review.ratings.value),
        pricePerformanceAverage: avg((review) => review.ratings.pricePerformance || review.ratings.value),
        latestComments: published.slice(0, 8),
    } satisfies RestaurantOrderReviewSummary;
};

const buildRestaurantReviewSummary = (reviews: MenuItemReview[]): RestaurantReviewSummary => {
    const distribution: RestaurantReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((review) => {
        if ([1, 2, 3, 4, 5].includes(review.rating)) distribution[review.rating] += 1;
    });
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return {
        average: reviews.length ? Number((total / reviews.length).toFixed(1)) : 0,
        count: reviews.length,
        distribution,
        recentReviews: reviews.slice(0, 8),
        latestByMenuItem: Object.fromEntries(reviews.map((review) => [review.itemId, review])),
    };
};

export const fetchMenuItemReviews: ReviewRepository["fetchMenuItemReviews"] = async (menuItemId, options) =>
    throwIfError(
        await requireSupabase()
            .from("published_product_reviews")
            .select("*")
            .eq("menu_item_id", menuItemId)
            .order("created_at", { ascending: false })
            .limit(normalizeLimit(options?.limit)),
    ).map(mapProductReview);

export const fetchRestaurantReviews: ReviewRepository["fetchRestaurantReviews"] = async (restaurantId, options) => {
    const source = options?.includeHidden ? "product_reviews" : "published_product_reviews";
    return throwIfError(
        await requireSupabase().from(source).select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(normalizeLimit(options?.limit)),
    ).map(mapProductReview);
};

export const fetchRestaurantReviewSummary: ReviewRepository["fetchRestaurantReviewSummary"] = async (restaurantId) =>
    buildRestaurantReviewSummary(await fetchRestaurantReviews(restaurantId));

export const fetchUserReviews: ReviewRepository["fetchUserReviews"] = async (_userId, options) =>
    throwIfError(
        await requireSupabase().from("product_reviews").select("*").order("created_at", { ascending: false }).limit(normalizeLimit(options?.limit)),
    ).map(mapProductReview);

export const subscribeUserReviews: ReviewRepository["subscribeUserReviews"] = (userId, cb, options) => {
    void fetchUserReviews(userId, options).then(cb).catch(() => cb([]));
    const channel = requireSupabase()
        .channel("product-reviews")
        .on("postgres_changes", { event: "*", schema: "public", table: "product_reviews" }, () => {
            void fetchUserReviews(userId, options).then(cb).catch(() => cb([]));
        })
        .subscribe();
    return () => {
        void requireSupabase().removeChannel(channel);
    };
};

export const submitMenuItemReview: ReviewRepository["submitMenuItemReview"] = async (input) => {
    const id = throwIfError(
        await requireSupabase().rpc("submit_product_review", {
            p_order_id: input.orderId,
            p_menu_item_id: input.menuItemId || input.itemId,
            p_rating: input.rating,
            p_comment: input.comment || "",
        }),
    );
    const row = throwIfError(await requireSupabase().from("product_reviews").select("*").eq("id", id).maybeSingle());
    return mapProductReview(row);
};

export const moderateMenuItemReview: ReviewRepository["moderateMenuItemReview"] = async ({ reviewId, status, reply }) => {
    await requireSupabase().rpc("moderate_review", { p_review_type: "product", p_review_id: reviewId, p_status: status, p_reply: reply }).then(throwIfError);
};
export const saveMenuItemReviewReply: ReviewRepository["saveMenuItemReviewReply"] = async (reviewId, reply) =>
    moderateMenuItemReview({ reviewId, status: "published", reply });

export const submitOrderReview: ReviewRepository["submitOrderReview"] = async (input) => {
    const id = throwIfError(
        await requireSupabase().rpc("submit_order_review", {
            p_order_id: input.orderId,
            p_speed_rating: input.ratings.speed,
            p_taste_rating: input.ratings.taste,
            p_value_rating: input.ratings.value,
            p_price_performance_rating: input.ratings.pricePerformance,
            p_comment: input.comment || "",
        }),
    );
    const row = throwIfError(await requireSupabase().from("order_reviews").select("*").eq("id", id).maybeSingle());
    return mapOrderReview(row);
};

export const fetchOrderReviewByOrder: ReviewRepository["fetchOrderReviewByOrder"] = async (orderId) => {
    const row = throwIfError(await requireSupabase().from("order_reviews").select("*").eq("order_id", orderId).maybeSingle());
    return row ? mapOrderReview(row) : null;
};

export const fetchUserOrderReviews: ReviewRepository["fetchUserOrderReviews"] = async (_userId, options) =>
    throwIfError(
        await requireSupabase().from("order_reviews").select("*").order("created_at", { ascending: false }).limit(normalizeLimit(options?.limit)),
    ).map(mapOrderReview);

export const fetchRestaurantOrderReviews: ReviewRepository["fetchRestaurantOrderReviews"] = async (restaurantId, options) => {
    const source = options?.includeHidden ? "order_reviews" : "published_order_reviews";
    return throwIfError(
        await requireSupabase().from(source).select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(normalizeLimit(options?.limit)),
    ).map(mapOrderReview);
};

export const fetchRestaurantOrderReviewSummary: ReviewRepository["fetchRestaurantOrderReviewSummary"] = async (restaurantId) =>
    calculateRestaurantOrderReviewSummary(await fetchRestaurantOrderReviews(restaurantId));

export const moderateOrderReview: ReviewRepository["moderateOrderReview"] = async (reviewId, status) => {
    await requireSupabase().rpc("moderate_review", { p_review_type: "order", p_review_id: reviewId, p_status: status }).then(throwIfError);
};

export const supabaseReviewRepository: ReviewRepository = {
    fetchMenuItemReviews,
    fetchRestaurantReviews,
    fetchRestaurantReviewSummary,
    fetchUserReviews,
    subscribeUserReviews,
    submitMenuItemReview,
    moderateMenuItemReview,
    saveMenuItemReviewReply,
    submitOrderReview,
    fetchOrderReviewByOrder,
    fetchUserOrderReviews,
    fetchRestaurantOrderReviews,
    calculateRestaurantOrderReviewSummary,
    fetchRestaurantOrderReviewSummary,
    moderateOrderReview,
};
