import { create } from 'zustand';
import { getCurrentUser } from '@/lib/firebaseAuth';

type User = { id?: string; $id?: string; accountId?: string; name: string; email: string; avatar?: string; whatsappNumber?: string } | null;

type AuthState = {
    isAuthenticated: boolean;
    user: User;
    isLoading: boolean;
    preferredEmoji?: string;

    setIsAuthenticated: (value: boolean) => void;
    setUser: (user: User) => void;
    setLoading: (loading: boolean) => void;
    setPreferredEmoji: (emoji: string) => void;

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

    fetchAuthenticatedUser: async () => {
        set({ isLoading: true });

        try {
            const user = await getCurrentUser();
            if (user) {
                const userId = user.accountId;
                const mappedUser = {
                    id: userId,
                    $id: userId,
                    accountId: userId,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    whatsappNumber: user.whatsappNumber,
                };
                set({ isAuthenticated: true, user: mappedUser });
            } else {
                set({ isAuthenticated: false, user: null });
            }
        } catch (e) {
            set({ isAuthenticated: false, user: null });
        } finally {
            set({ isLoading: false });
        }
    }
}))

export default useAuthStore;
