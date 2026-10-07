const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const sharp = require("sharp");
const {
    MAX_DIMENSION,
    RestaurantMediaError,
    decodeBase64Image,
    validateAndSanitizeRestaurantImage,
} = require("./restaurantMedia");

const expectCode = async (promise, code) => assert.rejects(promise, (error) =>
    error instanceof RestaurantMediaError && error.code === code);

const image = (format, options = {}) => sharp({
    create: {
        width: options.width || 8,
        height: options.height || 6,
        channels: 4,
        background: { r: 220, g: 40, b: 30, alpha: 0.75 },
    },
})[format]().toBuffer();

for (const [format, mime, expectedFormat] of [
    ["jpeg", "image/jpeg", "jpeg"],
    ["png", "image/png", "png"],
    ["webp", "image/webp", "webp"],
]) {
    test(`valid ${format} is decoded and sanitized`, async () => {
        const result = await validateAndSanitizeRestaurantImage(await image(format), mime);
        const metadata = await sharp(result.bytes).metadata();
        assert.equal(result.mime, mime);
        assert.equal(metadata.format, expectedFormat);
        assert.equal(result.width, 8);
        assert.equal(result.height, 6);
    });
}

test("strict base64 decoding rejects malformed and oversized payloads", () => {
    assert.throws(() => decodeBase64Image("not base64"), { code: "INVALID_IMAGE_CONTENT" });
    assert.throws(() => decodeBase64Image("A".repeat(7_000_000)), { code: "IMAGE_TOO_LARGE" });
    assert.deepEqual(decodeBase64Image(Buffer.from("ok").toString("base64")), Buffer.from("ok"));
});

test("text, JSON and random bytes cannot borrow an image MIME", async () => {
    await expectCode(validateAndSanitizeRestaurantImage(Buffer.from("hello world"), "image/jpeg"), "INVALID_IMAGE_CONTENT");
    await expectCode(validateAndSanitizeRestaurantImage(Buffer.from('{"not":"an image"}'), "image/png"), "INVALID_IMAGE_CONTENT");
    await expectCode(validateAndSanitizeRestaurantImage(Buffer.from([0, 255, 19, 44, 81, 2]), "image/jpeg"), "INVALID_IMAGE_CONTENT");
});

test("truncated and signature-only files are rejected by the decoder", async () => {
    const jpeg = await image("jpeg");
    await expectCode(validateAndSanitizeRestaurantImage(jpeg.subarray(0, 20), "image/jpeg"), "INVALID_IMAGE_CONTENT");
    await expectCode(validateAndSanitizeRestaurantImage(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"), "INVALID_IMAGE_CONTENT");
    await expectCode(validateAndSanitizeRestaurantImage(Buffer.from("89504e470d0a1a0a", "hex"), "image/png"), "INVALID_IMAGE_CONTENT");
});

test("declared MIME is non-authoritative and mismatches are rejected", async () => {
    await expectCode(validateAndSanitizeRestaurantImage(await image("png"), "image/jpeg"), "MEDIA_TYPE_MISMATCH");
    await expectCode(validateAndSanitizeRestaurantImage(await image("jpeg"), "application/octet-stream"), "UNSUPPORTED_MEDIA_TYPE");
});

test("real but unsupported formats are rejected", async () => {
    await expectCode(validateAndSanitizeRestaurantImage(await image("gif"), "image/gif"), "UNSUPPORTED_MEDIA_TYPE");
    await expectCode(validateAndSanitizeRestaurantImage(await image("tiff"), "image/jpeg"), "UNSUPPORTED_MEDIA_TYPE");
});

test("excessive dimensions are rejected before full decode", async () => {
    const extreme = await image("png", { width: MAX_DIMENSION + 1, height: 1 });
    await expectCode(validateAndSanitizeRestaurantImage(extreme, "image/png"), "IMAGE_DIMENSIONS_EXCEEDED");
});

test("a valid image whose encoded bytes exceed 5 MB is rejected before decode", async () => {
    const width = 1500, height = 1400;
    const oversized = await sharp(crypto.randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toBuffer();
    assert.ok(oversized.length > 5 * 1024 * 1024);
    await expectCode(validateAndSanitizeRestaurantImage(oversized, "image/png"), "IMAGE_TOO_LARGE");
});

test("re-encoding removes appended bytes and metadata", async () => {
    const source = await sharp(await image("jpeg")).withMetadata({ comment: "private fixture" }).jpeg().toBuffer();
    const polyglot = Buffer.concat([source, Buffer.from("<script>harmless fixture</script>")]);
    const result = await validateAndSanitizeRestaurantImage(polyglot, "image/jpeg");
    const outputText = result.bytes.toString("latin1");
    assert.equal(outputText.includes("harmless fixture"), false);
    assert.equal(outputText.includes("private fixture"), false);
});
