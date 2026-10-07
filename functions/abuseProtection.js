const crypto = require("node:crypto");

class AbuseLimitError extends Error {
    constructor(retryAfterSeconds) {
        super("Too many requests. Try again later.");
        this.name = "AbuseLimitError";
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

const positiveInteger = (value, name) => {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer.`);
    return value;
};

const rateLimitDocumentId = (actorId, operation) => crypto
    .createHash("sha256")
    .update(`${String(operation)}\0${String(actorId)}`)
    .digest("hex");

/**
 * Durable fixed-window limiter for low-volume, high-impact callable operations.
 * Firestore transactions serialize concurrent callers for the same identity and
 * operation. One document is reused per key so window rotation cannot create an
 * unbounded collection; expiresAt also supports a hosted Firestore TTL policy.
 */
const enforceFirestoreRateLimit = async ({
    firestore,
    actorId,
    operation,
    limit,
    windowMs,
    nowMs = Date.now(),
}) => {
    const normalizedActor = String(actorId || "").trim();
    const normalizedOperation = String(operation || "").trim();
    if (!normalizedActor || !normalizedOperation) throw new TypeError("A rate-limit actor and operation are required.");
    positiveInteger(limit, "limit");
    positiveInteger(windowMs, "windowMs");

    const reference = firestore.collection("_abuseRateLimits")
        .doc(rateLimitDocumentId(normalizedActor, normalizedOperation));

    return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() || {} : {};
        const startedAtMs = current.windowStartedAt?.toMillis?.()
            ?? new Date(current.windowStartedAt || 0).getTime();
        const inWindow = Number.isFinite(startedAtMs) && startedAtMs > 0 && nowMs - startedAtMs < windowMs;
        const count = inWindow ? Number(current.count || 0) : 0;
        const windowStartedAt = inWindow ? startedAtMs : nowMs;

        if (count >= limit) {
            const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAt + windowMs - nowMs) / 1000));
            throw new AbuseLimitError(retryAfterSeconds);
        }

        transaction.set(reference, {
            operation: normalizedOperation,
            count: count + 1,
            windowStartedAt: new Date(windowStartedAt),
            expiresAt: new Date(windowStartedAt + windowMs + 24 * 60 * 60 * 1000),
            updatedAt: new Date(nowMs),
        });
        return { remaining: Math.max(0, limit - count - 1) };
    });
};

module.exports = {
    AbuseLimitError,
    enforceFirestoreRateLimit,
    rateLimitDocumentId,
};
