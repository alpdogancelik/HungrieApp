#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const freeze = value => Object.freeze(value);
export const ACCOUNT_PREPARATION = freeze({
  contractVersion: 1,
  runId: "ruip6ad_20260925a",
  diagnosticCheckpoint: "c3180f019de93fae99341628577a9553faad60f7",
  planPath: "docs/restaurant-staging-four-account-preparation-plan.md",
  planSha256: "eacfb9adcb01e40c778f7a0d4ec49af31c23466d2088ab0a69a73931f4f506fa",
  supabaseProjectRef: "rlrfvqskzvpysewdxqcr",
  firebaseProjectId: "hungrieapp-a2288",
  restaurantId: "598eacea-dd2a-4549-a198-40593f7fab06",
  restaurantSha256: "f6e905eca20a2f298d1631525b693d081499ffae2baeb9366edf86611d82e510",
  freshnessMs: 15 * 60_000,
  evidenceRoot: "secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-account-preparation",
  accountsPath: "secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json",
  accounts: freeze({
    owner: freeze({ email: "gabava5260@jobscai.com", profileId: "oupm6g6CyzRgY3RjOU3BkpCGmRh1", beforeVersion: 1, afterVersion: 2, status: "active", onboardingStep: "none", role: "owner" }),
    manager: freeze({ email: "nenof71463@meonvr.com", profileId: "6ePlV6emcjZEpqi5jsQTF7chiq83", beforeVersion: 1, afterVersion: 2, status: "active", onboardingStep: "none", role: "manager" }),
    pending: freeze({ email: "setovot129@meonvr.com", profileId: "v9kzlLATn9fQxJ6oPTUjxTDj8MJ3", beforeVersion: 1, afterVersion: 2, status: "pending", onboardingStep: "restaurant_approval_required", role: "manager" }),
    suspended: freeze({ email: "gejap71504@meonvr.com", profileId: "TBaq9HQIL9OBwLFP3MKchi3rpSA2", beforeVersion: 6, afterVersion: 7, status: "suspended", onboardingStep: "none", role: "manager" }),
  }),
  rowHashes: freeze({
    profiles: freeze({
      oupm6g6CyzRgY3RjOU3BkpCGmRh1: "ff6bb9c2000ccf7da9691867f31b9089cff1e2aed7098c5087309586455a4e54",
      "6ePlV6emcjZEpqi5jsQTF7chiq83": "727e65f8317d4d8087f71366f78c7522d2f3bee227ea27bc091226a6873f4463",
      v9kzlLATn9fQxJ6oPTUjxTDj8MJ3: "c8f2b29c81ab8e99e2c7795c40251852508fc1269baa110afc44b586cc93112c",
      TBaq9HQIL9OBwLFP3MKchi3rpSA2: "04d49c9d7bec88e48e394068c8578ad7ceceac944774716ad06d96b8cbdccd18",
    }),
    access: freeze({
      oupm6g6CyzRgY3RjOU3BkpCGmRh1: "e717e611668fcb9dd26dfe4fe26a7e9b7904ecba5a04b5fca510d6082fad33d9",
      "6ePlV6emcjZEpqi5jsQTF7chiq83": "81ec67068ec79e362553a8a8459e9cdf20cf6074cc250894b69860bae5d0e453",
      v9kzlLATn9fQxJ6oPTUjxTDj8MJ3: "810f4f8cac61998ab631e2c2b27df1e1ce9e09f86ed19961614164724bad3c44",
      TBaq9HQIL9OBwLFP3MKchi3rpSA2: "0d874a4cbeac30f7c1d758d2985e1e3214424fdd5998d835a6ca0dfdc727cc82",
    }),
    reservations: freeze({
      "gabava5260@jobscai.com": "44883cfcda97fb00192ecb55e5541c50fced8e7e92eca9b856cad4b857a6a065",
      "nenof71463@meonvr.com": "be157a7f6c8ee1f691fb7fbeec6d0667a9a5aad4b2a4d231ea0ec56f2e31858d",
      "setovot129@meonvr.com": "75561ab64392401501f9b4f989c8b143d03fa36918d902a3968f29a1e0dab980",
      "gejap71504@meonvr.com": "758d2e5fb6674467738b8f24e32b8c6b13e10e3308f9f7ddf35ccdbd81a5f435",
    }),
    disposable: freeze({
      "address:zeQ0xgA79Up5XTNs-i_Dg": "18797d697c2d65f78f8ff1896558a52883b37024da3e5ee0b98fcb6f8e169d14",
      "address:7KnWuexTChn4F7o9hMtzH": "61c2e3cbf0dad5c21cdf730fb11a0256ed7c481ac5d89a030ea446c3d6663be6",
      "favorite:TBaq9HQIL9OBwLFP3MKchi3rpSA2:lombard-kitchen": "72061ca9c65e987146159d3b0a874069ab36a5d14d7bb9be97c0356e33b4628d",
      "preference:v9kzlLATn9fQxJ6oPTUjxTDj8MJ3": "8f77d926f7cd5d7a5437e88bb8546bdee9abd244479f6f28417cf73faf245de4",
      "preference:TBaq9HQIL9OBwLFP3MKchi3rpSA2": "8b1a0b25a0f6f0cbcb22a996f83872a2c5fce04ca13ac5cf794dc6ea328ef976",
    }),
  }),
  protectedCounts: freeze({ existingAccessAccounts: 2, orders: 2, activeOrders: 0, invitations: 4, incidents: 1, commissionRules: 1, reviews: 0, menuRows: 0, pushTokens: 0, commissionTerms: 0, financialSnapshots: 0, financialAlerts: 0 }),
});

const canonical = value => JSON.stringify(value, null, 2) + "\n";
export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const exactKeys = (value, expected, label) => {
  if (JSON.stringify(Object.keys(value || {}).sort()) !== JSON.stringify([...expected].sort())) throw new Error(label + " fields differ from the reviewed contract.");
};
const required = (value, label) => {
  if (typeof value !== "string" || !value.trim() || /<[^>]+>|placeholder|replace[_ -]?me|todo/i.test(value)) throw new Error(label + " is missing or contains a placeholder.");
  return value;
};
const sanitizeError = error => ({ name: String(error?.name || "Error").slice(0, 80), code: String(error?.code || "UNCLASSIFIED").slice(0, 80), message: String(error?.message || error || "Unknown failure").replace(/(bearer|password|token|cookie|authorization)\s*[:=]?\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 500) });

export function atomicWriteExclusive(file, value, io = fs) {
  io.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  io.chmodSync(path.dirname(file), 0o700);
  if (io.existsSync(file)) throw new Error("Exclusive evidence already exists: " + path.basename(file));
  const temporary = file + "." + process.pid + ".tmp";
  try {
    io.writeFileSync(temporary, Buffer.isBuffer(value) ? value : canonical(value), { mode: 0o600, flag: "wx" });
    io.renameSync(temporary, file);
    io.chmodSync(file, 0o600);
  } catch (error) {
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch {}
    throw error;
  }
}

export function atomicReplace(file, value, io = fs) {
  io.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  io.chmodSync(path.dirname(file), 0o700);
  const temporary = file + "." + process.pid + ".tmp";
  io.writeFileSync(temporary, Buffer.isBuffer(value) ? value : canonical(value), { mode: 0o600 });
  io.renameSync(temporary, file);
  io.chmodSync(file, 0o600);
}

