const crypto = require("node:crypto");
const {
    RestaurantMediaError,
    decodeBase64Image,
    validateAndSanitizeRestaurantImage,
} = require("./restaurantMedia");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function uploadValidatedRestaurantMedia({
    data,
    begin,
    upload,
    record,
    remove,
    release,
    reportCleanupFailure = () => {},
}) {
    const operationId = String(data?.operationId || "");
    const declaredMime = String(data?.declaredMime || "").toLowerCase();
    if (!UUID.test(operationId)) throw new RestaurantMediaError("INVALID_UPLOAD_REQUEST");

    let authorization;
    try {
        authorization = await begin(operationId);
    } catch (error) {
        throw error;
    }
    if (authorization?.replayed) {
        return {
            path: authorization.path,
            publicUrl: authorization.publicUrl,
            mime: authorization.mime,
            width: authorization.width,
            height: authorization.height,
            replayed: true,
        };
    }

    let sanitized;
    try {
        sanitized = await validateAndSanitizeRestaurantImage(decodeBase64Image(data?.bytesBase64), declaredMime);
    } catch (error) {
        await release().catch((cleanupError) => {
            try { reportCleanupFailure("reservation_release", cleanupError); } catch { /* optional evidence must not mask validation */ }
        });
        throw error;
    }

    const contentSha256 = crypto.createHash("sha256").update(sanitized.bytes).digest("hex");
    const path = `${authorization.restaurantId}/${operationId}-${contentSha256}.${sanitized.extension}`;
    let created = false;
    try {
        const result = await upload({ path, bytes: sanitized.bytes, mime: sanitized.mime });
        created = result?.alreadyExists !== true;
        const registered = await record({
            restaurantId: authorization.restaurantId,
            operationId,
            path,
            mime: sanitized.mime,
            extension: sanitized.extension,
            byteSize: sanitized.bytes.length,
            width: sanitized.width,
            height: sanitized.height,
            contentSha256,
        });
        return { ...registered, replayed: false };
    } catch (error) {
        if (created) await remove(path).catch((cleanupError) => {
            try { reportCleanupFailure("object_remove", cleanupError); } catch { /* optional evidence must not mask upload failure */ }
        });
        await release().catch((cleanupError) => {
            try { reportCleanupFailure("reservation_release", cleanupError); } catch { /* optional evidence must not mask upload failure */ }
        });
        throw error;
    }
}

module.exports = { uploadValidatedRestaurantMedia };
