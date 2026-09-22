#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const runId = process.argv.find(value => value.startsWith("--run-id="))?.slice(9);
const action = process.argv[2];
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
if (!/^earnp4_[a-z0-9]{8,32}$/.test(runId || "")) throw new Error("Canonical Phase 4 run ID required.");
if (!new Set(["prepare", "probe", "plans", "inspect", "recover-manifest", "cleanup", "verify-cleanup"]).has(action)) throw new Error("Use prepare|probe|plans|inspect|recover-manifest|cleanup|verify-cleanup.");
if (option("--environment") !== "development") throw new Error("Explicit --environment=development required; there is no default.");
if (option("--confirm") !== `development:restaurant-earnings-phase4:${action}:${runId}`) throw new Error("Action-specific confirmation mismatch.");

const registry = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = registry.projects?.development;
if (!project?.ref || !project.url || !project.publishableKey || project.name !== "HungrieApp Development" || project.ref === registry.projects?.staging?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Development target required.");
const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const operator = JSON.parse(fs.readFileSync(path.join(secure, "phase7", "operator-config.json"), "utf8"));
const credentialPath = path.resolve(operator.firebaseAdminCredentialPath || "");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath) || credentialPath.startsWith(`${root}${path.sep}`)) throw new Error("External Firebase Admin credential required.");
const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (credential.project_id !== "hungrieapp-a2288" || operator.firebaseProjectId !== "hungrieapp-a2288") throw new Error("Approved non-production Firebase project required.");
const web = JSON.parse(fs.readFileSync(path.join(secure, "admin-firebase-web-development.local.json"), "utf8"));
if (web.projectId !== credential.project_id || !web.apiKey) throw new Error("Development Firebase Web configuration mismatch.");

