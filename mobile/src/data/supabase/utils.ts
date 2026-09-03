import { supabase } from "@/lib/supabase";

export const requireSupabase = () => {
    if (!supabase) throw new Error("Supabase repository selected without an enabled Supabase client.");
    return supabase as any;
};

export const throwIfError = (result: { data: any; error: any }): any => {
    if (result.error) throw result.error;
    return result.data;
};

export const toKurus = (value: unknown) => Math.round(Number(value || 0) * 100);
export const fromKurus = (value: unknown) => Number(value || 0) / 100;

export const toMillis = (value: unknown) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
};

export const slugifyCategory = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9çğıöşü]+/gi, "-")
        .replace(/^-+|-+$/g, "");
