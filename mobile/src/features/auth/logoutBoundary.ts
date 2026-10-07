export const PUSH_UNREGISTER_TIMEOUT_MS = 4_000;

export type PushCleanupFailureCategory =
    | "timeout"
    | "unauthorized"
    | "rate_limited"
    | "server"
    | "network"
    | "unknown";

export const classifyPushCleanupFailure = (error: unknown): PushCleanupFailureCategory => {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null;
    const code = String(candidate?.code ?? "").toLowerCase();
    const status = Number(candidate?.status ?? 0);
    const message = String(candidate?.message ?? "").toLowerCase();
    if (code === "push_cleanup_timeout") return "timeout";
    if (status === 401 || status === 403 || code.includes("401") || code.includes("403")) return "unauthorized";
    if (status === 429 || code.includes("429") || code.includes("resource_exhausted")) return "rate_limited";
    if (status >= 500 || code.startsWith("5")) return "server";
    if (message.includes("network") || message.includes("offline") || message.includes("fetch")) return "network";
    return "unknown";
};

const boundCleanup = <T>(operation: Promise<T>, timeoutMs: number) => new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Object.assign(new Error("Push cleanup timed out"), {
        code: "PUSH_CLEANUP_TIMEOUT",
    })), timeoutMs);
    operation.then(
        (value) => { clearTimeout(timeout); resolve(value); },
        (error) => { clearTimeout(timeout); reject(error); },
    );
});

export const runLogoutBoundary = async <T>({
    attemptPushCleanup,
    terminateFirebaseSession,
    protectLocalState,
    reportPushCleanupFailure,
    timeoutMs = PUSH_UNREGISTER_TIMEOUT_MS,
}: {
    attemptPushCleanup: () => Promise<unknown>;
    terminateFirebaseSession: () => Promise<T>;
    protectLocalState: () => Promise<void>;
    reportPushCleanupFailure?: (category: PushCleanupFailureCategory) => void;
    timeoutMs?: number;
}): Promise<T> => {
    try {
        await boundCleanup(Promise.resolve().then(attemptPushCleanup), timeoutMs);
    } catch (error) {
        try {
            reportPushCleanupFailure?.(classifyPushCleanupFailure(error));
        } catch {
            // Observability must never control the logout security boundary.
        }
    }

    try {
        return await terminateFirebaseSession();
    } finally {
        // Protect private local state even when Firebase sign-out itself fails.
        await protectLocalState();
    }
};

export const createSingleFlightLogout = <T>(execute: () => Promise<T>) => {
    let active: Promise<T> | null = null;
    return () => {
        if (active) return active;
        const request = execute().finally(() => {
            if (active === request) active = null;
        });
        active = request;
        return request;
    };
};
