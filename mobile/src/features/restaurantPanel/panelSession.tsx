import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
    listenRestaurantSession,
    signInRestaurant,
    signOutRestaurant,
    type RestaurantSession,
} from "@/src/features/restaurantPanel/restaurantAuth";

type PanelSessionContextValue = {
    session: RestaurantSession | null;
    login: (email: string, password: string) => Promise<RestaurantSession>;
    logout: () => Promise<void>;
    loading: boolean;
    error: string | null;
};

const PanelSessionContext = createContext<PanelSessionContextValue | undefined>(undefined);

export const PanelSessionProvider = ({ children }: { children: ReactNode }) => {
    const [session, setSession] = useState<RestaurantSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsub = listenRestaurantSession((next) => {
            setSession(next);
            setLoading(false);
        });
        return unsub;
    }, []);

    const login = async (email: string, password: string) => {
        setError(null);
        const next = await signInRestaurant(email, password);
        setSession(next);
        return next;
    };

    const logout = async () => {
        await signOutRestaurant();
        setSession(null);
    };

    const value = useMemo(
        () => ({ session, login, logout, loading, error }),
        [session, loading, error],
    );

    return <PanelSessionContext.Provider value={value}>{children}</PanelSessionContext.Provider>;
};

export const usePanelSession = () => {
    const ctx = useContext(PanelSessionContext);
    if (!ctx) throw new Error("usePanelSession must be used within PanelSessionProvider");
    return ctx;
};
