const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const IMAGE_ALIASES = Object.freeze({
  "@/assets/images/fastfood.png": "@/assets/Categories/Burger1.png",
  "@/assets/images/diet.png": "@/assets/Categories/Salata1.png",
  "@/assets/images/durum.png": "@/assets/Categories/Durum1.png",
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const checksum = (value) => sha256(canonicalJson(value));
const text = (value, fallback = "") => (value == null ? fallback : String(value).trim());
const nullableText = (value) => {
  const result = text(value);
  return result || null;
};
const slugify = (value) => text(value)
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const toKurusExact = (value) => {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error("MONEY_NOT_NUMERIC");
  }
  const source = String(value).trim();
  const match = source.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(source.startsWith("-") ? "MONEY_NEGATIVE" : "MONEY_INVALID_PRECISION");
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || "").padEnd(2, "0"));
  const result = whole * 100n + fraction;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MONEY_OUT_OF_RANGE");
  return Number(result);
};

const parseDeliveryTime = (value) => {
  if (value == null || text(value) === "") return { min: null, max: null };
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return { min: value, max: value };
  const match = text(value).match(/^(\d+)\s*(?:-|–|—|to)?\s*(\d+)?(?:\s*(?:min|mins|minutes|dk|dakika))?$/i);
  if (!match) throw new Error("DELIVERY_TIME_INVALID");
  const min = Number(match[1]);
  const max = Number(match[2] || match[1]);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) throw new Error("DELIVERY_TIME_INVALID");
  return { min, max };
};

const activeValue = (data) => data.visible !== false && data.isActive !== false && data.is_active !== false;
const explicitOrder = (data) => {
  const value = data.sortOrder ?? data.sort_order ?? data.order;
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("SORT_ORDER_INVALID");
  return parsed;
};
const optionalNonnegativeNumber = (value, { integer = false, code }) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) throw new Error(code);
  return parsed;
};

const normalizeImageUrl = (data, rootDir) => {
  const sourceValue = nullableText(data.imageUrl ?? data.image_url ?? data.image ?? data.logoUrl ?? data.logo_url);
  if (!sourceValue) return null;
  const value = IMAGE_ALIASES[sourceValue] || sourceValue;
  if (/^https:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") throw new Error();
      return value;
    } catch {
      throw new Error("IMAGE_URL_INVALID");
    }
  }
  if (value.startsWith("@/assets/")) {
    const relative = value.slice(2);
    const assetPath = path.resolve(rootDir, "mobile", relative);
    const mobileRoot = path.resolve(rootDir, "mobile");
    if (!assetPath.startsWith(`${mobileRoot}${path.sep}`) || !fs.existsSync(assetPath)) throw new Error("IMAGE_ASSET_MISSING");
    return value;
  }
  throw new Error("IMAGE_REFERENCE_INVALID");
};

const normalizeCustomizations = (value) => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("CUSTOMIZATIONS_INVALID");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("CUSTOMIZATION_INVALID");
    const id = text(item.id || item.slug || `customization-${index + 1}`);
    const name = text(item.name || item.label);
    if (!id || !name) throw new Error("CUSTOMIZATION_REQUIRED_FIELD_MISSING");
    const priceKurus = item.price_kurus ?? item.priceKurus;
    return {
      id,
      name,
      price_kurus: priceKurus == null
        ? toKurusExact(item.price ?? 0)
        : (() => {
          const numeric = Number(priceKurus);
          if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error("CUSTOMIZATION_PRICE_INVALID");
          return numeric;
        })(),
    };
  });
};

