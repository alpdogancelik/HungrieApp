const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const admin = require("firebase-admin");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const MOBILE_DIR = path.join(ROOT_DIR, "mobile");
const APP_JSON_PATH = path.join(MOBILE_DIR, "app.json");
const SAFE_OUTPUT_DIR = path.join(ROOT_DIR, "secure");
const DEFAULT_EMAIL_DOMAIN = "hungrie.app";

const args = process.argv.slice(2);

const hasArg = (name) => args.includes(name);

const getArgValue = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return "";
};

const opts = {
  write: hasArg("--write"),
  dryRun: hasArg("--dry-run") || !hasArg("--write"),
  resetPassword: hasArg("--reset-password"),
  showSecrets: hasArg("--show-secrets") || hasArg("--show-passwords"),
  allowSharedPassword: hasArg("--allow-shared-password"),
  syncOwnerEmail: hasArg("--sync-owner-email"),

  serviceAccount: getArgValue("--service-account"),
  projectId: getArgValue("--project-id"),
  confirmProject: getArgValue("--confirm-project"),

  restaurantId: getArgValue("--restaurant-id"),
  password: getArgValue("--password"),
  output: getArgValue("--output"),
  emailDomain: getArgValue("--email-domain") || DEFAULT_EMAIL_DOMAIN,
};

if (opts.write) {
  opts.dryRun = false;
}

const printHelpAndExit = () => {
  console.log(`
Usage:
  node functions/scripts/provisionRestaurantPanelAccounts.js [options]

Safe default:
  Runs in dry-run mode unless --write is passed.

Options:
  --write
      Actually create/update Firebase Auth users and Firestore documents.

  --dry-run
      Preview only. This is the default.

  --confirm-project=<projectId>
      Required with --write. Prevents writing to the wrong Firebase project.

  --service-account=<path>
      Firebase Admin service account JSON path.

  --project-id=<projectId>
      Firebase project id override.

  --restaurant-id=<id>
      Provision only one restaurant.

  --reset-password
      Reset password for existing panel users.

  --password=<password>
      Use a fixed password. For multiple restaurants, also pass --allow-shared-password.

  --allow-shared-password
      Required when using one static password for multiple restaurants.

  --output=<path>
      Write generated credentials to a JSON file. In repo, path must be under /secure.

  --show-secrets
      Print passwords in console. Not recommended.

  --email-domain=<domain>
      Default: ${DEFAULT_EMAIL_DOMAIN}

  --sync-owner-email
      Also copy panel email into restaurants.ownerEmail (disabled by default).
      Prefer keeping ownerEmail untouched and using panelOwnerEmail.

Examples:
  node functions/scripts/provisionRestaurantPanelAccounts.js

  node functions/scripts/provisionRestaurantPanelAccounts.js \\
    --write \\
    --confirm-project=YOUR_FIREBASE_PROJECT_ID \\
    --output=secure/restaurant-panel-credentials.json

  node functions/scripts/provisionRestaurantPanelAccounts.js \\
    --restaurant-id=voy \\
    --write \\
    --confirm-project=YOUR_FIREBASE_PROJECT_ID \\
    --output=secure/voy-panel-credentials.json
`);
  process.exit(0);
};

if (hasArg("--help") || hasArg("-h")) {
  printHelpAndExit();
}

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const resolveProjectIdFromAppConfig = () => {
  try {
    const parsed = readJsonFile(APP_JSON_PATH);
    return parsed?.expo?.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID || null;
  } catch {
    return null;
  }
};

const loadServiceAccount = () => {
  const explicitPath = opts.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!explicitPath) return null;

  const resolvedPath = path.isAbsolute(explicitPath)
    ? explicitPath
    : path.resolve(process.cwd(), explicitPath);

  return readJsonFile(resolvedPath);
};

const resolveProjectId = (serviceAccount) =>
  opts.projectId ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  serviceAccount?.project_id ||
  resolveProjectIdFromAppConfig();

const initializeFirebaseAdmin = () => {
  if (admin.apps.length) return admin.app();

  const serviceAccount = loadServiceAccount();
  const projectId = resolveProjectId(serviceAccount);

  if (!projectId) {
    throw new Error(
      [
        "Unable to determine Firebase project id.",
        "Pass --project-id=<projectId>, set FIREBASE_PROJECT_ID,",
        "or define expo.extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID in mobile/app.json.",
      ].join(" "),
    );
  }

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  return admin.initializeApp({ projectId });
};

