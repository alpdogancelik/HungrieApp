const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const ROOT = path.resolve(__dirname, "..", "..");
const EXPECTED_PROJECT = "hungrieapp-a2288";
const args = process.argv.slice(2);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const projectId = value("--project-id");
const confirmation = value("--confirm-project");
const credentialPath = value("--service-account");
const keyPath = value("--encryption-key-file");
const outputPath = value("--output");

const outsideRepository = (filePath) => {
  const relative = path.relative(ROOT, path.resolve(filePath));
  return relative.startsWith("..") || path.isAbsolute(relative);
};
if (projectId !== EXPECTED_PROJECT || confirmation !== EXPECTED_PROJECT) throw new Error(`Confirm ${EXPECTED_PROJECT} twice.`);
for (const [label, filePath] of [["service account", credentialPath], ["encryption key", keyPath]]) {
  if (!filePath || !path.isAbsolute(filePath) || !fs.existsSync(filePath) || !outsideRepository(filePath)) {
    throw new Error(`${label} must be an existing absolute file outside the repository.`);
  }
}
if (!outputPath || !path.isAbsolute(outputPath) || !outsideRepository(outputPath) || !outputPath.endsWith(".enc")) {
  throw new Error("--output must be an absolute .enc path outside the repository.");
}
if (fs.existsSync(outputPath)) throw new Error("Refusing to overwrite an existing encrypted archive.");

const normalize = (input) => {
  if (input == null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(normalize);
  if (typeof input.toDate === "function") return { __type: "timestamp", value: input.toDate().toISOString() };
  if (typeof input.latitude === "number" && typeof input.longitude === "number") return { __type: "geopoint", latitude: input.latitude, longitude: input.longitude };
  if (Buffer.isBuffer(input)) return { __type: "bytes", value: input.toString("base64") };
  if (typeof input.path === "string" && input.firestore) return { __type: "reference", path: input.path };
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
};
const exportDocument = async (document) => {
  const children = {};
  const collections = await document.ref.listCollections();
  for (const collection of collections.sort((a, b) => a.id.localeCompare(b.id))) children[collection.id] = await exportCollection(collection);
  return { id: document.id, data: normalize(document.data()), collections: children };
};
const exportCollection = async (collection) => {
  const snapshot = await collection.orderBy(admin.firestore.FieldPath.documentId()).get();
  return Promise.all(snapshot.docs.map(exportDocument));
};

const run = async () => {
  const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (credential.project_id !== projectId) throw new Error("Credential belongs to a different Firebase project.");
  admin.initializeApp({ credential: admin.credential.cert(credential), projectId });
  const database = admin.firestore();
  const firestore = {};
  const roots = await database.listCollections();
  for (const collection of roots.sort((a, b) => a.id.localeCompare(b.id))) firestore[collection.id] = await exportCollection(collection);
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    users.push(...page.users.map((user) => normalize(user.toJSON())));
    pageToken = page.pageToken;
  } while (pageToken);
  users.sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
  const body = { schemaVersion: 1, projectId, exportedAt: new Date().toISOString(), firestore, authUsers: users };
  const plaintext = Buffer.from(JSON.stringify(body));
  const sourceChecksum = crypto.createHash("sha256").update(plaintext).digest("hex");
  const keyMaterial = fs.readFileSync(keyPath);
  const key = crypto.createHash("sha256").update(keyMaterial).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = { algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: encrypted.toString("base64") };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, JSON.stringify(envelope), { mode: 0o600, flag: "wx" });
  fs.chmodSync(outputPath, 0o600);
  console.log(JSON.stringify({ project: projectId, rootCollections: Object.keys(firestore).length, authUsers: users.length, sourceChecksum, encryptedArchive: path.basename(outputPath) }, null, 2));
};
run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
