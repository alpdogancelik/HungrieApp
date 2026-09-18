import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const admin = require(path.join(root, "functions/node_modules/firebase-admin"));

export const sqlQuote = value => `'${String(value).replaceAll("'", "''")}'`;

export function loadOperatorContext() {
  const operatorPath = path.join(root, "secure/phase7/operator-config.json");
  const registry = JSON.parse(fs.readFileSync(path.join(root, "secure/supabase-projects.local.json"), "utf8"));
  const staging = registry.projects?.staging;
  const operator = JSON.parse(fs.readFileSync(operatorPath, "utf8"));
  if (!staging?.ref || staging.name !== "HungrieApp Staging" || staging.ref === registry.projects?.development?.ref || staging.ref === registry.projects?.production?.ref) throw new Error("Isolated Staging configuration is required.");
  if (!path.isAbsolute(operator.firebaseAdminCredentialPath) || !fs.existsSync(operator.firebaseAdminCredentialPath)) throw new Error("External Firebase Admin credential path is required.");
  const credential = JSON.parse(fs.readFileSync(operator.firebaseAdminCredentialPath, "utf8"));
  if (credential.project_id !== "hungrieapp-a2288" || operator.firebaseProjectId !== credential.project_id || !operator.firebaseWebApiKey) throw new Error("Firebase operator configuration mismatch.");
  const managementToken = fs.readFileSync(path.join(root, "secure/supabase-cli-hungrie/access-token"), "utf8").trim();
  return { root, staging, operator, credential, managementToken, admin };
}

export async function sql(context, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${context.staging.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${context.managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query }) });
  if (!response.ok) throw new Error(`Staging SQL failed (${response.status}); details withheld.`);
  const rows = await response.json(); if (!Array.isArray(rows)) throw new Error("Staging SQL response malformed."); return rows;
}

export async function exchange(context, customToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(context.operator.firebaseWebApiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  return (await response.json()).idToken;
}

export async function rpc(context, token, name, args = {}) {
  const started = performance.now();
  const response = await fetch(`${context.staging.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: context.staging.publishableKey, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify(args) });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, code: body?.code || null, body, latencyMs: performance.now() - started };
}

export function firebaseApp(context, suffix) {
  return context.admin.initializeApp({ credential: context.admin.credential.cert(context.credential), projectId: context.credential.project_id }, `phase7-${suffix}-${process.pid}-${Date.now()}`);
}
