export type SupabaseRuntimeConfig = {
    url?: string;
    publishableKey?: string;
    enabled?: string;
};

export const resolveSupabaseState = (config: SupabaseRuntimeConfig) => {
    const url = String(config.url || "").trim();
    const publishableKey = String(config.publishableKey || "").trim();
    const requested = String(config.enabled || "false").trim().toLowerCase() === "true";
    const configured = Boolean(url && publishableKey);

    return {
        url,
        publishableKey,
        configured,
        enabled: requested && configured,
    };
};
