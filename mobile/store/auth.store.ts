import { create } from 'zustand';
import { getCurrentAuthIdentity } from '@/src/data/authRepository';
import { resolveAuthHydration, resolveAuthSyncHydration, type AuthHydrationUser } from '@/src/features/auth/authHydration';

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
    syncAuthenticatedUser: (forceServerValidation?: boolean) => Promise<void>;
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
            // Resolve Firebase persistence before any Customer-only Supabase
            // request. A slow profile RPC must not keep the root navigator
            // unmounted or bypass the access-context/bootstrap gate.
            const identity = await getCurrentAuthIdentity(false);
            if (requestGeneration === authHydrationGeneration) {
                set(resolveAuthHydration(null, identity));
            }
        } catch {
            if (requestGeneration === authHydrationGeneration) {
                set(resolveAuthHydration(null, null));
            }
        } finally {
            if (requestGeneration === authHydrationGeneration) {
                set({ isLoading: false });
            }
        }
    },

    syncAuthenticatedUser: async (forceServerValidation = false) => {
        const requestGeneration = ++authHydrationGeneration;
        try {
            const identity = await getCurrentAuthIdentity(forceServerValidation);
            if (requestGeneration !== authHydrationGeneration) return;
            if (!identity) {
                set({ isAuthenticated: false, user: null, isLoading: false, preferredEmoji: undefined });
                return;
            }
            set((state) => resolveAuthSyncHydration(state, identity));
        } catch (error: any) {
            const code = String(error?.code || "");
            if (requestGeneration !== authHydrationGeneration) return;
            if (["auth/user-token-expired", "auth/user-disabled", "auth/user-not-found"].includes(code)) {
                set({ isAuthenticated: false, user: null, isLoading: false, preferredEmoji: undefined });
                return;
            }
            // A listener or foreground refresh owns the current hydration
            // generation. Even a transient failure must release the startup
            // loading gate so it can show recovery UI instead of spinning
            // forever.
            set({ isLoading: false });
        }
    },
}))

export default useAuthStore;