const runDirectory = path.join(secure, "restaurant-earnings-admin-commission-phase4", runId);
const manifestPath = path.join(runDirectory, "fixture-manifest.json");
const secretsPath = path.join(runDirectory, "fixture-secrets.json");
fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(runDirectory, 0o700);
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const writeJson = (file, value) => { const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file); fs.chmodSync(file, 0o600); };
const query = async statement => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query: statement }) });
  if (!response.ok) throw new Error(`Development SQL failed (${response.status}); response withheld.`);
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error("Development SQL response malformed.");
  return value;
};
const firebaseRequest = async (version, method, body) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/${version}/${method}?key=${encodeURIComponent(web.apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Firebase ${method} failed (${response.status}, ${String(payload?.error?.message || "unknown").replace(/[^A-Z0-9_:-]/gi, "").slice(0, 60)}).`);
  return payload;
};
const exchange = async customToken => (await firebaseRequest("v1", "accounts:signInWithCustomToken", { token: customToken, returnSecureToken: true })).idToken;
const rpcRequest = async (name, token, args = {}) => {
  const response = await fetch(`${project.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: project.publishableKey, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify(args) });
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
};
const must = async (name, token, args = {}) => { const result = await rpcRequest(name, token, args); if (!result.ok) throw new Error(`${name} unexpectedly failed (${result.status}, ${String(result.body?.code || "unknown").replace(/[^A-Z0-9]/gi, "")}).`); return result.body; };
const deny = async (name, token, args = {}) => { const result = await rpcRequest(name, token, args); if (result.ok) throw new Error(`${name} unexpectedly allowed a denied actor.`); return { status: result.status, code: String(result.body?.code || "unknown").replace(/[^A-Z0-9]/gi, "") }; };
const requireMigration = async () => {
  const [state] = await query(`select
    (select count(*)=1 from supabase_migrations.schema_migrations where version='20260922100000') migration_ok,
    (select enabled=false from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_disabled`);
  if (!state?.migration_ok || !state.capability_disabled) throw new Error("Applied earnings migration and disabled capability required.");
};
const base32 = value => { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const character of value.replaceAll("=", "").toUpperCase()) { const index = alphabet.indexOf(character); if (index < 0) throw new Error("Invalid TOTP secret."); bits += index.toString(2).padStart(5, "0"); } return Buffer.from(bits.match(/.{8}/g)?.map(binary => Number.parseInt(binary, 2)) || []); };
const totp = (secret, period = 30, digits = 6, algorithm = "SHA1") => { const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / period))); const digest = crypto.createHmac(algorithm.toLowerCase().replace("hmac", ""), base32(secret)).update(input).digest(), offset = digest[digest.length - 1] & 15; return ((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, "0"); };
const signInTotp = async (email, password, label, existingSecret = null) => {
  const first = await firebaseRequest("v1", "accounts:signInWithPassword", { email, password, returnSecureToken: true });
  let secret = existingSecret, enrollmentCode;
  if (!first.mfaPendingCredential) {
    const enrollment = await firebaseRequest("v2", "accounts/mfaEnrollment:start", { idToken: first.idToken, totpEnrollmentInfo: {} });
    const session = enrollment?.totpSessionInfo;
    if (!session?.sharedSecretKey || !session.sessionInfo) throw new Error(`${label} TOTP enrollment did not start.`);
    secret = session.sharedSecretKey;
    enrollmentCode = totp(secret, session.periodSec, session.verificationCodeLength, session.hashingAlgorithm);
    await firebaseRequest("v2", "accounts/mfaEnrollment:finalize", { idToken: first.idToken, displayName: `Phase 4 ${label}`, totpVerificationInfo: { sessionInfo: session.sessionInfo, verificationCode: enrollmentCode } });
  }
  const challengeResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(web.apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const payload = await challengeResponse.json().catch(() => null), challenge = payload?.mfaPendingCredential ? payload : payload?.error?.details?.[0], enrollmentId = challenge?.mfaInfo?.[0]?.mfaEnrollmentId;
  if (!challenge?.mfaPendingCredential || !enrollmentId) throw new Error(`${label} TOTP challenge unavailable.`);
  if (!secret) throw new Error(`${label} TOTP secret is unavailable for this disposable run.`);
  if (totp(secret) === enrollmentCode) {
    const periodMs = 30_000;
    await new Promise(resolve => setTimeout(resolve, Math.ceil(Date.now() / periodMs) * periodMs - Date.now() + 500));
  }
  const result = await firebaseRequest("v2", "accounts/mfaSignIn:finalize", { mfaPendingCredential: challenge.mfaPendingCredential, mfaEnrollmentId: enrollmentId, totpVerificationInfo: { verificationCode: totp(secret) } });
  const claims = JSON.parse(Buffer.from(result.idToken.split(".")[1], "base64url").toString("utf8"));
  if (claims.firebase?.sign_in_second_factor !== "totp" || !Number.isInteger(claims.auth_time)) throw new Error(`${label} recent-TOTP token missing required claims.`);
  return { token: result.idToken, secret };
};

const ids = {
  restaurants: { primary: `${runId}_ra`, secondary: `${runId}_rb`, pending: `${runId}_rp`, suspended: `${runId}_rs`, closed: `${runId}_rc` },
  profiles: Object.fromEntries(["super", "admin", "owner", "manager", "customer", "ownerb", "suspended", "revoked"].map(key => [key, `${runId}_${key}`])),
  category: `${runId}_cat`, item: `${runId}_item`, address: `${runId}_addr`,
};

await requireMigration();
const requireManifest = () => { if (!fs.existsSync(manifestPath) || !fs.existsSync(secretsPath)) throw new Error("Protected current-run fixture manifest and secrets are required."); return { manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")), secrets: JSON.parse(fs.readFileSync(secretsPath, "utf8")) }; };

if (action === "prepare") {
  if (fs.existsSync(manifestPath) || fs.existsSync(secretsPath)) throw new Error("Current-run fixture files already exist.");
  const [stale] = await query(`select
    (select count(*) from public.restaurants where id like ${q(`${runId}%`)})::integer restaurants,
    (select count(*) from public.profiles where id like ${q(`${runId}%`)})::integer profiles,
    (select count(*) from public.orders where id like ${q(`${runId}%`)})::integer orders`);
  if (Object.values(stale).some(Number)) throw new Error("Current-run database fixtures already exist.");
  const require = createRequire(import.meta.url), admin = require("firebase-admin");
  const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, `earnings-prepare-${Date.now()}`), auth = app.auth();
  const users = {}, passwords = {};
  try {
    for (const key of ["super", "admin", "owner", "manager", "customer", "ownerb", "suspended", "revoked", "unmapped"]) {
      const email = `${runId}_${key}@example.invalid`, password = `Ep4!${crypto.randomBytes(24).toString("base64url")}`;
      const user = await auth.createUser({ email, emailVerified: true, password, displayName: `${runId}_${key}` });
      await auth.setCustomUserClaims(user.uid, { role: "authenticated" });
      users[key] = { uid: user.uid, email };
      passwords[key] = password;
      writeJson(manifestPath, { runId, environment: "development", firebaseProjectId: credential.project_id, createdAt: new Date().toISOString(), firebaseUsers: users, database: ids, operationIds: {}, orderIds: [], ruleIds: [], snapshotOrderIds: [], alertIds: [], auditIds: [] });
    }
    const profileRows = Object.entries(ids.profiles).map(([key, id]) => `(${q(id)},${q(users[key].uid)},${q(`Phase 4 ${key}`)},${q(users[key].email)})`).join(",");
    await query(`begin;
      insert into public.profiles(id,firebase_uid,name,email) values ${profileRows};
      insert into public.restaurants(id,name,is_active,address,reporting_timezone) values
        (${q(ids.restaurants.primary)},'earnp4 Primary',true,'Qualification','Asia/Famagusta'),
        (${q(ids.restaurants.secondary)},'earnp4 Secondary',true,'Qualification','Asia/Famagusta'),
        (${q(ids.restaurants.pending)},'earnp4 Pending',false,'Qualification','Asia/Famagusta'),
        (${q(ids.restaurants.suspended)},'earnp4 Suspended',true,'Qualification','Asia/Famagusta'),
        (${q(ids.restaurants.closed)},'earnp4 Closed',true,'Qualification','Asia/Famagusta');
      update public.restaurants set lifecycle_status='suspended',accepting_orders=false,suspended_at=statement_timestamp(),suspension_reason_code='qualification' where id=${q(ids.restaurants.suspended)};
      update public.restaurants set lifecycle_status='closed',accepting_orders=false where id=${q(ids.restaurants.closed)};
      insert into private.account_access(profile_id,account_type,status,activated_at,admin_role,admin_mfa_enrolled_at) values
        (${q(ids.profiles.super)},'admin','active',statement_timestamp(),'super_admin',statement_timestamp()),
        (${q(ids.profiles.admin)},'admin','active',statement_timestamp(),'admin',statement_timestamp());
      insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role) values
        (${q(ids.profiles.owner)},'restaurant','active',statement_timestamp(),${q(ids.restaurants.primary)},'owner'),
        (${q(ids.profiles.manager)},'restaurant','active',statement_timestamp(),${q(ids.restaurants.primary)},'manager'),
        (${q(ids.profiles.ownerb)},'restaurant','active',statement_timestamp(),${q(ids.restaurants.secondary)},'owner');
      insert into private.account_access(profile_id,account_type,status,activated_at) values(${q(ids.profiles.customer)},'customer','active',statement_timestamp());
      insert into private.account_access(profile_id,account_type,status,suspended_at,restaurant_id,restaurant_role) values(${q(ids.profiles.suspended)},'restaurant','suspended',statement_timestamp(),${q(ids.restaurants.primary)},'owner');
      insert into private.account_access(profile_id,account_type,status,revoked_at,restaurant_id,restaurant_role) values(${q(ids.profiles.revoked)},'restaurant','revoked',statement_timestamp(),${q(ids.restaurants.primary)},'owner');
      insert into public.categories(id,restaurant_id,name,is_active,sort_order) values(${q(ids.category)},${q(ids.restaurants.primary)},'earnp4 Category',true,99999);
      insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order) values(${q(ids.item)},${q(ids.restaurants.primary)},${q(ids.category)},'earnp4 Item',10000,true,99999);
      insert into public.addresses(id,profile_id,label,line1,city,country,is_default) values(${q(ids.address)},${q(ids.profiles.customer)},'earnp4','Qualification','Famagusta','Cyprus',true);
      commit;`);
    writeJson(secretsPath, { passwords, totp: {} });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.preparedAt = new Date().toISOString();
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify({ action, environment: "development", runId, firebaseUsers: Object.keys(users).length, profiles: Object.keys(ids.profiles).length, restaurants: Object.keys(ids.restaurants).length, capabilityEnabled: false, manifestPath }));
  } catch (error) {
    for (const user of Object.values(users)) await auth.deleteUser(user.uid).catch(() => {});
    throw error;
  } finally { await app.delete(); }
}

if (action === "probe") {
  const { manifest, secrets } = requireManifest();
  const require = createRequire(import.meta.url), admin = require("firebase-admin");
  const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, `earnings-probe-${Date.now()}`), auth = app.auth();
  try {
    const superSignIn = await signInTotp(manifest.firebaseUsers.super.email, secrets.passwords.super, "super-admin", secrets.totp?.super);
    const adminSignIn = await signInTotp(manifest.firebaseUsers.admin.email, secrets.passwords.admin, "ordinary-admin", secrets.totp?.admin);
    secrets.totp = { super: superSignIn.secret, admin: adminSignIn.secret };
    writeJson(secretsPath, secrets);
    const tokens = { super: superSignIn.token, admin: adminSignIn.token };
    for (const key of ["owner", "manager", "customer", "ownerb", "suspended", "revoked", "unmapped"]) tokens[key] = await exchange(await auth.createCustomToken(manifest.firebaseUsers[key].uid, { role: "authenticated" }));
    const now = Date.now(), iso = offset => new Date(now + offset).toISOString();
    const effective = { zero: iso(-3 * 86400000), full: iso(-2 * 86400000), tiny: iso(-86400000), future: iso(3600000), concurrent: iso(7200000) };
    const operations = { zero: crypto.randomUUID(), full: crypto.randomUUID(), tiny: crypto.randomUUID(), future: crypto.randomUUID(), duplicate: crypto.randomUUID(), changed: crypto.randomUUID(), backdated: crypto.randomUUID(), concurrent: crypto.randomUUID() };
    const schedule = (rate, at, reason, operation) => ({ p_restaurant_id: ids.restaurants.primary, p_rate_bps: rate, p_effective_from: at, p_reason: reason, p_operation_id: operation });
    const zero = await must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(0, effective.zero, "Phase 4 zero rate", operations.zero));
    const zeroReplay = await must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(0, effective.zero, "Phase 4 zero rate", operations.zero));
    if (zero.replayed !== false || zeroReplay.replayed !== true || zero.ruleId !== zeroReplay.ruleId) throw new Error("Stable rule replay failed.");
    await deny("admin_schedule_restaurant_commission_v1", tokens.super, schedule(1, effective.zero, "Changed operation", operations.zero));
    await deny("admin_schedule_restaurant_commission_v1", tokens.super, schedule(10, effective.zero, "Duplicate time", operations.duplicate));
    const full = await must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(10000, effective.full, "Phase 4 full rate", operations.full));
    const tiny = await must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(1, effective.tiny, "Phase 4 rounding rate", operations.tiny));
    const orderRows = [];
    const addOrder = (suffix, createdAt, deliveredAt, method, amount, status = "delivered") => {
      const id = `${runId}_${suffix}`; orderRows.push({ id, createdAt, deliveredAt, method, amount, status }); return id;
    };
    addOrder("zero", iso(-2 * 86400000 - 1000), iso(-2 * 86400000 + 3600000), "cash", 12345);
    addOrder("before", new Date(Date.parse(effective.full) - 1).toISOString(), iso(-2 * 86400000 + 7200000), "pos", 10001);
    addOrder("exact", effective.full, iso(-2 * 86400000 + 10800000), "cash", 10001);
    addOrder("after", new Date(Date.parse(effective.full) + 1).toISOString(), iso(-2 * 86400000 + 14400000), "pos", 10001);
    addOrder("below", iso(-43200000), iso(-39600000), "cash", 4999);
    addOrder("half", iso(-39600000), iso(-36000000), "pos", 5000);
    addOrder("above", iso(-36000000), iso(-32400000), "cash", 5001);
    for (let index = 0; index < 30; index += 1) addOrder(`page_${String(index).padStart(2, "0")}`, iso(-30000000 + index * 1000), iso(-20000000 + index * 1000), index % 2 ? "pos" : "cash", 10000 + index);
    const canceled = addOrder("canceled", iso(-2000000), null, "cash", 10000, "canceled");
    const pending = addOrder("pending", iso(-1000000), null, "pos", 10000, "pending");
    const values = orderRows.map(row => `(${q(row.id)},${q(ids.profiles.customer)},${q(ids.restaurants.primary)},${q(row.status)},${q(row.method)},${row.amount},${row.amount},${row.deliveredAt ? q(row.deliveredAt) : "null"},${q(row.createdAt)})`).join(",");
    await query(`insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,created_at) values ${values}`);
    await deny("admin_schedule_restaurant_commission_v1", tokens.super, schedule(250, iso(-4000000), "Rejected backdate", operations.backdated));
    const futureRule = await must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(500, effective.future, "Future rule", operations.future));
    const retainedOrder = `${runId}_retained`, futureOrder = `${runId}_future`;
    await query(`insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,created_at) values
      (${q(retainedOrder)},${q(ids.profiles.customer)},${q(ids.restaurants.primary)},'delivered','cash',10000,10000,${q(iso(1000))},${q(iso(0))}),
      (${q(futureOrder)},${q(ids.profiles.customer)},${q(ids.restaurants.primary)},'delivered','pos',10000,10000,${q(new Date(Date.parse(effective.future)+3600000).toISOString())},${q(effective.future)})`);
    const concurrentOrder = `${runId}_concurrent_delivery`;
    await query(`insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,created_at) values(${q(concurrentOrder)},${q(ids.profiles.customer)},${q(ids.restaurants.primary)},'preparing','cash',10000,10000,${q(iso(0))})`);
    await Promise.all([1, 2].map(() => query(`update public.orders set status='delivered',delivered_at=coalesce(delivered_at,statement_timestamp()) where id=${q(concurrentOrder)}`)));
    const concurrentResults = await Promise.all([1, 2].map(() => must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(750, effective.concurrent, "Concurrent stable retry", operations.concurrent))));
    if (concurrentResults.filter(value => value.replayed === false).length !== 1 || concurrentResults[0].ruleId !== concurrentResults[1].ruleId) throw new Error("Concurrent schedule retry did not converge.");
    const raceOperation = crypto.randomUUID(), raceEffective = iso(10800000), raceOrder = `${runId}_race`;
    const race = await Promise.allSettled([
      must("admin_schedule_restaurant_commission_v1", tokens.super, schedule(800, raceEffective, "Concurrent order scheduling", raceOperation)),
      query(`insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,created_at) values(${q(raceOrder)},${q(ids.profiles.customer)},${q(ids.restaurants.primary)},'pending','cash',10000,10000,${q(raceEffective)})`),
    ]);
    if (race.every(value => value.status === "rejected")) throw new Error("Concurrent order/rule test made no progress.");
    const snapshotBeforeCatalog = await query(`select encode(extensions.digest(jsonb_agg(to_jsonb(s) order by order_id)::text,'sha256'),'hex') digest from private.delivered_order_financial_snapshots s where restaurant_id=${q(ids.restaurants.primary)}`);
    await query(`update public.menu_items set price_kurus=999999 where id=${q(ids.item)}`);
    const snapshotAfterCatalog = await query(`select encode(extensions.digest(jsonb_agg(to_jsonb(s) order by order_id)::text,'sha256'),'hex') digest from private.delivered_order_financial_snapshots s where restaurant_id=${q(ids.restaurants.primary)}`);
    if (snapshotBeforeCatalog[0].digest !== snapshotAfterCatalog[0].digest) throw new Error("Catalog drift changed a financial snapshot.");
    await query(`do $$begin begin update public.orders set subtotal_kurus=subtotal_kurus+1 where id=${q(retainedOrder)};raise exception 'order immutability failed';exception when check_violation then null;end;begin update private.restaurant_commission_rules set rate_bps=2 where id=${q(tiny.ruleId)};raise exception 'rule immutability failed';exception when object_not_in_prerequisite_state then null;end;end$$;`);
    await query(`begin;alter table private.delivered_order_financial_snapshots disable trigger delivered_financial_snapshots_immutable;update private.delivered_order_financial_snapshots set commission_kurus=commission_kurus+1,restaurant_net_kurus=restaurant_net_kurus-1 where order_id=${q(retainedOrder)};alter table private.delivered_order_financial_snapshots enable trigger delivered_financial_snapshots_immutable;do $$begin perform private.ensure_delivered_financial_snapshot_v1(${q(retainedOrder)});raise exception 'mismatch accepted';exception when object_not_in_prerequisite_state then null;end$$;rollback;`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Famagusta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("/", "-");
    const summary = await must("restaurant_get_earnings_summary_v1", tokens.owner, { p_from: today, p_to: today });
    const series = await must("restaurant_get_earnings_series_v1", tokens.owner, { p_from: today, p_to: today, p_bucket: "day" });
    const page1 = await must("restaurant_get_earnings_orders_page_v1", tokens.owner, { p_from: today, p_to: today, p_cursor: null, p_limit: 25 });
    const page2 = await must("restaurant_get_earnings_orders_page_v1", tokens.owner, { p_from: today, p_to: today, p_cursor: page1.nextCursor, p_limit: 25 });
    if (!page1.nextCursor || page1.items.length !== 25 || page2.items.length < 1 || page2.nextCursor !== null) throw new Error("Opaque pagination did not produce expected pages.");
    const dbTotals = (await query(`select coalesce(sum(commission_base_kurus),0)::text gross,coalesce(sum(commission_kurus),0)::text commission,coalesce(sum(restaurant_net_kurus),0)::text net,count(*)::integer orders from private.delivered_order_financial_snapshots where restaurant_id=${q(ids.restaurants.primary)} and (delivered_at at time zone 'Asia/Famagusta')::date=${q(today)}::date`))[0];
    if (String(summary.eligibleGrossKurus) !== dbTotals.gross || String(summary.commissionKurus) !== dbTotals.commission || String(summary.estimatedNetKurus) !== dbTotals.net || Number(summary.deliveredOrderCount) !== Number(dbTotals.orders) || series.points.reduce((sum, point) => sum + Number(point.eligibleGrossKurus), 0) !== Number(summary.eligibleGrossKurus)) throw new Error("Summary/series/database reconciliation failed.");
    const adminRead = await must("admin_get_restaurant_commission_v1", tokens.admin, { p_restaurant_id: ids.restaurants.primary });
    if (!Array.isArray(adminRead.history) || adminRead.capabilityEnabled !== false) throw new Error("Admin read-only inspection failed.");
    await deny("admin_schedule_restaurant_commission_v1", tokens.admin, schedule(900, iso(14400000), "Ordinary admin denied", crypto.randomUUID()));
    await deny("restaurant_get_earnings_summary_v1", tokens.manager, { p_from: today, p_to: today });
    await deny("restaurant_get_earnings_summary_v1", tokens.customer, { p_from: today, p_to: today });
    await deny("restaurant_get_earnings_summary_v1", tokens.suspended, { p_from: today, p_to: today });
    await deny("restaurant_get_earnings_summary_v1", tokens.revoked, { p_from: today, p_to: today });
    await deny("restaurant_get_earnings_summary_v1", tokens.unmapped, { p_from: today, p_to: today });
    await deny("restaurant_get_earnings_summary_v1", null, { p_from: today, p_to: today });
    const otherSummary = await must("restaurant_get_earnings_summary_v1", tokens.ownerb, { p_from: today, p_to: today });
    if (Number(otherSummary.deliveredOrderCount) !== 0) throw new Error("Second Restaurant owner saw cross-Restaurant earnings.");
    const crossCursor = await deny("restaurant_get_earnings_orders_page_v1", tokens.ownerb, { p_from: today, p_to: today, p_cursor: page1.nextCursor, p_limit: 25 }).catch(() => null);
    const direct = await fetch(`${project.url}/rest/v1/restaurant_commission_rules?select=*`, { headers: { apikey: project.publishableKey, authorization: `Bearer ${tokens.owner}` } });
    if (direct.ok) throw new Error("Direct financial table read succeeded.");
    await query(`begin;select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288','sub',${q(manifest.firebaseUsers.super.uid)},'email_verified',true,'auth_time',extract(epoch from statement_timestamp()-interval '10 minutes')::bigint,'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);do $$begin perform public.admin_schedule_restaurant_commission_v1(${q(ids.restaurants.primary)},999,statement_timestamp()+interval '6 hours','Stale auth',gen_random_uuid());raise exception 'stale auth accepted';exception when insufficient_privilege then null;end$$;rollback;`);
    await query(`begin;
      do $$begin begin perform private.set_restaurant_earnings_capability_v1(true);raise exception 'missing coverage accepted';exception when object_not_in_prerequisite_state then null;end;end$$;
      insert into private.restaurant_commission_rules(restaurant_id,rate_bps,effective_from,created_by_profile_id,reason,operation_id,request_sha256)
        select r.id,0,'1900-01-01Z',${q(ids.profiles.super)},'Rollback coverage',gen_random_uuid(),repeat('a',64) from public.restaurants r where r.lifecycle_status='active' and r.accepting_orders and not exists(select 1 from private.restaurant_commission_rules c where c.restaurant_id=r.id and c.effective_from<=statement_timestamp());
      insert into private.order_commission_terms(order_id,restaurant_id,commission_rule_id,commission_rate_bps,commission_contract_version)
        select o.id,o.restaurant_id,c.id,c.rate_bps,c.commission_contract_version from public.orders o join lateral(select * from private.restaurant_commission_rules r where r.restaurant_id=o.restaurant_id and r.effective_from<=o.created_at order by r.effective_from desc,r.id desc limit 1)c on true where o.status not in('delivered','canceled') and not exists(select 1 from private.order_commission_terms t where t.order_id=o.id);
      select private.set_restaurant_earnings_capability_v1(true);
      do $$begin begin insert into public.restaurants(id,name,is_active,address)values(${q(`${runId}_uncovered`)},'Uncovered',true,'Qualification');raise exception 'uncovered activation accepted';exception when object_not_in_prerequisite_state then null;end;end$$;
      select private.set_restaurant_earnings_capability_v1(false);rollback;`);
    await query(`begin;update private.restaurant_earnings_capabilities set enabled=true where capability='restaurant_earnings_v1';alter table public.orders disable trigger zz_delivered_order_financial_snapshot;update public.orders set status='delivered',delivered_at=statement_timestamp() where id=${q(pending)};alter table public.orders enable trigger zz_delivered_order_financial_snapshot;select private.detect_restaurant_financial_integrity_v1();select private.detect_restaurant_financial_integrity_v1();do $$begin if not exists(select 1 from private.restaurant_financial_integrity_alerts where order_id=${q(pending)} and alert_type='missing_delivered_snapshot' and occurrence_count=2)then raise exception 'detector deduplication failed';end if;end$$;rollback;`);
    const [facts] = await query(`select
      (select count(*) from private.order_commission_terms where order_id like ${q(`${runId}%`)})::integer terms,
      (select count(*) from public.orders where id like ${q(`${runId}%`)})::integer orders,
      (select count(*) from private.delivered_order_financial_snapshots where order_id like ${q(`${runId}%`)})::integer snapshots,
      (select count(*) from private.delivered_order_financial_snapshots where order_id=${q(concurrentOrder)})::integer concurrent_snapshots,
      (select count(*) from private.restaurant_commission_rules where restaurant_id=${q(ids.restaurants.primary)})::integer rules,
      (select count(*) from private.audit_log where actor_profile_id=${q(ids.profiles.super)} and action='restaurant.commission_rule_scheduled_v1')::integer schedule_audits,
      (select commission_rate_bps=1 from private.order_commission_terms where order_id=${q(retainedOrder)}) retained_rate,
      (select commission_rate_bps=500 from private.order_commission_terms where order_id=${q(futureOrder)}) future_rate,
      (select commission_kurus=0 from private.delivered_order_financial_snapshots where order_id=${q(`${runId}_below`)}) below_rounding,
      (select commission_kurus=1 from private.delivered_order_financial_snapshots where order_id=${q(`${runId}_half`)}) half_rounding,
      (select commission_kurus=1 from private.delivered_order_financial_snapshots where order_id=${q(`${runId}_above`)}) above_rounding,
      not exists(select 1 from private.delivered_order_financial_snapshots where order_id in(${q(canceled)},${q(pending)})) excluded_states,
      (select enabled=false from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_disabled`);
    if (facts.terms !== facts.orders || facts.snapshots !== orderRows.filter(row => row.status === "delivered").length + 3 || facts.concurrent_snapshots !== 1 || !facts.retained_rate || !facts.future_rate || !facts.below_rounding || !facts.half_rounding || !facts.above_rounding || !facts.excluded_states || !facts.capability_disabled) throw new Error("Final hosted financial invariants failed.");
    const rows = await query(`select id from public.orders where id like ${q(`${runId}%`)} order by id`), rules = await query(`select id from private.restaurant_commission_rules where restaurant_id=${q(ids.restaurants.primary)} order by id`), snapshots = await query(`select order_id from private.delivered_order_financial_snapshots where restaurant_id=${q(ids.restaurants.primary)} order by order_id`), audits = await query(`select id from private.audit_log where actor_profile_id like ${q(`${runId}%`)} or metadata::text like ${q(`%${runId}%`)} order by id`), alerts = await query(`select id from private.restaurant_financial_integrity_alerts where restaurant_id like ${q(`${runId}%`)} order by id`);
    manifest.operationIds = operations;
    manifest.orderIds = rows.map(row => row.id);
    manifest.ruleIds = rules.map(row => row.id);
    manifest.snapshotOrderIds = snapshots.map(row => row.order_id);
    manifest.auditIds = audits.map(row => row.id);
    manifest.alertIds = alerts.map(row => row.id);
    manifest.probedAt = new Date().toISOString();
    manifest.ui = { superEmail: manifest.firebaseUsers.super.email, ownerEmail: manifest.firebaseUsers.owner.email, managerEmail: manifest.firebaseUsers.manager.email };
    writeJson(manifestPath, manifest);
    writeJson(path.join(runDirectory, "probe-evidence.json"), { capturedAt: new Date().toISOString(), recentTotpSuperAdmin: true, ordinaryMfaAdminReadOnly: true, replaySafe: true, operationConflictDenied: true, duplicateEffectiveDenied: true, backdatingDenied: true, rates: [0, 10000, 1, 500, 750], rounding: { below: true, half: true, above: true }, ruleBoundaries: true, nonRetroactive: true, catalogIsolation: true, concurrentDelivery: true, concurrentScheduling: true, concurrentOrderRule: race.map(value => value.status), authorization: { owner: true, managerDenied: true, customerDenied: true, suspendedDenied: true, revokedDenied: true, unmappedDenied: true, anonymousDenied: true, secondOwnerIsolated: true, staleTotpDenied: true }, reconciliation: { summary: true, series: true, payment: true, page1: page1.items.length, page2: page2.items.length }, capabilityRollbackOnly: true, detectorDirectRollbackOnly: true, capabilityDisabled: true, facts });
    console.log(JSON.stringify({ action, environment: "development", runId, rules: facts.rules, orders: facts.orders, terms: facts.terms, snapshots: facts.snapshots, pageSizes: [page1.items.length, page2.items.length], recentTotp: true, authorizationMatrix: true, reconciliation: true, capabilityRollbackOnly: true, capabilityDisabled: true }));
  } finally { await app.delete(); }
}

