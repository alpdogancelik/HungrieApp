const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertProductionFunctionIdentity,
  assertNonProductionFirebaseIdentity,
  assertSharedNonProductionFunctionIdentity,
} = require("./productionEnvironmentContract");

const shared = [
  { name: "development", supabaseUrl: "https://rgjlsjwsitbnwoetmidb.supabase.co" },
  { name: "staging", supabaseUrl: "https://rlrfvqskzvpysewdxqcr.supabase.co" },
];

test("shared deletion accepts only the shared Firebase project and both bound Supabase projects", () => {
  assert.equal(assertNonProductionFirebaseIdentity("hungrieapp-a2288"), "hungrieapp-a2288");
  assert.throws(() => assertNonProductionFirebaseIdentity("hungrie-production"), /Firebase identity/);
  assert.deepEqual(assertSharedNonProductionFunctionIdentity({ actualFirebaseProjectId: "hungrieapp-a2288", environments: shared }), {
    firebaseProjectId: "hungrieapp-a2288", environments: ["development", "staging"],
  });
  assert.throws(() => assertSharedNonProductionFunctionIdentity({ actualFirebaseProjectId: "hungrie-production", environments: shared }), /Firebase identity/);
  assert.throws(() => assertSharedNonProductionFunctionIdentity({ actualFirebaseProjectId: "hungrieapp-a2288", environments: [shared[0]] }), /every bound environment/);
  assert.throws(() => assertSharedNonProductionFunctionIdentity({ actualFirebaseProjectId: "hungrieapp-a2288", environments: [shared[0], shared[0]] }), /every bound environment/);
  assert.throws(() => assertSharedNonProductionFunctionIdentity({
    actualFirebaseProjectId: "hungrieapp-a2288",
    environments: [shared[0], { name: "staging", supabaseUrl: "https://production-ref-12345.supabase.co" }],
  }), /Supabase identity/);
});

test("production deletion rejects shared Firebase and non-production Supabase projects", () => {
  assert.deepEqual(assertProductionFunctionIdentity({
    actualFirebaseProjectId: "hungrie-production",
    expectedFirebaseProjectId: "hungrie-production",
    supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
    expectedSupabaseProjectRef: "abcdefghijklmnopqrst",
  }), { firebaseProjectId: "hungrie-production", supabaseProjectRef: "abcdefghijklmnopqrst" });
  assert.throws(() => assertProductionFunctionIdentity({
    actualFirebaseProjectId: "hungrieapp-a2288",
    expectedFirebaseProjectId: "hungrieapp-a2288",
    supabaseUrl: shared[0].supabaseUrl,
    expectedSupabaseProjectRef: "rgjlsjwsitbnwoetmidb",
  }), /Firebase identity/);
});
