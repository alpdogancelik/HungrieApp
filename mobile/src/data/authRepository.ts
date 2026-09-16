import * as firebaseAuthRepository from "@/lib/firebaseAuth";
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
export const signOut = async () => {
    // Push ownership must be revoked while the Firebase identity can still
    // authenticate the Supabase RPC. Do not silently sign out on failure.
    const { unregisterPushToken } = await import("./notificationRepository");
    await unregisterPushToken();
    const result = await authRepository.signOut();
    const { clearStoredRecentSearches } = await import("@/src/lib/recentSearchesStorage");
    await clearStoredRecentSearches().catch(() => undefined);
    const { clearAddressSessionCache } = await import("./addressRepository");
    clearAddressSessionCache();
    return result;
};
export const logout = signOut;
export const deleteCurrentUserProfile = authRepository.deleteCurrentUserProfile;
export const sendPasswordReset = authRepository.sendPasswordReset;
export const updateUserProfile = authRepository.updateUserProfile;
export const getMockOwnerAccount = authRepository.getMockOwnerAccount;
export const clearMockOwnerAccount = authRepository.clearMockOwnerAccount;
