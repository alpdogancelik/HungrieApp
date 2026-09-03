import Constants from "expo-constants";
import { supabaseEnabled } from "@/lib/supabase";
import type { RepositoryBackend, RepositoryDomain } from "./types";
import { resolveRepositoryBackend } from "./backendSelection";

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

const readEnv = (name: string) =>
    (typeof process !== "undefined" ? (process as any).env?.[name] : undefined) || extra[name];

const domainFlagNames: Record<RepositoryDomain, string> = {
    auth: "EXPO_PUBLIC_AUTH_REPOSITORY",
    profile: "EXPO_PUBLIC_PROFILE_REPOSITORY",
    restaurant: "EXPO_PUBLIC_RESTAURANT_REPOSITORY",
    menu: "EXPO_PUBLIC_MENU_REPOSITORY",
    order: "EXPO_PUBLIC_ORDER_REPOSITORY",
    review: "EXPO_PUBLIC_REVIEW_REPOSITORY",
    address: "EXPO_PUBLIC_ADDRESS_REPOSITORY",
    favorites: "EXPO_PUBLIC_FAVORITES_REPOSITORY",
    notification: "EXPO_PUBLIC_NOTIFICATION_REPOSITORY",
};

export const getRepositoryBackend = (domain: RepositoryDomain): RepositoryBackend => {
    const envName = domainFlagNames[domain];
    return resolveRepositoryBackend(domain, {
        supabaseEnabled,
        domains: {
            [domain]: readEnv(envName),
        },
    }).backend;
};

export const selectRepository = <T>(domain: RepositoryDomain, implementations: Record<RepositoryBackend, T>): T =>
    implementations[getRepositoryBackend(domain)];
