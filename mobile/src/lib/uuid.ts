import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

type UuidSources = {
    platform?: string;
    browserRandomUuid?: () => string;
    nativeRandomUuid?: () => string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const isUsableUuid = (value: unknown): value is string =>
    typeof value === "string" && value !== NIL_UUID && UUID_PATTERN.test(value);

export const createUuidFromSources = (sources: UuidSources = {}) => {
    const platform = sources.platform ?? Platform.OS;
    const value = platform === "web"
        ? sources.browserRandomUuid?.() ?? globalThis.crypto?.randomUUID?.()
        : sources.nativeRandomUuid?.() ?? Crypto.randomUUID();

    if (!isUsableUuid(value)) {
        throw new Error("A secure UUID generator is unavailable.");
    }
    return value;
};

export const createUuid = () => createUuidFromSources();
