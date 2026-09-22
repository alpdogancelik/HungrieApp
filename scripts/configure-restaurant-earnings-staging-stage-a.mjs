#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const secure = path.join(root, "secure");
const action = process.argv[2];
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = option("--run-id");
const expectedRunId = "stgcommission_20260924a";
const expectedRef = "rlrfvqskzvpysewdxqcr";
const expectedFirebase = "hungrieapp-a2288";
const expectedMigrationSha = "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94";
const effectiveFrom = "2026-09-24T09:00:00.000Z";
const reason = "Initial Staging commission configuration: 5.00% prospective rate";
const rateBps = 500;
const approved = [
  ["31fdf62e-a49e-41c4-b519-712c7dcd095f", "Phase 5 Staging Pilot", true, "f5ded304-90da-4f28-a93b-67d16fa800c3"],
  ["598eacea-dd2a-4549-a198-40593f7fab06", "Phase 4 Restaurant QA", false, "aa57e00e-63c4-4875-a9a2-79bfef364307"],
  ["ada-pizza", "Ada Pizza", true, "d74ff9c8-42b4-4b18-baf2-872d618a8b26"],
  ["alacarte-cafe", "Ala Carte Cafe", true, "d05f626a-275b-4188-9a44-0bbcf7008f37"],
  ["burger-house", "Burger House", true, "e568c676-1ea3-473a-b9fc-22d9bb1ce0c4"],
  ["erto-cafe", "Erto Cafe", true, "ad37502d-92db-45e5-a948-65183bdc71a9"],
  ["lavish", "Lavish", true, "a8d642c0-2ec7-4938-bbb1-92862b80ed8c"],
  ["lombard-kitchen", "Lombard Kitchen", true, "22bf418f-9515-46f3-a33c-9574f06559e6"],
  ["munchies", "Munchies", true, "750f6370-7b22-4d28-971a-c8facc98fd0e"],
  ["root-kitchen-coffee", "Root Kitchen & Coffee", true, "970b9597-9c30-4a5e-a91a-44938d70f450"],
  ["voy", "Voy", true, "163394d1-cac2-4a1e-afaa-c4ffd0fdd69c"],
].map(([restaurantId, name, acceptingOrders, operationId]) => ({ restaurantId, name, lifecycleStatus: "active", acceptingOrders, operationId, rateBps, effectiveFrom, reason }));

