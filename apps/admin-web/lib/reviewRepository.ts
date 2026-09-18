"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import type {
  AdminReviewAuditEntry, AdminReviewReport, CursorPage, MenuItemReactionAggregate, ReviewContractVersion,
  ReviewManagementErrorCode, ReviewReportStatus, ReviewReportReason, ReviewReportTransitionResult,
  ReviewVisibility, ReviewVisibilityResult,
} from "@hungrie/domain";
import { supabase } from "./supabase";

type Client = SupabaseClient<Database>;
const limit = (value: number | undefined, fallback: number) => Math.min(50, Math.max(1, Math.floor(Number(value ?? fallback) || fallback)));
const object = (value: unknown) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Admin review response."); return value as Record<string, any>; };
const text = (value: unknown) => { if (typeof value !== "string" || !value) throw new Error("Invalid Admin review response."); return value; };
const number = (value: unknown) => { const result=Number(value);if(!Number.isFinite(result))throw new Error("Invalid Admin review response.");return result; };
const rating = (value: unknown) => { const result=number(value);if(!Number.isInteger(result)||result<1||result>5)throw new Error("Invalid Admin review response.");return result as 1|2|3|4|5; };
const reportStatus = (value: unknown) => {if(value!=="open"&&value!=="resolved"&&value!=="dismissed")throw new Error("Invalid Admin review response.");return value;};
const visibility = (value: unknown) => {if(value!=="published"&&value!=="hidden")throw new Error("Invalid Admin review response.");return value;};
const reason = (value: unknown) => {if(!["spam","abusive_content","personal_information","not_related_to_order","suspected_fraud","other"].includes(String(value)))throw new Error("Invalid Admin review response.");return value as ReviewReportReason;};
const contractVersion = (value: unknown): ReviewContractVersion => {const result=number(value);if(result!==1&&result!==2)throw new Error("Invalid Admin review response.");return result;};
export class AdminReviewRepositoryError extends Error { readonly code:ReviewManagementErrorCode;constructor(code: ReviewManagementErrorCode) { super(code);this.code=code;this.name="AdminReviewRepositoryError"; } }
export const classifyAdminReviewError = (error: {code?:string;message?:string;status?:number}|null|undefined): ReviewManagementErrorCode => {
  const code=String(error?.code||"").toLowerCase(), message=String(error?.message||"").toLowerCase(), status=Number(error?.status||0);
  if(code==="pgrst303"||message.includes("jwt")||message.includes("session"))return "session_expired";
  if(message.includes("recent authentication required"))return "recent_auth_required";
  if(code==="42501"||message.includes("active admin"))return "account_inactive";
  if(message.includes("direct terminal")||message.includes("transition")||message.includes("already has requested status"))return "invalid_transition";
  if(message.includes("operation id reused"))return "operation_conflict";
  if(code==="22023"||code==="23514"||status===400)return "validation";
  if(status>=500||status===0&&!code&&!message)return "service_unavailable";
  return "unknown";
};
const data = async (request: PromiseLike<{ data: unknown; error: { code?:string;message?: string;status?:number } | null }>) => {
  const result = await request;
  if (result.error) throw new AdminReviewRepositoryError(classifyAdminReviewError(result.error));
  return result.data as any;
};
const page = <T>(value: any, map: (row: any) => T): CursorPage<T> => {
  const row=object(value);if (!Array.isArray(row.items)||!Number.isInteger(row.limit)||row.limit<1||row.limit>50) throw new Error("Invalid Admin review response.");
  return { items: row.items.map(map), nextCursor: typeof row.nextCursor === "string" ? row.nextCursor : null, limit: row.limit };
};
const items = (value: any) => {if(!Array.isArray(value))throw new Error("Invalid Admin review response.");return value.map((value)=>{const item=object(value),quantity=number(item.quantity);if(!Number.isInteger(quantity)||quantity<0)throw new Error("Invalid Admin review response.");return{menuItemId:text(item.menuItemId),name:text(item.name),quantity};});};
const mapReport = (value: any): AdminReviewReport => {const row=object(value),review=object(row.review);return { reportId: text(row.reportId), reviewId: text(row.reviewId),
  restaurantId: text(row.restaurantId), reason: reason(row.reason), internalNote: row.internalNote == null ? null : String(row.internalNote),
  reportStatus: reportStatus(row.reportStatus), resolutionNote: row.resolutionNote == null ? null : String(row.resolutionNote),
  reportCreatedAt: text(row.reportCreatedAt), review: { overallRating: number(review.overallRating),
    contractVersion: contractVersion(review.contractVersion),
    tasteRating: rating(review.tasteRating), speedRating: rating(review.speedRating),
    comment: typeof review.comment === "string" ? review.comment : "", items: items(review.items),
    status: visibility(review.status), createdAt: text(review.createdAt) } };};
