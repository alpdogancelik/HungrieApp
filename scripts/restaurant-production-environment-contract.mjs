import fs from "node:fs";
import path from "node:path";

export const NON_PRODUCTION_FIREBASE_PROJECT_IDS = Object.freeze(["hungrieapp-a2288"]);
export const NON_PRODUCTION_SUPABASE_PROJECT_REFS = Object.freeze([
  "rgjlsjwsitbnwoetmidb",
  "rlrfvqskzvpysewdxqcr",
]);

const firebaseIdPattern = /^[a-z][a-z0-9-]{4,29}$/;
const supabaseRefPattern = /^[a-z0-9]{20}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export const supabaseProjectRefFromUrl = (value) => {
  let parsed;
  try { parsed = new URL(String(value || "")); } catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9]{20})\.supabase\.co$/);
  return match?.[1] || "";
};

export const assertExactProductionIdentities = ({
  environment,
  firebaseProjectId,
  expectedFirebaseProjectId,
  supabaseProjectRef,
  expectedSupabaseProjectRef,
  supabaseUrl,
  serviceAccountProjectId,
}) => {
  if (environment !== "production") throw new Error("Production identity validation requires environment=production.");
  if (!firebaseIdPattern.test(String(firebaseProjectId || "")) || firebaseProjectId !== expectedFirebaseProjectId) {
    throw new Error("Production Firebase project must be explicit and equal its reviewed expected binding.");
  }
  if (NON_PRODUCTION_FIREBASE_PROJECT_IDS.includes(firebaseProjectId)) throw new Error("Production cannot use a non-production Firebase project.");
  if (serviceAccountProjectId !== undefined && serviceAccountProjectId !== firebaseProjectId) {
    throw new Error("Firebase service-account project does not match the Production Firebase project.");
  }
  const urlRef = supabaseUrl === undefined ? supabaseProjectRef : supabaseProjectRefFromUrl(supabaseUrl);
  if (!supabaseRefPattern.test(String(supabaseProjectRef || "")) || supabaseProjectRef !== expectedSupabaseProjectRef || urlRef !== supabaseProjectRef) {
    throw new Error("Production Supabase URL/ref must be explicit and equal its reviewed expected binding.");
  }
  if (NON_PRODUCTION_SUPABASE_PROJECT_REFS.includes(supabaseProjectRef)) throw new Error("Production cannot use a non-production Supabase project.");
  return Object.freeze({ environment, firebaseProjectId, supabaseProjectRef });
};

export const loadProductionOperatorContract = ({ contractPath, action, rootDir, bindings }) => {
  if (!contractPath) throw new Error("Production requires --production-contract=<ignored JSON file>.");
  const absolute = path.resolve(rootDir, contractPath);
  if (!fs.existsSync(absolute)) throw new Error("Production contract file does not exist.");
  const relative = path.relative(rootDir, absolute);
  if (!relative.startsWith(`secure${path.sep}`)) throw new Error("Production contract must be stored under ignored secure/.");
  const contract = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (contract.schemaVersion !== 1 || contract.environment !== "production") throw new Error("Invalid Production contract schema/environment.");
  if (!Array.isArray(contract.allowedActions) || !contract.allowedActions.includes(action)) throw new Error("Production action is outside the approved contract scope.");
  if (!sha256Pattern.test(String(contract.sourceManifestSha256 || "")) || !sha256Pattern.test(String(contract.ownerApprovalSha256 || ""))) {
    throw new Error("Production contract lacks source-manifest or owner-approval binding.");
  }
  if (!/^[a-f0-9]{40}$/.test(String(contract.checkpoint || ""))) throw new Error("Production contract lacks an exact checkpoint.");
  if (!contract.expiresAt || Date.parse(contract.expiresAt) <= Date.now()) throw new Error("Production contract is expired or missing expiry.");
  assertExactProductionIdentities({ ...bindings, environment: "production" });
  for (const key of ["firebaseProjectId", "supabaseProjectRef"]) {
    if (contract[key] !== bindings[key]) throw new Error(`Production contract ${key} mismatch.`);
  }
  return Object.freeze(contract);
};

export const assertNonProductionOnly = (environment, tool) => {
  if (!new Set(["local", "development", "staging"]).has(environment)) {
    throw new Error(`${tool} is classified non-production-only.`);
  }
};
