import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const admin = require(path.resolve("functions/node_modules/firebase-admin"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseProject = "hungrieapp-a2288";
const args = process.argv.slice(2);
const valueFor = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
};
if (valueFor("--confirm-project") !== firebaseProject) throw new Error(`Refusing to run without --confirm-project=${firebaseProject}.`);
const credentialPath = valueFor("--credential");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath)) throw new Error("An absolute Firebase Authentication Admin credential is required.");
const relativeCredential = path.relative(root, credentialPath);
if (!relativeCredential.startsWith("..") && !path.isAbsolute(relativeCredential)) throw new Error("Firebase credential must remain outside the repository.");

const statePath = path.join(root, "secure", "supabase-projects.local.json");
const cliHome = path.join(root, "secure", "supabase-cli-hungrie");
const tokenPath = path.join(cliHome, "access-token");
const outputPath = path.join(root, "secure", "milestone6-firebase-security-probe.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects?.development;
if (!project?.ref || !project?.url || !project?.publishableKey || !project?.databasePassword || !fs.existsSync(tokenPath)) throw new Error("Ignored Supabase development configuration is incomplete.");
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const firebaseApiKey = appConfig?.expo?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY;
if (!firebaseApiKey) throw new Error("Firebase web API key is unavailable.");
const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (serviceAccount.project_id !== firebaseProject) throw new Error("Firebase project mismatch.");

const cliEnvironment = { ...process.env, SUPABASE_HOME: cliHome, SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim(), SUPABASE_DB_PASSWORD: project.databasePassword, PGPASSWORD: project.databasePassword };
const runSql = (sql) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m6-probe-"));
  const sqlPath = path.join(directory, "probe.sql");
  fs.writeFileSync(sqlPath, sql, { mode: 0o600 });
  try {
    const result = spawnSync("supabase", ["db", "query", "--linked", "--file", sqlPath, "--workdir", root], { cwd: root, env: cliEnvironment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error("Hosted probe SQL failed.");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
};
const exchange = async (customToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  const body = await response.json();
  if (!body.idToken) throw new Error("Firebase token exchange returned no ID token.");
  return body.idToken;
};
const rest = async (pathname, token, { method = "GET", body } = {}) => {
  const headers = { apikey: project.publishableKey, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${project.url.replace(/\/$/, "")}/rest/v1/${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* status is enough */ }
  return { ok: response.ok, status: response.status, body: parsed };
};
const callable = async (name, token) => {
  const response = await fetch(`https://us-central1-${firebaseProject}.cloudfunctions.net/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ data: {} }) });
  return { ok: response.ok, status: response.status };
};

const firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: firebaseProject }, `milestone6-security-${Date.now()}`);
const auth = firebaseApp.auth();
const users = [];
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const profile = (kind) => `m6probe_${kind}_${suffix}`;
const profiles = { customerA: profile("customer_a"), customerB: profile("customer_b"), owner: profile("owner"), deletion: profile("deletion") };
const probeRestaurant = `m6probe_restaurant_${suffix}`;
let databaseFixturesCreated = false;
let report;
try {
  for (const kind of Object.keys(profiles)) users.push(await auth.createUser({ email: `m6-${kind}-${suffix}@example.invalid`, emailVerified: false, disabled: false }));
  let triggerAssigned = false;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const current = await Promise.all(users.map((user) => auth.getUser(user.uid)));
    if (current.every((user) => user.customClaims?.role === "authenticated")) { triggerAssigned = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!triggerAssigned) throw new Error("Firebase role-claim trigger did not complete for all test users.");
  const kinds = Object.keys(profiles);
  const tokenByKind = {};
  for (let index = 0; index < users.length; index += 1) tokenByKind[kinds[index]] = await exchange(await auth.createCustomToken(users[index].uid, { role: "authenticated" }));
  const uidByKind = Object.fromEntries(kinds.map((kind, index) => [kind, users[index].uid]));
  const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
  runSql(`
    do $setup$ declare v_restaurant text := ${sqlText(probeRestaurant)}; begin
      insert into public.restaurants(id,name,description,cuisine,address,preferred_language)
        values (v_restaurant,'Milestone 6 Probe','','','Synthetic','en');
      insert into public.profiles(id,firebase_uid,name,email,preferred_language) values
        (${sqlText(profiles.customerA)},${sqlText(uidByKind.customerA)},'Probe Customer A','customer-a@example.invalid','en'),
        (${sqlText(profiles.customerB)},${sqlText(uidByKind.customerB)},'Probe Customer B','customer-b@example.invalid','en'),
        (${sqlText(profiles.owner)},${sqlText(uidByKind.owner)},'Probe Owner','owner@example.invalid','en'),
        (${sqlText(profiles.deletion)},${sqlText(uidByKind.deletion)},'Probe Deletion','deletion@example.invalid','en');
      insert into public.addresses(id,profile_id,label,line1,city,country,is_default) values
        ('shared_address',${sqlText(profiles.customerA)},'Home','Synthetic A','Test','Test',true),
        ('shared_address',${sqlText(profiles.customerB)},'Home','Synthetic B','Test','Test',true);
      insert into public.favorites(profile_id,restaurant_id) values (${sqlText(profiles.customerA)},v_restaurant);
      insert into private.restaurant_members(restaurant_id,profile_id,role) values (v_restaurant,${sqlText(profiles.owner)},'owner');
    end $setup$;
  `);
  databaseFixturesCreated = true;

  const ownProfile = await rest(`profiles?select=id&id=eq.${encodeURIComponent(profiles.customerA)}`, tokenByKind.customerA);
  const crossProfile = await rest(`profiles?select=id&id=eq.${encodeURIComponent(profiles.customerB)}`, tokenByKind.customerA);
  const ownAddresses = await rest("addresses?select=id,profile_id", tokenByKind.customerA);
  const otherAddresses = await rest("addresses?select=id,profile_id", tokenByKind.customerB);
  const ownFavorites = await rest("favorites?select=profile_id,restaurant_id", tokenByKind.customerA);
  const otherFavorites = await rest("favorites?select=profile_id,restaurant_id", tokenByKind.customerB);
  const ownerMembership = await rest("my_restaurant_memberships?select=restaurant_id,role", tokenByKind.owner);
  const nonmemberMembership = await rest("my_restaurant_memberships?select=restaurant_id,role", tokenByKind.customerA);
  const directProfileWrite = await rest(`profiles?id=eq.${encodeURIComponent(profiles.customerA)}`, tokenByKind.customerA, { method: "PATCH", body: { name: "Forbidden" } });
  const safeProfileWrite = await rest("rpc/update_my_profile", tokenByKind.customerA, { method: "POST", body: { p_name: "Updated Probe", p_avatar_url: null, p_whatsapp_number: null, p_preferred_language: "en" } });
  const replaceFavorites = await rest("rpc/replace_my_favorites", tokenByKind.customerA, { method: "POST", body: { p_restaurant_ids: [] } });
  const anonymousProfiles = await rest("profiles?select=id", null);
  const privateRoles = await rest("user_roles?select=profile_id", tokenByKind.owner);
  const ownerDeletion = await callable("deleteHungrieAccount", tokenByKind.owner);
  const ownerStillExists = await auth.getUser(uidByKind.owner).then(() => true, () => false);
  const deletionResult = await callable("deleteHungrieAccount", tokenByKind.deletion);
  const deletionUserGone = await auth.getUser(uidByKind.deletion).then(() => false, (error) => error?.code === "auth/user-not-found");
  const exactly = (response, length, profileId) => response.ok && Array.isArray(response.body) && response.body.length === length && (length === 0 || response.body[0]?.profile_id === profileId || response.body[0]?.id === profileId);
  const cases = {
    ownProfileReadable: exactly(ownProfile, 1, profiles.customerA), crossProfileDenied: exactly(crossProfile, 0),
    ownAddressIsolation: exactly(ownAddresses, 1, profiles.customerA) && exactly(otherAddresses, 1, profiles.customerB),
    favoriteIsolation: exactly(ownFavorites, 1, profiles.customerA) && exactly(otherFavorites, 0),
    membershipIsolation: ownerMembership.ok && ownerMembership.body?.length === 1 && ownerMembership.body[0]?.role === "owner" && nonmemberMembership.ok && nonmemberMembership.body?.length === 0,
    directProfileWriteDenied: !directProfileWrite.ok, safeProfileRpcAllowed: safeProfileWrite.ok, atomicFavoriteRpcAllowed: replaceFavorites.ok,
    anonymousIdentityDenied: !anonymousProfiles.ok, protectedRoleTableDenied: !privateRoles.ok,
    lastOwnerDeletionDenied: !ownerDeletion.ok && ownerStillExists, accountDeletionCompleted: deletionResult.ok && deletionUserGone,
  };
  runSql(`do $verify$ begin
    if not exists(select 1 from public.profiles where id=${sqlText(profiles.deletion)} and deleted_at is not null and firebase_uid is null) then raise exception 'Deleted profile was not anonymized'; end if;
    if exists(select 1 from public.addresses where profile_id=${sqlText(profiles.deletion)}) then raise exception 'Deleted profile retained addresses'; end if;
  end $verify$;`);
  const passed = Object.values(cases).every(Boolean);
  report = {
    generatedAt: new Date().toISOString(), firebaseProject, triggerAssigned, cases, passed,
    diagnostics: {
      ownerDeletionStatus: ownerDeletion.status, ownerStillExists,
      deletionStatus: deletionResult.status, deletionUserGone,
    },
    firebaseUsersRemoved: false, databaseFixturesRemoved: false,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  if (!passed) throw new Error("Hosted Milestone 6 Firebase authorization matrix did not pass.");
} finally {
  if (databaseFixturesCreated) {
    const profileValues = Object.values(profiles).map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
    runSql(`begin;
      delete from private.audit_log where actor_profile_id in (${profileValues}) or target_id in (${profileValues});
      delete from private.restaurant_members where profile_id in (${profileValues});
      delete from public.favorites where profile_id in (${profileValues});
      delete from public.addresses where profile_id in (${profileValues});
      delete from public.profiles where id in (${profileValues});
      delete from public.restaurants where id='${probeRestaurant.replaceAll("'", "''")}';
    commit;`);
    if (report) report.databaseFixturesRemoved = true;
  }
  for (const user of users) await auth.deleteUser(user.uid).catch((error) => { if (error?.code !== "auth/user-not-found") throw error; });
  if (report) report.firebaseUsersRemoved = true;
  await firebaseApp.delete();
  if (report) { fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); fs.chmodSync(outputPath, 0o600); }
}

console.log(JSON.stringify({ passed: report?.passed === true, cases: Object.keys(report?.cases || {}).length, triggerAssigned: report?.triggerAssigned === true, firebaseUsersRemoved: report?.firebaseUsersRemoved === true, databaseFixturesRemoved: report?.databaseFixturesRemoved === true }, null, 2));
