import { collection, getDocs, query, where } from "firebase/firestore";
import { FIREBASE_COLLECTIONS, auth, firebaseConfigured, firestore } from "./firebase";

const requireDB = () => {
    if (!firebaseConfigured || !firestore) throw new Error("Firebase Firestore is not configured.");
    return firestore;
};

export const getOwnedRestaurantId = async ({
    includeInactive = true,
}: {
    includeInactive?: boolean;
} = {}) => {
    if (!firebaseConfigured || !firestore) return null;
    const owner = auth?.currentUser?.uid;
    if (!owner) return null;
    const baseQuery = query(collection(requireDB(), FIREBASE_COLLECTIONS.restaurants), where("ownerId", "==", owner));
    const snap = await getDocs(baseQuery).catch(() => null);
    if (!snap || snap.empty) return null;

    if (!includeInactive) {
        const activeDoc = snap.docs.find((snapshot) => snapshot.data()?.isActive !== false);
        return activeDoc?.id ?? null;
    }

    const preferredDoc = snap.docs.find((snapshot) => snapshot.data()?.isActive !== false) ?? snap.docs[0];
    return preferredDoc?.id ?? null;
};
