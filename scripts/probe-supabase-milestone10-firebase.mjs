import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const admin = require(path.resolve("functions/node_modules/firebase-admin"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseProject = "hungrieapp-a2288";
const args = process.argv.slice(2);
const valueFor = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  || (args.includes(name) ? args[args.indexOf(name) + 1] : "");
if (valueFor("--confirm-project") !== firebaseProject) throw new Error(`Refusing to run without --confirm-project=${firebaseProject}.`);
const credentialPath = valueFor("--credential");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath)) throw new Error("An external Firebase Authentication Admin credential is required.");
const relativeCredential = path.relative(root, credentialPath);
if (!relativeCredential.startsWith("..") && !path.isAbsolute(relativeCredential)) throw new Error("Firebase credential must remain outside the repository.");

const secureDir = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secureDir, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const cliHome = path.join(secureDir, "supabase-cli-hungrie");
const cliTokenPath = path.join(cliHome, "access-token");
const outputPath = path.join(secureDir, "milestone10-firebase-notification-probe.json");
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const firebaseApiKey = appConfig?.expo?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY;
if (!project?.url || !project?.publishableKey || !project?.databasePassword || !fs.existsSync(cliTokenPath) || !firebaseApiKey) {
  throw new Error("Ignored hosted configuration is incomplete.");
}
const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (serviceAccount.project_id !== firebaseProject) throw new Error("Firebase project mismatch.");

const cliEnvironment = {
  ...process.env,
  SUPABASE_HOME: cliHome,
  SUPABASE_ACCESS_TOKEN: fs.readFileSync(cliTokenPath, "utf8").trim(),
  PGPASSWORD: project.databasePassword,
};
const query = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql, "--output-format", "json"], {
    cwd: root, env: cliEnvironment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error("Hosted Milestone 10 fixture SQL failed.");
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))).rows;
};
const runSql = (sql) => query(sql);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const exchange = async (customToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  const body = await response.json();
  if (!body.idToken) throw new Error("Firebase token exchange returned no ID token.");
  return body.idToken;
};
const rest = async (pathname, token, { method = "GET", body } = {}) => {
  const headers = { apikey: project.publishableKey, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${project.url.replace(/\/$/, "")}/rest/v1/${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* status is sufficient */ }
  return { ok: response.ok, status: response.status, body: parsed };
};
const rpc = (name, token, body = {}) => rest(`rpc/${name}`, token, { method: "POST", body });

const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
const id = (kind) => `m10probe_${kind}_${suffix}`;
const ids = { customer: id("customer"), outsider: id("outsider"), owner: id("owner"), superAdmin: id("super") };
const restaurantId = id("restaurant");
const addressId = id("address");
const customerPush = `ExpoPushToken[m10customer_${suffix}]`;
const ownerPush = `ExpoPushToken[m10owner_${suffix}]`;
const outsiderPush = `ExpoPushToken[m10outsider_${suffix}]`;
const users = [];
let createdRestaurantId = null;
let fixturesCreated = false;
let report;
const firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: firebaseProject }, `m10-probe-${Date.now()}`);
const auth = firebaseApp.auth();

