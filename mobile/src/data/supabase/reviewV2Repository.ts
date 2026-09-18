import type {
    AdminReviewReport,
    CursorPage,
    CustomerOrderReviewState,
    CustomerReviewDraft,
    CustomerReviewPrompt,
    CustomerReviewSubmissionResult,
    MenuItemReactionAggregate,
    PublicRestaurantReview,
    RestaurantReportResult,
    RestaurantReviewQueueItem,
    RestaurantReviewSummaryV2,
    ReviewReportReason,
    ReviewReportStatus,
    ReviewReportTransitionResult,
    ReviewRepositoryErrorCode,
    ReviewVisibility,
    ReviewVisibilityResult,
} from "@hungrie/domain";
import { invalidateCatalogCache, readCatalogCached } from "./publicCatalogCache";
import { requireCatalogSupabase, requireSupabase, throwIfError, withSupabaseAuthRetry } from "./utils";

type ObjectValue = Record<string, any>;
const object = (value: unknown, label: string): ObjectValue => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewRepositoryError("service_unavailable", `Invalid ${label} response.`);
    return value as ObjectValue;
};
const text = (value: unknown, label: string) => {
    if (typeof value !== "string" || !value) throw new ReviewRepositoryError("service_unavailable", `Invalid ${label} response.`);
    return value;
};
const nullableText = (value: unknown, label: string) => value === null || value === undefined ? null : text(value, label);
const finite = (value: unknown, label: string) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new ReviewRepositoryError("service_unavailable", `Invalid ${label} response.`);
    return number;
};
const count = (value: unknown, label: string) => {
    const number = finite(value, label);
    if (!Number.isInteger(number) || number < 0) throw new ReviewRepositoryError("service_unavailable", `Invalid ${label} response.`);
    return number;
};
const rating = (value: unknown, label: string) => {
    const number = finite(value, label);
    if (!Number.isInteger(number) || number < 1 || number > 5) throw new ReviewRepositoryError("service_unavailable", `Invalid ${label} response.`);
    return number as 1 | 2 | 3 | 4 | 5;
};
const nullableMetric = (value: unknown, label: string) => value === null || value === undefined ? null : finite(value, label);
const visibility = (value: unknown): ReviewVisibility => {
    if (value !== "published" && value !== "hidden") throw new ReviewRepositoryError("service_unavailable", "Invalid review visibility response.");
    return value;
};
const reportStatus = (value: unknown): ReviewReportStatus => {
    if (value !== "open" && value !== "resolved" && value !== "dismissed") throw new ReviewRepositoryError("service_unavailable", "Invalid report status response.");
    return value;
};
const reportReason = (value: unknown): ReviewReportReason => {
    if (!["spam", "abusive_content", "personal_information", "not_related_to_order", "suspected_fraud", "other"].includes(String(value))) {
        throw new ReviewRepositoryError("service_unavailable", "Invalid report reason response.");
    }
    return value as ReviewReportReason;
};
const items = (value: unknown) => {
    if (!Array.isArray(value)) throw new ReviewRepositoryError("service_unavailable", "Invalid review items response.");
    return value.map((entry) => {
        const row = object(entry, "review item");
        return { menuItemId: text(row.menuItemId, "menu item ID"), name: text(row.name, "menu item name"), quantity: count(row.quantity, "menu item quantity") };
    });
};
const page = <T>(value: unknown, mapper: (entry: unknown) => T): CursorPage<T> => {
    const row = object(value, "review page");
    if (!Array.isArray(row.items)) throw new ReviewRepositoryError("service_unavailable", "Invalid review page response.");
    const limit = count(row.limit, "review page limit");
    if (limit < 1 || limit > 50) throw new ReviewRepositoryError("service_unavailable", "Invalid review page response.");
    return { items: row.items.map(mapper), nextCursor: nullableText(row.nextCursor, "review cursor"), limit };
};
const normalizeLimit = (value: number | undefined, fallback: number) => Math.min(50, Math.max(1, Math.floor(Number(value ?? fallback) || fallback)));

export class ReviewRepositoryError extends Error {
    readonly code: ReviewRepositoryErrorCode;
    constructor(code: ReviewRepositoryErrorCode, message: string) {
        super(message);
        this.name = "ReviewRepositoryError";
        this.code = code;
    }
}

