import "react-native-url-polyfill/auto";

import Constants from "expo-constants";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { auth } from "@/lib/firebase";
import { resolveSupabaseState } from "@/lib/supabaseConfig";
import { getFirebaseTransportToken } from "@/src/features/auth/firebaseTransportToken";
import type { Database } from "@/src/types/database.generated";

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;
const runtime = resolveSupabaseState({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || extra.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || extra.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    enabled: process.env.EXPO_PUBLIC_SUPABASE_ENABLED || extra.EXPO_PUBLIC_SUPABASE_ENABLED,
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV || extra.EXPO_PUBLIC_APP_ENV,
});

export const supabaseConfigured = runtime.configured;
export const supabaseEnabled = runtime.enabled;

const clientOptions = (accessToken?: () => Promise<string | null>) => ({
    ...(accessToken ? { accessToken } : {}),
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

export const getFirebaseAccessToken = async (): Promise<string | null> => {
    const user = auth?.currentUser;
    return user ? getFirebaseTransportToken(user) : null;
};

export const supabase: SupabaseClient<Database> | null = supabaseEnabled
    ? createClient<Database>(runtime.url, runtime.publishableKey, clientOptions(getFirebaseAccessToken))
    : null;

export const createSupabaseClientForFirebaseToken = (token: string): SupabaseClient<Database> => {
    if (!supabaseEnabled || !token) throw new Error("Supabase Customer access is not configured.");
    return createClient<Database>(runtime.url, runtime.publishableKey, clientOptions(async () => token));
};

// Public catalog reads must remain anonymous even when a Firebase user is
// signed in. This prevents an unrelated Firebase token issue from blocking
// data that the database intentionally exposes to anon clients.
export const supabaseCatalog: SupabaseClient<Database> | null = supabaseEnabled
    ? createClient<Database>(runtime.url, runtime.publishableKey, clientOptions())
    : null;
