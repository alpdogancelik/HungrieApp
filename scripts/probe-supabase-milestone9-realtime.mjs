import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const admin = require(path.resolve("functions/node_modules/firebase-admin"));
const { createClient } = require("@supabase/supabase-js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseProject = "hungrieapp-a2288";
const args = process.argv.slice(2);
const valueFor = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || "";
if (valueFor("--confirm-project") !== firebaseProject || valueFor("--confirm-target") !== "development") throw new Error("Explicit Firebase project and development target confirmation are required.");
const credentialPath = valueFor("--credential");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath) || !path.relative(root, credentialPath).startsWith("..")) throw new Error("An external Firebase Authentication Admin credential is required.");

const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const cliHome = path.join(secure, "supabase-cli-hungrie");
const tokenPath = path.join(cliHome, "access-token");
const outputPath = path.join(secure, "milestone9-realtime-probe.json");
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const firebaseApiKey = appConfig?.expo?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY;
if (!project?.url || !project?.publishableKey || !project?.databasePassword || !fs.existsSync(tokenPath) || !firebaseApiKey) throw new Error("Ignored hosted configuration is incomplete.");
const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (serviceAccount.project_id !== firebaseProject) throw new Error("Firebase project mismatch.");
const environment = { ...process.env, SUPABASE_HOME: cliHome, SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim(), PGPASSWORD: project.databasePassword };
const runSql = (sql) => {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql], { cwd: root, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("Hosted Realtime fixture SQL failed.");
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const exchange = async (customToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  return (await response.json()).idToken;
};
const rest = async (pathname, token, body) => {
  const response = await fetch(`${project.url}/rest/v1/${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: project.publishableKey, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* status is sufficient */ }
  return { ok: response.ok, status: response.status, body: parsed };
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const subscribe = async (token, topic, { privateChannel = true } = {}) => {
  const client = createClient(project.url, project.publishableKey, { accessToken: async () => token, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  await client.realtime.setAuth(token);
  const events = [];
  let failure = null;
  const channel = client.channel(topic, { config: { private: privateChannel } }).on("broadcast", { event: "order_changed" }, (event) => events.push({ at: Date.now(), payload: event.payload }));
  const joinedAt = Date.now();
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 8_000);
    channel.subscribe((value, error) => {
      if (error) failure = { name: String(error.name || "Error"), message: String(error.message || "").slice(0, 200) };
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(value)) { clearTimeout(timer); resolve(value); }
    });
  });
  return { client, channel, events, status, failure, joinLatencyMs: Date.now() - joinedAt };
};

const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: firebaseProject }, `milestone9-realtime-${Date.now()}`);
const firebaseAuth = app.auth();
const users = [];
const subscriptions = [];
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const id = (kind) => `m9probe_${kind}_${suffix}`;
const ids = { customer: id("customer"), outsider: id("outsider"), manager: id("manager"), courierA: id("courier_a"), courierB: id("courier_b"), admin: id("admin") };
const restaurantId = id("restaurant");
const categoryId = id("category");
const menuId = id("menu");
const addressId = id("address");
let fixturesCreated = false;
let orderId = null;
let report;
try {
  for (const kind of Object.keys(ids)) users.push(await firebaseAuth.createUser({ email: `m9-${kind}-${suffix}@example.invalid`, disabled: false }));
  const tokens = {};
  const uids = {};
  for (const [index, kind] of Object.keys(ids).entries()) {
    uids[kind] = users[index].uid;
    tokens[kind] = await exchange(await firebaseAuth.createCustomToken(users[index].uid, { role: "authenticated" }));
  }
  runSql(`begin;
    insert into public.profiles(id,firebase_uid,name,email,preferred_language) values
      ${Object.keys(ids).map((kind) => `(${quote(ids[kind])},${quote(uids[kind])},'M9 ${kind}',${quote(`m9-${kind}@example.invalid`)},'en')`).join(",")};
    insert into public.restaurants(id,name,cuisine,address,is_active,delivery_fee_kurus,minimum_order_kurus,preferred_language) values (${quote(restaurantId)},'M9 Probe','Synthetic','Synthetic',true,0,0,'en');
    insert into public.categories(id,restaurant_id,name,is_active,sort_order) values (${quote(categoryId)},${quote(restaurantId)},'Probe',true,0);
    insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order) values (${quote(menuId)},${quote(restaurantId)},${quote(categoryId)},'Probe Meal',1000,true,0);
    insert into public.addresses(id,profile_id,label,line1,city,country,is_default) values (${quote(addressId)},${quote(ids.customer)},'Home','Synthetic','Test','Test',true);
    insert into private.restaurant_members(restaurant_id,profile_id,role) values (${quote(restaurantId)},${quote(ids.manager)},'manager');
    insert into private.user_roles(profile_id,role) values (${quote(ids.courierA)},'courier'),(${quote(ids.courierB)},'courier'),(${quote(ids.admin)},'admin');
    insert into private.restaurant_couriers(restaurant_id,profile_id) values (${quote(restaurantId)},${quote(ids.courierA)}),(${quote(restaurantId)},${quote(ids.courierB)});
  commit;`);
  fixturesCreated = true;

  const requested = {
    customer: await subscribe(tokens.customer, `orders:profile:${ids.customer}`),
    restaurant: await subscribe(tokens.manager, `orders:restaurant:${restaurantId}`),
    queueA: await subscribe(tokens.courierA, `orders:courier-queue:${restaurantId}`),
    queueB: await subscribe(tokens.courierB, `orders:courier-queue:${restaurantId}`),
    assignedA: await subscribe(tokens.courierA, `orders:courier:${ids.courierA}`),
    admin: await subscribe(tokens.admin, "orders:admin"),
    crossCustomer: await subscribe(tokens.outsider, `orders:profile:${ids.customer}`),
    publicAnonymous: await subscribe(tokens.outsider, `orders:profile:${ids.outsider}`, { privateChannel: false }),
  };
  subscriptions.push(...Object.values(requested));
  const authorizedJoined = [requested.customer, requested.restaurant, requested.queueA, requested.queueB, requested.assignedA, requested.admin].every((item) => item.status === "SUBSCRIBED");

  const created = await rest("rpc/create_order", tokens.customer, { p_restaurant_id: restaurantId, p_address_id: addressId, p_payment_method: "cash", p_items: [{ menu_item_id: menuId, quantity: 1, customization_ids: [] }], p_notes: "M9 probe" });
  orderId = typeof created.body === "string" ? created.body : null;
  if (!created.ok || !orderId) throw new Error("Realtime probe order creation failed.");
  await wait(800);
  await rest("rpc/transition_order", tokens.manager, { p_order_id: orderId, p_new_status: "preparing", p_reason: null });
  await rest("rpc/transition_order", tokens.manager, { p_order_id: orderId, p_new_status: "ready", p_reason: null });
  await wait(800);
  const queueEventsBeforeClaim = requested.queueB.events.length;
  await rest("rpc/claim_delivery", tokens.courierA, { p_order_id: orderId });
  await wait(800);
  const queueAfterClaim = await rest(`courier_available_orders?select=id&id=eq.${encodeURIComponent(orderId)}`, tokens.courierB);
  const customerEventsBeforeClientSend = requested.customer.events.length;
  await requested.customer.channel.send({ type: "broadcast", event: "order_changed", payload: { order_id: "client-forbidden" } });
  await wait(500);
  const clientBroadcastDenied = requested.customer.events.length === customerEventsBeforeClientSend;
  const payloads = [requested.customer, requested.restaurant, requested.queueA, requested.queueB, requested.assignedA, requested.admin].flatMap((item) => item.events.map((event) => event.payload));
  const minimalPayloads = payloads.length > 0 && payloads.every((payload) => {
    const keys = Object.keys(payload || {}).sort();
    return JSON.stringify(keys) === JSON.stringify(["id", "operation", "order_id", "version"])
      && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(payload.id || ""));
  });
  const cases = {
    authorizedTopicsJoined: authorizedJoined,
    crossCustomerDenied: requested.crossCustomer.status !== "SUBSCRIBED",
    publicChannelDenied: requested.publicAnonymous.status !== "SUBSCRIBED",
    customerInvalidationReceived: requested.customer.events.length > 0,
    restaurantInvalidationReceived: requested.restaurant.events.length > 0,
    scopedCouriersReceivedReadyQueue: requested.queueA.events.length > 0 && queueEventsBeforeClaim > 0,
    claimInvalidatedOtherCourierQueue: requested.queueB.events.length > queueEventsBeforeClaim && queueAfterClaim.ok && Array.isArray(queueAfterClaim.body) && queueAfterClaim.body.length === 0,
    assignedCourierInvalidationReceived: requested.assignedA.events.length > 0,
    adminInvalidationReceived: requested.admin.events.length > 0,
    payloadsAreMinimal: minimalPayloads,
    clientBroadcastDenied,
  };
  report = { generatedAt: new Date().toISOString(), firebaseProject, cases, passed: Object.values(cases).every(Boolean), authorizedJoinLatencyMs: { min: Math.min(...Object.values(requested).slice(0, 6).map((item) => item.joinLatencyMs)), max: Math.max(...Object.values(requested).slice(0, 6).map((item) => item.joinLatencyMs)) }, diagnostics: Object.fromEntries(Object.entries(requested).map(([name, item]) => [name, { status: item.status, failure: item.failure }])), payloadKeySets: [...new Set(payloads.map((payload) => Object.keys(payload || {}).sort().join(",")))], firebaseUsersRemoved: false, databaseFixturesRemoved: false };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  if (!report.passed) throw new Error("Hosted Milestone 9 Realtime matrix failed.");
} finally {
  for (const item of subscriptions) { await item.client.removeChannel(item.channel).catch(() => undefined); item.client.realtime.disconnect(); }
  if (fixturesCreated) {
    const profiles = Object.values(ids).map(quote).join(",");
    runSql(`begin;
      delete from private.audit_log where actor_profile_id in (${profiles}) or target_id like 'm9probe_%';
      delete from private.order_status_history where changed_by_profile_id in (${profiles}) or order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from public.order_items where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from private.order_contacts where order_id in (select id from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)});
      delete from public.orders where profile_id=${quote(ids.customer)} and restaurant_id=${quote(restaurantId)};
      delete from private.restaurant_couriers where restaurant_id=${quote(restaurantId)};
      delete from private.restaurant_members where restaurant_id=${quote(restaurantId)};
      delete from private.user_roles where profile_id in (${profiles});
      delete from public.addresses where profile_id in (${profiles});
      delete from public.menu_items where restaurant_id=${quote(restaurantId)};
      delete from public.categories where restaurant_id=${quote(restaurantId)};
      delete from public.restaurants where id=${quote(restaurantId)};
      delete from public.profiles where id in (${profiles});
    commit;`);
    if (report) report.databaseFixturesRemoved = true;
  }
  for (const user of users) await firebaseAuth.deleteUser(user.uid).catch(() => undefined);
  if (report) report.firebaseUsersRemoved = true;
  await app.delete();
  if (report) fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

console.log(JSON.stringify({ passed: report?.passed === true, cases: Object.keys(report?.cases || {}).length, firebaseUsersRemoved: report?.firebaseUsersRemoved === true, databaseFixturesRemoved: report?.databaseFixturesRemoved === true }, null, 2));
