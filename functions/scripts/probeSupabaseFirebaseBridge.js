#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const FIREBASE_PROJECT_ID = "hungrieapp-a2288";
const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const SECURE_ROOT = path.join(REPOSITORY_ROOT, "secure");

const valueFor = (args, name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
};

const assertOutsideRepository = (filePath) => {
  if (!path.isAbsolute(filePath)) throw new Error("The Firebase credential path must be absolute.");
  const relative = path.relative(REPOSITORY_ROOT, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("The Firebase credential must be outside the repository.");
  }
};

const assertSecureOutput = (filePath) => {
  const absolute = path.resolve(REPOSITORY_ROOT, filePath);
  const relative = path.relative(SECURE_ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Probe output must be a file under secure/.");
  }
  return absolute;
};

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const rewriteTokenPayload = (token, mutate) => {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("Cannot rewrite an invalid JWT.");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return `${header}.${encode(mutate(decoded))}.${signature}`;
};

const exchangeCustomToken = async (customToken, firebaseApiKey) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Firebase token exchange failed with HTTP ${response.status}.`);
  const body = await response.json();
  if (!body.idToken) throw new Error("Firebase token exchange returned no ID token.");
  return body.idToken;
};

const callProbe = async ({ url, publishableKey, token }) => {
  const headers = {
    apikey: publishableKey,
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/migration_auth_probe`, {
    method: "POST",
    headers,
    body: "{}",
  });
  let returnedTrue = false;
  if (response.ok) {
    try {
      returnedTrue = (await response.json()) === true;
    } catch {
      returnedTrue = false;
    }
  }
  return { allowed: response.ok && returnedTrue, httpStatus: response.status };
};

const run = async (argv = process.argv.slice(2)) => {
  if (valueFor(argv, "--confirm-project") !== FIREBASE_PROJECT_ID) {
    throw new Error(`Refusing to run without --confirm-project=${FIREBASE_PROJECT_ID}.`);
  }
  const credentialPath = valueFor(argv, "--credential");
  assertOutsideRepository(credentialPath);
  if (!fs.existsSync(credentialPath)) throw new Error("The Firebase credential file does not exist.");

  const supabaseUrl = process.env.SUPABASE_PROBE_URL || valueFor(argv, "--supabase-url");
  const publishableKey = process.env.SUPABASE_PROBE_PUBLISHABLE_KEY || valueFor(argv, "--publishable-key");
  const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || valueFor(argv, "--firebase-api-key");
  if (!supabaseUrl || !publishableKey || !firebaseApiKey) {
    throw new Error("Supabase URL, publishable key, and Firebase Web API key are required.");
  }
  const outputPath = assertSecureOutput(valueFor(argv, "--output") || "secure/supabase-auth-probe.json");
  const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error("Firebase credential project mismatch.");

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: FIREBASE_PROJECT_ID,
  }, `supabase-auth-probe-${Date.now()}`);
  const auth = app.auth();
  let testUser;

  try {
    testUser = await auth.createUser({
      email: `supabase-bridge-probe-${crypto.randomUUID()}@example.invalid`,
      emailVerified: false,
      disabled: false,
    });

    // This explicit write makes the success case deterministic. The separately
    // deployed creation trigger is verified by polling before it is applied.
    let triggerAssigned = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const current = await auth.getUser(testUser.uid);
      if (current.customClaims?.role === "authenticated") {
        triggerAssigned = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await auth.setCustomUserClaims(testUser.uid, { role: "authenticated" });

    const validCustomToken = await auth.createCustomToken(testUser.uid, { role: "authenticated" });
    const validToken = await exchangeCustomToken(validCustomToken, firebaseApiKey);
    const noRoleCustomToken = await auth.createCustomToken(testUser.uid, { role: "anon" });
    const noRoleToken = await exchangeCustomToken(noRoleCustomToken, firebaseApiKey);
    const expiredToken = rewriteTokenPayload(validToken, (payload) => ({ ...payload, exp: 1 }));
    const wrongProjectToken = rewriteTokenPayload(validToken, (payload) => ({
      ...payload,
      aud: "not-hungrie-firebase-project",
      iss: "https://securetoken.google.com/not-hungrie-firebase-project",
    }));

    const results = {
      validFirebaseToken: await callProbe({ url: supabaseUrl, publishableKey, token: validToken }),
      anonymous: await callProbe({ url: supabaseUrl, publishableKey }),
      malformed: await callProbe({ url: supabaseUrl, publishableKey, token: "not-a-jwt" }),
      expired: await callProbe({ url: supabaseUrl, publishableKey, token: expiredToken }),
      wrongProject: await callProbe({ url: supabaseUrl, publishableKey, token: wrongProjectToken }),
      missingRequiredRole: await callProbe({ url: supabaseUrl, publishableKey, token: noRoleToken }),
    };
    const passed = triggerAssigned && results.validFirebaseToken.allowed && Object.entries(results)
      .filter(([name]) => name !== "validFirebaseToken")
      .every(([, result]) => !result.allowed);

    const report = {
      generatedAt: new Date().toISOString(),
      firebaseProject: FIREBASE_PROJECT_ID,
      triggerAssigned,
      testUserDeleted: false,
      results,
      passed,
      note: "Expired and wrong-project cases use payload-tampered tokens and therefore also have invalid signatures.",
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(outputPath, 0o600);
    console.log(JSON.stringify({ triggerAssigned, passed, cases: Object.keys(results).length }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    if (testUser) await auth.deleteUser(testUser.uid);
    await app.delete();
    if (fs.existsSync(outputPath)) {
      const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      report.testUserDeleted = Boolean(testUser);
      fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(outputPath, 0o600);
    }
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(`Supabase Firebase bridge probe failed: ${String(error.message || error)}`);
    process.exitCode = 1;
  });
}

module.exports = { rewriteTokenPayload };
