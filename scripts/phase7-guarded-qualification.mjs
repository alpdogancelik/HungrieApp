#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { acquirePidLock, appendEvidence, atomicWriteJson, PHASE7_CONTRACT, stableOperationId } from "./phase7-runner-lib.mjs";
import { executeOrderFlow } from "./phase7-order-flow.mjs";
import { exchange, firebaseApp, loadOperatorContext, rpc, sql, sqlQuote as q } from "./phase7-staging-client.mjs";

const kind = process.argv[2], at = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const runDirectory = path.resolve(at("--run-directory") || "");
if (!runDirectory.includes(`${path.sep}secure${path.sep}phase7${path.sep}`) || !["authorization", "load", "deadline", "incident", "cleanup"].includes(kind)) throw new Error("Guarded Phase 7 kind and owner-only run directory are required.");
const context = loadOperatorContext(), fixtures = JSON.parse(fs.readFileSync(path.resolve("secure/phase7/fixtures.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(runDirectory, "manifest.json"), "utf8"));
const progressFile = path.join(runDirectory, `${kind}-progress.json`);
const stopFile = path.join(runDirectory, "stop-request.json");
const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, "utf8")) : { completed: {}, startedAt: new Date().toISOString() };
let releaseWorkload;
try { releaseWorkload = acquirePidLock(path.join(runDirectory, `${kind}-workload.lock`), `Phase 7 ${kind} workload lock`); }
catch (error) { if (error?.code === "PHASE7_LOCK_BUSY") process.exit(75); throw error; }
const save = () => atomicWriteJson(progressFile, progress);
const ensureRunning = () => { if (fs.existsSync(stopFile)) { const error = new Error("Phase 7 stop requested."); error.code = "PHASE7_STOP_REQUESTED"; throw error; } };
const percentile = (values, fraction) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0; };
const operationIds = index => Object.fromEntries(["create", "seen", "preparing", "ready", "out_for_delivery", "delivered"].map(step => [step, stableOperationId(manifest.runId, index, step)]));
const base32 = value => { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const character of value.replaceAll("=", "").toUpperCase()) { const index = alphabet.indexOf(character); if (index < 0) throw new Error("Invalid TOTP secret."); bits += index.toString(2).padStart(5, "0"); } return Buffer.from(bits.match(/.{8}/g)?.map(binary => Number.parseInt(binary, 2)) ?? []); };
const totp = (secret, period = 30, digits = 6, algorithm = "SHA1") => { const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / period))); const digest = crypto.createHmac(algorithm.toLowerCase().replace("hmac", ""), base32(secret)).update(input).digest(), offset = digest[digest.length - 1] & 15; return ((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, "0"); };
const firebaseRequest = async (version, method, body, expected = 200) => { const response = await fetch(`https://identitytoolkit.googleapis.com/${version}/${method}?key=${encodeURIComponent(context.operator.firebaseWebApiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => null); if (response.status !== expected) throw new Error(`Firebase ${method} failed (${response.status}).`); return payload; };

async function loadQualification() {
  const total = PHASE7_CONTRACT.load.sustainedPerMinute * PHASE7_CONTRACT.load.sustainedMinutes + PHASE7_CONTRACT.load.burstPerMinute * PHASE7_CONTRACT.load.burstMinutes;
  progress.total = total; save();
  const realtimeApp = firebaseApp(context, "load-realtime"), realtimeAuth = realtimeApp.auth(), realtimeToken = await exchange(context, await realtimeAuth.createCustomToken(fixtures.firebaseUids.restaurant, { role: "authenticated" }));
  const realtime = createClient(context.staging.url, context.staging.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 200 } }, global: { headers: { Authorization: `Bearer ${realtimeToken}` } } });
  await realtime.realtime.setAuth(realtimeToken);
  const events = new Map(), waiters = new Map();
  const channel = realtime.channel(`restaurant-orders:v1:${fixtures.restaurant}`, { config: { private: true } }).on("broadcast", { event: "order_changed" }, ({ payload }) => { if (payload?.operation !== "insert" || !payload?.order_id) return; const orderId = String(payload.order_id), eventAt = Date.now(), waiter = waiters.get(orderId); if (waiter) { waiters.delete(orderId); waiter(eventAt); } else events.set(orderId, eventAt); });
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error("Private Realtime subscription timed out.")), 15_000); channel.subscribe(status => { if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) { clearTimeout(timeout); reject(new Error(`Private Realtime subscription failed: ${status}`)); } }); });
  const onOrderCreated = async (orderId, requestStartedAt) => { const existing = events.get(orderId); if (existing) { events.delete(orderId); return existing - requestStartedAt; } const eventAt = await new Promise((resolve, reject) => { const timer = setTimeout(() => { waiters.delete(orderId); reject(new Error("Realtime order visibility exceeded ten seconds.")); }, 10_000); waiters.set(orderId, value => { clearTimeout(timer); resolve(value); }); }); return eventAt - requestStartedAt; };
  let nextSlotAt = Date.now();
  try {
  for (let offset = 0; offset < total; offset += PHASE7_CONTRACT.load.workers) {
    ensureRunning();
    const unitIndexes = Array.from({ length: Math.min(PHASE7_CONTRACT.load.workers, total - offset) }, (_, inner) => offset + inner).filter(index => !progress.completed[index]);
    if (unitIndexes.length === 0) continue;
    const sustained = offset < PHASE7_CONTRACT.load.sustainedPerMinute * PHASE7_CONTRACT.load.sustainedMinutes;
    const slotMs = sustained ? 12_000 : 6_000;
    const wait = nextSlotAt - Date.now(); if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    const results = await Promise.all(unitIndexes.map(async index => {
      const outcome = await executeOrderFlow({ context, fixtures, operationIds: operationIds(index + 10_000), stateFile: path.join(runDirectory, `load-unit-${index}.json`), label: `load-${index}`, dependencies: { onOrderCreated } });
      progress.completed[index] = { at: new Date().toISOString(), ...outcome }; save(); return outcome;
    }));
    appendEvidence(path.join(runDirectory, "measurements.jsonl"), { at: new Date().toISOString(), kind: "load-slot", phase: sustained ? "sustained" : "burst", offset, completed: results.length });
    nextSlotAt = Math.max(nextSlotAt + slotMs, Date.now());
  }
  } finally { await realtime.removeChannel(channel); await realtimeApp.delete(); }
  const recovery = await executeOrderFlow({ context, fixtures, operationIds: operationIds(19_999), stateFile: path.join(runDirectory, "poll-recovery-unit.json"), label: "poll-recovery", dependencies: { onOrderCreated: async (orderId, requestStartedAt) => { const deadline = Date.now() + PHASE7_CONTRACT.reliability.recoveryMaximumMs; while (Date.now() <= deadline) { const observed = await rpc(context, realtimeToken, "restaurant_get_order_v1", { p_order_id: orderId }); if (observed.ok) return Date.now() - requestStartedAt; await new Promise(resolve => setTimeout(resolve, 1_000)); } throw new Error("Polling recovery exceeded twenty seconds."); } } });
  const values = Object.values(progress.completed), quoteCreate = values.flatMap(value => [value.measurements.quote, value.measurements.create].filter(Number.isFinite));
  const core = values.flatMap(value => Object.entries(value.measurements).filter(([key, latency]) => !["quote", "create", "realtime_visibility"].includes(key) && Number.isFinite(latency)).map(([, latency]) => latency));
  const visibility = values.map(value => value.measurements.realtime_visibility).filter(Number.isFinite);
  const failures = total - values.length, quoteCreateP95 = percentile(quoteCreate, .95), coreP95 = percentile(core, .95), realtimeP95 = percentile(visibility, .95), failureRate = failures / total;
  const recoveryMs = recovery.measurements.realtime_visibility;
  const passed = failures === 0 && failureRate < PHASE7_CONTRACT.reliability.unexpectedFailureRate && quoteCreateP95 <= PHASE7_CONTRACT.reliability.quoteCreateP95Ms && coreP95 <= PHASE7_CONTRACT.reliability.coreP95Ms && realtimeP95 <= PHASE7_CONTRACT.reliability.realtimeP95Ms && recoveryMs <= PHASE7_CONTRACT.reliability.recoveryMaximumMs;
  return { passed, total, completed: values.length, workers: 10, sustainedOrdersPerMinute: 50, burstOrdersPerMinute: 100, quoteCreateP95Ms: quoteCreateP95, coreP95Ms: coreP95, realtimeVisibilityP95Ms: realtimeP95, pollingRecoveryMs: recoveryMs, unexpectedFailureRate: failureRate };
}

async function deadlineQualification() {
  const app = firebaseApp(context, "deadline"), auth = app.auth();
  try {
    const customer = await exchange(context, await auth.createCustomToken(fixtures.firebaseUids.customer, { role: "authenticated" }));
    const items = [{ menuItemId: fixtures.item, quantity: 1, optionValueIds: [], removedIngredientIds: [] }];
    progress.orders ||= [];
    for (let index = progress.orders.length; index < 105; index += 1) {
      ensureRunning();
      const result = await rpc(context, customer, "create_order_v2", { p_restaurant_id: fixtures.restaurant, p_address_id: fixtures.address, p_payment_method: "cash", p_items: items, p_notes: "", p_operation_id: stableOperationId(manifest.runId, 20_000 + index, "create") });
      if (!result.ok) throw new Error(`Deadline fixture ${index} failed (${result.status}).`);
      progress.orders.push({ id: result.body.orderId, natural: index === 104, createdAt: new Date().toISOString() }); save();
    }
    if (!progress.backdatedAt) {
      const artificial = progress.orders.filter(value => !value.natural).map(value => q(value.id)).join(",");
      await sql(context, `update public.orders set approval_deadline_at=statement_timestamp()-interval '1 second' where id in(${artificial}) and status='pending'`);
      progress.backdatedAt = new Date().toISOString(); save();
    }
    const deadline = Date.now() + 7 * 60_000; let rows = [];
    while (Date.now() < deadline) {
      ensureRunning();
      rows = await sql(context, `select id,status,approval_deadline_at,canceled_at from public.orders where id in(${progress.orders.map(value => q(value.id)).join(",")})`);
      if (rows.length === 105 && rows.every(value => value.status === "canceled")) break;
      await new Promise(resolve => setTimeout(resolve, 15_000));
    }
    const lags = rows.filter(value => value.canceled_at).map(value => Date.parse(value.canceled_at) - Date.parse(value.approval_deadline_at));
    const natural = progress.orders.find(value => value.natural), naturalRow = rows.find(value => value.id === natural.id);
    const p95 = percentile(lags, .95), maximum = lags.length ? Math.max(...lags) : Infinity;
    const passed = rows.length === 105 && lags.length === 105 && naturalRow?.status === "canceled" && p95 <= 30_000 && maximum <= 75_000;
    return { passed, fixtureCount: 105, exceedsBatchSize: true, naturalFiveMinuteOrder: naturalRow?.status === "canceled", p95LateMs: p95, maximumLateMs: maximum };
  } finally { await app.delete(); }
}

async function incidentQualification() {
  const rootId = `${fixtures.prefix}_incident_${manifest.runId.slice(0, 8)}`, below = `${rootId}_below`, atBoundary = `${rootId}_at`, above = `${rootId}_above`, base = "2026-09-18 12:00:00+00";
  if (!progress.prepared) {
    const fixtureSql = (restaurant, ignored, eligible) => `insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at,canceled_at)
      select ${q(`${restaurant}_`)}||g,${q(fixtures.customer)},${q(restaurant)},case when g<=${ignored} then 'canceled'::public.order_status else 'preparing'::public.order_status end,'cash',100,100,${q(base)}::timestamptz-(g||' minutes')::interval,case when g<=${ignored} then ${q(base)}::timestamptz else null end from generate_series(1,${eligible})g;
      insert into private.order_status_history(order_id,previous_status,new_status,source,reason,created_at) select ${q(`${restaurant}_`)}||g,'pending','canceled','system','approval_deadline_expired',${q(base)}::timestamptz from generate_series(1,${ignored})g;`;
    await sql(context, `begin;insert into public.restaurants(id,name,lifecycle_status,accepting_orders,is_active) values
      (${q(below)},'Phase 7 incident below','active',true,true),(${q(atBoundary)},'Phase 7 incident at','active',true,true),(${q(above)},'Phase 7 incident above','active',true,true);
      ${fixtureSql(below, 2, 4)}${fixtureSql(atBoundary, 3, 6)}${fixtureSql(above, 4, 6)}commit;`);
    progress.prepared = true; save();
  }
  const concurrent = await Promise.all([sql(context, `select private.detect_repeated_order_non_response_v1(${q(base)}) created`), sql(context, `select private.detect_repeated_order_non_response_v1(${q(base)}) created`)]);
  const rows = await sql(context, `select restaurant_id,state,ignored_order_count,eligible_order_count,threshold_snapshot from private.restaurant_operational_incidents where restaurant_id in(${q(below)},${q(atBoundary)},${q(above)}) order by restaurant_id`);
  const restaurants = await sql(context, `select id,lifecycle_status,accepting_orders from public.restaurants where id in(${q(below)},${q(atBoundary)},${q(above)})`);
  const created = concurrent.flat().reduce((sum, value) => sum + Number(value.created), 0);
  const atRow = rows.find(value => value.restaurant_id === atBoundary), aboveRow = rows.find(value => value.restaurant_id === above);
  await sql(context, `update private.restaurant_operational_incidents set state='resolved',resolved_at=${q(base)}::timestamptz+interval '2 minutes',resolution_note='Phase 7 controlled resolution' where restaurant_id=${q(atBoundary)} and state<>'resolved'`);
  await sql(context, `begin;insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at,canceled_at) select ${q(`${atBoundary}_cooldown_`)}||g,${q(fixtures.customer)},${q(atBoundary)},'canceled','cash',100,100,${q(base)}::timestamptz+interval '20 minutes'-(g||' minutes')::interval,${q(base)}::timestamptz+interval '20 minutes' from generate_series(1,3)g;insert into private.order_status_history(order_id,previous_status,new_status,source,reason,created_at)select ${q(`${atBoundary}_cooldown_`)}||g,'pending','canceled','system','approval_deadline_expired',${q(base)}::timestamptz+interval '20 minutes' from generate_series(1,3)g;commit;`);
  const [cooldown] = await sql(context, `select private.detect_repeated_order_non_response_v1(${q(base)}::timestamptz+interval '30 minutes') created`);
  const reopenBase = "2026-09-18 13:03:00+00";
  await sql(context, `begin;insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at,canceled_at) select ${q(`${atBoundary}_reopen_`)}||g,${q(fixtures.customer)},${q(atBoundary)},'canceled','cash',100,100,${q(reopenBase)}::timestamptz-(g||' minutes')::interval,${q(reopenBase)}::timestamptz from generate_series(1,3)g;insert into private.order_status_history(order_id,previous_status,new_status,source,reason,created_at)select ${q(`${atBoundary}_reopen_`)}||g,'pending','canceled','system','approval_deadline_expired',${q(reopenBase)}::timestamptz from generate_series(1,3)g;commit;`);
  const [reopened] = await sql(context, `select private.detect_repeated_order_non_response_v1(${q(reopenBase)}) created`);
  const openCount = await sql(context, `select restaurant_id,count(*)::integer count from private.restaurant_operational_incidents where restaurant_id in(${q(atBoundary)},${q(above)}) and state<>'resolved' group by restaurant_id`);
  const noAutomaticChange = restaurants.every(value => value.lifecycle_status === "active" && value.accepting_orders === true);
  const passed = created === 2 && rows.length === 2 && !rows.some(value => value.restaurant_id === below) && atRow?.ignored_order_count === 3 && atRow?.eligible_order_count === 6 && aboveRow?.ignored_order_count === 4 && Number(cooldown.created) === 0 && Number(reopened.created) === 1 && openCount.every(value => value.count === 1) && noAutomaticChange;
  return { passed, belowThresholdOpened: false, atThresholdOpened: Boolean(atRow), aboveThresholdOpened: Boolean(aboveRow), ratioBoundaryBasisPoints: 5000, concurrentCreated: created, unresolvedUnique: openCount.every(value => value.count === 1), cooldownBlockedAtThirtyMinutes: Number(cooldown.created) === 0, reopenedAfterSixtyMinutes: Number(reopened.created) === 1, automaticSuspensionAbsent: noAutomaticChange, automaticAcceptanceChangeAbsent: noAutomaticChange, sla: { acknowledgementMinutes: 15, resolutionMinutes: 1440 }, fixtureRootDigest: crypto.createHash("sha256").update(rootId).digest("hex") };
}

async function authorizationQualification() {
  const app = firebaseApp(context, "authorization"), auth = app.auth(), prefix = `${fixtures.prefix}_auth_${manifest.runId.slice(0, 8)}`;
  const ids = { suspended: `${prefix}_suspended`, revoked: `${prefix}_revoked`, pending: `${prefix}_pending`, unmapped: `${prefix}_unmapped`, restaurantB: `${prefix}_restaurant_b`, restaurantBUser: `${prefix}_restaurant_b_user`, admin: `${prefix}_admin` };
  const users = {}, tokens = {}, createdUids = [], restaurantB = `${prefix}_restaurant`;
  try {
    const ensureUser = async (key, id, password) => { try { users[key] = await auth.getUser(id); } catch (error) { if (error?.code !== "auth/user-not-found") throw error; users[key] = await auth.createUser({ uid: id, email: `${id}@example.invalid`, emailVerified: true, ...(password ? { password } : {}) }); createdUids.push(id); } };
    const adminPassword = `P7!${crypto.randomBytes(24).toString("base64url")}`;
    for (const key of ["suspended", "revoked", "pending", "unmapped", "restaurantB"]) await ensureUser(key, key === "restaurantB" ? ids.restaurantBUser : ids[key]);
    await auth.deleteUser(ids.admin).catch(error => { if (error?.code !== "auth/user-not-found") throw error; });
    users.admin = await auth.createUser({ uid: ids.admin, email: `${ids.admin}@example.invalid`, emailVerified: true, password: adminPassword }); createdUids.push(ids.admin);
    await auth.setCustomUserClaims(users.admin.uid, { role: "authenticated" });
    await sql(context, `begin;insert into public.restaurants(id,name,lifecycle_status,accepting_orders,is_active) values(${q(restaurantB)},'Phase 7 authorization B','active',true,true) on conflict(id)do nothing;
      insert into public.profiles(id,firebase_uid,name,email) values
      (${q(ids.suspended)},${q(users.suspended.uid)},'Phase 7 suspended',${q(users.suspended.email)}),(${q(ids.revoked)},${q(users.revoked.uid)},'Phase 7 revoked',${q(users.revoked.email)}),
      (${q(ids.pending)},${q(users.pending.uid)},'Phase 7 pending',${q(users.pending.email)}),(${q(ids.restaurantBUser)},${q(users.restaurantB.uid)},'Phase 7 Restaurant B',${q(users.restaurantB.email)}),
      (${q(ids.admin)},${q(users.admin.uid)},'Phase 7 Admin',${q(users.admin.email)}) on conflict(id)do nothing;
      insert into private.account_access(profile_id,account_type,status,onboarding_step,restaurant_id,restaurant_role,admin_role,admin_mfa_enrolled_at,activated_at,suspended_at,revoked_at) values
      (${q(ids.suspended)},'customer','suspended','none',null,null,null,null,transaction_timestamp(),transaction_timestamp(),null),
      (${q(ids.revoked)},'customer','revoked','none',null,null,null,null,transaction_timestamp(),null,transaction_timestamp()),
      (${q(ids.pending)},'restaurant','pending','restaurant_approval_required',${q(fixtures.restaurant)},'manager',null,null,null,null,null),
      (${q(ids.restaurantBUser)},'restaurant','active','none',${q(restaurantB)},'owner',null,null,transaction_timestamp(),null,null),
      (${q(ids.admin)},'admin','active','none',null,null,'admin',transaction_timestamp(),transaction_timestamp(),null,null) on conflict(profile_id)do nothing;commit;`);
    const customer = await exchange(context, await auth.createCustomToken(fixtures.firebaseUids.customer, { role: "authenticated" })), restaurant = await exchange(context, await auth.createCustomToken(fixtures.firebaseUids.restaurant, { role: "authenticated" }));
    for (const key of ["suspended", "revoked", "pending", "unmapped", "restaurantB"]) tokens[key] = await exchange(context, await auth.createCustomToken(users[key].uid, { role: "authenticated" }));
    const firstFactor = await firebaseRequest("v1", "accounts:signInWithPassword", { email: users.admin.email, password: adminPassword, returnSecureToken: true });
    const enrollment = await firebaseRequest("v2", "accounts/mfaEnrollment:start", { idToken: firstFactor.idToken, totpEnrollmentInfo: {} }), session = enrollment?.totpSessionInfo;
    if (!session?.sharedSecretKey || !session.sessionInfo) throw new Error("Admin TOTP enrollment did not start.");
    const enrollmentCode = totp(session.sharedSecretKey, session.periodSec, session.verificationCodeLength, session.hashingAlgorithm);
    await firebaseRequest("v2", "accounts/mfaEnrollment:finalize", { idToken: firstFactor.idToken, displayName: "Phase 7 qualification", totpVerificationInfo: { sessionInfo: session.sessionInfo, verificationCode: enrollmentCode } });
    const challengeResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(context.operator.firebaseWebApiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: users.admin.email, password: adminPassword, returnSecureToken: true }) }), challengePayload = await challengeResponse.json().catch(() => null), challenge = challengePayload?.mfaPendingCredential ? challengePayload : challengePayload?.error?.details?.[0], enrollmentId = challenge?.mfaInfo?.[0]?.mfaEnrollmentId;
    if (!challenge?.mfaPendingCredential || !enrollmentId) throw new Error("Admin TOTP sign-in challenge failed.");
    if (totp(session.sharedSecretKey, session.periodSec, session.verificationCodeLength, session.hashingAlgorithm) === enrollmentCode) { const period = session.periodSec * 1000; await new Promise(resolve => setTimeout(resolve, Math.ceil(Date.now() / period) * period - Date.now() + 500)); }
    const mfa = await firebaseRequest("v2", "accounts/mfaSignIn:finalize", { mfaPendingCredential: challenge.mfaPendingCredential, mfaEnrollmentId: enrollmentId, totpVerificationInfo: { verificationCode: totp(session.sharedSecretKey, session.periodSec, session.verificationCodeLength, session.hashingAlgorithm) } });
    tokens.admin = mfa.idToken;
    const checks = [];
    const expect = async (label, token, name, shouldPass, args = {}) => { const result = await rpc(context, token, name, args); checks.push({ label, status: result.status, passed: result.ok === shouldPass }); };
    await expect("active-customer-own-portal", customer, "get_my_customer_profile_v1", true);
    await expect("customer-wrong-restaurant-portal", customer, "restaurant_get_dashboard_v1", false);
    await expect("customer-wrong-admin-portal", customer, "admin_get_dashboard_v1", false);
    await expect("active-restaurant-own-portal", restaurant, "restaurant_get_dashboard_v1", true);
    await expect("restaurant-wrong-customer-portal", restaurant, "get_my_customer_profile_v1", false);
    await expect("restaurant-wrong-admin-portal", restaurant, "admin_get_dashboard_v1", false);
    for (const key of ["suspended", "revoked", "unmapped"]) {
      await expect(`${key}-customer-denied`, tokens[key], "get_my_customer_profile_v1", false);
      await expect(`${key}-restaurant-denied`, tokens[key], "restaurant_get_dashboard_v1", false);
      await expect(`${key}-admin-denied`, tokens[key], "admin_get_dashboard_v1", false);
    }
    await expect("pending-restaurant-business-denied", tokens.pending, "restaurant_get_dashboard_v1", false);
    await expect("pending-customer-denied", tokens.pending, "get_my_customer_profile_v1", false);
    await expect("pending-admin-denied", tokens.pending, "admin_get_dashboard_v1", false);
    await expect("admin-own-portal-recent-totp", tokens.admin, "admin_get_dashboard_v1", true);
    await expect("admin-wrong-customer-portal", tokens.admin, "get_my_customer_profile_v1", false);
    await expect("admin-wrong-restaurant-portal", tokens.admin, "restaurant_get_dashboard_v1", false);
    await expect("restaurant-b-own-portal", tokens.restaurantB, "restaurant_get_dashboard_v1", true);
    const foreignCreated = await rpc(context, customer, "create_order_v2", { p_restaurant_id: fixtures.restaurant, p_address_id: fixtures.address, p_payment_method: "cash", p_items: [{ menuItemId: fixtures.item, quantity: 1, optionValueIds: [], removedIngredientIds: [] }], p_notes: "", p_operation_id: stableOperationId(manifest.runId, 30_000, "create") });
    if (!foreignCreated.ok || !foreignCreated.body?.orderId) throw new Error("Cross-tenant fixture order could not be created through the guarded contract.");
    await expect("restaurant-b-cross-tenant-order", tokens.restaurantB, "restaurant_get_order_v1", false, { p_order_id: foreignCreated.body.orderId });
    await expect("anonymous-private-rpc", null, "get_my_customer_profile_v1", false);
    const direct = await fetch(`${context.staging.url}/rest/v1/orders`, { method: "POST", headers: { apikey: context.staging.publishableKey, authorization: `Bearer ${customer}`, "content-type": "application/json" }, body: "{}" });
    checks.push({ label: "direct-table-write-denied", status: direct.status, passed: !direct.ok });
    await sql(context, `update private.account_access set status='suspended',suspended_at=transaction_timestamp(),authz_version=authz_version+1 where profile_id=${q(fixtures.customer)}`);
    await expect("live-customer-suspension-denied", customer, "get_my_customer_profile_v1", false);
    await sql(context, `update private.account_access set status='active',suspended_at=null,authz_version=authz_version+1 where profile_id=${q(fixtures.customer)}`);
    await expect("customer-recovery", customer, "get_my_customer_profile_v1", true);
    await sql(context, `begin;set local role authenticated;select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288','sub',${q(users.admin.uid)},'email_verified',true,'auth_time',extract(epoch from statement_timestamp()-interval '10 minutes')::bigint,'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);do $$begin perform public.admin_create_restaurant_v1('Phase 7 stale auth',gen_random_uuid());raise exception 'stale auth unexpectedly accepted';exception when insufficient_privilege then null;end$$;rollback;`);
    checks.push({ label: "stale-admin-auth-denied", status: 403, passed: true });
    const [versionPolicy] = await sql(context, `begin;update private.client_release_policy set update_required=true,minimum_build_number=40,minimum_api_contract=1 where application='customer' and platform='ios';select (public.get_client_release_policy_v1('customer','ios',39,1)->>'update_required')::boolean old_blocked,(public.get_client_release_policy_v1('customer','ios',40,1)->>'update_required')::boolean verified_blocked;rollback;`);
    checks.push({ label: "minimum-version-boundary", status: 200, passed: versionPolicy?.old_blocked === true && versionPolicy?.verified_blocked === false });
    return { passed: checks.every(value => value.passed), checks, recentTotp: true, staleAuthenticationDenied: true, suspensionWhileOpenDenied: true, recoveryVerified: true, minimumVersionBoundaryVerified: true };
  } finally {
    await sql(context, `update private.account_access set status='active',suspended_at=null,authz_version=authz_version+1 where profile_id=${q(fixtures.customer)} and account_type='customer'`).catch(() => {});
    await sql(context, `begin;delete from private.audit_log where actor_profile_id like ${q(`${prefix}%`)} or metadata::text like ${q(`%${prefix}%`)};delete from private.account_access where profile_id like ${q(`${prefix}%`)};delete from public.profiles where id like ${q(`${prefix}%`)};delete from public.restaurants where id=${q(restaurantB)};commit;`).catch(() => {});
    for (const user of Object.values(users)) await auth.deleteUser(user.uid).catch(error => { if (error?.code !== "auth/user-not-found") throw error; });
    await app.delete();
  }
}

async function cleanupQualification() {
  const prefix = fixtures.prefix;
  await sql(context, `begin;
    create temporary table phase7_cleanup_orders on commit drop as select id from public.orders where restaurant_id like ${q(`${prefix}%`)};
    delete from private.notification_deliveries where event_id in(select id from private.notification_events where order_id in(select id from phase7_cleanup_orders));
    delete from private.notification_events where order_id in(select id from phase7_cleanup_orders);
    delete from private.restaurant_operations where result->>'orderId' in(select id from phase7_cleanup_orders);
    delete from private.customer_order_operations where order_id in(select id from phase7_cleanup_orders);
    delete from private.restaurant_order_visibility where order_id in(select id from phase7_cleanup_orders);
    delete from private.order_status_history where order_id in(select id from phase7_cleanup_orders);
    delete from private.order_contacts where order_id in(select id from phase7_cleanup_orders);
    delete from public.order_items where order_id in(select id from phase7_cleanup_orders);
    delete from private.audit_log where target_id in(select id from phase7_cleanup_orders) or actor_profile_id like ${q(`${prefix}%`)} or metadata::text like ${q(`%${prefix}%`)};
    delete from public.orders where id in(select id from phase7_cleanup_orders);
    delete from private.restaurant_operational_incidents where restaurant_id like ${q(`${prefix}%`)};
    delete from public.menu_items where id like ${q(`${prefix}%`)};delete from public.categories where id like ${q(`${prefix}%`)};
    delete from public.addresses where id like ${q(`${prefix}%`)};delete from private.account_access where profile_id like ${q(`${prefix}%`)};
    delete from public.profiles where id like ${q(`${prefix}%`)};delete from public.restaurants where id like ${q(`${prefix}%`)};commit;`);
  const [remaining] = await sql(context, `select (select count(*) from public.orders where restaurant_id like ${q(`${prefix}%`)})::integer orders,(select count(*) from public.profiles where id like ${q(`${prefix}%`)})::integer profiles,(select count(*) from public.restaurants where id like ${q(`${prefix}%`)})::integer restaurants`);
  const app = firebaseApp(context, "cleanup"), auth = app.auth();
  try { for (const uid of Object.values(fixtures.firebaseUids)) await auth.deleteUser(uid).catch(error => { if (error?.code !== "auth/user-not-found") throw error; }); } finally { await app.delete(); }
  const passed = remaining.orders === 0 && remaining.profiles === 0 && remaining.restaurants === 0;
  return { passed, taggedFixtureCounts: remaining, exactTaggedCleanup: passed };
}

const heartbeat = setInterval(() => appendEvidence(path.join(runDirectory, "heartbeats.jsonl"), { at: new Date().toISOString(), pid: process.pid, child: kind }), 60_000);
let healthRunning = false;
const health = setInterval(async () => {
  if (healthRunning) return; healthRunning = true;
  try {
    const [sample] = await sql(context, `select statement_timestamp() sampled_at,(select count(*)::integer from public.orders where approval_deadline_at<statement_timestamp() and status='pending') overdue_pending_orders,(select count(*)::integer from private.restaurant_operational_incidents where state<>'resolved') unresolved_incidents,(select count(*)::integer from private.notification_deliveries where state in('pending','processing')) notification_backlog,(select max(end_time) from cron.job_run_details where status='succeeded') latest_job_run_at`);
    appendEvidence(path.join(runDirectory, "health.jsonl"), { at: new Date().toISOString(), ...sample });
  } catch (error) {
    appendEvidence(path.join(runDirectory, "health.jsonl"), { at: new Date().toISOString(), error: "health_sample_failed" });
  } finally { healthRunning = false; }
}, 300_000);
try {
  let outcome;
  if (kind === "load") outcome = await loadQualification();
  else if (kind === "deadline") outcome = await deadlineQualification();
  else if (kind === "incident") outcome = await incidentQualification();
  else if (kind === "authorization") outcome = await authorizationQualification();
  else outcome = await cleanupQualification();
  console.log(JSON.stringify(outcome));
} catch (error) {
  if (error?.code === "PHASE7_STOP_REQUESTED") process.exitCode = 76;
  else throw error;
} finally { clearInterval(heartbeat); clearInterval(health); releaseWorkload(); }
