const exactOrigin = (value: string, label: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin.`);
  }
  return url.origin;
};

const firebaseFunctionsOrigin = (projectId: string) => {
  if (!/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error("Admin Firebase project ID is invalid for CSP.");
  return `https://us-central1-${projectId}.cloudfunctions.net`;
};

export const createAdminNonce = () => crypto.randomUUID().replaceAll("-", "");

export const buildAdminContentSecurityPolicy = (
  nonce: string,
  env: Record<string, string | undefined> = process.env,
) => {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error("Admin CSP nonce is invalid.");

  const isDevelopment = env.NODE_ENV === "development";
  const isBuildProof = (env.NEXT_PUBLIC_HUNGRIE_ENV || "build-proof") === "build-proof";
  const firebaseProjectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (isBuildProof ? "build-project" : "");
  const supabaseOrigin = exactOrigin(
    env.NEXT_PUBLIC_SUPABASE_URL || (isBuildProof ? "https://buildproof0000000000.supabase.co" : ""),
    "Admin Supabase URL",
  );
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ""} https://www.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    [
      "connect-src 'self'",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://content-firebaseappcheck.googleapis.com",
      "https://www.google.com",
      firebaseFunctionsOrigin(firebaseProjectId),
      supabaseOrigin,
      ...(isDevelopment ? ["http://127.0.0.1:*", "ws://127.0.0.1:*", "http://localhost:*", "ws://localhost:*"] : []),
    ].join(" "),
    "frame-src https://www.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
};