export function validateAuthority(authority, { now = Date.now() } = {}) {
  const fields = ["contractVersion", "decision", "approvedForHostedMutation", "environment", "runId", "diagnosticCheckpoint", "operatorCommit", "planSha256", "supabaseProjectRef", "firebaseProjectId", "restaurantId", "authorizedActions", "authorizationText", "authorizationTextSha256", "issuedAt", "expiresAt"];
  exactKeys(authority, fields, "Preparation authority");
  if (authority.contractVersion !== 1 || authority.decision !== "APPROVE_RESTAURANT_STAGING_ACCOUNT_PREPARATION" || authority.approvedForHostedMutation !== true || authority.environment !== "staging") throw new Error("Explicit Staging account-preparation authority is required.");
  if (authority.runId !== ACCOUNT_PREPARATION.runId || authority.diagnosticCheckpoint !== ACCOUNT_PREPARATION.diagnosticCheckpoint || authority.planSha256 !== ACCOUNT_PREPARATION.planSha256 || authority.supabaseProjectRef !== ACCOUNT_PREPARATION.supabaseProjectRef || authority.firebaseProjectId !== ACCOUNT_PREPARATION.firebaseProjectId || authority.restaurantId !== ACCOUNT_PREPARATION.restaurantId) throw new Error("Preparation authority identity mismatch.");
  if (!/^[a-f0-9]{40}$/.test(authority.operatorCommit || "")) throw new Error("Audited operator commit is required.");
  if (JSON.stringify(authority.authorizedActions) !== JSON.stringify(["prepare", "reconcile", "recover"])) throw new Error("Preparation authority action scope mismatch.");
  required(authority.authorizationText, "Authorization text");
  if (authority.authorizationTextSha256 !== sha256(Buffer.from(authority.authorizationText))) throw new Error("Authorization text digest mismatch.");
  if (!/authorize/i.test(authority.authorizationText) || !/staging/i.test(authority.authorizationText) || !/recovery/i.test(authority.authorizationText) || !/firebase.+read.only/i.test(authority.authorizationText)) throw new Error("Authorization text lacks required boundaries.");
  const issued = Date.parse(authority.issuedAt), expires = Date.parse(authority.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now || expires - issued > 24 * 60 * 60_000) throw new Error("Preparation authority window is invalid.");
  return authority;
}

export function validateAccountsFile(accounts) {
  const names = ["pending", "suspended", "owner", "manager"];
  exactKeys(accounts, names, "Accounts file");
  for (const name of names) {
    exactKeys(accounts[name], ["email", "password"], name + " account");
    if (accounts[name].email !== ACCOUNT_PREPARATION.accounts[name].email) throw new Error(name + " account email mismatch.");
    required(accounts[name].password, name + " password");
  }
  return { passed: true, roles: names, credentialValuesPersisted: false };
}

export function validateAccountsFilePath(file, { root, io = fs, isIgnored } = {}) {
  const expected = path.resolve(root, ACCOUNT_PREPARATION.accountsPath);
  const actual = path.resolve(file);
  if (actual !== expected) throw new Error("Accounts file path differs from the reviewed secure path.");
  const stat = io.lstatSync(actual);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("Accounts file must be a non-symlink regular mode-0600 file.");
  const ignored = isIgnored ? isIgnored(actual) : (() => {
    try { execFileSync("git", ["check-ignore", "--quiet", "--", actual], { cwd: root }); return true; } catch { return false; }
  })();
  if (!ignored) throw new Error("Accounts file must be excluded by Git.");
  const parsed = JSON.parse(io.readFileSync(actual, "utf8"));
  validateAccountsFile(parsed);
  return parsed;
}

const expectedAccountList = () => Object.entries(ACCOUNT_PREPARATION.accounts).map(([qualification, value]) => ({ qualification, ...value }));
const by = (values, field) => new Map((values || []).map(value => [value[field], value]));
const assertHashMap = (actual, expected, label) => {
  exactKeys(actual, Object.keys(expected), label);
  for (const [key, digest] of Object.entries(expected)) if (actual[key] !== digest) throw new Error(label + " hash mismatch: " + key);
};

export function validateFirebaseObservation(observation) {
  if (observation.projectId !== ACCOUNT_PREPARATION.firebaseProjectId || observation.runId !== ACCOUNT_PREPARATION.runId || !Number.isFinite(Date.parse(observation.capturedAt))) throw new Error("Firebase observation binding mismatch.");
  const users = by(observation.users, "email");
  if (users.size !== 4) throw new Error("Exactly four Firebase users are required.");
  for (const expected of expectedAccountList()) {
    const user = users.get(expected.email);
    if (!user || user.uid !== expected.profileId || user.disabled !== false || user.emailVerified !== true || JSON.stringify(user.providers) !== JSON.stringify(["password"])) throw new Error("Firebase identity mismatch: " + expected.qualification);
  }
  return true;
}

export function validateBeforeState(snapshot, { now = Date.now() } = {}) {
  if (snapshot.schemaVersion !== 1 || !["before", "reconciliation"].includes(snapshot.stage) || snapshot.runId !== ACCOUNT_PREPARATION.runId || snapshot.projectRef !== ACCOUNT_PREPARATION.supabaseProjectRef || snapshot.restaurantId !== ACCOUNT_PREPARATION.restaurantId || snapshot.planSha256 !== ACCOUNT_PREPARATION.planSha256) throw new Error("Before-state binding mismatch.");
  const captured = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(captured) || captured > now || now - captured > ACCOUNT_PREPARATION.freshnessMs) throw new Error("Before-state snapshot is stale or future-dated.");
  if (snapshot.earningsEnabled !== false) throw new Error("Earnings must remain disabled.");
  if (snapshot.pendingMigrations !== 0) throw new Error("Zero pending migrations required.");
  if (snapshot.schemaContractValid !== true) throw new Error("Required account schema/trigger contract mismatch.");
  if (snapshot.restaurant?.id !== ACCOUNT_PREPARATION.restaurantId || snapshot.restaurant.lifecycle_status !== "active" || snapshot.restaurant.is_active !== true || snapshot.restaurant.accepting_orders !== false || snapshot.restaurantSha256 !== ACCOUNT_PREPARATION.restaurantSha256) throw new Error("Selected Restaurant before-state mismatch.");
  assertHashMap(snapshot.rowHashes?.profiles, ACCOUNT_PREPARATION.rowHashes.profiles, "Profile");
  assertHashMap(snapshot.rowHashes?.access, ACCOUNT_PREPARATION.rowHashes.access, "Access");
  assertHashMap(snapshot.rowHashes?.reservations, ACCOUNT_PREPARATION.rowHashes.reservations, "Reservation");
  assertHashMap(snapshot.rowHashes?.disposable, ACCOUNT_PREPARATION.rowHashes.disposable, "Disposable");
  exactKeys(snapshot.restaurantCounts, Object.keys(ACCOUNT_PREPARATION.protectedCounts), "Restaurant counts");
  for (const [name, count] of Object.entries(ACCOUNT_PREPARATION.protectedCounts)) if (snapshot.restaurantCounts[name] !== count) throw new Error("Restaurant relationship count mismatch: " + name);
  const profiles = by(snapshot.profiles, "id"), access = by(snapshot.access, "profile_id"), reservations = by(snapshot.reservations, "normalized_email");
  if (profiles.size !== 4 || access.size !== 4 || reservations.size !== 4) throw new Error("Exactly four profile/access/reservation rows required.");
  for (const expected of expectedAccountList()) {
    const profile = profiles.get(expected.profileId), row = access.get(expected.profileId), reservation = reservations.get(expected.email);
    if (!profile || profile.firebase_uid !== expected.profileId || String(profile.email).trim().toLowerCase() !== expected.email || profile.deletion_pending_at != null || profile.deleted_at != null) throw new Error("Profile mismatch: " + expected.qualification);
    const expectedStatus = expected.qualification === "suspended" ? "revoked" : "active";
    if (!row || row.account_type !== "customer" || row.status !== expectedStatus || row.onboarding_step !== "none" || row.restaurant_id != null || row.restaurant_role != null || row.authz_version !== expected.beforeVersion) throw new Error("Access before-state mismatch: " + expected.qualification);
    if (!reservation || reservation.account_type !== "customer" || reservation.firebase_uid !== expected.profileId || reservation.profile_id !== expected.profileId || reservation.invitation_id != null) throw new Error("Reservation mismatch: " + expected.qualification);
  }
  const relationships = snapshot.identityRelationships;
  if (!relationships || relationships.memberships !== 0 || relationships.platformRoles !== 0 || relationships.orders !== 0 || relationships.reviews !== 0 || relationships.pushTokens !== 0 || relationships.invitations !== 0 || relationships.provisioning !== 9 || relationships.existingAudits !== 4) throw new Error("Identity relationship boundary mismatch.");
  if (snapshot.disposable?.addresses?.length !== 2 || snapshot.disposable?.favorites?.length !== 1 || snapshot.disposable?.preferences?.length !== 2) throw new Error("Exact disposable row set required.");
  return true;
}

