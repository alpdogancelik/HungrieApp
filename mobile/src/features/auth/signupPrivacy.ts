export type PublicSignupFailure =
    | "registration_unavailable"
    | "invalid_email"
    | "weak_password"
    | "rate_limited"
    | "network_failure"
    | "technical_failure";

const codeOf = (error: unknown) => String((error as { code?: unknown })?.code || "").toLowerCase();

export const classifyPublicSignupFailure = (error: unknown): PublicSignupFailure => {
    switch (codeOf(error)) {
        case "auth/email-already-in-use":
            // This is intentionally not an account-existence result. Firebase
            // may also wrap EMAIL_EXISTS as auth/internal-error when improved
            // email privacy is enabled.
            return "registration_unavailable";
        case "auth/invalid-email":
            return "invalid_email";
        case "auth/weak-password":
            return "weak_password";
        case "auth/too-many-requests":
            return "rate_limited";
        case "auth/network-request-failed":
        case "auth/timeout":
            return "network_failure";
        default:
            return "technical_failure";
    }
};

export const signupFailureCopyKey = (failure: PublicSignupFailure) => {
    switch (failure) {
        case "invalid_email": return "invalidEmail";
        case "weak_password": return "weakPassword";
        case "rate_limited": return "tooManyRequests";
        case "network_failure": return "signupNetwork";
        case "registration_unavailable":
        case "technical_failure":
        default:
            return "signupUnavailable";
    }
};
