/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";

import {
    getMinimumOrderState,
    minimumOrderKurusFromRestaurant,
    subtotalTryToKurus,
} from "./minimumOrderModel.ts";

test("minimum order follows the selected restaurant instead of a global threshold", () => {
    const restaurants = [10000, 25000, 40000].map((minimumOrderKurus) => ({ minimumOrderKurus }));
    assert.deepEqual(restaurants.map((restaurant) => getMinimumOrderState(restaurant, 300).status), ["met", "met", "below"]);
    assert.equal(getMinimumOrderState(restaurants[0], 150).minimumKurus, 10000);
    assert.equal(getMinimumOrderState(restaurants[1], 150).minimumKurus, 25000);
    assert.equal(getMinimumOrderState(restaurants[2], 150).minimumKurus, 40000);
});

test("switching restaurants recomputes the minimum without stale state", () => {
    const cartSubtotal = 200;
    assert.equal(getMinimumOrderState({ minimumOrderKurus: 10000 }, cartSubtotal).status, "met");
    assert.deepEqual(getMinimumOrderState({ minimumOrderKurus: 25000 }, cartSubtotal), {
        status: "below", minimumKurus: 25000, subtotalKurus: 20000, remainingKurus: 5000,
    });
});

test("integer-kurus boundary behavior is below, exact, and above", () => {
    const restaurant = { minimumOrderKurus: 30000 };
    assert.equal(getMinimumOrderState(restaurant, 299.99).status, "below");
    assert.equal(getMinimumOrderState(restaurant, 300).status, "met");
    assert.equal(getMinimumOrderState(restaurant, 300.01).status, "met");
});

test("zero means no minimum and malformed or missing values fail closed", () => {
    assert.equal(getMinimumOrderState({ minimumOrderKurus: 0 }, 0).status, "met");
    for (const restaurant of [{}, { minimumOrderKurus: -1 }, { minimumOrderKurus: Number.NaN }, { minimumOrderKurus: Number.MAX_VALUE }]) {
        assert.equal(getMinimumOrderState(restaurant, 500).status, "unavailable");
    }
    assert.equal(getMinimumOrderState(null, 500).status, "unavailable");
});

test("server-derived legacy TRY data is converted explicitly to integer kurus", () => {
    assert.equal(minimumOrderKurusFromRestaurant({ minimumOrderAmount: "250.50" }), 25050);
    assert.equal(subtotalTryToKurus(200 + 49.99), 24999);
    assert.equal(minimumOrderKurusFromRestaurant({ minimumOrderAmount: "not-money" }), null);
});

test("the qualifying subtotal can include option prices while fees remain outside the model", () => {
    const baseAndOptionsSubtotal = 200 + 50;
    assert.equal(getMinimumOrderState({ minimumOrderKurus: 25000 }, baseAndOptionsSubtotal).status, "met");
    assert.equal(getMinimumOrderState({ minimumOrderKurus: 25000 }, 240).status, "below");
});