const buildLocalCatalogIndex = (rootDir) => {
  const dataDir = path.join(rootDir, "mobile", "data");
  const files = fs.readdirSync(dataDir).filter((name) => name.endsWith("-firestore.json")).sort();
  const index = { restaurants: new Map(), categories: new Map(), menus: new Map(), counts: { restaurants: 0, categories: 0, menus: 0 } };
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
    for (const [ordinal, restaurant] of (payload.restaurants || []).entries()) {
      const restaurantId = text(restaurant.id);
      index.restaurants.set(restaurantId, ordinal);
      index.counts.restaurants += 1;
      for (const [categoryOrdinal, category] of (payload.categories || []).entries()) {
        const baseId = text(category.id);
        index.categories.set(`${restaurantId}\0${baseId}`, categoryOrdinal);
        index.categories.set(`${restaurantId}\0${restaurantId}_${baseId}`, categoryOrdinal);
        index.counts.categories += 1;
      }
      for (const [menuOrdinal, item] of (payload.menus || []).entries()) {
        const baseId = text(item.id);
        index.menus.set(`${restaurantId}\0${baseId}`, menuOrdinal);
        index.menus.set(`${restaurantId}\0${restaurantId}_${baseId}`, menuOrdinal);
        index.counts.menus += 1;
      }
    }
  }
  return index;
};

const normalizeDocument = (doc) => ({ id: text(doc.id), data: doc.data || {} });
const rejection = (collectionPath, documentId, error) => ({
  collectionPath,
  documentId,
  reasonCode: error instanceof Error ? error.message : "UNKNOWN_TRANSFORMATION_ERROR",
});

const assignFallbackOrders = (rows) => {
  const groups = new Map();
  for (const row of rows.filter((entry) => entry.sort_order == null)) {
    const key = row.restaurant_id || "restaurants";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const entries of groups.values()) {
    entries.sort((left, right) => `${slugify(left.name)}\0${left.id}`.localeCompare(`${slugify(right.name)}\0${right.id}`));
    entries.forEach((row, index) => { row.sort_order = 1_000_000 + index; });
  }
};

