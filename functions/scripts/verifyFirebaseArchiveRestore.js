const crypto = require("node:crypto");
const fs = require("node:fs");
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const archivePath = value("--archive");
const keyPath = value("--encryption-key-file");
if (!args.includes("--confirm-emulator-restore")) throw new Error("Use --confirm-emulator-restore; this command writes only to empty Firebase emulators.");
if (!archivePath || !keyPath || !fs.existsSync(archivePath) || !fs.existsSync(keyPath)) throw new Error("Provide the encrypted archive and external encryption-key file.");
const loopback = (host) => /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host || "");
if (!loopback(process.env.FIRESTORE_EMULATOR_HOST) || !loopback(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  throw new Error("Both Firestore and Auth emulator hosts must point to loopback addresses.");
}

const envelope = JSON.parse(fs.readFileSync(archivePath, "utf8"));
if (envelope.algorithm !== "aes-256-gcm") throw new Error("Unsupported archive encryption algorithm.");
const key = crypto.createHash("sha256").update(fs.readFileSync(keyPath)).digest();
const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
const sourceChecksum = crypto.createHash("sha256").update(plaintext).digest("hex");
const archive = JSON.parse(plaintext.toString("utf8"));
admin.initializeApp({ projectId: archive.projectId });
const database = admin.firestore();

const decode = (input) => {
  if (input == null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(decode);
  if (input.__type === "timestamp") return admin.firestore.Timestamp.fromDate(new Date(input.value));
  if (input.__type === "geopoint") return new admin.firestore.GeoPoint(input.latitude, input.longitude);
  if (input.__type === "bytes") return Buffer.from(input.value, "base64");
  if (input.__type === "reference") return database.doc(input.path);
  return Object.fromEntries(Object.entries(input).map(([name, value]) => [name, decode(value)]));
};
const countDocuments = (collections) => Object.values(collections || {}).reduce((sum, documents) => sum + documents.reduce((documentSum, document) => documentSum + 1 + countDocuments(document.collections), 0), 0);
const restoreCollection = async (collectionPath, documents) => {
  for (const document of documents) {
    const reference = database.collection(collectionPath).doc(document.id);
    await reference.set(decode(document.data));
    for (const [name, children] of Object.entries(document.collections || {})) await restoreCollection(`${reference.path}/${name}`, children);
  }
};

const run = async () => {
  const existingRoots = await database.listCollections();
  const existingAuth = await admin.auth().listUsers(1);
  if (existingRoots.length || existingAuth.users.length) throw new Error("Restore verification requires empty Firestore and Auth emulators.");
  for (const [name, documents] of Object.entries(archive.firestore || {})) await restoreCollection(name, documents);
  for (const user of archive.authUsers || []) {
    await admin.auth().createUser({ uid: user.uid, email: user.email, emailVerified: Boolean(user.emailVerified), displayName: user.displayName, photoURL: user.photoURL, phoneNumber: user.phoneNumber, disabled: Boolean(user.disabled) });
    if (user.customClaims) await admin.auth().setCustomUserClaims(user.uid, user.customClaims);
  }
  const restoredRoots = await database.listCollections();
  let restoredDocuments = 0;
  for (const root of restoredRoots) {
    const snapshot = await root.get();
    for (const document of snapshot.docs) {
      const countNested = async (reference) => {
        let total = 0;
        for (const child of await reference.listCollections()) {
          const childSnapshot = await child.get();
          total += childSnapshot.size;
          for (const nested of childSnapshot.docs) total += await countNested(nested.ref);
        }
        return total;
      };
      restoredDocuments += 1 + await countNested(document.ref);
    }
  }
  const restoredAuth = await admin.auth().listUsers(1000);
  const expectedDocuments = countDocuments(archive.firestore);
  if (restoredDocuments !== expectedDocuments || restoredAuth.users.length !== archive.authUsers.length) throw new Error("Emulator restoration counts do not match the encrypted archive.");
  console.log(JSON.stringify({ sourceChecksum, firestoreDocuments: restoredDocuments, authUsers: restoredAuth.users.length, restorationVerified: true }, null, 2));
};
run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
