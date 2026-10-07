import * as firebaseAuthRepository from "@/lib/firebaseAuth";
import { createSingleFlightLogout, runLogoutBoundary } from "@/src/features/auth/logoutBoundary";
import { auth } from "@/lib/firebase";
import { selectRepository } from "./backendFlags";
import type { AuthRepository } from "./contracts";
import { withRequestDeadline } from "@/src/lib/requestDeadline";

const firebaseAuth: AuthRepository = {
    ...firebaseAuthRepository,
    logout: firebaseAuthRepository.signOut,
};

export const authRepository = selectRepository<AuthRepository>("auth", {
    firebase: firebaseAuth,
    supabase: firebaseAuth,
});

export const firebaseOrdersEnabled = firebaseAuthRepository.firebaseOrdersEnabled;
export const getCurrentAuthUserId = () => String(auth?.currentUser?.uid || "");
export const getCurrentAuthIdentity = async (forceServerValidation = false) => {
    const firebaseAuth = auth;
    if (firebaseAuth?.authStateReady) {
        await withRequestDeadline(() => firebaseAuth.authStateReady(), 10000);
    }
    const user = firebaseAuth?.currentUser;
    if (!user) return null;
    if (forceServerValidation) {
        await withRequestDeadline(() => user.reload(), 10000);
        await withRequestDeadline(() => user.getIdToken(true), 10000);
    }
    if (!user.emailVerified) return null;
    return {
        uid: user.uid,
        name: user.displayName || user.email || "Hungrie User",
        email: user.email || "",
        avatar: user.photoURL && !user.photoURL.startsWith("wa:") ? user.photoURL : undefined,
    };
};
export const signIn = authRepository.signIn;
export const createUser = authRepository.createUser;
export const getCurrentUser = authRepository.getCurrentUser;
export const getCurrentVerificationSession = firebaseAuthRepository.getCurrentVerificationSession;
export const resendEmailVerification = firebaseAuthRepository.resendEmailVerification;
export const refreshEmailVerification = firebaseAuthRepository.refreshEmailVerification;
export const getVerificationErrorMessage = firebaseAuthRepository.getVerificationErrorMessage;

const protectLocalCustomerState = async () => {
    await import("@/store/cart.store").then(({ destroyCartForSessionBoundary }) =>
        destroyCartForSessionBoundary(),
    ).catch(() => undefined);
    const { destroyRecentSearchesForSessionBoundary } = await import("@/src/lib/recentSearchesStorage");
    await destroyRecentSearchesForSessionBoundary().catch(() => undefined);
    await import("./addressRepository").then(({ clearAddressSessionCache }) =>
        clearAddressSessionCache(),
    ).catch(() => undefined);
};

const executeSignOut = async () => {
    return runLogoutBoundary({
        // The authenticated identity is still present for this bounded attempt.
        // Failure is observed but never controls Firebase/session termination.
        attemptPushCleanup: async () => {
            const { unregisterPushToken } = await import("./notificationRepository");
            await unregisterPushToken();
        },
        terminateFirebaseSession: authRepository.signOut,
        protectLocalState: protectLocalCustomerState,
        reportPushCleanupFailure: (category) => console.warn(
            "[auth] Push-token cleanup failed; continuing logout.",
            { operation: "push_unregister", result: "failure", category, environment: process.env.EXPO_PUBLIC_APP_ENV || "unknown" },
        ),
    });
};

export const signOut = createSingleFlightLogout(executeSignOut);
export const logout = signOut;
export const terminateCustomerSession = signOut;
export const signOutVerificationSession = signOut;
export const clearDeletedAccountSession = async () => {
    // The server has already removed push ownership and the Firebase identity.
    // Only clear local persistence here; calling the authenticated push RPC
    // after identity deletion would turn successful deletion into a false error.
    const deletedUid = auth?.currentUser?.uid || null;
    if (deletedUid) {
        await import("@/src/features/notifications/orderStatusWatcher")
            .then(({ clearOrderStatusForIdentity }) => clearOrderStatusForIdentity(deletedUid))
            .catch(() => undefined);
    }
    await firebaseAuthRepository.signOut().catch(() => undefined);
    await protectLocalCustomerState();
};
export const sendPasswordReset = authRepository.sendPasswordReset;
export const updateUserProfile = authRepository.updateUserProfile;
export const getMockOwnerAccount = authRepository.getMockOwnerAccount;
export const clearMockOwnerAccount = authRepository.clearMockOwnerAccount;
