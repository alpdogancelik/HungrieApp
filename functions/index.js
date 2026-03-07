const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_EXPO_BATCH = 100;
const USER_NOTIFIABLE_STATUSES = new Set(["preparing", "ready", "out_for_delivery", "delivered", "canceled"]);

const chunk = (items, size) => {
    const output = [];
    for (let i = 0; i < items.length; i += size) {
        output.push(items.slice(i, i + size));
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

const sendExpoMessages = async ({ messages, tokens, context, deleteInvalidToken }) => {
    if (!messages.length) return;

    const invalidTokenDocIds = [];

    for (const batch of chunk(messages, MAX_EXPO_BATCH)) {
        try {
            const response = await fetch(EXPO_PUSH_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
                body: JSON.stringify(batch),
            });

            const json = await response.json().catch(() => null);
            if (!response.ok || !json?.data) {
                logger.error("Expo push request failed", {
                    ...context,
                    status: response.status,
                    body: json,
                });
                continue;
            }

            json.data.forEach((ticket, index) => {
                if (ticket?.status !== "error") return;
                const detailsError = String(ticket?.details?.error || "");
                const tokenUsed = batch[index]?.to;
                const matching = tokens.find((entry) => entry.token === tokenUsed);

                logger.warn("Expo ticket error", {
                    ...context,
                    token: tokenUsed,
                    message: ticket?.message,
                    detailsError,
                });

                if (!matching) return;
                if (detailsError === "DeviceNotRegistered" || detailsError === "InvalidCredentials") {
                    invalidTokenDocIds.push(matching.tokenDocId);
                }
            });
        } catch (error) {
            logger.error("Expo push send exception", {
                ...context,
                error: String(error),
            });
        }
    }

    if (!invalidTokenDocIds.length) return;

    const uniqueIds = Array.from(new Set(invalidTokenDocIds));
    await Promise.all(
        uniqueIds.map((tokenDocId) =>
            deleteInvalidToken(tokenDocId).catch((error) => {
                logger.error("Failed to delete invalid token", { ...context, tokenDocId, error: String(error) });
            }),
        ),
    );
    logger.info("Invalid push tokens removed", { ...context, removedCount: uniqueIds.length });
};

const getExpoTokens = (tokenSnap) =>
    tokenSnap.docs
        .map((docSnap) => ({
            tokenDocId: docSnap.id,
            token: String(docSnap.get("token") || ""),
            platform: String(docSnap.get("platform") || "unknown").toLowerCase(),
        }))
        .filter((entry) => entry.token.startsWith("ExponentPushToken["));

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

    const tokens = getExpoTokens(tokenSnap);
    if (!tokens.length) {
        logger.info("No Expo-compatible tokens found", { restaurantId, orderId, trigger });
        return;
    }

    const preferredLanguage = normalizeLanguage(restaurantSnap.data()?.preferredLanguage);
    const customerName = sanitizeBody(data.customerName || data.customer?.name || "Customer");
    const { title, body } = getRestaurantPushCopy({
        language: preferredLanguage,
        customerName,
        total: data.total || 0,
    });

    const messages = tokens.map((entry) => {
        const base = {
            to: entry.token,
            title,
            body,
            priority: "high",
            data: {
                orderId,
                restaurantId,
                type: "restaurant_new_order",
            },
        };

        if (entry.platform === "android") return { ...base, channelId: "orders", sound: "order" };
        if (entry.platform === "ios") return { ...base, sound: "hungrie.wav" };
        return { ...base, sound: "default" };
    });

    await sendExpoMessages({
        messages,
        tokens,
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

    const tokens = getExpoTokens(tokenSnap);
    if (!tokens.length) {
        logger.info("No Expo-compatible user tokens found", { userId, orderId, status: afterStatus });
        return;
    }

    const userLanguage = normalizeLanguage(userSnap.data()?.preferredLanguage);
    const restaurantName = sanitizeBody(after?.restaurantName || after?.restaurant?.name || "Restoran");
    const { title, body } = getUserStatusCopy({
        language: userLanguage,
        status: afterStatus,
        restaurantName,
    });

    const messages = tokens.map((entry) => {
        const base = {
            to: entry.token,
            title,
            body,
            priority: "high",
            data: {
                type: "order_status",
                orderId,
                status: afterStatus,
                userId,
            },
        };
        if (entry.platform === "android") return { ...base, channelId: "order-status", sound: "default" };
        if (entry.platform === "ios") return { ...base, sound: "hungrie.wav" };
        return { ...base, sound: "default" };
    });

    await sendExpoMessages({
        messages,
        tokens,
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
