import { create } from 'zustand';
import { getCurrentUser } from '@/src/data/profileRepository';
import { getCurrentAuthIdentity } from '@/src/data/authRepository';
import { resolveAuthHydration, type AuthHydrationUser } from '@/src/features/auth/authHydration';

type User = AuthHydrationUser | null;
let authHydrationGeneration = 0;

type AuthState = {
    isAuthenticated: boolean;
    user: User;
    isLoading: boolean;
    preferredEmoji?: string;

    setIsAuthenticated: (value: boolean) => void;
    setUser: (user: User) => void;
    setLoading: (loading: boolean) => void;
    setPreferredEmoji: (emoji: string) => void;
    resetAuthState: () => void;

    fetchAuthenticatedUser: () => Promise<void>;
}

const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    preferredEmoji: undefined,

    setIsAuthenticated: (value) => set({ isAuthenticated: value }),
    setUser: (user) => set({ user }),
    setLoading: (value) => set({ isLoading: value }),
    setPreferredEmoji: (emoji) => set({ preferredEmoji: emoji }),
    resetAuthState: () => {
        authHydrationGeneration += 1;
        set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
            preferredEmoji: undefined,
        });
    },

    fetchAuthenticatedUser: async () => {
        const requestGeneration = ++authHydrationGeneration;
        set({ isLoading: true });

        try {
            const user = await getCurrentUser();
            if (requestGeneration === authHydrationGeneration) {
                set(resolveAuthHydration(user, null));
            }
        } catch {
            const persistedIdentity = await getCurrentAuthIdentity().catch(() => null);
            if (requestGeneration === authHydrationGeneration) {
                set(resolveAuthHydration(null, persistedIdentity));
            }
        } finally {
            if (requestGeneration === authHydrationGeneration) {
                set({ isLoading: false });
            }
        }
    }
}))

export default useAuthStore;
