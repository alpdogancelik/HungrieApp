const permanentTokenCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
]);
const retryableCodes = new Set([
    "messaging/server-unavailable",
    "messaging/internal-error",
    "messaging/quota-exceeded",
    "messaging/unknown-error",
]);

const classifyMessagingFailure = (error) => {
    const code = String(error?.code || "messaging/unknown-error").slice(0, 120);
    return { code, retryable: retryableCodes.has(code), retireToken: permanentTokenCodes.has(code) };
};

const restaurantWakeMessage = (delivery) => ({
    token: delivery.token,
    data: {
        eventId: String(delivery.eventId),
        eventType: String(delivery.eventType),
        orderId: String(delivery.orderId || ""),
        route: delivery.orderId ? `/orders/detail?orderId=${encodeURIComponent(delivery.orderId)}` : "/orders",
        title: delivery.language === "tr" ? "Hungrie Restoran" : "Hungrie Restaurant",
        body: delivery.language === "tr" ? "Yeni bir sipariş güncellemesi hazır." : "A new order update is ready.",
    },
    webpush: {
        headers: { Urgency: "high" },
    },
});

module.exports = { classifyMessagingFailure, restaurantWakeMessage };
