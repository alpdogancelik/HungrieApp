const crypto = require("node:crypto");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const checksum = (value) => sha256(canonicalJson(value));
const text = (value) => value == null ? "" : String(value).trim();
const nullableText = (value) => text(value) || null;
const rejection = (documentId, reasonCode) => ({ collectionPath: "orders", documentId, reasonCode });

const toKurusExact = (value) => {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("MONEY_NOT_NUMERIC");
  const source = String(value).trim();
  const match = source.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(source.startsWith("-") ? "MONEY_NEGATIVE" : "MONEY_INVALID_PRECISION");
  const result = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MONEY_OUT_OF_RANGE");
  return Number(result);
};

const normalizeStatus = (value) => {
  const token = text(value).toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  const compact = token.replace(/[\s_-]+/g, "");
  if (["pending", "awaitingconfirmation", "waitingrestaurant", "pendingrestaurantapproval", "awaitingrestaurantapproval"].includes(compact)) return "pending";
  if (["accepted", "preparing"].includes(compact)) return "preparing";
  if (compact === "ready") return "ready";
  if (["outfordelivery", "ontheway"].includes(compact)) return "out_for_delivery";
  if (["delivered", "completed", "teslimedildi", "tamamlandi"].includes(compact)) return "delivered";
  if (["rejected", "cancelled", "canceled", "iptaledildi", "iptal"].includes(compact)) return "canceled";
  throw new Error("STATUS_INVALID");
};

const normalizePaymentMethod = (value) => {
  const result = text(value).toLowerCase();
  if (result === "cash" || result === "pos") return result;
  throw new Error("PAYMENT_METHOD_INVALID");
};
const timestamp = (value, required = false) => {
  if (value == null || value === "") {
    if (required) throw new Error("TIMESTAMP_MISSING");
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("TIMESTAMP_INVALID");
  return date.toISOString();
};
const nonnegativeInteger = (value, code) => {
  if (value == null || value === "") return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(code);
  return result;
};

const normalizeCustomizations = (value) => {
  if (value == null) return { rows: [], totalKurus: 0 };
  if (!Array.isArray(value)) throw new Error("CUSTOMIZATIONS_INVALID");
  let totalKurus = 0;
  const rows = value.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error("CUSTOMIZATION_INVALID");
    const id = text(entry.id || entry.slug || `customization-${index + 1}`);
    const name = text(entry.name || entry.label);
    if (!id || !name) throw new Error("CUSTOMIZATION_SNAPSHOT_MISSING");
    const priceKurus = toKurusExact(entry.price ?? 0);
    totalKurus += priceKurus;
    return { id, name, price_kurus: priceKurus };
  });
  return { rows, totalKurus };
};

const deterministicItemId = (orderId, ordinal, row) => `${orderId}__item_${String(ordinal).padStart(4, "0")}__${checksum(row).slice(0, 12)}`;