export function classifyState(snapshot) {
  try { validateBeforeState(snapshot, { now: Date.parse(snapshot.capturedAt) }); return "BEFORE"; } catch {}
  try { validateAfterState(snapshot); return "AFTER"; } catch {}
  try { validateRecoveredState(snapshot); return "RECOVERED"; } catch {}
  return "PARTIAL_OR_UNKNOWN";
}

export function validateAfterState(snapshot) {
  if (snapshot.schemaVersion !== 1 || !["after", "reconciliation"].includes(snapshot.stage) || snapshot.runId !== ACCOUNT_PREPARATION.runId || snapshot.projectRef !== ACCOUNT_PREPARATION.supabaseProjectRef || snapshot.restaurantId !== ACCOUNT_PREPARATION.restaurantId) throw new Error("After-state binding mismatch.");
  if (snapshot.earningsEnabled !== false || snapshot.restaurantSha256 !== ACCOUNT_PREPARATION.restaurantSha256) throw new Error("Protected Restaurant or capability changed.");
  const access = by(snapshot.access, "profile_id"), reservations = by(snapshot.reservations, "normalized_email");
  if (access.size !== 4 || reservations.size !== 4) throw new Error("After-state row cardinality mismatch.");
  for (const expected of expectedAccountList()) {
    const row = access.get(expected.profileId), reservation = reservations.get(expected.email);
    if (!row || row.account_type !== "restaurant" || row.status !== expected.status || row.onboarding_step !== expected.onboardingStep || row.restaurant_id !== ACCOUNT_PREPARATION.restaurantId || row.restaurant_role !== expected.role || row.authz_version !== expected.afterVersion || row.revoked_at != null) throw new Error("Prepared access mismatch: " + expected.qualification);
    if (!reservation || reservation.account_type !== "restaurant" || reservation.firebase_uid !== expected.profileId || reservation.profile_id !== expected.profileId || reservation.invitation_id != null) throw new Error("Prepared reservation mismatch: " + expected.qualification);
  }
  if (snapshot.identityRelationships?.memberships !== 0 || snapshot.identityRelationships?.platformRoles !== 0 || snapshot.identityRelationships?.orders !== 0 || snapshot.identityRelationships?.reviews !== 0 || snapshot.identityRelationships?.pushTokens !== 0 || snapshot.identityRelationships?.invitations !== 0 || snapshot.identityRelationships?.provisioning !== 9 || snapshot.identityRelationships?.existingAudits !== 4) throw new Error("Historical or authorization relationships changed.");
  if (snapshot.disposable?.addresses?.length !== 0 || snapshot.disposable?.favorites?.length !== 0 || snapshot.disposable?.preferences?.length !== 0) throw new Error("Disposable rows remain after preparation.");
  exactKeys(snapshot.restaurantCounts, Object.keys(ACCOUNT_PREPARATION.protectedCounts), "Prepared Restaurant counts");
  if (snapshot.reclassificationAuditCount !== 4 || Object.entries(ACCOUNT_PREPARATION.protectedCounts).some(([name, count]) => snapshot.restaurantCounts[name] !== count)) throw new Error("Audit or Restaurant boundary mismatch.");
  return true;
}

export function validateRecoveredState(snapshot) {
  if (snapshot.schemaVersion !== 1 || !["recovered", "reconciliation"].includes(snapshot.stage) || snapshot.runId !== ACCOUNT_PREPARATION.runId || snapshot.restaurantSha256 !== ACCOUNT_PREPARATION.restaurantSha256 || snapshot.earningsEnabled !== false) throw new Error("Recovered-state binding mismatch.");
  const access = by(snapshot.access, "profile_id"), reservations = by(snapshot.reservations, "normalized_email");
  for (const expected of expectedAccountList()) {
    const row = access.get(expected.profileId), reservation = reservations.get(expected.email);
    const originalStatus = expected.qualification === "suspended" ? "revoked" : "active";
    if (!row || row.account_type !== "customer" || row.status !== originalStatus || row.authz_version !== expected.afterVersion + 1 || row.restaurant_id != null || row.restaurant_role != null) throw new Error("Recovered access mismatch: " + expected.qualification);
    if (!reservation || reservation.account_type !== "customer" || reservation.firebase_uid !== expected.profileId || reservation.profile_id !== expected.profileId) throw new Error("Recovered reservation mismatch: " + expected.qualification);
  }
  if (snapshot.disposable?.addresses?.length !== 2 || snapshot.disposable?.favorites?.length !== 1 || snapshot.disposable?.preferences?.length !== 2 || snapshot.reclassificationAuditCount !== 4 || snapshot.recoveryAuditCount !== 4) throw new Error("Recovery rows or audit history mismatch.");
  exactKeys(snapshot.restaurantCounts, Object.keys(ACCOUNT_PREPARATION.protectedCounts), "Recovered Restaurant counts");
  if (Object.entries(ACCOUNT_PREPARATION.protectedCounts).some(([name, count]) => snapshot.restaurantCounts[name] !== count)) throw new Error("Restaurant relationships changed during recovery.");
  return true;
}

const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const ids = () => Object.values(ACCOUNT_PREPARATION.accounts).map(value => q(value.profileId)).join(",");
const emails = () => Object.values(ACCOUNT_PREPARATION.accounts).map(value => q(value.email)).join(",");

