import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, firestore } from "@/lib/firebase";
import type { MembershipRepository, RestaurantSession } from "@/src/data/contracts";

const resolve = async (user: FirebaseUser | null): Promise<RestaurantSession | null> => {
    if (!user || !firestore) return null;
    const snapshot = await getDoc(doc(firestore, "restaurantStaff", user.uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    if (!data.restaurantId || !["owner", "manager"].includes(String(data.role || "").toLowerCase())) return null;
    return {
        userId: user.uid,
        email: user.email || "",
        restaurantId: String(data.restaurantId),
        restaurantName: String(data.restaurantName || data.restaurantId),
    };
};

export const firebaseMembershipRepository: MembershipRepository = {
    getCurrentMembership: () => resolve(auth?.currentUser || null),
    listenCurrentMembership: (cb) => {
        if (!auth) {
            cb(null);
            return () => undefined;
        }
        let active = true;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            void resolve(user).then((membership) => active && cb(membership)).catch(() => active && cb(null));
        });
        return () => { active = false; unsubscribe(); };
    },
};
