import * as firebaseAuthRepository from "@/lib/firebaseAuth";
import { selectRepository } from "./backendFlags";
import type { ProfileRepository } from "./contracts";
import { supabaseProfileRepository } from "./supabase/profileRepository";

const firebaseProfileRepository: ProfileRepository = {
    getCurrentUser: firebaseAuthRepository.getCurrentUser,
    updateUserProfile: firebaseAuthRepository.updateUserProfile,
    deleteCurrentUserProfile: firebaseAuthRepository.deleteCurrentUserProfile,
};

export const profileRepository = selectRepository<ProfileRepository>("profile", {
    firebase: firebaseProfileRepository,
    supabase: supabaseProfileRepository,
});

export const getCurrentUser = profileRepository.getCurrentUser;
export const updateUserProfile = profileRepository.updateUserProfile;
export const deleteCurrentUserProfile = profileRepository.deleteCurrentUserProfile;