export const classifyReviewRepositoryError = (error: any): ReviewRepositoryError => {
    if (error instanceof ReviewRepositoryError) return error;
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    if (code === "PGRST303" || message.includes("jwt") || message.includes("session")) return new ReviewRepositoryError("session_expired", "Your session has expired.");
    if (message.includes("active customer account required") || message.includes("account is not active")) return new ReviewRepositoryError("account_inactive", "This account cannot submit reviews.");
    if (code === "42501" || message.includes("owned delivered order required") || message.includes("order not found")) return new ReviewRepositoryError("order_unavailable", "This order is unavailable for review.");
    if (message.includes("review window has expired")) return new ReviewRepositoryError("review_expired", "The review window has expired.");
    if (code === "23505" || message.includes("already reviewed")) return new ReviewRepositoryError("already_reviewed", "This order has already been reviewed.");
    if (message.includes("not part of the order")) return new ReviewRepositoryError("invalid_reaction_item", "A selected meal is not part of this order.");
    if (message.includes("operation id was reused")) return new ReviewRepositoryError("operation_conflict", "The saved review attempt no longer matches this draft.");
    if (code === "22023" || message.includes("invalid") || message.includes("must be")) return new ReviewRepositoryError("validation", "The review details are invalid.");
    if (!code || code.startsWith("PGRST") || message.includes("network") || message.includes("fetch") || message.includes("timeout")) {
        return new ReviewRepositoryError("service_unavailable", "Review service is temporarily unavailable.");
    }
    return new ReviewRepositoryError("unknown", "The review request could not be completed.");
};

export const reviewSummaryCacheKey = (restaurantId: string) => `review-v2:summary:${restaurantId}`;
export const reviewFeedCachePrefix = (restaurantId: string) => `review-v2:feed:${restaurantId}:`;
export const invalidateAllRestaurantReviewSummariesV2 = () => invalidateCatalogCache("review-v2:summary:");
export const invalidateRestaurantPublicReviewReadsV2 = (restaurantId: string) => {
    invalidateCatalogCache(reviewSummaryCacheKey(restaurantId));
    invalidateCatalogCache(reviewFeedCachePrefix(restaurantId));
};
export const invalidateRestaurantReviewV2Caches = (restaurantId: string) => {
    invalidateRestaurantPublicReviewReadsV2(restaurantId);
    invalidateCatalogCache(`restaurant:${restaurantId}`);
    invalidateCatalogCache(`bundle:${restaurantId}`);
    invalidateCatalogCache("restaurants:");
};

export const mapRestaurantReviewSummaryV2 = (value: unknown): RestaurantReviewSummaryV2 => {
    const row = object(value, "review summary");
    return {
        restaurantId: text(row.restaurantId, "Restaurant ID"),
        overallRating: nullableMetric(row.overallRating, "overall rating"),
        tasteRating: nullableMetric(row.tasteRating, "Taste rating"),
        speedRating: nullableMetric(row.speedRating, "Speed rating"),
        reviewCount: count(row.reviewCount, "review count"),
    };
};

export const mapPublicRestaurantReview = (value: unknown): PublicRestaurantReview => {
    const row = object(value, "public review");
    return {
        reviewId: text(row.reviewId, "review ID"), overallRating: finite(row.overallRating, "overall rating"),
        tasteRating: rating(row.tasteRating, "Taste rating"), speedRating: rating(row.speedRating, "Speed rating"),
        comment: typeof row.comment === "string" ? row.comment : "", items: items(row.items), date: text(row.date, "review date"),
    };
};

export const getRestaurantReviewSummaryV2 = async (restaurantId: string): Promise<RestaurantReviewSummaryV2> =>
    readCatalogCached(reviewSummaryCacheKey(restaurantId), async () => {
        try {
            return mapRestaurantReviewSummaryV2(throwIfError(await requireCatalogSupabase().rpc("get_restaurant_review_summary_v2", { p_restaurant_id: restaurantId })));
        } catch (error) { throw classifyReviewRepositoryError(error); }
    });

export const listPublishedRestaurantReviewsV2 = async (restaurantId: string, options?: { cursor?: string | null; limit?: number }): Promise<CursorPage<PublicRestaurantReview>> => {
    const limit = normalizeLimit(options?.limit, 20);
    const cursor = options?.cursor || null;
    return readCatalogCached(`${reviewFeedCachePrefix(restaurantId)}${cursor || "first"}:${limit}`, async () => {
        try {
            return page(throwIfError(await requireCatalogSupabase().rpc("list_published_restaurant_reviews_v2", {
                p_restaurant_id: restaurantId, p_cursor: cursor, p_limit: limit,
            })), mapPublicRestaurantReview);
        } catch (error) { throw classifyReviewRepositoryError(error); }
    });
};

export const refreshRestaurantReviewSummaryV2 = async (restaurantId: string) => {
    invalidateCatalogCache(reviewSummaryCacheKey(restaurantId));
    return getRestaurantReviewSummaryV2(restaurantId);
};

