#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ACCOUNT_PREPARATION,
  atomicWriteExclusive,
  buildPreparationSql,
  buildRecoverySql,
  buildSnapshotSql,
  classifyState,
  runPreparation,
  sha256,
  validateAccountsFile,
  validateAccountsFilePath,
  validateAfterState,
  validateAuthority,
  validateBeforeState,
  validateFirebaseObservation,
  validateRecoveredState,
} from "./restaurant-staging-account-preparation.mjs";

const fixedNow = Date.parse("2026-09-25T01:00:00.000Z");
const clone = value => structuredClone(value);
const accounts = Object.fromEntries(Object.entries(ACCOUNT_PREPARATION.accounts).map(([name, a]) => [name, { email: a.email, password: "Synthetic-local-only-password-" + name }]));
const authorityText = "I authorize the reviewed Staging preparation and independent recovery. Firebase is read-only. Earnings remains disabled.";
const authority = {
  contractVersion: 1,
  decision: "APPROVE_RESTAURANT_STAGING_ACCOUNT_PREPARATION",
  approvedForHostedMutation: true,
  environment: "staging",
  runId: ACCOUNT_PREPARATION.runId,
  diagnosticCheckpoint: ACCOUNT_PREPARATION.diagnosticCheckpoint,
  operatorCommit: "a".repeat(40),
  planSha256: ACCOUNT_PREPARATION.planSha256,
  supabaseProjectRef: ACCOUNT_PREPARATION.supabaseProjectRef,
  firebaseProjectId: ACCOUNT_PREPARATION.firebaseProjectId,
  restaurantId: ACCOUNT_PREPARATION.restaurantId,
  authorizedActions: ["prepare", "reconcile", "recover"],
  authorizationText: authorityText,
  authorizationTextSha256: sha256(Buffer.from(authorityText)),
  issuedAt: "2026-09-25T00:55:00.000Z",
  expiresAt: "2026-09-25T02:00:00.000Z",
};

