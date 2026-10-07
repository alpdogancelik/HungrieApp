const crypto = require("node:crypto");

const SAFE_STRING_FIELDS = new Set([
    "category",
    "component",
    "deliveryId",
    "environment",
    "errorCode",
    "eventId",
    "operation",
    "operationId",
    "orderId",
    "provider",
    "reason",
    "restaurantId",
    "stage",
    "status",
    "tokenBindingId",
    "trigger",
]);
const SAFE_NUMBER_FIELDS = new Set([
    "checkedCount",
    "claimedCount",
    "deadCount",
    "failedCount",
    "finalizedCount",
    "pendingCount",
    "removedCount",
    "retryAfterSeconds",
    "retriedCount",
    "statusCode",
    "ticketedCount",
]);
const SAFE_BOOLEAN_FIELDS = new Set(["replayed", "retryable"]);

const safeString = (value, fallback = "unknown") => {
    const normalized = String(value || "").trim();
    return normalized && /^[a-zA-Z0-9_.:/-]{1,128}$/.test(normalized) ? normalized : fallback;
};

const operationalErrorCode = (error) => {
    const candidate = error?.code || error?.name || "unknown";
    return safeString(candidate);
};

const opaqueIdentifier = (value) => {
    const normalized = String(value || "");
    if (!normalized) return "unknown";
    return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
};

const buildOperationalEvent = (event, fields = {}) => {
    const payload = { event: safeString(event), component: safeString(fields.component) };
    for (const [key, value] of Object.entries(fields)) {
        if (key === "component" || value === undefined || value === null) continue;
        if (SAFE_STRING_FIELDS.has(key)) payload[key] = safeString(value);
        else if (SAFE_NUMBER_FIELDS.has(key) && Number.isFinite(value)) payload[key] = Number(value);
        else if (SAFE_BOOLEAN_FIELDS.has(key) && typeof value === "boolean") payload[key] = value;
    }
    return payload;
};

const logOperationalEvent = (logger, level, event, fields = {}) => {
    const severity = ["debug", "info", "warn", "error"].includes(level) ? level : "info";
    const payload = buildOperationalEvent(event, fields);
    logger[severity](event, payload);
    return payload;
};

module.exports = {
    buildOperationalEvent,
    logOperationalEvent,
    opaqueIdentifier,
    operationalErrorCode,
};
