import * as firebaseAuthRepository from "@/lib/firebaseAuth";
import { selectRepository } from "./backendFlags";
import type { ProfileRepository } from "./contracts";
import { supabaseProfileRepository } from "./supabase/profileRepository";

const firebaseProfileRepository: ProfileRepository = {
    getCurrentUser: firebaseAuthRepository.getCurrentUser,
    updateUserProfile: firebaseAuthRepository.updateUserProfile,
    // Profile reads can still follow the repository flag, but destructive
    // account deletion has exactly one server-controlled implementation.
    deleteCurrentUserProfile: supabaseProfileRepository.deleteCurrentUserProfile,
};

const profileRepository = selectRepository<ProfileRepository>("profile", {
    firebase: firebaseProfileRepository,
    supabase: supabaseProfileRepository,
});

export const getCurrentUser = profileRepository.getCurrentUser;
export const updateUserProfile = profileRepository.updateUserProfile;
export const deleteCurrentUserProfile = async () => {
    // Customer deletion is server-orchestrated in the Supabase data domain.
    // Never allow the legacy profile backend flag to select client-side deleteUser.
    const result = await supabaseProfileRepository.deleteCurrentUserProfile();
    const { clearAddressSessionCache } = await import("./addressRepository");
    clearAddressSessionCache();
    return result;
};
