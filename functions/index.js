const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const functionsV1 = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const crypto = require("node:crypto");
const http2 = require("node:http2");
const { isOperationId, hasTotpFactor, hasTotpSession, accountStatusFailureReason } = require("./phase4AdminLogic");
const { classifyMessagingFailure, restaurantWakeMessage } = require("./phase5RestaurantPushLogic");
const { deleteSharedNonProductionAccount } = require("./phase6CustomerDeletionLogic");
const { requireAccountDeletionUid } = require("./accountDeletionRequest");
const { AbuseLimitError, enforceFirestoreRateLimit } = require("./abuseProtection");
const { RestaurantMediaError } = require("./restaurantMedia");
const { uploadValidatedRestaurantMedia } = require("./restaurantMediaUpload");
const {
    logOperationalEvent,
    opaqueIdentifier,
    operationalErrorCode,
} = require("./operationalLogging");
const {
    assertNonProductionFirebaseIdentity,
    assertProductionFunctionIdentity,
    assertSharedNonProductionFunctionIdentity,
} = require("./productionEnvironmentContract");

initializeApp();

const SUPABASE_AUTHENTICATED_ROLE = "authenticated";
const SUPABASE_URL = defineSecret("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_STAGING_URL = defineSecret("SUPABASE_STAGING_URL");
const SUPABASE_STAGING_SERVICE_ROLE_KEY = defineSecret("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const SUPABASE_PRODUCTION_URL = defineSecret("SUPABASE_PRODUCTION_URL");
const SUPABASE_PRODUCTION_SERVICE_ROLE_KEY = defineSecret("SUPABASE_PRODUCTION_SERVICE_ROLE_KEY");
const PRODUCTION_FIREBASE_PROJECT_ID = defineString("PRODUCTION_FIREBASE_PROJECT_ID", { default: "" });
const PRODUCTION_SUPABASE_PROJECT_REF = defineString("PRODUCTION_SUPABASE_PROJECT_REF", { default: "" });
const ORDER_AUTOMATION_BACKEND = defineString("ORDER_AUTOMATION_BACKEND", { default: "firebase" });
const firebaseOrderAutomationEnabled = () => ORDER_AUTOMATION_BACKEND.value() === "firebase";
const CALLABLE_ABUSE_LIMITS = Object.freeze({
    adminMfaEnrollment: { limit: 5, windowMs: 60 * 60 * 1000 },
    adminMutation: { limit: 30, windowMs: 10 * 60 * 1000 },
    accountDeletion: { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
    restaurantMediaUpload: { limit: 30, windowMs: 60 * 60 * 1000 },
});
const enforceCallableAbuseLimit = async (uid, operation, policy) => {
    try {
        await enforceFirestoreRateLimit({
            firestore: getFirestore(),
            actorId: uid,
            operation,
            ...policy,
        });
    } catch (error) {
        if (error instanceof AbuseLimitError) {
            logOperationalEvent(logger, "warn", "security.rate_limit.triggered", {
                component: "callable-abuse-protection",
                operation,
                retryAfterSeconds: error.retryAfterSeconds,
                retryable: true,
            });
            throw new HttpsError("resource-exhausted", "Too many requests. Try again later.", {
                retryAfterSeconds: error.retryAfterSeconds,
            });
        }
        logOperationalEvent(logger, "error", "security.rate_limit.internal_failure", {
            component: "callable-abuse-protection",
            operation,
            errorCode: operationalErrorCode(error),
            retryable: true,
        });
        throw new HttpsError("internal", "The operation is temporarily unavailable.");
    }
};
const requireProductionIdentity = () => assertProductionFunctionIdentity({
    actualFirebaseProjectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "",
    expectedFirebaseProjectId: PRODUCTION_FIREBASE_PROJECT_ID.value(),
    supabaseUrl: SUPABASE_PRODUCTION_URL.value(),
    expectedSupabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF.value(),
});

const USER_NOTIFIABLE_STATUSES = new Set(["preparing", "ready", "out_for_delivery", "delivered", "canceled"]);
const ORDER_APPROVAL_SLA_MS = 5 * 60 * 1000;
const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const APNS_DEFAULT_TOPIC = process.env.APNS_BUNDLE_ID || "com.hungrie.app";
const APNS_PUSH_TYPE = "alert";
const APNS_PRIORITY = "10";
const APNS_EXPIRATION = "0";
const APNS_TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedApnsJwt = null;
let cachedApnsJwtExpiresAt = 0;

const chunk = (items, size) => {
    const output = [];
    for (let index = 0; index < items.length; index += size) {
        output.push(items.slice(index, index + size));
    }
    return output;
};

const sanitizeBody = (value) => String(value || "").trim();
const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
    return 0;
};
const getOrderApprovalDeadlineMs = (order) => {
    const explicitDeadline =
        toMillis(order?.restaurantApprovalDeadline) ||
        toMillis(order?.approvalDeadline) ||
        toMillis(order?.slaDeadline);
    if (explicitDeadline) return explicitDeadline;

    const createdAtMs = toMillis(order?.createdAtMs) || toMillis(order?.createdAt) || toMillis(order?.updatedAtMs) || toMillis(order?.updatedAt);
    return createdAtMs ? createdAtMs + ORDER_APPROVAL_SLA_MS : 0;
};
const normalizeLanguage = (value) => (String(value || "").toLowerCase() === "en" ? "en" : "tr");
const normalizeOrderStatus = (value) => {
    const raw = String(value || "").toLowerCase();
    if (raw === "accepted") return "preparing";
    if (raw === "rejected") return "canceled";
    return raw;
};
const formatTryAmount = (value, language) => {
    try {
        return new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-US", {
            style: "currency",
            currency: "TRY",
            maximumFractionDigits: 2,
        }).format(Number(value || 0));
    } catch {
        return `TRY ${Number(value || 0).toFixed(2)}`;
    }
};

const parseBoolean = (value, fallback = false) => {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized === "1" || normalized === "true" || normalized === "yes";
};

const base64UrlEncode = (value) =>
    Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");

const normalizePrivateKey = (value) => String(value || "").replace(/\\n/g, "\n").trim();

