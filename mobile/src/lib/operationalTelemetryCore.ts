export type OperationalFailureClass = "expected" | "connectivity" | "server" | "unexpected";

const safeCode = (value: unknown) => {
    const normalized = String(value || "unknown").trim();
    return /^[a-zA-Z0-9_.:/-]{1,80}$/.test(normalized) ? normalized : "unknown";
};

export const safeTelemetryErrorCode = (error: unknown) =>
    safeCode((error as { code?: unknown; name?: unknown })?.code
        || (error as { name?: unknown })?.name
        || "unknown");

export const classifyOperationalFailure = (error: unknown): OperationalFailureClass => {
    const code = safeTelemetryErrorCode(error);
    const status = Number((error as { status?: unknown })?.status || 0);
    const message = String((error as { message?: unknown })?.message || "").toLowerCase();
    if ([
        "22023", "42501", "resource-exhausted", "permission-denied", "unauthenticated",
        "auth/invalid-credential", "auth/invalid-login-credentials", "auth/user-not-found",
        "auth/wrong-password", "auth/multi-factor-auth-required", "auth/too-many-requests",
    ].includes(code)
        || [400, 401, 403, 409, 429].includes(status)) return "expected";
    if (/network|offline|timed?\s*out|failed to fetch|connection/.test(message)
        || code === "AbortError" || code === "auth/network-request-failed") return "connectivity";
    if (status >= 500 || /^(08|53|57|58|XX)/.test(code) || /^PGRST0/.test(code)) return "server";
    return "unexpected";
};

export const sanitizeSentryEvent = <T extends Record<string, any>>(input: T): T => {
    const event: Record<string, any> = { ...input };
    event.user = undefined;
    event.message = undefined;
    event.logentry = undefined;
    event.extra = undefined;
    event.attachments = undefined;
    if (event.request) {
        event.request = {
            ...event.request,
            cookies: undefined,
            data: undefined,
            headers: undefined,
            query_string: undefined,
            url: undefined,
        };
    }
    if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb: Record<string, unknown>) => ({
            category: breadcrumb.category,
            level: breadcrumb.level,
            type: breadcrumb.type,
            timestamp: breadcrumb.timestamp,
        }));
    }
    if (Array.isArray(event.exception?.values)) {
        event.exception = {
            ...event.exception,
            values: event.exception.values.map((value: Record<string, unknown>) => ({
                ...value,
                value: "redacted",
            })),
        };
    }
    return event as T;
};