export const refreshPublishedRestaurantReviewsV2 = async (restaurantId: string, options?: { limit?: number }) => {
    invalidateCatalogCache(reviewFeedCachePrefix(restaurantId));
    return listPublishedRestaurantReviewsV2(restaurantId, { limit: options?.limit });
};

export const getCustomerOrderReviewStateV2 = async (orderId: string): Promise<CustomerOrderReviewState> => {
    try {
        const row = object(await withSupabaseAuthRetry(() => requireSupabase().rpc("get_my_customer_order_review_state_v2", { p_order_id: orderId }).then(throwIfError)), "Customer review state");
        const review = row.review === null ? null : object(row.review, "submitted review");
        return {
            orderId: text(row.orderId, "order ID"), reviewed: row.reviewed === true, eligible: row.eligible === true,
            expiresAt: nullableText(row.expiresAt, "review expiry"),
            review: review ? {
                reviewId: text(review.reviewId, "review ID"), tasteRating: rating(review.tasteRating, "Taste rating"),
                speedRating: rating(review.speedRating, "Speed rating"), overallRating: finite(review.overallRating, "overall rating"),
                comment: typeof review.comment === "string" ? review.comment : "", items: items(review.items),
                status: visibility(review.status), createdAt: text(review.createdAt, "review creation time"),
            } : null,
        };
    } catch (error) { throw classifyReviewRepositoryError(error); }
};

export const getCustomerReviewPromptV2 = async (): Promise<CustomerReviewPrompt | null> => {
    try {
        const value = await withSupabaseAuthRetry(() => requireSupabase().rpc("get_my_customer_review_prompt_v2").then(throwIfError));
        if (value === null) return null;
        const row = object(value, "Customer review prompt");
        return { orderId: text(row.orderId, "order ID"), restaurantId: text(row.restaurantId, "Restaurant ID"),
            restaurantName: text(row.restaurantName, "Restaurant name"), deliveredAt: text(row.deliveredAt, "delivery time"),
            expiresAt: text(row.expiresAt, "review expiry"), items: items(row.items) };
    } catch (error) { throw classifyReviewRepositoryError(error); }
};

export const submitCustomerOrderReviewV2 = async (input: CustomerReviewDraft & { operationId: string }): Promise<CustomerReviewSubmissionResult> => {
    try {
        const row = object(await withSupabaseAuthRetry(() => requireSupabase().rpc("submit_my_customer_order_review_v2", {
            p_order_id: input.orderId, p_taste_rating: input.tasteRating, p_speed_rating: input.speedRating,
            p_comment: input.comment || "", p_meal_reactions_json: input.mealReactions, p_operation_id: input.operationId,
        }).then(throwIfError)), "review submission");
        const result = { reviewId: text(row.reviewId, "review ID"), replayed: row.replayed === true };
        invalidateRestaurantReviewV2Caches(input.restaurantId);
        return result;
    } catch (error) { throw classifyReviewRepositoryError(error); }
};

const mapRestaurantQueueItem = (value: unknown): RestaurantReviewQueueItem => {
    const row = object(value, "Restaurant review");
    const report = row.report === null ? null : object(row.report, "Restaurant report");
    return { reviewId: text(row.reviewId, "review ID"), overallRating: finite(row.overallRating, "overall rating"),
        tasteRating: rating(row.tasteRating, "Taste rating"), speedRating: rating(row.speedRating, "Speed rating"),
        comment: typeof row.comment === "string" ? row.comment : "", items: items(row.items), status: visibility(row.status),
        createdAt: text(row.createdAt, "review creation time"), report: report ? { reportId: text(report.reportId, "report ID"),
            reason: reportReason(report.reason), status: reportStatus(report.status), createdAt: text(report.createdAt, "report creation time") } : null };
};

export const listRestaurantOrderReviewsV2 = async (options?: { status?: ReviewVisibility | null; reportStatus?: ReviewReportStatus | null; cursor?: string | null; limit?: number }) => {
    try {
        return page(await withSupabaseAuthRetry(() => requireSupabase().rpc("restaurant_list_order_reviews_v2", {
            p_status: options?.status || null, p_report_status: options?.reportStatus || null,
            p_cursor: options?.cursor || null, p_limit: normalizeLimit(options?.limit, 20),
        }).then(throwIfError)), mapRestaurantQueueItem);
    } catch (error) { throw classifyReviewRepositoryError(error); }
};