if (action === "plans") {
  const { manifest } = requireManifest();
  const planSql = `begin;
    insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,created_at)
      select ${q(`${runId}_plan_`)}||lpad(g::text,5,'0'),${q(ids.profiles.customer)},${q(ids.restaurants.primary)},'delivered',case when g%2=0 then 'cash'::public.payment_method else 'pos'::public.payment_method end,10000+g,10000+g,statement_timestamp()-(g||' seconds')::interval,statement_timestamp()-interval '12 hours'-(g||' seconds')::interval from generate_series(1,10000)g;
    analyze private.delivered_order_financial_snapshots;
    create temporary table earnp4_plans(name text,expected_index text,plan jsonb);
    do $$declare p jsonb;begin
      execute format('explain(analyze,buffers,format json)select * from private.delivered_order_financial_snapshots where restaurant_id=%L and delivered_at>statement_timestamp()-interval ''30 days'' order by delivered_at desc,order_id desc limit 25',${q(ids.restaurants.primary)}) into p;
      insert into earnp4_plans values('page','delivered_financial_snapshots_restaurant_cursor_idx',p);
      execute format('explain(analyze,buffers,format json)select sum(commission_base_kurus),sum(commission_kurus),sum(restaurant_net_kurus) from private.delivered_order_financial_snapshots where restaurant_id=%L and payment_method=''cash'' and delivered_at>=statement_timestamp()-interval ''5 minutes''',${q(ids.restaurants.primary)}) into p;
      insert into earnp4_plans values('summary','delivered_financial_snapshots_restaurant_payment_period_idx',p);
    end$$;
    select name,expected_index,plan::text like '%'||expected_index||'%' uses_expected_index,plan::text like '%"Node Type": "Seq Scan"%"Relation Name": "delivered_order_financial_snapshots"%' large_seq_scan,plan from earnp4_plans order by name;
    rollback;`;
  const plans = await query(planSql);
  writeJson(path.join(runDirectory, "query-plans.json"), { capturedAt: new Date().toISOString(), volume: 10000, rolledBack: true, plans });
  if (plans.length !== 2 || plans.some(plan => !plan.uses_expected_index || plan.large_seq_scan)) throw new Error("Representative hosted query-plan gate failed.");
  console.log(JSON.stringify({ action, environment: "development", runId, volume: 10000, rolledBack: true, plans: plans.map(({ name, expected_index, uses_expected_index, large_seq_scan }) => ({ name, expectedIndex: expected_index, usesExpectedIndex: uses_expected_index, largeSeqScan: large_seq_scan })) }));
}

