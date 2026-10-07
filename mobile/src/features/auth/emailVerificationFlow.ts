export type VerificationFailureCategory =
    | "too_many_requests"
    | "network"
    | "invalid_session"
    | "configuration"
    | "provider";

export type VerificationRequestResult =
    | { state: "requested" }
    | { state: "already_verified" }
    | { state: "failed"; category: VerificationFailureCategory };

export type VerificationRefreshResult =
    | { state: "verified" }
    | { state: "unverified" }
    | { state: "no_session" }
    | { state: "failed"; category: VerificationFailureCategory };

export type VerificationUser = {
    uid: string;
    email?: string | null;
    emailVerified: boolean;
};

export const classifyVerificationFailure = (error: unknown): VerificationFailureCategory => {
    const code = String((error as { code?: unknown })?.code || "").toLowerCase();
    if (code === "auth/too-many-requests") return "too_many_requests";
    if (code === "auth/network-request-failed" || code === "auth/internal-error" || code === "auth/timeout") return "network";
    if (code === "auth/user-token-expired" || code === "auth/user-disabled" || code === "auth/user-not-found") return "invalid_session";
    if (code === "auth/unauthorized-domain" || code === "auth/operation-not-allowed" || code === "auth/invalid-api-key") return "configuration";
    return "provider";
};

export const createEmailVerificationCoordinator = ({
    send,
    reload,
    forceTokenRefresh,
}: {
    send: (user: VerificationUser) => Promise<void>;
    reload: (user: VerificationUser) => Promise<void>;
    forceTokenRefresh: (user: VerificationUser) => Promise<unknown>;
}) => {
    let inFlightRequest: { uid: string; promise: Promise<VerificationRequestResult> } | null = null;

    const request = (user: VerificationUser): Promise<VerificationRequestResult> => {
        if (user.emailVerified) return Promise.resolve({ state: "already_verified" });
        if (inFlightRequest?.uid === user.uid) return inFlightRequest.promise;

        const promise = send(user)
            .then((): VerificationRequestResult => ({ state: "requested" }))
            .catch((error): VerificationRequestResult => ({ state: "failed", category: classifyVerificationFailure(error) }))
            .finally(() => {
                if (inFlightRequest?.promise === promise) inFlightRequest = null;
            });
        inFlightRequest = { uid: user.uid, promise };
        return promise;
    };

    const refresh = async (user: VerificationUser | null): Promise<VerificationRefreshResult> => {
        if (!user) return { state: "no_session" };
        try {
            await reload(user);
            if (!user.emailVerified) return { state: "unverified" };
            await forceTokenRefresh(user);
            return { state: "verified" };
        } catch (error) {
            return { state: "failed", category: classifyVerificationFailure(error) };
        }
    };

    return { request, refresh };
};

export const createAccountAndRequestVerification = async <TUser extends VerificationUser>({
    createAccount,
    prepareAccount,
    requestVerification,
}: {
    createAccount: () => Promise<TUser>;
    prepareAccount: (user: TUser) => Promise<void>;
    requestVerification: (user: TUser) => Promise<VerificationRequestResult>;
}) => {
    const user = await createAccount();
    await prepareAccount(user);
    const verificationRequest = await requestVerification(user);
    return {
        state: "account_created_unverified" as const,
        email: user.email || "",
        verificationRequest,
    };
};
