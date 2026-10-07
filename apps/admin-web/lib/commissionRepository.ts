"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import type { AccessContext, AdminRestaurantCommissionV1, AdminVirtualPosFoundationV1, RestaurantCommissionRuleV1, RestaurantFinancialWarningV1, ScheduleRestaurantCommissionResultV1, ScheduleVirtualPosCommissionResultV1, VirtualPosCommissionRuleV1 } from "@hungrie/domain";
import { supabase } from "./supabase";

type Client = SupabaseClient<Database>;
type RpcError = { code?: string; message?: string; status?: number };
export type CommissionRepositoryErrorCode = "session_expired" | "recent_auth_required" | "permission_denied" | "operation_conflict" | "duplicate_effective_time" | "retroactive_rule" | "validation" | "network" | "service_unavailable" | "malformed_response" | "unknown";

export type AdminRestaurantDetail = {
  id: string; name: string; description: string; cuisine: string; address: string; phone: string | null; imageUrl: string | null;
  lifecycleStatus: "pending" | "active" | "suspended" | "closed"; acceptingOrders: boolean; suspensionReasonCode: string | null;
  deliveryEtaMinMinutes: number | null; deliveryEtaMaxMinutes: number | null; deliveryFeeKurus: number; minimumOrderKurus: number;
  openingHours: Record<string, unknown>; preferredLanguage: "en" | "tr"; createdAt: string; updatedAt: string;
  accounts: Array<{ profileId: string; name: string; maskedEmail: string | null; role: "owner" | "manager"; status: "pending" | "active" | "suspended" | "revoked"; onboardingStep: "restaurant_approval_required" | "none" }>;
};

export class CommissionRepositoryError extends Error {
  readonly code: CommissionRepositoryErrorCode;
  constructor(code: CommissionRepositoryErrorCode) { super(code); this.code = code; this.name = "CommissionRepositoryError"; }
}

export const classifyCommissionError = (error: RpcError | null | undefined): CommissionRepositoryErrorCode => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || 0);
  if (code === "pgrst303" || message.includes("jwt") || message.includes("session")) return "session_expired";
  if (message.includes("recent authentication required")) return "recent_auth_required";
  if (message.includes("operation id was already used")) return "operation_conflict";
  if (message.includes("already exists at this effective time")) return "duplicate_effective_time";
  if (message.includes("would change an existing order rule")) return "retroactive_rule";
  if (code === "42501" || message.includes("active mfa-authenticated admin") || message.includes("restaurant unavailable")) return "permission_denied";
  if (status === 0 && !code) return "network";
  if (code === "22023" || code === "23514" || status === 400) return "validation";
  if (status >= 500) return "service_unavailable";
  return "unknown";
};

