/**
 * Provider-independent Virtual POS contract.
 *
 * This module deliberately contains no provider SDK types, credentials, card
 * fields, browser checkout implementation, or customer activation switch.
 */
export const VIRTUAL_POS_CUSTOMER_AVAILABLE = false as const;

export type CustomerCheckoutPaymentMethod = "cash" | "pos";
export type InternalPaymentMethod = CustomerCheckoutPaymentMethod | "virtual_pos";
export type VirtualPosEnvironment = "test" | "development" | "staging" | "production";
export type VirtualPosActivationState =
  | "unconfigured"
  | "sandbox_configured"
  | "sandbox_qualified"
  | "production_configured"
  | "production_qualified"
  | "active"
  | "suspended";

export type VirtualPosPaymentState =
  | "created"
  | "checkout_pending"
  | "three_ds_pending"
  | "authorized"
  | "capture_pending"
  | "captured"
  | "void_pending"
  | "voided"
  | "refund_pending"
  | "partially_refunded"
  | "refunded"
  | "failed"
  | "unknown"
  | "chargeback";

export type VirtualPosCapability =
  | "hosted_checkout"
  | "three_ds"
  | "preauthorization"
  | "partial_capture"
  | "void"
  | "partial_refund"
  | "signed_webhooks"
  | "marketplace_settlement";

export type VirtualPosCapabilities = Readonly<Record<VirtualPosCapability, boolean>>;
export type SanitizedProviderReference = string & { readonly __sanitizedProviderReference: unique symbol };

export type ProviderMutationResult =
  | { outcome: "succeeded"; providerReference: SanitizedProviderReference; state: VirtualPosPaymentState }
  | { outcome: "declined"; providerReference: SanitizedProviderReference; failureClassification: string }
  | { outcome: "unknown"; providerReference: SanitizedProviderReference; reconciliationRequired: true };

export type CreatePaymentSessionInput = {
  paymentId: string;
  operationId: string;
  amountKurus: number;
  currency: "TRY";
  outcomeToken?: SimulatedOutcomeToken;
};

export type VerifyProviderEventInput = {
  paymentId: string;
  sanitizedEventReference: string;
  verificationMaterial: string;
};

export interface VirtualPosProvider {
  readonly adapterId: string;
  readonly contractVersion: string;
  readonly capabilities: VirtualPosCapabilities;
  createPaymentSession(input: CreatePaymentSessionInput): Promise<ProviderMutationResult>;
  verifyCallback(input: VerifyProviderEventInput): Promise<boolean>;
  getPaymentStatus(paymentId: string): Promise<VirtualPosPaymentState>;
  capture(input: CreatePaymentSessionInput): Promise<ProviderMutationResult>;
  voidAuthorization(input: CreatePaymentSessionInput): Promise<ProviderMutationResult>;
  refund(input: CreatePaymentSessionInput): Promise<ProviderMutationResult>;
  verifyWebhook(input: VerifyProviderEventInput): Promise<boolean>;
}

const transitions: Readonly<Record<VirtualPosPaymentState, readonly VirtualPosPaymentState[]>> = {
  created: ["checkout_pending", "failed"],
  checkout_pending: ["three_ds_pending", "authorized", "captured", "failed", "unknown"],
  three_ds_pending: ["authorized", "captured", "failed", "unknown"],
  authorized: ["capture_pending", "void_pending", "unknown"],
  capture_pending: ["captured", "failed", "unknown"],
  captured: ["refund_pending", "chargeback", "unknown"],
  void_pending: ["voided", "failed", "unknown"],
  voided: [],
  refund_pending: ["partially_refunded", "refunded", "failed", "unknown"],
  partially_refunded: ["refund_pending", "chargeback", "unknown"],
  refunded: ["chargeback"],
  failed: [],
  unknown: ["authorized", "captured", "voided", "partially_refunded", "refunded", "failed", "chargeback"],
  chargeback: [],
};

export const canTransitionVirtualPosPayment = (from: VirtualPosPaymentState, to: VirtualPosPaymentState) =>
  from === to || transitions[from].includes(to);

export const requireVirtualPosTransition = (from: VirtualPosPaymentState, to: VirtualPosPaymentState) => {
  if (!canTransitionVirtualPosPayment(from, to)) throw new Error(`Invalid Virtual POS transition: ${from} -> ${to}`);
};

/** Half-up integer calculation, matching the authoritative Postgres function. */
export const calculateCommissionKurus = (baseKurus: number, rateBps: number) => {
  if (!Number.isSafeInteger(baseKurus) || baseKurus < 0 || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new RangeError("Invalid commission calculation input");
  }
  const result = (BigInt(baseKurus) * BigInt(rateBps) + 5_000n) / 10_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Commission calculation overflow");
  return Number(result);
};