try {
  const kinds = Object.keys(ids);
  for (const kind of kinds) users.push(await auth.createUser({ email: `m10-${kind}-${suffix}@example.invalid`, emailVerified: false, disabled: false }));
  const tokens = {};
  for (let index = 0; index < kinds.length; index += 1) {
    tokens[kinds[index]] = await exchange(await auth.createCustomToken(users[index].uid, { role: "authenticated" }));
  }
  const uids = Object.fromEntries(kinds.map((kind, index) => [kind, users[index].uid]));
  runSql(`begin;
    insert into public.profiles(id,firebase_uid,name,email,preferred_language) values
      (${quote(ids.customer)},${quote(uids.customer)},'M10 Customer','m10-customer@example.invalid','en'),
      (${quote(ids.outsider)},${quote(uids.outsider)},'M10 Outsider','m10-outsider@example.invalid','en'),
      (${quote(ids.owner)},${quote(uids.owner)},'M10 Owner','m10-owner@example.invalid','tr'),
      (${quote(ids.superAdmin)},${quote(uids.superAdmin)},'M10 Super','m10-super@example.invalid','en');
    insert into public.restaurants(id,name,description,cuisine,address,is_active,delivery_fee_kurus,minimum_order_kurus,preferred_language)
      values(${quote(restaurantId)},'M10 Probe Restaurant','','Synthetic','Synthetic',true,500,0,'en');
    insert into public.addresses(id,profile_id,label,line1,city,country,is_default)
      values(${quote(addressId)},${quote(ids.customer)},'Home','Synthetic','Test','Test',true);
    insert into private.restaurant_members(restaurant_id,profile_id,role)
      values(${quote(restaurantId)},${quote(ids.owner)},'owner');
    insert into private.user_roles(profile_id,role) values(${quote(ids.superAdmin)},'super_admin');
  commit;`);
  fixturesCreated = true;

  const anonymousRegister = await rpc("register_my_push_token", null, { p_token: customerPush, p_platform: "ios" });
  const customerRegister = await rpc("register_my_push_token", tokens.customer, { p_token: customerPush, p_platform: "ios" });
  const ownerRegister = await rpc("register_my_push_token", tokens.owner, { p_token: ownerPush, p_platform: "android" });
  const outsiderRegister = await rpc("register_my_push_token", tokens.outsider, { p_token: outsiderPush, p_platform: "ios" });
  const preferenceUpdate = await rpc("update_my_notification_preferences", tokens.customer, {
    p_order_status: false, p_restaurant_orders: true, p_review_replies: false,
  });
  const outsiderUnregister = await rpc("unregister_my_push_token", tokens.outsider, { p_token: customerPush });
  const ownershipAfterAttempt = query(`select json_build_object(
    'customer_active',exists(select 1 from private.push_tokens where profile_id=${quote(ids.customer)} and token=${quote(customerPush)} and is_active),
    'outsider_did_not_take_token',not exists(select 1 from private.push_tokens where profile_id=${quote(ids.outsider)} and token=${quote(customerPush)})
  ) as result`)[0]?.result;

  const category = await rpc("upsert_category", tokens.owner, {
    p_restaurant_id: restaurantId, p_category_id: "", p_name: "Probe category", p_description: "", p_icon: null, p_sort_order: 4, p_is_active: true,
  });
  const categoryId = typeof category.body === "string" ? category.body : null;
  const menu = categoryId ? await rpc("upsert_menu_item", tokens.owner, {
    p_restaurant_id: restaurantId, p_menu_item_id: "", p_category_id: categoryId, p_name: "Probe meal",
    p_price_kurus: 2500, p_description: "", p_image_url: null, p_cost_kurus: null, p_sort_order: 3,
    p_eta_minutes: 10, p_calories: 200, p_protein_grams: 12, p_customizations: [{ id: "extra", name: "Extra", price_kurus: 200 }], p_is_active: true,
  }) : { ok: false };
  const menuId = typeof menu.body === "string" ? menu.body : null;
  const deactivate = menuId ? await rpc("set_menu_item_active", tokens.owner, { p_menu_item_id: menuId, p_is_active: false }) : { ok: false };
  const managementRead = await rpc("get_restaurant_menu_management_data", tokens.owner, { p_restaurant_id: restaurantId });
  const outsiderCatalogWrite = await rpc("upsert_category", tokens.outsider, {
    p_restaurant_id: restaurantId, p_category_id: "", p_name: "Denied", p_description: "", p_icon: null, p_sort_order: 0, p_is_active: true,
  });
  const restaurantUpdate = await rpc("update_restaurant_details", tokens.owner, { p_restaurant_id: restaurantId, p_changes: { preferred_language: "tr" } });
  const ownerCreateRestaurant = await rpc("create_restaurant", tokens.owner, { p_payload: { name: "Denied restaurant" } });
  const superCreateRestaurant = await rpc("create_restaurant", tokens.superAdmin, { p_payload: { name: "M10 Super-created", is_active: false } });
  createdRestaurantId = typeof superCreateRestaurant.body === "string" ? superCreateRestaurant.body : null;

  const reactivateMenu = menuId ? await rpc("set_menu_item_active", tokens.owner, { p_menu_item_id: menuId, p_is_active: true }) : { ok: false };
  const createdOrder = menuId ? await rpc("create_order", tokens.customer, {
    p_restaurant_id: restaurantId, p_address_id: addressId, p_payment_method: "cash",
    p_items: [{ menu_item_id: menuId, quantity: 1, customization_ids: [] }], p_notes: "M10 notification probe",
  }) : { ok: false };
  const orderId = typeof createdOrder.body === "string" ? createdOrder.body : null;
  if (orderId) runSql("select private.materialize_notification_deliveries()");
  const newOrderRecipients = orderId ? query(`select json_build_object(
    'total',(select count(*) from private.notification_deliveries d join private.notification_events e on e.id=d.event_id where e.order_id=${quote(orderId)} and e.event_type='restaurant_new_order'),
    'owner',(select count(*) from private.notification_deliveries d join private.notification_events e on e.id=d.event_id join private.push_tokens t on t.id=d.token_id where e.order_id=${quote(orderId)} and e.event_type='restaurant_new_order' and t.profile_id=${quote(ids.owner)}),
    'outsider',(select count(*) from private.notification_deliveries d join private.notification_events e on e.id=d.event_id join private.push_tokens t on t.id=d.token_id where e.order_id=${quote(orderId)} and e.event_type='restaurant_new_order' and t.profile_id=${quote(ids.outsider)})
  ) as result`)[0]?.result : null;
  const preparing = orderId ? await rpc("transition_order", tokens.owner, { p_order_id: orderId, p_new_status: "preparing", p_reason: null }) : { ok: false };
  if (orderId) runSql("select private.materialize_notification_deliveries()");
  const disabledCustomerDeliveries = orderId ? query(`select count(*)::integer as count from private.notification_deliveries d join private.notification_events e on e.id=d.event_id join private.push_tokens t on t.id=d.token_id where e.order_id=${quote(orderId)} and e.event_type='order_status' and t.profile_id=${quote(ids.customer)}`)[0]?.count : -1;
  const enableCustomer = await rpc("update_my_notification_preferences", tokens.customer, { p_order_status: true, p_restaurant_orders: true, p_review_replies: true });
  const logoutRevoke = await rpc("unregister_my_push_token", tokens.customer, { p_token: customerPush });
  const ready = orderId ? await rpc("transition_order", tokens.owner, { p_order_id: orderId, p_new_status: "ready", p_reason: null }) : { ok: false };
  if (orderId) runSql("select private.materialize_notification_deliveries()");
  const loggedOutDeliveries = orderId ? query(`select count(*)::integer as count from private.notification_deliveries d join private.notification_events e on e.id=d.event_id join private.push_tokens t on t.id=d.token_id where e.order_id=${quote(orderId)} and e.event_type='order_status' and e.expected_status='ready' and t.profile_id=${quote(ids.customer)}`)[0]?.count : -1;
  const customerTokenInactive = query(`select exists(select 1 from private.push_tokens where profile_id=${quote(ids.customer)} and token=${quote(customerPush)} and not is_active and revoked_at is not null) as inactive`)[0]?.inactive;

  const managementItems = Array.isArray(managementRead.body?.items) ? managementRead.body.items : [];
  const cases = {
    anonymousTokenRegistrationDenied: !anonymousRegister.ok,
    callerTokenRegistrationAllowed: customerRegister.ok && ownerRegister.ok && outsiderRegister.ok,
    callerPreferencesPersisted: preferenceUpdate.ok && preferenceUpdate.body?.orderStatus === false && preferenceUpdate.body?.reviewReplies === false,
    crossUserUnregisterCannotRevoke: outsiderUnregister.ok && ownershipAfterAttempt?.customer_active && ownershipAfterAttempt?.outsider_did_not_take_token,
    ownerCatalogManagementAllowed: category.ok && menu.ok && deactivate.ok && managementRead.ok && managementItems.some((item) => item.id === menuId && item.is_active === false),
    unrelatedCatalogWriteDenied: !outsiderCatalogWrite.ok,
    ownerRestaurantUpdateAllowed: restaurantUpdate.ok,
    ownerRestaurantCreateDenied: !ownerCreateRestaurant.ok,
    superAdminRestaurantCreateAllowed: superCreateRestaurant.ok && Boolean(createdRestaurantId),
    restaurantNotificationScoped: createdOrder.ok && newOrderRecipients?.total === 1 && newOrderRecipients?.owner === 1 && newOrderRecipients?.outsider === 0,
    disabledCustomerPreferenceSuppressesDelivery: preparing.ok && disabledCustomerDeliveries === 0,
    loggedOutTokenSuppressesDelivery: enableCustomer.ok && logoutRevoke.ok && ready.ok && customerTokenInactive && loggedOutDeliveries === 0,
    catalogCanReactivateBeforeOrder: reactivateMenu.ok,
  };
  report = { generatedAt: new Date().toISOString(), firebaseProject, cases, passed: Object.values(cases).every(Boolean), firebaseUsersRemoved: false, databaseFixturesRemoved: false };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  if (!report.passed) throw new Error("Hosted Milestone 10 Firebase authorization matrix did not pass.");
} finally {
  if (fixturesCreated) {
    const profiles = Object.values(ids).map(quote).join(",");
    const restaurants = [restaurantId, createdRestaurantId].filter(Boolean).map(quote).join(",");
    runSql(`begin;
      delete from private.notification_deliveries where event_id in (select id from private.notification_events where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)}));
      delete from private.notification_events where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from private.audit_log where actor_profile_id in (${profiles}) or target_id like 'm10probe_%' or target_id in (${restaurants});
      delete from private.order_status_history where changed_by_profile_id in (${profiles}) or order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from public.order_items where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from private.order_contacts where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)};
      delete from private.notification_deliveries where token_id in (select id from private.push_tokens where profile_id in (${profiles}));
      delete from private.push_tokens where profile_id in (${profiles});
      delete from private.notification_preferences where profile_id in (${profiles});
      delete from private.restaurant_members where restaurant_id=${quote(restaurantId)};
      delete from private.user_roles where profile_id in (${profiles});
      delete from public.addresses where profile_id in (${profiles});
      delete from public.menu_items where restaurant_id=${quote(restaurantId)};
      delete from public.categories where restaurant_id=${quote(restaurantId)};
      delete from public.restaurants where id in (${restaurants});
      delete from public.profiles where id in (${profiles});
    commit;`);
    if (report) report.databaseFixturesRemoved = true;
  }
  for (const user of users) await auth.deleteUser(user.uid).catch((error) => { if (error?.code !== "auth/user-not-found") throw error; });
  if (report) report.firebaseUsersRemoved = true;
  await firebaseApp.delete();
  if (report) {
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(outputPath, 0o600);
  }
}

console.log(JSON.stringify({
  passed: report?.passed === true,
  cases: Object.keys(report?.cases || {}).length,
  firebaseUsersRemoved: report?.firebaseUsersRemoved === true,
  databaseFixturesRemoved: report?.databaseFixturesRemoved === true,
}, null, 2));