const beforeAccess = Object.entries(ACCOUNT_PREPARATION.accounts).map(([qualification, a]) => ({
  profile_id: a.profileId, account_type: "customer", status: qualification === "suspended" ? "revoked" : "active", onboarding_step: "none", restaurant_id: null, restaurant_role: null, admin_role: null, admin_mfa_enrolled_at: null, status_reason_code: qualification === "suspended" ? "Git burdan" : null, created_by_profile_id: null, authz_version: a.beforeVersion, activated_at: "2026-09-15T00:00:00.000Z", suspended_at: null, revoked_at: qualification === "suspended" ? "2026-09-15T01:00:00.000Z" : null, created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z",
}));
const profiles = Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ id: a.profileId, firebase_uid: a.profileId, email: a.email, name: "Synthetic", deletion_pending_at: null, deleted_at: null }));
const reservations = Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ normalized_email: a.email, account_type: "customer", firebase_uid: a.profileId, profile_id: a.profileId, invitation_id: null, created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z" }));
const addresses = [
  { id: "zeQ0xgA79Up5XTNs-i_Dg", profile_id: ACCOUNT_PREPARATION.accounts.pending.profileId, label: "Pending", line1: "Synthetic", block: null, room: null, city: "Test", country: "TRNC", is_default: true, created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z" },
  { id: "7KnWuexTChn4F7o9hMtzH", profile_id: ACCOUNT_PREPARATION.accounts.suspended.profileId, label: "Suspended", line1: "Synthetic", block: null, room: null, city: "Test", country: "TRNC", is_default: true, created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z" },
];
const favorites = [{ profile_id: ACCOUNT_PREPARATION.accounts.suspended.profileId, restaurant_id: "lombard-kitchen", created_at: "2026-09-15T00:00:00.000Z" }];
const preferences = [ACCOUNT_PREPARATION.accounts.pending.profileId, ACCOUNT_PREPARATION.accounts.suspended.profileId].map(profile_id => ({ profile_id, order_status_enabled: true, restaurant_orders_enabled: true, review_replies_enabled: true, created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z" }));

function beforeState(stage = "before") {
  return {
    schemaVersion: 1, stage, runId: ACCOUNT_PREPARATION.runId, projectRef: ACCOUNT_PREPARATION.supabaseProjectRef, restaurantId: ACCOUNT_PREPARATION.restaurantId, planSha256: ACCOUNT_PREPARATION.planSha256, capturedAt: new Date(fixedNow).toISOString(), pendingMigrations: 0, schemaContractValid: true, earningsEnabled: false,
    restaurant: { id: ACCOUNT_PREPARATION.restaurantId, lifecycle_status: "active", is_active: true, accepting_orders: false }, restaurantSha256: ACCOUNT_PREPARATION.restaurantSha256,
    profiles: clone(profiles), access: clone(beforeAccess), reservations: clone(reservations), rowHashes: clone(ACCOUNT_PREPARATION.rowHashes),
    disposable: { addresses: clone(addresses), favorites: clone(favorites), preferences: clone(preferences) },
    identityRelationships: { memberships: 0, platformRoles: 0, orders: 0, reviews: 0, pushTokens: 0, invitations: 0, provisioning: 9, existingAudits: 4 },
    restaurantCounts: clone(ACCOUNT_PREPARATION.protectedCounts), reclassificationAuditCount: 0, recoveryAuditCount: 0,
  };
}
function afterState(stage = "after") {
  const state = beforeState(stage);
  state.access = Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ profile_id: a.profileId, account_type: "restaurant", status: a.status, onboarding_step: a.onboardingStep, restaurant_id: ACCOUNT_PREPARATION.restaurantId, restaurant_role: a.role, authz_version: a.afterVersion, admin_role: null, revoked_at: null }));
  state.reservations = Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ normalized_email: a.email, account_type: "restaurant", firebase_uid: a.profileId, profile_id: a.profileId, invitation_id: null }));
  state.disposable = { addresses: [], favorites: [], preferences: [] }; state.reclassificationAuditCount = 4;
  return state;
}
function recoveredState(stage = "recovered") {
  const state = beforeState(stage);
  state.access = Object.entries(ACCOUNT_PREPARATION.accounts).map(([name, a]) => ({ profile_id: a.profileId, account_type: "customer", status: name === "suspended" ? "revoked" : "active", onboarding_step: "none", restaurant_id: null, restaurant_role: null, authz_version: a.afterVersion + 1 }));
  state.reclassificationAuditCount = 4; state.recoveryAuditCount = 4;
  return state;
}
function firebaseObservation() { return { runId: ACCOUNT_PREPARATION.runId, projectId: ACCOUNT_PREPARATION.firebaseProjectId, capturedAt: new Date(fixedNow).toISOString(), users: Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ email: a.email, uid: a.profileId, disabled: false, emailVerified: true, providers: ["password"] })) }; }
function tempRoot() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-account-preparation-")); const plan = path.join(root, ACCOUNT_PREPARATION.planPath); fs.mkdirSync(path.dirname(plan), { recursive: true }); fs.copyFileSync(path.resolve(ACCOUNT_PREPARATION.planPath), plan); return root; }
function mockProvider(options = {}) {
  let state = clone(options.initial || beforeState()), prepared = false, recovered = false;
  return {
    calls: [],
    async readFirebase() { this.calls.push("firebase"); if (options.firebaseError) throw options.firebaseError; return clone(options.firebase || firebaseObservation()); },
    async readDatabase(stage) { this.calls.push("read:" + stage); if (options.readErrorStage === stage) throw new Error("synthetic read failure"); if (stage === "before") return clone(options.before || state); if (stage === "after" && options.afterOverride) return clone(options.afterOverride); if (stage === "recovered" && options.recoveredOverride) return clone(options.recoveredOverride); return clone(state); },
    async executePreparation(sql) { this.calls.push("prepare"); assert.match(sql, /begin;/); if (options.prepareError) { if (options.applyBeforeError) { state = afterState("reconciliation"); prepared = true; } throw options.prepareError; } state = afterState("after"); prepared = true; return []; },
    async executeRecovery(sql) { this.calls.push("recover"); assert.match(sql, /begin;/); if (options.recoveryError) { if (options.recoverBeforeError) { state = recoveredState("reconciliation"); recovered = true; } throw options.recoveryError; } state = recoveredState("recovered"); recovered = true; return []; },
    get prepared() { return prepared; }, get recovered() { return recovered; },
  };
}
const run = (root, provider, overrides = {}) => runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider, action: "prepare", confirm: `staging:restaurant-account-preparation:prepare:${ACCOUNT_PREPARATION.runId}`, now: () => fixedNow, gitHead: () => authority.operatorCommit, ...overrides });

