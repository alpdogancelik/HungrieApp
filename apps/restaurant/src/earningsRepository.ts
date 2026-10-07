import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import type { EarningsPaymentBreakdownV2, EarningsPaymentMethodV2, EarningsSeriesBucket, RestaurantEarningsOrdersPageV2, RestaurantEarningsOrderRowV2, RestaurantEarningsSeriesPointV2, RestaurantEarningsSeriesV2, RestaurantEarningsSummaryV2 } from "@hungrie/domain";
import { supabase } from "./supabase";

type Client = SupabaseClient<Database>;
type RpcError = { code?: string; message?: string; status?: number };
export type EarningsRepositoryErrorCode = "permission_denied" | "validation" | "network" | "service_unavailable" | "malformed_response" | "unknown";

export class EarningsRepositoryError extends Error {
  readonly code: EarningsRepositoryErrorCode;
  constructor(code: EarningsRepositoryErrorCode) { super(code); this.code = code; this.name = "EarningsRepositoryError"; }
}
export const classifyEarningsError = (error: RpcError | null | undefined): EarningsRepositoryErrorCode => {
  const code = String(error?.code || "").toLowerCase(), message = String(error?.message || "").toLowerCase(), status = Number(error?.status || 0);
  if (code === "42501" || message.includes("restaurant owner required") || message.includes("active restaurant")) return "permission_denied";
  if (code === "22023" || status === 400) return "validation";
  if (status === 0 && !code) return "network";
  if (status >= 500) return "service_unavailable";
  return "unknown";
};
const malformed = (): never => { throw new EarningsRepositoryError("malformed_response"); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : malformed();
const exact = (row: Record<string, unknown>, keys: string[]) => { if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) malformed(); return row; };
const text = (value: unknown) => typeof value === "string" && value.length > 0 ? value : malformed();
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : malformed();
const date = (value: unknown) => {
  const result = text(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) malformed();
  const [year, month, day] = result.split("-").map(Number), parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) malformed();
  return result;
};
const timestamp = (value: unknown) => { const result = text(value); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) malformed(); return new Date(result).toISOString(); };
const timezone = (value: unknown) => { const result = text(value); try { new Intl.DateTimeFormat("en", { timeZone: result }).format(); } catch { malformed(); } return result; };
const method = (value: unknown): EarningsPaymentMethodV2 => value === "cash" || value === "pos" || value === "virtual_pos" ? value : malformed();
const bucket = (value: unknown): EarningsSeriesBucket => value === "day" || value === "week" || value === "month" ? value : malformed();
const currency = (value: unknown) => value === "TRY" ? "TRY" as const : malformed();
const cursor = (value: unknown) => value === null ? null : typeof value === "string" && value.length > 0 && value.length <= 2048 ? value : malformed();

const mapBreakdown = (value: unknown): EarningsPaymentBreakdownV2 => {
  const row = exact(object(value), ["eligibleGrossKurus", "hungrieCommissionKurus", "virtualPosCommissionKurus", "totalDeductionsKurus", "estimatedNetKurus", "deliveredOrderCount"]);
  const result = { eligibleGrossKurus: integer(row.eligibleGrossKurus), hungrieCommissionKurus: integer(row.hungrieCommissionKurus), virtualPosCommissionKurus: integer(row.virtualPosCommissionKurus), totalDeductionsKurus: integer(row.totalDeductionsKurus), estimatedNetKurus: integer(row.estimatedNetKurus), deliveredOrderCount: integer(row.deliveredOrderCount) };
  if (result.hungrieCommissionKurus + result.virtualPosCommissionKurus !== result.totalDeductionsKurus || result.eligibleGrossKurus - result.totalDeductionsKurus !== result.estimatedNetKurus) malformed();
  return result;
};
const mapFinancials = (row: Record<string, unknown>) => {
  const eligibleGrossKurus = integer(row.eligibleGrossKurus), hungrieCommissionKurus = integer(row.hungrieCommissionKurus), virtualPosCommissionKurus = integer(row.virtualPosCommissionKurus), totalDeductionsKurus = integer(row.totalDeductionsKurus), estimatedNetKurus = integer(row.estimatedNetKurus), deliveredOrderCount = integer(row.deliveredOrderCount);
  if (hungrieCommissionKurus + virtualPosCommissionKurus !== totalDeductionsKurus || eligibleGrossKurus - totalDeductionsKurus !== estimatedNetKurus) malformed();
  const payments = exact(object(row.paymentBreakdown), ["cash", "pos", "virtual_pos"]), cash = mapBreakdown(payments.cash), pos = mapBreakdown(payments.pos), virtual_pos = mapBreakdown(payments.virtual_pos);
  const values = [cash, pos, virtual_pos];
  if (values.reduce((sum, item) => sum + item.eligibleGrossKurus, 0) !== eligibleGrossKurus || values.reduce((sum, item) => sum + item.hungrieCommissionKurus, 0) !== hungrieCommissionKurus || values.reduce((sum, item) => sum + item.virtualPosCommissionKurus, 0) !== virtualPosCommissionKurus || values.reduce((sum, item) => sum + item.totalDeductionsKurus, 0) !== totalDeductionsKurus || values.reduce((sum, item) => sum + item.estimatedNetKurus, 0) !== estimatedNetKurus || values.reduce((sum, item) => sum + item.deliveredOrderCount, 0) !== deliveredOrderCount) malformed();
  return { eligibleGrossKurus, hungrieCommissionKurus, virtualPosCommissionKurus, totalDeductionsKurus, estimatedNetKurus, deliveredOrderCount, paymentBreakdown: { cash, pos, virtual_pos } };
};
const identity = (row: Record<string, unknown>) => ({ restaurantId: text(row.restaurantId), from: date(row.from), to: date(row.to), reportingTimezone: timezone(row.reportingTimezone), currencyCode: currency(row.currencyCode) });

