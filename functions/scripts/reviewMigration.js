const crypto = require("node:crypto");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const checksum = (value) => sha256(canonicalJson(value));
const text = (value) => value == null ? "" : String(value).trim();
const nullableText = (value) => text(value) || null;
const rejection = (collectionPath, documentId, reasonCode) => ({ collectionPath, documentId, reasonCode });

const normalizedTimestamp = (value) => {
  if (!value) throw new Error("TIMESTAMP_MISSING");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("TIMESTAMP_INVALID");
  return date.toISOString();
};

const normalizedRating = (value) => {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("RATING_INVALID");
  return rating;
};

const normalizedLimitedText = (value, code) => {
  const result = text(value);
  if (result.length > 500) throw new Error(code);
  return result;
};

const resolveMenuItemId = (data) => {
  const itemId = text(data.itemId);
  const menuItemId = text(data.menuItemId);
  if (itemId && menuItemId && itemId !== menuItemId) throw new Error("MENU_ITEM_ID_CONFLICT");
  const result = itemId || menuItemId;
  if (!result) throw new Error("MENU_ITEM_ID_MISSING");
  return result;
};

const normalizeStatus = (value) => text(value).toLowerCase() === "hidden" ? "hidden" : "published";
const document = (entry) => ({ id: text(entry.id), data: entry.data || {} });

const normalizeProductReview = (entry) => {
  const { id, data } = document(entry);
  if (!id) throw new Error("REVIEW_ID_MISSING");
  const orderId = text(data.orderId);
  const restaurantId = text(data.restaurantId);
  const sourceUserId = text(data.userId);
  if (!orderId) throw new Error("ORDER_ID_MISSING");
  if (!restaurantId) throw new Error("RESTAURANT_ID_MISSING");
  if (!sourceUserId) throw new Error("USER_ID_MISSING");
  const userName = text(data.userName);
  const menuItemName = text(data.itemName || data.menuItemName);
  if (!userName) throw new Error("USER_SNAPSHOT_MISSING");
  if (!menuItemName) throw new Error("MENU_ITEM_SNAPSHOT_MISSING");
  const createdAt = normalizedTimestamp(data.createdAt);
  return {
    id,
    review_key: text(data.reviewKey || data.id || id),
    order_id: orderId,
    restaurant_id: restaurantId,
    menu_item_id: resolveMenuItemId(data),
    source_user_id: sourceUserId,
    user_name_snapshot: userName,
    menu_item_name_snapshot: menuItemName,
    rating: normalizedRating(data.rating),
    comment: normalizedLimitedText(data.comment, "COMMENT_TOO_LONG"),
    status: normalizeStatus(data.status),
    reply: nullableText(normalizedLimitedText(data.reply, "REPLY_TOO_LONG")),
    replied_at: data.replyAt ? normalizedTimestamp(data.replyAt) : null,
    created_at: createdAt,
    updated_at: data.updatedAt ? normalizedTimestamp(data.updatedAt) : createdAt,
    document_checksum: checksum({ id, data }),
  };
};

const normalizeOrderReview = (entry) => {
  const { id, data } = document(entry);
  if (!id) throw new Error("REVIEW_ID_MISSING");
  const orderId = text(data.orderId);
  const restaurantId = text(data.restaurantId);
  const sourceUserId = text(data.userId);
  if (!orderId) throw new Error("ORDER_ID_MISSING");
  if (!restaurantId) throw new Error("RESTAURANT_ID_MISSING");
  if (!sourceUserId) throw new Error("USER_ID_MISSING");
  const ratings = data.ratings && typeof data.ratings === "object" ? data.ratings : {};
  const legacy = data.rating;
  const speed = normalizedRating(ratings.speed ?? ratings.deliverySpeed ?? legacy);
  const taste = normalizedRating(ratings.taste ?? legacy);
  const value = normalizedRating(ratings.value ?? ratings.pricePerformance ?? legacy);
  const pricePerformance = normalizedRating(ratings.pricePerformance ?? ratings.value ?? legacy);
  const userName = text(data.userName);
  const restaurantName = text(data.restaurantName);
  if (!userName) throw new Error("USER_SNAPSHOT_MISSING");
  if (!restaurantName) throw new Error("RESTAURANT_SNAPSHOT_MISSING");
  if (data.reply != null && text(data.reply)) throw new Error("ORDER_REVIEW_REPLY_NOT_ALLOWED");
  const items = data.itemsSnapshot == null ? [] : data.itemsSnapshot;
  if (!Array.isArray(items)) throw new Error("ITEMS_SNAPSHOT_INVALID");
  const createdAt = normalizedTimestamp(data.createdAt);
  return {
    id,
    review_key: text(data.reviewKey || data.id || id),
    order_id: orderId,
    restaurant_id: restaurantId,
    source_user_id: sourceUserId,
    user_name_snapshot: userName,
    restaurant_name_snapshot: restaurantName,
    speed_rating: speed,
    taste_rating: taste,
    value_rating: value,
    price_performance_rating: pricePerformance,
    comment: normalizedLimitedText(data.comment, "COMMENT_TOO_LONG"),
    items_snapshot: canonicalize(items),
    status: normalizeStatus(data.status),
    created_at: createdAt,
    updated_at: data.updatedAt ? normalizedTimestamp(data.updatedAt) : createdAt,
    document_checksum: checksum({ id, data }),
  };
};

