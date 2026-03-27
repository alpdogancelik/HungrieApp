import { collection, deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Platform } from "react-native";

import { auth, firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/restaurantOwnership";
import { storage } from "@/src/lib/storage";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";

type PushScope = "user" | "restaurant";
type TokenScope = {
    scope: PushScope;
    ownerId: string;
    collectionPath: [string, string, string];
};
type StoredTokenBinding = {
    token: string;
    tokenId: string;
    platform: string;
    provider: string;
    scopes: TokenScope[];
};

type RegisterPushTokenResult = {
    token: string;
    platform: string;
    provider: string;
    scopes: PushScope[];
    userId: string | null;
    restaurantId: string | null;
};

const toTokenId = (token: string) => {
    const sanitized = token.replace(/[^a-zA-Z0-9_-]/g, "_");
    return sanitized.slice(0, 180);
};
const ACTIVE_BINDING_KEY = "push_token_active_binding_v1";

const readStoredBinding = async (): Promise<StoredTokenBinding | null> => {
    const raw = await storage.getItem(ACTIVE_BINDING_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as StoredTokenBinding;
        if (!parsed?.token || !parsed?.tokenId || !Array.isArray(parsed?.scopes)) return null;
        return parsed;
    } catch {
        return null;
    }
};

const writeStoredBinding = async (binding: StoredTokenBinding) => {
    await storage.setItem(ACTIVE_BINDING_KEY, JSON.stringify(binding));
};

const clearStoredBinding = async () => {
    await storage.removeItem(ACTIVE_BINDING_KEY);
};

const sameScope = (left: TokenScope, right: TokenScope) =>
    left.scope === right.scope &&
    left.ownerId === right.ownerId &&
    left.collectionPath.length === right.collectionPath.length &&
    left.collectionPath.every((part, index) => part === right.collectionPath[index]);

const removeScopeBinding = async (scope: TokenScope, tokenId: string) => {
    if (!firestore) return;
    const ref = doc(firestore, ...scope.collectionPath, tokenId);
    await deleteDoc(ref).catch(() => null);
};

const upsertToken = async (scope: TokenScope, token: string, tokenId: string, platform: string, provider: string) => {
    if (!firestore) return;
    const collectionRef = collection(firestore, scope.collectionPath.join("/"));
    const ref = doc(collectionRef, tokenId);
    await setDoc(
        ref,
        {
            token,
            tokenId,
            platform,
            provider,
            scope: scope.scope,
            app: "hungrie",
            ownerId: scope.ownerId,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        },
        { merge: true },
    );
};

export const unregisterPushToken = async () => {
    if (Platform.OS === "web") return;
    const binding = await readStoredBinding();
    if (!binding) return;

    await Promise.all(binding.scopes.map((scope) => removeScopeBinding(scope, binding.tokenId)));
    await clearStoredBinding();
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
    const previousBinding = await readStoredBinding();

    if (previousBinding) {
        const scopeDiffers =
            previousBinding.tokenId !== tokenId ||
            previousBinding.scopes.length !== scopes.length ||
            previousBinding.scopes.some((scope) => !scopes.some((nextScope) => sameScope(scope, nextScope)));

        if (scopeDiffers) {
            await Promise.all(previousBinding.scopes.map((scope) => removeScopeBinding(scope, previousBinding.tokenId)));
        }
    }

    await Promise.all(scopes.map((scope) => upsertToken(scope, pushToken.token, tokenId, pushToken.platform, pushToken.provider)));
    await writeStoredBinding({
        token: pushToken.token,
        tokenId,
        platform: pushToken.platform,
        provider: pushToken.provider,
        scopes,
    });

    return {
        token: pushToken.token,
        platform: pushToken.platform,
        provider: pushToken.provider,
        scopes: scopes.map((scope) => scope.scope),
        userId,
        restaurantId,
    };
};

export default registerPushToken;
