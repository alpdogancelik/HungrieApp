import Constants from "expo-constants";
import { supabase, supabaseCatalog, supabaseEnabled } from "@/lib/supabase";
import type { RepositoryBackend, RepositoryDomain } from "./types";
import { resolveRepositoryBackend } from "./backendSelection";
import { setCatalogSupabaseClientProvider, setSupabaseClientProvider } from "./supabase/utils";

setSupabaseClientProvider(() => supabase);
setCatalogSupabaseClientProvider(() => supabaseCatalog);

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

// Expo replaces only statically referenced EXPO_PUBLIC_* expressions while
// bundling. Dynamic access such as process.env[name] is undefined in a
// standalone build and would silently fall back to app.json's safe Firebase
// defaults even when EAS supplied Supabase flags.
const domainFlags: Record<RepositoryDomain, string | undefined> = {
    auth: process.env.EXPO_PUBLIC_AUTH_REPOSITORY || extra.EXPO_PUBLIC_AUTH_REPOSITORY,
    catalog: process.env.EXPO_PUBLIC_CATALOG_REPOSITORY || extra.EXPO_PUBLIC_CATALOG_REPOSITORY,
    profile: process.env.EXPO_PUBLIC_PROFILE_REPOSITORY || extra.EXPO_PUBLIC_PROFILE_REPOSITORY,
    membership: process.env.EXPO_PUBLIC_MEMBERSHIP_REPOSITORY || extra.EXPO_PUBLIC_MEMBERSHIP_REPOSITORY,
    restaurant: process.env.EXPO_PUBLIC_RESTAURANT_REPOSITORY || extra.EXPO_PUBLIC_RESTAURANT_REPOSITORY,
    menu: process.env.EXPO_PUBLIC_MENU_REPOSITORY || extra.EXPO_PUBLIC_MENU_REPOSITORY,
    order: process.env.EXPO_PUBLIC_ORDER_REPOSITORY || extra.EXPO_PUBLIC_ORDER_REPOSITORY,
    review: process.env.EXPO_PUBLIC_REVIEW_REPOSITORY || extra.EXPO_PUBLIC_REVIEW_REPOSITORY,
    address: process.env.EXPO_PUBLIC_ADDRESS_REPOSITORY || extra.EXPO_PUBLIC_ADDRESS_REPOSITORY,
    favorites: process.env.EXPO_PUBLIC_FAVORITES_REPOSITORY || extra.EXPO_PUBLIC_FAVORITES_REPOSITORY,
    notification: process.env.EXPO_PUBLIC_NOTIFICATION_REPOSITORY || extra.EXPO_PUBLIC_NOTIFICATION_REPOSITORY,
};

export const getRepositoryBackend = (domain: RepositoryDomain): RepositoryBackend => {
    return resolveRepositoryBackend(domain, {
        supabaseEnabled,
        domains: {
            [domain]: domainFlags[domain],
        },
    }).backend;
};

export const selectRepository = <T>(domain: RepositoryDomain, implementations: Record<RepositoryBackend, T>): T =>
    implementations[getRepositoryBackend(domain)];
