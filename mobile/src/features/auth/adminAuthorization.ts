import { auth } from "@/lib/firebase";
import { supabase, supabaseEnabled } from "@/lib/supabase";

export type AdminPlatformRole = "admin" | "super_admin";

export type AdminDenialReason =
    | "signed_out"
    | "firebase_user_missing"
    | "supabase_disabled"
    | "transport_role_invalid"
    | "firebase_admin_role_missing"
    | "legacy_admin_claim"
    | "supabase_profile_missing"
    | "supabase_admin_role_missing"
    | "role_mismatch"
    | "invalid_authorization_response";

export type AdminAvailabilityReason =
    | "firebase_auth_unavailable"
    | "firebase_token_unavailable"
    | "authorization_timeout"
    | "supabase_unavailable";

export type AdminAuthorizationResult =
    | { status: "allowed"; role: AdminPlatformRole; profileId: string }
    | { status: "denied"; reason: AdminDenialReason }
    | { status: "unavailable"; reason: AdminAvailabilityReason };

export type AdminRouteAction = "loading" | "sign_in" | "home" | "retry" | "allow";

export const shouldMountAdminChildren = (action: AdminRouteAction) => action === "allow";

export const resolveAdminRouteAction = (
    authenticated: boolean,
    result: AdminAuthorizationResult | null,
): AdminRouteAction => {
    if (!authenticated) return "sign_in";
    if (!result) return "loading";
    if (result.status === "allowed") return "allow";
    if (result.status === "unavailable") return "retry";
    return result.reason === "signed_out" || result.reason === "firebase_user_missing" ? "sign_in" : "home";
};

type FirebaseTokenResult = {
    token: string;
    claims: Record<string, unknown>;
};

type FirebaseAdminUser = {
    uid: string;
    getIdTokenResult: (forceRefresh?: boolean) => Promise<FirebaseTokenResult>;
};

type SupabaseRpcError = {
    code?: string;
    message?: string;
};

type SupabaseRpcResult = {
    data: unknown;
    error: SupabaseRpcError | null;
};

export type AdminAuthorizationDependencies = {
    supabaseEnabled: boolean;
    waitForAuthReady: () => Promise<void>;
    getFirebaseUser: () => FirebaseAdminUser | null;
    readSupabaseAuthorization: (signal: AbortSignal) => Promise<SupabaseRpcResult>;
};

const ADMIN_ROLES = new Set<AdminPlatformRole>(["admin", "super_admin"]);
const LEGACY_SCALAR_KEYS = ["platformRole", "adminRole"] as const;
const LEGACY_LIST_KEYS = ["roles", "platformRoles", "platform_roles"] as const;
export const ADMIN_AUTHORIZATION_TIMEOUT_MS = 10_000;

const isAdminRole = (value: unknown): value is AdminPlatformRole =>
    typeof value === "string" && ADMIN_ROLES.has(value as AdminPlatformRole);

const hasLegacyAdminClaim = (claims: Record<string, unknown>) => {
    if (Object.prototype.hasOwnProperty.call(claims, "admin")) return true;
    if (LEGACY_SCALAR_KEYS.some((key) => Object.prototype.hasOwnProperty.call(claims, key))) return true;
    return LEGACY_LIST_KEYS.some((key) =>
        Array.isArray(claims[key]) && claims[key].some((value) => isAdminRole(value)),
    );
};

const evaluateFirebaseClaims = (claims: Record<string, unknown>): AdminAuthorizationResult | AdminPlatformRole => {
    if (hasLegacyAdminClaim(claims)) return { status: "denied", reason: "legacy_admin_claim" };
    if (claims.role !== "authenticated") return { status: "denied", reason: "transport_role_invalid" };
    if (!isAdminRole(claims.platform_role)) return { status: "denied", reason: "firebase_admin_role_missing" };
    return claims.platform_role;
};

