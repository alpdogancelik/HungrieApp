import type { RepositoryBackend, RepositoryDomain, RepositoryRuntimeFlags, RepositorySelection } from "./types";

export const resolveRepositoryBackend = (
    domain: RepositoryDomain,
    flags: RepositoryRuntimeFlags = {},
): RepositorySelection => {
    const enabled = Boolean(flags.supabaseEnabled);
    return {
        domain,
        // Firebase is an identity provider only. Selecting the Supabase
        // adapter even when configuration is missing makes data access fail
        // closed in requireSupabase() instead of silently reading Firestore.
        backend: domain === "auth" ? "firebase" : "supabase",
        supabaseEnabled: enabled,
    };
};

export const selectRepositoryForBackend = <T>(
    domain: RepositoryDomain,
    flags: RepositoryRuntimeFlags,
    implementations: Record<RepositoryBackend, T>,
): T => implementations[resolveRepositoryBackend(domain, flags).backend];