const malformed = (): never => { throw new CommissionRepositoryError("malformed_response"); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : malformed();
const exact = (row: Record<string, unknown>, keys: string[]) => { if (Object.keys(row).some((key) => !keys.includes(key)) || keys.some((key) => !(key in row))) malformed(); return row; };
const text = (value: unknown) => typeof value === "string" && value.length > 0 ? value : malformed();
const nullableText = (value: unknown) => value === null ? null : text(value);
const bool = (value: unknown) => typeof value === "boolean" ? value : malformed();
const integer = (value: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : malformed();
const nullableInteger = (value: unknown, min = 0) => value === null ? null : integer(value, min);
const timestamp = (value: unknown) => { const result = text(value); if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) malformed(); return new Date(result).toISOString(); };
const uuid = (value: unknown) => { const result = text(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) malformed(); return result; };
const oneOf = <T extends string>(value: unknown, values: readonly T[]) => values.includes(value as T) ? value as T : malformed();
const timezone = (value: unknown) => { const result = text(value); try { new Intl.DateTimeFormat("en", { timeZone: result }).format(); } catch { malformed(); } return result; };
const plainObject = (value: unknown) => object(value);
const commissionReason = (value: unknown) => { const result = text(value); if (result !== result.trim() || Array.from(result).length > 500) malformed(); return result; };

const mapAccessContext = (value: unknown): AccessContext => {
  const row = object(value);
  const state = oneOf(row.state, ["unmapped", "configuration_error", "resolved"] as const);
  if (state === "unmapped") { exact(row, ["state"]); return { state }; }
  if (state === "configuration_error") { exact(row, ["state", "referenceId"]); return { state, referenceId: text(row.referenceId) }; }
  const accountType = oneOf(row.accountType, ["customer", "restaurant", "admin"] as const);
  if (accountType === "customer") {
    exact(row, ["state", "profileId", "accountType", "accountStatus", "onboardingStep"]);
    return { state: "resolved", profileId: text(row.profileId), accountType: "customer", accountStatus: oneOf(row.accountStatus, ["active", "suspended", "revoked"] as const), onboardingStep: oneOf(row.onboardingStep, ["none"] as const) };
  }
  if (accountType === "restaurant") {
    exact(row, ["state", "profileId", "accountType", "accountStatus", "onboardingStep", "restaurantId", "restaurantRole", "restaurantStatus", "acceptingOrders"]);
    return { state: "resolved", profileId: text(row.profileId), accountType: "restaurant", accountStatus: oneOf(row.accountStatus, ["pending", "active", "suspended", "revoked"] as const), onboardingStep: oneOf(row.onboardingStep, ["restaurant_approval_required", "none"] as const), restaurantId: text(row.restaurantId), restaurantRole: oneOf(row.restaurantRole, ["owner", "manager"] as const), restaurantStatus: oneOf(row.restaurantStatus, ["pending", "active", "suspended", "closed"] as const), acceptingOrders: bool(row.acceptingOrders) };
  }
  exact(row, ["state", "profileId", "accountType", "accountStatus", "onboardingStep", "adminRole", "emailVerified", "currentSessionMfaVerified"]);
  return { state: "resolved", profileId: text(row.profileId), accountType: "admin", accountStatus: oneOf(row.accountStatus, ["pending", "active", "suspended", "revoked"] as const), onboardingStep: oneOf(row.onboardingStep, ["admin_mfa_enrollment_required", "admin_mfa_sign_in_required", "none"] as const), adminRole: oneOf(row.adminRole, ["admin", "super_admin"] as const), emailVerified: bool(row.emailVerified), currentSessionMfaVerified: bool(row.currentSessionMfaVerified) };
};

const mapRule = (value: unknown): RestaurantCommissionRuleV1 => {
  const row = exact(object(value), ["id", "rateBps", "contractVersion", "effectiveFrom", "createdAt", "reason"]);
  return { id: uuid(row.id), rateBps: integer(row.rateBps, 0, 10_000), contractVersion: integer(row.contractVersion, 1, 1) as 1, effectiveFrom: timestamp(row.effectiveFrom), createdAt: timestamp(row.createdAt), reason: commissionReason(row.reason) };
};

const warningTypes = ["missing_applicable_rule", "missing_order_terms", "missing_delivered_snapshot", "snapshot_mismatch"] as const;
const mapWarning = (value: unknown): RestaurantFinancialWarningV1 => {
  const row = exact(object(value), ["id", "type", "details", "firstDetectedAt", "lastDetectedAt", "occurrenceCount"]);
  const details = object(row.details); exact(details, Object.hasOwn(details, "orderReference") ? ["orderReference"] : []);
  const orderReference = details.orderReference === undefined ? undefined : text(details.orderReference);
  if (orderReference && !/^[0-9a-f]{12}$/i.test(orderReference)) malformed();
  return { id: uuid(row.id), type: oneOf(row.type, warningTypes), details: orderReference ? { orderReference } : {}, firstDetectedAt: timestamp(row.firstDetectedAt), lastDetectedAt: timestamp(row.lastDetectedAt), occurrenceCount: integer(row.occurrenceCount, 1) };
};

const mapCommission = (value: unknown, restaurantId: string): AdminRestaurantCommissionV1 => {
  const row = exact(object(value), ["restaurantId", "reportingTimezone", "capabilityEnabled", "currentRule", "nextScheduledRule", "history", "historyHasMore", "warnings"]);
  if (text(row.restaurantId) !== restaurantId || !Array.isArray(row.history) || row.history.length > 100 || !Array.isArray(row.warnings) || row.warnings.length > 20) malformed();
  const history = row.history as unknown[]; const warnings = row.warnings as unknown[];
  const currentRule = row.currentRule === null ? null : mapRule(row.currentRule);
  const nextScheduledRule = row.nextScheduledRule === null ? null : mapRule(row.nextScheduledRule);
  return { restaurantId, reportingTimezone: timezone(row.reportingTimezone), capabilityEnabled: bool(row.capabilityEnabled), currentRule, nextScheduledRule, history: history.map(mapRule), historyHasMore: bool(row.historyHasMore), warnings: warnings.map(mapWarning) };
};

const mapRestaurant = (value: unknown, restaurantId: string): AdminRestaurantDetail => {
  const keys = ["id", "name", "description", "cuisine", "address", "phone", "image_url", "lifecycle_status", "accepting_orders", "suspension_reason_code", "delivery_eta_min_minutes", "delivery_eta_max_minutes", "delivery_fee_kurus", "minimum_order_kurus", "opening_hours", "preferred_language", "created_at", "updated_at", "accounts"];
  const row = exact(object(value), keys);
  if (text(row.id) !== restaurantId || !Array.isArray(row.accounts)) malformed();
  const accounts = (row.accounts as unknown[]).map((value: unknown) => { const account = exact(object(value), ["profileId", "name", "maskedEmail", "role", "status", "onboardingStep"]); return { profileId: text(account.profileId), name: text(account.name), maskedEmail: nullableText(account.maskedEmail), role: oneOf(account.role, ["owner", "manager"] as const), status: oneOf(account.status, ["pending", "active", "suspended", "revoked"] as const), onboardingStep: oneOf(account.onboardingStep, ["restaurant_approval_required", "none"] as const) }; });
  return { id: restaurantId, name: text(row.name), description: typeof row.description === "string" ? row.description : malformed(), cuisine: typeof row.cuisine === "string" ? row.cuisine : malformed(), address: typeof row.address === "string" ? row.address : malformed(), phone: nullableText(row.phone), imageUrl: nullableText(row.image_url), lifecycleStatus: oneOf(row.lifecycle_status, ["pending", "active", "suspended", "closed"] as const), acceptingOrders: bool(row.accepting_orders), suspensionReasonCode: nullableText(row.suspension_reason_code), deliveryEtaMinMinutes: nullableInteger(row.delivery_eta_min_minutes), deliveryEtaMaxMinutes: nullableInteger(row.delivery_eta_max_minutes), deliveryFeeKurus: integer(row.delivery_fee_kurus, 0), minimumOrderKurus: integer(row.minimum_order_kurus, 0), openingHours: plainObject(row.opening_hours), preferredLanguage: oneOf(row.preferred_language, ["en", "tr"] as const), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), accounts };
};

