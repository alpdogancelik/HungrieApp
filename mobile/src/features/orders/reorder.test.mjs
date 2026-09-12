/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrderAgainstCurrentBundle } from "./reorder.ts";

const bundle = {
    restaurant: { id: "ada-pizza", name: "Ada Pizza", isActive: true },
    items: [
        {
            id: "burger-1",
            name: "Current Burger",
            price: 260,
            visible: true,
            image_url: "current.jpg",
            customizations: [
                { id: "large", name: "Large", price: 40, type: "size" },
                { id: "cheese", name: "Extra cheese", price: 20, type: "extra" },
            ],
        },
        { id: "drink-1", name: "Current Drink", price: 55, visible: true, customizations: [] },
    ],
};

test("reorder resolves stable IDs using current prices, labels, and modifier prices", () => {
    const result = resolveOrderAgainstCurrentBundle({
        restaurantId: "ada-pizza",
        orderItems: [{
            menuItemId: "burger-1",
            name: "Historical Burger",
            price: 220,
            quantity: 2,
            customizations: [{ id: "large", name: "Old large", price: 5 }],
        }],
    }, bundle);

    assert.equal(result.cartItems.length, 1);
    assert.equal(result.cartItems[0].name, "Current Burger");
    assert.equal(result.cartItems[0].price, 260);
    assert.equal(result.cartItems[0].quantity, 2);
    assert.deepEqual(result.cartItems[0].customizations, [{ id: "large", name: "Large", price: 40, type: "size" }]);
    assert.equal(result.unavailableItems.length, 0);
});

test("reorder never falls back to product display-name matching", () => {
    const result = resolveOrderAgainstCurrentBundle({
        restaurantId: "ada-pizza",
        orderItems: [{ name: "Current Burger", quantity: 1 }],
    }, bundle);

    assert.equal(result.cartItems.length, 0);
    assert.equal(result.unavailableItems[0].reason, "missing_product_id");
});

test("reorder reports removed products and changed modifier IDs without creating stale cart rows", () => {
    const result = resolveOrderAgainstCurrentBundle({
        restaurantId: "ada-pizza",
        orderItems: [
            { menuItemId: "removed", name: "Removed", quantity: 1 },
            { menuItemId: "burger-1", name: "Burger", quantity: 1, customizations: [{ id: "medium", name: "Medium" }] },
            { menuItemId: "drink-1", name: "Drink", quantity: 3 },
        ],
    }, bundle);

    assert.deepEqual(result.cartItems.map((item) => [item.id, item.quantity, item.price]), [["drink-1", 3, 55]]);
    assert.deepEqual(result.unavailableItems.map((item) => item.reason), ["product_unavailable", "customization_changed"]);
});

test("reorder rejects unavailable current menu entries", () => {
    const result = resolveOrderAgainstCurrentBundle({
        restaurantId: "ada-pizza",
        orderItems: [{ menuItemId: "sold-out", name: "Sold out", quantity: 1 }],
    }, {
        ...bundle,
        items: [{ id: "sold-out", name: "Sold out", price: 100, soldOut: true }],
    });

    assert.equal(result.cartItems.length, 0);
    assert.equal(result.unavailableItems[0].reason, "product_unavailable");
});
