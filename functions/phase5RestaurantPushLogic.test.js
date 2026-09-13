const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyMessagingFailure, restaurantWakeMessage } = require("./phase5RestaurantPushLogic");

test("wake messages contain routing metadata but no customer data", () => {
    const message = restaurantWakeMessage({ token: "secret-token", eventId: "event", eventType: "restaurant_new_order", orderId: "order", language: "en" });
    assert.equal(message.data.route, "/orders/order");
    assert.equal(JSON.stringify(message).includes("customer"), false);
});

test("invalid tokens retire while service failures retry", () => {
    assert.deepEqual(classifyMessagingFailure({ code: "messaging/registration-token-not-registered" }), {
        code: "messaging/registration-token-not-registered", retryable: false, retireToken: true,
    });
    assert.equal(classifyMessagingFailure({ code: "messaging/server-unavailable" }).retryable, true);
});
