import { doc, getDoc, setDoc } from "firebase/firestore";

import { FIREBASE_COLLECTIONS, firestore } from "@/lib/firebase";
import { selectRepository } from "./backendFlags";
import type { FavoritesRepository } from "./contracts";
import { supabaseFavoritesRepository } from "./supabase/favoritesRepository";

const firebaseFavoritesRepository: FavoritesRepository = {
    isRemoteScope: (scope) => Boolean(scope && scope !== "guest" && firestore),
    loadFavorites: async (scope) => {
        if (!firestore) return [];
        const snapshot = await getDoc(doc(firestore, FIREBASE_COLLECTIONS.users, scope)).catch(() => null);
        return snapshot?.data()?.favoriteRestaurantIds;
    },
    persistFavorites: async (scope, ids) => {
        if (!scope || scope === "guest" || !firestore) return;
        await setDoc(
            doc(firestore, FIREBASE_COLLECTIONS.users, scope),
            {
                favoriteRestaurantIds: ids,
                favoritesUpdatedAt: Date.now(),
            },
            { merge: true },
        );
    },
};

export const favoritesRepository = selectRepository<FavoritesRepository>("favorites", {
    firebase: firebaseFavoritesRepository,
    supabase: supabaseFavoritesRepository,
});

export const useFavoriteStoreBackend = () => favoritesRepository;
export type { FavoritesRepository };
