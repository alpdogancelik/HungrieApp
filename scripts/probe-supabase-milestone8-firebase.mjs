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
const credentialRelative = path.relative(root, credentialPath);
if (!credentialRelative.startsWith("..") && !path.isAbsolute(credentialRelative)) throw new Error("Firebase credential must remain outside the repository.");

const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const cliHome = path.join(secure, "supabase-cli-hungrie");
const tokenPath = path.join(cliHome, "access-token");
const outputPath = path.join(secure, "milestone8-firebase-workflow-probe.json");
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const firebaseApiKey = appConfig?.expo?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY;
if (!project?.url || !project?.publishableKey || !project?.databasePassword || !fs.existsSync(tokenPath) || !firebaseApiKey) throw new Error("Ignored hosted configuration is incomplete.");
const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (serviceAccount.project_id !== firebaseProject) throw new Error("Firebase project mismatch.");

const cliEnvironment = { ...process.env, SUPABASE_HOME: cliHome, SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim(), PGPASSWORD: project.databasePassword };
const runSql = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql], { cwd: root, env: cliEnvironment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("Hosted workflow fixture SQL failed.");
};
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
  const response = await fetch(`${project.url.replace(/\/$/, "")}/rest/v1/${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const responseText = await response.text();
  let parsed = null;
  try { parsed = responseText ? JSON.parse(responseText) : null; } catch { /* status is sufficient */ }
  return { ok: response.ok, status: response.status, body: parsed };
};
const rpc = (name, token, body) => rest(`rpc/${name}`, token, { method: "POST", body });
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: firebaseProject }, `milestone8-workflow-${Date.now()}`);
const auth = app.auth();
const users = [];
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const id = (kind) => `m8probe_${kind}_${suffix}`;
const ids = { customer: id("customer"), outsider: id("outsider"), manager: id("manager"), courier: id("courier"), admin: id("admin") };
const restaurantId = id("restaurant");
const categoryId = id("category");
const menuId = id("menu");
const addressId = id("address");
let fixturesCreated = false;
let report;
try {
  const kinds = Object.keys(ids);
  for (const kind of kinds) users.push(await auth.createUser({ email: `m8-${kind}-${suffix}@example.invalid`, emailVerified: false, disabled: false }));
  const tokens = {};
  for (let index = 0; index < kinds.length; index += 1) tokens[kinds[index]] = await exchange(await auth.createCustomToken(users[index].uid, { role: "authenticated" }));
  const uids = Object.fromEntries(kinds.map((kind, index) => [kind, users[index].uid]));
  runSql(`begin;
    insert into public.profiles(id,firebase_uid,name,email,preferred_language) values
      (${quote(ids.customer)},${quote(uids.customer)},'M8 Customer','m8-customer@example.invalid','en'),
      (${quote(ids.outsider)},${quote(uids.outsider)},'M8 Outsider','m8-outsider@example.invalid','en'),
      (${quote(ids.manager)},${quote(uids.manager)},'M8 Manager','m8-manager@example.invalid','en'),
      (${quote(ids.courier)},${quote(uids.courier)},'M8 Courier','m8-courier@example.invalid','en'),
      (${quote(ids.admin)},${quote(uids.admin)},'M8 Admin','m8-admin@example.invalid','en');
    insert into public.restaurants(id,name,description,cuisine,address,is_active,delivery_fee_kurus,minimum_order_kurus,preferred_language)
      values (${quote(restaurantId)},'M8 Probe Restaurant','','Synthetic','Synthetic',true,500,0,'en');
    insert into public.categories(id,restaurant_id,name,is_active,sort_order) values (${quote(categoryId)},${quote(restaurantId)},'Probe',true,0);
    insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order) values (${quote(menuId)},${quote(restaurantId)},${quote(categoryId)},'Probe Meal',2500,true,0);
    insert into public.addresses(id,profile_id,label,line1,city,country,is_default) values (${quote(addressId)},${quote(ids.customer)},'Home','Synthetic','Test','Test',true);
    insert into private.restaurant_members(restaurant_id,profile_id,role) values (${quote(restaurantId)},${quote(ids.manager)},'manager');
    insert into private.user_roles(profile_id,role) values (${quote(ids.courier)},'courier'),(${quote(ids.admin)},'admin');
    insert into private.restaurant_couriers(restaurant_id,profile_id) values (${quote(restaurantId)},${quote(ids.courier)});
  commit;`);
  fixturesCreated = true;

  const createBody = { p_restaurant_id: restaurantId, p_address_id: addressId, p_payment_method: "cash", p_items: [{ menu_item_id: menuId, quantity: 1, customization_ids: [] }], p_notes: "M8 workflow probe" };
  const created = await rpc("create_order", tokens.customer, createBody);
  const orderId = typeof created.body === "string" ? created.body : null;
  if (!created.ok || !orderId) throw new Error("Customer order creation probe failed.");
  const ownList = await rest(`my_orders?select=id,status&id=eq.${encodeURIComponent(orderId)}`, tokens.customer);
  const outsiderList = await rest(`my_orders?select=id,status&id=eq.${encodeURIComponent(orderId)}`, tokens.outsider);
  const ownItems = await rpc("get_order_items", tokens.customer, { p_order_id: orderId });
  const outsiderItems = await rpc("get_order_items", tokens.outsider, { p_order_id: orderId });
  const reminder = await rpc("request_order_reminder", tokens.customer, { p_order_id: orderId });
  const outsiderPrepare = await rpc("transition_order", tokens.outsider, { p_order_id: orderId, p_new_status: "preparing", p_reason: null });
  const preparing = await rpc("transition_order", tokens.manager, { p_order_id: orderId, p_new_status: "preparing", p_reason: null });
  const ready = await rpc("transition_order", tokens.manager, { p_order_id: orderId, p_new_status: "ready", p_reason: null });
  const queue = await rest(`courier_available_orders?select=id,status,restaurant_id&id=eq.${encodeURIComponent(orderId)}`, tokens.courier);
  const outsiderClaim = await rpc("claim_delivery", tokens.outsider, { p_order_id: orderId });
  const claim = await rpc("claim_delivery", tokens.courier, { p_order_id: orderId });
  const assigned = await rest(`courier_assigned_orders?select=id,status&id=eq.${encodeURIComponent(orderId)}`, tokens.courier);
  const delivered = await rpc("transition_order", tokens.courier, { p_order_id: orderId, p_new_status: "delivered", p_reason: null });
  const masked = await rest(`restaurant_orders?select=id,customer_name,customer_email,customer_whatsapp,delivery_address_snapshot&id=eq.${encodeURIComponent(orderId)}`, tokens.manager);
  const directWrite = await rest(`orders?id=eq.${encodeURIComponent(orderId)}`, tokens.customer, { method: "PATCH", body: { total_kurus: 1 } });
  const adminCreated = await rpc("create_order", tokens.customer, { ...createBody, p_notes: "M8 admin probe" });
  const adminOrderId = typeof adminCreated.body === "string" ? adminCreated.body : null;
  const adminCanceled = adminOrderId ? await rpc("transition_order", tokens.admin, { p_order_id: adminOrderId, p_new_status: "canceled", p_reason: "Synthetic support probe" }) : { ok: false };
  const one = (response) => response.ok && Array.isArray(response.body) && response.body.length === 1;
  const zero = (response) => response.ok && Array.isArray(response.body) && response.body.length === 0;
  const cases = {
    customerCreateAllowed: created.ok,
    customerOwnListAllowed: one(ownList),
    otherCustomerOrderDenied: zero(outsiderList),
    customerItemsAllowed: ownItems.ok && Array.isArray(ownItems.body) && ownItems.body.length === 1,
    otherCustomerItemsDenied: !outsiderItems.ok,
    reminderAllowed: reminder.ok,
    unrelatedTransitionDenied: !outsiderPrepare.ok,
    restaurantWorkflowAllowed: preparing.ok && ready.ok,
    scopedCourierQueueAllowed: one(queue),
    unscopedClaimDenied: !outsiderClaim.ok,
    scopedCourierClaimAllowed: claim.ok && one(assigned),
    assignedCourierDeliveryAllowed: delivered.ok,
    terminalRestaurantPiiMasked: one(masked) && masked.body[0].customer_name === null && masked.body[0].customer_email === null && masked.body[0].customer_whatsapp === null && masked.body[0].delivery_address_snapshot === null,
    directOrderWriteDenied: !directWrite.ok,
    adminSupportTransitionAllowed: adminCreated.ok && adminCanceled.ok,
  };
  report = { generatedAt: new Date().toISOString(), firebaseProject, cases, passed: Object.values(cases).every(Boolean), firebaseUsersRemoved: false, databaseFixturesRemoved: false };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  if (!report.passed) throw new Error("Hosted Milestone 8 Firebase workflow matrix did not pass.");
} finally {
  if (fixturesCreated) {
    const profileValues = Object.values(ids).map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
    runSql(`begin;
      delete from private.audit_log where actor_profile_id in (${profileValues}) or target_id like 'm8probe_%';
      delete from private.order_status_history where changed_by_profile_id in (${profileValues}) or order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from public.order_items where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from private.order_contacts where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)};
      delete from private.restaurant_couriers where restaurant_id=${quote(restaurantId)};
      delete from private.restaurant_members where restaurant_id=${quote(restaurantId)};
      delete from private.user_roles where profile_id in (${profileValues});
      delete from public.addresses where profile_id in (${profileValues});
      delete from public.menu_items where restaurant_id=${quote(restaurantId)};
      delete from public.categories where restaurant_id=${quote(restaurantId)};
      delete from public.restaurants where id=${quote(restaurantId)};
      delete from public.profiles where id in (${profileValues});
    commit;`);
    if (report) report.databaseFixturesRemoved = true;
  }
  for (const user of users) await auth.deleteUser(user.uid).catch((error) => { if (error?.code !== "auth/user-not-found") throw error; });
  if (report) report.firebaseUsersRemoved = true;
  await app.delete();
  if (report) { fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); fs.chmodSync(outputPath, 0o600); }
}

console.log(JSON.stringify({ passed: report?.passed === true, cases: Object.keys(report?.cases || {}).length, firebaseUsersRemoved: report?.firebaseUsersRemoved === true, databaseFixturesRemoved: report?.databaseFixturesRemoved === true }, null, 2));