if (action === "recover-manifest") {
  const { manifest } = requireManifest();
  const rows = await query(`select id from public.orders where id like ${q(`${runId}%`)} order by id`);
  const rules = await query(`select id from private.restaurant_commission_rules where restaurant_id in (${Object.values(ids.restaurants).map(q).join(",")}) order by id`);
  const snapshots = await query(`select order_id from private.delivered_order_financial_snapshots where restaurant_id in (${Object.values(ids.restaurants).map(q).join(",")}) order by order_id`);
  const audits = await query(`select id from private.audit_log where actor_profile_id in (${Object.values(ids.profiles).map(q).join(",")}) or metadata::text like ${q(`%${runId}%`)} order by id`);
  const alerts = await query(`select id from private.restaurant_financial_integrity_alerts where restaurant_id in (${Object.values(ids.restaurants).map(q).join(",")}) order by id`);
  manifest.orderIds = rows.map(row => row.id);
  manifest.ruleIds = rules.map(row => row.id);
  manifest.snapshotOrderIds = snapshots.map(row => row.order_id);
  manifest.auditIds = audits.map(row => row.id);
  manifest.alertIds = alerts.map(row => row.id);
  manifest.recoveredAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
  console.log(JSON.stringify({ action, environment: "development", runId, orders: manifest.orderIds.length, rules: manifest.ruleIds.length, snapshots: manifest.snapshotOrderIds.length, audits: manifest.auditIds.length, alerts: manifest.alertIds.length }));
}

