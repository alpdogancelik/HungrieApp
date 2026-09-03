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
if (valueFor("--confirm-project") !== firebaseProject) {
  throw new Error(`Refusing to run without --confirm-project=${firebaseProject}.`);
}
const credentialPath = valueFor("--credential");
if (!path.isAbsolute(credentialPath) || !fs.existsSync(credentialPath)) {
  throw new Error("An existing absolute Firebase credential path is required.");
}
const relativeCredential = path.relative(root, credentialPath);
if (!relativeCredential.startsWith("..") && !path.isAbsolute(relativeCredential)) {
  throw new Error("Firebase credential must remain outside the repository.");
}

const statePath = path.join(root, "secure", "supabase-projects.local.json");
const cliHome = path.join(root, "secure", "supabase-cli-hungrie");
const tokenPath = path.join(cliHome, "access-token");
const outputPath = path.join(root, "secure", "milestone3-firebase-security-probe.json");
if (!fs.existsSync(statePath) || !fs.existsSync(tokenPath)) {
  throw new Error("Ignored Supabase development credentials are unavailable.");
}
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects?.development;
if (!project?.ref || !project?.url || !project?.publishableKey || !project?.databasePassword) {
  throw new Error("Development project configuration is incomplete.");
}
const appConfig = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app.json"), "utf8"));
const firebaseApiKey = appConfig?.expo?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY;
if (!firebaseApiKey) throw new Error("Firebase web API key is unavailable.");
const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
if (serviceAccount.project_id !== firebaseProject) throw new Error("Firebase project mismatch.");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const rewritePayload = (token, mutate) => {
  const [header, payload, signature] = token.split(".");
  const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return `${header}.${encode(mutate(body))}.${signature}`;
};
const exchange = async (customToken) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Firebase token exchange failed (${response.status}).`);
  const body = await response.json();
  if (!body.idToken) throw new Error("Firebase token exchange returned no token.");
  return body.idToken;
};
const call = async (pathname, token, body) => {
  const headers = { apikey: project.publishableKey, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${project.url.replace(/\/$/, "")}/rest/v1/${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
};
const cliEnvironment = {
  ...process.env,
  SUPABASE_HOME: cliHome,
  SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim(),
  SUPABASE_DB_PASSWORD: project.databasePassword,
  PGPASSWORD: project.databasePassword,
};
const runCli = (commandArgs) => {
  const result = spawnSync("supabase", commandArgs, {
    cwd: root, env: cliEnvironment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error("Supabase cleanup command failed.");
};

const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount), projectId: firebaseProject,
}, `milestone3-security-${Date.now()}`);
const auth = firebaseApp.auth();
let testUser;
let profileCreated = false;
let report;
try {
  testUser = await auth.createUser({
    email: `milestone3-${crypto.randomUUID()}@example.invalid`,
    emailVerified: false, disabled: false,
  });
  let triggerAssigned = false;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const current = await auth.getUser(testUser.uid);
    if (current.customClaims?.role === "authenticated") {
      triggerAssigned = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!triggerAssigned) throw new Error("Firebase user-creation claim trigger did not complete.");

  const validToken = await exchange(await auth.createCustomToken(testUser.uid, { role: "authenticated" }));
  const missingRoleToken = await exchange(await auth.createCustomToken(testUser.uid, { role: "anon" }));
  const expiredToken = rewritePayload(validToken, (payload) => ({ ...payload, exp: 1 }));
  const wrongProjectToken = rewritePayload(validToken, (payload) => ({
    ...payload, aud: "wrong-project", iss: "https://securetoken.google.com/wrong-project",
  }));
  const ensureBody = {
    p_name: "Milestone 3 Probe", p_avatar_url: null,
    p_whatsapp_number: null, p_preferred_language: "en",
  };
  const validEnsure = await call("rpc/ensure_my_profile", validToken, ensureBody);
  profileCreated = validEnsure.ok;
  const validRead = await call("profiles?select=id", validToken);
  const cases = {
    validFirebaseToken: validEnsure.ok && validRead.ok,
    anonymousDenied: !(await call("rpc/ensure_my_profile", null, ensureBody)).ok,
    malformedDenied: !(await call("rpc/ensure_my_profile", "not-a-jwt", ensureBody)).ok,
    expiredDenied: !(await call("rpc/ensure_my_profile", expiredToken, ensureBody)).ok,
    wrongProjectDenied: !(await call("rpc/ensure_my_profile", wrongProjectToken, ensureBody)).ok,
    missingRoleDenied: !(await call("rpc/ensure_my_profile", missingRoleToken, ensureBody)).ok,
  };
  const passed = Object.values(cases).every(Boolean);
  report = {
    generatedAt: new Date().toISOString(), firebaseProject,
    triggerAssigned, firebaseUserDeleted: false, supabaseProfileDeleted: false,
    cases, passed,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  if (!passed) throw new Error("Hosted Firebase security matrix did not pass.");
} finally {
  if (profileCreated && testUser) {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m3-cleanup-"));
    const sqlPath = path.join(tempDirectory, "cleanup.sql");
    const safeUid = String(testUser.uid).replace(/[^A-Za-z0-9_-]/g, "");
    fs.writeFileSync(sqlPath, `
      begin;
      delete from private.audit_log where actor_profile_id = '${safeUid}' or target_id = '${safeUid}';
      delete from public.profiles where firebase_uid = '${safeUid}';
      commit;
    `, { mode: 0o600 });
    try {
      runCli(["link", "--project-ref", project.ref, "--password", project.databasePassword]);
      runCli(["db", "query", "--linked", "--file", sqlPath]);
      if (report) report.supabaseProfileDeleted = true;
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
  if (testUser) {
    await auth.deleteUser(testUser.uid);
    if (report) report.firebaseUserDeleted = true;
  }
  await firebaseApp.delete();
  if (report) {
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(outputPath, 0o600);
  }
}

console.log(JSON.stringify({
  passed: report?.passed === true,
  triggerAssigned: report?.triggerAssigned === true,
  cases: Object.keys(report?.cases || {}).length,
  firebaseUserDeleted: report?.firebaseUserDeleted === true,
  supabaseProfileDeleted: report?.supabaseProfileDeleted === true,
}, null, 2));
