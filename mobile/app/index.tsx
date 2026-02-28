import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";

import brandMark from "../assets/images/hungrie-mark.png";

import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { isAuthRequired } from "@/lib/runtimeEnv";

const authGuardEnabled = isAuthRequired();

export default function RootRoute() {
    const { isAuthenticated, isLoading } = useAuthStore();
    const [destination, setDestination] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const resolveDestination = async () => {
            if (isLoading) return;

            if (authGuardEnabled && !isAuthenticated) {
                if (active) setDestination("/sign-in");
                return;
            }

            if (!isAuthenticated && !authGuardEnabled) {
                if (active) setDestination("/home");
                return;
            }

            const ownedRestaurantId = await getOwnedRestaurantId().catch(() => null);
            if (!active) return;
            setDestination(ownedRestaurantId ? "/restaurantpanel" : "/home");
        };

        resolveDestination();

        return () => {
            active = false;
        };
    }, [isAuthenticated, isLoading]);

    if (!destination) {
        // Keep something visible after the launch video in case session resolution takes longer.
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7EF" }}>
                <Image
                    source={brandMark}
                    style={{ width: 120, height: 120, opacity: 0.92 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                />
            </View>
        );
    }
    return <Redirect href={destination as any} />;
}
