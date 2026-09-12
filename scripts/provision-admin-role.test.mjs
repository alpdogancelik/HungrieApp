import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMutationQuery,
  buildPlan,
  buildPreflightQuery,
  canonicalizeClaims,
  executeOrderedWrite,
  normalizeDatabaseState,
  parseArgs,
  PROVISION_EXIT_CODES,
  summarizeClaims,
  validateOptions,
  validatePreflight,
} from "./provision-admin-role.mjs";

const baseOptions = {
  email: "admin@example.com",
  uid: "",
  role: "super_admin",
  remove: false,
  bootstrap: true,
  actorUid: "",
  credentialPath: "/tmp/firebase-admin.json",
  projectId: "hungrieapp-a2288",
  target: "development",
  confirmedTarget: "development",
  write: false,
  expectedPlanHash: "",
};

test("parses guarded bootstrap arguments", () => {
  assert.deepEqual(parseArgs([
    "--email=admin@example.com", "--role=super_admin", "--bootstrap",
    "--credential=/tmp/firebase-admin.json", "--confirm-project=hungrieapp-a2288",
    "--target=development", "--confirm-target=development",
  ]), baseOptions);
});

test("requires one target identity and rejects production", () => {
  assert.throws(() => validateOptions({ ...baseOptions, uid: "also-present" }, "/repo"), /exactly one/);
  assert.throws(() => validateOptions({ ...baseOptions, target: "production", confirmedTarget: "production" }, "/repo"), /development\|staging/);
});

test("requires matching target confirmation and external credential", () => {
  assert.throws(() => validateOptions({ ...baseOptions, confirmedTarget: "staging" }, "/repo"), /matching/);
  assert.throws(() => validateOptions({ ...baseOptions, credentialPath: "/repo/key.json" }, "/repo"), /outside/);
});

test("requires a dry-run hash for writes", () => {
  assert.throws(() => validateOptions({ ...baseOptions, write: true }, "/repo"), /expect-plan-sha256/);
  assert.doesNotThrow(() => validateOptions({ ...baseOptions, write: true, expectedPlanHash: "a".repeat(64) }, "/repo"));
});

test("validates bootstrap and ordinary actor combinations", () => {
  assert.throws(() => validateOptions({ ...baseOptions, role: "admin" }, "/repo"), /bootstrap/);
  assert.throws(() => validateOptions({ ...baseOptions, bootstrap: false }, "/repo"), /actor-uid/);
  assert.doesNotThrow(() => validateOptions({ ...baseOptions, bootstrap: false, actorUid: "actor" }, "/repo"));
});

test("revoke omits role and requires an actor", () => {
  const options = { ...baseOptions, bootstrap: false, actorUid: "actor", remove: true, role: "" };
  assert.doesNotThrow(() => validateOptions(options, "/repo"));
  assert.throws(() => validateOptions({ ...options, role: "admin" }, "/repo"), /must omit/);
});

test("canonical claims preserve unrelated values and remove legacy admin aliases", () => {
  const result = canonicalizeClaims({
    role: "admin", platformRole: "admin", adminRole: "super_admin",
    roles: ["member", "admin"], platformRoles: ["billing", "super_admin"],
    platform_roles: ["admin"], feature: "enabled",
  }, "super_admin");
  assert.deepEqual(result, {
    role: "authenticated", roles: ["member"], platformRoles: ["billing"],
    feature: "enabled", platform_role: "super_admin",
  });
});

test("revocation removes canonical admin claim and preserves courier data", () => {
  assert.deepEqual(canonicalizeClaims({ role: "authenticated", platform_role: "admin", roles: ["courier"] }, null), {
    role: "authenticated", roles: ["courier"],
  });
});

test("canonical cleanup removes admin aliases but preserves unrelated role entries", () => {
  assert.deepEqual(canonicalizeClaims({
    role: "authenticated",
    admin: true,
    platform_role: "super_admin",
    roles: ["courier", "admin", "support"],
    platformRoles: ["billing", "super_admin"],
  }, null), {
    role: "authenticated",
    roles: ["courier", "support"],
    platformRoles: ["billing"],
  });
});

test("provisioning exit codes remain stable for stale and fail-closed outcomes", () => {
  assert.deepEqual(PROVISION_EXIT_CODES, {
    completed: 0,
    operationalFailure: 1,
    stalePlan: 5,
    partialFailClosed: 6,
  });
});

test("claim summary never returns raw unrelated claim values", () => {
  assert.deepEqual(summarizeClaims({ role: "authenticated", platform_role: "admin", secret: "hidden" }), {
    transportRole: "authenticated", platformRole: "admin", legacyAdminClaimPresent: false, unrelatedClaimCount: 1,
  });
});