const getApnsConfig = () => {
    const keyId = String(process.env.APNS_KEY_ID || "").trim();
    const teamId = String(process.env.APNS_TEAM_ID || "").trim();
    const privateKey = normalizePrivateKey(process.env.APNS_PRIVATE_KEY || "");
    const topic = String(process.env.APNS_BUNDLE_ID || APNS_DEFAULT_TOPIC).trim() || APNS_DEFAULT_TOPIC;
    const sandbox = parseBoolean(process.env.APNS_USE_SANDBOX, false);
    if (!keyId || !teamId || !privateKey || !topic) {
        return null;
    }
    return {
        keyId,
        teamId,
        privateKey,
        topic,
        host: sandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST,
    };
};

const getApnsJwt = (config) => {
    const now = Date.now();
    if (cachedApnsJwt && now < cachedApnsJwtExpiresAt) {
        return cachedApnsJwt;
    }

    const issuedAt = Math.floor(now / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: config.keyId }));
    const claims = base64UrlEncode(JSON.stringify({ iss: config.teamId, iat: issuedAt }));
    const unsigned = `${header}.${claims}`;
    const signature = crypto
        .sign("sha256", Buffer.from(unsigned), {
            key: config.privateKey,
            dsaEncoding: "ieee-p1363",
        })
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");

    cachedApnsJwt = `${unsigned}.${signature}`;
    cachedApnsJwtExpiresAt = now + APNS_TOKEN_TTL_MS;
    return cachedApnsJwt;
};

const isApnsInvalidReason = (reason) =>
    ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(String(reason || ""));

const getStoredTokens = (tokenSnap) =>
    tokenSnap.docs
        .map((docSnap) => {
            const provider = String(docSnap.get("provider") || "").toLowerCase();
            const platform = String(docSnap.get("platform") || "unknown").toLowerCase();
            const token = String(docSnap.get("token") || "").trim();
            const resolvedProvider = provider || (platform === "ios" ? "apns" : platform === "android" ? "fcm" : "unknown");
            return {
                tokenDocId: docSnap.id,
                token,
                platform,
                provider: resolvedProvider,
            };
        })
        .filter((entry) => Boolean(entry.token));

const getRestaurantPushCopy = ({ language, customerName, total }) => {
    const formattedTotal = formatTryAmount(total, language);
    if (language === "en") {
        return {
            title: "New Order",
            body: `${customerName} • ${formattedTotal} • Pending`,
        };
    }
    return {
        title: "Yeni Sipariş",
        body: `${customerName} • ${formattedTotal} • Beklemede`,
    };
};

const getUserStatusCopy = ({ language, status, restaurantName }) => {
    if (language === "en") {
        if (status === "preparing") return { title: "Order confirmed", body: `${restaurantName} started preparing your order.` };
        if (status === "ready") return { title: "Order ready", body: "Courier pickup is in progress." };
        if (status === "out_for_delivery") return { title: "Order on the way", body: "Your courier is heading to you." };
        if (status === "delivered") return { title: "Order delivered", body: "Enjoy your meal." };
        if (status === "canceled") return { title: "Order not approved", body: `${restaurantName} rejected your order.` };
        return { title: "Order updated", body: `${restaurantName} updated your order.` };
    }
    if (status === "preparing") return { title: "Sipariş onaylandı", body: `${restaurantName} siparişini hazırlıyor.` };
    if (status === "ready") return { title: "Sipariş hazır", body: "Kurye teslim almak üzere yönlendirildi." };
    if (status === "out_for_delivery") return { title: "Sipariş yolda", body: "Siparişin yolda, kurye sana yaklaşıyor." };
    if (status === "delivered") return { title: "Sipariş teslim edildi", body: "Afiyet olsun." };
    if (status === "canceled") return { title: "Sipariş onaylanmadı", body: `${restaurantName} siparişi reddetti.` };
    return { title: "Sipariş güncellendi", body: `${restaurantName} sipariş durumunu güncelledi.` };
};

const buildApnsPayload = ({ title, body, sound, data }) => ({
    aps: {
        alert: { title, body },
        sound: sound || "default",
    },
    ...data,
});

const sendApnsNotifications = async ({ entries, title, body, sound, data, context, deleteInvalidToken }) => {
    if (!entries.length) return;

    const config = getApnsConfig();
    if (!config) {
        logOperationalEvent(logger, "error", "push.direct.configuration_missing", {
            component: "push-direct",
            ...context,
            provider: "apns",
            errorCode: "configuration_missing",
            retryable: false,
        });
        return;
    }

    const authToken = getApnsJwt(config);
    const invalidTokenDocIds = [];

    await Promise.all(
        entries.map(
            (entry) =>
                new Promise((resolve) => {
                    const client = http2.connect(config.host);
                    client.on("error", (error) => {
                        logOperationalEvent(logger, "error", "push.direct.connection_failure", {
                            component: "push-direct",
                            ...context,
                            provider: "apns",
                            tokenBindingId: opaqueIdentifier(entry.tokenDocId),
                            errorCode: operationalErrorCode(error),
                            retryable: true,
                        });
                        client.close();
                        resolve();
                    });

                    const payload = JSON.stringify(buildApnsPayload({ title, body, sound, data }));
                    const request = client.request({
                        ":method": "POST",
                        ":path": `/3/device/${entry.token}`,
                        authorization: `bearer ${authToken}`,
                        "apns-topic": config.topic,
                        "apns-push-type": APNS_PUSH_TYPE,
                        "apns-priority": APNS_PRIORITY,
                        "apns-expiration": APNS_EXPIRATION,
                        "content-type": "application/json",
                        "content-length": Buffer.byteLength(payload),
                    });

                    let responseBody = "";
                    let statusCode = 0;

                    request.setEncoding("utf8");
                    request.on("response", (headers) => {
                        statusCode = Number(headers[":status"] || 0);
                    });
                    request.on("data", (chunkValue) => {
                        responseBody += chunkValue;
                    });
                    request.on("end", async () => {
                        client.close();
                        if (statusCode >= 200 && statusCode < 300) {
                            resolve();
                            return;
                        }

                        let parsed = null;
                        try {
                            parsed = responseBody ? JSON.parse(responseBody) : null;
                        } catch {
                            parsed = null;
                        }

                        const reason = String(parsed?.reason || "");
                        logOperationalEvent(logger, "warn", "push.direct.delivery_failure", {
                            component: "push-direct",
                            ...context,
                            provider: "apns",
                            tokenBindingId: opaqueIdentifier(entry.tokenDocId),
                            statusCode,
                            reason,
                            retryable: !isApnsInvalidReason(reason),
                        });

                        if (isApnsInvalidReason(reason)) {
                            invalidTokenDocIds.push(entry.tokenDocId);
                        }
                        resolve();
                    });
                    request.on("error", (error) => {
                        client.close();
                        logOperationalEvent(logger, "error", "push.direct.request_failure", {
                            component: "push-direct",
                            ...context,
                            provider: "apns",
                            tokenBindingId: opaqueIdentifier(entry.tokenDocId),
                            errorCode: operationalErrorCode(error),
                            retryable: true,
                        });
                        resolve();
                    });

                    request.end(payload);
                }),
        ),
    );

    if (!invalidTokenDocIds.length) return;

    const uniqueIds = Array.from(new Set(invalidTokenDocIds));
    await Promise.all(
        uniqueIds.map((tokenDocId) =>
            deleteInvalidToken(tokenDocId).catch((error) => {
                logOperationalEvent(logger, "error", "push.direct.invalid_binding_cleanup_failure", {
                    component: "push-direct",
                    ...context,
                    provider: "apns",
                    tokenBindingId: opaqueIdentifier(tokenDocId),
                    errorCode: operationalErrorCode(error),
                    retryable: true,
                });
            }),
        ),
    );
    logOperationalEvent(logger, "info", "push.direct.invalid_bindings_removed", {
        component: "push-direct",
        ...context,
        provider: "apns",
        removedCount: uniqueIds.length,
    });
};

