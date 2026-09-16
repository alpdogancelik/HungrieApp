import { auth } from "@/lib/firebase";
import { createSupabaseClientForFirebaseToken } from "@/lib/supabase";
import { throwIfError } from "@/src/data/supabase/utils";
import { storage } from "@/src/lib/storage";
import { createUuid, isUsableUuid } from "@/src/lib/uuid";
import { withRequestDeadline } from "@/src/lib/requestDeadline";
import { FirebaseTransportTokenError, getFirebaseTransportIdentity } from "./firebaseTransportToken";

export type CustomerAccessOutcome =
    | { state: "active"; profileId: string }
    | { state: "wrong_portal"; accountType: "restaurant" | "admin" }
    | { state: "suspended" }
    | { state: "revoked" }
    | { state: "session_error" }
    | { state: "auth_preparing"; referenceId: string }
    | { state: "configuration_error"; referenceId?: string }
    | { state: "unavailable"; referenceId?: string };

// Expo SecureStore accepts only alphanumeric characters, `.`, `-`, and `_`
// in keys. Firebase UIDs use that alphabet, so an underscore separator keeps
// this key valid on iOS/Android as well as web localStorage.
export const customerBootstrapOperationKey = (uid: string) => `customer_bootstrap_operation_v1_${uid}`;
type CustomerAccessDependencies = {
    uid: string;
    readContext: () => Promise<any>;
    bootstrap: (operationId: string) => Promise<void>;
    getOperationId: (key: string) => Promise<string | null>;
    setOperationId: (key: string, value: string) => Promise<void>;
    removeOperationId: (key: string) => Promise<void>;
    postBootstrapRetryDelays?: number[];
    wait?: (milliseconds: number) => Promise<void>;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const isTransientRequestFailure = (error: any) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || "");
    const message = String(error?.message || error || "").toLowerCase();
    return status >= 500 || code === "PGRST303" || ["network", "fetch", "timeout", "timed out", "aborted", "load failed"]
        .some((fragment) => message.includes(fragment));
};

export const withTransientCustomerAccessRetry = async <T>(
    operation: () => Promise<T>,
    retryDelays = [500, 1000],
    waitForRetry: (milliseconds: number) => Promise<void> = wait,
): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (!isTransientRequestFailure(error) || attempt === retryDelays.length) throw error;
            await waitForRetry(retryDelays[attempt]);
        }
    }
    throw lastError;
};

const unwrapRpc = (result: { data: any; error: any; status?: number }) => {
    if (result.error && result.status && !result.error.status) result.error.status = result.status;
    return throwIfError(result);
};

