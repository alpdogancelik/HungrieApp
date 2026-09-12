const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const admin = require("firebase-admin");
const {
  buildImportSql,
  canonicalJson,
  transformCatalog,
} = require("./catalogMigration");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SECURE_DIR = path.join(ROOT_DIR, "secure");
const EXPECTED_PROJECT = "hungrieapp-a2288";
const argv = process.argv.slice(2);
const valueOf = (name) => {
  const inline = argv.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "";
};
const has = (name) => argv.includes(name);
const options = {
  projectId: valueOf("--project-id"),
  confirmProject: valueOf("--confirm-project"),
  serviceAccount: valueOf("--service-account"),
  target: valueOf("--target"),
  confirmTarget: valueOf("--confirm-target"),
  expectSourceChecksum: valueOf("--expect-source-checksum"),
  output: valueOf("--output") || `secure/catalog-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  write: has("--write"),
};

const help = () => console.log(`
Dry-run-first Firebase catalog export and Supabase staging utility.

Dry run (default):
  npm run catalog:migrate -- \\
    --project-id=${EXPECTED_PROJECT} \\
    --confirm-project=${EXPECTED_PROJECT} \\
    --service-account=/absolute/path/to/datastore-viewer-key.json \\
    --target=local --confirm-target=local

Add --write only after reviewing the secure export. For hosted development use
--target=development --confirm-target=development and pin the reviewed snapshot
with --expect-source-checksum=<sha256>. The linked project is used.

The Firebase credential must be a new temporary service-account key with only
Cloud Datastore Viewer access. This script contains no Firebase write calls.
`);

const assertOptions = () => {
  if (options.projectId !== EXPECTED_PROJECT || options.confirmProject !== EXPECTED_PROJECT) {
    throw new Error(`Both project arguments must explicitly equal ${EXPECTED_PROJECT}.`);
  }
  if (!options.serviceAccount || !path.isAbsolute(options.serviceAccount) || !fs.existsSync(options.serviceAccount)) {
    throw new Error("--service-account must be an existing absolute path outside the repository.");
  }
  const relativeCredential = path.relative(ROOT_DIR, options.serviceAccount);
  if (!relativeCredential.startsWith("..") && !path.isAbsolute(relativeCredential)) {
    throw new Error("The temporary Firebase credential must be stored outside the repository.");
  }
  if (!new Set(["local", "development"]).has(options.target) || options.confirmTarget !== options.target) {
    throw new Error("--target and --confirm-target must both explicitly equal local or development.");
  }
  const outputPath = path.resolve(ROOT_DIR, options.output);
  const relativeOutput = path.relative(SECURE_DIR, outputPath);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("--output must be below the ignored secure/ directory.");
  }
  return outputPath;
};

const firestoreValue = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(firestoreValue);
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.latitude === "number" && typeof value.longitude === "number") {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === "string" && value.firestore) return { referencePath: value.path };
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)]));
};

const exportCollection = async (database, collectionName) => {
  const snapshot = await database.collection(collectionName).get();
  return snapshot.docs.map((document) => ({ id: document.id, data: firestoreValue(document.data()) }));
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
  if (credential.project_id !== options.projectId) throw new Error("Credential project does not match the confirmed Firebase project.");
  admin.initializeApp({ credential: admin.credential.cert(credential), projectId: options.projectId });
  const database = admin.firestore();
  const [restaurants, categories, menus] = await Promise.all([
    exportCollection(database, "restaurants"),
    exportCollection(database, "categories"),
    exportCollection(database, "menus"),
  ]);
  const result = transformCatalog({ documents: { restaurants, categories, menus }, rootDir: ROOT_DIR });
  if (options.write && (!options.expectSourceChecksum || options.expectSourceChecksum !== result.sourceChecksum)) {
    throw new Error("Write blocked because --expect-source-checksum does not match the current complete export.");
  }
  const { runId, sql } = buildImportSql(result, options.projectId);
  const exportPayload = {
    metadata: {
      firebaseProject: options.projectId,
      target: options.target,
      dryRun: !options.write,
      exportedAt: new Date().toISOString(),
      sourceChecksum: result.sourceChecksum,
      stagedChecksum: result.stagedChecksum,
      runId,
      counts: result.counts,
      rejections: result.rejections,
    },
    documents: result.source,
    staged: result.staged,
    documentChecksums: result.documentChecksums,
  };
  writeSecure(outputPath, `${canonicalJson(exportPayload)}\n`);
  const sqlPath = outputPath.replace(/\.json$/i, "") + ".sql";
  writeSecure(sqlPath, sql);

  if (options.write) {
    const targetFlag = options.target === "local" ? "--local" : "--linked";
    const cliHome = path.join(SECURE_DIR, "supabase-cli-hungrie");
    const cliTokenPath = path.join(cliHome, "access-token");
    const executionEnvironment = { ...process.env };
    if (options.target === "development") {
      if (!fs.existsSync(cliTokenPath)) throw new Error("Missing the ignored Hungrie Supabase CLI token.");
      executionEnvironment.SUPABASE_HOME = cliHome;
      executionEnvironment.SUPABASE_ACCESS_TOKEN = fs.readFileSync(cliTokenPath, "utf8").trim();
    }
    const execution = spawnSync("supabase", ["db", "query", targetFlag, "--file", sqlPath, "--workdir", ROOT_DIR], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: executionEnvironment,
    });
    if (execution.status !== 0) throw new Error(`Supabase catalog import failed: ${execution.stderr.trim() || "unknown CLI error"}`);
  }

  console.log(JSON.stringify({
    mode: options.write ? "write" : "dry-run",
    target: options.target,
    counts: result.counts,
    sourceChecksum: result.sourceChecksum,
    stagedChecksum: result.stagedChecksum,
    rejectionCodes: [...new Set(result.rejections.map((item) => item.reasonCode))].sort(),
    secureExport: path.relative(ROOT_DIR, outputPath),
    secureSql: path.relative(ROOT_DIR, sqlPath),
  }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
