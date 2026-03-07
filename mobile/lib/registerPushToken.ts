import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Platform } from "react-native";

import { auth, firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";

type PushScope = "user" | "restaurant";
type TokenScope = {
    scope: PushScope;
    ownerId: string;
    collectionPath: string[];
};

type RegisterPushTokenResult = {
    token: string;
    platform: string;
    scopes: PushScope[];
    userId: string | null;
    restaurantId: string | null;
};

const toTokenId = (token: string) => {
    const sanitized = token.replace(/[^a-zA-Z0-9_-]/g, "_");
    return sanitized.slice(0, 180);
};

const upsertToken = async (scope: TokenScope, token: string, tokenId: string, platform: string) => {
    if (!firestore) return;
    const ref = doc(firestore, ...scope.collectionPath, tokenId);
    await setDoc(
        ref,
        {
            token,
            tokenId,
            platform,
            scope: scope.scope,
            app: "hungrie",
            ownerId: scope.ownerId,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        },
        { merge: true },
    );
};

export const registerPushToken = async (): Promise<RegisterPushTokenResult | null> => {
    if (!firestore) return null;
    if (Platform.OS === "web") return null;

    const granted = await NotificationManager.requestPermissions();
    if (!granted) return null;

    const pushToken = await NotificationManager.getPushToken();
    if (!pushToken?.token) return null;

    const userId = auth?.currentUser?.uid ?? null;
    const restaurantId = await getOwnedRestaurantId();
    const scopes: TokenScope[] = [];

    if (userId) {
        scopes.push({
            scope: "user",
            ownerId: userId,
            collectionPath: ["users", userId, "pushTokens"],
        });
    }
    if (restaurantId) {
        scopes.push({
            scope: "restaurant",
            ownerId: restaurantId,
            collectionPath: ["restaurants", restaurantId, "pushTokens"],
        });
    }

    if (!scopes.length) return null;

    const tokenId = toTokenId(pushToken.token);
    await Promise.all(scopes.map((scope) => upsertToken(scope, pushToken.token, tokenId, pushToken.platform)));

    return {
        token: pushToken.token,
        platform: pushToken.platform,
        scopes: scopes.map((scope) => scope.scope),
        userId,
        restaurantId,
    };
};

export default registerPushToken;