test("authority contract accepts exact reviewed scope", () => assert.equal(validateAuthority(clone(authority), { now: fixedNow }).runId, ACCOUNT_PREPARATION.runId));
for (const [name, change] of [
  ["wrong project", a => a.supabaseProjectRef = "development"], ["wrong restaurant", a => a.restaurantId = "other"], ["wrong plan", a => a.planSha256 = "0".repeat(64)], ["missing hosted decision", a => a.approvedForHostedMutation = false], ["expired window", a => a.expiresAt = "2026-09-25T00:59:00.000Z"], ["action expansion", a => a.authorizedActions.push("delete")],
]) test("authority rejects " + name, () => { const a = clone(authority); change(a); assert.throws(() => validateAuthority(a, { now: fixedNow })); });

test("accounts file accepts exact four-role schema without returning secrets", () => assert.deepEqual(validateAccountsFile(clone(accounts)), { passed: true, roles: ["pending", "suspended", "owner", "manager"], credentialValuesPersisted: false }));
test("accounts file rejects missing role", () => { const a = clone(accounts); delete a.pending; assert.throws(() => validateAccountsFile(a)); });
test("accounts file rejects extra field", () => { const a = clone(accounts); a.owner.token = "synthetic"; assert.throws(() => validateAccountsFile(a)); });
test("accounts file rejects wrong email", () => { const a = clone(accounts); a.manager.email = "wrong@example.invalid"; assert.throws(() => validateAccountsFile(a)); });
test("accounts file rejects placeholder password", () => { const a = clone(accounts); a.pending.password = "<existing secret>"; assert.throws(() => validateAccountsFile(a)); });
test("accounts path requires exact secure path, mode 0600, and Git exclusion", t => {
  const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, ACCOUNT_PREPARATION.accountsPath); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(accounts), { mode: 0o600 }); fs.chmodSync(file, 0o600);
  assert.deepEqual(validateAccountsFilePath(file, { root, isIgnored: () => true }), accounts);
  fs.chmodSync(file, 0o644); assert.throws(() => validateAccountsFilePath(file, { root, isIgnored: () => true }), /0600/);
  fs.chmodSync(file, 0o600); assert.throws(() => validateAccountsFilePath(file, { root, isIgnored: () => false }), /excluded by Git/);
  assert.throws(() => validateAccountsFilePath(path.join(root, "other.json"), { root, isIgnored: () => true }), /reviewed secure path/);
  const backing = file + ".backing"; fs.renameSync(file, backing); fs.symlinkSync(backing, file); assert.throws(() => validateAccountsFilePath(file, { root, isIgnored: () => true }), /non-symlink/);
});

test("Firebase observation verifies all four exact identities", () => assert.equal(validateFirebaseObservation(firebaseObservation()), true));
test("Firebase disabled identity fails closed", () => { const f = firebaseObservation(); f.users[0].disabled = true; assert.throws(() => validateFirebaseObservation(f)); });
test("Firebase UID mismatch fails closed", () => { const f = firebaseObservation(); f.users[1].uid = "different"; assert.throws(() => validateFirebaseObservation(f)); });
test("Firebase provider mismatch fails closed", () => { const f = firebaseObservation(); f.users[2].providers = ["google.com"]; assert.throws(() => validateFirebaseObservation(f)); });

