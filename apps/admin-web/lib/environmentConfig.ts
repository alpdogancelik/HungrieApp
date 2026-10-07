const NON_PROD_FIREBASE = "hungrieapp-a2288";
const NON_PROD_SUPABASE = new Set(["rgjlsjwsitbnwoetmidb", "rlrfvqskzvpysewdxqcr"]);
const refFromUrl = (value: string) => {
  try { return new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] || ""; } catch { return ""; }
};

export const resolveAdminEnvironment = (env: Record<string, string | undefined>) => {
  const environment = env.NEXT_PUBLIC_HUNGRIE_ENV || "build-proof";
  if (!new Set(["development", "staging", "production", "build-proof"]).has(environment)) throw new Error("Invalid Admin environment");
  const firebase = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };
  const appCheckSiteKey = env.NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY || "";
  const appCheckDebugToken = env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN || "";
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseRef = refFromUrl(supabaseUrl);
  const build = environment === "build-proof";
  if (environment === "production") {
    if (Object.values(firebase).some((value) => !value) || !env.NEXT_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID || firebase.projectId !== env.NEXT_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID || firebase.projectId === NON_PROD_FIREBASE) throw new Error("Production Admin Firebase binding is invalid.");
    if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF || supabaseRef !== env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF || NON_PROD_SUPABASE.has(supabaseRef)) throw new Error("Production Admin Supabase binding is invalid.");
    if (!appCheckSiteKey) throw new Error("Production Admin App Check site key is required.");
    if (appCheckDebugToken) throw new Error("Production Admin App Check debug mode is forbidden.");
  }
  const suffix = environment === "production" ? "Production" : environment === "staging" ? "Staging" : "Development";
  return {
    environment,
    suffix,
    firebase: Object.fromEntries(Object.entries(firebase).map(([key, value]) => [key, value || (build ? `build-${key}` : "")])),
    appCheck: { siteKey: appCheckSiteKey, debugToken: appCheckDebugToken },
    supabaseUrl: supabaseUrl || (build ? "https://buildproof0000000000.supabase.co" : ""),
    supabaseKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || (build ? "build-proof" : ""),
    supabaseRef,
  };
};