const sendFcmNotifications = async ({ entries, title, body, channelId, sound, data, context, deleteInvalidToken }) => {
    if (!entries.length) return;

    const invalidTokenDocIds = [];
    const batches = chunk(entries, 500);

    for (const batch of batches) {
        const response = await getMessaging().sendEachForMulticast({
            tokens: batch.map((entry) => entry.token),
            data: Object.fromEntries(
                Object.entries(data || {}).map(([key, value]) => [key, String(value)]),
            ),
            notification: {
                title,
                body,
            },
            android: {
                priority: "high",
                notification: {
                    channelId: channelId || "default",
                    sound: sound || "default",
                    defaultSound: sound === "default" || !sound,
                },
            },
        });

        response.responses.forEach((result, index) => {
            if (result.success) return;
            const tokenEntry = batch[index];
            const code = String(result.error?.code || "");
            logOperationalEvent(logger, "warn", "push.direct.delivery_failure", {
                component: "push-direct",
                ...context,
                provider: "fcm",
                tokenBindingId: opaqueIdentifier(tokenEntry?.tokenDocId),
                errorCode: code,
                retryable: !["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code),
            });
            if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) {
                invalidTokenDocIds.push(tokenEntry.tokenDocId);
            }
        });
    }

    if (!invalidTokenDocIds.length) return;

    const uniqueIds = Array.from(new Set(invalidTokenDocIds));
    await Promise.all(
        uniqueIds.map((tokenDocId) =>
            deleteInvalidToken(tokenDocId).catch((error) => {
                logOperationalEvent(logger, "error", "push.direct.invalid_binding_cleanup_failure", {
                    component: "push-direct",
                    ...context,
                    provider: "fcm",
                    tokenBindingId: opaqueIdentifier(tokenDocId),
                    errorCode: operationalErrorCode(error),
                    retryable: true,
                });
            }),
        ),
    );
    logOperationalEvent(logger, "info", "push.direct.invalid_bindings_removed", {
        component: "push-direct",
        ...context,
        provider: "fcm",
        removedCount: uniqueIds.length,
    });
};

const sendDirectNotifications = async ({
    entries,
    title,
    body,
    context,
    data,
    android,
    ios,
    deleteInvalidToken,
}) => {
    const apnsEntries = entries.filter((entry) => entry.provider === "apns");
    const fcmEntries = entries.filter((entry) => entry.provider === "fcm");

    await Promise.all([
        sendApnsNotifications({
            entries: apnsEntries,
            title,
            body,
            sound: ios?.sound || "default",
            data,
            context: { ...context, provider: "apns" },
            deleteInvalidToken,
        }),
        sendFcmNotifications({
            entries: fcmEntries,
            title,
            body,
            channelId: android?.channelId || "default",
            sound: android?.sound || "default",
            data,
            context: { ...context, provider: "fcm" },
            deleteInvalidToken,
        }),
    ]);
};

const sendRestaurantNewOrderPush = async ({ orderId, data, trigger }) => {
    const status = normalizeOrderStatus(data?.status);
    const restaurantId = String(data?.restaurantId || "");

    if (!orderId || !restaurantId) {
        logger.warn("Order trigger skipped: missing orderId/restaurantId", { orderId, restaurantId, trigger });
        return;
    }
    if (status !== "pending") {
        logger.info("Order trigger skipped: status is not pending", { orderId, status, trigger });
        return;
    }

    const restaurantRef = getFirestore().collection("restaurants").doc(restaurantId);
    const [restaurantSnap, tokenSnap] = await Promise.all([restaurantRef.get(), restaurantRef.collection("pushTokens").get()]);

    if (tokenSnap.empty) {
        logger.info("No push tokens for restaurant", { restaurantId, orderId, trigger });
        return;
    }

    const tokens = getStoredTokens(tokenSnap);
    if (!tokens.length) {
        logger.info("No native push tokens found", { restaurantId, orderId, trigger });
        return;
    }

    const preferredLanguage = normalizeLanguage(restaurantSnap.data()?.preferredLanguage);
    const customerName = sanitizeBody(data.customerName || data.customer?.name || "Customer");
    const { title, body } = getRestaurantPushCopy({
        language: preferredLanguage,
        customerName,
        total: data.total || 0,
    });

    await sendDirectNotifications({
        entries: tokens,
        title,
        body,
        data: {
            orderId,
            restaurantId,
            type: "restaurant_new_order",
        },
        android: {
            channelId: "orders",
            sound: "order",
        },
        ios: {
            sound: "hungrie.wav",
        },
        context: { orderId, restaurantId, trigger },
        deleteInvalidToken: (tokenDocId) =>
            getFirestore().collection("restaurants").doc(restaurantId).collection("pushTokens").doc(tokenDocId).delete(),
    });
};

