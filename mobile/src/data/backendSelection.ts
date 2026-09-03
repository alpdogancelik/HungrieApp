import type { RepositoryBackend, RepositoryDomain, RepositoryRuntimeFlags, RepositorySelection } from "./types";

const normalizeBackend = (value: RepositoryBackend | boolean | string | undefined): RepositoryBackend => {
    if (value === true) return "supabase";
    if (String(value || "").trim().toLowerCase() === "supabase") return "supabase";
    return "firebase";
};

export const resolveRepositoryBackend = (
    domain: RepositoryDomain,
    flags: RepositoryRuntimeFlags = {},
): RepositorySelection => {
    const requested = normalizeBackend(flags.domains?.[domain]);
    const enabled = Boolean(flags.supabaseEnabled);
    return {
        domain,
        backend: enabled && requested === "supabase" ? "supabase" : "firebase",
        supabaseEnabled: enabled,
    };
};

export const selectRepositoryForBackend = <T>(
    domain: RepositoryDomain,
    flags: RepositoryRuntimeFlags,
    implementations: Record<RepositoryBackend, T>,
): T => implementations[resolveRepositoryBackend(domain, flags).backend];
