#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const admin = require(path.join(root, "functions/node_modules/firebase-admin"));
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const credentialPath = path.resolve(arg("--credential") || "");
if (arg("--confirm") !== "development:phase6-customer-probe" || !fs.existsSync(credentialPath) ||
    !path.relative(root, credentialPath).startsWith("..")) throw new Error("An external Firebase Admin credential and Development confirmation are required.");
const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (credential.project_id !== "hungrieapp-a2288") throw new Error("Firebase project mismatch.");
const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
if (project?.name !== "HungrieApp Development" || !project.url || !project.publishableKey ||
    project.ref === state.projects?.staging?.ref || project.ref === state.projects?.production?.ref) throw new Error("Development Supabase identity mismatch.");
const webConfig = JSON.parse(fs.readFileSync(path.join(secure, "admin-firebase-web-development.local.json"), "utf8"));
if (webConfig.projectId !== credential.project_id || !webConfig.apiKey) throw new Error("Development Firebase Web configuration mismatch.");
const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Development SQL probe failed (${response.status}); details withheld.`);
  return response.json();
};
const rest = async (functionName, jwt, args = {}) => {
  const response = await fetch(`${project.url}/rest/v1/rpc/${functionName}`, {
    method: "POST", headers: { apikey: project.publishableKey, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
};
const exchange = async (customToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(webConfig.apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  return (await response.json()).idToken;
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, `phase6-probe-${Date.now()}`);
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
const profileId = `phase6_probe_${suffix}`;
let user;
let profileCreated = false;
try {
  const [restaurant] = await query("select id from public.restaurants where lifecycle_status='active' order by id limit 1");
  if (!restaurant?.id) throw new Error("Development has no active Restaurant fixture for the role-denial probe.");
  user = await app.auth().createUser({ email: `phase6-probe-${suffix}@example.invalid`, emailVerified: true });
  const jwt = await exchange(await app.auth().createCustomToken(user.uid, { role: "authenticated" }));
  await query(`insert into public.profiles(id,firebase_uid,name,email) values(${quote(profileId)},${quote(user.uid)},'Phase 6 Probe',${quote(user.email)});
    insert into private.account_access(profile_id,account_type,status,activated_at) values(${quote(profileId)},'customer','active',statement_timestamp())`);
  profileCreated = true;
  const active = await rest("get_my_customer_profile_v1", jwt);
  if (!active.ok || active.body?.id !== profileId) throw new Error(`Active Customer probe failed (${active.status}).`);
  const topics = await rest("my_customer_order_realtime_topics_v1", jwt);
  if (!topics.ok || !Array.isArray(topics.body) || topics.body.length !== 1) throw new Error(`Customer Realtime topic probe failed (${topics.status}).`);
  const catalog = await rest("get_active_restaurant_bundle_v2", null, { p_restaurant_id: restaurant.id });
  if (!catalog.ok || catalog.body?.restaurant?.id !== restaurant.id) throw new Error(`Anonymous catalog v2 probe failed (${catalog.status}).`);
  await query(`delete from private.account_access where profile_id=${quote(profileId)};
    insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
    values(${quote(profileId)},'restaurant','active',statement_timestamp(),${quote(restaurant.id)},'manager')`);
  const restaurantDenied = await rest("get_my_customer_profile_v1", jwt);
  if (restaurantDenied.ok || restaurantDenied.status !== 403) throw new Error("Restaurant identity reached a Customer RPC.");
  await query(`delete from private.account_access where profile_id=${quote(profileId)};
    insert into private.account_access(profile_id,account_type,status,suspended_at)
    values(${quote(profileId)},'customer','suspended',statement_timestamp())`);
  const suspendedDenied = await rest("get_my_customer_profile_v1", jwt);
  if (suspendedDenied.ok || suspendedDenied.status !== 403) throw new Error("Suspended Customer reached a Customer RPC.");
  console.log(JSON.stringify({ target: "development", activeCustomer: true, customerRealtimeTopic: true,
    anonymousCatalogV2: true, restaurantDenied: true, suspendedDenied: true }));
} finally {
  if (profileCreated) await query(`begin;delete from private.account_access where profile_id=${quote(profileId)};delete from public.profiles where id=${quote(profileId)};commit;`);
  if (user) await app.auth().deleteUser(user.uid);
  await app.delete();
}