export const parseEarningsSummary = (value: unknown): RestaurantEarningsSummaryV2 => {
  const row = exact(object(value), ["restaurantId", "from", "to", "reportingTimezone", "currencyCode", "eligibleGrossKurus", "hungrieCommissionKurus", "virtualPosCommissionKurus", "totalDeductionsKurus", "estimatedNetKurus", "deliveredOrderCount", "providerFeesReconciled", "paymentBreakdown"]);
  if (row.providerFeesReconciled !== false) malformed();
  return { ...identity(row), ...mapFinancials(row), providerFeesReconciled: false };
};
const mapPoint = (value: unknown): RestaurantEarningsSeriesPointV2 => {
  const row = exact(object(value), ["bucketStart", "eligibleGrossKurus", "hungrieCommissionKurus", "virtualPosCommissionKurus", "totalDeductionsKurus", "estimatedNetKurus", "deliveredOrderCount"]);
  const point = { bucketStart: date(row.bucketStart), eligibleGrossKurus: integer(row.eligibleGrossKurus), hungrieCommissionKurus: integer(row.hungrieCommissionKurus), virtualPosCommissionKurus: integer(row.virtualPosCommissionKurus), totalDeductionsKurus: integer(row.totalDeductionsKurus), estimatedNetKurus: integer(row.estimatedNetKurus), deliveredOrderCount: integer(row.deliveredOrderCount) };
  if (point.hungrieCommissionKurus + point.virtualPosCommissionKurus !== point.totalDeductionsKurus || point.eligibleGrossKurus - point.totalDeductionsKurus !== point.estimatedNetKurus) malformed();
  return point;
};
export const parseEarningsSeries = (value: unknown): RestaurantEarningsSeriesV2 => {
  const row = exact(object(value), ["restaurantId", "from", "to", "bucket", "reportingTimezone", "currencyCode", "points"]);
  if (!Array.isArray(row.points)) malformed();
  const points = (row.points as unknown[]).map(mapPoint);
  if (points.some((point, index) => index > 0 && point.bucketStart <= points[index - 1].bucketStart)) malformed();
  return { ...identity(row), bucket: bucket(row.bucket), points };
};
const mapOrder = (value: unknown): RestaurantEarningsOrderRowV2 => {
  const row = exact(object(value), ["orderReference", "deliveredAt", "paymentMethod", "currencyCode", "eligibleGrossKurus", "hungrieRateBps", "hungrieCommissionKurus", "virtualPosRateBps", "virtualPosCommissionKurus", "totalDeductionsKurus", "estimatedNetKurus", "providerFeesReconciled"]);
  const orderReference = text(row.orderReference); if (!/^[A-F0-9]{8}$/.test(orderReference)) malformed();
  const eligibleGrossKurus = integer(row.eligibleGrossKurus), hungrieCommissionKurus = integer(row.hungrieCommissionKurus), virtualPosCommissionKurus = integer(row.virtualPosCommissionKurus), totalDeductionsKurus = integer(row.totalDeductionsKurus), estimatedNetKurus = integer(row.estimatedNetKurus);
  if (row.providerFeesReconciled !== false || hungrieCommissionKurus + virtualPosCommissionKurus !== totalDeductionsKurus || eligibleGrossKurus - totalDeductionsKurus !== estimatedNetKurus) malformed();
  return { orderReference, deliveredAt: timestamp(row.deliveredAt), paymentMethod: method(row.paymentMethod), currencyCode: currency(row.currencyCode), eligibleGrossKurus, hungrieRateBps: integer(row.hungrieRateBps, 0, 10_000), hungrieCommissionKurus, virtualPosRateBps: integer(row.virtualPosRateBps, 0, 10_000), virtualPosCommissionKurus, totalDeductionsKurus, estimatedNetKurus, providerFeesReconciled: false };
};
export const parseEarningsPage = (value: unknown): RestaurantEarningsOrdersPageV2 => {
  const row = exact(object(value), ["restaurantId", "from", "to", "reportingTimezone", "currencyCode", "limit", "items", "nextCursor"]);
  if (!Array.isArray(row.items)) malformed();
  const items = (row.items as unknown[]).map(mapOrder), seen = new Set<string>();
  for (const item of items) { if (seen.has(item.orderReference)) malformed(); seen.add(item.orderReference); }
  if (items.some((item, index) => index > 0 && Date.parse(item.deliveredAt) > Date.parse(items[index - 1].deliveredAt))) malformed();
  const limit = integer(row.limit, 1, 50); if (items.length > limit) malformed();
  return { ...identity(row), limit, items, nextCursor: cursor(row.nextCursor) };
};