const resolveOrderUserId = (data) =>
    String(data?.userId || data?.accountId || data?.customerId || data?.customer?.accountId || data?.customer?.id || "");

const sendUserOrderStatusPush = async ({ orderId, before, after }) => {
    const beforeStatus = normalizeOrderStatus(before?.status);
    const afterStatus = normalizeOrderStatus(after?.status);
    if (!orderId || beforeStatus === afterStatus) return;
    if (!USER_NOTIFIABLE_STATUSES.has(afterStatus)) return;

    const userId = resolveOrderUserId(after);
    if (!userId) {
        logger.warn("User push skipped: missing userId", { orderId, beforeStatus, afterStatus });
        return;
    }

    const userRef = getFirestore().collection("users").doc(userId);
    const [userSnap, tokenSnap] = await Promise.all([userRef.get(), userRef.collection("pushTokens").get()]);
    if (tokenSnap.empty) {
        logger.info("No push tokens for user", { userId, orderId, status: afterStatus });
        return;
    }

    const tokens = getStoredTokens(tokenSnap);
    if (!tokens.length) {
        logger.info("No native user tokens found", { userId, orderId, status: afterStatus });
        return;
    }

    const userLanguage = normalizeLanguage(userSnap.data()?.preferredLanguage);
    const restaurantName = sanitizeBody(after?.restaurantName || after?.restaurant?.name || "Restoran");
    const { title, body } = getUserStatusCopy({
        language: userLanguage,
        status: afterStatus,
        restaurantName,
    });

    await sendDirectNotifications({
        entries: tokens,
        title,
        body,
        data: {
            type: "order_status",
            orderId,
            status: afterStatus,
            userId,
        },
        android: {
            channelId: "order-status",
            sound: "default",
        },
        ios: {
            sound: "hungrie.wav",
        },
        context: { orderId, userId, status: afterStatus, trigger: "user_status_transition" },
        deleteInvalidToken: (tokenDocId) => userRef.collection("pushTokens").doc(tokenDocId).delete(),
    });
};

exports.notifyRestaurantOnNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
    if (!firebaseOrderAutomationEnabled()) return;
    const orderId = String(event.params?.orderId || "");
    const data = event.data?.data() || {};
    await sendRestaurantNewOrderPush({ orderId, data, trigger: "create" });
});

exports.notifyRestaurantOnPendingTransition = onDocumentUpdated("orders/{orderId}", async (event) => {
    if (!firebaseOrderAutomationEnabled()) return;
    const orderId = String(event.params?.orderId || "");
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const beforeStatus = normalizeOrderStatus(before.status);
    const afterStatus = normalizeOrderStatus(after.status);
    if (beforeStatus === "pending" || afterStatus !== "pending") return;
    await sendRestaurantNewOrderPush({ orderId, data: after, trigger: "status_transition" });
});

exports.notifyUserOnOrderStatusTransition = onDocumentUpdated("orders/{orderId}", async (event) => {
    if (!firebaseOrderAutomationEnabled()) return;
    const orderId = String(event.params?.orderId || "");
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    await sendUserOrderStatusPush({ orderId, before, after });
});

exports.cancelExpiredPendingOrders = onSchedule(
    {
        schedule: "every 1 minutes",
        timeZone: "Asia/Famagusta",
    },
    async () => {
        if (!firebaseOrderAutomationEnabled()) return;
        const db = getFirestore();
        const nowMs = Date.now();
        const snap = await db.collection("orders").where("status", "==", "pending").limit(200).get();

        if (snap.empty) {
            logger.info("Expired order cleanup skipped: no pending orders");
            return;
        }

        const batch = db.batch();
        let canceledCount = 0;
        const expiredOrderIds = [];

        snap.docs.forEach((docSnap) => {
            const order = docSnap.data() || {};
            const approvalDeadlineMs = getOrderApprovalDeadlineMs(order);
            if (!approvalDeadlineMs || approvalDeadlineMs > nowMs) return;

            const update = {
                status: "canceled",
                statusChangedAt: FieldValue.serverTimestamp(),
                statusChangedAtMs: nowMs,
                updatedAt: FieldValue.serverTimestamp(),
                updatedAtMs: nowMs,
                reminderPending: false,
                reminderHandledAt: FieldValue.serverTimestamp(),
                reminderHandledAtMs: nowMs,
            };

            if (!order.canceledAt && !order.canceledAtMs) {
                update.canceledAt = FieldValue.serverTimestamp();
                update.canceledAtMs = nowMs;
            }

            batch.update(docSnap.ref, update);
            canceledCount += 1;
            expiredOrderIds.push(docSnap.id);
        });

        if (!canceledCount) {
            logger.info("Expired order cleanup completed: no expired pending orders", { checkedCount: snap.size });
            return;
        }

        await batch.commit();
        logger.info("Expired pending orders canceled", {
            canceledCount,
            checkedCount: snap.size,
            orderIds: expiredOrderIds,
        });
    },
);

// Firebase remains the identity provider during the migration. Supabase's
// Firebase integration maps this fixed custom claim to PostgreSQL's
// `authenticated` role. Preserve every unrelated claim an account may have.
exports.assignSupabaseRoleOnUserCreate = functionsV1.auth.user().onCreate(async (user) => {
    const existingClaims = user.customClaims || {};
    if (existingClaims.role === SUPABASE_AUTHENTICATED_ROLE) return;

    await getAuth().setCustomUserClaims(user.uid, {
        ...existingClaims,
        role: SUPABASE_AUTHENTICATED_ROLE,
    });
    logger.info("Assigned Supabase authenticated role to new Firebase user", {
        claimsPreserved: Object.keys(existingClaims).length,
    });
});

const callSupabaseAdminRpc = async (name, body = {}, urlSecret = SUPABASE_URL, keySecret = SUPABASE_SERVICE_ROLE_KEY) => {
    const url = urlSecret.value().replace(/\/$/, "");
    const key = keySecret.value();
    if (!url || !key) throw new Error("Supabase account-deletion secrets are not configured.");
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(String(payload?.message || `Supabase RPC ${name} failed.`));
        error.code = payload?.code;
        throw error;
    }
    return payload;
};

