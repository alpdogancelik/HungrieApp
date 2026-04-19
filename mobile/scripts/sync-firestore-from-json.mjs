#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(ROOT_DIR, "data");
const BACKUP_DIR = path.resolve(DATA_DIR, "backups");

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCOCAEeBf5IgKP50zSyqFJKBcygwXUuqUA",
  authDomain: "hungrieapp-a2288.firebaseapp.com",
  projectId: "hungrieapp-a2288",
  storageBucket: "hungrieapp-a2288.firebasestorage.app",
  messagingSenderId: "405094874808",
  appId: "1:405094874808:web:a0f159c959938a7ba6fe4d",
  measurementId: "G-DSD4PT8W96",
};

const COLLECTIONS = {
  restaurants: "restaurants",
  categories: "categories",
  menus: "menus",
};

const CHUNK_SIZE = 400;

const nowIsoCompact = () => new Date().toISOString().replace(/[:.]/g, "-");

const env = (name) => process.env[name] || "";

const firebaseConfigFromEnv = () => ({
  apiKey: env("EXPO_PUBLIC_FIREBASE_API_KEY") || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN") || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID") || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET") || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: env("EXPO_PUBLIC_FIREBASE_APP_ID") || DEFAULT_FIREBASE_CONFIG.appId,
  measurementId: env("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID") || DEFAULT_FIREBASE_CONFIG.measurementId,
});

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    dryRun: true,
    write: false,
    prune: false,
    file: "",
    backupOnly: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--write") {
      out.write = true;
      out.dryRun = false;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      out.write = false;
      continue;
    }
    if (a === "--prune") {
      out.prune = true;
      continue;
    }
    if (a === "--file" && args[i + 1]) {
      out.file = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (a === "--backup-only") {
      out.backupOnly = true;
      out.dryRun = true;
      out.write = false;
      continue;
    }
  }

  return out;
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const listDataFiles = async (singleFile) => {
  if (singleFile) return [singleFile];
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
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
        updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
    },
  };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const backupFirestore = async (db) => {
  await ensureDir(BACKUP_DIR);

  const [restaurantsSnap, categoriesSnap, menusSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.restaurants)),
    getDocs(collection(db, COLLECTIONS.categories)),
    getDocs(collection(db, COLLECTIONS.menus)),
  ]);

  const backup = {
    generatedAt: new Date().toISOString(),
    projectId: db.app?.options?.projectId || "unknown",
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
  await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
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
  const snap = await getDocs(collection(db, collectionName));
  return new Set(snap.docs.map((d) => d.id));
};

const writeUpserts = async (db, collectionName, entries, dryRun) => {
  if (dryRun || entries.length === 0) return { written: 0 };

  let written = 0;
  const chunks = chunk(entries, CHUNK_SIZE);
  for (const group of chunks) {
    const batch = writeBatch(db);
    for (const entry of group) {
      batch.set(doc(db, collectionName, entry.docId), entry.data, { merge: true });
      written += 1;
    }
    await batch.commit();
  }

  return { written };
};

const writeDeletes = async (db, collectionName, ids, dryRun) => {
  if (dryRun || ids.length === 0) return { deleted: 0 };
  let deleted = 0;
  for (const id of ids) {
    await deleteDoc(doc(db, collectionName, id));
    deleted += 1;
  }
  return { deleted };
};

const main = async () => {
  const opts = parseArgs();
  const files = await listDataFiles(opts.file);
  if (!files.length) throw new Error("No firestore JSON files found.");

  const config = firebaseConfigFromEnv();
  const app = getApps().length ? getApp() : initializeApp(config);
  const db = getFirestore(app);

  console.log(`Using Firebase project: ${config.projectId}`);
  console.log(`Files to sync: ${files.length}`);

  const { backupPath, backup } = await backupFirestore(db);
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
};

main().catch((err) => {
  console.error("[sync-firestore-from-json] Failed:", err?.stack || err?.message || err);
  process.exit(1);
});