const mapScheduleResult = (value: unknown, input: ScheduleInput): ScheduleRestaurantCommissionResultV1 => {
  const row = exact(object(value), ["ruleId", "restaurantId", "rateBps", "contractVersion", "effectiveFrom", "reason", "operationId", "replayed"]);
  const result = { ruleId: uuid(row.ruleId), restaurantId: text(row.restaurantId), rateBps: integer(row.rateBps, 0, 10_000), contractVersion: integer(row.contractVersion, 1, 1) as 1, effectiveFrom: timestamp(row.effectiveFrom), reason: commissionReason(row.reason), operationId: uuid(row.operationId), replayed: bool(row.replayed) };
  if (result.restaurantId !== input.restaurantId || result.rateBps !== input.rateBps || result.effectiveFrom !== input.effectiveFrom || result.reason !== input.reason || result.operationId !== input.operationId) malformed();
  return result;
};

const virtualRule = (value: unknown): VirtualPosCommissionRuleV1 => {
  const row = exact(object(value), ["id", "rateBps", "financialContractVersion", "providerContractVersion", "effectiveFrom", "createdAt", "reason"]);
  return { id: uuid(row.id), rateBps: integer(row.rateBps, 0, 10_000), financialContractVersion: integer(row.financialContractVersion, 1, 1) as 1, providerContractVersion: text(row.providerContractVersion), effectiveFrom: timestamp(row.effectiveFrom), createdAt: timestamp(row.createdAt), reason: commissionReason(row.reason) };
};
const nullableVirtualRule = (value: unknown) => value === null ? null : virtualRule(value);
const mapVirtualPosFoundation = (value: unknown, restaurantId: string): AdminVirtualPosFoundationV1 => {
  const row = exact(object(value), ["restaurantId", "activationState", "customerAvailable", "providerConfigured", "currentRule", "nextScheduledRule", "history", "historyHasMore"]);
  if (text(row.restaurantId) !== restaurantId || row.customerAvailable !== false || row.providerConfigured !== false || !Array.isArray(row.history)) malformed();
  const history = row.history as unknown[];
  return { restaurantId, activationState: oneOf(row.activationState, ["unconfigured", "sandbox_configured", "sandbox_qualified", "production_configured", "production_qualified", "active", "suspended"] as const), customerAvailable: false, providerConfigured: false, currentRule: nullableVirtualRule(row.currentRule), nextScheduledRule: nullableVirtualRule(row.nextScheduledRule), history: history.map(virtualRule), historyHasMore: bool(row.historyHasMore) };
};
const mapVirtualScheduleResult = (value: unknown, input: ScheduleVirtualPosInput): ScheduleVirtualPosCommissionResultV1 => {
  const row = exact(object(value), ["ruleId", "restaurantId", "rateBps", "financialContractVersion", "providerContractVersion", "effectiveFrom", "reason", "operationId", "replayed"]);
  const result = { ruleId: uuid(row.ruleId), restaurantId: text(row.restaurantId), rateBps: integer(row.rateBps, 0, 10_000), financialContractVersion: integer(row.financialContractVersion, 1, 1) as 1, providerContractVersion: text(row.providerContractVersion), effectiveFrom: timestamp(row.effectiveFrom), reason: commissionReason(row.reason), operationId: uuid(row.operationId), replayed: bool(row.replayed) };
  if (result.restaurantId !== input.restaurantId || result.rateBps !== input.rateBps || result.effectiveFrom !== input.effectiveFrom || result.providerContractVersion !== input.providerContractVersion || result.reason !== input.reason || result.operationId !== input.operationId) malformed();
  return result;
};

