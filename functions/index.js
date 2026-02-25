const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_EXPO_BATCH = 100;

const chunk = (items, size) => {
    const output = [];
    for (let i = 0; i < items.length; i += size) {
        output.push(items.slice(i, i + size));
    }
    return output;
};

const sanitizeBody = (value) => String(value || "").trim();
const normalizeLanguage = (value) => (String(value || "").toLowerCase() === "en" ? "en" : "tr");
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
const getPushCopy = ({ language, customerName, total }) => {
    const formattedTotal = formatTryAmount(total, language);
    if (language === "en") {
        return {
            title: "New Order",
            body: `${customerName} \u2022 ${formattedTotal} \u2022 Pending`,
        };
    }
    return {
        title: "Yeni Sipari\u015f",
        body: `${customerName} \u2022 ${formattedTotal} \u2022 Beklemede`,
    };
};

const sendRestaurantNewOrderPush = async ({ orderId, data, trigger }) => {
    const status = String(data?.status || "").toLowerCase();
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
    const [restaurantSnap, tokenSnap] = await Promise.all([
        restaurantRef.get(),
        restaurantRef.collection("pushTokens").get(),
    ]);

    if (tokenSnap.empty) {
            logger.info("No push tokens for restaurant", { restaurantId, orderId, trigger });
            return;
        }

    const tokens = tokenSnap.docs
        .map((docSnap) => ({
            tokenDocId: docSnap.id,
            token: String(docSnap.get("token") || ""),
            platform: String(docSnap.get("platform") || "unknown").toLowerCase(),
        }))
        .filter((entry) => entry.token.startsWith("ExponentPushToken["));

    if (!tokens.length) {
        logger.info("No Expo-compatible tokens found", { restaurantId, orderId, trigger });
        return;
    }

    const preferredLanguage = normalizeLanguage(restaurantSnap.data()?.preferredLanguage);
    const customerName = sanitizeBody(data.customerName || data.customer?.name || "Customer");
    const { title, body } = getPushCopy({
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

        if (entry.platform === "android") {
            return {
                ...base,
                channelId: "orders",
                sound: "order",
            };
        }

        if (entry.platform === "ios") {
            return {
                ...base,
                sound: "hungrie.wav",
            };
        }

        return {
            ...base,
            sound: "default",
        };
    });

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
                    orderId,
                    restaurantId,
                    trigger,
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
                    orderId,
                    restaurantId,
                    trigger,
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
                orderId,
                restaurantId,
                trigger,
                error: String(error),
            });
        }
    }

    if (invalidTokenDocIds.length) {
        const uniqueIds = Array.from(new Set(invalidTokenDocIds));
        await Promise.all(
            uniqueIds.map((tokenDocId) =>
                admin
                    .firestore()
                    .collection("restaurants")
                    .doc(restaurantId)
                    .collection("pushTokens")
                    .doc(tokenDocId)
                    .delete()
                    .catch((error) => {
                        logger.error("Failed to delete invalid token", { restaurantId, tokenDocId, error: String(error) });
                    }),
            ),
        );
        logger.info("Invalid push tokens removed", { restaurantId, removedCount: uniqueIds.length });
    }
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
    const beforeStatus = String(before.status || "").toLowerCase();
    const afterStatus = String(after.status || "").toLowerCase();
    if (beforeStatus === "pending" || afterStatus !== "pending") return;
    await sendRestaurantNewOrderPush({ orderId, data: after, trigger: "status_transition" });
});
