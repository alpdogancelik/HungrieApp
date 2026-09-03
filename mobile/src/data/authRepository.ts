import * as firebaseAuthRepository from "@/lib/firebaseAuth";
import { auth } from "@/lib/firebase";
import { selectRepository } from "./backendFlags";
import type { AuthRepository } from "./contracts";

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
export const signIn = authRepository.signIn;
export const createUser = authRepository.createUser;
export const getCurrentUser = authRepository.getCurrentUser;
export const signOut = authRepository.signOut;
export const logout = authRepository.signOut;
export const deleteCurrentUserProfile = authRepository.deleteCurrentUserProfile;
export const sendPasswordReset = authRepository.sendPasswordReset;
export const updateUserProfile = authRepository.updateUserProfile;
export const getMockOwnerAccount = authRepository.getMockOwnerAccount;
export const clearMockOwnerAccount = authRepository.clearMockOwnerAccount;
