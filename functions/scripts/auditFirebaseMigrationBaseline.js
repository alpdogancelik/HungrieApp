const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const admin = require("firebase-admin");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SAFE_OUTPUT_DIR = path.join(ROOT_DIR, "secure");
const EXPECTED_PROJECT_ID = "hungrieapp-a2288";
const ACTIVE_ORDER_STATUSES = new Set(["pending", "preparing", "ready", "out_for_delivery"]);
const MONEY_FIELDS = ["subtotal", "deliveryFee", "serviceFee", "discount", "tip", "total"];

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArgValue = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return "";
};

const opts = {
  help: hasArg("--help") || hasArg("-h"),
  projectId: getArgValue("--project-id"),
  confirmProject: getArgValue("--confirm-project"),
  serviceAccount: getArgValue("--service-account"),
  output: getArgValue("--output") || "secure/firebase-migration-audit.json",
};

const printHelp = () => {
  console.log(`
Read-only Firebase migration inventory and baseline audit.

Usage:
  npm run audit:migration-baseline -- \\
    --project-id=${EXPECTED_PROJECT_ID} \\
    --confirm-project=${EXPECTED_PROJECT_ID} \\
    --service-account=/absolute/path/to/read-only-service-account.json \\
    --output=secure/firebase-migration-audit.json

Safety guarantees:
  - The expected and confirmed Firebase project IDs must match.
  - A service-account file is mandatory; ambient credentials are not used.
  - Output must be inside the repository's ignored secure/ directory.
  - Only aggregate counts, type shapes, and anomaly totals are emitted.
  - The program contains no database or authentication mutation operations.
`);
};

