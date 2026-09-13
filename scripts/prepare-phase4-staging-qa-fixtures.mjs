#!/usr/bin/env node
// Creates synthetic, non-production data for the hosted Admin order/incident QA.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const argument = (name) => process.argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const staging = state.projects?.staging;
if (staging?.name !== "HungrieApp Staging" || !staging.ref || !staging.url || !staging.publishableKey ||
    staging.ref === state.projects?.development?.ref || staging.ref === state.projects?.production?.ref) {
  throw new Error("Staging environment is missing or overlaps another environment.");
}
const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const firebaseCli = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"));
const firebaseOperatorToken = firebaseCli.tokens?.access_token;
if (!firebaseOperatorToken) throw new Error("Firebase CLI operator session is unavailable.");
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const firebaseApiKey = appConfig.expo.extra.EXPO_PUBLIC_FIREBASE_API_KEY;
if (appConfig.expo.extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== "hungrieapp-a2288" || !firebaseApiKey) {
  throw new Error("The non-production Firebase project configuration is missing or mismatched.");
}
const restaurantId = "598eacea-dd2a-4549-a198-40593f7fab06";
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${staging.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Staging query failed (${response.status}); details withheld.`);
  return response.json();
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const [before] = await query(`select
  (select count(*) from public.restaurants where id=${quote(restaurantId)})::int restaurant_count,
  (select count(*) from public.orders where id like 'phase4_qa_%')::int qa_orders,
  (select count(*) from private.restaurant_operational_incidents where restaurant_id=${quote(restaurantId)} and state<>'resolved')::int open_incidents,
  (select count(*) from private.account_access where account_type='customer')::int customer_accounts`);
if (before.restaurant_count !== 1 || before.qa_orders !== 0 || before.open_incidents !== 0) {
  throw new Error("Staging fixture preconditions changed; review existing QA data before continuing.");
}
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ mode: "dry-run", environment: "staging", sourceHash, restaurantId,
    existingCustomerAccounts: before.customer_accounts, qaOrders: before.qa_orders, openIncidents: before.open_incidents }));
  process.exit(0);
}
if (argument("--confirm") !== "staging:phase4-synthetic-fixtures" || argument("--expect-sha256") !== sourceHash) {
  throw new Error(`Exact staging confirmation and script checksum required. Current SHA-256: ${sourceHash}`);
}
const backupPath = path.resolve(argument("--backup-manifest") || "");
if (!backupPath.startsWith(path.join(secure, "phase4-staging-backup") + path.sep) || !fs.existsSync(backupPath)) {
  throw new Error("A restricted staging backup manifest is required.");
}
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
if (backup.environment !== "staging" || backup.projectRef !== staging.ref ||
    Date.now() - Date.parse(backup.recordedAt) > 24 * 60 * 60 * 1000) {
  throw new Error("Staging backup is stale or belongs to another project.");
}

const suffix = crypto.randomBytes(7).toString("hex");
const email = `phase4-qa-${suffix}@example.invalid`;
const password = `P4!${crypto.randomBytes(24).toString("base64url")}`;
const firebaseRequest = async (url, body) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Firebase QA identity request failed (${response.status}); details withheld.`);
  return response.json();
};
const signup = await firebaseRequest(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseApiKey)}`,
  { email, password, returnSecureToken: true },
);
const adminUpdate = await fetch("https://identitytoolkit.googleapis.com/v1/projects/hungrieapp-a2288/accounts:update", {
  method: "POST", headers: { authorization: `Bearer ${firebaseOperatorToken}`, "content-type": "application/json",
    "x-goog-user-project": "hungrieapp-a2288" },
  body: JSON.stringify({ localId: signup.localId, emailVerified: true,
    customAttributes: JSON.stringify({ role: "authenticated" }) }),
});
if (!adminUpdate.ok) throw new Error(`Firebase QA identity initialization failed (${adminUpdate.status}).`);
const directory = path.join(secure, "phase4-staging-fixtures");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.chmodSync(directory, 0o700);
const manifestPath = path.join(directory, `${suffix}.json`);
const manifest = { environment: "staging", projectRef: staging.ref, firebaseProject: "hungrieapp-a2288",
  state: "firebase_created", createdAt: new Date().toISOString(), firebaseUid: signup.localId,
  email, restaurantId, backupPath, sourceHash };
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
save();

const cancelOrderId = `phase4_qa_cancel_${suffix}`;
const deliverOrderId = `phase4_qa_deliver_${suffix}`;
const incidentId = crypto.randomUUID();
const sql = `begin;
  insert into public.profiles(id,firebase_uid,name,email)
  values (${quote(signup.localId)},${quote(signup.localId)},'Synthetic Phase 4 QA Customer',${quote(email)});
  insert into private.account_access(profile_id,account_type,status,onboarding_step,activated_at)
  values (${quote(signup.localId)},'customer','active','none',statement_timestamp());
  insert into private.account_email_reservations(normalized_email,account_type,firebase_uid,profile_id)
  values (${quote(email)},'customer',${quote(signup.localId)},${quote(signup.localId)});
  insert into public.orders(id,profile_id,restaurant_id,status,payment_method,notes,subtotal_kurus,total_kurus)
  values (${quote(cancelOrderId)},${quote(signup.localId)},${quote(restaurantId)},'preparing','cash','Synthetic Phase 4 support QA',1000,1000),
    (${quote(deliverOrderId)},${quote(signup.localId)},${quote(restaurantId)},'out_for_delivery','cash','Synthetic Phase 4 support QA',1000,1000);
  insert into private.order_contacts(order_id,customer_name,customer_email,delivery_address_snapshot)
  values (${quote(cancelOrderId)},'Synthetic QA Customer',${quote(email)},'{"line1":"Synthetic QA address","city":"Test only"}'::jsonb),
    (${quote(deliverOrderId)},'Synthetic QA Customer',${quote(email)},'{"line1":"Synthetic QA address","city":"Test only"}'::jsonb);
  insert into public.order_items(id,order_id,name_snapshot,unit_price_kurus,quantity)
  values (${quote(`phase4_qa_item_cancel_${suffix}`)},${quote(cancelOrderId)},'Synthetic QA item',1000,1),
    (${quote(`phase4_qa_item_deliver_${suffix}`)},${quote(deliverOrderId)},'Synthetic QA item',1000,1);
  insert into private.restaurant_operational_incidents(id,restaurant_id,incident_type,window_started_at,
    window_ended_at,ignored_order_count,eligible_order_count,threshold_snapshot)
  values (${quote(incidentId)}::uuid,${quote(restaurantId)},'repeated_order_non_response',
    statement_timestamp()-interval '1 hour',statement_timestamp(),2,3,'{"source":"phase4_synthetic_qa"}'::jsonb);
commit;`;
await query(sql);
manifest.state = "ready";
Object.assign(manifest, { cancelOrderId, deliverOrderId, incidentId });
save();
console.log(JSON.stringify({ environment: "staging", mode: "applied", manifestPath, restaurantId,
  cancelOrderId, deliverOrderId, incidentId, sourceHash }));
