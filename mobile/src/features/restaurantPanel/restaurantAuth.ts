import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { unregisterPushToken } from "@/lib/registerPushToken";

export type RestaurantSession = {
    userId: string;
    email: string;
    restaurantId: string;
    restaurantName: string;
};

type StaffProfile = {
    restaurantId?: string;
    restaurantName?: string;
};

const STAFF_COLLECTION = "restaurantStaff";

const ensureFirebase = () => {
    if (!auth || !firestore) throw new Error("Firebase is not configured");
};

const fetchStaffProfile = async (user: FirebaseUser): Promise<RestaurantSession | null> => {
    const ref = doc(firestore!, STAFF_COLLECTION, user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as StaffProfile;
    if (!data.restaurantId) return null;
    return {
        userId: user.uid,
        email: user.email || "",
        restaurantId: data.restaurantId,
        restaurantName: data.restaurantName || data.restaurantId,
    };
};

export const signInRestaurant = async (email: string, password: string): Promise<RestaurantSession> => {
    ensureFirebase();
    try {
        const credential = await signInWithEmailAndPassword(auth!, email, password);
        const session = await fetchStaffProfile(credential.user);
        if (!session) {
            throw new Error("Bu kullanıcı için restoran yetkisi bulunamadı (restaurantStaff kaydı eksik).");
        }
        return session;
    } catch (error: any) {
        const code = String(error?.code || "").toLowerCase();
        if (
            code === "auth/wrong-password" ||
            code === "auth/user-not-found" ||
            code === "auth/invalid-credential" ||
            code === "auth/invalid-login-credentials"
        ) {
            throw new Error("Kullanıcı adı veya şifre hatalı.");
        }
        throw error;
    }
};

export const signOutRestaurant = async () => {
    ensureFirebase();
    await unregisterPushToken().catch(() => null);
    await signOut(auth!);
};

export const listenRestaurantSession = (cb: (session: RestaurantSession | null) => void) => {
    ensureFirebase();
    return onAuthStateChanged(auth!, async (user) => {
        if (!user) {
            cb(null);
            return;
        }
        try {
            const session = await fetchStaffProfile(user);
            cb(session);
        } catch {
            cb(null);
        }
    });
};
