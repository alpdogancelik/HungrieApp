type FirebaseTokenResult = {
    token: string;
    claims: Record<string, unknown>;
};

type FirebaseTokenUser = {
    getIdTokenResult: (forceRefresh?: boolean) => Promise<FirebaseTokenResult>;
};

type TransportTokenOptions = {
    retryDelays?: number[];
    wait?: (milliseconds: number) => Promise<void>;
    forceRefreshFirst?: boolean;
    requireVerifiedEmail?: boolean;
    requestTimeoutMs?: number;
};

export type FirebaseTransportIdentity = {
    token: string;
    email: string;
    emailVerified: boolean;
};

export class FirebaseTransportTokenError extends Error {
    readonly code: "transport_claim_pending" | "identity_claims_invalid";

    constructor(code: "transport_claim_pending" | "identity_claims_invalid", message: string) {
        super(message);
        this.name = "FirebaseTransportTokenError";
        this.code = code;
    }
}

const defaultWait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const getTokenResultWithTimeout = async (
    user: FirebaseTokenUser,
    forceRefresh: boolean | undefined,
    milliseconds: number,
): Promise<FirebaseTokenResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            user.getIdTokenResult(forceRefresh),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Firebase token request timed out.")), milliseconds);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

// Firebase assigns this transport claim asynchronously after account creation.
// A newly verified user can sign in before their cached token contains it.
export const getFirebaseTransportIdentity = async (
    user: FirebaseTokenUser,
    options: TransportTokenOptions = {},
): Promise<FirebaseTransportIdentity> => {
    const retryDelays = options.retryDelays ?? [500, 1000, 2000];
    const wait = options.wait ?? defaultWait;
    const requestTimeoutMs = options.requestTimeoutMs ?? 10000;
    // A token issued by the successful sign-in is already current. Validate it
    // first; force refresh only when the asynchronously assigned transport
    // claim has not reached that token yet. This avoids making every startup
    // depend on an extra Firebase refresh request.
    let result = await getTokenResultWithTimeout(user, options.forceRefreshFirst ? true : undefined, requestTimeoutMs);

    for (let attempt = 0; ; attempt += 1) {
        if (result.claims.role === "authenticated") {
            const email = String(result.claims.email || "").trim().toLowerCase();
            const emailVerified = result.claims.email_verified === true;
            if (options.requireVerifiedEmail && (!email || !emailVerified)) {
                throw new FirebaseTransportTokenError("identity_claims_invalid", "Firebase identity claims are incomplete.");
            }
            return { token: result.token, email, emailVerified };
        }
        if (attempt >= retryDelays.length) break;
        await wait(retryDelays[attempt]);
        result = await getTokenResultWithTimeout(user, true, requestTimeoutMs);
    }

    throw new FirebaseTransportTokenError("transport_claim_pending", "Firebase transport authorization is still being prepared.");
};

export const getFirebaseTransportToken = async (
    user: FirebaseTokenUser,
    options: TransportTokenOptions = {},
): Promise<string> => {
    const identity = await getFirebaseTransportIdentity(user, options);
    return identity.token;
};
