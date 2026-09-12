import { selectRepository } from "./backendFlags";
import type { MembershipRepository } from "./contracts";
import { firebaseMembershipRepository } from "./firebase/membershipRepository";
import { supabaseMembershipRepository } from "./supabase/membershipRepository";

export const membershipRepository = selectRepository<MembershipRepository>("membership", {
    firebase: firebaseMembershipRepository,
    supabase: supabaseMembershipRepository,
});

export const getCurrentMembership = membershipRepository.getCurrentMembership;
export const listenCurrentMembership = membershipRepository.listenCurrentMembership;
