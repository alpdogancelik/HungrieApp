import type { AccessContext, AdminPage } from "@hungrie/domain";

export type { AccessContext };
export type PageResult = AdminPage<Record<string, unknown>>;
export type Locale = "en" | "tr";
