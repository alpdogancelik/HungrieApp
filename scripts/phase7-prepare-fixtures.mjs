#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, ensurePrivateDirectory } from "./phase7-runner-lib.mjs";
import { firebaseApp, loadOperatorContext, sql, sqlQuote as q } from "./phase7-staging-client.mjs";

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
if (arg("--confirm") !== "staging:phase7-fixtures") throw new Error("Explicit Staging Phase 7 fixture confirmation is required.");
const credentialPath = path.resolve(arg("--credential") || ""), apiKey = arg("--firebase-api-key");
if (!fs.existsSync(credentialPath) || !apiKey) throw new Error("External Firebase credential and Web API key are required.");

const phaseRoot = path.resolve("secure/phase7");
ensurePrivateDirectory(phaseRoot);
atomicWriteJson(path.join(phaseRoot, "operator-config.json"), { firebaseAdminCredentialPath: credentialPath, firebaseProjectId: "hungrieapp-a2288", firebaseWebApiKey: apiKey });
const context = loadOperatorContext(), fixtureFile = path.join(phaseRoot, "fixtures.json"), manualFile = path.join(phaseRoot, "manual-fixtures.json");
const existing = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, "utf8")) : null;
const suffix = existing?.prefix?.replace(/^phase7_/, "") || crypto.randomUUID().replaceAll("-", "").slice(0, 16), prefix = `phase7_${suffix}`;
const ids = {
  prefix,
  restaurant: existing?.restaurant || `${prefix}_restaurant`,
  category: existing?.category || `${prefix}_category`,
  item: existing?.item || `${prefix}_item`,
  customer: existing?.customer || `${prefix}_customer`,
  restaurantUser: existing?.restaurantUser || `${prefix}_restaurant_user`,
  address: existing?.address || `${prefix}_address`,
  restaurantB: `${prefix}_restaurant_b`,
  restaurantBUser: `${prefix}_restaurant_b_user`,
  suspendedCustomer: `${prefix}_suspended_customer`,
  revokedCustomer: `${prefix}_revoked_customer`,
  pendingRestaurantUser: `${prefix}_pending_restaurant_user`,
  pendingAdmin: `${prefix}_pending_admin`,
  unmapped: `${prefix}_unmapped`
};

const backupRoot = path.join(phaseRoot, "staging-backups");
const manifests = fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot).sort().reverse().map(directory => path.join(backupRoot, directory, "manifest.json")).filter(file => fs.existsSync(file)) : [];
const preparedCutoff = existing?.preparedAt ? Date.parse(existing.preparedAt) : Infinity;
const baselineFile = manifests.find(file => Date.parse(JSON.parse(fs.readFileSync(file, "utf8")).recordedAt) <= preparedCutoff);
if (!baselineFile) throw new Error("A restricted pre-fixture Phase 7 Staging backup manifest is required.");
const baselineBytes = fs.readFileSync(baselineFile), baselineManifest = JSON.parse(baselineBytes);
if (baselineManifest.environment !== "staging" || baselineManifest.projectRef !== context.staging.ref || !baselineManifest.baseline) throw new Error("The Phase 7 baseline manifest does not match isolated Staging.");

const priorManual = fs.existsSync(manualFile) ? JSON.parse(fs.readFileSync(manualFile, "utf8")) : null;
const sharedPassword = priorManual?.sharedPassword || `P7!${crypto.randomBytes(24).toString("base64url")}`;
const users = {
  customer: { uid: ids.customer, email: `${ids.customer}@example.invalid`, displayName: "Phase 7 Customer" },
  restaurant: { uid: ids.restaurantUser, email: `${ids.restaurantUser}@example.invalid`, displayName: "Phase 7 Restaurant" },
  restaurantB: { uid: ids.restaurantBUser, email: `${ids.restaurantBUser}@example.invalid`, displayName: "Phase 7 Restaurant B" },
  suspended: { uid: ids.suspendedCustomer, email: `${ids.suspendedCustomer}@example.invalid`, displayName: "Phase 7 Suspended" },
  revoked: { uid: ids.revokedCustomer, email: `${ids.revokedCustomer}@example.invalid`, displayName: "Phase 7 Revoked" },
  pendingRestaurant: { uid: ids.pendingRestaurantUser, email: `${ids.pendingRestaurantUser}@example.invalid`, displayName: "Phase 7 Pending Restaurant" },
  pendingAdmin: { uid: ids.pendingAdmin, email: `${ids.pendingAdmin}@example.invalid`, displayName: "Phase 7 Pending Admin" },
  unmapped: { uid: ids.unmapped, email: `${ids.unmapped}@example.invalid`, displayName: "Phase 7 Unmapped" }
};