test("exact before-state passes", () => assert.equal(validateBeforeState(beforeState(), { now: fixedNow }), true));
for (const [name, change] of [
  ["profile hash drift", s => s.rowHashes.profiles[ACCOUNT_PREPARATION.accounts.owner.profileId] = "0".repeat(64)],
  ["access hash drift", s => s.rowHashes.access[ACCOUNT_PREPARATION.accounts.manager.profileId] = "0".repeat(64)],
  ["reservation hash drift", s => s.rowHashes.reservations[ACCOUNT_PREPARATION.accounts.pending.email] = "0".repeat(64)],
  ["disposable hash drift", s => s.rowHashes.disposable["address:zeQ0xgA79Up5XTNs-i_Dg"] = "0".repeat(64)],
  ["unexpected order", s => s.identityRelationships.orders = 1], ["legacy membership", s => s.identityRelationships.memberships = 1], ["admin role overlap", s => s.identityRelationships.platformRoles = 1],
  ["restaurant count drift", s => s.restaurantCounts.orders = 3], ["Earnings enabled", s => s.earningsEnabled = true], ["pending migration", s => s.pendingMigrations = 1], ["schema contract drift", s => s.schemaContractValid = false], ["stale snapshot", s => s.capturedAt = "2026-09-25T00:00:00.000Z"],
]) test("before-state rejects " + name, () => { const s = beforeState(); change(s); assert.throws(() => validateBeforeState(s, { now: fixedNow })); });

test("after-state proves active, pending, suspended, and no legacy authorization", () => assert.equal(validateAfterState(afterState()), true));
test("pending operational activation fails", () => { const s = afterState(); s.access.find(a => a.profile_id === ACCOUNT_PREPARATION.accounts.pending.profileId).status = "active"; assert.throws(() => validateAfterState(s)); });
test("suspended operational activation fails", () => { const s = afterState(); s.access.find(a => a.profile_id === ACCOUNT_PREPARATION.accounts.suspended.profileId).status = "active"; assert.throws(() => validateAfterState(s)); });
test("non-monotonic prepared version fails", () => { const s = afterState(); s.access[0].authz_version = 1; assert.throws(() => validateAfterState(s)); });
test("recovered state requires monotonic versions and retained audit history", () => assert.equal(validateRecoveredState(recoveredState()), true));
test("recovery version rollback fails", () => { const s = recoveredState(); s.access[0].authz_version = 1; assert.throws(() => validateRecoveredState(s)); });

test("preparation SQL encodes one transaction and complete safeguards", () => { const sql = buildPreparationSql("1".repeat(64), "2".repeat(64)); for (const token of ["lock_timeout='5s'", "statement_timeout='30s'", "AUTHORIZATION_OVERLAP", "UNEXPECTED_DEPENDENCY", "RESTAURANT_BOUNDARY", "EARNINGS_BOUNDARY", "INTERNAL_ACCESS_POSTCONDITION", "INTERNAL_AUDIT_POSTCONDITION", "commit;"]) assert.match(sql, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); assert.doesNotMatch(sql, /restaurant_members\s*\(/i); });
test("preparation SQL replaces revoked Customer without UPDATE of account_access", () => { const sql = buildPreparationSql("1".repeat(64), "2".repeat(64)); assert.match(sql, /delete from private\.account_access/); assert.match(sql, /insert into private\.account_access/); assert.doesNotMatch(sql, /update private\.account_access/i); assert.match(sql, /before_version/); assert.match(sql, /after_version/); });
test("recovery SQL is independently scoped and monotonic", () => { const sql = buildRecoverySql(beforeState(), "2".repeat(64)); assert.match(sql, /PREPARED_STATE_REQUIRED/); assert.match(sql, /RECOVERY_TARGET_OCCUPIED/); assert.match(sql, /recovery_version/); assert.match(sql, /reclassification_recovered/); });
test("snapshot SQL remains read-only and captures every protected domain", () => { const sql = buildSnapshotSql("before"); assert.match(sql, /^begin transaction read only;/); for (const name of ["account_access", "account_email_reservations", "restaurant_members", "user_roles", "account_provisioning_operations", "restaurant_earnings_capabilities", "delivered_order_financial_snapshots"]) assert.match(sql, new RegExp(name)); assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i); });

