import assert from "node:assert/strict";
import test from "node:test";

import {
    changeCartLineQuantity,
    createCartLineKey,
    normalizeCartLines,
    removeCartLine,
    setCartLineQuantity,
    summarizeCartLines,
} from "./cartModel.ts";

const meal = (overrides = {}) => ({
    id: "meal-1",
    name: "Test meal",
    price: 100,
    image_url: "",
    restaurantId: "restaurant-1",
    customizations: [],
    ...overrides,
});

test("cart line identity is stable when customization order changes", () => {
    const left = [{ id: "b", type: "extra", price: 20 }, { id: "a", type: "sauce", price: 10 }];
    const right = [...left].reverse();
    assert.equal(createCartLineKey("meal-1", left), createCartLineKey("meal-1", right));
});

test("cart line identity distinguishes option choices from removed ingredients", () => {
    assert.notEqual(
        createCartLineKey("meal-1", [{ id: "shared", type: "option_value", price: 0 }]),
        createCartLineKey("meal-1", [{ id: "shared", type: "removed_ingredient", price: 0 }]),
    );
});

test("one quantity operation inserts or updates the complete requested quantity", () => {
    const inserted = setCartLineQuantity([], meal(), 20);
    assert.equal(inserted.items.length, 1);
    assert.equal(inserted.items[0].quantity, 20);
    assert.equal(inserted.itemCountDelta, 20);
    assert.equal(inserted.priceDelta, 2_000);

    const updated = setCartLineQuantity(inserted.items, meal(), 37);
    assert.equal(updated.items.length, 1);
    assert.equal(updated.items[0].quantity, 37);
    assert.equal(updated.itemCountDelta, 17);
    assert.equal(updated.priceDelta, 1_700);
});

test("customization prices are included once per unit in cached totals", () => {
    const items = normalizeCartLines([
        { ...meal({ customizations: [{ id: "extra", type: "extra", price: 25 }] }), quantity: 3 },
    ]);
    assert.deepEqual(summarizeCartLines(items), { totalItems: 3, totalPrice: 375 });
});

test("mutations preserve unaffected cart-line references", () => {
    const items = normalizeCartLines([
        { ...meal(), quantity: 1 },
        { ...meal({ id: "meal-2", name: "Second" }), quantity: 2 },
    ]);
    const untouched = items[1];
    const result = changeCartLineQuantity(items, "meal-1", [], 1);
    assert.equal(result.items[1], untouched);
    assert.equal(result.items[0].quantity, 2);
    assert.equal(result.itemCountDelta, 1);
});

test("decrement and removal return exact item and price deltas", () => {
    const items = normalizeCartLines([{ ...meal(), quantity: 3 }]);
    const decreased = changeCartLineQuantity(items, "meal-1", [], -1);
    assert.deepEqual(summarizeCartLines(decreased.items), { totalItems: 2, totalPrice: 200 });

    const removed = removeCartLine(decreased.items, "meal-1", []);
    assert.equal(removed.items.length, 0);
    assert.equal(removed.itemCountDelta, -2);
    assert.equal(removed.priceDelta, -200);
});

test("large carts still change quantity with one immutable update", () => {
    const items = normalizeCartLines(Array.from({ length: 1_000 }, (_, index) => ({
        ...meal({ id: `meal-${index}` }),
        quantity: index + 1,
    })));
    const result = setCartLineQuantity(items, meal({ id: "meal-500" }), 999);
    assert.equal(result.items.length, 1_000);
    assert.equal(result.items[499], items[499]);
    assert.equal(result.items[501], items[501]);
    assert.equal(result.items[500].quantity, 999);
});
