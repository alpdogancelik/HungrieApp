import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const admin = require(path.join(root, "functions", "node_modules", "firebase-admin"));
const args = process.argv.slice(2);
const value = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const credentialPath = value("--credential");
if (value("--confirm") !== "development:phase2-firebase-probe" ||
  !credentialPath || !path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath) ||
  !path.relative(root, credentialPath).startsWith("..")) {
  throw new Error("An external Firebase Admin credential and development probe confirmation are required.");
}
const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
const firebaseProject = "hungrieapp-a2288";
if (credential.project_id !== firebaseProject) throw new Error("Firebase project mismatch.");
const state = JSON.parse(fs.readFileSync(path.join(root, "secure", "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
if (project?.name !== "HungrieApp Development" || project.ref === state.projects?.staging?.ref ||
    project.ref === state.projects?.production?.ref || !project.url || !project.publishableKey) {
  throw new Error("Development Supabase environment mismatch.");
}
const managementToken = fs.readFileSync(path.join(root, "secure", "supabase-cli-hungrie", "access-token"), "utf8").trim();
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const apiKey = appConfig.expo.extra.EXPO_PUBLIC_FIREBASE_API_KEY;
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql })
  });
  if (!response.ok) throw new Error(`Development SQL probe failed (${response.status}); details withheld.`);
  return response.json();
};
const rest = async (endpoint, jwt) => {
  const response = await fetch(`${project.url}/rest/v1/${endpoint}`, {
    method: "POST", headers: { apikey: project.publishableKey,
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), "content-type": "application/json" },
    body: "{}"
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
};
const exchange = async (customToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  return (await response.json()).idToken;
};
const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: firebaseProject },
  `phase2-probe-${Date.now()}`);
const auth = app.auth();
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
const profileId = `phase2_probe_${suffix}`;
const email = `phase2-probe-${suffix}@example.invalid`;
let user;
let profileCreated = false;
try {
  const [before] = await query("select (select count(*) from private.account_access)::integer account_rows,(select count(*) from public.profiles)::integer profiles");
  if (Number(before.account_rows) !== 0) throw new Error("Development is already classified; stopping hosted probe.");
  user = await auth.createUser({ email, emailVerified: true });
  const jwt = await exchange(await auth.createCustomToken(user.uid, { role: "authenticated" }));
  const unmapped = await rest("rpc/get_my_access_context_v1", jwt);
  if (!unmapped.ok || unmapped.body?.state !== "unmapped") {
    throw new Error(`Valid Firebase unmapped context failed (${unmapped.status}).`);
  }
  const anonymous = await rest("rpc/get_my_access_context_v1", null);
  if (anonymous.ok) throw new Error("Anonymous caller reached access context.");
  const badToken = await rest("rpc/get_my_access_context_v1", "invalid.jwt.signature");
  if (badToken.ok) throw new Error("Invalid Firebase token was accepted.");
  const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
  await query(`insert into public.profiles(id,firebase_uid,name,email)
    values(${quote(profileId)},${quote(user.uid)},'Phase 2 Probe',${quote(email)})`);
  profileCreated = true;
  const missing = await rest("rpc/get_my_access_context_v1", jwt);
  if (!missing.ok || missing.body?.state !== "configuration_error" ||
      typeof missing.body.referenceId !== "string") {
    throw new Error(`Mapped identity without canonical row did not fail closed (${missing.status}).`);
  }
  await query(`insert into private.account_access(profile_id,account_type,status,activated_at)
    values(${quote(profileId)},'customer','active',statement_timestamp())`);
  const staleRoleJwt = await exchange(await auth.createCustomToken(user.uid,
    { role: "authenticated", platform_role: "admin" }));
  const resolved = await rest("rpc/get_my_access_context_v1", staleRoleJwt);
  if (!resolved.ok || resolved.body?.state !== "resolved" ||
      resolved.body.accountType !== "customer" || resolved.body.accountStatus !== "active") {
    throw new Error(`Database account classification did not ignore stale role claim (${resolved.status}).`);
  }
  const forbiddenBootstrap = await rest("rpc/bootstrap_my_customer_account_v1", jwt);
  if (forbiddenBootstrap.ok) throw new Error("Phase 2 mutation RPC was client-callable.");
  const [after] = await query("select (select count(*) from private.account_access)::integer account_rows,(select count(*) from public.profiles)::integer profiles");
  if (Number(after.account_rows) !== 1 || Number(after.profiles) !== Number(before.profiles) + 1) {
    throw new Error("Hosted probe changed unexpected account/profile counts.");
  }
  console.log(JSON.stringify({ target: "development", validFirebaseToken: true,
    unmapped: true, mappedWithoutAccountFailsClosed: true, roleClaimIgnored: true,
    anonymousDenied: true, invalidTokenDenied: true, mutationGrantDisabled: true }));
} finally {
  if (profileCreated) {
    const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
    await query(`begin; delete from private.account_access where profile_id=${quote(profileId)};
      delete from public.profiles where id=${quote(profileId)}; commit;`);
  }
  if (user) await auth.deleteUser(user.uid);
  await app.delete();
}