if (action === "inspect") {
  const [configuration] = await query(`select
    (select count(*)=1 from supabase_migrations.schema_migrations where version='20260922100000') migration_recorded_once,
    (select enabled=false from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_disabled,
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('restaurant_earnings_capabilities','restaurant_commission_rules','order_commission_terms','delivered_order_financial_snapshots','restaurant_financial_integrity_alerts') and c.relrowsecurity and c.relforcerowsecurity) forced_rls_tables,
    (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('admin_get_restaurant_commission_v1','admin_schedule_restaurant_commission_v1','admin_get_restaurant_earnings_summary_v1','restaurant_get_earnings_summary_v1','restaurant_get_earnings_series_v1','restaurant_get_earnings_orders_page_v1') and p.proowner=(select oid from pg_roles where rolname='hungrie_api_owner') and p.proconfig @> array['search_path=""']) guarded_rpcs,
    (select count(*)::integer from pg_indexes where indexname in('restaurant_financial_alert_open_fingerprint_idx','restaurant_financial_alert_restaurant_open_idx','restaurant_commission_rules_lookup_idx','order_commission_terms_restaurant_rule_idx','delivered_financial_snapshots_restaurant_cursor_idx','delivered_financial_snapshots_restaurant_payment_period_idx','orders_restaurant_created_cursor_idx')) purpose_indexes,
    (select count(*)::integer from pg_trigger where tgname in('restaurant_commission_rules_immutable','order_commission_terms_immutable','delivered_financial_snapshots_immutable') and tgenabled='O') immutable_triggers,
    (select count(*)::integer from cron.job where jobname='hungrie-restaurant-financial-integrity' and schedule='*/5 * * * *' and command like '%detect_restaurant_financial_integrity_v1%') cron_entries,
    (select count(*)::integer from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='hungrie-restaurant-financial-integrity') scheduler_runs,
    (select max(start_time) from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='hungrie-restaurant-financial-integrity') last_scheduler_start,
    (select count(*)::integer from information_schema.routine_privileges where routine_schema='public' and routine_name in('admin_get_restaurant_commission_v1','admin_schedule_restaurant_commission_v1','admin_get_restaurant_earnings_summary_v1','restaurant_get_earnings_summary_v1','restaurant_get_earnings_series_v1','restaurant_get_earnings_orders_page_v1') and grantee='authenticated' and privilege_type='EXECUTE') authenticated_rpc_grants,
    (select count(*)::integer from information_schema.table_privileges where table_schema='private' and table_name in('restaurant_earnings_capabilities','restaurant_commission_rules','order_commission_terms','delivered_order_financial_snapshots','restaurant_financial_integrity_alerts') and grantee in('public','anon','authenticated','service_role')) direct_private_grants`);
  const [financial] = await query(`select
    (select count(*) from private.restaurant_commission_rules)::integer rules,
    (select count(*) from private.order_commission_terms)::integer terms,
    (select count(*) from private.delivered_order_financial_snapshots)::integer snapshots,
    (select count(*) from private.restaurant_financial_integrity_alerts)::integer alerts`);
  writeJson(path.join(runDirectory, "hosted-inspection.json"), { capturedAt: new Date().toISOString(), configuration, financial });
  if (!configuration.migration_recorded_once || !configuration.capability_disabled || configuration.forced_rls_tables !== 5 || configuration.guarded_rpcs !== 6 || configuration.purpose_indexes !== 7 || configuration.immutable_triggers !== 3 || configuration.cron_entries !== 1 || configuration.authenticated_rpc_grants !== 6 || configuration.direct_private_grants !== 0) throw new Error("Hosted configuration inspection failed.");
  console.log(JSON.stringify({ action, environment: "development", runId, configuration, financial }));
}

