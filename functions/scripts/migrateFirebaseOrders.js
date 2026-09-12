const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const admin = require("firebase-admin");
const { buildOrderImportSql, canonicalJson, transformOrders } = require("./orderMigration");

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
  serviceAccount: valueOf("--service-account"), target: valueOf("--target"), confirmTarget: valueOf("--confirm-target"),
  expectSourceChecksum: valueOf("--expect-source-checksum"),
  approveQuarantine: valueOf("--approve-quarantine").split(",").map((value) => value.trim()).filter(Boolean),
  output: valueOf("--output") || `secure/order-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  write: has("--write"),
};

const help = () => console.log(`
Dry-run-first Firebase order export and Supabase staging utility.

  npm run order:migrate -- \\
    --project-id=${EXPECTED_PROJECT} --confirm-project=${EXPECTED_PROJECT} \\
    --service-account=/absolute/path/to/datastore-viewer-key.json \\
    --target=local --confirm-target=local

Add --write only with --expect-source-checksum=<reviewed sha256>. An app-owner-
approved snapshot exception must also be named exactly with
--approve-quarantine=DELIVERY_ADDRESS_SNAPSHOT_MISSING. The external
credential needs Cloud Datastore Viewer only. This utility has no Firebase write
or delete operation.
`);
const assertOptions = () => {
  if (options.projectId !== EXPECTED_PROJECT || options.confirmProject !== EXPECTED_PROJECT) throw new Error(`Both project confirmations must equal ${EXPECTED_PROJECT}.`);
  if (!options.serviceAccount || !path.isAbsolute(options.serviceAccount) || !fs.existsSync(options.serviceAccount)) throw new Error("--service-account must be an existing absolute path outside the repository.");
  const credentialRelative = path.relative(ROOT_DIR, options.serviceAccount);
  if (!credentialRelative.startsWith("..") && !path.isAbsolute(credentialRelative)) throw new Error("The credential must be outside the repository.");
  if (!["local", "development"].includes(options.target) || options.confirmTarget !== options.target) throw new Error("--target and --confirm-target must explicitly match local or development.");
  const outputPath = path.resolve(ROOT_DIR, options.output);
  const outputRelative = path.relative(SECURE_DIR, outputPath);
  if (!outputRelative || outputRelative.startsWith("..") || path.isAbsolute(outputRelative)) throw new Error("--output must be inside ignored secure/.");
  return outputPath;
};
const firestoreValue = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(firestoreValue);
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)]));
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const retryRead = async (operation) => {
  let lastError;
  for (const delay of [0, 500, 1500]) {
    if (delay) await wait(delay);
    try { return await operation(); } catch (error) {
      lastError = error;
      const code = String(error?.code || "").toLowerCase();
      if (!code.includes("permission-denied") && !code.includes("unavailable")) throw error;
    }
  }
  throw lastError;
};
const readCollection = async (db, name) => {
  const snapshot = await retryRead(() => db.collection(name).get());
  return snapshot.docs.map((entry) => ({ id: entry.id, data: firestoreValue(entry.data()) }));
};
const readIds = async (db, name) => {
  const snapshot = await retryRead(() => db.collection(name).select().get());
  return snapshot.docs.map((entry) => entry.id).sort();
};
const writeSecure = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
};

const run = async () => {
  if (has("--help") || has("-h")) return help();
  const outputPath = assertOptions();
  const credential = JSON.parse(fs.readFileSync(options.serviceAccount, "utf8"));
  if (credential.project_id !== EXPECTED_PROJECT) throw new Error("Credential project does not match the confirmed Firebase project.");
  admin.initializeApp({ credential: admin.credential.cert(credential), projectId: EXPECTED_PROJECT });
  const db = admin.firestore();
  const orders = await readCollection(db, "orders");
  const [userIds, restaurantIds, menuItemIds] = await Promise.all([readIds(db, "users"), readIds(db, "restaurants"), readIds(db, "menus")]);
  const referencedUsers = [...new Set(orders.map((row) => String(row.data.userId || "").trim()).filter(Boolean))].sort();
  const referencedRestaurants = [...new Set(orders.map((row) => String(row.data.restaurantId || "").trim()).filter(Boolean))].sort();
  const referencedMenuItems = [...new Set(orders.flatMap((row) => (Array.isArray(row.data.items) ? row.data.items : []).map((item) => String(item.menuItemId || item.itemId || item.id || "").trim())).filter(Boolean))].sort();
  const userSet = new Set(userIds); const restaurantSet = new Set(restaurantIds); const menuSet = new Set(menuItemIds);
  const relationshipEvidence = {
    users: referencedUsers.map((id) => ({ id, exists: userSet.has(id) })),
    restaurants: referencedRestaurants.map((id) => ({ id, exists: restaurantSet.has(id) })),
    menuItems: referencedMenuItems.map((id) => ({ id, exists: menuSet.has(id) })),
  };
  const result = transformOrders({ documents: { orders, relationshipEvidence } });
  if (options.write && options.expectSourceChecksum !== result.sourceChecksum) throw new Error("Write blocked because --expect-source-checksum does not match this export.");
  const { runId, sql } = buildOrderImportSql(result, EXPECTED_PROJECT, options.approveQuarantine);
  writeSecure(outputPath, `${canonicalJson({ metadata: { firebaseProject: EXPECTED_PROJECT, target: options.target, dryRun: !options.write, exportedAt: new Date().toISOString(), sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum, runId, counts: result.counts, totals: result.totals, statusCounts: result.statusCounts, rejections: result.rejections }, documents: result.source, staged: result.staged })}\n`);
  const sqlPath = outputPath.replace(/\.json$/i, "") + ".sql";
  writeSecure(sqlPath, sql);
  if (options.write) {
    const environment = { ...process.env };
    if (options.target === "development") {
      const cliHome = path.join(SECURE_DIR, "supabase-cli-hungrie");
      const tokenPath = path.join(cliHome, "access-token");
      if (!fs.existsSync(tokenPath)) throw new Error("Missing ignored Hungrie Supabase CLI token.");
      environment.SUPABASE_HOME = cliHome;
      environment.SUPABASE_ACCESS_TOKEN = fs.readFileSync(tokenPath, "utf8").trim();
    }
    const execution = spawnSync("supabase", ["db", "query", options.target === "local" ? "--local" : "--linked", "--file", sqlPath, "--workdir", ROOT_DIR], { cwd: ROOT_DIR, encoding: "utf8", env: environment });
    if (execution.status !== 0) throw new Error(`Supabase order import failed: ${execution.stderr.trim() || "unknown CLI error"}`);
  }
  console.log(JSON.stringify({ mode: options.write ? "write" : "dry-run", target: options.target, counts: result.counts, statusCounts: result.statusCounts, totals: result.totals, sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum, rejectionCodes: [...new Set(result.rejections.map((row) => row.reasonCode))].sort(), secureExport: path.relative(ROOT_DIR, outputPath), secureSql: path.relative(ROOT_DIR, sqlPath) }, null, 2));
};
run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
