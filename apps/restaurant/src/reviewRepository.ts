import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import type {
  CursorPage, MenuItemReactionAggregate, RestaurantReportResult, RestaurantReviewQueueItem,
  ReviewManagementErrorCode, ReviewReportReason, ReviewReportStatus, ReviewVisibility,
} from "@hungrie/domain";
import { supabase } from "./supabase";

type Client = SupabaseClient<Database>;
const limit = (value: number | undefined, fallback: number) => Math.min(50, Math.max(1, Math.floor(Number(value ?? fallback) || fallback)));
const object = (value: unknown) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Restaurant review response."); return value as Record<string, any>; };
const text = (value: unknown) => { if (typeof value !== "string" || !value) throw new Error("Invalid Restaurant review response."); return value; };
const number = (value: unknown) => { const result = Number(value); if (!Number.isFinite(result)) throw new Error("Invalid Restaurant review response."); return result; };
const rating = (value: unknown) => { const result = number(value); if (!Number.isInteger(result) || result < 1 || result > 5) throw new Error("Invalid Restaurant review response."); return result as 1|2|3|4|5; };
const visibility = (value: unknown) => { if (value !== "published" && value !== "hidden") throw new Error("Invalid Restaurant review response."); return value; };
const status = (value: unknown) => { if (value !== "open" && value !== "resolved" && value !== "dismissed") throw new Error("Invalid Restaurant review response."); return value; };
const reason = (value: unknown) => { if (!["spam","abusive_content","personal_information","not_related_to_order","suspected_fraud","other"].includes(String(value))) throw new Error("Invalid Restaurant review response."); return value as ReviewReportReason; };
export class RestaurantReviewRepositoryError extends Error { readonly code:ReviewManagementErrorCode;constructor(code: ReviewManagementErrorCode) { super(code);this.code=code;this.name="RestaurantReviewRepositoryError"; } }
export const classifyRestaurantReviewError = (error: {code?:string;message?:string;status?:number}|null|undefined):ReviewManagementErrorCode=>{
  const code=String(error?.code||"").toLowerCase(),message=String(error?.message||"").toLowerCase(),status=Number(error?.status||0);
  if(code==="pgrst303"||message.includes("jwt")||message.includes("session"))return "session_expired";
  if(code==="42501"||message.includes("active restaurant"))return "account_inactive";
  if(code==="23505"||message.includes("already reported"))return "duplicate_report";
  if(message.includes("operation id reused"))return "operation_conflict";
  if(code==="22023"||code==="23514"||status===400)return "validation";
  if(status>=500||status===0&&!code&&!message)return "service_unavailable";
  return "unknown";
};
const data = async (request: PromiseLike<{ data: unknown; error: { code?:string;message?: string;status?:number } | null }>) => {
  const result = await request;
  if (result.error) throw new RestaurantReviewRepositoryError(classifyRestaurantReviewError(result.error));
  return result.data as any;
};
const page = <T>(value: any, map: (row: any) => T): CursorPage<T> => {
  const row=object(value);if (!Array.isArray(row.items) || !Number.isInteger(row.limit) || row.limit<1 || row.limit>50) throw new Error("Invalid Restaurant review response.");
  return { items: row.items.map(map), nextCursor: typeof row.nextCursor === "string" ? row.nextCursor : null, limit: row.limit };
};
const safeItems = (value: any) => {
  if (!Array.isArray(value)) throw new Error("Invalid Restaurant review response.");
  return value.map((value) => { const item=object(value),quantity=number(item.quantity);if(!Number.isInteger(quantity)||quantity<0)throw new Error("Invalid Restaurant review response.");return { menuItemId: text(item.menuItemId), name: text(item.name), quantity }; });
};
const mapReview = (value: any): RestaurantReviewQueueItem => {const row=object(value),report=row.report===null?null:object(row.report);return {
  reviewId: text(row.reviewId), overallRating: number(row.overallRating), tasteRating: rating(row.tasteRating),
  speedRating: rating(row.speedRating), comment: typeof row.comment === "string" ? row.comment : "",
  items: safeItems(row.items), status: visibility(row.status), createdAt: text(row.createdAt),
  report: report ? { reportId: text(report.reportId), reason: reason(report.reason), status: status(report.status), createdAt: text(report.createdAt) } : null,
};};
const mapAggregate = (value: any): MenuItemReactionAggregate => {const row=object(value);return { menuItemId: text(row.menuItemId),
  menuItemName: text(row.menuItemName), likedCount: number(row.likedCount), dislikedCount: number(row.dislikedCount),
  positivePercentage: number(row.positivePercentage) };};

export const createRestaurantReviewV2Repository = (client: Client = supabase) => ({
  async listReviews(options?: { status?: ReviewVisibility | null; reportStatus?: ReviewReportStatus | null; cursor?: string | null; limit?: number }) {
    return page(await data(client.rpc("restaurant_list_order_reviews_v2", { p_status: options?.status || undefined,
      p_report_status: options?.reportStatus || undefined, p_cursor: options?.cursor || undefined, p_limit: limit(options?.limit, 20) })), mapReview);
  },
  async reportReview(input: { reviewId: string; reason: ReviewReportReason; internalNote?: string; operationId: string }): Promise<RestaurantReportResult> {
    const row = object(await data(client.rpc("restaurant_report_order_review_v2", { p_review_id: input.reviewId,
      p_reason: input.reason, p_internal_note: input.internalNote || "", p_operation_id: input.operationId })));
    return { reportId: text(row.reportId), reviewId: text(row.reviewId), status: "open" };
  },
  async listReactionAggregates(options?: { cursor?: string | null; limit?: number }) {
    return page(await data(client.rpc("restaurant_list_menu_item_reaction_aggregates_v2", {
      p_cursor: options?.cursor || undefined, p_limit: limit(options?.limit, 50) })), mapAggregate);
  },
});

export const restaurantReviewV2Repository = createRestaurantReviewV2Repository();