const isPathInside = (targetPath, basePath) => {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveOutputPath = () => {
  if (!opts.output) return null;

  const outputPath = path.isAbsolute(opts.output)
    ? opts.output
    : path.resolve(process.cwd(), opts.output);

  if (isPathInside(outputPath, ROOT_DIR) && !isPathInside(outputPath, SAFE_OUTPUT_DIR)) {
    throw new Error(
      [
        "Unsafe output path inside repository.",
        `When writing in-repo, output must be under: ${SAFE_OUTPUT_DIR}`,
      ].join(" "),
    );
  }

  return outputPath;
};

const assertSafeWrite = ({ projectId, restaurantCount }) => {
  if (!opts.write) return;

  if (!opts.confirmProject) {
    throw new Error(
      [
        "Refusing to write without project confirmation.",
        `Re-run with --confirm-project=${projectId}`,
      ].join(" "),
    );
  }

  if (opts.confirmProject !== projectId) {
    throw new Error(
      [
        "Project confirmation mismatch.",
        `Resolved project: ${projectId}`,
        `Provided confirmation: ${opts.confirmProject}`,
      ].join(" "),
    );
  }

  const willGenerateOrRotatePasswords = opts.resetPassword || !opts.password;
  if (willGenerateOrRotatePasswords && !opts.output && !opts.showSecrets) {
    throw new Error(
      [
        "Refusing to generate/reset passwords without safe delivery.",
        "Pass --output=<path> or explicitly use --show-secrets.",
      ].join(" "),
    );
  }

  if (opts.password && restaurantCount > 1 && !opts.allowSharedPassword) {
    throw new Error(
      [
        "Refusing to use one shared password across multiple restaurants.",
        "If this is intentional for local/dev, add --allow-shared-password.",
      ].join(" "),
    );
  }
};

const normalizeTurkish = (value) =>
  String(value || "").replace(
    /[\u0131\u0130\u00e7\u00c7\u011f\u011e\u00f6\u00d6\u015f\u015e\u00fc\u00dc]/g,
    (char) => {
      const map = {
        "\u0131": "i", // ı
        "\u0130": "i", // İ
        "\u00e7": "c", // ç
        "\u00c7": "c", // Ç
        "\u011f": "g", // ğ
        "\u011e": "g", // Ğ
        "\u00f6": "o", // ö
        "\u00d6": "o", // Ö
        "\u015f": "s", // ş
        "\u015e": "s", // Ş
        "\u00fc": "u", // ü
        "\u00dc": "u", // Ü
      };

      return map[char] || char;
    },
  );
const slugify = (value) =>
  normalizeTurkish(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildEmail = (restaurantId) => {
  const slug = slugify(restaurantId);
  if (!slug) {
    throw new Error(`Invalid restaurant id for panel email: ${restaurantId}`);
  }
  return `panel.${slug}@${opts.emailDomain}`;
};

const generateTemporaryPassword = () => `Hn1!${crypto.randomBytes(18).toString("base64url")}`;
const buildPassword = () => opts.password || generateTemporaryPassword();

const maskSecret = (value) => {
  const raw = String(value || "");
  if (!raw) return null;
  if (raw.length <= 6) return "*".repeat(raw.length);
  return `${raw.slice(0, 2)}${"*".repeat(Math.max(4, raw.length - 6))}${raw.slice(-4)}`;
};

const pickRestaurantName = (doc) => {
  const data = doc.data() || {};
  return String(data.name || data.title || doc.id || "Restoran");
};

const loadRestaurants = async (db) => {
  if (opts.restaurantId) {
    const doc = await db.collection("restaurants").doc(opts.restaurantId).get();
    if (!doc.exists) {
      throw new Error(`Restaurant not found: ${opts.restaurantId}`);
    }
    return [doc];
  }

  const snapshot = await db.collection("restaurants").get();
  if (snapshot.empty) {
    throw new Error("No restaurants found in Firestore.");
  }
  return snapshot.docs;
};

const upsertAuthUser = async ({ auth, email, password }) => {
  if (opts.dryRun) {
    return {
      uid: `dry-${slugify(email)}`,
      created: false,
      passwordUpdated: false,
      passwordChanged: false,
      status: "dry-run",
    };
  }

  try {
    const existing = await auth.getUserByEmail(email);

    if (opts.resetPassword) {
      await auth.updateUser(existing.uid, {
        password,
        emailVerified: true,
        disabled: false,
      });

      return {
        uid: existing.uid,
        created: false,
        passwordUpdated: true,
        passwordChanged: true,
        status: "password-updated",
      };
    }

    return {
      uid: existing.uid,
      created: false,
      passwordUpdated: false,
      passwordChanged: false,
      status: "already-exists",
    };
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;

    const created = await auth.createUser({
      email,
      password,
      emailVerified: true,
      disabled: false,
    });

    return {
      uid: created.uid,
      created: true,
      passwordUpdated: false,
      passwordChanged: true,
      status: "created",
    };
  }
};

const writeRestaurantStaffDoc = async ({
  db,
  uid,
  restaurantId,
  restaurantName,
  email,
  passwordChanged,
}) => {
  if (opts.dryRun) return;

  const ref = db.collection("restaurantStaff").doc(uid);
  const snap = await ref.get();

  const payload = {
    restaurantId,
    restaurantName,
    email,
    role: "owner",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!snap.exists || !snap.get("createdAt")) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (passwordChanged) {
    payload.mustResetPassword = true;
    payload.passwordUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
};

const writeRestaurantPanelFields = async ({ db, restaurantId, email, uid }) => {
  if (opts.dryRun) return;

  const payload = {
    panelOwnerEmail: email,
    panelAccountUid: uid,
    managerEmails: admin.firestore.FieldValue.arrayUnion(email),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (opts.syncOwnerEmail) {
    payload.ownerEmail = email;
  }

  await db.collection("restaurants").doc(restaurantId).set(payload, { merge: true });
};

const buildConsoleRow = (row) => ({
  restaurantId: row.restaurantId,
  restaurantName: row.restaurantName,
  email: row.email,
  uid: row.uid,
  status: row.status,
  createdUser: row.createdUser,
  passwordUpdated: row.passwordUpdated,
  password: opts.showSecrets ? row.password : row.password ? maskSecret(row.password) : null,
});

const buildOutputRow = (row) => ({
  restaurantId: row.restaurantId,
  restaurantName: row.restaurantName,
  email: row.email,
  uid: row.uid,
  status: row.status,
  createdUser: row.createdUser,
  passwordUpdated: row.passwordUpdated,
  mustResetPassword: row.mustResetPassword,
  password: row.password,
});

const writeCredentialsOutput = async (rows, outputPath) => {
  if (!outputPath) return null;

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    firebaseProjectId: admin.app().options.projectId,
    emailDomain: opts.emailDomain,
    containsSecrets: true,
    rows: rows.map(buildOutputRow),
  };

  await fsp.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  return outputPath;
};

const summarizeRows = (rows) =>
  rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    { total: 0 },
  );

async function main() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const projectId = app.options.projectId;
  const resolvedOutputPath = resolveOutputPath();

  const restaurantDocs = await loadRestaurants(db);
  assertSafeWrite({ projectId, restaurantCount: restaurantDocs.length });

  console.log(
    JSON.stringify(
      {
        script: "provisionRestaurantPanelAccounts",
        projectId,
        mode: opts.write ? "write" : "dry-run",
        restaurantsFound: restaurantDocs.length,
        targetRestaurantId: opts.restaurantId || null,
        resetPassword: opts.resetPassword,
        emailDomain: opts.emailDomain,
        output: resolvedOutputPath || null,
        secretsPrinted: opts.showSecrets,
        syncOwnerEmail: opts.syncOwnerEmail,
      },
      null,
      2,
    ),
  );

  const rows = [];

  for (const doc of restaurantDocs) {
    const restaurantId = doc.id;
    const restaurantName = pickRestaurantName(doc);
    const email = buildEmail(restaurantId);
    const password = buildPassword();

    const userResult = await upsertAuthUser({ auth, email, password });

    await writeRestaurantStaffDoc({
      db,
      uid: userResult.uid,
      restaurantId,
      restaurantName,
      email,
      passwordChanged: userResult.passwordChanged,
    });

    await writeRestaurantPanelFields({
      db,
      restaurantId,
      email,
      uid: userResult.uid,
    });

    rows.push({
      restaurantId,
      restaurantName,
      email,
      password: userResult.passwordChanged ? password : null,
      uid: userResult.uid,
      status: userResult.status,
      createdUser: userResult.created,
      passwordUpdated: userResult.passwordUpdated,
      mustResetPassword: userResult.passwordChanged,
    });
  }

  const outputPath = opts.write ? await writeCredentialsOutput(rows, resolvedOutputPath) : null;

  console.log("\nSummary:");
  console.log(JSON.stringify(summarizeRows(rows), null, 2));

  if (outputPath) {
    console.log(`\nCredentials written to: ${outputPath}`);
    console.log("Keep this file private and do not commit it.");
  }

  console.log("\nRestaurant panel accounts:");
  for (const row of rows) {
    console.log(JSON.stringify(buildConsoleRow(row), null, 2));
  }

  if (opts.dryRun) {
    console.log(
      [
        "",
        "Dry-run only. No Firebase Auth users or Firestore documents were changed.",
        `To write, re-run with: --write --confirm-project=${projectId}`,
        "If random passwords will be generated, also pass: --output=<safe-path> or --show-secrets.",
      ].join("\n"),
    );
  }
}

main().catch((error) => {
  console.error(
    "[provision-restaurant-panel-accounts] Failed:",
    error?.stack || error?.message || error,
  );
  process.exit(1);
});