const normalizeOrder = (entry) => {
  const id = text(entry.id);
  const data = entry.data || {};
  if (!id) throw new Error("ORDER_ID_MISSING");
  const sourceUserId = text(data.userId);
  const restaurantId = text(data.restaurantId);
  if (!sourceUserId) throw new Error("USER_ID_MISSING");
  if (!restaurantId) throw new Error("RESTAURANT_ID_MISSING");
  const status = normalizeStatus(data.status);
  if (!["delivered", "canceled"].includes(status)) throw new Error("ACTIVE_ORDER_PRESENT");
  const createdAt = timestamp(data.createdAt, true);
  const updatedAt = timestamp(data.updatedAt, true);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error("TIMESTAMP_ORDER_INVALID");

  const lifecycle = {
    preparing_at: timestamp(data.preparingAt || data.acceptedAt),
    ready_at: timestamp(data.readyAt),
    out_for_delivery_at: timestamp(data.outForDeliveryAt),
    delivered_at: timestamp(data.deliveredAt),
    canceled_at: timestamp(data.canceledAt || data.rejectedAt),
  };
  const ordered = [createdAt, lifecycle.preparing_at, lifecycle.ready_at, lifecycle.out_for_delivery_at,
    status === "delivered" ? lifecycle.delivered_at : lifecycle.canceled_at].filter(Boolean).map(Date.parse);
  if (ordered.some((value, index) => index > 0 && value < ordered[index - 1])) throw new Error("LIFECYCLE_TIMESTAMP_ORDER_INVALID");

  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.orderItems) ? data.orderItems : null;
  if (!rawItems || !rawItems.length) throw new Error("ORDER_ITEMS_MISSING");
  const items = rawItems.map((item, ordinal) => {
    if (!item || typeof item !== "object") throw new Error("ORDER_ITEM_INVALID");
    const name = text(item.name);
    const quantity = Number(item.quantity);
    if (!name) throw new Error("ORDER_ITEM_NAME_MISSING");
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("ORDER_ITEM_QUANTITY_INVALID");
    const customizations = normalizeCustomizations(item.customizations);
    const unitPriceKurus = toKurusExact(item.price);
    const normalized = {
      source_ordinal: ordinal,
      source_menu_item_id: nullableText(item.menuItemId || item.itemId || item.id),
      name_snapshot: name,
      image_url_snapshot: nullableText(item.imageUrl || item.image_url),
      unit_price_kurus: unitPriceKurus,
      customization_total_kurus: customizations.totalKurus,
      quantity,
      customizations_snapshot: customizations.rows,
      created_at: createdAt,
    };
    return { order_id: id, ...normalized };
  });

  const subtotalKurus = toKurusExact(data.subtotal);
  const deliveryFeeKurus = toKurusExact(data.deliveryFee ?? 0);
  const serviceFeeKurus = toKurusExact(data.serviceFee ?? 0);
  const discountKurus = toKurusExact(data.discount ?? 0);
  const tipKurus = toKurusExact(data.tip ?? 0);
  const totalKurus = toKurusExact(data.total);
  if (subtotalKurus + deliveryFeeKurus + serviceFeeKurus + tipKurus - discountKurus !== totalKurus) throw new Error("ORDER_TOTAL_EQUATION_INVALID");
  const subtotalWhenPriceIsBase = items.reduce((sum, item) => sum + item.quantity * (item.unit_price_kurus + item.customization_total_kurus), 0);
  const subtotalWhenPriceIncludesExtras = items.reduce((sum, item) => sum + item.quantity * item.unit_price_kurus, 0);
  if (subtotalKurus === subtotalWhenPriceIncludesExtras) {
    for (const item of items) {
      if (item.unit_price_kurus < item.customization_total_kurus) throw new Error("ORDER_ITEM_BASE_PRICE_NEGATIVE");
      item.unit_price_kurus -= item.customization_total_kurus;
    }
  } else if (subtotalKurus !== subtotalWhenPriceIsBase) {
    throw new Error("ORDER_ITEM_SUBTOTAL_MISMATCH");
  }
  for (const item of items) item.id = deterministicItemId(id, item.source_ordinal, item);

  const customer = data.customer && typeof data.customer === "object" ? data.customer : {};
  const customerName = text(data.customerName || customer.name);
  if (!customerName) throw new Error("CUSTOMER_SNAPSHOT_MISSING");
  if (!data.deliveryAddress || typeof data.deliveryAddress !== "object" || Array.isArray(data.deliveryAddress)) throw new Error("DELIVERY_ADDRESS_SNAPSHOT_MISSING");
  const address = canonicalize(data.deliveryAddress);
  if (!text(address.line1) || !text(address.label) || !text(address.city) || !text(address.country)) throw new Error("DELIVERY_ADDRESS_SNAPSHOT_INVALID");
  const notes = text(data.notes);
  if (notes.length > 500) throw new Error("NOTES_TOO_LONG");
  const sourceStatus = text(data.status);
  const statusTimestamp = timestamp(data.statusChangedAt) || (status === "delivered" ? lifecycle.delivered_at : lifecycle.canceled_at) || updatedAt;
  const documentChecksum = checksum({ id, data });

  return {
    header: {
      id, source_user_id: sourceUserId, restaurant_id: restaurantId, source_status: sourceStatus, status,
      payment_method: normalizePaymentMethod(data.paymentMethod), notes,
      subtotal_kurus: subtotalKurus, delivery_fee_kurus: deliveryFeeKurus, service_fee_kurus: serviceFeeKurus,
      discount_kurus: discountKurus, tip_kurus: tipKurus, total_kurus: totalKurus,
      eta_minutes: nonnegativeInteger(data.etaMinutes, "ETA_INVALID"),
      approval_deadline_at: timestamp(data.restaurantApprovalDeadline || data.approvalDeadline || data.slaDeadline),
      reminder_pending: Boolean(data.reminderPending), reminder_requested_at: timestamp(data.reminderRequestedAt),
      source_reminder_requested_by: nullableText(data.reminderRequestedBy), reminder_source: nullableText(data.reminderSource),
      ...lifecycle, history_at: statusTimestamp, created_at: createdAt, updated_at: updatedAt,
      source_courier_label: nullableText(data.courierLabel || data.courierName || data.courier || data.assignedCourier),
      document_checksum: documentChecksum,
    },
    contact: {
      order_id: id, customer_name: customerName,
      customer_email: nullableText(data.customerEmail || customer.email),
      customer_whatsapp: nullableText(data.customerWhatsapp || customer.whatsappNumber),
      delivery_address_snapshot: address,
    },
    items,
  };
};

