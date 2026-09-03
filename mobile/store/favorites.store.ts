import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useFavoriteStoreBackend } from "@/src/data/favoritesBackend";

type FavoritesState = {
    favoritesByScope: Record<string, string[]>;
    loadedScopes: Record<string, boolean>;
    toggleFavorite: (scope: string, restaurantId: string) => void;
    setFavorite: (scope: string, restaurantId: string, isFavorite: boolean) => void;
    hydrateFavorites: (scope: string) => Promise<void>;
    clearFavorites: (scope: string) => void;
};

const normalizeFavoriteId = (value: string) => String(value || "").trim().toLowerCase();
const normalizeFavoriteList = (value: unknown) =>
    Array.isArray(value)
        ? Array.from(new Set(value.map((entry) => normalizeFavoriteId(String(entry))).filter(Boolean)))
        : [];
const persistScopeFavorites = async (scope: string, ids: string[]) => {
    const backend = useFavoriteStoreBackend();
    if (!backend.isRemoteScope(scope)) return;
    await backend.persistFavorites(scope, ids);
};

export const useFavoritesStore = create<FavoritesState>()(
    persist(
        (set) => ({
            favoritesByScope: {},
            loadedScopes: {},

            toggleFavorite: (scope, restaurantId) => {
                const normalizedScope = scope || "guest";
                const normalizedId = normalizeFavoriteId(restaurantId);
                if (!normalizedId) return;

                set((state) => {
                    const current = state.favoritesByScope[normalizedScope] || [];
                    const exists = current.includes(normalizedId);
                    const next = exists ? current.filter((id) => id !== normalizedId) : [normalizedId, ...current];
                    void persistScopeFavorites(normalizedScope, next).catch(() => null);

                    return {
                        favoritesByScope: {
                            ...state.favoritesByScope,
                            [normalizedScope]: next,
                        },
                    };
                });
            },

            setFavorite: (scope, restaurantId, isFavorite) => {
                const normalizedScope = scope || "guest";
                const normalizedId = normalizeFavoriteId(restaurantId);
                if (!normalizedId) return;

                set((state) => {
                    const current = state.favoritesByScope[normalizedScope] || [];
                    const exists = current.includes(normalizedId);

                    if (isFavorite && !exists) {
                        const next = [normalizedId, ...current];
                        void persistScopeFavorites(normalizedScope, next).catch(() => null);
                        return {
                            favoritesByScope: {
                                ...state.favoritesByScope,
                                [normalizedScope]: next,
                            },
                        };
                    }

                    if (!isFavorite && exists) {
                        const next = current.filter((id) => id !== normalizedId);
                        void persistScopeFavorites(normalizedScope, next).catch(() => null);
                        return {
                            favoritesByScope: {
                                ...state.favoritesByScope,
                                [normalizedScope]: next,
                            },
                        };
                    }

                    return state;
                });
            },

            hydrateFavorites: async (scope) => {
                const normalizedScope = scope || "guest";
                const backend = useFavoriteStoreBackend();
                if (!backend.isRemoteScope(normalizedScope)) {
                    set((state) => ({
                        loadedScopes: {
                            ...state.loadedScopes,
                            [normalizedScope]: true,
                        },
                    }));
                    return;
                }

                const remoteFavorites = normalizeFavoriteList(await backend.loadFavorites(normalizedScope));

                set((state) => ({
                    favoritesByScope: {
                        ...state.favoritesByScope,
                        [normalizedScope]: remoteFavorites,
                    },
                    loadedScopes: {
                        ...state.loadedScopes,
                        [normalizedScope]: true,
                    },
                }));
            },

            clearFavorites: (scope) => {
                const normalizedScope = scope || "guest";
                void persistScopeFavorites(normalizedScope, []).catch(() => null);
                set((state) => ({
                    favoritesByScope: {
                        ...state.favoritesByScope,
                        [normalizedScope]: [],
                    },
                }));
            },
        }),
        {
            name: "hungrie-favorites",
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({ favoritesByScope: state.favoritesByScope }),
        },
    ),
);
