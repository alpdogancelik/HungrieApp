/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyCheckoutQuoteFailure, getMinimumOrderFailureDetails } from "./checkoutQuoteFailure.ts";

test("checkout quote explains a Restaurant that is not accepting orders", () => {
    assert.equal(classifyCheckoutQuoteFailure({ code: "22023", message: "Restaurant is not accepting orders" }), "restaurant_closed");
});

test("checkout quote keeps Customer authorization failures distinct", () => {
    assert.equal(classifyCheckoutQuoteFailure({ code: "42501", message: "Active Customer account required" }), "customer_access_denied");
});

test("checkout quote separates invalid menu selections from service failures", () => {
    assert.equal(classifyCheckoutQuoteFailure({ code: "22023", message: "Menu option selection count is invalid" }), "invalid_menu");
    assert.equal(classifyCheckoutQuoteFailure(new Error("Network request failed")), "unavailable");
});

test("checkout quote recognizes structured minimum-order rejection details", () => {
    const error = {
        code: "22023",
        message: "Minimum order amount not reached",
        details: JSON.stringify({
            reason: "MINIMUM_ORDER_NOT_MET",
            minimum_order_kurus: 30000,
            qualifying_subtotal_kurus: 27000,
        }),
    };
    assert.equal(classifyCheckoutQuoteFailure(error), "minimum_order_not_met");
    assert.deepEqual(getMinimumOrderFailureDetails(error), {
        minimumOrderKurus: 30000,
        qualifyingSubtotalKurus: 27000,
    });
});

test("malformed rejection details never become monetary authority", () => {
    assert.equal(getMinimumOrderFailureDetails({ details: '{"reason":"MINIMUM_ORDER_NOT_MET","minimum_order_kurus":-1}' }), null);
    assert.equal(getMinimumOrderFailureDetails({ details: "not-json" }), null);
});
