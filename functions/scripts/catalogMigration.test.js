const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  activeValue,
  IMAGE_ALIASES,
  buildImportSql,
  canonicalJson,
  checksum,
  normalizeImageUrl,
  normalizeCustomizations,
  parseDeliveryTime,
  toKurusExact,
  transformCatalog,
} = require("./catalogMigration");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

const localAsFirestore = () => {
  const documents = { restaurants: [], categories: [], menus: [] };
  const files = fs.readdirSync(path.join(ROOT_DIR, "mobile", "data"))
    .filter((name) => name.endsWith("-firestore.json"))
    .sort();
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "mobile", "data", file), "utf8"));
    const restaurant = payload.restaurants[0];
    documents.restaurants.push({ id: restaurant.id, data: { ...restaurant } });
    documents.categories.push(...payload.categories.map((category) => ({
      id: `${restaurant.id}_${category.id}`,
      data: { ...category, restaurantId: restaurant.id },
    })));
    documents.menus.push(...payload.menus.map((item) => ({
      id: `${restaurant.id}_${item.id}`,
      data: { ...item },
    })));
  }
  return documents;
};

test("canonical JSON and checksums ignore object key insertion order", () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
  assert.equal(checksum({ a: 1, b: 2 }), checksum({ b: 2, a: 1 }));
});

test("TRY values convert exactly to integer kurus and reject unsafe values", () => {
  assert.equal(toKurusExact(24.9), 2490);
  assert.equal(toKurusExact("470.05"), 47005);
  assert.throws(() => toKurusExact("1.001"), /MONEY_INVALID_PRECISION/);
  assert.throws(() => toKurusExact(-1), /MONEY_NEGATIVE/);
  assert.throws(() => toKurusExact("free"), /MONEY_INVALID_PRECISION/);
});

test("delivery ranges and active aliases normalize deterministically", () => {
  assert.deepEqual(parseDeliveryTime("25-35 min"), { min: 25, max: 35 });
  assert.deepEqual(parseDeliveryTime(30), { min: 30, max: 30 });
  assert.throws(() => parseDeliveryTime("35-20"), /DELIVERY_TIME_INVALID/);
  assert.equal(activeValue({}), true);
  assert.equal(activeValue({ visible: false }), false);
  assert.equal(activeValue({ isActive: false }), false);
});

test("image validation preserves valid HTTPS and repository asset references", () => {
  assert.equal(normalizeImageUrl({ imageUrl: "https://example.invalid/image.png" }, ROOT_DIR), "https://example.invalid/image.png");
  assert.equal(normalizeImageUrl({ imageUrl: "@/assets/restaurantlogo/adapizzalogo.jpg" }, ROOT_DIR), "@/assets/restaurantlogo/adapizzalogo.jpg");
  assert.equal(normalizeImageUrl({ imageUrl: "@/assets/images/durum.png" }, ROOT_DIR), "@/assets/Categories/Durum1.png");
  assert.equal(normalizeImageUrl({ imageUrl: "@/assets/images/fastfood.png" }, ROOT_DIR), "@/assets/Categories/Burger1.png");
  assert.ok(Object.values(IMAGE_ALIASES).every((alias) => fs.existsSync(path.join(ROOT_DIR, "mobile", alias.slice(2)))));
  assert.throws(() => normalizeImageUrl({ imageUrl: "http://example.invalid/image.png" }, ROOT_DIR), /IMAGE_REFERENCE_INVALID/);
  assert.throws(() => normalizeImageUrl({ imageUrl: "@/assets/does-not-exist.png" }, ROOT_DIR), /IMAGE_ASSET_MISSING/);
});

test("customization prices are normalized to trusted integer kurus", () => {
  assert.deepEqual(normalizeCustomizations([{ id: "cheese", name: "Cheese", price: "2.50" }]), [
    { id: "cheese", name: "Cheese", price_kurus: 250 },
  ]);
  assert.throws(() => normalizeCustomizations([{ id: "bad", name: "Bad", price: "1.001" }]), /MONEY_INVALID_PRECISION/);
});

test("all nine local catalogs reconcile through Firestore-shaped transforms", () => {
  const documents = localAsFirestore();
  const result = transformCatalog({ documents, rootDir: ROOT_DIR });
  assert.deepEqual(result.counts.source, { restaurants: 9, categories: 94, menu_items: 822 });
  assert.deepEqual(result.counts.staged, { restaurants: 9, categories: 94, menu_items: 822 });
  assert.equal(result.rejections.length, 0);
  assert.equal(result.staged.restaurants.some((row) => Object.hasOwn(row, "ownerId")), false);
  assert.ok(result.staged.menu_items.every((item) => item.category_id && Number.isInteger(item.price_kurus)));
  assert.ok(result.staged.categories.every((category) => Number.isInteger(category.sort_order)));
});

test("category ambiguity and invalid money are rejected and block promotion SQL", () => {
  const documents = {
    restaurants: [{ id: "r1", data: { name: "R1", deliveryFee: 0 } }],
    categories: [
      { id: "c1", data: { restaurantId: "r1", id: "same", name: "First" } },
      { id: "c2", data: { restaurantId: "r1", id: "same", name: "Second" } },
    ],
    menus: [
      { id: "m1", data: { restaurantId: "r1", name: "Bad category", categories: ["same"], price: 1 } },
      { id: "m2", data: { restaurantId: "r1", name: "Bad price", categories: ["c1"], price: "1.999" } },
    ],
  };
  const emptyIndex = { restaurants: new Map(), categories: new Map(), menus: new Map(), counts: { restaurants: 0, categories: 0, menus: 0 } };
  const result = transformCatalog({ documents, rootDir: ROOT_DIR, localIndex: emptyIndex });
  assert.deepEqual(result.rejections.map((item) => item.reasonCode).sort(), ["MENU_CATEGORY_AMBIGUOUS", "MONEY_INVALID_PRECISION"]);
  const generated = buildImportSql(result, "hungrieapp-a2288");
  assert.doesNotMatch(generated.sql, /perform migration\.promote_catalog_import/);
  assert.match(generated.sql, /status = 'failed'/);
});

test("same complete export creates byte-identical staged checksum and import SQL", () => {
  const documents = localAsFirestore();
  const first = transformCatalog({ documents, rootDir: ROOT_DIR });
  const second = transformCatalog({ documents: JSON.parse(JSON.stringify(documents)), rootDir: ROOT_DIR });
  assert.equal(first.sourceChecksum, second.sourceChecksum);
  assert.equal(first.stagedChecksum, second.stagedChecksum);
  assert.equal(buildImportSql(first, "hungrieapp-a2288").sql, buildImportSql(second, "hungrieapp-a2288").sql);
});
