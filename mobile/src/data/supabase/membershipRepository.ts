import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import type { MembershipRepository } from "@/src/data/contracts";
import { getMembershipForFirebaseUser } from "./membershipQueries";
export { getMembershipForFirebaseUser } from "./membershipQueries";

export const getCurrentMembership: MembershipRepository["getCurrentMembership"] = async () =>
    getMembershipForFirebaseUser(auth?.currentUser || null);

export const listenCurrentMembership: MembershipRepository["listenCurrentMembership"] = (cb) => {
    if (!auth) { cb(null); return () => undefined; }
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, () => {
        void getCurrentMembership().then((membership) => active && cb(membership)).catch(() => active && cb(null));
    });
    return () => { active = false; unsubscribe(); };
};

export const supabaseMembershipRepository: MembershipRepository = { getCurrentMembership, listenCurrentMembership };
