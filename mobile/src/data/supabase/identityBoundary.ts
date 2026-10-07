import { auth } from "@/lib/firebase";
import { createSupabaseClientForFirebaseToken } from "@/lib/supabase";
import { getFirebaseTransportToken } from "@/src/features/auth/firebaseTransportToken";
import { requireSupabase, withSupabaseAuthRetry } from "./utils";

export class StaleCustomerIdentityError extends Error {
    code = "stale-customer-identity";

    constructor() {
        super("Customer identity changed while the operation was in flight.");
        this.name = "StaleCustomerIdentityError";
    }
}

export const getTrustedCustomerUid = () => auth?.currentUser?.uid || null;

export const requireTrustedCustomerUid = () => {
    const uid = getTrustedCustomerUid();
    if (!uid) throw new StaleCustomerIdentityError();
    return uid;
};

export const assertTrustedCustomerUid = (expectedUid: string) => {
    if (!expectedUid || getTrustedCustomerUid() !== expectedUid) throw new StaleCustomerIdentityError();
};

export const withBoundCustomerClient = async <T>(
    expectedUid: string,
    operation: (client: any) => Promise<T>,
): Promise<T> => withSupabaseAuthRetry(async () => {
    assertTrustedCustomerUid(expectedUid);
    const user = auth?.currentUser;
    if (!user || user.uid !== expectedUid) throw new StaleCustomerIdentityError();
    const token = await getFirebaseTransportToken(user);
    assertTrustedCustomerUid(expectedUid);
    // Production always returns a token-bound client. The fallback keeps local
    // repository test doubles usable without weakening the hosted boundary.
    const client = createSupabaseClientForFirebaseToken(token) || requireSupabase();
    const result = await operation(client);
    assertTrustedCustomerUid(expectedUid);
    return result;
});
