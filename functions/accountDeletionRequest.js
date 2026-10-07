const CLIENT_IDENTITY_FIELDS = ["uid", "userId", "profileId", "firebaseUid", "email"];
const RECENT_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

const requestError = (code, message) => Object.assign(new Error(message), { code });

const requireAccountDeletionUid = (request, nowMs = Date.now()) => {
    const uid = String(request?.auth?.uid || "").trim();
    if (!uid) throw requestError("unauthenticated", "Please sign in before deleting your account.");
    if (CLIENT_IDENTITY_FIELDS.some((field) => request?.data?.[field] !== undefined)) {
        throw requestError("invalid-argument", "Account deletion does not accept a client-selected identity.");
    }
    const authTimeMs = Number(request?.auth?.token?.auth_time || 0) * 1000;
    if (!authTimeMs || nowMs - authTimeMs > RECENT_AUTH_MAX_AGE_MS || authTimeMs > nowMs + 60_000) {
        throw requestError("failed-precondition", "For security, sign in again before deleting your account.");
    }
    return uid;
};

module.exports = { CLIENT_IDENTITY_FIELDS, RECENT_AUTH_MAX_AGE_MS, requireAccountDeletionUid };