if (!new Set(["preflight", "schedule", "verify"]).has(action)) throw new Error("Use preflight|schedule|verify.");
if (runId !== expectedRunId) throw new Error(`Exact --run-id=${expectedRunId} required.`);
if (option("--environment") !== "staging") throw new Error("Explicit --environment=staging required; there is no default.");
if (option("--confirm") !== `staging:restaurant-earnings-stage-a:${action}:${runId}`) throw new Error("Action-specific confirmation mismatch.");
if (option("--expect-sha256") !== expectedMigrationSha) throw new Error("Accepted migration checksum confirmation required.");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const migrationPath = path.join(root, "supabase", "migrations", "20260922100000_restaurant_earnings_admin_commission.sql");
if (sha256(fs.readFileSync(migrationPath)) !== expectedMigrationSha) throw new Error("Accepted migration changed.");
const registry = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = registry.projects?.staging;
if (project?.ref !== expectedRef || project.name !== "HungrieApp Staging" || project.ref === registry.projects?.development?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Staging project required.");
const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const runDirectory = path.join(secure, "restaurant-earnings-staging-commission", runId);
const manifestPath = path.join(runDirectory, "manifest.json");
fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(runDirectory, 0o700);
const writeJson = (name, value) => { const target = path.join(runDirectory, name), temporary = `${target}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, target); fs.chmodSync(target, 0o600); return target; };
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const query = async statement => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query: statement }) });
  if (!response.ok) throw new Error(`Staging SQL failed (${response.status}); response withheld.`);
  const payload = await response.json(); if (!Array.isArray(payload)) throw new Error("Staging SQL response malformed."); return payload;
};
const normalizeInstant = value => new Date(value).toISOString();
const idsSql = approved.map(value => q(value.restaurantId)).join(",");
const operationsSql = approved.map(value => q(value.operationId)).join(",");

const readState = async () => {
  const [row] = await query(`begin transaction read only;select jsonb_build_object(
    'capturedAt',statement_timestamp(),'effectiveTimeFuture',statement_timestamp()<${q(effectiveFrom)}::timestamptz,
    'migrationRecorded',(select count(*)=1 from supabase_migrations.schema_migrations where version='20260922100000'),
    'latestMigration',(select max(version) from supabase_migrations.schema_migrations),
    'capabilityEnabled',(select enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1'),
    'restaurants',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'lifecycleStatus',r.lifecycle_status,'acceptingOrders',r.accepting_orders,'reportingTimezone',r.reporting_timezone,'nonterminalOrders',(select count(*)::integer from public.orders o where o.restaurant_id=r.id and o.status not in('delivered','canceled')),'nonterminalMissingTerms',(select count(*)::integer from public.orders o where o.restaurant_id=r.id and o.status not in('delivered','canceled') and not exists(select 1 from private.order_commission_terms t where t.order_id=o.id)),'deliveredWithoutSnapshot',(select count(*)::integer from public.orders o where o.restaurant_id=r.id and o.status='delivered' and not exists(select 1 from private.delivered_order_financial_snapshots s where s.order_id=o.id)),'terms',(select count(*)::integer from private.order_commission_terms t where t.restaurant_id=r.id),'snapshots',(select count(*)::integer from private.delivered_order_financial_snapshots s where s.restaurant_id=r.id)) order by r.id) from public.restaurants r),'[]'::jsonb),
    'rules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'restaurantId',restaurant_id,'rateBps',rate_bps,'contractVersion',commission_contract_version,'effectiveFrom',effective_from,'createdByProfileId',created_by_profile_id,'createdAt',created_at,'reason',reason,'operationId',operation_id) order by restaurant_id,effective_from,id) from private.restaurant_commission_rules),'[]'::jsonb),
    'audits',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actorProfileId',actor_profile_id,'targetId',target_id,'metadata',metadata,'createdAt',created_at) order by id) from private.audit_log where action='restaurant.commission_rule_scheduled_v1' and metadata->>'operation_id' in(${operationsSql})),'[]'::jsonb),
    'activeSuperAdmins',(select count(*)::integer from private.account_access where account_type='admin' and status='active' and admin_role='super_admin'),
    'activeMfaSuperAdmins',(select count(*)::integer from private.account_access where account_type='admin' and status='active' and admin_role='super_admin' and admin_mfa_enrolled_at is not null)
  ) state;rollback;`);
  return row.state;
};

const assertState = (state, { allowApprovedRules }) => {
  if (!state.migrationRecorded || state.latestMigration !== "20260922100000") throw new Error("Staging migration history drifted.");
  if (state.capabilityEnabled !== false) throw new Error("Capability must remain disabled.");
  if (!state.effectiveTimeFuture) throw new Error("Approved effective time is no longer future.");
  if (state.activeSuperAdmins < 1 || state.activeMfaSuperAdmins < 1) throw new Error("Active MFA super-admin unavailable.");
  if (state.restaurants.length !== approved.length) throw new Error("Restaurant inventory count changed.");
  for (const expected of approved) {
    const restaurant = state.restaurants.find(value => value.id === expected.restaurantId);
    if (!restaurant || restaurant.name !== expected.name || restaurant.lifecycleStatus !== expected.lifecycleStatus || restaurant.acceptingOrders !== expected.acceptingOrders || restaurant.reportingTimezone !== "Asia/Famagusta") throw new Error(`Restaurant inventory drift: ${expected.restaurantId}`);
    if (restaurant.nonterminalOrders !== 0 || restaurant.nonterminalMissingTerms !== 0) throw new Error(`Nonterminal order coverage changed: ${expected.restaurantId}`);
  }
  for (const rule of state.rules) {
    const expected = approved.find(value => value.restaurantId === rule.restaurantId && value.operationId === rule.operationId);
    if (!allowApprovedRules || !expected || rule.rateBps !== rateBps || rule.contractVersion !== 1 || normalizeInstant(rule.effectiveFrom) !== effectiveFrom || rule.reason !== reason) throw new Error(`Unexpected or conflicting commission rule: ${rule.restaurantId}`);
  }
  const duplicateRestaurants = approved.filter(expected => state.rules.filter(rule => rule.restaurantId === expected.restaurantId).length > 1);
  if (duplicateRestaurants.length) throw new Error("Duplicate approved Restaurant rule detected.");
};

const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, { headers: { authorization: `Bearer ${managementToken}` } });
if (!metadataResponse.ok) throw new Error(`Staging metadata failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
if (metadata.id !== expectedRef || metadata.status !== "ACTIVE_HEALTHY") throw new Error("Staging identity or health mismatch.");
console.log(JSON.stringify({ environment: "staging", supabaseProjectRef: expectedRef, firebaseProjectId: expectedFirebase, rejectedRefs: [registry.projects?.development?.ref, registry.projects?.production?.ref].filter(Boolean) }));

const state = await readState();
assertState(state, { allowApprovedRules: action !== "preflight" || fs.existsSync(manifestPath) });

