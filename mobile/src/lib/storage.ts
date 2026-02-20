import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

type NullableString = string | null;

const isWeb = Platform.OS === "web";
const hasWindowStorage = typeof window !== "undefined" && !!window.localStorage;
const secureStoreAvailablePromise =
    typeof SecureStore.isAvailableAsync === "function"
        ? SecureStore.isAvailableAsync().catch(() => false)
        : Promise.resolve(false);

const webStorage = {
    async getItem(key: string): Promise<NullableString> {
        if (!hasWindowStorage) return null;
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    async setItem(key: string, value: string): Promise<void> {
        if (!hasWindowStorage) return;
        try {
            window.localStorage.setItem(key, value);
        } catch {
            /* noop */
        }
    },
};

export const storage = {
    async getItem(key: string): Promise<NullableString> {
        if (isWeb) {
            return webStorage.getItem(key);
        }
        if (await secureStoreAvailablePromise) {
            return SecureStore.getItemAsync(key);
        }
        return null;
    },
    async setItem(key: string, value: string): Promise<void> {
        if (isWeb) {
            await webStorage.setItem(key, value);
            return;
        }
        if (await secureStoreAvailablePromise) {
            await SecureStore.setItemAsync(key, value);
        }
    },
};