const assertArguments = () => {
  if (!opts.projectId) throw new Error("--project-id is required.");
  if (!opts.confirmProject) throw new Error("--confirm-project is required.");
  if (opts.projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Unexpected Firebase project. Expected ${EXPECTED_PROJECT_ID}.`);
  }
  if (opts.confirmProject !== opts.projectId) {
    throw new Error("Project confirmation does not match --project-id.");
  }
  if (!opts.serviceAccount) {
    throw new Error("--service-account is required; ambient credentials are intentionally disabled.");
  }

  const serviceAccountPath = path.resolve(opts.serviceAccount);
  if (!fs.existsSync(serviceAccountPath)) throw new Error("Service-account file does not exist.");

  const outputPath = path.resolve(ROOT_DIR, opts.output);
  const relativeOutput = path.relative(SAFE_OUTPUT_DIR, outputPath);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("--output must resolve to a file below the repository secure/ directory.");
  }

  return { serviceAccountPath, outputPath };
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const asNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const toKurus = (value) => {
  const numeric = asNumber(value);
  return numeric === null ? null : Math.round(numeric * 100);
};
const addCount = (record, key, amount = 1) => {
  const normalized = String(key || "unknown");
  record[normalized] = (record[normalized] || 0) + amount;
};

const normalizeStatus = (value) => {
  const raw = String(value || "missing").trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    accepted: "preparing",
    rejected: "canceled",
    cancelled: "canceled",
    "teslim_edildi": "delivered",
  };
  return aliases[raw] || raw;
};

const firestoreType = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof admin.firestore.Timestamp) return "timestamp";
  if (value instanceof admin.firestore.GeoPoint) return "geopoint";
  if (value instanceof admin.firestore.DocumentReference) return "reference";
  if (Buffer.isBuffer(value)) return "bytes";
  if (value instanceof Date) return "date";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  return typeof value === "object" ? "map" : typeof value;
};

const collectFieldShapes = (value, fieldPath, fields, seenInDocument) => {
  const type = firestoreType(value);
  if (!fields[fieldPath]) fields[fieldPath] = { present: 0, types: {} };
  if (!seenInDocument.has(fieldPath)) {
    fields[fieldPath].present += 1;
    seenInDocument.add(fieldPath);
  }
  addCount(fields[fieldPath].types, type);

  if (type === "map") {
    for (const [key, nested] of Object.entries(value)) {
      collectFieldShapes(nested, `${fieldPath}.${key}`, fields, seenInDocument);
    }
  } else if (type === "array") {
    if (!value.length) addCount(fields[fieldPath].types, "empty-array");
    for (const item of value) collectFieldShapes(item, `${fieldPath}[]`, fields, seenInDocument);
  }
};

const collectionPattern = (collectionPath) => {
  const segments = collectionPath.split("/");
  return segments.map((segment, index) => (index % 2 === 1 ? "{document}" : segment)).join("/");
};

const classifyField = (collectionName, field) => {
  const value = `${collectionName}.${field}`.toLowerCase();
  const classes = new Set();
  if (collectionName === "users" || collectionName === "restaurantStaff") classes.add("personal");
  if (collectionName.includes("/addresses")) classes.add("sensitive personal");
  if (collectionName.includes("/pushTokens")) classes.add("credential/token");
  if (/(token|password|secret|credential)/.test(value)) classes.add("credential/token");
  if (/(address|phone|whatsapp|\.room|\.block)/.test(value)) classes.add("sensitive personal");
  if (/(email|avatar|userid|accountid|firebase_uid|panelaccountuid|customer|owner|manager|courier)/.test(value)) {
    classes.add("personal");
  }
  if (/(price|subtotal|total|fee|discount|tip|cost|amount)/.test(value)) classes.add("financial");
  if (/(status|role|staff|member|reminder|internal|isactive|visible|enabled|moderation)/.test(value)) {
    classes.add("internal");
  }
  if (/^(restaurants|categories|menus|reviews|orderReviews)(\.|$)/.test(`${collectionName}.${field}`)) {
    if (!classes.has("credential/token") && !classes.has("sensitive personal") && !classes.has("personal")) {
      classes.add("public");
    }
  }
  if (!classes.size) classes.add("internal");
  return [...classes].sort();
};

const createCollectionSummary = () => ({ documents: 0, fields: {} });
const recordDocumentShape = (summary, data) => {
  summary.documents += 1;
  const seenInDocument = new Set();
  for (const [key, value] of Object.entries(data || {})) {
    collectFieldShapes(value, key, summary.fields, seenInDocument);
  }
};

const finalizeSchema = (collections) =>
  Object.fromEntries(
    Object.entries(collections)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, summary]) => [
        name,
        {
          documents: summary.documents,
          fields: Object.fromEntries(
            Object.entries(summary.fields)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([field, stats]) => [
                field,
                {
                  present: stats.present,
                  presencePercent: summary.documents ? round((stats.present / summary.documents) * 100, 1) : 0,
                  optional: stats.present !== summary.documents,
                  observedTypes: stats.types,
                  classifications: classifyField(name, field),
                },
              ]),
          ),
        },
      ]),
  );

const createBaseline = () => ({
  documentsByCollection: {},
  auth: {
    users: 0,
    emailVerified: 0,
    disabled: 0,
    providers: {},
    liveConfiguration: { status: "pending" },
  },
  users: { withFavorites: 0, favoriteReferences: 0, withDefaultAddressSnapshot: 0 },
  addresses: { total: 0, default: 0, ownersWithMultipleDefaults: 0 },
  restaurants: { total: 0, active: 0, missingOwnerId: 0, ownerUserMissing: 0, managerReferences: 0 },
  restaurantStaff: { total: 0, missingRestaurantId: 0, restaurantMissing: 0 },
  catalog: {
    restaurants: 0,
    categories: 0,
    menus: 0,
    categoriesMissingRestaurant: 0,
    menusMissingRestaurant: 0,
  },
  orders: {
    total: 0,
    active: 0,
    byStatus: {},
    missingUser: 0,
    missingRestaurant: 0,
    invalidMoneyValues: 0,
    inconsistentFinancialEquation: 0,
    financialTotalsKurus: Object.fromEntries(MONEY_FIELDS.map((field) => [field, 0])),
  },
  reviews: {
    productTotal: 0,
    orderTotal: 0,
    productByStatus: {},
    orderByStatus: {},
    productRating: { count: 0, sum: 0, average: 0 },
    orderRating: { count: 0, sum: 0, average: 0 },
    duplicateProductReviewKeys: 0,
    duplicateOrderReviewKeys: 0,
    missingRelations: { product: 0, order: 0 },
  },
  pushTokens: { total: 0, byOwnerScope: {}, byProvider: {}, byPlatform: {} },
  deployedConfiguration: {
    auth: { status: "pending" },
    firestoreRules: { status: "pending" },
    firestoreIndexes: { status: "pending" },
    cloudFunctions: { status: "pending" },
  },
});

const scanFirestore = async (db) => {
  const collections = {};
  const records = {};

  const visitCollection = async (collectionRef) => {
    const pattern = collectionPattern(collectionRef.path);
    if (!collections[pattern]) collections[pattern] = createCollectionSummary();
    if (!records[pattern]) records[pattern] = [];

    const snapshot = await collectionRef.get();
    for (const document of snapshot.docs) {
      const data = document.data() || {};
      recordDocumentShape(collections[pattern], data);
      records[pattern].push({ id: document.id, parentId: document.ref.parent.parent?.id || null, data });
      const children = await document.ref.listCollections();
      for (const child of children) await visitCollection(child);
    }
  };

  const roots = await db.listCollections();
  for (const root of roots) await visitCollection(root);
  return { collections, records };
};

const recordPushTokens = (baseline, entries, scope) => {
  for (const entry of entries || []) {
    baseline.pushTokens.total += 1;
    addCount(baseline.pushTokens.byOwnerScope, scope);
    addCount(baseline.pushTokens.byProvider, String(entry.data.provider || "unknown").toLowerCase());
    addCount(baseline.pushTokens.byPlatform, String(entry.data.platform || "unknown").toLowerCase());
  }
};

const buildFirestoreBaseline = (records) => {
  const baseline = createBaseline();
  for (const [pattern, entries] of Object.entries(records)) baseline.documentsByCollection[pattern] = entries.length;

  const users = records.users || [];
  const restaurants = records.restaurants || [];
  const staff = records.restaurantStaff || [];
  const categories = records.categories || [];
  const menus = records.menus || [];
  const orders = records.orders || [];
  const productReviews = records.reviews || [];
  const orderReviews = records.orderReviews || [];
  const addresses = records["users/{document}/addresses"] || [];
  const userTokens = records["users/{document}/pushTokens"] || [];
  const restaurantTokens = records["restaurants/{document}/pushTokens"] || [];

  const userIds = new Set(users.map((entry) => entry.id));
  const restaurantIds = new Set(restaurants.map((entry) => entry.id));
  const orderIds = new Set(orders.map((entry) => entry.id));
  const menuIds = new Set(menus.map((entry) => entry.id));

  baseline.users.withFavorites = users.filter((entry) => Array.isArray(entry.data.favoriteIds) && entry.data.favoriteIds.length).length;
  baseline.users.favoriteReferences = users.reduce((sum, entry) => sum + (Array.isArray(entry.data.favoriteIds) ? entry.data.favoriteIds.length : 0), 0);
  baseline.users.withDefaultAddressSnapshot = users.filter((entry) => entry.data.defaultAddress).length;

  baseline.addresses.total = addresses.length;
  baseline.addresses.default = addresses.filter((entry) => entry.data.isDefault === true).length;
  const defaultsByOwner = {};
  for (const entry of addresses.filter((item) => item.data.isDefault === true)) addCount(defaultsByOwner, entry.parentId);
  baseline.addresses.ownersWithMultipleDefaults = Object.values(defaultsByOwner).filter((count) => count > 1).length;

  baseline.restaurants.total = restaurants.length;
  baseline.restaurants.active = restaurants.filter((entry) => entry.data.isActive !== false).length;
  baseline.restaurants.missingOwnerId = restaurants.filter((entry) => !entry.data.ownerId).length;
  baseline.restaurants.ownerUserMissing = restaurants.filter((entry) => entry.data.ownerId && !userIds.has(String(entry.data.ownerId))).length;
  baseline.restaurants.managerReferences = restaurants.reduce(
    (sum, entry) => sum + (Array.isArray(entry.data.managerEmails) ? entry.data.managerEmails.length : 0),
    0,
  );

  baseline.restaurantStaff.total = staff.length;
  baseline.restaurantStaff.missingRestaurantId = staff.filter((entry) => !entry.data.restaurantId).length;
  baseline.restaurantStaff.restaurantMissing = staff.filter(
    (entry) => entry.data.restaurantId && !restaurantIds.has(String(entry.data.restaurantId)),
  ).length;

  baseline.catalog.restaurants = restaurants.length;
  baseline.catalog.categories = categories.length;
  baseline.catalog.menus = menus.length;
  baseline.catalog.categoriesMissingRestaurant = categories.filter(
    (entry) => !entry.data.restaurantId || !restaurantIds.has(String(entry.data.restaurantId)),
  ).length;
  baseline.catalog.menusMissingRestaurant = menus.filter(
    (entry) => !entry.data.restaurantId || !restaurantIds.has(String(entry.data.restaurantId)),
  ).length;

  for (const entry of orders) {
    const order = entry.data;
    baseline.orders.total += 1;
    const status = normalizeStatus(order.status);
    addCount(baseline.orders.byStatus, status);
    if (ACTIVE_ORDER_STATUSES.has(status)) baseline.orders.active += 1;
    if (!order.userId || !userIds.has(String(order.userId))) baseline.orders.missingUser += 1;
    if (!order.restaurantId || !restaurantIds.has(String(order.restaurantId))) baseline.orders.missingRestaurant += 1;

    const money = {};
    for (const field of MONEY_FIELDS) {
      const value = toKurus(order[field] ?? 0);
      if (value === null) baseline.orders.invalidMoneyValues += 1;
      else {
        money[field] = value;
        baseline.orders.financialTotalsKurus[field] += value;
      }
    }
    if (MONEY_FIELDS.every((field) => money[field] !== undefined)) {
      const expected = money.subtotal + money.deliveryFee + money.serviceFee + money.tip - money.discount;
      if (expected !== money.total) baseline.orders.inconsistentFinancialEquation += 1;
    }
  }

  const seenProductKeys = new Set();
  for (const entry of productReviews) {
    const review = entry.data;
    baseline.reviews.productTotal += 1;
    addCount(baseline.reviews.productByStatus, review.status || "published");
    const rating = asNumber(review.rating);
    if (rating !== null) {
      baseline.reviews.productRating.count += 1;
      baseline.reviews.productRating.sum += rating;
    }
    const key = String(review.reviewKey || `${review.orderId || ""}::${review.menuItemId || review.itemId || ""}::${review.userId || ""}`);
    if (seenProductKeys.has(key)) baseline.reviews.duplicateProductReviewKeys += 1;
    seenProductKeys.add(key);
    if (
      !review.orderId || !orderIds.has(String(review.orderId)) ||
      !review.restaurantId || !restaurantIds.has(String(review.restaurantId)) ||
      !(review.menuItemId || review.itemId) || !menuIds.has(String(review.menuItemId || review.itemId))
    ) baseline.reviews.missingRelations.product += 1;
  }

  const seenOrderKeys = new Set();
  for (const entry of orderReviews) {
    const review = entry.data;
    baseline.reviews.orderTotal += 1;
    addCount(baseline.reviews.orderByStatus, review.status || "published");
    const rating = asNumber(review.averageRating);
    if (rating !== null) {
      baseline.reviews.orderRating.count += 1;
      baseline.reviews.orderRating.sum += rating;
    }
    const key = String(review.reviewKey || `${review.orderId || ""}::${review.userId || ""}`);
    if (seenOrderKeys.has(key)) baseline.reviews.duplicateOrderReviewKeys += 1;
    seenOrderKeys.add(key);
    if (!review.orderId || !orderIds.has(String(review.orderId)) || !review.restaurantId || !restaurantIds.has(String(review.restaurantId))) {
      baseline.reviews.missingRelations.order += 1;
    }
  }

  baseline.reviews.productRating.average = baseline.reviews.productRating.count
    ? round(baseline.reviews.productRating.sum / baseline.reviews.productRating.count)
    : 0;
  baseline.reviews.orderRating.average = baseline.reviews.orderRating.count
    ? round(baseline.reviews.orderRating.sum / baseline.reviews.orderRating.count)
    : 0;

  recordPushTokens(baseline, userTokens, "user");
  recordPushTokens(baseline, restaurantTokens, "restaurant");
  return baseline;
};

const auditAuthUsers = async (auth, baseline) => {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      baseline.auth.users += 1;
      if (user.emailVerified) baseline.auth.emailVerified += 1;
      if (user.disabled) baseline.auth.disabled += 1;
      if (!user.providerData.length) addCount(baseline.auth.providers, "password-or-unlinked");
      for (const provider of user.providerData) addCount(baseline.auth.providers, provider.providerId);
    }
    pageToken = page.pageToken;
  } while (pageToken);
};

const fetchGoogleJson = async (credential, url) => {
  const access = await credential.getAccessToken();
  const response = await fetch(url, { headers: { authorization: `Bearer ${access.access_token}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const auditFirestoreRules = async (credential, projectId, localSha256) => {
  try {
    const release = await fetchGoogleJson(
      credential,
      `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/releases/cloud.firestore`,
    );
    if (!release.rulesetName) throw new Error("Active Firestore ruleset name is missing.");
    const ruleset = await fetchGoogleJson(
      credential,
      `https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
    );
    const files = ruleset.source?.files || [];
    const hashes = files.map((file) => sha256(String(file.content || "")));
    return {
      status: "available",
      sourceFileCount: files.length,
      localSha256,
      deployedMatchesLocal: hashes.includes(localSha256),
    };
  } catch (error) {
    return { status: "unavailable", reason: String(error.message || error), localSha256 };
  }
};

const auditAuthConfiguration = async (credential, auth, projectId) => {
  try {
    const [config, supportedIdps, oidc, saml] = await Promise.all([
      fetchGoogleJson(
        credential,
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`,
      ),
      fetchGoogleJson(
        credential,
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/defaultSupportedIdpConfigs`,
      ).catch(() => ({ defaultSupportedIdpConfigs: [] })),
      auth.listProviderConfigs({ type: "oidc", maxResults: 100 }).catch(() => ({ providerConfigs: [] })),
      auth.listProviderConfigs({ type: "saml", maxResults: 100 }).catch(() => ({ providerConfigs: [] })),
    ]);
    return {
      status: "available",
      email: {
        enabled: Boolean(config.signIn?.email?.enabled),
        passwordRequired: Boolean(config.signIn?.email?.passwordRequired),
      },
      phoneEnabled: Boolean(config.signIn?.phoneNumber?.enabled),
      anonymousEnabled: Boolean(config.signIn?.anonymous?.enabled),
      enabledOAuthProviderIds: (supportedIdps.defaultSupportedIdpConfigs || [])
        .filter((provider) => provider.enabled)
        .map((provider) => provider.idpId || String(provider.name || "").split("/").pop())
        .filter(Boolean)
        .sort(),
      enabledOidcProviderCount: (oidc.providerConfigs || []).filter((provider) => provider.enabled).length,
      enabledSamlProviderCount: (saml.providerConfigs || []).filter((provider) => provider.enabled).length,
    };
  } catch (error) {
    return { status: "unavailable", reason: String(error.message || error) };
  }
};

const loadLocalEvidence = () => {
  const rulesPath = path.join(ROOT_DIR, "mobile", "firestore.rules");
  const indexesPath = path.join(ROOT_DIR, "mobile", "firestore.indexes.json");
  const functionsPath = path.join(ROOT_DIR, "functions", "index.js");
  const read = (filePath) => fs.readFileSync(filePath, "utf8");
  const functionsSource = read(functionsPath);
  const exportedFunctions = [...functionsSource.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]).sort();

  const dataDirectory = path.join(ROOT_DIR, "mobile", "data");
  const seedFiles = fs.readdirSync(dataDirectory).filter((name) => name.endsWith("-firestore.json")).sort();
  const seedTotals = { files: seedFiles.length, restaurants: 0, categories: 0, menus: 0 };
  for (const name of seedFiles) {
    const parsed = JSON.parse(read(path.join(dataDirectory, name)));
    seedTotals.restaurants += Array.isArray(parsed.restaurants) ? parsed.restaurants.length : 0;
    seedTotals.categories += Array.isArray(parsed.categories) ? parsed.categories.length : 0;
    seedTotals.menus += Array.isArray(parsed.menus) ? parsed.menus.length : 0;
  }

  return {
    firestoreRules: { path: "mobile/firestore.rules", sha256: sha256(read(rulesPath)) },
    firestoreIndexes: { path: "mobile/firestore.indexes.json", sha256: sha256(read(indexesPath)) },
    cloudFunctions: { path: "functions/index.js", exportedFunctions },
    localCatalogSeeds: seedTotals,
  };
};

async function main() {
  if (opts.help) {
    printHelp();
    return;
  }
  const { serviceAccountPath, outputPath } = assertArguments();
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  if (serviceAccount.project_id && serviceAccount.project_id !== opts.projectId) {
    throw new Error("Service-account project does not match the confirmed project.");
  }

  const credential = admin.credential.cert(serviceAccount);
  const app = admin.initializeApp({ credential, projectId: opts.projectId });
  const { collections, records } = await scanFirestore(app.firestore());
  const baseline = buildFirestoreBaseline(records);
  await auditAuthUsers(app.auth(), baseline);
  baseline.auth.liveConfiguration = await auditAuthConfiguration(credential, app.auth(), opts.projectId);
  baseline.deployedConfiguration.auth = baseline.auth.liveConfiguration;

  const evidence = loadLocalEvidence();
  baseline.deployedConfiguration.firestoreRules = await auditFirestoreRules(
    credential,
    opts.projectId,
    evidence.firestoreRules.sha256,
  );
  baseline.deployedConfiguration.firestoreIndexes = {
    status: "local-recorded-live-verification-required",
    sha256: evidence.firestoreIndexes.sha256,
  };
  baseline.deployedConfiguration.cloudFunctions = {
    status: "local-recorded-live-verification-required",
    exportedCount: evidence.cloudFunctions.exportedFunctions.length,
  };

  const payload = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    projectId: opts.projectId,
    readOnly: true,
    privacy: "Aggregate counts and field shapes only; no document values or identifiers are included.",
    inventory: { schema: finalizeSchema(collections), localEvidence: evidence },
    baseline,
  };
  payload.inventorySha256 = sha256(JSON.stringify(payload.inventory));
  payload.baselineSha256 = sha256(JSON.stringify(payload.baseline));
  payload.reportSha256 = sha256(JSON.stringify(payload));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Read-only audit completed for ${opts.projectId}.`);
  console.log(`Sanitized report: ${path.relative(ROOT_DIR, outputPath)}`);
  console.log(`Report SHA-256: ${payload.reportSha256}`);
  console.log(`Collections discovered: ${Object.keys(payload.inventory.schema).length}`);
  console.log(`Firestore documents scanned: ${Object.values(baseline.documentsByCollection).reduce((sum, count) => sum + count, 0)}`);
  console.log(`Auth users counted: ${baseline.auth.users}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Audit failed: ${String(error.message || error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildFirestoreBaseline,
  classifyField,
  collectionPattern,
  createCollectionSummary,
  finalizeSchema,
  normalizeStatus,
  recordDocumentShape,
  toKurus,
};