const callSupabaseUserRpc = async (name, body, authorization, urlSecret, keySecret) => {
    const url = urlSecret.value().replace(/\/$/, "");
    const key = keySecret.value();
    const token = String(authorization || "").replace(/^Bearer\s+/i, "");
    if (!url || !key || !token) throw new Error("Authenticated Supabase bridge is not configured.");
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(String(payload?.message || `Supabase RPC ${name} failed.`));
        error.code = payload?.code;
        throw error;
    }
    return payload;
};

const supabaseStorageObjectUrl = (urlSecret, path) => {
    const base = urlSecret.value().replace(/\/$/, "");
    const encodedPath = String(path).split("/").map(encodeURIComponent).join("/");
    return `${base}/storage/v1/object/restaurant-media/${encodedPath}`;
};
const uploadSupabaseRestaurantMedia = async ({ path, bytes, mime }, urlSecret, keySecret) => {
    const key = keySecret.value();
    if (!urlSecret.value() || !key) throw new Error("Supabase media storage is not configured.");
    const response = await fetch(supabaseStorageObjectUrl(urlSecret, path), {
        method: "POST",
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": mime,
            "Cache-Control": "31536000, immutable",
            "Content-Disposition": "inline",
            "x-upsert": "false",
        },
        body: bytes,
    });
    if (response.status === 409) return { alreadyExists: true };
    if (!response.ok) {
        const error = new Error("Validated media could not be stored.");
        error.code = `storage/${response.status}`;
        throw error;
    }
    return { alreadyExists: false };
};
const removeSupabaseRestaurantMedia = async (path, urlSecret, keySecret) => {
    const key = keySecret.value();
    const response = await fetch(supabaseStorageObjectUrl(urlSecret, path), {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok && response.status !== 404) throw new Error("Validated media cleanup failed.");
};
const restaurantMediaPublicUrl = (urlSecret, path) => {
    const base = urlSecret.value().replace(/\/$/, "");
    return `${base}/storage/v1/object/public/restaurant-media/${path}`;
};

const restaurantMediaHttpsError = (error) => {
    const reason = error instanceof RestaurantMediaError ? error.code : String(error?.message || "");
    if (["INVALID_UPLOAD_REQUEST", "INVALID_IMAGE_CONTENT", "UNSUPPORTED_MEDIA_TYPE", "MEDIA_TYPE_MISMATCH", "IMAGE_TOO_LARGE", "IMAGE_DIMENSIONS_EXCEEDED"].includes(reason)) {
        return new HttpsError("invalid-argument", "Choose a valid JPEG, PNG, or WebP image up to 5 MB.", { reason });
    }
    if (/Active Restaurant account|required|permission|42501/i.test(reason)) {
        return new HttpsError("permission-denied", "This Restaurant account cannot upload media.");
    }
    if (/QUOTA_EXCEEDED|RATE_LIMITED|resource-exhausted/i.test(reason)) {
        return new HttpsError("resource-exhausted", "The Restaurant media upload limit has been reached.");
    }
    return new HttpsError("internal", "The image could not be uploaded.");
};

const makeRestaurantMediaUpload = (urlSecret, keySecret, identityGuard = () => {}, enforceAppCheck = true) => onCall(
    { enforceAppCheck, secrets: [urlSecret, keySecret], memory: "512MiB", timeoutSeconds: 60 },
    async (request) => {
        identityGuard();
        if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before uploading Restaurant media.");
        const authorization = request.rawRequest?.headers?.authorization;
        if (!authorization) throw new HttpsError("unauthenticated", "The current ID token is required.");
        await enforceCallableAbuseLimit(request.auth.uid, "restaurant-media-upload", CALLABLE_ABUSE_LIMITS.restaurantMediaUpload);
        let restaurantId = "";
        const operationId = String(request.data?.operationId || "");
        try {
            const result = await uploadValidatedRestaurantMedia({
                data: request.data,
                begin: async (currentOperationId) => {
                    const boundary = await callSupabaseUserRpc("restaurant_begin_media_upload_v1", { p_operation_id: currentOperationId }, authorization, urlSecret, keySecret);
                    restaurantId = String(boundary?.restaurantId || "");
                    return boundary;
                },
                upload: (media) => uploadSupabaseRestaurantMedia(media, urlSecret, keySecret),
                record: (media) => callSupabaseAdminRpc("server_record_validated_restaurant_media_v1", {
                    p_firebase_uid: request.auth.uid,
                    p_restaurant_id: media.restaurantId,
                    p_operation_id: media.operationId,
                    p_object_path: media.path,
                    p_public_url: restaurantMediaPublicUrl(urlSecret, media.path),
                    p_mime_type: media.mime,
                    p_extension: media.extension,
                    p_byte_size: media.byteSize,
                    p_width: media.width,
                    p_height: media.height,
                    p_content_sha256: media.contentSha256,
                }, urlSecret, keySecret),
                remove: (path) => removeSupabaseRestaurantMedia(path, urlSecret, keySecret),
                release: () => restaurantId ? callSupabaseAdminRpc("server_release_restaurant_media_upload_v1", {
                    p_firebase_uid: request.auth.uid,
                    p_restaurant_id: restaurantId,
                    p_operation_id: operationId,
                }, urlSecret, keySecret) : Promise.resolve(),
                reportCleanupFailure: (stage, cleanupError) => logOperationalEvent(
                    logger,
                    "error",
                    "media.process.cleanup_failure",
                    {
                        component: "restaurant-media",
                        operationId,
                        restaurantId,
                        stage,
                        errorCode: operationalErrorCode(cleanupError),
                        retryable: true,
                    },
                ),
            });
            logOperationalEvent(logger, "info", "media.process.completed", {
                component: "restaurant-media",
                operationId,
                replayed: result.replayed,
            });
            return result;
        } catch (error) {
            const category = error instanceof RestaurantMediaError ? error.code : error?.code || "validation_processing_failure";
            const expected = error instanceof RestaurantMediaError
                || /Active Restaurant account|required|permission|42501|QUOTA_EXCEEDED|RATE_LIMITED|resource-exhausted/i.test(String(error?.message || error?.code || ""));
            logOperationalEvent(
                logger,
                expected ? "warn" : "error",
                expected ? "media.process.expected_rejection" : "media.process.internal_failure",
                {
                    component: "restaurant-media",
                    operationId,
                    restaurantId,
                    category,
                    errorCode: operationalErrorCode(error),
                    retryable: !expected,
                },
            );
            throw restaurantMediaHttpsError(error);
        }
    },
);

exports.uploadRestaurantMediaDevelopment = makeRestaurantMediaUpload(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, () => {}, false);
exports.uploadRestaurantMediaStaging = makeRestaurantMediaUpload(SUPABASE_STAGING_URL, SUPABASE_STAGING_SERVICE_ROLE_KEY);
exports.uploadRestaurantMediaProduction = makeRestaurantMediaUpload(SUPABASE_PRODUCTION_URL, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY, requireProductionIdentity);

const requireAdminBridgeRequest = (request) => {
    if (!request.auth?.uid || !hasTotpSession(request.auth.token)) {
        throw new HttpsError("permission-denied", "A verified TOTP Admin session is required.");
    }
    const authorization = request.rawRequest?.headers?.authorization;
    if (!authorization) throw new HttpsError("unauthenticated", "The current ID token is required.");
    return authorization;
};

const makeRecordAdminMfaEnrollment = (urlSecret, keySecret, identityGuard = () => {}, enforceAppCheck = true) => onCall(
    { enforceAppCheck, secrets: [urlSecret, keySecret] }, async (request) => {
        identityGuard();
        if (!request.auth?.uid || request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "A verified signed-in identity is required.");
        const operationId = String(request.data?.operationId || "");
        if (!isOperationId(operationId)) throw new HttpsError("invalid-argument", "A valid operation ID is required.");
        const user = await getAuth().getUser(request.auth.uid);
        if (!hasTotpFactor(user)) throw new HttpsError("failed-precondition", "A TOTP factor must be enrolled first.");
        await enforceCallableAbuseLimit(request.auth.uid, "admin-mfa-enrollment", CALLABLE_ABUSE_LIMITS.adminMfaEnrollment);
        try {
            const result = await callSupabaseAdminRpc("server_record_admin_mfa_enrollment_v1", { p_firebase_uid: request.auth.uid, p_operation_id: operationId }, urlSecret, keySecret);
            await getAuth().revokeRefreshTokens(request.auth.uid);
            logger.info("Admin TOTP enrollment recorded", { operationId }); return result;
        } catch (error) { logger.error("Admin TOTP enrollment could not be recorded", { operationId, code: error?.code || "unknown" }); throw new HttpsError("internal", "Admin MFA enrollment could not be recorded."); }
    });
const makeSetAdminAccountStatus = (urlSecret, keySecret, identityGuard = () => {}, enforceAppCheck = true) => onCall(
    { enforceAppCheck, secrets: [urlSecret, keySecret] }, async (request) => {
        identityGuard();
        const authorization=requireAdminBridgeRequest(request),profileId=String(request.data?.profileId||""),status=String(request.data?.status||""),reasonCode=String(request.data?.reasonCode||""),operationId=String(request.data?.operationId||"");
        if(!profileId||!["active","suspended","revoked"].includes(status))throw new HttpsError("invalid-argument","Valid account status input is required.");
        await enforceCallableAbuseLimit(request.auth.uid, "admin-account-status", CALLABLE_ABUSE_LIMITS.adminMutation);
        try { const result=await callSupabaseUserRpc("admin_set_account_status_v1",{p_profile_id:profileId,p_status:status,p_reason_code:reasonCode,p_operation_id:operationId},authorization,urlSecret,keySecret); if(status!=="active"){const uid=await callSupabaseAdminRpc("server_get_firebase_uid_v1",{p_profile_id:profileId},urlSecret,keySecret);await getAuth().revokeRefreshTokens(uid)} return result; }
        catch(error){
            const reason=accountStatusFailureReason(error);
            logger.error("Admin account status orchestration failed",{operationId,status,code:error?.code||"unknown",reason:reason||"unknown"});
            throw new HttpsError("failed-precondition","Account status could not be changed.",reason?{reason}:undefined);
        }
    });
const makeRecoverAdminMfa = (urlSecret, keySecret, identityGuard = () => {}, enforceAppCheck = true) => onCall(
    { enforceAppCheck, secrets: [urlSecret, keySecret] }, async (request) => {
        identityGuard();
        const authorization=requireAdminBridgeRequest(request),profileId=String(request.data?.profileId||""),evidenceReference=String(request.data?.evidenceReference||""),operationId=String(request.data?.operationId||"");
        await enforceCallableAbuseLimit(request.auth.uid, "admin-mfa-recovery", CALLABLE_ABUSE_LIMITS.adminMutation);
        try { const result=await callSupabaseUserRpc("admin_record_mfa_recovery_v1",{p_profile_id:profileId,p_evidence_reference:evidenceReference,p_operation_id:operationId},authorization,urlSecret,keySecret);const uid=await callSupabaseAdminRpc("server_get_firebase_uid_v1",{p_profile_id:profileId},urlSecret,keySecret);await getAuth().updateUser(uid,{multiFactor:{enrolledFactors:[]}});await getAuth().revokeRefreshTokens(uid);return result; }
        catch(error){logger.error("Admin MFA recovery orchestration failed",{operationId,code:error?.code||"unknown"});throw new HttpsError("failed-precondition","MFA recovery could not be completed.")}
    });
// Local/shared Development deliberately does not enforce App Check so emulator
// and local-web workflows do not require a reusable debug credential. Staging
// and Production enforce it and require registered web providers.
exports.recordAdminMfaEnrollmentDevelopment=makeRecordAdminMfaEnrollment(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,()=>{},false);
exports.setAdminAccountStatusDevelopment=makeSetAdminAccountStatus(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,()=>{},false);
exports.recoverAdminMfaDevelopment=makeRecoverAdminMfa(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,()=>{},false);
exports.recordAdminMfaEnrollmentStaging=makeRecordAdminMfaEnrollment(SUPABASE_STAGING_URL,SUPABASE_STAGING_SERVICE_ROLE_KEY);
exports.setAdminAccountStatusStaging=makeSetAdminAccountStatus(SUPABASE_STAGING_URL,SUPABASE_STAGING_SERVICE_ROLE_KEY);
exports.recoverAdminMfaStaging=makeRecoverAdminMfa(SUPABASE_STAGING_URL,SUPABASE_STAGING_SERVICE_ROLE_KEY);
exports.recordAdminMfaEnrollmentProduction=makeRecordAdminMfaEnrollment(SUPABASE_PRODUCTION_URL,SUPABASE_PRODUCTION_SERVICE_ROLE_KEY,requireProductionIdentity);
exports.setAdminAccountStatusProduction=makeSetAdminAccountStatus(SUPABASE_PRODUCTION_URL,SUPABASE_PRODUCTION_SERVICE_ROLE_KEY,requireProductionIdentity);
exports.recoverAdminMfaProduction=makeRecoverAdminMfa(SUPABASE_PRODUCTION_URL,SUPABASE_PRODUCTION_SERVICE_ROLE_KEY,requireProductionIdentity);

const makeRestaurantWebPushDispatcher = (urlSecret, keySecret, identityGuard = () => {}) => onSchedule(
    { schedule: "every 1 minutes", secrets: [urlSecret, keySecret] }, async () => {
        identityGuard();
        const deliveries = await callSupabaseAdminRpc("server_claim_restaurant_web_push_v1", { p_limit: 100 }, urlSecret, keySecret);
        for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
            try {
                await getMessaging().send(restaurantWakeMessage(delivery));
                await callSupabaseAdminRpc("server_complete_restaurant_web_push_v1", {
                    p_delivery_id: delivery.deliveryId, p_success: true, p_error_code: null, p_retryable: false,
                }, urlSecret, keySecret);
            } catch (error) {
                const failure = classifyMessagingFailure(error);
                logOperationalEvent(logger, "error", "push.web.delivery_failure", {
                    component: "restaurant-web-push",
                    deliveryId: delivery.deliveryId,
                    eventId: delivery.eventId,
                    errorCode: failure.code,
                    retryable: failure.retryable,
                });
                await callSupabaseAdminRpc("server_complete_restaurant_web_push_v1", {
                    p_delivery_id: delivery.deliveryId, p_success: false, p_error_code: failure.code, p_retryable: failure.retryable,
                }, urlSecret, keySecret);
            }
        }
        logOperationalEvent(logger, "info", "push.web.dispatch_completed", {
            component: "restaurant-web-push",
            claimedCount: Array.isArray(deliveries) ? deliveries.length : 0,
        });
    });

