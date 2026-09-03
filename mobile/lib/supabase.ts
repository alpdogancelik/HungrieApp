import "react-native-url-polyfill/auto";

import Constants from "expo-constants";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { auth } from "@/lib/firebase";
import { resolveSupabaseState } from "@/lib/supabaseConfig";
import type { Database } from "@/src/types/database.generated";

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;
const runtime = resolveSupabaseState({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || extra.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || extra.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    enabled: process.env.EXPO_PUBLIC_SUPABASE_ENABLED || extra.EXPO_PUBLIC_SUPABASE_ENABLED,
});

export const supabaseConfigured = runtime.configured;
export const supabaseEnabled = runtime.enabled;

export const getFirebaseAccessToken = async (): Promise<string | null> => {
    const user = auth?.currentUser;
    return user ? user.getIdToken() : null;
};

export const supabase: SupabaseClient<Database> | null = supabaseEnabled
    ? createClient<Database>(runtime.url, runtime.publishableKey, {
          accessToken: getFirebaseAccessToken,
          auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
          },
      })
    : null;
