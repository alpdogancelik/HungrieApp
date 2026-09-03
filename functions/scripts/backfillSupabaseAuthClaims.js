#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const REQUIRED_PROJECT_ID = "hungrieapp-a2288";
const REQUIRED_ROLE = "authenticated";
const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");

const parseArgs = (argv) => {
  const valueFor = (name) => {
    const inline = argv.find((arg) => arg.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] || "" : "";
  };
  return {
    write: argv.includes("--write"),
    projectId: valueFor("--confirm-project"),
    credentialPath: valueFor("--credential"),
  };
};

const mergeAuthenticatedRole = (claims) => ({
  ...(claims || {}),
  role: REQUIRED_ROLE,
});

const assertCredentialPath = (credentialPath) => {
  if (!credentialPath) throw new Error("--credential must be an absolute path outside the repository.");
  if (!path.isAbsolute(credentialPath)) throw new Error("The credential path must be absolute.");
  const relative = path.relative(REPOSITORY_ROOT, credentialPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("The credential must be stored outside the repository.");
  }
  if (!fs.existsSync(credentialPath)) throw new Error("The credential file does not exist.");
};

const loadAllUsers = async (auth) => {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
};

const run = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv);
  if (options.projectId !== REQUIRED_PROJECT_ID) {
    throw new Error(`Refusing to run without --confirm-project=${REQUIRED_PROJECT_ID}.`);
  }
  assertCredentialPath(options.credentialPath);

  const serviceAccount = JSON.parse(fs.readFileSync(options.credentialPath, "utf8"));
  if (serviceAccount.project_id !== REQUIRED_PROJECT_ID) {
    throw new Error("Credential project does not match the confirmed Firebase project.");
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: REQUIRED_PROJECT_ID,
  }, `supabase-claim-backfill-${Date.now()}`);

  try {
    const auth = app.auth();
    const users = await loadAllUsers(auth);
    const counts = {
      scanned: users.length,
      alreadyCorrect: 0,
      wouldUpdate: 0,
      updated: 0,
      claimsPreserved: 0,
      conflictingRoleClaims: 0,
    };

    for (const user of users) {
      const claims = user.customClaims || {};
      if (claims.role === REQUIRED_ROLE) {
        counts.alreadyCorrect += 1;
        continue;
      }
      counts.wouldUpdate += 1;
      counts.claimsPreserved += Object.keys(claims).length;
      if (typeof claims.role === "string" && claims.role.length > 0) counts.conflictingRoleClaims += 1;
      if (options.write) {
        await auth.setCustomUserClaims(user.uid, mergeAuthenticatedRole(claims));
        counts.updated += 1;
      }
    }

    console.log(JSON.stringify({
      mode: options.write ? "write" : "dry-run",
      project: REQUIRED_PROJECT_ID,
      ...counts,
    }, null, 2));
  } finally {
    await app.delete();
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(`Claim reconciliation failed: ${String(error.message || error)}`);
    process.exitCode = 1;
  });
}

module.exports = { mergeAuthenticatedRole, parseArgs };