const transformCatalog = ({ documents, rootDir, localIndex = buildLocalCatalogIndex(rootDir) }) => {
  const rejections = [];
  const restaurants = [];
  const categories = [];
  const menuItems = [];
  const restaurantIds = new Set(documents.restaurants.map((doc) => text(doc.id)));

  for (const raw of documents.restaurants.map(normalizeDocument)) {
    try {
      if (!raw.id || !text(raw.data.name)) throw new Error("RESTAURANT_REQUIRED_FIELD_MISSING");
      const eta = parseDeliveryTime(raw.data.deliveryTime ?? raw.data.delivery_time);
      const localOrder = localIndex.restaurants.get(raw.id);
      restaurants.push({
        id: raw.id,
        name: text(raw.data.name),
        description: text(raw.data.description),
        cuisine: text(raw.data.cuisine),
        address: text(raw.data.address),
        phone: nullableText(raw.data.phone),
        image_url: normalizeImageUrl(raw.data, rootDir),
        is_active: activeValue(raw.data),
        delivery_eta_min_minutes: eta.min,
        delivery_eta_max_minutes: eta.max,
        delivery_fee_kurus: toKurusExact(raw.data.deliveryFee ?? raw.data.delivery_fee ?? 0),
        minimum_order_kurus: toKurusExact(raw.data.minimumOrderAmount ?? raw.data.minimumOrder ?? 0),
        opening_hours: raw.data.openingHours && typeof raw.data.openingHours === "object" && !Array.isArray(raw.data.openingHours) ? raw.data.openingHours : {},
        preferred_language: raw.data.preferredLanguage === "en" ? "en" : "tr",
        sort_order: explicitOrder(raw.data) ?? localOrder ?? null,
        document_checksum: checksum({ id: raw.id, data: raw.data }),
      });
    } catch (error) { rejections.push(rejection("restaurants", raw.id, error)); }
  }

  for (const raw of documents.categories.map(normalizeDocument)) {
    try {
      const restaurantId = text(raw.data.restaurantId ?? raw.data.restaurant_id);
      if (!raw.id || !restaurantId || !text(raw.data.name)) throw new Error("CATEGORY_REQUIRED_FIELD_MISSING");
      if (!restaurantIds.has(restaurantId)) throw new Error("CATEGORY_RESTAURANT_MISSING");
      const localOrder = localIndex.categories.get(`${restaurantId}\0${raw.id}`) ?? localIndex.categories.get(`${restaurantId}\0${text(raw.data.id)}`);
      categories.push({
        id: raw.id,
        restaurant_id: restaurantId,
        embedded_id: nullableText(raw.data.id),
        name: text(raw.data.name),
        description: text(raw.data.description),
        icon: normalizeImageUrl({ imageUrl: raw.data.icon }, rootDir),
        is_active: activeValue(raw.data),
        sort_order: explicitOrder(raw.data) ?? localOrder ?? null,
        document_checksum: checksum({ id: raw.id, data: raw.data }),
      });
    } catch (error) { rejections.push(rejection("categories", raw.id, error)); }
  }
  assignFallbackOrders(restaurants);
  assignFallbackOrders(categories);

  const categoriesByRestaurant = new Map();
  for (const category of categories) {
    if (!categoriesByRestaurant.has(category.restaurant_id)) categoriesByRestaurant.set(category.restaurant_id, []);
    categoriesByRestaurant.get(category.restaurant_id).push(category);
  }

  for (const raw of documents.menus.map(normalizeDocument)) {
    try {
      const restaurantId = text(raw.data.restaurantId ?? raw.data.restaurant_id);
      if (!raw.id || !restaurantId || !text(raw.data.name)) throw new Error("MENU_REQUIRED_FIELD_MISSING");
      if (!restaurantIds.has(restaurantId)) throw new Error("MENU_RESTAURANT_MISSING");
      const refs = Array.isArray(raw.data.categories) ? raw.data.categories.map(text).filter(Boolean) : [text(raw.data.categoryId ?? raw.data.category_id)].filter(Boolean);
      if (refs.length !== 1) throw new Error(refs.length ? "MENU_CATEGORY_AMBIGUOUS" : "MENU_CATEGORY_MISSING");
      const ref = refs[0];
      const candidates = (categoriesByRestaurant.get(restaurantId) || []).filter((category) =>
        category.id === ref || category.embedded_id === ref || slugify(category.name) === slugify(ref),
      );
      const unique = [...new Map(candidates.map((category) => [category.id, category])).values()];
      if (unique.length !== 1) throw new Error(unique.length ? "MENU_CATEGORY_AMBIGUOUS" : "MENU_CATEGORY_NOT_FOUND");
      const localOrder = localIndex.menus.get(`${restaurantId}\0${raw.id}`) ?? localIndex.menus.get(`${restaurantId}\0${text(raw.data.id)}`);
      menuItems.push({
        id: raw.id,
        restaurant_id: restaurantId,
        category_id: unique[0].id,
        name: text(raw.data.name),
        description: text(raw.data.description),
        image_url: normalizeImageUrl(raw.data, rootDir),
        price_kurus: toKurusExact(raw.data.price),
        is_active: activeValue(raw.data),
        sort_order: explicitOrder(raw.data) ?? localOrder ?? null,
        eta_minutes: optionalNonnegativeNumber(raw.data.etaMinutes, { integer: true, code: "ETA_INVALID" }),
        calories: optionalNonnegativeNumber(raw.data.calories, { integer: true, code: "CALORIES_INVALID" }),
        protein_grams: optionalNonnegativeNumber(raw.data.proteinGrams, { code: "PROTEIN_INVALID" }),
        customizations: normalizeCustomizations(raw.data.customizations),
        document_checksum: checksum({ id: raw.id, data: raw.data }),
      });
    } catch (error) { rejections.push(rejection("menus", raw.id, error)); }
  }
  assignFallbackOrders(menuItems);

  const cleanCategories = categories.map(({ embedded_id, ...row }) => row);
  const source = {
    restaurants: documents.restaurants.map(normalizeDocument).sort((a, b) => a.id.localeCompare(b.id)),
    categories: documents.categories.map(normalizeDocument).sort((a, b) => a.id.localeCompare(b.id)),
    menus: documents.menus.map(normalizeDocument).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const staged = { restaurants, categories: cleanCategories, menu_items: menuItems };
  return {
    sourceChecksum: checksum(source),
    stagedChecksum: checksum(staged),
    documentChecksums: Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, Object.fromEntries(rows.map((row) => [row.id, checksum(row)]))])),
    source,
    staged,
    rejections,
    counts: {
      source: { restaurants: source.restaurants.length, categories: source.categories.length, menu_items: source.menus.length },
      staged: { restaurants: restaurants.length, categories: cleanCategories.length, menu_items: menuItems.length },
      rejected: rejections.length,
      local: localIndex.counts,
    },
  };
};