const transformOrders = ({ documents }) => {
  const headers = []; const contacts = []; const items = []; const rejections = [];
  for (const entry of documents.orders || []) {
    try {
      const normalized = normalizeOrder(entry);
      headers.push(normalized.header); contacts.push(normalized.contact); items.push(...normalized.items);
    } catch (error) { rejections.push(rejection(text(entry.id), error instanceof Error ? error.message : "TRANSFORM_FAILED")); }
  }
  headers.sort((a, b) => a.id.localeCompare(b.id));
  contacts.sort((a, b) => a.order_id.localeCompare(b.order_id));
  items.sort((a, b) => `${a.order_id}\0${a.source_ordinal}`.localeCompare(`${b.order_id}\0${b.source_ordinal}`));
  const source = {
    orders: (documents.orders || []).map((entry) => ({ id: text(entry.id), data: entry.data || {} })).sort((a, b) => a.id.localeCompare(b.id)),
    relationshipEvidence: canonicalize(documents.relationshipEvidence || {}),
  };
  const staged = { orders: headers, contacts, items };
  return {
    source: canonicalize(source), staged, rejections,
    sourceChecksum: checksum(source), stagedChecksum: checksum(staged),
    counts: { source: { orders: source.orders.length }, staged: { orders: headers.length, contacts: contacts.length, items: items.length }, rejected: rejections.length },
    totals: headers.reduce((sum, row) => ({ subtotal_kurus: sum.subtotal_kurus + row.subtotal_kurus, delivery_fee_kurus: sum.delivery_fee_kurus + row.delivery_fee_kurus, service_fee_kurus: sum.service_fee_kurus + row.service_fee_kurus, discount_kurus: sum.discount_kurus + row.discount_kurus, tip_kurus: sum.tip_kurus + row.tip_kurus, total_kurus: sum.total_kurus + row.total_kurus }), { subtotal_kurus: 0, delivery_fee_kurus: 0, service_fee_kurus: 0, discount_kurus: 0, tip_kurus: 0, total_kurus: 0 }),
    statusCounts: Object.fromEntries([...new Set(headers.map((row) => row.status))].sort().map((status) => [status, headers.filter((row) => row.status === status).length])),
  };
};