export const calculateProviderIndependentFinancialTerms = (input: {
  subtotalKurus: number;
  discountKurus: number;
  paymentMethod: InternalPaymentMethod;
  hungrieRateBps: number;
  virtualPosRateBps: number;
}) => {
  if (!Number.isSafeInteger(input.subtotalKurus) || input.subtotalKurus < 0 || !Number.isSafeInteger(input.discountKurus) || input.discountKurus < 0) {
    throw new RangeError("Invalid order amount");
  }
  const commissionBaseKurus = Math.max(input.subtotalKurus - input.discountKurus, 0);
  const hungrieCommissionKurus = calculateCommissionKurus(commissionBaseKurus, input.hungrieRateBps);
  const appliedVirtualPosRateBps = input.paymentMethod === "virtual_pos" ? input.virtualPosRateBps : 0;
  const virtualPosCommissionKurus = calculateCommissionKurus(commissionBaseKurus, appliedVirtualPosRateBps);
  const totalCommissionKurus = hungrieCommissionKurus + virtualPosCommissionKurus;
  return {
    commissionBaseKurus,
    hungrieRateBps: input.hungrieRateBps,
    hungrieCommissionKurus,
    virtualPosRateBps: appliedVirtualPosRateBps,
    virtualPosCommissionKurus,
    totalCommissionKurus,
    estimatedRestaurantNetKurus: commissionBaseKurus - totalCommissionKurus,
    financialContractVersion: 1 as const,
  };
};

export type SimulatedOutcomeToken =
  | "SIMULATED_AUTHORIZED"
  | "SIMULATED_DECLINED"
  | "SIMULATED_TIMEOUT_UNKNOWN"
  | "SIMULATED_CAPTURED"
  | "SIMULATED_REFUNDED";

const simulatedCapabilities: VirtualPosCapabilities = {
  hosted_checkout: true,
  three_ds: true,
  preauthorization: true,
  partial_capture: true,
  void: true,
  partial_refund: true,
  signed_webhooks: true,
  marketplace_settlement: false,
};

const opaqueReference = (operationId: string): SanitizedProviderReference => {
  if (!/^[0-9a-f-]{16,64}$/i.test(operationId)) throw new Error("Opaque operation ID required");
  return `sim_${operationId.replaceAll("-", "").slice(0, 24)}` as SanitizedProviderReference;
};

export class SimulatedVirtualPosProvider implements VirtualPosProvider {
  readonly adapterId = "simulated";
  readonly contractVersion = "simulated-v1";
  readonly capabilities = simulatedCapabilities;
  private readonly state = new Map<string, VirtualPosPaymentState>();

  constructor(environment: VirtualPosEnvironment) {
    if (environment === "production" || environment === "staging") {
      throw new Error("Simulated Virtual POS provider is forbidden outside local development and tests");
    }
  }

  private result(input: CreatePaymentSessionInput, success: VirtualPosPaymentState): ProviderMutationResult {
    const reference = opaqueReference(input.operationId);
    const token = input.outcomeToken ?? "SIMULATED_AUTHORIZED";
    if (token === "SIMULATED_TIMEOUT_UNKNOWN") { this.state.set(input.paymentId, "unknown"); return { outcome: "unknown", providerReference: reference, reconciliationRequired: true }; }
    if (token === "SIMULATED_DECLINED") { this.state.set(input.paymentId, "failed"); return { outcome: "declined", providerReference: reference, failureClassification: "simulated_decline" }; }
    const state = token === "SIMULATED_CAPTURED" ? "captured" : token === "SIMULATED_REFUNDED" ? "refunded" : success;
    this.state.set(input.paymentId, state);
    return { outcome: "succeeded", providerReference: reference, state };
  }

  async createPaymentSession(input: CreatePaymentSessionInput) { return this.result(input, "authorized"); }
  async capture(input: CreatePaymentSessionInput) { return this.result(input, "captured"); }
  async voidAuthorization(input: CreatePaymentSessionInput) { return this.result(input, "voided"); }
  async refund(input: CreatePaymentSessionInput) { return this.result(input, "refunded"); }
  async getPaymentStatus(paymentId: string) { return this.state.get(paymentId) ?? "created"; }
  async verifyCallback(input: VerifyProviderEventInput) { return input.verificationMaterial === `SIMULATED_VERIFIED:${input.sanitizedEventReference}`; }
  async verifyWebhook(input: VerifyProviderEventInput) { return this.verifyCallback(input); }
}