const sqlLiteral = (value) => value == null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(canonicalJson(value))}::jsonb`;
const deterministicRunId = (sourceChecksum) => `${sourceChecksum.slice(0, 8)}-${sourceChecksum.slice(8, 12)}-5${sourceChecksum.slice(13, 16)}-a${sourceChecksum.slice(17, 20)}-${sourceChecksum.slice(20, 32)}`;

const buildImportSql = (result, sourceProject) => {
  const runId = deterministicRunId(result.sourceChecksum);
  const lines = [
    "do $catalog_import$",
    "begin",
    `insert into migration.import_runs (id, source_project, source_checksum, status, counts) values (${sqlLiteral(runId)}::uuid, ${sqlLiteral(sourceProject)}, ${sqlLiteral(result.sourceChecksum)}, 'pending', ${jsonLiteral({ ...result.counts, staged_checksum: result.stagedChecksum })}) on conflict (id) do update set source_checksum = excluded.source_checksum, status = 'pending', counts = excluded.counts, started_at = null, completed_at = null;`,
    `delete from migration.import_rejections where run_id = ${sqlLiteral(runId)}::uuid;`,
    `delete from migration.catalog_menu_items_stage where run_id = ${sqlLiteral(runId)}::uuid;`,
    `delete from migration.catalog_categories_stage where run_id = ${sqlLiteral(runId)}::uuid;`,
    `delete from migration.catalog_restaurants_stage where run_id = ${sqlLiteral(runId)}::uuid;`,
    `delete from migration.firestore_documents where run_id = ${sqlLiteral(runId)}::uuid;`,
  ];
  for (const [collectionPath, rows] of Object.entries(result.source)) {
    for (const row of rows) {
      lines.push(`insert into migration.firestore_documents (run_id, collection_path, document_id, payload, document_checksum) values (${sqlLiteral(runId)}::uuid, ${sqlLiteral(collectionPath)}, ${sqlLiteral(row.id)}, ${jsonLiteral(row.data)}, ${sqlLiteral(checksum(row))});`);
    }
  }
  const stageSpecs = [
    ["catalog_restaurants_stage", result.staged.restaurants],
    ["catalog_categories_stage", result.staged.categories],
    ["catalog_menu_items_stage", result.staged.menu_items],
  ];
  for (const [table, rows] of stageSpecs) {
    for (const row of rows) {
      const columns = ["run_id", ...Object.keys(row)];
      const values = [`${sqlLiteral(runId)}::uuid`, ...Object.values(row).map((value) =>
        value && typeof value === "object" ? jsonLiteral(value) : sqlLiteral(value),
      )];
      lines.push(`insert into migration.${table} (${columns.join(",")}) values (${values.join(",")});`);
    }
  }
  for (const item of result.rejections) {
    lines.push(`insert into migration.import_rejections (run_id, collection_path, document_id, reason_code) values (${sqlLiteral(runId)}::uuid, ${sqlLiteral(item.collectionPath)}, ${sqlLiteral(item.documentId)}, ${sqlLiteral(item.reasonCode)});`);
  }
  if (!result.rejections.length) lines.push(`perform migration.promote_catalog_import(${sqlLiteral(runId)}::uuid);`);
  else lines.push(`update migration.import_runs set status = 'failed', completed_at = statement_timestamp() where id = ${sqlLiteral(runId)}::uuid;`);
  lines.push("end", "$catalog_import$;");
  return { runId, sql: `${lines.join("\n")}\n` };
};

module.exports = {
  activeValue,
  IMAGE_ALIASES,
  buildImportSql,
  buildLocalCatalogIndex,
  canonicalJson,
  checksum,
  normalizeImageUrl,
  normalizeCustomizations,
  parseDeliveryTime,
  slugify,
  toKurusExact,
  transformCatalog,
};