test("complete preparation persists PASS evidence and the reviewed authority without credentials", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const provider = mockProvider(); const result = await run(root, provider); assert.equal(result.disposition, "PASS"); assert.equal(provider.prepared, true); const directory = path.join(root, ACCOUNT_PREPARATION.evidenceRoot); const evidence = JSON.parse(fs.readFileSync(path.join(directory, "preparation-result.json"))); assert.equal(evidence.credentialsPersisted, false); assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "preparation-authority.json"))).authorizationTextSha256, authority.authorizationTextSha256); assert.doesNotMatch(fs.readdirSync(directory).map(file => fs.readFileSync(path.join(directory, file), "utf8")).join("\n"), /Synthetic-local-only-password/); });
test("duplicate invocation is prohibited before a second mutation", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); await run(root, mockProvider()); await assert.rejects(() => run(root, mockProvider()), /already exists/); });
test("lock failure rolls back or rejects and reconciles to BEFORE", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const error = Object.assign(new Error("lock unavailable"), { code: "55P03" }); const result = await run(root, mockProvider({ prepareError: error })); assert.equal(result.disposition, "FAIL"); assert.equal(result.reconciliation.classification, "BEFORE"); });
test("SQL exception preserves before-state", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const result = await run(root, mockProvider({ prepareError: Object.assign(new Error("assertion"), { code: "P0001" }) })); assert.equal(result.transactionOutcome, "rolled_back_or_rejected"); assert.equal(result.reconciliation.classification, "BEFORE"); });
test("uncertain response after commit is BLOCKED but reconciles AFTER", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const error = Object.assign(new Error("network lost"), { code: "UNCERTAIN_RESPONSE" }); const result = await run(root, mockProvider({ prepareError: error, applyBeforeError: true })); assert.equal(result.disposition, "BLOCKED"); assert.equal(result.reconciliation.classification, "AFTER"); });
test("uncertain response before commit is BLOCKED and reconciles BEFORE", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const error = Object.assign(new Error("network lost"), { code: "UNCERTAIN_RESPONSE" }); const result = await run(root, mockProvider({ prepareError: error })); assert.equal(result.disposition, "BLOCKED"); assert.equal(result.reconciliation.classification, "BEFORE"); });
test("post-commit mismatch fails without claiming PASS", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const bad = afterState(); bad.restaurantCounts.orders = 99; const result = await run(root, mockProvider({ afterOverride: bad })); assert.equal(result.disposition, "FAIL"); });
test("snapshot interruption leaves exclusive attempt marker and no mutation", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const io = Object.create(fs); const original = fs.writeFileSync.bind(fs); io.writeFileSync = (file, ...args) => { if (String(file).includes("before-state.json")) throw new Error("synthetic interruption"); return original(file, ...args); }; const provider = mockProvider(); const result = await run(root, provider, { io }); assert.equal(result.disposition, "FAIL"); assert.equal(provider.prepared, false); assert.equal(fs.existsSync(path.join(root, ACCOUNT_PREPARATION.evidenceRoot, "preparation-attempt.json")), true); });
test("database read failure preserves the completed Firebase observation without credentials", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const result = await run(root, mockProvider({ readErrorStage: "before" })); assert.equal(result.disposition, "FAIL"); const progress = fs.readFileSync(path.join(root, ACCOUNT_PREPARATION.evidenceRoot, "preflight-progress.json"), "utf8"); assert.match(progress, /firebase_observed/); assert.doesNotMatch(progress, /Synthetic-local-only-password/); });

