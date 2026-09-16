export type SupabaseRuntimeConfig = {
    url?: string;
    publishableKey?: string;
    enabled?: string;
    appEnvironment?: string;
};

const NON_PRODUCTION_PROJECTS: Record<string, string> = {
    development: "rgjlsjwsitbnwoetmidb",
    staging: "rlrfvqskzvpysewdxqcr",
};

const projectRefFromUrl = (url: string) => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "";
    } catch {
        return "";
    }
};

export const resolveSupabaseState = (config: SupabaseRuntimeConfig) => {
    const url = String(config.url || "").trim();
    const publishableKey = String(config.publishableKey || "").trim();
    const requested = String(config.enabled || "false").trim().toLowerCase() === "true";
    const appEnvironment = String(config.appEnvironment || "").trim().toLowerCase();
    const projectRef = projectRefFromUrl(url);
    const expectedProjectRef = NON_PRODUCTION_PROJECTS[appEnvironment];
    const environmentMatches = Boolean(projectRef) && (
        expectedProjectRef ? projectRef === expectedProjectRef
            : appEnvironment === "production" && !Object.values(NON_PRODUCTION_PROJECTS).includes(projectRef)
    );
    const credentialsConfigured = Boolean(url && publishableKey);
    const configured = credentialsConfigured && environmentMatches;

    return {
        url,
        publishableKey,
        appEnvironment,
        projectRef,
        credentialsConfigured,
        environmentMatches,
        configured,
        enabled: requested && configured,
    };
};
