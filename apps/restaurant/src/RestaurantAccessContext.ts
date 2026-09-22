import { createContext, useContext } from "react";
import type { AccessContext as DomainAccessContext } from "@hungrie/domain";

export type RestaurantAccessContextValue = Extract<DomainAccessContext, { state: "resolved"; accountType: "restaurant" }>;

export class RestaurantAccessContextError extends Error {
  constructor() { super("Invalid Restaurant access context"); this.name = "RestaurantAccessContextError"; }
}
const invalid = (): never => { throw new RestaurantAccessContextError(); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const exact = (row: Record<string, unknown>, keys: string[]) => { if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) invalid(); return row; };
const text = (value: unknown) => typeof value === "string" && value.length > 0 ? value : invalid();
const oneOf = <T extends string>(value: unknown, choices: readonly T[]) => choices.includes(value as T) ? value as T : invalid();

export const parseRestaurantAccessContext = (value: unknown): DomainAccessContext => {
  const row = object(value);
  const state = oneOf(row.state, ["unmapped", "configuration_error", "resolved"] as const);
  if (state === "unmapped") { exact(row, ["state"]); return { state }; }
  if (state === "configuration_error") { exact(row, ["state", "referenceId"]); return { state, referenceId: text(row.referenceId) }; }
  const accountType = oneOf(row.accountType, ["customer", "restaurant", "admin"] as const);
  if (accountType !== "restaurant") return { state: "configuration_error", referenceId: "wrong-portal" };
  exact(row, ["state", "profileId", "accountType", "accountStatus", "onboardingStep", "restaurantId", "restaurantRole", "restaurantStatus", "acceptingOrders"]);
  return {
    state: "resolved", profileId: text(row.profileId), accountType: "restaurant",
    accountStatus: oneOf(row.accountStatus, ["pending", "active", "suspended", "revoked"] as const),
    onboardingStep: oneOf(row.onboardingStep, ["restaurant_approval_required", "none"] as const),
    restaurantId: text(row.restaurantId), restaurantRole: oneOf(row.restaurantRole, ["owner", "manager"] as const),
    restaurantStatus: oneOf(row.restaurantStatus, ["pending", "active", "suspended", "closed"] as const),
    acceptingOrders: typeof row.acceptingOrders === "boolean" ? row.acceptingOrders : invalid(),
  };
};

export const RestaurantAccessContext = createContext<RestaurantAccessContextValue | null>(null);
export const useRestaurantAccessContext = () => useContext(RestaurantAccessContext);
export const isActiveRestaurantOwner = (value: RestaurantAccessContextValue | null) => Boolean(value && value.accountStatus === "active" && value.restaurantStatus === "active" && value.onboardingStep === "none" && value.restaurantRole === "owner");
