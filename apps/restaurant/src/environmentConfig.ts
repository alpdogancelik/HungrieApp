const NON_PROD_FIREBASE = "hungrieapp-a2288";
const NON_PROD_SUPABASE = new Set(["rgjlsjwsitbnwoetmidb", "rlrfvqskzvpysewdxqcr"]);

const refFromUrl = (value: string) => {
  try { return new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] || ""; } catch { return ""; }
};

export const resolveRestaurantEnvironment = (env: Record<string, string | undefined>) => {
  const environment = String(env.EXPO_PUBLIC_HUNGRIE_ENV || "build-proof").trim();
  if (!new Set(["development", "staging", "production", "build-proof"]).has(environment)) throw new Error("Invalid Restaurant environment.");
  const firebase = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  };
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || "";
  const supabaseProjectRef = refFromUrl(supabaseUrl);
  if (environment === "production") {
    if (Object.values(firebase).some((value) => !value)) throw new Error("Production Restaurant Firebase config is incomplete.");
    if (!env.EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID || firebase.projectId !== env.EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID || firebase.projectId === NON_PROD_FIREBASE) {
      throw new Error("Production Restaurant Firebase binding is missing, mismatched, or non-production.");
    }
    if (!env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF || supabaseProjectRef !== env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF || NON_PROD_SUPABASE.has(supabaseProjectRef)) {
      throw new Error("Production Restaurant Supabase binding is missing, mismatched, or non-production.");
    }
    if (!env.EXPO_PUBLIC_FIREBASE_VAPID_KEY) throw new Error("Production Restaurant VAPID key is required.");
    const origin = String(env.EXPO_PUBLIC_APP_ORIGIN || "");
    const expectedOrigin = String(env.EXPO_PUBLIC_EXPECTED_APP_ORIGIN || "");
    let validOrigin = false;
    try { const parsed = new URL(origin); validOrigin = parsed.protocol === "https:" && parsed.origin === origin && origin === expectedOrigin; } catch {}
    if (!validOrigin) throw new Error("Production Restaurant origin must be one exact reviewed HTTPS origin.");
  }
  const buildProof = environment === "build-proof";
  return {
    environment,
    firebase: Object.fromEntries(Object.entries(firebase).map(([key, value]) => [key, value || (buildProof ? `build-${key}` : "")])),
    supabaseUrl: supabaseUrl || (buildProof ? "https://buildproof0000000000.supabase.co" : ""),
    supabaseKey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || (buildProof ? "build-proof" : ""),
    supabaseProjectRef,
  };
};
