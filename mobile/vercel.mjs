const NON_PRODUCTION_FIREBASE_PROJECT_ID = "hungrieapp-a2288";
const NON_PRODUCTION_SUPABASE_PROJECT_REFS = new Set([
    "rgjlsjwsitbnwoetmidb",
    "rlrfvqskzvpysewdxqcr",
]);
const EXPO_ROUTER_BOOTSTRAP_HASH = "'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='";

const required = (env, name) => {
    const value = String(env[name] || "").trim();
    if (!value) throw new Error(`Customer web hosting requires ${name}.`);
    return value;
};

export const resolveCustomerWebSecurityHeaders = (env = process.env) => {
    const environment = required(env, "EXPO_PUBLIC_APP_ENV");
    if (!new Set(["development", "staging", "production"]).has(environment)) {
        throw new Error("Customer web hosting received an invalid application environment.");
    }

    const firebaseProjectId = required(env, "EXPO_PUBLIC_FIREBASE_PROJECT_ID");
    const expectedFirebaseProjectId = required(env, "EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID");
    if (firebaseProjectId !== expectedFirebaseProjectId) {
        throw new Error("Customer web hosting Firebase project binding mismatch.");
    }
    if (!/^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$/.test(firebaseProjectId)) {
        throw new Error("Customer web hosting Firebase project ID is invalid.");
    }

    const supabaseUrl = new URL(required(env, "EXPO_PUBLIC_SUPABASE_URL"));
    const expectedSupabaseProjectRef = required(env, "EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF").toLowerCase();
    const expectedSupabaseHost = `${expectedSupabaseProjectRef}.supabase.co`;
    if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname.toLowerCase() !== expectedSupabaseHost || supabaseUrl.pathname !== "/") {
        throw new Error("Customer web hosting Supabase origin binding mismatch.");
    }
    if (environment === "production" && (
        firebaseProjectId === NON_PRODUCTION_FIREBASE_PROJECT_ID
        || NON_PRODUCTION_SUPABASE_PROJECT_REFS.has(expectedSupabaseProjectRef)
    )) throw new Error("Production Customer web hosting cannot trust a non-production service origin.");

    if (environment === "production") required(env, "EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY");

    const supabaseOrigin = supabaseUrl.origin;
    const supabaseRealtimeOrigin = `wss://${supabaseUrl.host}`;
    const functionsOrigin = `https://us-central1-${firebaseProjectId}.cloudfunctions.net`;
    const csp = [
        "default-src 'self'",
        `script-src 'self' https://www.google.com https://www.gstatic.com https://www.recaptcha.net ${EXPO_ROUTER_BOOTSTRAP_HASH}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: https://images.pexels.com ${supabaseOrigin}`,
        "font-src 'self'",
        `connect-src 'self' ${supabaseOrigin} ${supabaseRealtimeOrigin} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://content-firebaseappcheck.googleapis.com ${functionsOrigin} https://www.google.com https://www.recaptcha.net`,
        "frame-src https://www.google.com https://www.recaptcha.net",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
    ].join("; ");

    return {
        "Content-Security-Policy": csp,
        "Strict-Transport-Security": "max-age=31536000",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "accelerometer=(), autoplay=(self), camera=(), clipboard-write=(self), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), publickey-credentials-create=(), publickey-credentials-get=(), usb=()",
    };
};

export const config = {
    buildCommand: "npm run export:web",
    outputDirectory: "dist",
    framework: null,
    routes: [
        {
            src: "/(.*)",
            headers: resolveCustomerWebSecurityHeaders(),
            continue: true,
        },
        { handle: "filesystem" },
        { src: "/.*", dest: "/" },
    ],
};