const evaluateSupabaseAuthorization = (
    value: unknown,
    firebaseRole: AdminPlatformRole,
): AdminAuthorizationResult => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { status: "denied", reason: "invalid_authorization_response" };
    }

    const row = value as Record<string, unknown>;
    const profileId = typeof row.profile_id === "string" ? row.profile_id.trim() : "";
    const role = row.platform_role;
    if (!profileId) return { status: "denied", reason: "supabase_profile_missing" };

    if (role === null && row.is_admin === false && row.is_super_admin === false) {
        return { status: "denied", reason: "supabase_admin_role_missing" };
    }
    if (!isAdminRole(role)
        || row.is_admin !== true
        || row.is_super_admin !== (role === "super_admin")) {
        return { status: "denied", reason: "invalid_authorization_response" };
    }
    if (role !== firebaseRole) return { status: "denied", reason: "role_mismatch" };

    return { status: "allowed", role, profileId };
};

const isMissingProfileError = (error: SupabaseRpcError) =>
    error.code === "42501"
    && String(error.message || "").includes("No application profile is mapped to this authenticated identity");

const runWithTimeout = async <T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error("Admin authorization timed out."), { code: "ADMIN_AUTH_TIMEOUT" }));
        }, timeoutMs);
    });

    try {
        return await Promise.race([operation(controller.signal), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export const checkAdminAuthorization = async (
    authenticated: boolean,
    dependencies: AdminAuthorizationDependencies,
    timeoutMs = ADMIN_AUTHORIZATION_TIMEOUT_MS,
): Promise<AdminAuthorizationResult> => {
    if (!authenticated) return { status: "denied", reason: "signed_out" };

    try {
        await dependencies.waitForAuthReady();
    } catch {
        return { status: "unavailable", reason: "firebase_auth_unavailable" };
    }

    const user = dependencies.getFirebaseUser();
    if (!user) return { status: "denied", reason: "firebase_user_missing" };
    if (!dependencies.supabaseEnabled) return { status: "denied", reason: "supabase_disabled" };

    try {
        return await runWithTimeout(async (signal) => {
            let tokenResult: FirebaseTokenResult;
            try {
                tokenResult = await user.getIdTokenResult(true);
            } catch {
                return { status: "unavailable", reason: "firebase_token_unavailable" };
            }

            const firebaseDecision = evaluateFirebaseClaims(tokenResult.claims || {});
            if (typeof firebaseDecision !== "string") return firebaseDecision;

            let rpc: SupabaseRpcResult;
            try {
                rpc = await dependencies.readSupabaseAuthorization(signal);
            } catch {
                return { status: "unavailable", reason: "supabase_unavailable" };
            }
            if (rpc.error) {
                return isMissingProfileError(rpc.error)
                    ? { status: "denied", reason: "supabase_profile_missing" }
                    : { status: "unavailable", reason: "supabase_unavailable" };
            }
            return evaluateSupabaseAuthorization(rpc.data, firebaseDecision);
        }, timeoutMs);
    } catch (error: any) {
        return {
            status: "unavailable",
            reason: error?.code === "ADMIN_AUTH_TIMEOUT" ? "authorization_timeout" : "supabase_unavailable",
        };
    }
};

const productionDependencies: AdminAuthorizationDependencies = {
    supabaseEnabled,
    waitForAuthReady: async () => {
        await auth?.authStateReady?.();
    },
    getFirebaseUser: () => auth?.currentUser ?? null,
    readSupabaseAuthorization: async (signal) => {
        if (!supabase) return { data: null, error: { message: "Supabase client unavailable." } };
        return await supabase.rpc("get_my_admin_authorization").abortSignal(signal);
    },
};

export const checkCurrentAdminAuthorization = (authenticated: boolean) =>
    checkAdminAuthorization(authenticated, productionDependencies);

export type CoordinatedAdminAuthorization = {
    current: boolean;
    result: AdminAuthorizationResult;
};

export const createAdminAuthorizationCoordinator = () => {
    let generation = 0;
    let active: { generation: number; promise: Promise<CoordinatedAdminAuthorization> } | null = null;

    return {
        invalidate() {
            generation += 1;
            active = null;
        },
        run(check: () => Promise<AdminAuthorizationResult>) {
            if (active?.generation === generation) return active.promise;
            const startedGeneration = generation;
            const promise = check().then((result) => ({
                current: startedGeneration === generation,
                result,
            })).finally(() => {
                if (active?.generation === startedGeneration) active = null;
            });
            active = { generation: startedGeneration, promise };
            return promise;
        },
    };
};

export const shouldRevalidateAdminOnForeground = (
    previousState: string | null | undefined,
    nextState: string,
) => nextState === "active" && previousState !== "active";
