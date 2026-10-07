import assert from "node:assert/strict";
import test from "node:test";
import {
  VIRTUAL_POS_CUSTOMER_AVAILABLE,
  SimulatedVirtualPosProvider,
  calculateProviderIndependentFinancialTerms,
  canTransitionVirtualPosPayment,
} from "../dist/virtualPos.js";

test("online payment is a compile-time hard-disabled customer capability", () => {
  assert.equal(VIRTUAL_POS_CUSTOMER_AVAILABLE, false);
});

test("cash and physical POS never receive Virtual POS commission", () => {
  for (const paymentMethod of ["cash", "pos"]) {
    const result = calculateProviderIndependentFinancialTerms({ subtotalKurus: 50_000, discountKurus: 0, paymentMethod, hungrieRateBps: 500, virtualPosRateBps: 300 });
    assert.deepEqual([result.hungrieCommissionKurus, result.virtualPosCommissionKurus, result.totalCommissionKurus, result.estimatedRestaurantNetKurus], [2_500, 0, 2_500, 47_500]);
  }
});

test("500 TL at 5% plus 3% uses one immutable base", () => {
  const result = calculateProviderIndependentFinancialTerms({ subtotalKurus: 50_000, discountKurus: 0, paymentMethod: "virtual_pos", hungrieRateBps: 500, virtualPosRateBps: 300 });
  assert.deepEqual(result, { commissionBaseKurus: 50_000, hungrieRateBps: 500, hungrieCommissionKurus: 2_500, virtualPosRateBps: 300, virtualPosCommissionKurus: 1_500, totalCommissionKurus: 4_000, estimatedRestaurantNetKurus: 46_000, financialContractVersion: 1 });
});

test("integer rounding, zero base, zero rate, and discounts above subtotal are deterministic", () => {
  assert.equal(calculateProviderIndependentFinancialTerms({ subtotalKurus: 1, discountKurus: 0, paymentMethod: "virtual_pos", hungrieRateBps: 5_000, virtualPosRateBps: 0 }).hungrieCommissionKurus, 1);
  assert.equal(calculateProviderIndependentFinancialTerms({ subtotalKurus: 100, discountKurus: 101, paymentMethod: "virtual_pos", hungrieRateBps: 10_000, virtualPosRateBps: 10_000 }).totalCommissionKurus, 0);
});

test("unknown is distinct from failed and can only leave through reconciliation outcomes", () => {
  assert.equal(canTransitionVirtualPosPayment("checkout_pending", "unknown"), true);
  assert.equal(canTransitionVirtualPosPayment("unknown", "captured"), true);
  assert.equal(canTransitionVirtualPosPayment("unknown", "capture_pending"), false);
  assert.equal(canTransitionVirtualPosPayment("failed", "captured"), false);
});

test("simulated provider is deterministic and production-ineligible", async () => {
  assert.throws(() => new SimulatedVirtualPosProvider("production"), /forbidden/);
  assert.throws(() => new SimulatedVirtualPosProvider("staging"), /forbidden/);
  const provider = new SimulatedVirtualPosProvider("test");
  const input = { paymentId: "payment-a", operationId: "11111111-1111-4111-8111-111111111111", amountKurus: 50_000, currency: "TRY", outcomeToken: "SIMULATED_TIMEOUT_UNKNOWN" };
  const first = await provider.capture(input);
  const second = await provider.capture(input);
  assert.deepEqual(first, second);
  assert.equal(first.outcome, "unknown");
  assert.equal(await provider.getPaymentStatus("payment-a"), "unknown");
});
