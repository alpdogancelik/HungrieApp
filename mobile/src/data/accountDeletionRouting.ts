export type CustomerEnvironment = "development" | "staging" | "production";

export const resolveAccountDeletionCallableName = (environment: string): string => {
    const normalized = String(environment || "").trim().toLowerCase();
    if (normalized === "development" || normalized === "staging") return "deleteHungrieAccount";
    if (normalized === "production") return "deleteHungrieAccountProduction";
    throw new Error("Account deletion is not configured for this environment.");
};