const relationshipReasonCodes = ({ review, profileIds = new Set(), orders = new Map(), restaurantIds = new Set(), menuItems = new Map(), orderItems = new Set(), orderReview = false }) => {
  const codes = [];
  const profileId = profileIds.has(review.source_user_id) ? review.source_user_id : null;
  const order = orders.get(review.order_id);
  if (!profileId) codes.push("PROFILE_NOT_IMPORTED");
  if (!order) codes.push("ORDER_NOT_IMPORTED");
  if (!restaurantIds.has(review.restaurant_id)) codes.push("RESTAURANT_NOT_IMPORTED");
  if (!orderReview) {
    const menu = menuItems.get(review.menu_item_id);
    if (!menu) codes.push("MENU_ITEM_NOT_IMPORTED");
    else if (menu.restaurant_id !== review.restaurant_id) codes.push("MENU_RESTAURANT_MISMATCH");
    if (!orderItems.has(`${review.order_id}\0${review.menu_item_id}`)) codes.push("ORDER_ITEM_NOT_FOUND");
  }
  if (order) {
    if (order.status !== "delivered") codes.push("ORDER_NOT_DELIVERED");
    if (profileId && (order.profile_id !== profileId || order.restaurant_id !== review.restaurant_id)) codes.push("ORDER_RELATIONSHIP_MISMATCH");
  }
  return [...new Set(codes)].sort();
};

const transformReviews = ({ documents }) => {
  const rejections = [];
  const productReviews = [];
  const orderReviews = [];
  for (const entry of documents.reviews || []) {
    try { productReviews.push(normalizeProductReview(entry)); }
    catch (error) { rejections.push(rejection("reviews", text(entry.id), error instanceof Error ? error.message : "TRANSFORM_FAILED")); }
  }
  for (const entry of documents.orderReviews || []) {
    try { orderReviews.push(normalizeOrderReview(entry)); }
    catch (error) { rejections.push(rejection("orderReviews", text(entry.id), error instanceof Error ? error.message : "TRANSFORM_FAILED")); }
  }
  const byId = (a, b) => a.id.localeCompare(b.id);
  productReviews.sort(byId); orderReviews.sort(byId);
  const source = {
    reviews: (documents.reviews || []).map(document).sort(byId),
    orderReviews: (documents.orderReviews || []).map(document).sort(byId),
    relationshipEvidence: canonicalize(documents.relationshipEvidence || {}),
  };
  const staged = { product_reviews: productReviews, order_reviews: orderReviews };
  return {
    source: canonicalize(source), staged, rejections,
    sourceChecksum: checksum(source), stagedChecksum: checksum(staged),
    documentChecksums: {
      reviews: Object.fromEntries(source.reviews.map((row) => [row.id, checksum(row)])),
      orderReviews: Object.fromEntries(source.orderReviews.map((row) => [row.id, checksum(row)])),
    },
    counts: {
      source: { product_reviews: source.reviews.length, order_reviews: source.orderReviews.length },
      staged: { product_reviews: productReviews.length, order_reviews: orderReviews.length },
      rejected: rejections.length,
    },
  };
};

const sqlLiteral = (value) => value == null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(canonicalJson(value))}::jsonb`;
const deterministicRunId = (sourceChecksum) => `${sourceChecksum.slice(0, 8)}-${sourceChecksum.slice(8, 12)}-7${sourceChecksum.slice(13, 16)}-a${sourceChecksum.slice(17, 20)}-${sourceChecksum.slice(20, 32)}`;
const buildReviewImportSql = (result, sourceProject) => {
  const runId = deterministicRunId(result.sourceChecksum);
  const lines = ["do $review_import$", "begin",
    `insert into migration.import_runs(id,source_project,source_checksum,status,counts) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(sourceProject)},${sqlLiteral(result.sourceChecksum)},'pending',${jsonLiteral({ ...result.counts, staged_checksum: result.stagedChecksum })}) on conflict(id) do update set source_checksum=excluded.source_checksum,status='pending',counts=excluded.counts,started_at=null,completed_at=null;`,
    `delete from migration.review_quarantine where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.import_rejections where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.product_reviews_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.order_reviews_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.firestore_documents where run_id=${sqlLiteral(runId)}::uuid;`,
  ];
  for (const collectionPath of ["reviews", "orderReviews"]) for (const row of result.source[collectionPath]) {
    lines.push(`insert into migration.firestore_documents(run_id,collection_path,document_id,payload,document_checksum) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(collectionPath)},${sqlLiteral(row.id)},${jsonLiteral(row.data)},${sqlLiteral(checksum(row))});`);
  }
  for (const [table, rows] of [["product_reviews_stage", result.staged.product_reviews], ["order_reviews_stage", result.staged.order_reviews]]) for (const row of rows) {
    const columns = ["run_id", ...Object.keys(row)];
    const values = [`${sqlLiteral(runId)}::uuid`, ...Object.values(row).map((value) => value && typeof value === "object" ? jsonLiteral(value) : sqlLiteral(value))];
    lines.push(`insert into migration.${table}(${columns.join(",")}) values (${values.join(",")});`);
  }
  for (const item of result.rejections) lines.push(`insert into migration.import_rejections(run_id,collection_path,document_id,reason_code) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(item.collectionPath)},${sqlLiteral(item.documentId)},${sqlLiteral(item.reasonCode)});`);
  if (result.rejections.length) lines.push(`update migration.import_runs set status='failed',completed_at=statement_timestamp() where id=${sqlLiteral(runId)}::uuid;`);
  else lines.push(`perform migration.promote_review_import(${sqlLiteral(runId)}::uuid);`);
  lines.push("end", "$review_import$;");
  return { runId, sql: `${lines.join("\n")}\n` };
};

module.exports = { buildReviewImportSql, canonicalJson, checksum, normalizeOrderReview, normalizeProductReview, relationshipReasonCodes, resolveMenuItemId, transformReviews };
