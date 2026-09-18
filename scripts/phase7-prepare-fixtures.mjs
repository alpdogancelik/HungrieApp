#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, ensurePrivateDirectory } from "./phase7-runner-lib.mjs";
import { firebaseApp, loadOperatorContext, sql, sqlQuote as q } from "./phase7-staging-client.mjs";

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
if (arg("--confirm") !== "staging:phase7-fixtures") throw new Error("Explicit Staging Phase 7 fixture confirmation is required.");
const credentialPath = path.resolve(arg("--credential") || ""), apiKey = arg("--firebase-api-key");
if (!fs.existsSync(credentialPath) || !apiKey) throw new Error("External Firebase credential and Web API key are required.");
const phaseRoot = path.resolve("secure/phase7"); ensurePrivateDirectory(phaseRoot);
atomicWriteJson(path.join(phaseRoot, "operator-config.json"), { firebaseAdminCredentialPath: credentialPath, firebaseProjectId: "hungrieapp-a2288", firebaseWebApiKey: apiKey });
const context = loadOperatorContext(), existing = path.join(phaseRoot, "fixtures.json");
if (fs.existsSync(existing)) { console.log(JSON.stringify({ prepared: true, resumed: true })); process.exit(0); }
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16), prefix = `phase7_${suffix}`;
const ids = { prefix, restaurant: `${prefix}_restaurant`, category: `${prefix}_category`, item: `${prefix}_item`, customer: `${prefix}_customer`, restaurantUser: `${prefix}_restaurant_user`, address: `${prefix}_address` };
const app = firebaseApp(context, "fixtures"), auth = app.auth(); let customerUser, restaurantUser;
try {
  customerUser = await auth.createUser({ uid: ids.customer, email: `${ids.customer}@example.invalid`, emailVerified: true, displayName: "Phase 7 Customer" });
  restaurantUser = await auth.createUser({ uid: ids.restaurantUser, email: `${ids.restaurantUser}@example.invalid`, emailVerified: true, displayName: "Phase 7 Restaurant" });
  await sql(context, `begin;
    insert into public.restaurants(id,name,description,cuisine,address,is_active,lifecycle_status,accepting_orders,delivery_eta_min_minutes,delivery_eta_max_minutes) values(${q(ids.restaurant)},'Phase 7 isolated load Restaurant','Disposable Phase 7 qualification','Test','Synthetic',true,'active',true,5,10);
    insert into public.profiles(id,firebase_uid,name,email) values(${q(ids.customer)},${q(customerUser.uid)},'Phase 7 Customer',${q(customerUser.email)}),(${q(ids.restaurantUser)},${q(restaurantUser.uid)},'Phase 7 Restaurant',${q(restaurantUser.email)});
    insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role) values(${q(ids.customer)},'customer','active',transaction_timestamp(),null,null),(${q(ids.restaurantUser)},'restaurant','active',transaction_timestamp(),${q(ids.restaurant)},'owner');
    insert into public.addresses(id,profile_id,label,line1,city,country,is_default) values(${q(ids.address)},${q(ids.customer)},'Phase 7','Synthetic qualification address','Staging','Test',true);
    insert into public.categories(id,restaurant_id,name,is_active,sort_order) values(${q(ids.category)},${q(ids.restaurant)},'Phase 7',true,99999);
    insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order) values(${q(ids.item)},${q(ids.restaurant)},${q(ids.category)},'Phase 7 meal',100,true,0);
    commit;`);
  atomicWriteJson(existing, { contractVersion: 1, preparedAt: new Date().toISOString(), ...ids, firebaseUids: { customer: customerUser.uid, restaurant: restaurantUser.uid }, hasPushRegistrations: false });
  console.log(JSON.stringify({ prepared: true, resumed: false, fixturePrefix: prefix }));
} catch (error) {
  if (customerUser) await auth.deleteUser(customerUser.uid).catch(() => {});
  if (restaurantUser) await auth.deleteUser(restaurantUser.uid).catch(() => {});
  throw error;
} finally { await app.delete(); }
