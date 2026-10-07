const sharp = require("sharp");

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;

const FORMATS = Object.freeze({
    jpeg: Object.freeze({ mime: "image/jpeg", extension: "jpg" }),
    png: Object.freeze({ mime: "image/png", extension: "png" }),
    webp: Object.freeze({ mime: "image/webp", extension: "webp" }),
});

class RestaurantMediaError extends Error {
    constructor(code) {
        super(code);
        this.name = "RestaurantMediaError";
        this.code = code;
    }
}

const mediaError = (code) => new RestaurantMediaError(code);

function decodeBase64Image(value) {
    if (typeof value !== "string" || !value || value.length > Math.ceil(MAX_INPUT_BYTES / 3) * 4 + 4) {
        throw mediaError("IMAGE_TOO_LARGE");
    }
    if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        throw mediaError("INVALID_IMAGE_CONTENT");
    }
    const bytes = Buffer.from(value, "base64");
    if (!bytes.length || bytes.length > MAX_INPUT_BYTES || bytes.toString("base64") !== value) {
        throw mediaError(bytes.length > MAX_INPUT_BYTES ? "IMAGE_TOO_LARGE" : "INVALID_IMAGE_CONTENT");
    }
    return bytes;
}

async function validateAndSanitizeRestaurantImage(bytes, declaredMime) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw mediaError("INVALID_IMAGE_CONTENT");
    if (bytes.length > MAX_INPUT_BYTES) throw mediaError("IMAGE_TOO_LARGE");
    if (!Object.values(FORMATS).some((format) => format.mime === declaredMime)) {
        throw mediaError("UNSUPPORTED_MEDIA_TYPE");
    }

    let metadata;
    try {
        metadata = await sharp(bytes, {
            failOn: "warning",
            limitInputPixels: MAX_PIXELS,
            sequentialRead: true,
            animated: false,
        }).metadata();
    } catch {
        throw mediaError("INVALID_IMAGE_CONTENT");
    }

    const format = FORMATS[metadata.format];
    if (!format) throw mediaError("UNSUPPORTED_MEDIA_TYPE");
    if (format.mime !== declaredMime) throw mediaError("MEDIA_TYPE_MISMATCH");
    if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) ||
        metadata.width < 1 || metadata.height < 1) {
        throw mediaError("INVALID_IMAGE_CONTENT");
    }
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION ||
        metadata.width * metadata.height > MAX_PIXELS) {
        throw mediaError("IMAGE_DIMENSIONS_EXCEEDED");
    }
    if (Number(metadata.pages || 1) !== 1) throw mediaError("UNSUPPORTED_MEDIA_TYPE");

    try {
        let pipeline = sharp(bytes, {
            failOn: "warning",
            limitInputPixels: MAX_PIXELS,
            sequentialRead: true,
            animated: false,
        }).rotate();
        if (metadata.format === "jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
        if (metadata.format === "png") pipeline = pipeline.png({ compressionLevel: 9 });
        if (metadata.format === "webp") pipeline = pipeline.webp({ quality: 90 });
        const result = await pipeline.toBuffer({ resolveWithObject: true });
        if (!result.data.length || result.data.length > MAX_OUTPUT_BYTES) throw mediaError("IMAGE_TOO_LARGE");
        if (result.info.width > MAX_DIMENSION || result.info.height > MAX_DIMENSION ||
            result.info.width * result.info.height > MAX_PIXELS) {
            throw mediaError("IMAGE_DIMENSIONS_EXCEEDED");
        }
        return {
            bytes: result.data,
            mime: format.mime,
            extension: format.extension,
            width: result.info.width,
            height: result.info.height,
        };
    } catch (error) {
        if (error instanceof RestaurantMediaError) throw error;
        throw mediaError("INVALID_IMAGE_CONTENT");
    }
}

module.exports = {
    FORMATS,
    MAX_DIMENSION,
    MAX_INPUT_BYTES,
    MAX_OUTPUT_BYTES,
    MAX_PIXELS,
    RestaurantMediaError,
    decodeBase64Image,
    validateAndSanitizeRestaurantImage,
};