const sqlLiteral = (value) => value == null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(canonicalJson(value))}::jsonb`;
const deterministicRunId = (sourceChecksum) => `${sourceChecksum.slice(0, 8)}-${sourceChecksum.slice(8, 12)}-8${sourceChecksum.slice(13, 16)}-a${sourceChecksum.slice(17, 20)}-${sourceChecksum.slice(20, 32)}`;
const APPROVABLE_QUARANTINE_CODES = new Set(["DELIVERY_ADDRESS_SNAPSHOT_MISSING"]);
const buildOrderImportSql = (result, sourceProject, approvedQuarantineCodes = []) => {
  const approved = new Set(approvedQuarantineCodes);
  for (const code of approved) if (!APPROVABLE_QUARANTINE_CODES.has(code)) throw new Error(`QUARANTINE_CODE_NOT_APPROVABLE:${code}`);
  const blockingRejections = result.rejections.filter((item) => !approved.has(item.reasonCode));
  const runId = deterministicRunId(result.sourceChecksum);
  const lines = ["do $order_import$", "begin",
    `insert into migration.import_runs(id,source_project,source_checksum,status,counts) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(sourceProject)},${sqlLiteral(result.sourceChecksum)},'pending',${jsonLiteral({ source: result.counts.source, staged: result.counts.staged, rejected: result.counts.rejected, status_counts: result.statusCounts, financial_totals: result.totals, staged_checksum: result.stagedChecksum })}) on conflict(id) do update set source_checksum=excluded.source_checksum,status='pending',counts=excluded.counts,started_at=null,completed_at=null;`,
    `delete from migration.order_quarantine where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.import_rejections where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.order_items_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.order_contacts_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.orders_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.firestore_documents where run_id=${sqlLiteral(runId)}::uuid;`,
  ];
  for (const row of result.source.orders) {
    const sourceUpdatedAt = timestamp(row.data.updatedAt, true);
    lines.push(`insert into migration.firestore_documents(run_id,collection_path,document_id,payload,source_updated_at,document_checksum) values (${sqlLiteral(runId)}::uuid,'orders',${sqlLiteral(row.id)},${jsonLiteral(row.data)},${sqlLiteral(sourceUpdatedAt)}::timestamptz,${sqlLiteral(checksum(row))});`);
  }
  const specs = [["orders_stage", result.staged.orders], ["order_contacts_stage", result.staged.contacts], ["order_items_stage", result.staged.items]];
  for (const [table, rows] of specs) for (const row of rows) {
    const columns = ["run_id", ...Object.keys(row)];
    const values = [`${sqlLiteral(runId)}::uuid`, ...Object.values(row).map((value) => value && typeof value === "object" ? jsonLiteral(value) : sqlLiteral(value))];
    lines.push(`insert into migration.${table}(${columns.join(",")}) values (${values.join(",")});`);
  }
  for (const item of blockingRejections) lines.push(`insert into migration.import_rejections(run_id,collection_path,document_id,reason_code) values (${sqlLiteral(runId)}::uuid,'orders',${sqlLiteral(item.documentId)},${sqlLiteral(item.reasonCode)});`);
  for (const item of result.rejections.filter((entry) => approved.has(entry.reasonCode))) lines.push(`insert into migration.order_quarantine(run_id,document_id,reason_code,reason_details,approved_exception) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(item.documentId)},${sqlLiteral(item.reasonCode)},'{"approved_by":"app_owner","approved_on":"2026-09-04"}'::jsonb,true);`);
  if (blockingRejections.length) lines.push(`update migration.import_runs set status='failed',completed_at=statement_timestamp() where id=${sqlLiteral(runId)}::uuid;`);
  else lines.push(`perform migration.promote_order_import(${sqlLiteral(runId)}::uuid);`);
  lines.push("end", "$order_import$;");
  return { runId, sql: `${lines.join("\n")}\n` };
};

module.exports = { APPROVABLE_QUARANTINE_CODES, buildOrderImportSql, canonicalJson, checksum, deterministicItemId, normalizeOrder, normalizeStatus, toKurusExact, transformOrders };
