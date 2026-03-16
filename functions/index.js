const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const http2 = require("node:http2");

admin.initializeApp();

const USER_NOTIFIABLE_STATUSES = new Set(["preparing", "ready", "out_for_delivery", "delivered", "canceled"]);
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
        logger.error("APNs configuration is missing", {
            ...context,
            requiredEnv: ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_BUNDLE_ID"],
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
                        logger.error("APNs connection error", { ...context, tokenDocId: entry.tokenDocId, error: String(error) });
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
                        logger.warn("APNs push failed", {
                            ...context,
                            tokenDocId: entry.tokenDocId,
                            token: entry.token,
                            statusCode,
                            reason,
                            body: parsed || responseBody,
                        });

                        if (isApnsInvalidReason(reason)) {
                            invalidTokenDocIds.push(entry.tokenDocId);
                        }
                        resolve();
                    });
                    request.on("error", (error) => {
                        client.close();
                        logger.error("APNs request error", { ...context, tokenDocId: entry.tokenDocId, error: String(error) });
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
                logger.error("Failed to delete invalid APNs token", { ...context, tokenDocId, error: String(error) });
            }),
        ),
    );
    logger.info("Invalid APNs tokens removed", { ...context, removedCount: uniqueIds.length });
};

const sendFcmNotifications = async ({ entries, title, body, channelId, sound, data, context, deleteInvalidToken }) => {
    if (!entries.length) return;

    const invalidTokenDocIds = [];
    const batches = chunk(entries, 500);

    for (const batch of batches) {
        const response = await admin.messaging().sendEachForMulticast({
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
            logger.warn("FCM push failed", {
                ...context,
                tokenDocId: tokenEntry?.tokenDocId,
                token: tokenEntry?.token,
                errorCode: code,
                errorMessage: String(result.error?.message || ""),
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
                logger.error("Failed to delete invalid FCM token", { ...context, tokenDocId, error: String(error) });
            }),
        ),
    );
    logger.info("Invalid FCM tokens removed", { ...context, removedCount: uniqueIds.length });
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

    const restaurantRef = admin.firestore().collection("restaurants").doc(restaurantId);
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
            admin.firestore().collection("restaurants").doc(restaurantId).collection("pushTokens").doc(tokenDocId).delete(),
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

    const userRef = admin.firestore().collection("users").doc(userId);
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
    const orderId = String(event.params?.orderId || "");
    const data = event.data?.data() || {};
    await sendRestaurantNewOrderPush({ orderId, data, trigger: "create" });
});

exports.notifyRestaurantOnPendingTransition = onDocumentUpdated("orders/{orderId}", async (event) => {
    const orderId = String(event.params?.orderId || "");
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const beforeStatus = normalizeOrderStatus(before.status);
    const afterStatus = normalizeOrderStatus(after.status);
    if (beforeStatus === "pending" || afterStatus !== "pending") return;
    await sendRestaurantNewOrderPush({ orderId, data: after, trigger: "status_transition" });
});

exports.notifyUserOnOrderStatusTransition = onDocumentUpdated("orders/{orderId}", async (event) => {
    const orderId = String(event.params?.orderId || "");
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    await sendUserOrderStatusPush({ orderId, before, after });
});
