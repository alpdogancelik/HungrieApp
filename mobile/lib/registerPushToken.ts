import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Platform } from "react-native";

import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";

type RegisterPushTokenResult = {
    restaurantId: string;
    token: string;
};

const toTokenId = (token: string) => {
    const sanitized = token.replace(/[^a-zA-Z0-9_-]/g, "_");
    return sanitized.slice(0, 180);
};

export const registerPushToken = async (): Promise<RegisterPushTokenResult | null> => {
    if (!firestore) return null;
    if (Platform.OS === "web") return null;

    const restaurantId = await getOwnedRestaurantId();
    if (!restaurantId) return null;

    const granted = await NotificationManager.requestPermissions();
    if (!granted) return null;

    const pushToken = await NotificationManager.getPushToken();
    if (!pushToken?.token) return null;

    const tokenId = toTokenId(pushToken.token);
    const ref = doc(firestore, "restaurants", restaurantId, "pushTokens", tokenId);

    await setDoc(
        ref,
        {
            token: pushToken.token,
            tokenId,
            platform: pushToken.platform,
            scope: "restaurant",
            app: "hungrie",
            restaurantId,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        },
        { merge: true },
    );

    return { restaurantId, token: pushToken.token };
};

export default registerPushToken;
