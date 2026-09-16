#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const admin = require(path.join(root, "functions/node_modules/firebase-admin"));
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const credentialPath = path.resolve(arg("--credential") || "");

if (arg("--confirm") !== "nonproduction:phase6-shared-deletion-probe" ||
    !fs.existsSync(credentialPath) || !path.relative(root, credentialPath).startsWith("..")) {
  throw new Error("An external Firebase Admin credential and explicit non-production confirmation are required.");
}

const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (credential.project_id !== "hungrieapp-a2288") throw new Error("Firebase project mismatch.");

const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const environments = [state.projects?.development, state.projects?.staging];
if (environments.some((project) => !project?.ref || !project.url || !project.publishableKey) ||
    environments[0].ref === environments[1].ref || environments.some((project) => project.ref === state.projects?.production?.ref)) {
  throw new Error("Two distinct non-production Supabase projects are required.");
}
const web = JSON.parse(fs.readFileSync(path.join(secure, "admin-firebase-web-development.local.json"), "utf8"));
if (web.projectId !== credential.project_id || !web.apiKey) throw new Error("Firebase Web configuration mismatch.");
const managementToken = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

const query = async (project, sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`${project.name} SQL probe failed (${response.status}).`);
  return response.json();
};

const exchange = async (customToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(web.apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  return (await response.json()).idToken;
};

const callRpc = async (project, name, jwt, body) => {
  const response = await fetch(`${project.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: project.publishableKey, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${project.name} ${name} failed (${response.status}).`);
  return response.json();
};

const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, `phase6-shared-delete-${Date.now()}`);
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
const email = `phase6-shared-delete-${suffix}@example.invalid`;
const createdUids = [];

const registerAndBootstrap = async () => {
  const user = await app.auth().createUser({ email, emailVerified: true, displayName: "Phase 6 Shared Deletion Probe" });
  createdUids.push(user.uid);
  const jwt = await exchange(await app.auth().createCustomToken(user.uid, { role: "authenticated" }));
  for (const project of environments) {
    const result = await callRpc(project, "bootstrap_my_customer_account_v1", jwt, { p_operation_id: crypto.randomUUID() });
    if ((result.profileId || user.uid) !== user.uid) throw new Error(`${project.name} returned an unexpected profile.`);
  }
  return { user, jwt };
};

const deleteThroughCallable = async (uid, jwt) => {
  const response = await fetch("https://us-central1-hungrieapp-a2288.cloudfunctions.net/deleteHungrieAccount", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ data: {} }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.result?.deleted !== true || body.result.pendingFinalization !== false) {
    throw new Error(`Shared deletion callable failed (${response.status}).`);
  }
  await app.auth().getUser(uid).then(
    () => { throw new Error("Firebase identity still exists after deletion."); },
    (error) => { if (error?.code !== "auth/user-not-found") throw error; },
  );
  for (const project of environments) {
    const [row] = await query(project, `select
      exists(select 1 from private.firebase_subject_tombstones where firebase_uid=${q(uid)}) as tombstoned,
      exists(select 1 from public.profiles where id=${q(uid)} and firebase_uid is null and deleted_at is not null) as deleted,
      not exists(select 1 from private.account_email_reservations where normalized_email=${q(email)}) as email_released`);
    if (!row?.tombstoned || !row?.deleted || !row?.email_released) throw new Error(`${project.name} deletion was incomplete.`);
  }
};

let live;
try {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    live = await registerAndBootstrap();
    await deleteThroughCallable(live.user.uid, live.jwt);
    live = undefined;
  }
  console.log(JSON.stringify({
    target: "shared-nonproduction",
    cycles: 3,
    uniqueFirebaseSubjects: new Set(createdUids).size === 3,
    bootstrapInDevelopmentAndStaging: true,
    callableDeletionInDevelopmentAndStaging: true,
    emailReleasedForEveryCycle: true,
  }));
} finally {
  if (live?.user?.uid) await app.auth().deleteUser(live.user.uid).catch(() => undefined);
  await app.delete();
}