test("explicit read-only reconciliation classifies prepared state in separate evidence", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const post = path.join(root, ACCOUNT_PREPARATION.evidenceRoot, "postcondition-report.json"); fs.mkdirSync(path.dirname(post), { recursive: true }); fs.writeFileSync(post, "protected-postcondition\n"); const result = await runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider: mockProvider({ initial: afterState("reconciliation") }), action: "reconcile", confirm: `staging:restaurant-account-preparation:reconcile:${ACCOUNT_PREPARATION.runId}`, now: () => fixedNow, gitHead: () => authority.operatorCommit }); assert.equal(result.disposition, "PASS"); assert.equal(result.classification, "AFTER"); assert.equal(fs.readFileSync(post, "utf8"), "protected-postcondition\n"); assert.equal(fs.existsSync(path.join(root, ACCOUNT_PREPARATION.evidenceRoot, "reconciliation-result.json")), true); });
test("partial reconciliation remains BLOCKED", async t => { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const partial = afterState("reconciliation"); partial.access.pop(); const result = await runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider: mockProvider({ initial: partial }), action: "reconcile", confirm: `staging:restaurant-account-preparation:reconcile:${ACCOUNT_PREPARATION.runId}`, now: () => fixedNow, gitHead: () => authority.operatorCommit }); assert.equal(result.disposition, "BLOCKED"); });

async function preparedRoot(t, provider = mockProvider()) { const root = tempRoot(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); await run(root, provider); return root; }
test("complete independent recovery passes", async t => { const provider = mockProvider(); const root = await preparedRoot(t, provider); const authHash = sha256(Buffer.from(JSON.stringify(authority, null, 2) + "\n")); const result = await runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider, action: "recover", confirm: `staging:restaurant-account-preparation:recover:${ACCOUNT_PREPARATION.runId}:${authHash}`, now: () => fixedNow, gitHead: () => authority.operatorCommit }); assert.equal(result.disposition, "PASS"); assert.equal(provider.recovered, true); });
test("recovery requires exact independent confirmation", async t => { const provider = mockProvider(); const root = await preparedRoot(t, provider); await assert.rejects(() => runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider, action: "recover", confirm: "wrong", now: () => fixedNow, gitHead: () => authority.operatorCommit }), /confirmation/); });
test("uncertain recovery reconciled as recovered may pass", async t => { const provider = mockProvider({ recoveryError: Object.assign(new Error("lost"), { code: "UNCERTAIN_RESPONSE" }), recoverBeforeError: true }); const root = await preparedRoot(t, provider); const authHash = sha256(Buffer.from(JSON.stringify(authority, null, 2) + "\n")); const result = await runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider, action: "recover", confirm: `staging:restaurant-account-preparation:recover:${ACCOUNT_PREPARATION.runId}:${authHash}`, now: () => fixedNow, gitHead: () => authority.operatorCommit }); assert.equal(result.disposition, "PASS"); assert.equal(result.reconciliation.classification, "RECOVERED"); });
test("failed recovery with prepared state remains BLOCKED", async t => { const provider = mockProvider({ recoveryError: new Error("rollback") }); const root = await preparedRoot(t, provider); const authHash = sha256(Buffer.from(JSON.stringify(authority, null, 2) + "\n")); const result = await runPreparation({ root, authority: clone(authority), accounts: clone(accounts), provider, action: "recover", confirm: `staging:restaurant-account-preparation:recover:${ACCOUNT_PREPARATION.runId}:${authHash}`, now: () => fixedNow, gitHead: () => authority.operatorCommit }); assert.equal(result.disposition, "BLOCKED"); assert.equal(result.reconciliation.classification, "AFTER"); });

test("exclusive atomic write survives interrupted temporary write", t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-evidence-")); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const file = path.join(root, "evidence.json"); atomicWriteExclusive(file, { passed: true }); assert.throws(() => atomicWriteExclusive(file, { passed: false }), /already exists/); assert.equal(JSON.parse(fs.readFileSync(file)).passed, true); });
test("state classifier distinguishes before, after, recovered, and partial", () => { assert.equal(classifyState(beforeState()), "BEFORE"); assert.equal(classifyState(afterState()), "AFTER"); assert.equal(classifyState(recoveredState()), "RECOVERED"); const partial = afterState(); partial.access.pop(); assert.equal(classifyState(partial), "PARTIAL_OR_UNKNOWN"); });