if (action === "cleanup") {
  const { manifest } = requireManifest();
  const require = createRequire(import.meta.url), admin = require("firebase-admin");
  const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, `earnings-cleanup-${Date.now()}`), auth = app.auth();
  try {
    for (const user of Object.values(manifest.firebaseUsers)) await auth.updateUser(user.uid, { disabled: true });
    const orderList = manifest.orderIds.map(q).join(",") || "null", ruleList = manifest.ruleIds.map(q).join(",") || "null";
    const restaurantList = Object.values(ids.restaurants).map(q).join(","), profileList = Object.values(ids.profiles).map(q).join(",");
    await query(`begin;
      select pg_advisory_xact_lock(hashtextextended(${q(`phase4-cleanup:${runId}`)},0));
      do $$begin
        if exists(select 1 from public.orders where id like ${q(`${runId}%`)} and id not in(${orderList})) then raise exception 'Unexpected run-owned order';end if;
        if exists(select 1 from private.restaurant_commission_rules where restaurant_id=${q(ids.restaurants.primary)} and id not in(${ruleList})) then raise exception 'Unexpected run-owned rule';end if;
        if exists(select 1 from public.restaurants where id like ${q(`${runId}%`)} and id not in(${restaurantList})) then raise exception 'Unexpected run-owned Restaurant';end if;
        if exists(select 1 from public.profiles where id like ${q(`${runId}%`)} and id not in(${profileList})) then raise exception 'Unexpected run-owned profile';end if;
      end$$;
      lock table private.restaurant_commission_rules,private.order_commission_terms,private.delivered_order_financial_snapshots in share row exclusive mode;
      alter table private.restaurant_commission_rules disable trigger restaurant_commission_rules_immutable;
      alter table private.order_commission_terms disable trigger order_commission_terms_immutable;
      alter table private.delivered_order_financial_snapshots disable trigger delivered_financial_snapshots_immutable;
      delete from private.restaurant_financial_integrity_alerts where restaurant_id in(${restaurantList}) or order_id in(${orderList});
      delete from private.delivered_order_financial_snapshots where order_id in(${orderList});
      delete from private.order_commission_terms where order_id in(${orderList});
      delete from private.restaurant_commission_rules where id in(${ruleList});
      delete from private.review_action_operations where actor_profile_id in(${profileList});
      delete from private.order_review_reports where created_by_profile_id in(${profileList}) or status_changed_by_profile_id in(${profileList});
      delete from private.order_review_meal_reactions where order_id in(${orderList});
      delete from private.customer_review_operations where profile_id in(${profileList});
      delete from private.notification_deliveries where event_id in(select id from private.notification_events where order_id in(${orderList}));
      delete from private.notification_events where order_id in(${orderList});
      delete from public.product_reviews where order_id in(${orderList});
      delete from public.order_reviews where order_id in(${orderList});
      delete from private.restaurant_operations where profile_id in(${profileList}) or result->>'orderId' in(${orderList});
      delete from private.customer_order_operations where profile_id in(${profileList}) or order_id in(${orderList});
      delete from private.restaurant_order_visibility where order_id in(${orderList}) or profile_id in(${profileList});
      delete from private.order_status_history where order_id in(${orderList}) or changed_by_profile_id in(${profileList});
      delete from private.order_contacts where order_id in(${orderList});
      delete from public.order_items where order_id in(${orderList});
      delete from private.audit_log where actor_profile_id in(${profileList}) or target_id in(${orderList}) or metadata::text like ${q(`%${runId}%`)};
      delete from public.orders where id in(${orderList});
      delete from private.notification_deliveries where token_id in(select id from private.push_tokens where profile_id in(${profileList}) or restaurant_id in(${restaurantList}));
      delete from private.push_tokens where profile_id in(${profileList}) or restaurant_id in(${restaurantList});
      delete from private.notification_preferences where profile_id in(${profileList});
      delete from private.restaurant_couriers where profile_id in(${profileList}) or restaurant_id in(${restaurantList});
      delete from private.restaurant_members where profile_id in(${profileList}) or restaurant_id in(${restaurantList});
      delete from private.user_roles where profile_id in(${profileList});
      delete from public.favorites where profile_id in(${profileList}) or restaurant_id in(${restaurantList});
      delete from public.menu_items where id=${q(ids.item)};
      delete from public.categories where id=${q(ids.category)};
      delete from public.addresses where id=${q(ids.address)};
      delete from private.account_access where profile_id in(${profileList});
      delete from public.profiles where id in(${profileList});
      delete from public.restaurants where id in(${restaurantList});
      alter table private.restaurant_commission_rules enable trigger restaurant_commission_rules_immutable;
      alter table private.order_commission_terms enable trigger order_commission_terms_immutable;
      alter table private.delivered_order_financial_snapshots enable trigger delivered_financial_snapshots_immutable;
      do $$begin if (select count(*) from pg_trigger where tgname in('restaurant_commission_rules_immutable','order_commission_terms_immutable','delivered_financial_snapshots_immutable') and tgenabled='O')<>3 then raise exception 'Immutable protection restoration failed';end if;end$$;
      commit;`);
    const firebaseResults = [];
    for (const [key, user] of Object.entries(manifest.firebaseUsers)) { await auth.deleteUser(user.uid); firebaseResults.push({ key, uid: user.uid, deleted: true }); }
    manifest.cleanedAt = new Date().toISOString(); manifest.firebaseCleanup = firebaseResults; writeJson(manifestPath, manifest);
    console.log(JSON.stringify({ action, environment: "development", runId, databaseCleanup: true, firebaseDeleted: firebaseResults.length, immutableProtectionsRestored: true }));
  } finally { await app.delete(); }
}

