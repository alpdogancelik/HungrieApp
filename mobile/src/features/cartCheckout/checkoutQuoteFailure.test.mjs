/* eslint-disable import/namespace */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyCheckoutQuoteFailure } from "./checkoutQuoteFailure.ts";

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
