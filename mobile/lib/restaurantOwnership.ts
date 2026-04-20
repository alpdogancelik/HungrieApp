import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { FIREBASE_COLLECTIONS, auth, firebaseConfigured, firestore } from "./firebase";

const requireDB = () => {
    if (!firebaseConfigured || !firestore) throw new Error("Firebase Firestore is not configured.");
    return firestore;
};

const OWNER_EMAIL_FALLBACKS: Record<string, string> = {
    "nertesklims@gmail.com": "alacarte-cafe",
};

const normalizeEmail = (value?: string | null) => String(value || "").trim().toLowerCase();

const pickRestaurantIdFromSnapshot = (
    snapshot: { docs: Array<{ id: string; data: () => Record<string, any> }>; empty: boolean } | null,
    includeInactive: boolean,
) => {
    if (!snapshot || snapshot.empty) return null;
    if (includeInactive) {
        const preferredDoc = snapshot.docs.find((entry) => entry.data()?.isActive !== false) ?? snapshot.docs[0];
        return preferredDoc?.id ?? null;
    }
    const activeDoc = snapshot.docs.find((entry) => entry.data()?.isActive !== false);
    return activeDoc?.id ?? null;
};

export const getOwnedRestaurantId = async ({
    includeInactive = true,
}: {
    includeInactive?: boolean;
} = {}) => {
    if (!firebaseConfigured || !firestore) return null;
    const owner = auth?.currentUser?.uid;
    if (!owner) return null;
    const db = requireDB();
    const byOwnerId = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.restaurants), where("ownerId", "==", owner)),
    ).catch(() => null);
    const ownerIdMatch = pickRestaurantIdFromSnapshot(byOwnerId, includeInactive);
    if (ownerIdMatch) return ownerIdMatch;

    const ownerEmail = normalizeEmail(auth?.currentUser?.email);
    if (!ownerEmail) return null;

    const byOwnerEmail = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.restaurants), where("ownerEmail", "==", ownerEmail)),
    ).catch(() => null);
    const ownerEmailMatch = pickRestaurantIdFromSnapshot(byOwnerEmail, includeInactive);
    if (ownerEmailMatch) return ownerEmailMatch;

    const byManagerEmail = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.restaurants), where("managerEmails", "array-contains", ownerEmail)),
    ).catch(() => null);
    const managerEmailMatch = pickRestaurantIdFromSnapshot(byManagerEmail, includeInactive);
    if (managerEmailMatch) return managerEmailMatch;

    const fallbackRestaurantId = OWNER_EMAIL_FALLBACKS[ownerEmail];
    if (!fallbackRestaurantId) return null;
    if (includeInactive) return fallbackRestaurantId;

    const fallbackSnapshot = await getDoc(doc(db, FIREBASE_COLLECTIONS.restaurants, fallbackRestaurantId)).catch(() => null);
    if (!fallbackSnapshot || !fallbackSnapshot.exists()) return null;
    if (fallbackSnapshot.data()?.isActive === false) {
        return null;
    }
    return fallbackSnapshot.id;
};
