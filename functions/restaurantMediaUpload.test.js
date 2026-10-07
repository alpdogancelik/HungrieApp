const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const { uploadValidatedRestaurantMedia } = require("./restaurantMediaUpload");

const operationId = "55555555-0000-4000-8000-000000000555";
const validPng = async () => (await sharp({ create: { width: 4, height: 3, channels: 3, background: "orange" } }).png().toBuffer()).toString("base64");

function harness(overrides = {}) {
    const calls = [];
    return {
        calls,
        dependencies: {
            data: { operationId, declaredMime: "image/png", bytesBase64: "" },
            begin: async () => { calls.push("begin"); return { restaurantId: "restaurant-a", replayed: false }; },
            upload: async () => { calls.push("upload"); return { alreadyExists: false }; },
            record: async ({ path, mime, width, height }) => { calls.push("record"); return { path, publicUrl: `https://example.invalid/${path}`, mime, width, height }; },
            remove: async () => { calls.push("remove"); },
            release: async () => { calls.push("release"); },
            ...overrides,
        },
    };
}

test("authorization precedes decoding and valid sanitized media is registered", async () => {
    const subject = harness();
    subject.dependencies.data.bytesBase64 = await validPng();
    const result = await uploadValidatedRestaurantMedia(subject.dependencies);
    assert.deepEqual(subject.calls, ["begin", "upload", "record"]);
    assert.match(result.path, /^restaurant-a\/55555555-0000-4000-8000-000000000555-[0-9a-f]{64}\.png$/);
    assert.equal(result.mime, "image/png");
});

test("invalid content is never uploaded and releases its reservation", async () => {
    const subject = harness();
    subject.dependencies.data.bytesBase64 = Buffer.from("not an image").toString("base64");
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), { code: "INVALID_IMAGE_CONTENT" });
    assert.deepEqual(subject.calls, ["begin", "release"]);
});

test("tenant authorization denial happens before attacker bytes are decoded", async () => {
    const subject = harness({ begin: async () => { subject.calls.push("begin"); throw new Error("Active Restaurant account required"); } });
    subject.dependencies.data.bytesBase64 = Buffer.from("not an image").toString("base64");
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), /Active Restaurant account required/);
    assert.deepEqual(subject.calls, ["begin"]);
});

test("storage failure never publishes metadata and preserves the prior DB reference", async () => {
    const subject = harness({ upload: async () => { subject.calls.push("upload"); throw new Error("storage unavailable"); } });
    subject.dependencies.data.bytesBase64 = await validPng();
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), /storage unavailable/);
    assert.deepEqual(subject.calls, ["begin", "upload", "release"]);
});

test("DB registration failure removes a newly created orphan before releasing", async () => {
    const subject = harness({ record: async () => { subject.calls.push("record"); throw new Error("database unavailable"); } });
    subject.dependencies.data.bytesBase64 = await validPng();
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), /database unavailable/);
    assert.deepEqual(subject.calls, ["begin", "upload", "record", "remove", "release"]);
});

test("cleanup failure cannot replace the primary registration failure", async () => {
    const cleanupFailures = [];
    const subject = harness({
        record: async () => { subject.calls.push("record"); throw new Error("database unavailable"); },
        remove: async () => { subject.calls.push("remove"); throw new Error("cleanup unavailable"); },
        release: async () => { subject.calls.push("release"); throw new Error("release unavailable"); },
        reportCleanupFailure: (stage, error) => cleanupFailures.push({ stage, message: error.message }),
    });
    subject.dependencies.data.bytesBase64 = await validPng();
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), /database unavailable/);
    assert.deepEqual(subject.calls, ["begin", "upload", "record", "remove", "release"]);
    assert.deepEqual(cleanupFailures, [
        { stage: "object_remove", message: "cleanup unavailable" },
        { stage: "reservation_release", message: "release unavailable" },
    ]);
});

test("optional cleanup reporting cannot replace the primary failure", async () => {
    const subject = harness({
        record: async () => { subject.calls.push("record"); throw new Error("database unavailable"); },
        remove: async () => { subject.calls.push("remove"); throw new Error("cleanup unavailable"); },
        reportCleanupFailure: () => { throw new Error("monitoring unavailable"); },
    });
    subject.dependencies.data.bytesBase64 = await validPng();
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), /database unavailable/);
});

test("an existing object is not deleted when idempotent registration must be retried", async () => {
    const subject = harness({
        upload: async () => { subject.calls.push("upload"); return { alreadyExists: true }; },
        record: async () => { subject.calls.push("record"); throw new Error("database unavailable"); },
    });
    subject.dependencies.data.bytesBase64 = await validPng();
    await assert.rejects(uploadValidatedRestaurantMedia(subject.dependencies), /database unavailable/);
    assert.deepEqual(subject.calls, ["begin", "upload", "record", "release"]);
});

test("completed operation retries do not decode or upload again", async () => {
    const subject = harness({ begin: async () => { subject.calls.push("begin"); return { restaurantId: "restaurant-a", replayed: true, path: "p", publicUrl: "u", mime: "image/png", width: 4, height: 3 }; } });
    const result = await uploadValidatedRestaurantMedia(subject.dependencies);
    assert.equal(result.replayed, true);
    assert.deepEqual(subject.calls, ["begin"]);
});