const bootstrapConflictReference = (uid: string) => {
    let hash = 2166136261;
    for (let index = 0; index < uid.length; index += 1) {
        hash ^= uid.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `customer-bootstrap-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const accessReference = (uid: string, stage: string) => `${bootstrapConflictReference(`${uid}:${stage}`)}-${stage}`;

const isBootstrapAuthorizationConflict = (error: any) =>
    String(error?.code || "") === "42501" || Number(error?.status) === 403;

const isAuthenticationSessionFailure = (error: any) => {
    const code = String(error?.code || "");
    return Number(error?.status) === 401 || ["PGRST301", "PGRST302", "auth/user-token-expired", "auth/user-disabled", "auth/user-not-found"].includes(code);
};

const readPostBootstrapContext = async (dependencies: CustomerAccessDependencies) => {
    const delays = dependencies.postBootstrapRetryDelays ?? [0, 500, 1000, 2000];
    let lastError: unknown;
    for (const delay of delays) {
        if (delay) await (dependencies.wait ?? wait)(delay);
        try {
            const context = await dependencies.readContext();
            if (context?.state !== "unmapped") return context;
            lastError = new Error("Customer bootstrap is not visible yet.");
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError ?? new Error("Customer bootstrap could not be confirmed.");
};

export const classifyCustomerAccessContext = (context: any): CustomerAccessOutcome => {
    if (context?.state === "configuration_error") return { state: "configuration_error", referenceId: context.referenceId };
    if (context?.state !== "resolved") return { state: "configuration_error" };
    if (context.accountType === "restaurant" || context.accountType === "admin") {
        return { state: "wrong_portal", accountType: context.accountType };
    }
    if (context.accountType !== "customer") return { state: "configuration_error" };
    if (context.accountStatus === "suspended") return { state: "suspended" };
    if (context.accountStatus === "revoked") return { state: "revoked" };
    if (context.accountStatus !== "active") return { state: "configuration_error" };
    return { state: "active", profileId: String(context.profileId) };
};

export const resolveCustomerAccessWithDependencies = async (dependencies: CustomerAccessDependencies): Promise<CustomerAccessOutcome> => {
    let stage = "context";
    try {
        let context = await dependencies.readContext();
        if (context?.state === "unmapped") {
            stage = "operation";
            const key = customerBootstrapOperationKey(dependencies.uid);
            let operationId = await dependencies.getOperationId(key);
            if (!isUsableUuid(operationId)) {
                operationId = createUuid();
                await dependencies.setOperationId(key, operationId);
            }
            stage = "bootstrap";
            try {
                await dependencies.bootstrap(operationId);
            } catch (error) {
                // A denied bootstrap means the verified identity conflicts with
                // canonical account data. It needs support/configuration repair;
                // describing it as a network outage sends the user in circles.
                if (isBootstrapAuthorizationConflict(error)) {
                    return { state: "configuration_error", referenceId: bootstrapConflictReference(dependencies.uid) };
                }
                throw error;
            }
            stage = "confirmation";
            context = await readPostBootstrapContext(dependencies);
            // Secure storage cleanup is housekeeping. Once the database has
            // confirmed active access, a local deletion failure must not turn
            // successful account creation into a service outage.
            await dependencies.removeOperationId(key).catch(() => undefined);
        }
        return classifyCustomerAccessContext(context);
    } catch (error) {
        if (isAuthenticationSessionFailure(error)) return { state: "session_error" };
        return { state: "unavailable", referenceId: accessReference(dependencies.uid, stage) };
    }
};

const inFlightResolutions = new Map<string, Promise<CustomerAccessOutcome>>();

export const resolveCustomerAccessSingleFlight = (
    uid: string,
    operation: () => Promise<CustomerAccessOutcome>,
    timeoutMs = 20000,
): Promise<CustomerAccessOutcome> => {
    const existing = inFlightResolutions.get(uid);
    if (existing) return existing;
    const pending = withRequestDeadline(() => operation(), timeoutMs).finally(() => {
        if (inFlightResolutions.get(uid) === pending) inFlightResolutions.delete(uid);
    });
    inFlightResolutions.set(uid, pending);
    return pending;
};

const classifyIdentityPreparationError = (uid: string, error: unknown): CustomerAccessOutcome => {
    const code = String((error as any)?.code || "");
    if (["auth/user-token-expired", "auth/user-disabled", "auth/user-not-found"].includes(code)) {
        return { state: "session_error" };
    }
    if (error instanceof FirebaseTransportTokenError) {
        return error.code === "transport_claim_pending"
            ? { state: "auth_preparing", referenceId: accessReference(uid, "transport") }
            : { state: "session_error" };
    }
    return { state: "unavailable", referenceId: accessReference(uid, "identity") };
};

export const resolveCustomerAccess = async (): Promise<CustomerAccessOutcome> => {
    const firebaseAuth = auth;
    try {
        if (firebaseAuth?.authStateReady) {
            await withRequestDeadline(() => firebaseAuth.authStateReady(), 10000);
        }
    } catch {
        return { state: "unavailable", referenceId: "customer-auth-state-timeout" };
    }
    const user = firebaseAuth?.currentUser;
    if (!user) return { state: "session_error" };
    try {
        return await resolveCustomerAccessSingleFlight(user.uid, async () => {
            try {
                const identity = await getFirebaseTransportIdentity(user, {
                    forceRefreshFirst: false,
                    requireVerifiedEmail: true,
                    requestTimeoutMs: 10000,
                });
                const client = createSupabaseClientForFirebaseToken(identity.token);
                const readContext = async () => withTransientCustomerAccessRetry(async () => unwrapRpc(await withRequestDeadline((signal) =>
                    client.rpc("get_my_access_context_v1").abortSignal(signal))));
                return resolveCustomerAccessWithDependencies({
                    uid: user.uid,
                    readContext,
                    bootstrap: async (operationId) => {
                        await withTransientCustomerAccessRetry(async () => unwrapRpc(await withRequestDeadline((signal) => client.rpc("bootstrap_my_customer_account_v1", {
                            p_operation_id: operationId,
                        }).abortSignal(signal))));
                    },
                    getOperationId: (key) => storage.getItem(key),
                    setOperationId: (key, value) => storage.setItem(key, value),
                    removeOperationId: (key) => storage.removeItem(key),
                });
            } catch (error) {
                return classifyIdentityPreparationError(user.uid, error);
            }
        });
    } catch {
        return { state: "unavailable", referenceId: accessReference(user.uid, "deadline") };
    }
};
