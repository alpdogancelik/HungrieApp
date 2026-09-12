/** Shared identifiers only. They do not grant access to an application. */
export const PORTAL_IDS = ["customer", "restaurant", "admin"] as const;

export type PortalId = (typeof PORTAL_IDS)[number];
export type AccountType = PortalId;

export type AccountStatus = "pending" | "active" | "suspended" | "revoked";
export type AdminRole = "admin" | "super_admin";
export type RestaurantRole = "owner" | "manager";
export type RestaurantLifecycleStatus = "pending" | "active" | "suspended" | "closed";

export type AccessContext =
  | { state: "unmapped" }
  | { state: "configuration_error"; referenceId: string }
  | { state: "resolved"; profileId: string; accountType: "customer"; accountStatus: Exclude<AccountStatus,"pending">; onboardingStep: "none" }
  | { state: "resolved"; profileId: string; accountType: "restaurant"; accountStatus: AccountStatus; onboardingStep: "restaurant_approval_required"|"none"; restaurantId: string; restaurantRole: RestaurantRole; restaurantStatus: RestaurantLifecycleStatus; acceptingOrders: boolean }
  | { state: "resolved"; profileId: string; accountType: "admin"; accountStatus: AccountStatus; onboardingStep: "admin_mfa_enrollment_required"|"admin_mfa_sign_in_required"|"none"; adminRole: AdminRole; emailVerified: boolean; currentSessionMfaVerified: boolean };

export type AdminPage<T> = { items: T[]; total: number; limit: number; offset: number };
