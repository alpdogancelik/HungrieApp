#!/usr/bin/env node
// Creates transient Firebase/canonical identities, proves Admin RPC denial, and removes them.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const argument = (name) => process.argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex");
if (argument("--confirm") !== "staging:phase4-isolation-probe" || argument("--expect-sha256") !== sourceHash) {
  console.log(JSON.stringify({ environment: "staging", mode: "dry-run", sourceHash,
    identities: ["customer", "restaurant_manager"], expectedResult: "all Admin RPC calls return HTTP 403" }));
  process.exit(0);
}
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const staging = state.projects?.staging;
if (staging?.name !== "HungrieApp Staging" || !staging.ref || !staging.url || !staging.publishableKey ||
    staging.ref === state.projects?.development?.ref || staging.ref === state.projects?.production?.ref) throw new Error("Staging project mismatch.");
const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8")).expo.extra;
if (firebaseConfig.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== "hungrieapp-a2288") throw new Error("Firebase project mismatch.");
const firebaseApiKey = firebaseConfig.EXPO_PUBLIC_FIREBASE_API_KEY;
const firebaseCli = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"));
const operatorToken = firebaseCli.tokens?.access_token;
if (!operatorToken) throw new Error("Firebase CLI operator session unavailable.");
const restaurantId = "598eacea-dd2a-4549-a198-40593f7fab06";
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${staging.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Staging probe query failed (${response.status}); details withheld.`);
  return response.json();
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const firebasePublic = async (method, body) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firebase probe ${method} failed (${response.status}).`);
  return response.json();
};
const firebaseAdmin = async (method, body) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/hungrieapp-a2288/accounts:${method}`, {
    method: "POST", headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json",
      "x-goog-user-project": "hungrieapp-a2288" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firebase operator ${method} failed (${response.status}).`);
  return response.json().catch(() => ({}));
};
const endpoints = [
  ["admin_get_dashboard_v1", {}],
  ["admin_list_accounts_v1", { p_type: null, p_status: null, p_search: null, p_limit: 10, p_offset: 0 }],
  ["admin_list_orders_v1", { p_restaurant_id: null, p_status: null, p_limit: 10, p_offset: 0 }],
  ["admin_list_incidents_v1", { p_state: null, p_limit: 10, p_offset: 0 }],
  ["admin_list_audit_v1", { p_action: null, p_target_type: null, p_limit: 10, p_offset: 0 }],
  ["admin_create_restaurant_v1", { p_name: "Denied probe", p_operation_id: crypto.randomUUID() }],
];
const results = {};
for (const accountType of ["customer", "restaurant"]) {
  const suffix = crypto.randomBytes(7).toString("hex");
  const email = `phase4-isolation-${suffix}@example.invalid`;
  const password = `P4!${crypto.randomBytes(24).toString("base64url")}`;
  let uid;
  let databaseCreated = false;
  try {
    const signup = await firebasePublic("signUp", { email, password, returnSecureToken: true });
    uid = signup.localId;
    await firebaseAdmin("update", { localId: uid, emailVerified: true,
      customAttributes: JSON.stringify({ role: "authenticated", platform_role: "super_admin" }) });
    await query(`begin;
      insert into public.profiles(id,firebase_uid,name,email) values(${quote(uid)},${quote(uid)},'Transient Phase 4 isolation probe',${quote(email)});
      insert into private.account_access(profile_id,account_type,status,onboarding_step,activated_at,restaurant_id,restaurant_role)
      values(${quote(uid)},${quote(accountType)},'active','none',statement_timestamp(),
        ${accountType === "restaurant" ? quote(restaurantId) : "null"},${accountType === "restaurant" ? "'manager'" : "null"});
      insert into private.account_email_reservations(normalized_email,account_type,firebase_uid,profile_id)
      values(${quote(email)},${quote(accountType)},${quote(uid)},${quote(uid)});
    commit;`);
    databaseCreated = true;
    const signedIn = await firebasePublic("signInWithPassword", { email, password, returnSecureToken: true });
    const statuses = [];
    for (const [name, body] of endpoints) {
      const response = await fetch(`${staging.url}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { apikey: staging.publishableKey, authorization: `Bearer ${signedIn.idToken}`,
          "content-type": "application/json" }, body: JSON.stringify(body),
      });
      statuses.push({ rpc: name, status: response.status });
      if (response.status !== 403) throw new Error(`${accountType} unexpectedly received HTTP ${response.status} from ${name}.`);
    }
    results[accountType] = statuses;
  } finally {
    if (databaseCreated && uid) await query(`begin;
      delete from private.account_email_reservations where profile_id=${quote(uid)};
      delete from private.account_access where profile_id=${quote(uid)};
      delete from public.profiles where id=${quote(uid)};
    commit;`);
    if (uid) await firebaseAdmin("delete", { localId: uid });
  }
}
console.log(JSON.stringify({ environment: "staging", result: "pass", sourceHash, results }));
