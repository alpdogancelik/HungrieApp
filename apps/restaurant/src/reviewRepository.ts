import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import type { CursorPage, MenuItemReactionAggregate, RestaurantReportResult, RestaurantReviewQueueItem, ReviewManagementErrorCode, ReviewReportReason, ReviewReportStatus, ReviewVisibility } from "@hungrie/domain";
import { supabase } from "./supabase";

type Client = SupabaseClient<Database>;
const invalid = (): never => { throw new Error("Invalid Restaurant review response."); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const exact = (value: unknown, keys: readonly string[]) => { const row=object(value); if(Object.keys(row).length!==keys.length||keys.some(key=>!(key in row)))invalid(); return row; };
const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 1000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) ? value : invalid();
const comment = (value: unknown) => typeof value === "string" && Array.from(value).length <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) && value.normalize("NFC") === value ? value : invalid();
const identifier = (value: unknown) => { const result=text(value); if(result.length>200||/\s/u.test(result))invalid(); return result; };
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : invalid();
const integer = (value: unknown, minimum=0) => { const result=finite(value); if(!Number.isSafeInteger(result)||result<minimum)invalid(); return result; };
const rating = (value: unknown) => { const result=finite(value); if(result<1||result>5)invalid(); return result; };
const itemRating = (value: unknown) => { const result=rating(value); if(!Number.isInteger(result))invalid(); return result as 1|2|3|4|5; };
const timestamp = (value: unknown) => { const result=text(value); if(!/^\d{4}-\d{2}-\d{2}T/u.test(result)||!Number.isFinite(Date.parse(result)))invalid(); return result; };
const oneOf = <T extends string>(value: unknown, choices: readonly T[]) => choices.includes(value as T) ? value as T : invalid();
const cursor = (value: unknown) => value===null ? null : text(value);
const limit = (value: number | undefined, fallback: number) => Math.min(50,Math.max(1,Math.floor(Number(value??fallback)||fallback)));

export class RestaurantReviewRepositoryError extends Error { readonly code:ReviewManagementErrorCode; constructor(code:ReviewManagementErrorCode){super(code);this.code=code;this.name="RestaurantReviewRepositoryError";} }
export const classifyRestaurantReviewError = (error:{code?:string;message?:string;status?:number}|null|undefined):ReviewManagementErrorCode => {
  const code=String(error?.code||"").toLowerCase(),message=String(error?.message||"").toLowerCase(),status=Number(error?.status||0);
  if(code==="pgrst303"||message.includes("jwt")||message.includes("session"))return "session_expired";
  if(code==="42501"||message.includes("active restaurant"))return "account_inactive";
  if(code==="23505"||message.includes("already reported"))return "duplicate_report";
  if(message.includes("operation id reused"))return "operation_conflict";
  if(code==="22023"||code==="23514"||status===400)return "validation";
  if(status>=500||status===0&&!code&&!message)return "service_unavailable";
  return "unknown";
};
const data = async (request:PromiseLike<{data:unknown;error:{code?:string;message?:string;status?:number}|null}>) => { const result=await request; if(result.error)throw new RestaurantReviewRepositoryError(classifyRestaurantReviewError(result.error)); return result.data; };

const safeItems = (value:unknown) => {
  if(!Array.isArray(value))return invalid(); const seen=new Set<string>();
  return value.map(value=>{const row=exact(value,["menuItemId","name","quantity"]),menuItemId=identifier(row.menuItemId);if(seen.has(menuItemId))invalid();seen.add(menuItemId);return{menuItemId,name:text(row.name),quantity:integer(row.quantity,1)};});
};
const mapReview = (value:unknown):RestaurantReviewQueueItem => {
  const row=exact(value,["reviewId","overallRating","tasteRating","speedRating","comment","items","status","createdAt","report"]), report=row.report===null?null:exact(row.report,["reportId","reason","status","createdAt"]);
  return {reviewId:identifier(row.reviewId),overallRating:rating(row.overallRating),tasteRating:itemRating(row.tasteRating),speedRating:itemRating(row.speedRating),comment:comment(row.comment),items:safeItems(row.items),status:oneOf(row.status,["published","hidden"] as const),createdAt:timestamp(row.createdAt),report:report?{reportId:identifier(report.reportId),reason:oneOf(report.reason,["spam","abusive_content","personal_information","not_related_to_order","suspected_fraud","other"] as const),status:oneOf(report.status,["open","resolved","dismissed"] as const),createdAt:timestamp(report.createdAt)}:null};
};
const mapAggregate = (value:unknown):MenuItemReactionAggregate => { const row=exact(value,["menuItemId","menuItemName","likedCount","dislikedCount","positivePercentage"]); const percentage=finite(row.positivePercentage); if(percentage<0||percentage>100)invalid(); return{menuItemId:identifier(row.menuItemId),menuItemName:text(row.menuItemName),likedCount:integer(row.likedCount),dislikedCount:integer(row.dislikedCount),positivePercentage:percentage}; };
const page = <T extends {reviewId?:string;menuItemId?:string}>(value:unknown,map:(row:unknown)=>T):CursorPage<T> => { const row=exact(value,["items","nextCursor","limit"]); if(!Array.isArray(row.items))return invalid(); const items=row.items.map(map),seen=new Set<string>(); for(const item of items){const id=item.reviewId??item.menuItemId;if(!id||seen.has(id))return invalid();seen.add(id);} const parsedLimit=integer(row.limit,1);if(parsedLimit>50)return invalid();return{items,nextCursor:cursor(row.nextCursor),limit:parsedLimit}; };
const reportResult = (value:unknown):RestaurantReportResult => { const row=object(value),keys=Object.keys(row).sort(),accepted=keys.length===3||keys.length===4&&"replayed" in row;if(!accepted||!["reportId","reviewId","status"].every(key=>key in row)||(keys.length===4&&typeof row.replayed!=="boolean"))invalid();if(row.status!=="open")invalid();return{reportId:identifier(row.reportId),reviewId:identifier(row.reviewId),status:"open"}; };

export const createRestaurantReviewV2Repository = (client:Client=supabase) => ({
  async listReviews(options?:{status?:ReviewVisibility|null;reportStatus?:ReviewReportStatus|null;cursor?:string|null;limit?:number}) { return page(await data(client.rpc("restaurant_list_order_reviews_v2",{p_status:options?.status||undefined,p_report_status:options?.reportStatus||undefined,p_cursor:options?.cursor||undefined,p_limit:limit(options?.limit,20)})),mapReview); },
  async reportReview(input:{reviewId:string;reason:ReviewReportReason;internalNote?:string;operationId:string}) { return reportResult(await data(client.rpc("restaurant_report_order_review_v2",{p_review_id:input.reviewId,p_reason:input.reason,p_internal_note:input.internalNote||"",p_operation_id:input.operationId}))); },
  async listReactionAggregates(options?:{cursor?:string|null;limit?:number}) { return page(await data(client.rpc("restaurant_list_menu_item_reaction_aggregates_v2",{p_cursor:options?.cursor||undefined,p_limit:limit(options?.limit,50)})),mapAggregate); },
});
export const restaurantReviewV2Repository=createRestaurantReviewV2Repository();
