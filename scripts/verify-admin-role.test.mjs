import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoleLookupQuery,
  classifyVerification,
  maskEmail,
  normalizeSupabaseState,
  parseArgs,
  parseQueryRows,
  readFirebaseClaimState,
  VERIFICATION_EXIT_CODES,
  validateOptions,
} from "./verify-admin-role.mjs";

const validOptions = {
  email: "admin@example.com",
  uid: "",
  credentialPath: "/outside/firebase.json",
  projectId: "hungrieapp-a2288",
  target: "local",
  confirmedTarget: "local",
};

test("parses inline and separated arguments", () => {
  assert.deepEqual(
    parseArgs([
      "--email=admin@example.com",
      "--credential", "/outside/firebase.json",
      "--confirm-project=hungrieapp-a2288",
      "--target=local",
      "--confirm-target", "local",
    ]),
    validOptions,
  );
});

test("requires one identity and exact target confirmation", () => {
  assert.throws(() => validateOptions({ ...validOptions, uid: "uid" }, "/repo"), /exactly one/);
  assert.throws(() => validateOptions({ ...validOptions, email: "", uid: "" }, "/repo"), /exactly one/);
  assert.throws(() => validateOptions({ ...validOptions, confirmedTarget: "staging" }, "/repo"), /matching/);
  assert.throws(() => validateOptions({ ...validOptions, projectId: "wrong" }, "/repo"), /confirm-project/);
  assert.doesNotThrow(() => validateOptions({ ...validOptions, target: "development", confirmedTarget: "development" }, "/repo"));
});

test("rejects relative and in-repository Firebase credentials", () => {
  assert.throws(() => validateOptions({ ...validOptions, credentialPath: "firebase.json" }, "/repo"), /absolute/);
  assert.throws(() => validateOptions({ ...validOptions, credentialPath: "/repo/secure/firebase.json" }, "/repo"), /outside/);
  assert.doesNotThrow(() => validateOptions(validOptions, "/repo"));
});

test("masks email without exposing the full local part", () => {
  assert.equal(maskEmail("administrator@example.com"), "ad***@example.com");
  assert.equal(maskEmail("a@example.com"), "a***@example.com");
  assert.equal(maskEmail("invalid"), null);
});

test("reads only the canonical Firebase admin claim", () => {
  assert.deepEqual(readFirebaseClaimState({ role: "authenticated", platform_role: "admin" }), {
    transportRole: "authenticated",
    platformRole: "admin",
    invalidPlatformRole: false,
    legacyAdminClaimPresent: false,
  });
  assert.equal(readFirebaseClaimState({ role: "admin" }).legacyAdminClaimPresent, true);
  assert.equal(readFirebaseClaimState({ role: "authenticated", platformRole: "admin" }).legacyAdminClaimPresent, true);
  assert.equal(readFirebaseClaimState({ role: "authenticated", platform_role: "owner" }).invalidPlatformRole, true);
});

test("builds a fixed read-only role lookup without embedding the raw UID", () => {
  const query = buildRoleLookupQuery("uid-'--danger");
  assert.match(query, /^select /);
  assert.match(query, /private\.user_roles/);
  assert.doesNotMatch(query, /uid-'--danger/);
  assert.doesNotMatch(query, /\b(insert|update|delete|alter|drop)\b/i);
});

test("normalizes Supabase roles with super-admin precedence", () => {
  assert.deepEqual(normalizeSupabaseState(null), {
    profileFound: false,
    profileId: null,
    roles: [],
    effectiveRole: null,
  });
  assert.equal(normalizeSupabaseState({ profile_id: "p1", roles: ["admin", "super_admin"] }).effectiveRole, "super_admin");
});

test("classifies allowed, denied, and misconfigured role combinations", () => {
  const firebaseAdmin = readFirebaseClaimState({ role: "authenticated", platform_role: "admin" });
  const firebaseCustomer = readFirebaseClaimState({ role: "authenticated" });
  const supabaseAdmin = normalizeSupabaseState({ profile_id: "p1", roles: ["admin"] });
  const supabaseCustomer = normalizeSupabaseState({ profile_id: "p1", roles: [] });

  assert.deepEqual(classifyVerification(firebaseAdmin, supabaseAdmin), { result: "allowed", reason: "roles_match", exitCode: 0 });
  assert.deepEqual(classifyVerification(firebaseCustomer, supabaseCustomer), { result: "denied", reason: "admin_role_absent", exitCode: 2 });
  assert.equal(classifyVerification(firebaseAdmin, supabaseCustomer).reason, "supabase_admin_role_missing");
  assert.equal(classifyVerification(firebaseCustomer, supabaseAdmin).reason, "firebase_admin_claim_missing");
  assert.equal(classifyVerification(firebaseAdmin, normalizeSupabaseState(null)).reason, "supabase_profile_missing");
  assert.equal(classifyVerification(readFirebaseClaimState({ role: "admin" }), supabaseAdmin).reason, "firebase_transport_role_invalid");
  assert.deepEqual(
    classifyVerification(firebaseAdmin, normalizeSupabaseState({ profile_id: "p1", roles: ["super_admin"] })),
    { result: "misconfigured", reason: "admin_role_mismatch", exitCode: VERIFICATION_EXIT_CODES.misconfigured },
  );
});

test("verification exit codes remain stable for operator automation", () => {
  assert.deepEqual(VERIFICATION_EXIT_CODES, {
    allowed: 0,
    operationalFailure: 1,
    denied: 2,
    misconfigured: 3,
    notFound: 4,
  });
});

test("parses local and management API query result shapes", () => {
  assert.deepEqual(parseQueryRows('[{"profile_id":"p1","roles":["admin"]}]'), [{ profile_id: "p1", roles: ["admin"] }]);
  assert.deepEqual(parseQueryRows('{"rows":[]}'), []);
  assert.throws(() => parseQueryRows('{}'), /Unexpected/);
});