if (action === "preflight") {
  if (state.rules.length) throw new Error("First-run preflight requires zero rules.");
  const manifest = { runId, environment: "staging", projectRef: expectedRef, firebaseProjectId: expectedFirebase, createdAt: new Date().toISOString(), migrationSha256: expectedMigrationSha, effectiveFrom, localEffectiveTime: "2026-09-24 12:00:00 Asia/Famagusta", rateBps, reason, approved, baseline: state, results: [] };
  writeJson("manifest.json", manifest);
  console.log(JSON.stringify({ action, passed: true, runId, restaurants: approved.length, existingRules: 0, capabilityEnabled: false, effectiveTimeFuture: true, manifestPath }));
}

const parseEnv = file => Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
const firebaseRequest = async (version, method, body, apiKey) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/${version}/${method}?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
};
const promptValue = (message, { hidden = false } = {}) => {
  const hiddenClause = hidden ? " with hidden answer" : "";
  const prompt = spawnSync("osascript", ["-e", `display dialog ${JSON.stringify(message)} default answer \"\"${hiddenClause} buttons {\"Cancel\", \"Continue\"} default button \"Continue\"`, "-e", "text returned of result"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (prompt.status !== 0) throw new Error("Authentication prompt canceled or unavailable; no scheduling request sent.");
  return prompt.stdout.trim();
};
const promptTotp = () => {
  const code = promptValue("Enter the current six-digit TOTP for the approved Stage A Staging super-admin. The code is used once and is not stored.", { hidden: true });
  if (!/^\d{6}$/.test(code)) throw new Error("A six-digit TOTP is required; no scheduling request sent.");
  return code;
};
const authenticate = async () => {
  const handoff = JSON.parse(fs.readFileSync(path.join(secure, "phase4-staging", "firebase-identity-handoff-1789253635164.json"), "utf8"));
  const actor = handoff.records?.[0]; if (!actor?.email || !actor.password || !actor.firebaseUid) throw new Error("Approved super-admin handoff record missing.");
  const env = parseEnv(path.join(secure, "eas-staging.env"));
  if (env.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== expectedFirebase || !env.EXPO_PUBLIC_FIREBASE_API_KEY) throw new Error("Staging Firebase web configuration mismatch.");
  let email = actor.email, password = actor.password, expectedUid = actor.firebaseUid;
  let first = await firebaseRequest("v1", "accounts:signInWithPassword", { email, password, returnSecureToken: true }, env.EXPO_PUBLIC_FIREBASE_API_KEY);
  if (first.payload?.error?.message === "INVALID_LOGIN_CREDENTIALS") {
    email = promptValue("The protected handoff password is stale. Enter an active Staging super-admin email. It is used once and is not stored.");
    password = promptValue("Enter the Staging super-admin password. It is used once and is not stored.", { hidden: true });
    expectedUid = null;
    if (!email || !password) throw new Error("Staging super-admin credentials are required; no scheduling request sent.");
    first = await firebaseRequest("v1", "accounts:signInWithPassword", { email, password, returnSecureToken: true }, env.EXPO_PUBLIC_FIREBASE_API_KEY);
  }
  const challenge = first.payload?.mfaPendingCredential ? first.payload : first.payload?.error?.details?.find?.(value => value?.mfaPendingCredential) || first.payload?.error?.details?.[0];
  const enrollmentId = challenge?.mfaInfo?.[0]?.mfaEnrollmentId;
  if (!challenge?.mfaPendingCredential || !enrollmentId) throw new Error(`Approved account did not return an MFA challenge (${first.status}); response withheld.`);
  const code = promptTotp();
  const finalized = await firebaseRequest("v2", "accounts/mfaSignIn:finalize", { mfaPendingCredential: challenge.mfaPendingCredential, mfaEnrollmentId: enrollmentId, totpVerificationInfo: { verificationCode: code } }, env.EXPO_PUBLIC_FIREBASE_API_KEY);
  if (!finalized.ok || !finalized.payload?.idToken) throw new Error(`TOTP finalization failed (${finalized.status}); response withheld.`);
  const token = finalized.payload.idToken, claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  if ((expectedUid && claims.sub !== expectedUid) || claims.firebase?.sign_in_second_factor !== "totp" || !Number.isInteger(claims.auth_time) || Date.now() / 1000 - claims.auth_time >= 240) throw new Error("Fresh TOTP token claims failed conservative validation.");
  const contextResponse = await fetch(`${project.url}/rest/v1/rpc/get_my_access_context_v1`, { method: "POST", headers: { apikey: project.publishableKey, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
  const context = await contextResponse.json().catch(() => null);
  if (!contextResponse.ok || context?.accountType !== "admin" || context?.accountStatus !== "active" || context?.adminRole !== "super_admin") throw new Error("Authoritative super-admin context validation failed.");
  return { token, actorProfileId: context.profileId, authTime: claims.auth_time };
};
const rpc = async (name, token, args) => {
  const response = await fetch(`${project.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: project.publishableKey, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  const payload = await response.json().catch(() => null); return { ok: response.ok, status: response.status, payload };
};

if (action === "schedule") {
  if (!fs.existsSync(manifestPath)) throw new Error("Protected first-run manifest required.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.runId !== runId || manifest.projectRef !== expectedRef || JSON.stringify(manifest.approved) !== JSON.stringify(approved)) throw new Error("Protected manifest identity or request matrix changed.");
  let current = state, completed = new Set(current.rules.map(value => value.operationId));
  let auth = await authenticate();
  for (const expected of approved) {
    if (completed.has(expected.operationId)) continue;
    if (Date.now() / 1000 - auth.authTime >= 240) auth = await authenticate();
    const result = await rpc("admin_schedule_restaurant_commission_v1", auth.token, { p_restaurant_id: expected.restaurantId, p_rate_bps: rateBps, p_effective_from: effectiveFrom, p_reason: reason, p_operation_id: expected.operationId });
    if (!result.ok) {
      manifest.results.push({ restaurantId: expected.restaurantId, operationId: expected.operationId, status: "failed", httpStatus: result.status, errorCode: String(result.payload?.code || "unknown").replace(/[^A-Z0-9]/gi, "").slice(0, 32), recordedAt: new Date().toISOString() });
      writeJson("manifest.json", manifest);
      throw new Error(`Scheduling stopped for ${expected.restaurantId} (${result.status}); response withheld.`);
    }
    const value = result.payload;
    if (!value || value.restaurantId !== expected.restaurantId || value.operationId !== expected.operationId || value.rateBps !== rateBps || value.contractVersion !== 1 || normalizeInstant(value.effectiveFrom) !== effectiveFrom || value.reason !== reason || typeof value.ruleId !== "string" || typeof value.replayed !== "boolean") throw new Error(`Malformed scheduling response for ${expected.restaurantId}.`);
    current = await readState(); assertState(current, { allowApprovedRules: true });
    const rule = current.rules.find(item => item.operationId === expected.operationId), audits = current.audits.filter(item => item.metadata?.operation_id === expected.operationId);
    if (!rule || audits.length !== 1 || audits[0].targetId !== rule.id) throw new Error(`Authoritative rule/audit refresh failed for ${expected.restaurantId}.`);
    manifest.results.push({ restaurantId: expected.restaurantId, operationId: expected.operationId, ruleId: rule.id, replayed: value.replayed, status: "success", recordedAt: new Date().toISOString() });
    writeJson("manifest.json", manifest); completed.add(expected.operationId);
  }
  const finalState = await readState(); assertState(finalState, { allowApprovedRules: true });
  if (finalState.rules.length !== approved.length || finalState.audits.length !== approved.length) throw new Error("Final Stage A rule/audit count failed.");
  writeJson("after.json", finalState);
  console.log(JSON.stringify({ action, passed: true, runId, rules: finalState.rules.length, audits: finalState.audits.length, capabilityEnabled: finalState.capabilityEnabled, createdOrReplayed: manifest.results.filter(value => value.status === "success").length }));
}

if (action === "verify") {
  if (!fs.existsSync(manifestPath)) throw new Error("Protected Stage A manifest required.");
  if (state.rules.length !== approved.length || state.audits.length !== approved.length) throw new Error("Stage A is incomplete.");
  const actorIds = new Set(state.rules.map(value => value.createdByProfileId));
  if (actorIds.size !== 1 || state.audits.some(value => value.actorProfileId !== [...actorIds][0])) throw new Error("Rule/audit actor reconciliation failed.");
  writeJson("verification.json", { verifiedAt: new Date().toISOString(), state, passed: true, historicalOrdersUnchanged: state.restaurants.filter(value => value.id === approved[0].restaurantId || value.id === approved[1].restaurantId).map(value => ({ restaurantId: value.id, deliveredWithoutSnapshot: value.deliveredWithoutSnapshot, terms: value.terms, snapshots: value.snapshots })) });
  console.log(JSON.stringify({ action, passed: true, runId, rules: state.rules.length, audits: state.audits.length, capabilityEnabled: state.capabilityEnabled, historicalPilotDeliveredWithoutSnapshot: state.restaurants.find(value => value.id === approved[0].restaurantId)?.deliveredWithoutSnapshot, historicalQaDeliveredWithoutSnapshot: state.restaurants.find(value => value.id === approved[1].restaurantId)?.deliveredWithoutSnapshot }));
}