export function buildPreparationSql(snapshotSha256, authoritySha256) {
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256) || !/^[a-f0-9]{64}$/.test(authoritySha256)) throw new Error("Reviewed snapshot and authority digests required.");
  const values = expectedAccountList().map(a => `(${q(a.profileId)},${q(a.email)},${q(a.status)}::private.account_status,${q(a.onboardingStep)}::private.account_onboarding_step,${q(a.role)}::public.restaurant_role,${a.beforeVersion}::bigint,${a.afterVersion}::bigint)`).join(",\n");
  return `begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('hungrie:${ACCOUNT_PREPARATION.runId}:restaurant-account-preparation',0));
create temporary table expected_accounts(profile_id,email,status,onboarding_step,restaurant_role,before_version,after_version) on commit drop as values
${values};
create temporary table expected_hashes(kind,identity,digest) on commit drop as values
${Object.entries(ACCOUNT_PREPARATION.rowHashes.profiles).map(([identity,digest]) => `('profile',${q(identity)},${q(digest)})`).join(",")},
${Object.entries(ACCOUNT_PREPARATION.rowHashes.access).map(([identity,digest]) => `('access',${q(identity)},${q(digest)})`).join(",")},
${Object.entries(ACCOUNT_PREPARATION.rowHashes.reservations).map(([identity,digest]) => `('reservation',${q(identity)},${q(digest)})`).join(",")},
${Object.entries(ACCOUNT_PREPARATION.rowHashes.disposable).map(([identity,digest]) => `('disposable',${q(identity)},${q(digest)})`).join(",")},
('restaurant',${q(ACCOUNT_PREPARATION.restaurantId)},${q(ACCOUNT_PREPARATION.restaurantSha256)});
select id from public.restaurants where id=${q(ACCOUNT_PREPARATION.restaurantId)} for update;
select id from public.profiles where id in(${ids()}) order by id for update;
select profile_id from private.account_access where profile_id in(${ids()}) order by profile_id for update;
select normalized_email from private.account_email_reservations where normalized_email in(${emails()}) order by normalized_email for update;
select id from public.addresses where id in('zeQ0xgA79Up5XTNs-i_Dg','7KnWuexTChn4F7o9hMtzH') order by id for update;
select profile_id,restaurant_id from public.favorites where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen' for update;
select profile_id from private.notification_preferences where profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2') order by profile_id for update;
create temporary table before_access on commit drop as select * from private.account_access where profile_id in(${ids()});
do $prepare$ declare n integer; begin
 if (select count(*) from public.profiles p join expected_accounts e on e.profile_id=p.id and e.profile_id=p.firebase_uid and e.email=lower(btrim(p.email)) where p.deletion_pending_at is null and p.deleted_at is null)<>4 then raise exception 'PROFILE_BOUNDARY'; end if;
 if (select count(*) from before_access b join expected_accounts e using(profile_id) where b.account_type='customer' and b.status=case when e.status='suspended' then 'revoked'::private.account_status else 'active'::private.account_status end and b.onboarding_step='none' and b.restaurant_id is null and b.restaurant_role is null and b.authz_version=e.before_version)<>4 then raise exception 'ACCESS_BOUNDARY'; end if;
 if (select count(*) from private.account_email_reservations r join expected_accounts e on e.email=r.normalized_email and e.profile_id=r.profile_id and e.profile_id=r.firebase_uid where r.account_type='customer' and r.invitation_id is null)<>4 then raise exception 'RESERVATION_BOUNDARY'; end if;
 if (select count(*) from public.profiles p join expected_hashes h on h.kind='profile' and h.identity=p.id and h.digest=encode(extensions.digest(to_jsonb(p)::text,'sha256'),'hex'))<>4 then raise exception 'PROFILE_HASH_BOUNDARY'; end if;
 if (select count(*) from before_access a join expected_hashes h on h.kind='access' and h.identity=a.profile_id and h.digest=encode(extensions.digest(to_jsonb(a)::text,'sha256'),'hex'))<>4 then raise exception 'ACCESS_HASH_BOUNDARY'; end if;
 if (select count(*) from private.account_email_reservations r join expected_hashes h on h.kind='reservation' and h.identity=r.normalized_email and h.digest=encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex'))<>4 then raise exception 'RESERVATION_HASH_BOUNDARY'; end if;
 if not exists(select 1 from public.addresses d join expected_hashes h on h.kind='disposable' and h.identity='address:'||d.id and h.digest=encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex') where d.id='zeQ0xgA79Up5XTNs-i_Dg') or not exists(select 1 from public.addresses d join expected_hashes h on h.kind='disposable' and h.identity='address:'||d.id and h.digest=encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex') where d.id='7KnWuexTChn4F7o9hMtzH') or not exists(select 1 from public.favorites f join expected_hashes h on h.kind='disposable' and h.identity='favorite:'||f.profile_id||':'||f.restaurant_id and h.digest=encode(extensions.digest(to_jsonb(f)::text,'sha256'),'hex') where f.profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and f.restaurant_id='lombard-kitchen') or (select count(*) from private.notification_preferences pref join expected_hashes h on h.kind='disposable' and h.identity='preference:'||pref.profile_id and h.digest=encode(extensions.digest(to_jsonb(pref)::text,'sha256'),'hex') where pref.profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2'))<>2 then raise exception 'DISPOSABLE_HASH_BOUNDARY'; end if;
 if exists(select 1 from private.restaurant_members where profile_id in(${ids()})) or exists(select 1 from private.user_roles where profile_id in(${ids()})) then raise exception 'AUTHORIZATION_OVERLAP'; end if;
 if exists(select 1 from public.orders where profile_id in(${ids()}) or courier_profile_id in(${ids()})) or exists(select 1 from public.order_reviews where profile_id in(${ids()})) or exists(select 1 from public.product_reviews where profile_id in(${ids()})) or exists(select 1 from private.push_tokens where profile_id in(${ids()})) then raise exception 'UNEXPECTED_DEPENDENCY'; end if;
 if (select count(*) from private.account_provisioning_operations where target_profile_id in(${ids()}))<>9 or (select count(*) from private.audit_log where actor_profile_id in(${ids()}))<>4 or (select count(*) from private.account_invitations where normalized_email in(${emails()}))<>0 then raise exception 'HISTORY_BOUNDARY'; end if;
 if (select count(*) from public.addresses where (id,profile_id) in(('zeQ0xgA79Up5XTNs-i_Dg','v9kzlLATn9fQxJ6oPTUjxTDj8MJ3'),('7KnWuexTChn4F7o9hMtzH','TBaq9HQIL9OBwLFP3MKchi3rpSA2')))<>2 or (select count(*) from public.favorites where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen')<>1 or (select count(*) from private.notification_preferences where profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2'))<>2 then raise exception 'DISPOSABLE_BOUNDARY'; end if;
 if not exists(select 1 from public.restaurants r join expected_hashes h on h.kind='restaurant' and h.identity=r.id and h.digest=encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') where r.id=${q(ACCOUNT_PREPARATION.restaurantId)} and r.lifecycle_status='active' and r.is_active and not r.accepting_orders) then raise exception 'RESTAURANT_BOUNDARY'; end if;
 if (select count(*) from private.account_access where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and profile_id not in(${ids()}))<>2 or (select count(*) from public.orders where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>2 or (select count(*) from public.orders where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and status not in('delivered','canceled'))<>0 or (select count(*) from private.account_invitations where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>4 or (select count(*) from private.restaurant_operational_incidents where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>1 or (select count(*) from private.restaurant_commission_rules where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>1 or (select count(*) from public.order_reviews where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.product_reviews where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from public.categories where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_items where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_item_ingredients where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_option_groups where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_option_values where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.push_tokens where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.order_commission_terms where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.delivered_order_financial_snapshots where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.restaurant_financial_integrity_alerts where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 then raise exception 'RESTAURANT_RELATIONSHIP_BOUNDARY'; end if;
 if not exists(select 1 from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1' and enabled=false) then raise exception 'EARNINGS_BOUNDARY'; end if;
 delete from public.addresses where (id,profile_id) in(('zeQ0xgA79Up5XTNs-i_Dg','v9kzlLATn9fQxJ6oPTUjxTDj8MJ3'),('7KnWuexTChn4F7o9hMtzH','TBaq9HQIL9OBwLFP3MKchi3rpSA2')); get diagnostics n=row_count; if n<>2 then raise exception 'ADDRESS_COUNT'; end if;
 delete from public.favorites where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen'; get diagnostics n=row_count; if n<>1 then raise exception 'FAVORITE_COUNT'; end if;
 delete from private.notification_preferences where profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2'); get diagnostics n=row_count; if n<>2 then raise exception 'PREFERENCE_COUNT'; end if;
 update private.account_email_reservations set account_type='restaurant',updated_at=transaction_timestamp() where normalized_email in(${emails()}) and account_type='customer' and invitation_id is null; get diagnostics n=row_count; if n<>4 then raise exception 'RESERVATION_COUNT'; end if;
 delete from private.account_access where profile_id in(${ids()}); get diagnostics n=row_count; if n<>4 then raise exception 'ACCESS_DELETE_COUNT'; end if;
 insert into private.account_access(profile_id,account_type,status,onboarding_step,restaurant_id,restaurant_role,status_reason_code,created_by_profile_id,authz_version,activated_at,suspended_at,revoked_at,created_at,updated_at)
 select b.profile_id,'restaurant',e.status,e.onboarding_step,${q(ACCOUNT_PREPARATION.restaurantId)},e.restaurant_role,case when e.status='suspended' then 'ruip6ad_diagnostic_suspension' else 'ruip6ad_account_preparation' end,b.created_by_profile_id,e.after_version,case when e.status='pending' then null else transaction_timestamp() end,case when e.status='suspended' then transaction_timestamp() else null end,null,b.created_at,transaction_timestamp() from before_access b join expected_accounts e using(profile_id);
 get diagnostics n=row_count; if n<>4 then raise exception 'ACCESS_INSERT_COUNT'; end if;
 perform private.write_audit(null,'qualification.restaurant_identity_reclassified','profile',e.profile_id,jsonb_build_object('run_id',${q(ACCOUNT_PREPARATION.runId)},'restaurant_id',${q(ACCOUNT_PREPARATION.restaurantId)},'from_account_type','customer','from_status',b.status,'to_account_type','restaurant','to_status',e.status,'restaurant_role',e.restaurant_role,'snapshot_sha256',${q(snapshotSha256)},'authority_sha256',${q(authoritySha256)})) from expected_accounts e join before_access b using(profile_id);
 if (select count(*) from private.account_access a join expected_accounts e using(profile_id) where a.account_type='restaurant' and a.status=e.status and a.onboarding_step=e.onboarding_step and a.restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and a.restaurant_role=e.restaurant_role and a.authz_version=e.after_version and a.admin_role is null and a.revoked_at is null)<>4 then raise exception 'INTERNAL_ACCESS_POSTCONDITION'; end if;
 if (select count(*) from private.account_email_reservations r join expected_accounts e on e.email=r.normalized_email and e.profile_id=r.profile_id and e.profile_id=r.firebase_uid where r.account_type='restaurant' and r.invitation_id is null)<>4 then raise exception 'INTERNAL_RESERVATION_POSTCONDITION'; end if;
 if (select count(*) from public.profiles p join expected_hashes h on h.kind='profile' and h.identity=p.id and h.digest=encode(extensions.digest(to_jsonb(p)::text,'sha256'),'hex'))<>4 then raise exception 'INTERNAL_PROFILE_POSTCONDITION'; end if;
 if not exists(select 1 from public.restaurants r join expected_hashes h on h.kind='restaurant' and h.identity=r.id and h.digest=encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') where r.id=${q(ACCOUNT_PREPARATION.restaurantId)}) then raise exception 'INTERNAL_RESTAURANT_POSTCONDITION'; end if;
 if exists(select 1 from private.restaurant_members where profile_id in(${ids()})) or exists(select 1 from private.user_roles where profile_id in(${ids()})) then raise exception 'INTERNAL_AUTHORIZATION_POSTCONDITION'; end if;
 if exists(select 1 from public.orders where profile_id in(${ids()}) or courier_profile_id in(${ids()})) or exists(select 1 from public.order_reviews where profile_id in(${ids()})) or exists(select 1 from public.product_reviews where profile_id in(${ids()})) or exists(select 1 from private.push_tokens where profile_id in(${ids()})) or exists(select 1 from private.account_invitations where normalized_email in(${emails()})) then raise exception 'INTERNAL_DEPENDENCY_POSTCONDITION'; end if;
 if (select count(*) from private.account_provisioning_operations where target_profile_id in(${ids()}))<>9 or (select count(*) from private.audit_log where actor_profile_id in(${ids()}))<>4 then raise exception 'INTERNAL_HISTORY_POSTCONDITION'; end if;
 if (select count(*) from private.account_access where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and profile_id not in(${ids()}))<>2 or (select count(*) from public.orders where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>2 or (select count(*) from public.orders where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and status not in('delivered','canceled'))<>0 or (select count(*) from private.account_invitations where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>4 or (select count(*) from private.restaurant_operational_incidents where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>1 or (select count(*) from private.restaurant_commission_rules where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>1 or (select count(*) from public.order_reviews where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.product_reviews where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from public.categories where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_items where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_item_ingredients where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_option_groups where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_option_values where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.push_tokens where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.order_commission_terms where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.delivered_order_financial_snapshots where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 or (select count(*) from private.restaurant_financial_integrity_alerts where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>0 then raise exception 'INTERNAL_RESTAURANT_RELATIONSHIP_POSTCONDITION'; end if;
 if not exists(select 1 from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1' and enabled=false) then raise exception 'INTERNAL_EARNINGS_POSTCONDITION'; end if;
 if exists(select 1 from public.addresses where id in('zeQ0xgA79Up5XTNs-i_Dg','7KnWuexTChn4F7o9hMtzH')) or exists(select 1 from public.favorites where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen') or exists(select 1 from private.notification_preferences where profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2')) then raise exception 'INTERNAL_DISPOSABLE_POSTCONDITION'; end if;
 if (select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassified' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)} and target_id in(${ids()}))<>4 then raise exception 'INTERNAL_AUDIT_POSTCONDITION'; end if;
end $prepare$;
commit;`;
}