const utcDay = (value: string) => Date.parse(`${value}T00:00:00Z`);
const localDateForTimestamp = (value: string, timeZone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const validateSeriesSemantics = (series: RestaurantEarningsSeriesV2) => {
  for (const point of series.points) {
    const pointDay = utcDay(point.bucketStart), fromDay = utcDay(series.from), toDay = utcDay(series.to);
    if (pointDay > toDay) malformed();
    if (series.bucket === "day" && pointDay < fromDay) malformed();
    if (series.bucket === "week" && (new Date(pointDay).getUTCDay() !== 1 || pointDay < fromDay - 6 * 86_400_000)) malformed();
    if (series.bucket === "month" && (point.bucketStart.slice(8) !== "01" || point.bucketStart.slice(0, 7) < series.from.slice(0, 7))) malformed();
  }
};
const validatePageRows = (page: RestaurantEarningsOrdersPageV2) => {
  for (const item of page.items) { const delivered = localDateForTimestamp(item.deliveredAt, page.reportingTimezone); if (delivered < page.from || delivered > page.to) malformed(); }
};

export const validateEarningsBundle = (summary: RestaurantEarningsSummaryV2, series: RestaurantEarningsSeriesV2, page: RestaurantEarningsOrdersPageV2, expected: { restaurantId: string; from: string; to: string; bucket: EarningsSeriesBucket }) => {
  for (const result of [summary, series, page]) if (result.restaurantId !== expected.restaurantId || result.from !== expected.from || result.to !== expected.to || result.reportingTimezone !== summary.reportingTimezone || result.currencyCode !== "TRY") malformed();
  if (series.bucket !== expected.bucket || page.limit !== 25) malformed();
  if ((summary.deliveredOrderCount === 0) !== (page.items.length === 0)) malformed();
  validateSeriesSemantics(series); validatePageRows(page);
  const totals = series.points.reduce((value, point) => ({ gross: value.gross + point.eligibleGrossKurus, hungrie: value.hungrie + point.hungrieCommissionKurus, virtualPos: value.virtualPos + point.virtualPosCommissionKurus, deductions: value.deductions + point.totalDeductionsKurus, net: value.net + point.estimatedNetKurus, count: value.count + point.deliveredOrderCount }), { gross: 0, hungrie: 0, virtualPos: 0, deductions: 0, net: 0, count: 0 });
  if (totals.gross !== summary.eligibleGrossKurus || totals.hungrie !== summary.hungrieCommissionKurus || totals.virtualPos !== summary.virtualPosCommissionKurus || totals.deductions !== summary.totalDeductionsKurus || totals.net !== summary.estimatedNetKurus || totals.count !== summary.deliveredOrderCount) malformed();
};
export const validateEarningsPageIdentity = (page: RestaurantEarningsOrdersPageV2, expected: { restaurantId: string; from: string; to: string; reportingTimezone: string }) => {
  if (page.restaurantId !== expected.restaurantId || page.from !== expected.from || page.to !== expected.to || page.reportingTimezone !== expected.reportingTimezone || page.currencyCode !== "TRY" || page.limit !== 25) malformed();
  validatePageRows(page);
};

const resolve = async (request: PromiseLike<{ data: unknown; error: RpcError | null }>) => { const result = await request; if (result.error) throw new EarningsRepositoryError(classifyEarningsError(result.error)); return result.data; };
const withSignal = <T>(request: T, signal?: AbortSignal): T => signal && request && typeof request === "object" && "abortSignal" in request && typeof (request as { abortSignal?: unknown }).abortSignal === "function" ? (request as { abortSignal: (signal: AbortSignal) => T }).abortSignal(signal) : request;

export const createEarningsRepository = (client: Client = supabase) => ({
  async summary(from: string, to: string, signal?: AbortSignal) { return parseEarningsSummary(await resolve(withSignal(client.rpc("restaurant_get_earnings_summary_v2", { p_from: from, p_to: to }), signal))); },
  async series(from: string, to: string, selectedBucket: EarningsSeriesBucket, signal?: AbortSignal) { return parseEarningsSeries(await resolve(withSignal(client.rpc("restaurant_get_earnings_series_v2", { p_from: from, p_to: to, p_bucket: selectedBucket }), signal))); },
  async page(from: string, to: string, opaqueCursor: string | null = null, signal?: AbortSignal) { return parseEarningsPage(await resolve(withSignal(client.rpc("restaurant_get_earnings_orders_page_v2", { p_from: from, p_to: to, p_cursor: opaqueCursor || undefined, p_limit: 25 }), signal))); },
});
export const earningsRepository = createEarningsRepository();
