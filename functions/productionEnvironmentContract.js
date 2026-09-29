"use strict";
const NON_PRODUCTION_FIREBASE_PROJECTS = new Set(["hungrieapp-a2288"]);
const projectFromSupabaseUrl = (value) => {
  try { return new URL(String(value || "")).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] || ""; } catch { return ""; }
};
const assertProductionFunctionIdentity = ({ actualFirebaseProjectId, expectedFirebaseProjectId, supabaseUrl, expectedSupabaseProjectRef }) => {
  if (!expectedFirebaseProjectId || actualFirebaseProjectId !== expectedFirebaseProjectId || NON_PRODUCTION_FIREBASE_PROJECTS.has(actualFirebaseProjectId)) {
    throw new Error("Production Function Firebase identity is missing, mismatched, or non-production.");
  }
  const actualRef = projectFromSupabaseUrl(supabaseUrl);
  if (!expectedSupabaseProjectRef || actualRef !== expectedSupabaseProjectRef || new Set(["rgjlsjwsitbnwoetmidb", "rlrfvqskzvpysewdxqcr"]).has(actualRef)) {
    throw new Error("Production Function Supabase identity is missing, mismatched, or non-production.");
  }
  return { firebaseProjectId: actualFirebaseProjectId, supabaseProjectRef: actualRef };
};
module.exports = { assertProductionFunctionIdentity, projectFromSupabaseUrl };