export function buildRecoverySql(before, authoritySha256) {
  validateBeforeState(before, { now: Date.parse(before.capturedAt) });
  if (!/^[a-f0-9]{64}$/.test(authoritySha256)) throw new Error("Recovery authority digest required.");
  const row = name => ACCOUNT_PREPARATION.accounts[name];
  const accessRows = expectedAccountList().map(a => {
    const original = before.access.find(value => value.profile_id === a.profileId);
    return `(${q(a.profileId)},${q(a.email)},${q(a.qualification === "suspended" ? "revoked" : "active")}::private.account_status,${a.afterVersion + 1}::bigint,${q(original.created_at)}::timestamptz,${original.activated_at ? q(original.activated_at) + "::timestamptz" : "null::timestamptz"},${original.revoked_at ? q(original.revoked_at) + "::timestamptz" : "null::timestamptz"},${original.status_reason_code == null ? "null::text" : q(original.status_reason_code)})`;
  }).join(",\n");
  const pendingAddress = before.disposable.addresses.find(value => value.id === "zeQ0xgA79Up5XTNs-i_Dg"), suspendedAddress = before.disposable.addresses.find(value => value.id === "7KnWuexTChn4F7o9hMtzH");
  const addressValue = a => `(${q(a.id)},${q(a.profile_id)},${q(a.label)},${q(a.line1)},${a.block == null ? "null" : q(a.block)},${a.room == null ? "null" : q(a.room)},${q(a.city)},${q(a.country)},${a.is_default},${q(a.created_at)}::timestamptz,${q(a.updated_at)}::timestamptz)`;
  return `begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('hungrie:${ACCOUNT_PREPARATION.runId}:restaurant-account-preparation',0));
create temporary table original_accounts(profile_id,email,status,recovery_version,created_at,activated_at,revoked_at,status_reason_code) on commit drop as values
${accessRows};
select id from public.restaurants where id=${q(ACCOUNT_PREPARATION.restaurantId)} for update;
select id from public.profiles where id in(${ids()}) order by id for update;
select profile_id from private.account_access where profile_id in(${ids()}) order by profile_id for update;
select normalized_email from private.account_email_reservations where normalized_email in(${emails()}) order by normalized_email for update;
do $recover$ declare n integer; begin
 if (select count(*) from private.account_access a join original_accounts o using(profile_id) where a.account_type='restaurant' and a.restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and a.authz_version=o.recovery_version-1)<>4 then raise exception 'PREPARED_STATE_REQUIRED'; end if;
 if (select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassified' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)} and target_id in(${ids()}))<>4 then raise exception 'PREPARATION_AUDIT_REQUIRED'; end if;
 if exists(select 1 from public.addresses where id in('zeQ0xgA79Up5XTNs-i_Dg','7KnWuexTChn4F7o9hMtzH')) or exists(select 1 from public.favorites where profile_id=${q(row("suspended").profileId)} and restaurant_id='lombard-kitchen') or exists(select 1 from private.notification_preferences where profile_id in(${q(row("pending").profileId)},${q(row("suspended").profileId)})) then raise exception 'RECOVERY_TARGET_OCCUPIED'; end if;
 delete from private.account_access where profile_id in(${ids()}); get diagnostics n=row_count; if n<>4 then raise exception 'RECOVERY_ACCESS_DELETE_COUNT'; end if;
 insert into private.account_access(profile_id,account_type,status,onboarding_step,status_reason_code,authz_version,activated_at,suspended_at,revoked_at,created_at,updated_at)
 select profile_id,'customer',status,'none',status_reason_code,recovery_version,activated_at,null,revoked_at,created_at,transaction_timestamp() from original_accounts; get diagnostics n=row_count; if n<>4 then raise exception 'RECOVERY_ACCESS_INSERT_COUNT'; end if;
 update private.account_email_reservations set account_type='customer',updated_at=transaction_timestamp() where normalized_email in(${emails()}) and account_type='restaurant' and invitation_id is null; get diagnostics n=row_count; if n<>4 then raise exception 'RECOVERY_RESERVATION_COUNT'; end if;
 insert into public.addresses(id,profile_id,label,line1,block,room,city,country,is_default,created_at,updated_at) values ${addressValue(pendingAddress)},${addressValue(suspendedAddress)}; get diagnostics n=row_count; if n<>2 then raise exception 'RECOVERY_ADDRESS_COUNT'; end if;
 insert into public.favorites(profile_id,restaurant_id,created_at) values(${q(row("suspended").profileId)},'lombard-kitchen',${q(before.disposable.favorites[0].created_at)}::timestamptz); get diagnostics n=row_count; if n<>1 then raise exception 'RECOVERY_FAVORITE_COUNT'; end if;
 insert into private.notification_preferences(profile_id,order_status_enabled,restaurant_orders_enabled,review_replies_enabled,created_at,updated_at) values ${before.disposable.preferences.map(p => `(${q(p.profile_id)},${p.order_status_enabled},${p.restaurant_orders_enabled},${p.review_replies_enabled},${q(p.created_at)}::timestamptz,${q(p.updated_at)}::timestamptz)`).join(",")}; get diagnostics n=row_count; if n<>2 then raise exception 'RECOVERY_PREFERENCE_COUNT'; end if;
 perform private.write_audit(null,'qualification.restaurant_identity_reclassification_recovered','profile',o.profile_id,jsonb_build_object('run_id',${q(ACCOUNT_PREPARATION.runId)},'restaurant_id',${q(ACCOUNT_PREPARATION.restaurantId)},'authority_sha256',${q(authoritySha256)})) from original_accounts o;
 if (select count(*) from private.account_access a join original_accounts o using(profile_id) where a.account_type='customer' and a.status=o.status and a.authz_version=o.recovery_version and a.restaurant_id is null and a.restaurant_role is null)<>4 then raise exception 'INTERNAL_RECOVERY_ACCESS'; end if;
 if (select count(*) from private.account_email_reservations r join original_accounts o on o.email=r.normalized_email and o.profile_id=r.profile_id and o.profile_id=r.firebase_uid where r.account_type='customer' and r.invitation_id is null)<>4 then raise exception 'INTERNAL_RECOVERY_RESERVATION'; end if;
 if (select count(*) from public.addresses where id in('zeQ0xgA79Up5XTNs-i_Dg','7KnWuexTChn4F7o9hMtzH'))<>2 or (select count(*) from public.favorites where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen')<>1 or (select count(*) from private.notification_preferences where profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2'))<>2 then raise exception 'INTERNAL_RECOVERY_DISPOSABLE'; end if;
 if exists(select 1 from private.restaurant_members where profile_id in(${ids()})) or exists(select 1 from private.user_roles where profile_id in(${ids()})) or (select count(*) from private.account_provisioning_operations where target_profile_id in(${ids()}))<>9 or (select count(*) from private.audit_log where actor_profile_id in(${ids()}))<>4 then raise exception 'INTERNAL_RECOVERY_BOUNDARY'; end if;
 if not exists(select 1 from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1' and enabled=false) then raise exception 'INTERNAL_RECOVERY_EARNINGS'; end if;
 if (select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassification_recovered' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)} and target_id in(${ids()}))<>4 then raise exception 'INTERNAL_RECOVERY_AUDIT'; end if;
end $recover$;
commit;`;
}

