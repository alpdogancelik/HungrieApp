import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { isAuthRequired } from "@/lib/runtimeEnv";

const authGuardEnabled = isAuthRequired();

export default function RootRoute() {
    const { isAuthenticated } = useAuthStore();
    const [checking, setChecking] = useState(true);
    const [hasRestaurant, setHasRestaurant] = useState(false);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            if (!isAuthenticated) {
                setChecking(false);
                setHasRestaurant(false);
                return;
            }
            try {
                const owned = await getOwnedRestaurantId();
                if (!mounted) return;
                setHasRestaurant(Boolean(owned));
            } finally {
                if (mounted) setChecking(false);
            }
        };
        check();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    if (checking) return null;

    if (authGuardEnabled && isAuthenticated) return <Redirect href={hasRestaurant ? "/restaurantpanel" : "/home"} />;
    if (authGuardEnabled && !isAuthenticated) return <Redirect href="/sign-in" />;

    return <Redirect href={isAuthenticated ? (hasRestaurant ? "/restaurantpanel" : "/home") : "/splash"} />;
}