export const reportRestaurantOrderReviewV2 = async (input: { reviewId: string; reason: ReviewReportReason; internalNote?: string; operationId: string }): Promise<RestaurantReportResult> => {
    try {
        const row = object(await requireSupabase().rpc("restaurant_report_order_review_v2", { p_review_id: input.reviewId,
            p_reason: input.reason, p_internal_note: input.internalNote || "", p_operation_id: input.operationId }).then(throwIfError), "Restaurant report");
        return { reportId: text(row.reportId, "report ID"), reviewId: text(row.reviewId, "review ID"), status: "open" };
    } catch (error) { throw classifyReviewRepositoryError(error); }
};

const mapReactionAggregate = (value: unknown): MenuItemReactionAggregate => {
    const row = object(value, "reaction aggregate");
    return { menuItemId: text(row.menuItemId, "menu item ID"), menuItemName: text(row.menuItemName, "menu item name"),
        likedCount: count(row.likedCount, "liked count"), dislikedCount: count(row.dislikedCount, "disliked count"),
        positivePercentage: finite(row.positivePercentage, "positive percentage") };
};

export const listRestaurantReactionAggregatesV2 = async (options?: { cursor?: string | null; limit?: number }) => {
    try { return page(await requireSupabase().rpc("restaurant_list_menu_item_reaction_aggregates_v2", {
        p_cursor: options?.cursor || null, p_limit: normalizeLimit(options?.limit, 50),
    }).then(throwIfError), mapReactionAggregate); } catch (error) { throw classifyReviewRepositoryError(error); }
};

export const mapAdminReviewReport = (value: unknown): AdminReviewReport => {
    const row = object(value, "Admin review report");
    const reportedReview = object(row.review, "reported review");
    const contractVersion = count(reportedReview.contractVersion, "contract version");
    if (contractVersion !== 1 && contractVersion !== 2) throw new ReviewRepositoryError("service_unavailable", "Invalid contract version response.");
    const review = mapRestaurantQueueItem({ ...reportedReview, reviewId: row.reviewId, report: null });
    const { reviewId: _reviewId, report: _report, ...safeReview } = review;
    return { reportId: text(row.reportId, "report ID"), reviewId: text(row.reviewId, "review ID"),
        restaurantId: text(row.restaurantId, "Restaurant ID"), reason: reportReason(row.reason),
        internalNote: nullableText(row.internalNote, "internal note"), reportStatus: reportStatus(row.reportStatus),
        resolutionNote: nullableText(row.resolutionNote, "resolution note"), reportCreatedAt: text(row.reportCreatedAt, "report creation time"),
        review: { ...safeReview, contractVersion } };
};

export const listAdminReviewReportsV2 = async (options?: { status?: ReviewReportStatus | null; restaurantId?: string | null; cursor?: string | null; limit?: number }) => {
    try { return page(await requireSupabase().rpc("admin_list_order_review_reports_v2", { p_status: options?.status || null,
        p_restaurant_id: options?.restaurantId || null, p_cursor: options?.cursor || null,
        p_limit: normalizeLimit(options?.limit, 20) }).then(throwIfError), mapAdminReviewReport); }
    catch (error) { throw classifyReviewRepositoryError(error); }
};

export const setAdminReviewReportStatusV2 = async (input: { reportId: string; status: ReviewReportStatus; resolutionNote?: string; operationId: string }): Promise<ReviewReportTransitionResult> => {
    try { const row = object(await requireSupabase().rpc("admin_set_order_review_report_status_v2", { p_report_id: input.reportId,
        p_status: input.status, p_resolution_note: input.resolutionNote || "", p_operation_id: input.operationId }).then(throwIfError), "report transition");
        return { reportId: text(row.reportId, "report ID"), status: reportStatus(row.status) }; }
    catch (error) { throw classifyReviewRepositoryError(error); }
};

export const setAdminReviewVisibilityV2 = async (input: { reviewId: string; status: ReviewVisibility; reason: string; operationId: string }): Promise<ReviewVisibilityResult> => {
    try { const row = object(await requireSupabase().rpc("admin_set_order_review_visibility_v2", { p_review_id: input.reviewId,
        p_status: input.status, p_reason: input.reason, p_operation_id: input.operationId }).then(throwIfError), "visibility transition");
        return { reviewId: text(row.reviewId, "review ID"), status: visibility(row.status) }; }
    catch (error) { throw classifyReviewRepositoryError(error); }
};

export const listAdminReactionAggregatesV2 = async (restaurantId: string, options?: { cursor?: string | null; limit?: number }) => {
    try { return page(await requireSupabase().rpc("admin_list_menu_item_reaction_aggregates_v2", { p_restaurant_id: restaurantId,
        p_cursor: options?.cursor || null, p_limit: normalizeLimit(options?.limit, 50) }).then(throwIfError), mapReactionAggregate); }
    catch (error) { throw classifyReviewRepositoryError(error); }
};
