const privacyNormalizedCredentialCodes = new Set([
    "auth/invalid-credential",
    "auth/invalid-login-credentials",
    "auth/user-not-found",
    "auth/wrong-password",
]);

export const classifyPublicSignInFailure = (error: unknown) => {
    const code = typeof error === "string"
        ? error.toLowerCase()
        : String((error as { code?: unknown })?.code || "").toLowerCase();
    return privacyNormalizedCredentialCodes.has(code) ? "invalid_credentials" as const : "technical_failure" as const;
};