function evidencePaths(root) {
  const directory = path.join(root, ACCOUNT_PREPARATION.evidenceRoot);
  return { directory, attempt: path.join(directory, "preparation-attempt.json"), authority: path.join(directory, "preparation-authority.json"), progress: path.join(directory, "preflight-progress.json"), before: path.join(directory, "before-state.json"), beforeHash: path.join(directory, "before-state.sha256"), result: path.join(directory, "preparation-result.json"), post: path.join(directory, "postcondition-report.json"), reconciliation: path.join(directory, "reconciliation-result.json"), recoveryAttempt: path.join(directory, "recovery-attempt.json"), recoveryResult: path.join(directory, "recovery-result.json") };
}

const persistTerminal = (file, value, io) => atomicReplace(file, { ...value, evidenceSha256: sha256(Buffer.from(canonical(value))) }, io);

export async function runPreparation({ root, authority, accounts, provider, action = "prepare", confirm, now = () => Date.now(), io = fs, gitHead = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() }) {
  validateAuthority(authority, { now: now() });
  if (sha256(io.readFileSync(path.join(root, ACCOUNT_PREPARATION.planPath))) !== ACCOUNT_PREPARATION.planSha256) throw new Error("Reviewed preparation plan changed.");
  if (authority.operatorCommit !== gitHead()) throw new Error("Audited operator checkpoint mismatch.");
  const paths = evidencePaths(root), authoritySha256 = sha256(Buffer.from(canonical(authority)));
  if (action === "prepare") {
    if (confirm !== `staging:restaurant-account-preparation:prepare:${ACCOUNT_PREPARATION.runId}`) throw new Error("Preparation confirmation mismatch.");
    const accountValidation = validateAccountsFile(accounts);
    atomicWriteExclusive(paths.attempt, { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, state: "started", startedAt: new Date(now()).toISOString(), authoritySha256, planSha256: ACCOUNT_PREPARATION.planSha256 }, io);
    atomicWriteExclusive(paths.authority, authority, io);
    let transactionOutcome = "not_started";
    try {
      const firebase = await provider.readFirebase();
      atomicReplace(paths.progress, { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, stage: "firebase_observed", recordedAt: new Date(now()).toISOString(), firebase, credentialValuesPersisted: false }, io);
      const database = await provider.readDatabase("before");
      atomicReplace(paths.progress, { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, stage: "database_observed", recordedAt: new Date(now()).toISOString(), firebase, database, credentialValuesPersisted: false }, io);
      const before = { ...database, firebase, authoritySha256, accountValidation, capturedAt: database.capturedAt || new Date(now()).toISOString() };
      atomicWriteExclusive(paths.before, before, io);
      atomicWriteExclusive(paths.beforeHash, Buffer.from(sha256(io.readFileSync(paths.before)) + "\n"), io);
      validateFirebaseObservation(firebase); validateBeforeState(before, { now: now() });
      const beforeSha256 = sha256(io.readFileSync(paths.before));
      try { await provider.executePreparation(buildPreparationSql(beforeSha256, authoritySha256)); transactionOutcome = "acknowledged"; }
      catch (error) { transactionOutcome = error?.code === "UNCERTAIN_RESPONSE" ? "uncertain" : "rolled_back_or_rejected"; throw error; }
      const after = await provider.readDatabase("after");
      atomicWriteExclusive(paths.post, after, io);
      validateAfterState(after);
      const result = { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, disposition: "PASS", completedAt: new Date(now()).toISOString(), transactionOutcome, beforeStateSha256: beforeSha256, postconditionSha256: sha256(io.readFileSync(paths.post)), authoritySha256, credentialsPersisted: false };
      persistTerminal(paths.result, result, io); return result;
    } catch (error) {
      let reconciliation = null;
      try { const state = await provider.readDatabase("reconciliation"); reconciliation = { classification: classifyState(state), observation: state }; } catch (reconcileError) { reconciliation = { classification: "UNAVAILABLE", error: sanitizeError(reconcileError) }; }
      const disposition = transactionOutcome === "uncertain" || reconciliation.classification === "PARTIAL_OR_UNKNOWN" || reconciliation.classification === "UNAVAILABLE" ? "BLOCKED" : "FAIL";
      const result = { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, disposition, completedAt: new Date(now()).toISOString(), transactionOutcome, error: sanitizeError(error), reconciliation, authoritySha256, credentialsPersisted: false };
      persistTerminal(paths.result, result, io); return result;
    }
  }
  if (action === "reconcile") {
    if (confirm !== `staging:restaurant-account-preparation:reconcile:${ACCOUNT_PREPARATION.runId}`) throw new Error("Reconciliation confirmation mismatch.");
    const state = await provider.readDatabase("reconciliation"), classification = classifyState(state);
    const result = { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, disposition: classification === "AFTER" ? "PASS" : classification === "BEFORE" || classification === "RECOVERED" ? "N/A" : "BLOCKED", classification, completedAt: new Date(now()).toISOString(), observation: state, authoritySha256 };
    persistTerminal(paths.reconciliation, result, io); return result;
  }
  if (action === "recover") {
    if (confirm !== `staging:restaurant-account-preparation:recover:${ACCOUNT_PREPARATION.runId}:${authoritySha256}`) throw new Error("Independent recovery confirmation mismatch.");
    if (!io.existsSync(paths.before) || !io.existsSync(paths.beforeHash)) throw new Error("Protected before-state evidence required for recovery.");
    const beforeBytes = io.readFileSync(paths.before), recorded = io.readFileSync(paths.beforeHash, "utf8").trim();
    if (sha256(beforeBytes) !== recorded) throw new Error("Protected before-state evidence digest mismatch.");
    const before = JSON.parse(beforeBytes);
    atomicWriteExclusive(paths.recoveryAttempt, { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, state: "started", startedAt: new Date(now()).toISOString(), authoritySha256, beforeStateSha256: recorded }, io);
    let outcome = "not_started";
    try {
      const current = await provider.readDatabase("after"); validateAfterState(current);
      try { await provider.executeRecovery(buildRecoverySql(before, authoritySha256)); outcome = "acknowledged"; }
      catch (error) { outcome = error?.code === "UNCERTAIN_RESPONSE" ? "uncertain" : "rolled_back_or_rejected"; throw error; }
      const recovered = await provider.readDatabase("recovered"); validateRecoveredState(recovered);
      const result = { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, disposition: "PASS", completedAt: new Date(now()).toISOString(), outcome, recoveredStateSha256: sha256(Buffer.from(canonical(recovered))), authoritySha256 };
      persistTerminal(paths.recoveryResult, result, io); return result;
    } catch (error) {
      let reconciliation;
      try { const state = await provider.readDatabase("reconciliation"); reconciliation = { classification: classifyState(state), observation: state }; } catch (readError) { reconciliation = { classification: "UNAVAILABLE", error: sanitizeError(readError) }; }
      const result = { schemaVersion: 1, runId: ACCOUNT_PREPARATION.runId, action, disposition: reconciliation.classification === "RECOVERED" ? "PASS" : "BLOCKED", completedAt: new Date(now()).toISOString(), outcome, error: sanitizeError(error), reconciliation, authoritySha256 };
      persistTerminal(paths.recoveryResult, result, io); return result;
    }
  }
  throw new Error("Unsupported account-preparation action.");
}

