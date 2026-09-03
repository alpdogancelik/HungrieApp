import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const TOKEN_PATH = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie", "access-token");
const FIREBASE_ISSUER = "https://securetoken.google.com/hungrieapp-a2288";
const environment = process.argv[2] || "development";

if (!new Set(["development", "staging", "production"]).has(environment)) {
  throw new Error("Usage: npm run supabase:firebase-auth -- <development|staging|production>");
}
if (!fs.existsSync(STATE_PATH) || !fs.existsSync(TOKEN_PATH)) {
  throw new Error("Missing ignored Supabase project state or access token.");
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const accessToken = fs.readFileSync(TOKEN_PATH, "utf8").trim();
const project = state.projects?.[environment];
if (!project?.ref) throw new Error(`No ${environment} project is recorded.`);

const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(project.ref)}/config/auth/third-party-auth`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};
const existingResponse = await fetch(endpoint, { headers });
if (!existingResponse.ok) {
  throw new Error(`Unable to inspect third-party Auth integrations (${existingResponse.status}).`);
}
const existing = await existingResponse.json();
if (!Array.isArray(existing)) throw new Error("Unexpected third-party Auth response.");

const matches = existing.filter(
  (integration) => integration.oidc_issuer_url === FIREBASE_ISSUER,
);
if (matches.length > 1) throw new Error("Duplicate Hungrie Firebase integrations detected.");
if (matches.length === 1) {
  console.log(`Firebase third-party Auth is already configured for ${environment}.`);
  process.exit(0);
}

const createResponse = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify({ oidc_issuer_url: FIREBASE_ISSUER }),
});
if (createResponse.status !== 201) {
  throw new Error(`Unable to create the Firebase Auth integration (${createResponse.status}).`);
}

const created = await createResponse.json();
if (created?.oidc_issuer_url !== FIREBASE_ISSUER) {
  throw new Error("Supabase created an unexpected third-party Auth integration.");
}
console.log(`Configured Firebase third-party Auth for ${environment}.`);
