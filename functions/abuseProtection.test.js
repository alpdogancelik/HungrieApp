const assert = require("node:assert/strict");
const test = require("node:test");
const {
    AbuseLimitError,
    enforceFirestoreRateLimit,
    rateLimitDocumentId,
} = require("./abuseProtection");

const createFirestore = () => {
    const values = new Map();
    let queue = Promise.resolve();
    return {
        values,
        collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
        runTransaction: (callback) => {
            const run = queue.then(async () => {
                const pending = new Map();
                const result = await callback({
                    get: async (reference) => ({
                        exists: values.has(reference.path),
                        data: () => values.get(reference.path),
                    }),
                    set: (reference, value) => pending.set(reference.path, value),
                });
                pending.forEach((value, key) => values.set(key, value));
                return result;
            });
            queue = run.catch(() => undefined);
            return run;
        },
    };
};

test("rate-limit keys are stable, pseudonymous, and operation scoped", () => {
    const first = rateLimitDocumentId("firebase-user", "delete-account");
    assert.equal(first, rateLimitDocumentId("firebase-user", "delete-account"));
    assert.notEqual(first, rateLimitDocumentId("firebase-user", "admin-mutation"));
    assert.doesNotMatch(first, /firebase-user/);
});

test("durable limiter enforces boundary, isolates identities, and resets its window", async () => {
    const firestore = createFirestore();
    const input = { firestore, actorId: "user-a", operation: "delete-account", limit: 2, windowMs: 60_000 };
    await enforceFirestoreRateLimit({ ...input, nowMs: 1_000 });
    const boundary = await enforceFirestoreRateLimit({ ...input, nowMs: 2_000 });
    assert.equal(boundary.remaining, 0);
    await assert.rejects(
        enforceFirestoreRateLimit({ ...input, nowMs: 3_000 }),
        (error) => error instanceof AbuseLimitError && error.retryAfterSeconds === 58,
    );
    await enforceFirestoreRateLimit({ ...input, actorId: "user-b", nowMs: 3_000 });
    await enforceFirestoreRateLimit({ ...input, nowMs: 61_000 });
});

test("concurrent requests cannot pass beyond the configured limit", async () => {
    const firestore = createFirestore();
    const settled = await Promise.allSettled(Array.from({ length: 12 }, () => enforceFirestoreRateLimit({
        firestore,
        actorId: "same-user",
        operation: "admin-mutation",
        limit: 4,
        windowMs: 60_000,
        nowMs: 10_000,
    })));
    assert.equal(settled.filter(({ status }) => status === "fulfilled").length, 4);
    assert.equal(settled.filter(({ status }) => status === "rejected").length, 8);
});

test("limiter storage failures fail closed", async () => {
    const firestore = createFirestore();
    firestore.runTransaction = async () => { throw new Error("storage unavailable"); };
    await assert.rejects(enforceFirestoreRateLimit({
        firestore,
        actorId: "user",
        operation: "delete-account",
        limit: 1,
        windowMs: 1_000,
    }), /storage unavailable/);
});