export function createHostedProvider(root, fetchImpl = fetch) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "secure/supabase-projects.local.json"), "utf8")), project = registry.projects?.staging;
  if (project?.ref !== ACCOUNT_PREPARATION.supabaseProjectRef || project.ref === registry.projects?.development?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Staging project required.");
  const operator = JSON.parse(fs.readFileSync(path.join(root, "secure/phase7/operator-config.json"), "utf8"));
  const credentialPath = path.resolve(operator.firebaseAdminCredentialPath || "");
  if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath) || credentialPath.startsWith(root + path.sep)) throw new Error("External shared non-production Firebase credential required.");
  const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (operator.firebaseProjectId !== ACCOUNT_PREPARATION.firebaseProjectId || credential.project_id !== ACCOUNT_PREPARATION.firebaseProjectId) throw new Error("Exact Firebase project required.");
  const managementToken = fs.readFileSync(path.join(root, "secure/supabase-cli-hungrie/access-token"), "utf8").trim();
  const migrationVersions = fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).map(name => name.slice(0, 14)).sort();
  const query = async sql => { const response = await fetchImpl(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query: sql }) }); if (!response.ok) { const error = new Error(`Staging database request failed (${response.status}); details withheld.`); if (response.status >= 500) error.code = "UNCERTAIN_RESPONSE"; throw error; } const result = await response.json(); if (!Array.isArray(result)) throw new Error("Malformed Staging response."); return result; };
  const require = createRequire(import.meta.url), admin = require(path.join(root, "functions/node_modules/firebase-admin"));
  return {
    async readFirebase() {
      const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: ACCOUNT_PREPARATION.firebaseProjectId }, "restaurant-account-preparation-" + Date.now());
      try { const users = []; for (const account of expectedAccountList()) { const u = await app.auth().getUserByEmail(account.email); users.push({ email: account.email, uid: u.uid, disabled: u.disabled, emailVerified: u.emailVerified, providers: u.providerData.map(p => p.providerId).sort() }); } return { runId: ACCOUNT_PREPARATION.runId, projectId: ACCOUNT_PREPARATION.firebaseProjectId, capturedAt: new Date().toISOString(), users }; } finally { await app.delete(); }
    },
    async readDatabase(stage) { const rows = await query(buildSnapshotSql(stage, migrationVersions)); if (rows.length !== 1 || !rows[0].snapshot) throw new Error("Complete database snapshot required."); return rows[0].snapshot; },
    async executePreparation(sql) { return query(sql); },
    async executeRecovery(sql) { return query(sql); },
  };
}