const data = async (request: PromiseLike<{ data: unknown; error: RpcError | null }>) => { const result = await request; if (result.error) throw new CommissionRepositoryError(classifyCommissionError(result.error)); return result.data; };
export type ScheduleInput = { restaurantId: string; rateBps: number; effectiveFrom: string; reason: string; operationId: string };
export type ScheduleVirtualPosInput = ScheduleInput & { providerContractVersion: string };

export const createCommissionRepository = (client: Client = supabase) => ({
  async getRestaurant(restaurantId: string) { return mapRestaurant(await data(client.rpc("admin_get_restaurant_v1", { p_restaurant_id: restaurantId })), restaurantId); },
  async getAccessContext() { return mapAccessContext(await data(client.rpc("get_my_access_context_v1"))); },
  async getCommission(restaurantId: string) { return mapCommission(await data(client.rpc("admin_get_restaurant_commission_v1", { p_restaurant_id: restaurantId })), restaurantId); },
  async getVirtualPosFoundation(restaurantId: string) { return mapVirtualPosFoundation(await data(client.rpc("admin_get_virtual_pos_foundation_v1", { p_restaurant_id: restaurantId })), restaurantId); },
  async schedule(input: ScheduleInput) { return mapScheduleResult(await data(client.rpc("admin_schedule_restaurant_commission_v1", { p_restaurant_id: input.restaurantId, p_rate_bps: input.rateBps, p_effective_from: input.effectiveFrom, p_reason: input.reason, p_operation_id: input.operationId })), input); },
  async scheduleVirtualPos(input: ScheduleVirtualPosInput) { return mapVirtualScheduleResult(await data(client.rpc("admin_schedule_virtual_pos_commission_v1", { p_restaurant_id: input.restaurantId, p_rate_bps: input.rateBps, p_effective_from: input.effectiveFrom, p_provider_contract_version: input.providerContractVersion, p_reason: input.reason, p_operation_id: input.operationId })), input); },
});

export const commissionRepository = createCommissionRepository();