test("preflight SQL encodes identifiers and is read-only", () => {
  const query = buildPreflightQuery({ targetUid: "uid'unsafe", actorUid: "actor" });
  assert.doesNotMatch(query, /uid'unsafe/);
  assert.match(query, /decode\('[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(query, /\b(insert|update|delete)\b/i);
});

test("normalizes migration and role state", () => {
  assert.deepEqual(normalizeDatabaseState({
    runtime_migration: true, verification_migration: true, provisioning_migration: true,
    target_profile_id: "profile", target_roles: ["admin", "admin"],
    actor_profile_id: "actor", actor_roles: ["super_admin"], super_admin_count: 1,
  }), {
    schemaReady: true, targetProfileId: "profile", targetRoles: ["admin"],
    actorProfileId: "actor", actorRoles: ["super_admin"], superAdminCount: 1,
  });
});

test("bootstrap preflight requires ready schema, profile, and zero super-admins", () => {
  const database = { schemaReady: true, targetProfileId: "profile", superAdminCount: 0 };
  assert.doesNotThrow(() => validatePreflight({ options: baseOptions, targetClaims: {}, actorClaims: {}, database }));
  assert.throws(() => validatePreflight({ options: baseOptions, targetClaims: {}, actorClaims: {}, database: { ...database, superAdminCount: 1 } }), /already exists/);
  assert.throws(() => validatePreflight({ options: baseOptions, targetClaims: {}, actorClaims: {}, database: { ...database, schemaReady: false } }), /migrations/);
});

test("ordinary preflight requires matching canonical super-admin actor", () => {
  const options = { ...baseOptions, bootstrap: false, actorUid: "actor" };
  const database = { schemaReady: true, targetProfileId: "profile", actorProfileId: "actor-profile", actorRoles: ["super_admin"], superAdminCount: 1 };
  assert.doesNotThrow(() => validatePreflight({
    options, targetClaims: { role: "authenticated" },
    actorClaims: { role: "authenticated", platform_role: "super_admin" }, database,
  }));
  assert.throws(() => validatePreflight({ options, targetClaims: { role: "authenticated" }, actorClaims: { role: "authenticated" }, database }), /matching canonical/);
});

test("plan hashes are deterministic and sensitive identifiers are hashed", () => {
  const input = {
    options: baseOptions,
    targetUser: { uid: "target-uid" },
    targetClaims: { role: "authenticated" },
    actorUser: null,
    database: { targetProfileId: "profile-id", targetRoles: [], superAdminCount: 0 },
  };
  const first = buildPlan(input);
  const second = buildPlan(input);
  assert.equal(first.planHash, second.planHash);
  assert.match(first.planHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(first.body), /target-uid|profile-id/);
});

test("mutation SQL calls only the private fixed provisioning function", () => {
  const query = buildMutationQuery({ profileId: "profile", nextRole: "super_admin", actorProfileId: null, bootstrap: true, operationId: "00000000-0000-4000-8000-000000000001" });
  assert.match(query, /^select private\.apply_platform_admin_role\(/);
  assert.match(query, /'super_admin'::public\.platform_role/);
  assert.doesNotMatch(query, /\b(insert|update|delete)\b/i);
});

test("grant writes Firebase before Supabase", async () => {
  const calls = [];
  const result = await executeOrderedWrite({
    currentDatabaseRole: null, nextRole: "admin",
    setFirebase: async () => calls.push("firebase"), setDatabase: async () => calls.push("database"),
    restoreFirebase: async () => calls.push("restore"), revokeTokens: async () => calls.push("revoke"),
  });
  assert.deepEqual(calls, ["firebase", "database"]);
  assert.equal(result.order, "firebase_first");
});

test("failed grant restores Firebase and revokes tokens", async () => {
  const calls = [];
  await assert.rejects(() => executeOrderedWrite({
    currentDatabaseRole: null, nextRole: "super_admin",
    setFirebase: async () => calls.push("firebase"), setDatabase: async () => { calls.push("database"); throw new Error("failed"); },
    restoreFirebase: async () => calls.push("restore"), revokeTokens: async () => calls.push("revoke"),
  }), (error) => error.code === "GRANT_COMPENSATED");
  assert.deepEqual(calls, ["firebase", "database", "restore", "revoke"]);
});

test("revoke and downgrade reduce Supabase privilege first", async () => {
  for (const nextRole of [null, "admin"]) {
    const calls = [];
    await executeOrderedWrite({
      currentDatabaseRole: "super_admin", nextRole,
      setFirebase: async () => calls.push("firebase"), setDatabase: async () => calls.push("database"),
      restoreFirebase: async () => calls.push("restore"), revokeTokens: async () => calls.push("revoke"),
    });
    assert.deepEqual(calls, ["database", "firebase", "revoke"]);
  }
});

test("Firebase failure after database-first reduction remains fail-closed", async () => {
  const calls = [];
  await assert.rejects(() => executeOrderedWrite({
    currentDatabaseRole: "admin", nextRole: null,
    setFirebase: async () => { calls.push("firebase"); throw new Error("failed"); },
    setDatabase: async () => calls.push("database"), restoreFirebase: async () => calls.push("restore"),
    revokeTokens: async () => calls.push("revoke"),
  }), (error) => error.code === "PARTIAL_FAIL_CLOSED");
  assert.deepEqual(calls, ["database", "firebase"]);
});
