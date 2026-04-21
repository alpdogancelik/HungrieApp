#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(ROOT_DIR, "data");
const BACKUP_DIR = path.resolve(DATA_DIR, "backups");

const DEFAULT_PROJECT_ID = "hungrieapp-a2288";
const COLLECTIONS = {
  restaurants: "restaurants",
  categories: "categories",
  menus: "menus",
};
const CHUNK_SIZE = 400;

const nowIsoCompact = () => new Date().toISOString().replace(/[:.]/g, "-");
const env = (name) => process.env[name] || "";
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    dryRun: true,
    write: false,
    prune: false,
    file: "",
    backupOnly: false,
    serviceAccount: "",
    projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID") || DEFAULT_PROJECT_ID,
    confirmProject: "",
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
    if (a === "--service-account" && args[i + 1]) {
      out.serviceAccount = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (a === "--project-id" && args[i + 1]) {
      out.projectId = String(args[i + 1] || "").trim() || out.projectId;
      i += 1;
      continue;
    }
    if (a === "--confirm-project" && args[i + 1]) {
      out.confirmProject = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
  }

  return out;
};

const assertSafeWrite = (opts) => {
  if (!opts.write) return;
  if (!opts.confirmProject) {
    throw new Error(
      [
        "Refusing to write without project confirmation.",
        `Re-run with --confirm-project=${opts.projectId}`,
      ].join(" "),
    );
  }
  if (opts.confirmProject !== opts.projectId) {
    throw new Error(
      [
        "Project confirmation mismatch.",
        `Resolved project: ${opts.projectId}`,
        `Provided confirmation: ${opts.confirmProject}`,
      ].join(" "),
    );
  }
};

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
        updatedAt: FieldValue.serverTimestamp(),
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
        updatedAt: FieldValue.serverTimestamp(),
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
      updatedAt: FieldValue.serverTimestamp(),
    },
  };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const initAdminApp = async (opts) => {
  if (getApps().length) return getApps()[0];

  const base = { projectId: opts.projectId };
  if (opts.serviceAccount) {
    const serviceAccount = JSON.parse(await fs.readFile(opts.serviceAccount, "utf8"));
    return initializeApp({ ...base, credential: cert(serviceAccount) });
  }
  return initializeApp({ ...base, credential: applicationDefault() });
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
  const snap = await db.collection(collectionName).get();
  return new Set(snap.docs.map((d) => d.id));
};

const writeUpserts = async (db, collectionName, entries, dryRun) => {
  if (dryRun || entries.length === 0) return { written: 0 };

  let written = 0;
  const groups = chunk(entries, CHUNK_SIZE);
  for (const group of groups) {
    const batch = db.batch();
    for (const entry of group) {
      batch.set(db.collection(collectionName).doc(entry.docId), entry.data, { merge: true });
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

const main = async () => {
  const opts = parseArgs();
  const files = await listDataFiles(opts.file);
  if (!files.length) throw new Error("No firestore JSON files found.");
  assertSafeWrite(opts);

  const app = await initAdminApp(opts);
  const db = getFirestore(app);

  console.log(`Using Firebase project: ${opts.projectId}`);
  console.log(`Files to sync: ${files.length}`);
  console.log(`Credential mode: ${opts.serviceAccount ? "service-account" : "application-default"}`);

  const { backupPath, backup } = await backupFirestore(db, opts.projectId);
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
  console.error("[sync-firestore-from-json-admin] Failed:", err?.stack || err?.message || err);
  process.exit(1);
});
