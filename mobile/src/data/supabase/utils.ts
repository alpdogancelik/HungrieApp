import { clearCatalogCache } from "./publicCatalogCache";

let clientProvider: () => any = () => null;
let catalogClientProvider: () => any = () => null;

export const requireSupabase = () => {
    const client = clientProvider();
    if (!client) throw new Error("Supabase repository selected without an enabled Supabase client.");
    return client as any;
};

export const requireCatalogSupabase = () => {
    const client = catalogClientProvider();
    if (!client) throw new Error("Supabase catalog selected without an enabled public catalog client.");
    return client as any;
};

export const setSupabaseClientForTests = (client?: any) => {
    clearCatalogCache();
    clientProvider = () => client ?? null;
    catalogClientProvider = () => client ?? null;
};

export const setCatalogSupabaseClientForTests = (client?: any) => {
    clearCatalogCache();
    catalogClientProvider = () => client ?? null;
};

export const setSupabaseClientProvider = (provider: () => any) => {
    clientProvider = provider;
};

export const setCatalogSupabaseClientProvider = (provider: () => any) => {
    catalogClientProvider = provider;
};

export const createInitialFetchSubscription = <T>(
    fetcher: () => Promise<T>,
    onValue: (value: T) => void,
    onError?: (error: unknown) => void,
) => {
    let active = true;
    void fetcher().then((value) => {
        if (active) onValue(value);
    }).catch((error) => {
        if (active) onError?.(error);
    });
    return () => {
        active = false;
    };
};

export const throwIfError = (result: { data: any; error: any }): any => {
    if (result.error) throw result.error;
    return result.data;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const withSupabaseAuthRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (const delay of [0, 1000, 2000]) {
        if (delay) await wait(delay);
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            if (String(error?.code || "") !== "PGRST303" || !String(error?.message || "").toLowerCase().includes("future")) throw error;
            await import("@/lib/firebase").then(({ auth }) => auth?.currentUser?.getIdToken(true)).catch(() => null);
        }
    }
    throw lastError;
};

export const toKurus = (value: unknown) => Math.round(Number(value || 0) * 100);
export const fromKurus = (value: unknown) => Number(value || 0) / 100;

export const toSupabaseOrderStatus = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "accepted") return "preparing";
    if (["rejected", "cancelled"].includes(normalized)) return "canceled";
    if (normalized === "pending approval") return "pending";
    return normalized;
};

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
