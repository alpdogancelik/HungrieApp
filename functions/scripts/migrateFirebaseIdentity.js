const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const admin = require("firebase-admin");
const { buildIdentityImportSql, canonicalJson, transformIdentity } = require("./identityMigration");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const EXPECTED_PROJECT = "hungrieapp-a2288";
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const valueOf = (name) => {
  const inline = argv.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "";
};
const options = {
  projectId: valueOf("--project-id"), confirmProject: valueOf("--confirm-project"),
  serviceAccount: valueOf("--service-account"), target: valueOf("--target"),
  confirmTarget: valueOf("--confirm-target"), expectedChecksum: valueOf("--expect-source-checksum"),
  output: valueOf("--output") || `secure/identity-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  write: has("--write"),
};

const help = () => console.log(`
Read-only Firebase identity export and dry-run-first Supabase import.

  npm run identity:migrate -- --project-id=${EXPECTED_PROJECT} \\
    --confirm-project=${EXPECTED_PROJECT} \\
    --service-account=/absolute/path/to/read-only-key.json \\
    --target=local --confirm-target=local

The credential must be outside this repository and have Cloud Datastore Viewer
plus Firebase Authentication Viewer. Add --write and
--expect-source-checksum=<reviewed sha256> only after reviewing the dry run.
`);

const assertOptions = () => {
  if (options.projectId !== EXPECTED_PROJECT || options.confirmProject !== EXPECTED_PROJECT) throw new Error(`Both project confirmations must equal ${EXPECTED_PROJECT}.`);
  if (!path.isAbsolute(options.serviceAccount || "") || !fs.existsSync(options.serviceAccount)) throw new Error("A valid absolute --service-account path is required.");
  const credentialRelative = path.relative(ROOT_DIR, options.serviceAccount);
  if (!credentialRelative.startsWith("..") && !path.isAbsolute(credentialRelative)) throw new Error("The credential must be outside the repository.");
  if (!new Set(["local", "development"]).has(options.target) || options.confirmTarget !== options.target) throw new Error("Target and confirmation must both be local or development.");
  const outputPath = path.resolve(ROOT_DIR, options.output);
  const outputRelative = path.relative(SECURE_DIR, outputPath);
  if (!outputRelative || outputRelative.startsWith("..") || path.isAbsolute(outputRelative)) throw new Error("Output must be inside ignored secure/.");
  return outputPath;
};

const firebaseValue = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(firebaseValue);
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firebaseValue(nested)]));
};
const retryRead = async (read, attempts = 4) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      const retryable = error?.code === 7 || error?.code === "permission-denied" || error?.code === "PERMISSION_DENIED";
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
};
const exportCollection = async (db, name) => {
  const snapshot = await retryRead(() => db.collection(name).get());
  return snapshot.docs.map((document) => ({ id: document.id, data: firebaseValue(document.data()) }));
};
const exportAddresses = async (db, users) => {
  const addresses = [];
  for (const user of users) {
    const snapshot = await retryRead(() => db.collection("users").doc(user.id).collection("addresses").get());
    addresses.push(...snapshot.docs.map((document) => ({ profileId: user.id, id: document.id, data: firebaseValue(document.data()) })));
  }
  return addresses;
};
const exportAuthUsers = async () => {
  const users = [];
  let pageToken;
  do {
    const page = await retryRead(() => admin.auth().listUsers(1000, pageToken));
    users.push(...page.users.map((user) => ({ uid: user.uid, email: user.email || null, displayName: user.displayName || null, photoURL: user.photoURL || null, disabled: user.disabled, emailVerified: user.emailVerified })));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
};
const writeSecure = (filePath, body) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, body, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
};

const run = async () => {
  if (has("--help") || has("-h")) return help();
  const outputPath = assertOptions();
  const credential = JSON.parse(fs.readFileSync(options.serviceAccount, "utf8"));
  if (credential.project_id !== EXPECTED_PROJECT) throw new Error("Credential project does not match the confirmed Firebase project.");
  admin.initializeApp({ credential: admin.credential.cert(credential), projectId: EXPECTED_PROJECT });
  const db = admin.firestore();
  // Keep the live audit deliberately low-concurrency. Temporary viewer
  // credentials can be throttled when Firestore and Auth reads fan out at
  // once, which makes otherwise identical audit runs unnecessarily flaky.
  const users = await exportCollection(db, "users");
  const authUsers = await exportAuthUsers();
  const restaurantStaff = await exportCollection(db, "restaurantStaff");
  const restaurants = await exportCollection(db, "restaurants");
  const addresses = await exportAddresses(db, users);
  const result = transformIdentity({ users, authUsers, addresses, restaurantStaff, restaurants });
  if (options.write && options.expectedChecksum !== result.sourceChecksum) throw new Error("Write blocked: --expect-source-checksum must match this reviewed export.");
  const generated = buildIdentityImportSql(result, EXPECTED_PROJECT);
  writeSecure(outputPath, `${canonicalJson({ metadata: { firebaseProject: EXPECTED_PROJECT, target: options.target, dryRun: !options.write, exportedAt: new Date().toISOString(), sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum, runId: generated.runId, counts: result.counts, rejections: result.rejections }, source: result.source, staged: result.staged })}\n`);
  const sqlPath = outputPath.replace(/\.json$/i, "") + ".sql";
  writeSecure(sqlPath, generated.sql);
  if (options.write) {
    const targetFlag = options.target === "local" ? "--local" : "--linked";
    const cliHome = path.join(SECURE_DIR, "supabase-cli-hungrie");
    const tokenPath = path.join(cliHome, "access-token");
    const env = { ...process.env };
    if (options.target === "development") {
      if (!fs.existsSync(tokenPath)) throw new Error("Missing ignored Hungrie Supabase CLI access token.");
      env.SUPABASE_HOME = cliHome;
      env.SUPABASE_ACCESS_TOKEN = fs.readFileSync(tokenPath, "utf8").trim();
    }
    const execution = spawnSync("supabase", ["db", "query", targetFlag, "--file", sqlPath, "--workdir", ROOT_DIR], { cwd: ROOT_DIR, env, encoding: "utf8" });
    if (execution.status !== 0) throw new Error(`Supabase identity import failed: ${execution.stderr.trim() || "unknown error"}`);
  }
  console.log(JSON.stringify({ mode: options.write ? "write" : "dry-run", target: options.target, counts: result.counts, sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum, rejectionCodes: [...new Set(result.rejections.map((item) => item.reasonCode))].sort(), secureExport: path.relative(ROOT_DIR, outputPath), secureSql: path.relative(ROOT_DIR, sqlPath) }, null, 2));
};
run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