const app = firebaseApp(context, "fixtures"), auth = app.auth(), createdUids = [];
try {
  for (const user of Object.values(users)) {
    try {
      await auth.getUser(user.uid);
      await auth.updateUser(user.uid, { email: user.email, emailVerified: true, displayName: user.displayName, password: sharedPassword, disabled: false });
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
      await auth.createUser({ ...user, emailVerified: true, password: sharedPassword });
      createdUids.push(user.uid);
    }
    await auth.setCustomUserClaims(user.uid, { role: "authenticated" });
  }

  await sql(context, `begin;
    insert into public.restaurants(id,name,description,cuisine,address,is_active,lifecycle_status,accepting_orders,delivery_eta_min_minutes,delivery_eta_max_minutes) values
      (${q(ids.restaurant)},'Phase 7 isolated load Restaurant','Disposable Phase 7 qualification','Test','Synthetic',true,'active',true,5,10),
      (${q(ids.restaurantB)},'Phase 7 isolated Restaurant B','Disposable cross-tenant qualification','Test','Synthetic',true,'active',true,5,10)
      on conflict(id) do nothing;
    insert into public.profiles(id,firebase_uid,name,email) values
      (${q(ids.customer)},${q(ids.customer)},'Phase 7 Customer',${q(users.customer.email)}),
      (${q(ids.restaurantUser)},${q(ids.restaurantUser)},'Phase 7 Restaurant',${q(users.restaurant.email)}),
      (${q(ids.restaurantBUser)},${q(ids.restaurantBUser)},'Phase 7 Restaurant B',${q(users.restaurantB.email)}),
      (${q(ids.suspendedCustomer)},${q(ids.suspendedCustomer)},'Phase 7 Suspended',${q(users.suspended.email)}),
      (${q(ids.revokedCustomer)},${q(ids.revokedCustomer)},'Phase 7 Revoked',${q(users.revoked.email)}),
      (${q(ids.pendingRestaurantUser)},${q(ids.pendingRestaurantUser)},'Phase 7 Pending Restaurant',${q(users.pendingRestaurant.email)}),
      (${q(ids.pendingAdmin)},${q(ids.pendingAdmin)},'Phase 7 Pending Admin',${q(users.pendingAdmin.email)})
      on conflict(id) do nothing;
    insert into private.account_access(profile_id,account_type,status,onboarding_step,restaurant_id,restaurant_role,admin_role,activated_at,suspended_at,revoked_at) values
      (${q(ids.customer)},'customer','active','none',null,null,null,transaction_timestamp(),null,null),
      (${q(ids.restaurantUser)},'restaurant','active','none',${q(ids.restaurant)},'owner',null,transaction_timestamp(),null,null),
      (${q(ids.restaurantBUser)},'restaurant','active','none',${q(ids.restaurantB)},'owner',null,transaction_timestamp(),null,null),
      (${q(ids.suspendedCustomer)},'customer','suspended','none',null,null,null,transaction_timestamp(),transaction_timestamp(),null),
      (${q(ids.revokedCustomer)},'customer','revoked','none',null,null,null,transaction_timestamp(),null,transaction_timestamp()),
      (${q(ids.pendingRestaurantUser)},'restaurant','pending','restaurant_approval_required',${q(ids.restaurant)},'manager',null,null,null,null),
      (${q(ids.pendingAdmin)},'admin','pending','admin_mfa_enrollment_required',null,null,'admin',null,null,null)
      on conflict(profile_id) do nothing;
    insert into public.addresses(id,profile_id,label,line1,city,country,is_default) values(${q(ids.address)},${q(ids.customer)},'Phase 7','Synthetic qualification address','Staging','Test',true) on conflict do nothing;
    insert into public.categories(id,restaurant_id,name,is_active,sort_order) values(${q(ids.category)},${q(ids.restaurant)},'Phase 7',true,99999) on conflict(id) do nothing;
    insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order) values(${q(ids.item)},${q(ids.restaurant)},${q(ids.category)},'Phase 7 meal',100,true,0) on conflict(id) do nothing;
    commit;`);

  const firebaseUids = Object.fromEntries(Object.entries(users).map(([key, user]) => [key, user.uid]));
  atomicWriteJson(fixtureFile, {
    contractVersion: 2,
    preparedAt: existing?.preparedAt || new Date().toISOString(),
    augmentedAt: new Date().toISOString(),
    ...ids,
    firebaseUids,
    baseline: baselineManifest.baseline,
    baselineManifestSha256: sha256(baselineBytes),
    hasPushRegistrations: false
  });
  atomicWriteJson(manualFile, {
    contractVersion: 1,
    environment: "staging",
    fixturePrefix: prefix,
    preparedAt: new Date().toISOString(),
    sharedPassword,
    accounts: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { email: user.email, expectedAccess: key === "customer" || key === "restaurant" || key === "restaurantB" ? "active" : key }]))
  });
  console.log(JSON.stringify({ prepared: true, resumed: Boolean(existing), fixturePrefix: prefix, contractVersion: 2, manualAccountCount: Object.keys(users).length, baselineManifestSha256: sha256(baselineBytes) }));
} catch (error) {
  for (const uid of createdUids) await auth.deleteUser(uid).catch(() => {});
  throw error;
} finally {
  await app.delete();
}