exports.dispatchRestaurantWebPushDevelopment=makeRestaurantWebPushDispatcher(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
exports.dispatchRestaurantWebPushStaging=makeRestaurantWebPushDispatcher(SUPABASE_STAGING_URL,SUPABASE_STAGING_SERVICE_ROLE_KEY);
exports.dispatchRestaurantWebPushProduction=makeRestaurantWebPushDispatcher(SUPABASE_PRODUCTION_URL,SUPABASE_PRODUCTION_SERVICE_ROLE_KEY,requireProductionIdentity);

const deleteFirestoreCollection = async (reference) => {
    while (true) {
        const snapshot = await reference.limit(250).get();
        if (snapshot.empty) return;
        const batch = getFirestore().batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
        await batch.commit();
    }
};

const scrubFirebaseIdentity = async (uid) => {
    const db = getFirestore();
    const userRef = db.collection("users").doc(uid);
    await deleteFirestoreCollection(userRef.collection("addresses"));
    await deleteFirestoreCollection(userRef.collection("pushTokens"));
    const orders = await db.collection("orders").where("userId", "==", uid).get();
    for (let offset = 0; offset < orders.docs.length; offset += 250) {
        const batch = db.batch();
        orders.docs.slice(offset, offset + 250).forEach((document) => batch.update(document.ref, {
            userId: `deleted:${document.id}`,
            customerName: "Deleted user",
            customerEmail: FieldValue.delete(),
            customerWhatsapp: FieldValue.delete(),
            customer: { name: "Deleted user" },
            deliveryAddress: FieldValue.delete(),
            deliveryAddressText: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
        }));
        await batch.commit();
    }
    await userRef.delete().catch((error) => {
        if (error?.code !== 5) throw error;
    });
};

const sharedNonProductionSupabaseEnvironments = [
    { name: "development", urlSecret: SUPABASE_URL, keySecret: SUPABASE_SERVICE_ROLE_KEY },
    { name: "staging", urlSecret: SUPABASE_STAGING_URL, keySecret: SUPABASE_STAGING_SERVICE_ROLE_KEY },
];
const actualFirebaseProjectId = () => process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
const requireSharedNonProductionDeletionIdentity = () => assertSharedNonProductionFunctionIdentity({
    actualFirebaseProjectId: actualFirebaseProjectId(),
    environments: sharedNonProductionSupabaseEnvironments.map((environment) => ({
        name: environment.name,
        supabaseUrl: environment.urlSecret.value(),
    })),
});
const deletionUidFromRequest = (request) => {
    try {
        return requireAccountDeletionUid(request);
    } catch (error) {
        throw new HttpsError(error?.code || "internal", error?.message || "Account deletion could not be started.");
    }
};

exports.deleteHungrieAccount = onCall(
    { secrets: [SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STAGING_URL, SUPABASE_STAGING_SERVICE_ROLE_KEY] },
    async (request) => {
        requireSharedNonProductionDeletionIdentity();
        const uid = deletionUidFromRequest(request);
        await enforceCallableAbuseLimit(uid, "account-deletion", CALLABLE_ABUSE_LIMITS.accountDeletion);
        let deletion;
        try {
            deletion = await deleteSharedNonProductionAccount({
                uid,
                environments: sharedNonProductionSupabaseEnvironments,
                begin: (environment, firebaseUid) => callSupabaseAdminRpc(
                    "begin_account_anonymization",
                    { p_firebase_uid: firebaseUid },
                    environment.urlSecret,
                    environment.keySecret,
                ),
                scrub: scrubFirebaseIdentity,
                deleteIdentity: (firebaseUid) => getAuth().deleteUser(firebaseUid),
                finalize: (environment, profileId, firebaseUid) => callSupabaseAdminRpc(
                    "finalize_account_anonymization",
                    { p_profile_id: profileId, p_firebase_uid: firebaseUid },
                    environment.urlSecret,
                    environment.keySecret,
                ),
            });
        } catch (error) {
            if (error?.message === "LAST_RESTAURANT_OWNER") {
                throw new HttpsError("failed-precondition", "Transfer restaurant ownership before deleting this account.");
            }
            logOperationalEvent(logger, "error", "account.delete.orchestration_failure", {
                component: "account-deletion",
                environment: "shared-nonproduction",
                errorCode: operationalErrorCode(error),
                retryable: true,
            });
            throw new HttpsError("internal", "Account deletion could not be started.");
        }
        if (deletion.finalizationFailures.length) {
            logOperationalEvent(logger, "error", "account.delete.reconciliation_required", {
                component: "account-deletion",
                environment: "shared-nonproduction",
                pendingCount: deletion.finalizationFailures.length,
                retryable: true,
            });
        }
        logOperationalEvent(logger, "info", "account.delete.completed", {
            component: "account-deletion",
            environment: "shared-nonproduction",
            pendingCount: deletion.finalizationFailures.length,
        });
        return { deleted: true, pendingFinalization: deletion.finalizationFailures.length > 0 };
    },
);

// Production deletion is deliberately a separate export. It can operate only
// against one explicitly bound Production Supabase project and never iterates
// over the shared Development/Staging pair.
exports.deleteHungrieAccountProduction = onCall(
    { secrets: [SUPABASE_PRODUCTION_URL, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY] },
    async (request) => {
        requireProductionIdentity();
        const uid = deletionUidFromRequest(request);
        await enforceCallableAbuseLimit(uid, "account-deletion-production", CALLABLE_ABUSE_LIMITS.accountDeletion);
        const environment = { name: "production", urlSecret: SUPABASE_PRODUCTION_URL, keySecret: SUPABASE_PRODUCTION_SERVICE_ROLE_KEY };
        try {
            const deletion = await deleteSharedNonProductionAccount({
                uid,
                environments: [environment],
                begin: (entry, firebaseUid) => callSupabaseAdminRpc("begin_account_anonymization", { p_firebase_uid: firebaseUid }, entry.urlSecret, entry.keySecret),
                scrub: scrubFirebaseIdentity,
                deleteIdentity: (firebaseUid) => getAuth().deleteUser(firebaseUid),
                finalize: (entry, profileId, firebaseUid) => callSupabaseAdminRpc("finalize_account_anonymization", { p_profile_id: profileId, p_firebase_uid: firebaseUid }, entry.urlSecret, entry.keySecret),
            });
            if (deletion.finalizationFailures.length) {
                logOperationalEvent(logger, "error", "account.delete.reconciliation_required", {
                    component: "account-deletion",
                    environment: "production",
                    pendingCount: deletion.finalizationFailures.length,
                    retryable: true,
                });
            }
            logOperationalEvent(logger, "info", "account.delete.completed", {
                component: "account-deletion",
                environment: "production",
                pendingCount: deletion.finalizationFailures.length,
            });
            return { deleted: true, pendingFinalization: deletion.finalizationFailures.length > 0 };
        } catch (error) {
            if (error?.message === "LAST_RESTAURANT_OWNER") throw new HttpsError("failed-precondition", "Transfer restaurant ownership before deleting this account.");
            logOperationalEvent(logger, "error", "account.delete.orchestration_failure", {
                component: "account-deletion",
                environment: "production",
                errorCode: operationalErrorCode(error),
                retryable: true,
            });
            throw new HttpsError("internal", "Account deletion could not be started.");
        }
    },
);

const makeAccountAnonymizationReconciler = (environment, urlSecret, keySecret, identityGuard = () => {}) => onSchedule(
    { schedule: "every 60 minutes", secrets: [urlSecret, keySecret] },
    async () => {
        identityGuard();
        const pending = await callSupabaseAdminRpc("pending_account_anonymizations", {}, urlSecret, keySecret);
        let finalized = 0;
        let failed = 0;
        for (const row of Array.isArray(pending) ? pending : []) {
            try {
                await getAuth().getUser(row.firebase_uid);
            } catch (error) {
                if (error?.code !== "auth/user-not-found") {
                    failed += 1;
                    logOperationalEvent(logger, "error", "account.delete.reconciliation_lookup_failure", {
                        component: "account-deletion-reconciler",
                        environment,
                        errorCode: operationalErrorCode(error),
                        retryable: true,
                    });
                    continue;
                }
                try {
                    const completed = await callSupabaseAdminRpc("finalize_account_anonymization", {
                        p_profile_id: row.profile_id,
                        p_firebase_uid: row.firebase_uid,
                    }, urlSecret, keySecret);
                    if (completed === true) finalized += 1;
                    else failed += 1;
                } catch (finalizeError) {
                    failed += 1;
                    logOperationalEvent(logger, "error", "account.delete.reconciliation_finalize_failure", {
                        component: "account-deletion-reconciler",
                        environment,
                        errorCode: operationalErrorCode(finalizeError),
                        retryable: true,
                    });
                }
            }
        }
        logOperationalEvent(logger, failed ? "error" : "info", failed
            ? "account.delete.reconciliation_incomplete"
            : "account.delete.reconciliation_completed", {
            component: "account-deletion-reconciler",
            environment,
            checkedCount: pending?.length || 0,
            finalizedCount: finalized,
            failedCount: failed,
            retryable: failed > 0,
        });
        if (failed) {
            const error = new Error("Account deletion reconciliation remains incomplete.");
            error.code = "reconciliation-incomplete";
            throw error;
        }
    },
);

exports.reconcilePendingAccountAnonymizationsDevelopment = makeAccountAnonymizationReconciler(
    "development", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    () => assertNonProductionFirebaseIdentity(actualFirebaseProjectId()),
);
exports.reconcilePendingAccountAnonymizationsStaging = makeAccountAnonymizationReconciler(
    "staging", SUPABASE_STAGING_URL, SUPABASE_STAGING_SERVICE_ROLE_KEY,
    () => assertNonProductionFirebaseIdentity(actualFirebaseProjectId()),
);
exports.reconcilePendingAccountAnonymizationsProduction = makeAccountAnonymizationReconciler(
    "production", SUPABASE_PRODUCTION_URL, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY, requireProductionIdentity,
);
