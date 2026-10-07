"use strict";
const NON_PRODUCTION_FIREBASE_PROJECTS = new Set(["hungrieapp-a2288"]);
const NON_PRODUCTION_SUPABASE_PROJECTS = Object.freeze({
  development: "rgjlsjwsitbnwoetmidb",
  staging: "rlrfvqskzvpysewdxqcr",
});
const projectFromSupabaseUrl = (value) => {
  try { return new URL(String(value || "")).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] || ""; } catch { return ""; }
};
const assertNonProductionFirebaseIdentity = (actualFirebaseProjectId) => {
  if (!NON_PRODUCTION_FIREBASE_PROJECTS.has(actualFirebaseProjectId)) {
    throw new Error("Shared non-production Function Firebase identity is missing or mismatched.");
  }
  return actualFirebaseProjectId;
};
const assertProductionFunctionIdentity = ({ actualFirebaseProjectId, expectedFirebaseProjectId, supabaseUrl, expectedSupabaseProjectRef }) => {
  if (!expectedFirebaseProjectId || actualFirebaseProjectId !== expectedFirebaseProjectId || NON_PRODUCTION_FIREBASE_PROJECTS.has(actualFirebaseProjectId)) {
    throw new Error("Production Function Firebase identity is missing, mismatched, or non-production.");
  }
  const actualRef = projectFromSupabaseUrl(supabaseUrl);
  if (!expectedSupabaseProjectRef || actualRef !== expectedSupabaseProjectRef || new Set(Object.values(NON_PRODUCTION_SUPABASE_PROJECTS)).has(actualRef)) {
    throw new Error("Production Function Supabase identity is missing, mismatched, or non-production.");
  }
  return { firebaseProjectId: actualFirebaseProjectId, supabaseProjectRef: actualRef };
};
const assertSharedNonProductionFunctionIdentity = ({ actualFirebaseProjectId, environments }) => {
  assertNonProductionFirebaseIdentity(actualFirebaseProjectId);
  for (const environment of environments || []) {
    const expectedRef = NON_PRODUCTION_SUPABASE_PROJECTS[environment.name];
    if (!expectedRef || projectFromSupabaseUrl(environment.supabaseUrl) !== expectedRef) {
      throw new Error("Shared non-production Function Supabase identity is missing or mismatched.");
    }
  }
  const names = [...new Set((environments || []).map((entry) => entry.name))].sort();
  if (names.join(",") !== Object.keys(NON_PRODUCTION_SUPABASE_PROJECTS).sort().join(",")) {
    throw new Error("Shared non-production deletion requires every bound environment.");
  }
  return { firebaseProjectId: actualFirebaseProjectId, environments: environments.map((entry) => entry.name) };
};
module.exports = {
  NON_PRODUCTION_SUPABASE_PROJECTS,
  assertNonProductionFirebaseIdentity,
  assertProductionFunctionIdentity,
  assertSharedNonProductionFunctionIdentity,
  projectFromSupabaseUrl,
};