export function buildSnapshotSql(stage, migrationVersions = ["20260924140000"]) {
  if (!/^(before|after|recovered|reconciliation)$/.test(stage)) throw new Error("Unsupported snapshot stage.");
  if (!Array.isArray(migrationVersions) || !migrationVersions.length || migrationVersions.some(version => !/^\d{14}$/.test(version))) throw new Error("Exact local migration inventory required.");
  const migrationValues = migrationVersions.map(version => `(${q(version)})`).join(",");
  return `begin transaction read only;
with targets(profile_id,email) as (values ${expectedAccountList().map(a => `(${q(a.profileId)},${q(a.email)})`).join(",")}),
profiles as (select p.* from public.profiles p join targets t on t.profile_id=p.id),
restaurant as (select * from public.restaurants where id=${q(ACCOUNT_PREPARATION.restaurantId)}),
snapshot as (select jsonb_build_object(
 'schemaVersion',1,'stage',${q(stage)},'runId',${q(ACCOUNT_PREPARATION.runId)},'projectRef',${q(ACCOUNT_PREPARATION.supabaseProjectRef)},'restaurantId',${q(ACCOUNT_PREPARATION.restaurantId)},'planSha256',${q(ACCOUNT_PREPARATION.planSha256)},'capturedAt',statement_timestamp(),
 'pendingMigrations',(select count(*) from (values ${migrationValues}) local(version) where not exists(select 1 from supabase_migrations.schema_migrations applied where applied.version=local.version)),
 'schemaContractValid',(
   to_regclass('private.account_access') is not null and to_regclass('private.account_email_reservations') is not null
   and to_regclass('private.restaurant_members_one_membership_per_profile_idx') is not null
   and exists(select 1 from pg_trigger where tgrelid='private.account_access'::regclass and tgname='phase2_account_access_transition' and not tgisinternal)
   and exists(select 1 from pg_constraint where conrelid='private.account_access'::regclass and conname='account_access_shape')
   and exists(select 1 from pg_constraint where conrelid='private.account_access'::regclass and conname='account_access_active_shape')
   and exists(select 1 from pg_constraint where conrelid='private.account_access'::regclass and conname='account_access_timestamps')
   and to_regprocedure('private.write_audit(text,text,text,text,jsonb)') is not null),
 'earningsEnabled',(select enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1'),
 'restaurant',(select to_jsonb(r) from restaurant r),'restaurantSha256',(select encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') from restaurant r),
 'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from profiles p),
 'access',(select coalesce(jsonb_agg(to_jsonb(a) order by a.profile_id),'[]') from private.account_access a where a.profile_id in(select profile_id from targets)),
 'reservations',(select coalesce(jsonb_agg(to_jsonb(e) order by e.normalized_email),'[]') from private.account_email_reservations e where e.profile_id in(select profile_id from targets) or e.normalized_email in(select email from targets)),
 'rowHashes',jsonb_build_object(
   'profiles',(select coalesce(jsonb_object_agg(p.id,encode(extensions.digest(to_jsonb(p)::text,'sha256'),'hex')),'{}') from profiles p),
   'access',(select coalesce(jsonb_object_agg(a.profile_id,encode(extensions.digest(to_jsonb(a)::text,'sha256'),'hex')),'{}') from private.account_access a where a.profile_id in(select profile_id from targets)),
   'reservations',(select coalesce(jsonb_object_agg(e.normalized_email,encode(extensions.digest(to_jsonb(e)::text,'sha256'),'hex')),'{}') from private.account_email_reservations e where e.profile_id in(select profile_id from targets)),
   'disposable',jsonb_build_object(
    'address:zeQ0xgA79Up5XTNs-i_Dg',(select encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex') from public.addresses d where id='zeQ0xgA79Up5XTNs-i_Dg'),
    'address:7KnWuexTChn4F7o9hMtzH',(select encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex') from public.addresses d where id='7KnWuexTChn4F7o9hMtzH'),
    'favorite:TBaq9HQIL9OBwLFP3MKchi3rpSA2:lombard-kitchen',(select encode(extensions.digest(to_jsonb(f)::text,'sha256'),'hex') from public.favorites f where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen'),
    'preference:v9kzlLATn9fQxJ6oPTUjxTDj8MJ3',(select encode(extensions.digest(to_jsonb(n)::text,'sha256'),'hex') from private.notification_preferences n where profile_id='v9kzlLATn9fQxJ6oPTUjxTDj8MJ3'),
    'preference:TBaq9HQIL9OBwLFP3MKchi3rpSA2',(select encode(extensions.digest(to_jsonb(n)::text,'sha256'),'hex') from private.notification_preferences n where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2'))),
 'disposable',jsonb_build_object(
   'addresses',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.addresses d where d.profile_id in(select profile_id from targets)),
   'favorites',(select coalesce(jsonb_agg(to_jsonb(f) order by f.profile_id,f.restaurant_id),'[]') from public.favorites f where f.profile_id in(select profile_id from targets)),
   'preferences',(select coalesce(jsonb_agg(to_jsonb(n) order by n.profile_id),'[]') from private.notification_preferences n where n.profile_id in(select profile_id from targets))),
 'identityRelationships',jsonb_build_object(
   'memberships',(select count(*) from private.restaurant_members where profile_id in(select profile_id from targets)),
   'platformRoles',(select count(*) from private.user_roles where profile_id in(select profile_id from targets)),
   'orders',(select count(*) from public.orders where profile_id in(select profile_id from targets) or courier_profile_id in(select profile_id from targets)),
   'reviews',(select (select count(*) from public.order_reviews where profile_id in(select profile_id from targets))+(select count(*) from public.product_reviews where profile_id in(select profile_id from targets))),
   'pushTokens',(select count(*) from private.push_tokens where profile_id in(select profile_id from targets)),
   'invitations',(select count(*) from private.account_invitations where normalized_email in(select email from targets)),
   'provisioning',(select count(*) from private.account_provisioning_operations where target_profile_id in(select profile_id from targets)),
   'existingAudits',(select count(*) from private.audit_log where actor_profile_id in(select profile_id from targets) and action<>'qualification.restaurant_identity_reclassified' and action<>'qualification.restaurant_identity_reclassification_recovered')),
 'restaurantCounts',jsonb_build_object(
   'existingAccessAccounts',(select count(*) from private.account_access where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and profile_id not in(select profile_id from targets)),
   'orders',(select count(*) from public.orders where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),'activeOrders',(select count(*) from public.orders where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)} and status not in('delivered','canceled')),
   'invitations',(select count(*) from private.account_invitations where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),'incidents',(select count(*) from private.restaurant_operational_incidents where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),'commissionRules',(select count(*) from private.restaurant_commission_rules where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),
   'reviews',(select (select count(*) from public.order_reviews where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.product_reviews where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})),
   'menuRows',(select (select count(*) from public.categories where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_items where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_item_ingredients where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_option_groups where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})+(select count(*) from public.menu_option_values where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})),
   'pushTokens',(select count(*) from private.push_tokens where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),'commissionTerms',(select count(*) from private.order_commission_terms where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),'financialSnapshots',(select count(*) from private.delivered_order_financial_snapshots where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)}),'financialAlerts',(select count(*) from private.restaurant_financial_integrity_alerts where restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})),
 'reclassificationAuditCount',(select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassified' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)} and target_id in(select profile_id from targets)),
 'recoveryAuditCount',(select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassification_recovered' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)} and target_id in(select profile_id from targets))
 ) snapshot)
select snapshot from snapshot; rollback;`;
}

function parseArgs(argv) { const [action, ...rest] = argv; return { action, values: Object.fromEntries(rest.filter(v => v.startsWith("--") && v.includes("=")).map(v => { const i = v.indexOf("="); return [v.slice(2, i), v.slice(i + 1)]; })) }; }

async function main(argv = process.argv.slice(2)) {
  const { action, values } = parseArgs(argv), root = path.resolve(import.meta.dirname, "..");
  if (!values.authority || !values.accounts || !values.confirm) throw new Error("Authority, accounts, and action confirmation are required.");
  const authority = JSON.parse(fs.readFileSync(path.resolve(values.authority), "utf8"));
  const accounts = validateAccountsFilePath(values.accounts, { root });
  const result = await runPreparation({ root, authority, accounts, provider: createHostedProvider(root), action, confirm: values.confirm });
  process.stdout.write(JSON.stringify({ disposition: result.disposition, action: result.action, runId: result.runId }) + "\n");
  if (!["PASS", "N/A"].includes(result.disposition)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(sanitizeError(error).message + "\n"); process.exitCode = 1; });
