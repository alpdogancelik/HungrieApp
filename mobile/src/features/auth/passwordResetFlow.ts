import { isStrictValidEmail } from "./emailValidation";

export type PasswordResetOutcome =
    | "accepted"
    | "invalid_input"
    | "rate_limited"
    | "network_failure"
    | "technical_failure";

type PasswordResetRequest = {
    email: string;
    send: (normalizedEmail: string) => Promise<void>;
};

const privacyNormalizedCodes = new Set([
    "auth/user-not-found",
    "auth/user-disabled",
]);

export const classifyPasswordResetProviderError = (error: unknown): PasswordResetOutcome => {
    const code = String((error as { code?: unknown })?.code || "").toLowerCase();
    if (privacyNormalizedCodes.has(code)) return "accepted";
    if (code === "auth/invalid-email") return "invalid_input";
    if (code === "auth/too-many-requests") return "rate_limited";
    if (code === "auth/network-request-failed" || code === "auth/timeout") return "network_failure";
    return "technical_failure";
};

export const requestPasswordReset = async ({ email, send }: PasswordResetRequest): Promise<PasswordResetOutcome> => {
    const normalizedEmail = email.trim();
    if (!isStrictValidEmail(normalizedEmail)) return "invalid_input";
    try {
        await send(normalizedEmail);
        return "accepted";
    } catch (error) {
        return classifyPasswordResetProviderError(error);
    }
};

export const passwordResetPresentation = (outcome: PasswordResetOutcome) => {
    if (outcome === "accepted") return { tone: "success" as const, copy: "privacy_acknowledgement" as const };
    if (outcome === "invalid_input") return { tone: "error" as const, copy: "invalid_input" as const };
    if (outcome === "rate_limited") return { tone: "error" as const, copy: "rate_limited" as const };
    return { tone: "error" as const, copy: "technical_failure" as const };
};
