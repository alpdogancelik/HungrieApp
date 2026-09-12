/** Shared identifiers only. They do not grant access to an application. */
export const PORTAL_IDS = ["customer", "restaurant", "admin"] as const;

export type PortalId = (typeof PORTAL_IDS)[number];
export type AccountType = PortalId;
