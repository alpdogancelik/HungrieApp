import Constants from "expo-constants";

type EnvRecord = Record<string, string | undefined>;

const processEnv: EnvRecord =
    (typeof process !== "undefined" ? ((process as any).env as EnvRecord) : undefined) ?? {};
const extraEnv: EnvRecord = (Constants?.expoConfig?.extra as EnvRecord) ?? {};

const getRawEnvValue = (key: string): string | undefined => processEnv[key] ?? extraEnv[key];

export const getEnvFlag = (key: string, defaultValue = false) => {
    const raw = getRawEnvValue(key);
    if (raw === undefined) return defaultValue;
    return raw.toLowerCase() === "true";
};

export const isAuthRequired = () => getEnvFlag("EXPO_PUBLIC_REQUIRE_AUTH", false);
