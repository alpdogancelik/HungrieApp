#!/usr/bin/env node
// Creates a transient canonical Restaurant identity, attempts one cross-tenant
// Phase 5 catalog mutation, proves denial and no target change, then removes it.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const argument = (name) => process.argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex");

if (argument("--confirm") !== "staging:phase5-cross-tenant-probe" || argument("--expect-sha256") !== sourceHash) {
  console.log(JSON.stringify({
    environment: "staging",
    mode: "dry-run",
    sourceHash,
    action: "transient Restaurant identity attempts bulk availability mutation for another Restaurant",
    expectedResult: "HTTP 403 / PostgreSQL 42501, unchanged target item, no operation or audit record",
    cleanup: "transient Supabase and Firebase identity removed",
  }));
  process.exit(0);
}

const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const staging = state.projects?.staging;
if (staging?.name !== "HungrieApp Staging" || !staging.ref || !staging.url || !staging.publishableKey ||
    staging.ref === state.projects?.development?.ref || staging.ref === state.projects?.production?.ref) {
  throw new Error("Staging project mismatch.");
}

const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8")).expo.extra;
if (firebaseConfig.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== "hungrieapp-a2288") throw new Error("Firebase project mismatch.");
const firebaseApiKey = firebaseConfig.EXPO_PUBLIC_FIREBASE_API_KEY;
const firebaseRefresh = spawnSync("firebase", ["projects:list", "--json"], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"],
});
if (firebaseRefresh.status !== 0) throw new Error("Firebase CLI operator session refresh failed.");
const firebaseCli = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"));
const operatorToken = firebaseCli.tokens?.access_token;
if (!operatorToken) throw new Error("Firebase CLI operator session unavailable.");

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${staging.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Staging probe query failed (${response.status}); details withheld.`);
  return response.json();
};
const firebasePublic = async (method, body) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firebase probe ${method} failed (${response.status}).`);
  return response.json();
};
const firebaseAdmin = async (method, body) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/hungrieapp-a2288/accounts:${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "content-type": "application/json",
      "x-goog-user-project": "hungrieapp-a2288",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firebase operator ${method} failed (${response.status}).`);
  return response.json().catch(() => ({}));
};
const firebaseUsersResponse = await fetch(
  "https://identitytoolkit.googleapis.com/v1/projects/hungrieapp-a2288/accounts:batchGet?maxResults=500",
  { headers: { authorization: `Bearer ${operatorToken}`, "x-goog-user-project": "hungrieapp-a2288" } },
);
if (!firebaseUsersResponse.ok) throw new Error(`Firebase probe cleanup inventory failed (${firebaseUsersResponse.status}).`);
const firebaseUsers = await firebaseUsersResponse.json();
const staleProbeUsers = (firebaseUsers.users ?? []).filter((user) =>
  String(user.email ?? "").startsWith("phase5-cross-tenant-") && String(user.email).endsWith("@example.invalid"));
for (const user of staleProbeUsers) await firebaseAdmin("delete", { localId: user.localId });

const candidates = await query(`
  select r.id as restaurant_id,
    (select m.id from public.menu_items m where m.restaurant_id=r.id order by m.id limit 1) as menu_item_id
  from public.restaurants r
  where r.lifecycle_status='active'
    and exists(select 1 from public.menu_items m where m.restaurant_id=r.id)
  order by r.id
  limit 2
`);
if (candidates.length !== 2 || candidates[0].restaurant_id === candidates[1].restaurant_id) {
  throw new Error("CAP-08 requires two distinct active Staging Restaurants with menu items.");
}

const sourceRestaurantId = candidates[0].restaurant_id;
const targetRestaurantId = candidates[1].restaurant_id;
const targetItemId = candidates[1].menu_item_id;
const operationId = crypto.randomUUID();
const suffix = crypto.randomBytes(8).toString("hex");
const email = `phase5-cross-tenant-${suffix}@example.invalid`;
const password = `P5!${crypto.randomBytes(24).toString("base64url")}`;
let uid;
let databaseCreated = false;
let resultEvidence;

try {
  const signup = await firebasePublic("signUp", { email, password, returnSecureToken: true });
  uid = signup.localId;
  await firebaseAdmin("update", {
    localId: uid,
    emailVerified: true,
    customAttributes: JSON.stringify({ role: "authenticated" }),
  });
  await query(`begin;
    insert into public.profiles(id,firebase_uid,name,email)
      values(${quote(uid)},${quote(uid)},'Transient Phase 5 cross-tenant probe',${quote(email)});
    insert into private.account_access(profile_id,account_type,status,onboarding_step,activated_at,restaurant_id,restaurant_role)
      values(${quote(uid)},'restaurant','active','none',statement_timestamp(),${quote(sourceRestaurantId)},'manager');
    insert into private.account_email_reservations(normalized_email,account_type,firebase_uid,profile_id)
      values(${quote(email)},'restaurant',${quote(uid)},${quote(uid)});
  commit;`);
  databaseCreated = true;

  const signedIn = await firebasePublic("signInWithPassword", { email, password, returnSecureToken: true });
  const [before] = await query(`select id,restaurant_id,is_active,definition_revision,updated_at::text
    from public.menu_items where id=${quote(targetItemId)}`);
  if (!before || before.restaurant_id !== targetRestaurantId) throw new Error("Target item precondition failed.");

  const response = await fetch(`${staging.url}/rest/v1/rpc/restaurant_bulk_set_item_availability_v1`, {
    method: "POST",
    headers: {
      apikey: staging.publishableKey,
      authorization: `Bearer ${signedIn.idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_item_ids: [targetItemId],
      p_active: !before.is_active,
      p_operation_id: operationId,
    }),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (response.status !== 403 || responseBody.code !== "42501") {
    throw new Error(`Cross-tenant mutation unexpectedly returned HTTP ${response.status}; details withheld.`);
  }

  const [after] = await query(`select id,restaurant_id,is_active,definition_revision,updated_at::text,
      (select count(*)::int from private.restaurant_operations where operation_id=${quote(operationId)}::uuid) operation_rows,
      (select count(*)::int from private.audit_log where metadata->>'operation_id'=${quote(operationId)}) audit_rows
    from public.menu_items where id=${quote(targetItemId)}`);
  if (!after || before.restaurant_id !== after.restaurant_id || before.is_active !== after.is_active ||
      before.definition_revision !== after.definition_revision || before.updated_at !== after.updated_at ||
      after.operation_rows !== 0 || after.audit_rows !== 0) {
    throw new Error("Cross-tenant denial left an unexpected database change.");
  }

  resultEvidence = {
    environment: "staging",
    result: "pass",
    testId: "CAP-08",
    sourceHash,
    denial: { httpStatus: response.status, postgresCode: responseBody.code },
    targetUnchanged: true,
    operationRows: after.operation_rows,
    auditRows: after.audit_rows,
  };
} finally {
  if (databaseCreated && uid) {
    await query(`begin;
      delete from private.account_email_reservations where profile_id=${quote(uid)};
      delete from private.account_access where profile_id=${quote(uid)};
      delete from public.profiles where id=${quote(uid)};
    commit;`);
  }
  if (uid) await firebaseAdmin("delete", { localId: uid });
}

const [cleanup] = await query(`select
  (select count(*) from public.profiles where id=${quote(uid)})::int profile_rows,
  (select count(*) from private.account_access where profile_id=${quote(uid)})::int access_rows,
  (select count(*) from private.account_email_reservations where profile_id=${quote(uid)})::int reservation_rows`);
if (cleanup.profile_rows !== 0 || cleanup.access_rows !== 0 || cleanup.reservation_rows !== 0) {
  throw new Error("Transient Staging database cleanup failed.");
}
console.log(JSON.stringify({ ...resultEvidence, cleanup: "pass", staleProbeUsersRemoved: staleProbeUsers.length }));