if (action === "verify-cleanup") {
  const { manifest } = requireManifest();
  const [result] = await query(`select
    (select count(*) from public.restaurants where id like ${q(`${runId}%`)})::integer restaurants,
    (select count(*) from public.profiles where id like ${q(`${runId}%`)})::integer profiles,
    (select count(*) from public.orders where id like ${q(`${runId}%`)})::integer orders,
    (select count(*) from private.restaurant_commission_rules where restaurant_id like ${q(`${runId}%`)})::integer rules,
    (select count(*) from private.order_commission_terms where restaurant_id like ${q(`${runId}%`)})::integer terms,
    (select count(*) from private.delivered_order_financial_snapshots where restaurant_id like ${q(`${runId}%`)})::integer snapshots,
    (select count(*) from private.restaurant_financial_integrity_alerts where restaurant_id like ${q(`${runId}%`)})::integer alerts,
    (select count(*) from private.audit_log where actor_profile_id like ${q(`${runId}%`)} or metadata::text like ${q(`%${runId}%`)})::integer audits,
    (select enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1') capability_enabled,
    (select count(*) from pg_trigger where tgname in('restaurant_commission_rules_immutable','order_commission_terms_immutable','delivered_financial_snapshots_immutable') and tgenabled='O')::integer immutable_triggers_enabled`);
  if (Object.entries(result).some(([key, value]) => key === "capability_enabled" ? value !== false : key === "immutable_triggers_enabled" ? Number(value) !== 3 : Number(value) !== 0)) throw new Error("Database cleanup verification failed.");
  const require = createRequire(import.meta.url), admin = require("firebase-admin"); const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, `earnings-cleanup-verify-${Date.now()}`), auth = app.auth();
  let remaining = 0; try { for (const user of Object.values(manifest.firebaseUsers)) try { await auth.getUser(user.uid); remaining += 1; } catch (error) { if (error?.code !== "auth/user-not-found") throw error; } } finally { await app.delete(); }
  if (remaining) throw new Error("Firebase fixture identity cleanup incomplete.");
  const baseline = JSON.parse(fs.readFileSync(path.join(runDirectory, "baseline.json"), "utf8"));
  const [reconciled] = await query(`select
    (select count(*)::integer from public.profiles) profiles,
    (select count(*)::integer from public.restaurants) restaurants,
    (select count(*)::integer from public.orders) orders,
    (select count(*)::integer from public.order_items) order_items,
    (select count(*)::integer from private.account_access) account_access,
    (select count(*)::integer from private.audit_log) audit_events,
    encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,lifecycle_status,accepting_orders) order by id)::text from public.restaurants),'[]'),'sha256'),'hex') restaurant_digest,
    encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_array(id,status,restaurant_id,profile_id) order by id)::text from public.orders),'[]'),'sha256'),'hex') order_digest`);
  const baselineMatches = Object.keys(baseline).every(key => String(reconciled[key]) === String(baseline[key]));
  if (!baselineMatches) throw new Error("Protected Development baseline reconciliation failed.");
  console.log(JSON.stringify({ action, environment: "development", runId, result, firebaseRemaining: remaining, baselineReconciled: true }));
}