const mapAggregate = (value: any): MenuItemReactionAggregate => {const row=object(value);return { menuItemId: text(row.menuItemId), menuItemName: text(row.menuItemName),
  likedCount: number(row.likedCount), dislikedCount: number(row.dislikedCount), positivePercentage: number(row.positivePercentage) };};
const nullableText=(value:unknown)=>value==null?null:text(value);
const auditAction=(value:unknown):AdminReviewAuditEntry["action"]=>{if(!["order_review.reported_v2","order_review.report_status_changed_v2","order_review.visibility_changed_v2"].includes(String(value)))throw new Error("Invalid Admin review response.");return value as AdminReviewAuditEntry["action"];};
const targetType=(value:unknown):AdminReviewAuditEntry["targetType"]=>{if(value!=="order_review"&&value!=="order_review_report")throw new Error("Invalid Admin review response.");return value;};
const mapAudit=(value:any):AdminReviewAuditEntry=>{const row=object(value);return {auditId:text(row.auditId),actorProfileId:nullableText(row.actorProfileId),action:auditAction(row.action),targetType:targetType(row.targetType),targetId:text(row.targetId),contractVersion:contractVersion(row.contractVersion),restaurantId:text(row.restaurantId),operationId:nullableText(row.operationId),priorState:nullableText(row.priorState),newState:nullableText(row.newState),reportReason:row.reportReason==null?null:reason(row.reportReason),moderationReason:row.moderationReason==null?null:text(row.moderationReason),createdAt:text(row.createdAt)};};

export const createAdminReviewV2Repository = (client: Client = supabase) => ({
  async listReports(options?: { status?: ReviewReportStatus | null; restaurantId?: string | null; cursor?: string | null; limit?: number }) {
    return page(await data(client.rpc("admin_list_order_review_reports_v2", { p_status: options?.status || undefined,
      p_restaurant_id: options?.restaurantId || undefined, p_cursor: options?.cursor || undefined, p_limit: limit(options?.limit, 20) })), mapReport);
  },
  async setReportStatus(input: { reportId: string; status: ReviewReportStatus; resolutionNote?: string; operationId: string }): Promise<ReviewReportTransitionResult> {
    const row = object(await data(client.rpc("admin_set_order_review_report_status_v2", { p_report_id: input.reportId,
      p_status: input.status, p_resolution_note: input.resolutionNote || "", p_operation_id: input.operationId })));
    return { reportId: text(row.reportId), status: reportStatus(row.status) };
  },
  async setVisibility(input: { reviewId: string; status: ReviewVisibility; reason: string; operationId: string }): Promise<ReviewVisibilityResult> {
    const row = object(await data(client.rpc("admin_set_order_review_visibility_v2", { p_review_id: input.reviewId,
      p_status: input.status, p_reason: input.reason, p_operation_id: input.operationId })));
    return { reviewId: text(row.reviewId), status: visibility(row.status) };
  },
  async listReactionAggregates(restaurantId: string, options?: { cursor?: string | null; limit?: number }) {
    return page(await data(client.rpc("admin_list_menu_item_reaction_aggregates_v2", { p_restaurant_id: restaurantId,
      p_cursor: options?.cursor || undefined, p_limit: limit(options?.limit, 50) })), mapAggregate);
  },
  async listAudit(reportId: string, options?: { cursor?: string | null; limit?: number }) {
    return page(await data(client.rpc("admin_list_order_review_audit_v2", { p_report_id: reportId,
      p_cursor: options?.cursor || undefined, p_limit: limit(options?.limit, 20) })), mapAudit);
  },
});

export const adminReviewV2Repository = createAdminReviewV2Repository();
