const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const admin = require("firebase-admin");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const MOBILE_DIR = path.join(ROOT_DIR, "mobile");
const DATA_DIR = path.join(MOBILE_DIR, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const COLLECTIONS = {
  restaurants: "restaurants",
  categories: "categories",
  menus: "menus",
};

const CHUNK_SIZE = 400;

const nowIsoCompact = () => new Date().toISOString().replace(/[:.]/g, "-");

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArgValue = (name) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  const inline = args.find((a) => a.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : "";
};

const opts = {
  write: hasArg("--write"),
  dryRun: hasArg("--dry-run") || !hasArg("--write"),
  prune: hasArg("--prune"),
  backupOnly: hasArg("--backup-only"),
  file: getArgValue("--file"),
  serviceAccount: getArgValue("--service-account"),
  projectId: getArgValue("--project-id"),
};

if (opts.write) opts.dryRun = false;

const resolveProjectIdFromAppConfig = () => {
  try {
    const appJsonPath = path.join(MOBILE_DIR, "app.json");
    const raw = fs.readFileSync(appJsonPath, "utf8");
    const parsed = JSON.parse(raw);
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
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(raw);
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

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  if (projectId) {
    return admin.initializeApp({ projectId });
  }

  throw new Error(
    [
      "Unable to determine Firebase Admin credentials.",
      "Provide --service-account=/path/to/serviceAccount.json",
      "or set GOOGLE_APPLICATION_CREDENTIALS.",
    ].join(" "),
  );
};

const readJson = async (filePath) => JSON.parse(await fsp.readFile(filePath, "utf8"));
const ensureDir = async (dir) => fsp.mkdir(dir, { recursive: true });

const listDataFiles = async (singleFile) => {
  if (singleFile) {
    const resolved = path.isAbsolute(singleFile)
      ? singleFile
      : path.resolve(process.cwd(), singleFile);
    return [resolved];
  }

  const entries = await fsp.readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter((d) => d.isFile() && d.name.endsWith("-firestore.json"))
    .map((d) => path.join(DATA_DIR, d.name))
    .sort();
};

const withRestaurantPrefix = (restaurantId, baseId) => {
  const base = String(baseId || "").trim();
  if (!base) return `${restaurantId}-item`;
  if (base.startsWith(`${restaurantId}-`) || base.startsWith(`${restaurantId}_`)) return base;
  return `${restaurantId}-${base}`;
};

const normalizeMenus = (restaurantId, menus) =>
  (menus || []).map((m, idx) => {
    const baseId = String(m.id || `menu-${idx + 1}`);
    const docId = withRestaurantPrefix(restaurantId, baseId);
    return {
      docId,
      data: {
        ...m,
        id: baseId,
        restaurantId,
        imageUrl: String(m.imageUrl || m.image_url || ""),
        image_url: String(m.image_url || m.imageUrl || ""),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
  });

const normalizeCategories = (restaurantId, categories) =>
  (categories || []).map((c, idx) => {
    const baseId = String(c.id || `cat-${idx + 1}`);
    const docId = withRestaurantPrefix(restaurantId, baseId);
    return {
      docId,
      data: {
        ...c,
        id: baseId,
        restaurantId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
  });

const normalizeRestaurant = (restaurant, fallbackId) => {
  const id = String(restaurant?.id || fallbackId);
  return {
    docId: id,
    data: {
      ...restaurant,
      id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const backupFirestore = async (db, projectId) => {
  await ensureDir(BACKUP_DIR);

  const [restaurantsSnap, categoriesSnap, menusSnap] = await Promise.all([
    db.collection(COLLECTIONS.restaurants).get(),
    db.collection(COLLECTIONS.categories).get(),
    db.collection(COLLECTIONS.menus).get(),
  ]);

  const backup = {
    generatedAt: new Date().toISOString(),
    projectId: projectId || "unknown",
    collections: {
      restaurants: restaurantsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      categories: categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      menus: menusSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    },
    counts: {
      restaurants: restaurantsSnap.size,
      categories: categoriesSnap.size,
      menus: menusSnap.size,
    },
  };

  const backupPath = path.join(BACKUP_DIR, `firestore-backup-${nowIsoCompact()}.json`);
  await fsp.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  return { backupPath, backup };
};

const collectDesiredData = async (files) => {
  const restaurants = [];
  const categories = [];
  const menus = [];

  for (const filePath of files) {
    const j = await readJson(filePath);
    const firstRestaurant = Array.isArray(j.restaurants) ? j.restaurants[0] : null;
    if (!firstRestaurant) continue;

    const normalizedRestaurant = normalizeRestaurant(
      firstRestaurant,
      path.basename(filePath).replace(/-firestore\.json$/, ""),
    );

    restaurants.push(normalizedRestaurant);
    categories.push(...normalizeCategories(normalizedRestaurant.docId, j.categories));
    menus.push(...normalizeMenus(normalizedRestaurant.docId, j.menus));
  }

  return { restaurants, categories, menus };
};

const fetchCurrentDocIds = async (db, collectionName) => {
  const snap = await db.collection(collectionName).select().get();
  return new Set(snap.docs.map((d) => d.id));
};

const writeUpserts = async (db, collectionName, entries, dryRun) => {
  if (dryRun || entries.length === 0) return { written: 0 };

  let written = 0;
  const groups = chunk(entries, CHUNK_SIZE);
  for (const group of groups) {
    const batch = db.batch();
    for (const entry of group) {
      const ref = db.collection(collectionName).doc(entry.docId);
      batch.set(ref, entry.data, { merge: true });
      written += 1;
    }
    await batch.commit();
  }

  return { written };
};

const writeDeletes = async (db, collectionName, ids, dryRun) => {
  if (dryRun || ids.length === 0) return { deleted: 0 };

  let deleted = 0;
  const groups = chunk(ids, CHUNK_SIZE);
  for (const group of groups) {
    const batch = db.batch();
    for (const id of group) {
      batch.delete(db.collection(collectionName).doc(id));
      deleted += 1;
    }
    await batch.commit();
  }

  return { deleted };
};

async function main() {
  const files = await listDataFiles(opts.file);
  if (!files.length) throw new Error("No firestore JSON files found.");

  initializeFirebaseAdmin();
  const db = admin.firestore();
  const projectId = admin.app().options.projectId;

  console.log(`Using Firebase project: ${projectId}`);
  console.log(`Files to sync: ${files.length}`);

  const { backupPath, backup } = await backupFirestore(db, projectId);
  console.log(`Backup created: ${backupPath}`);
  console.log(`Backup counts: restaurants=${backup.counts.restaurants}, categories=${backup.counts.categories}, menus=${backup.counts.menus}`);

  if (opts.backupOnly) {
    console.log("Backup-only mode complete.");
    return;
  }

  const desired = await collectDesiredData(files);
  const desiredRestaurantIds = new Set(desired.restaurants.map((x) => x.docId));
  const desiredCategoryIds = new Set(desired.categories.map((x) => x.docId));
  const desiredMenuIds = new Set(desired.menus.map((x) => x.docId));

  const currentRestaurantIds = await fetchCurrentDocIds(db, COLLECTIONS.restaurants);
  const currentCategoryIds = await fetchCurrentDocIds(db, COLLECTIONS.categories);
  const currentMenuIds = await fetchCurrentDocIds(db, COLLECTIONS.menus);

  const toDeleteRestaurants = opts.prune
    ? [...currentRestaurantIds].filter((id) => !desiredRestaurantIds.has(id))
    : [];
  const toDeleteCategories = opts.prune
    ? [...currentCategoryIds].filter((id) => !desiredCategoryIds.has(id))
    : [];
  const toDeleteMenus = opts.prune
    ? [...currentMenuIds].filter((id) => !desiredMenuIds.has(id))
    : [];

  console.log("\nPlanned changes:");
  console.log(`- Upsert restaurants: ${desired.restaurants.length}`);
  console.log(`- Upsert categories: ${desired.categories.length}`);
  console.log(`- Upsert menus: ${desired.menus.length}`);
  console.log(`- Delete restaurants (prune): ${toDeleteRestaurants.length}`);
  console.log(`- Delete categories (prune): ${toDeleteCategories.length}`);
  console.log(`- Delete menus (prune): ${toDeleteMenus.length}`);

  if (opts.dryRun) {
    console.log("\nDry-run only. No Firestore writes performed.");
    return;
  }

  const r1 = await writeUpserts(db, COLLECTIONS.restaurants, desired.restaurants, false);
  const r2 = await writeUpserts(db, COLLECTIONS.categories, desired.categories, false);
  const r3 = await writeUpserts(db, COLLECTIONS.menus, desired.menus, false);

  const d1 = await writeDeletes(db, COLLECTIONS.menus, toDeleteMenus, false);
  const d2 = await writeDeletes(db, COLLECTIONS.categories, toDeleteCategories, false);
  const d3 = await writeDeletes(db, COLLECTIONS.restaurants, toDeleteRestaurants, false);

  console.log("\nSync complete:");
  console.log(`- Wrote restaurants: ${r1.written}`);
  console.log(`- Wrote categories: ${r2.written}`);
  console.log(`- Wrote menus: ${r3.written}`);
  console.log(`- Deleted menus: ${d1.deleted}`);
  console.log(`- Deleted categories: ${d2.deleted}`);
  console.log(`- Deleted restaurants: ${d3.deleted}`);
}

main().catch((err) => {
  console.error("[sync-firestore-from-json-admin] Failed:", err?.stack || err?.message || err);
  process.exit(1);
});
