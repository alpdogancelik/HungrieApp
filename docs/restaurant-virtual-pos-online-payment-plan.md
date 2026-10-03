# Hungrie Restaurant Virtual POS and Online Payment Plan

**Status:** Planned / disabled / not approved for hosted implementation
**Prepared:** 2026-10-03
**Scope:** Provider-neutral Turkish Virtual POS preparation, dual commission accounting, Admin configuration, Restaurant earnings, payment execution, refunds, settlement, and controlled activation

## 1. Objective

Prepare Hungrie to accept online card payments through a Turkish bank Virtual POS or a licensed payment provider after a commercial agreement is signed.

The preparation must:

- Preserve the existing `cash` payment method.
- Preserve the existing `pos` payment method as physical POS payment at delivery.
- Add a distinct `virtual_pos` payment method for online card payments.
- Allow Admin to schedule the Hungrie commission and Virtual POS commission independently.
- Calculate both commissions from the same immutable commission base.
- Display both rates and amounts in Restaurant earnings.
- Keep online payment disabled until provider, legal, accounting, security, and operational activation gates pass.
- Avoid storing or processing raw card data in Hungrie systems.

This document is an implementation plan. It does not authorize a database migration, provider integration, credential creation, payment, refund, deployment, or Production activation.

## 2. Required Calculation Contract

Both commissions are calculated independently from the same base:

```text
commission_base_kurus = max(subtotal_kurus - discount_kurus, 0)

hungrie_commission_kurus =
  floor((commission_base_kurus * hungrie_rate_bps + 5000) / 10000)

virtual_pos_commission_kurus =
  floor((commission_base_kurus * virtual_pos_rate_bps + 5000) / 10000)

total_commission_kurus =
  hungrie_commission_kurus + virtual_pos_commission_kurus

estimated_restaurant_net_kurus =
  commission_base_kurus - total_commission_kurus
```

Example:

```text
Eligible meal value:       ₺500.00
Hungrie commission:          5.00% = ₺25.00
Virtual POS commission:      3.00% = ₺15.00
Total deductions:                    ₺40.00
Estimated Restaurant net:           ₺460.00
```

The Virtual POS commission must not be calculated from the amount remaining after Hungrie commission.

The initial calculation base follows the existing Restaurant earnings contract and excludes delivery fee, service fee, and tip. Before implementation, accounting and the selected provider contract must confirm whether the configured Restaurant deduction and the provider's actual fee use the same base.

## 3. Commercial and Regulatory Decision

Before provider implementation, choose and document one settlement model.

### 3.1 Restaurant-owned Virtual POS

- Each Restaurant contracts with a bank or provider.
- Each Restaurant has separate merchant credentials.
- The provider settles directly with the Restaurant.
- Hungrie commission collection remains a separate financial process.

### 3.2 Marketplace or submerchant provider

- Hungrie integrates with a licensed provider that supports marketplace settlement.
- Restaurants complete submerchant onboarding.
- The provider settles or splits funds according to the reviewed contract.
- This is the preferred model when supported and legally appropriate.

### 3.3 Hungrie as merchant of record

- Hungrie receives the full customer payment and later settles with Restaurants.
- This introduces broader payment-services, tax, invoicing, safeguarding, refund, chargeback, and settlement obligations.
- This model must not be assumed or activated without Turkish legal and accounting approval.

### 3.4 Required decisions

- Merchant of record.
- Seller shown to the customer.
- Invoice issuer.
- Settlement recipient.
- Refund owner.
- Chargeback owner.
- Provider fee and tax owner.
- Restaurant onboarding and identity-verification requirements.
- Whether installment payments will be supported. The first release should be single-payment only.

## 4. Security and PCI Boundary

Use a provider-hosted payment page, provider-hosted fields, or a provider-controlled iframe that satisfies the selected PCI contract.

Hungrie must never receive, store, log, or persist:

- Full card number.
- CVV/CVC.
- Card expiry date.
- 3D Secure password or challenge content.
- Raw hosted-payment form data.
- Provider secret keys in client code.

Provider secrets must remain in server-side environment secrets or an approved secret store. They must never appear in Expo public variables, client bundles, browser logs, analytics, crash reports, test evidence, or source control.

A customer browser redirect is not authoritative payment evidence. Payment success requires a verified provider webhook, server-to-server status query, or both.

## 5. Phase 0 — Provider, Legal, and Accounting Contract

### Work

1. Select the commercial model from Section 3.
2. Compare banks and licensed payment providers.
3. Confirm provider support for:
   - Hosted checkout.
   - 3D Secure.
   - Pre-authorization and capture.
   - Authorization void.
   - Full and partial refund.
   - Signed webhooks.
   - Transaction status lookup.
   - Marketplace/submerchant settlement.
   - Settlement and fee reports.
4. Confirm exact provider fee, tax, fixed-fee, installment, and refund treatment.
5. Confirm consumer disclosures, distance-selling obligations, invoice ownership, and data-retention rules.
6. Obtain sandbox credentials before live credentials.

### Exit gate

- Signed-off payment and settlement ownership.
- Reviewed provider capability matrix.
- Reviewed fee-base and tax contract.
- Approved sandbox qualification plan.

## 6. Phase 1 — Provider-Neutral Domain Contract

### Payment method

Add `virtual_pos` without changing the meaning of historical `pos` orders.

### Provider adapter

Create a server-only interface equivalent to:

```ts
interface VirtualPosProvider {
  createPaymentSession(input: CreatePaymentInput): Promise<PaymentSession>;
  verifyCallback(input: ProviderCallback): Promise<VerifiedCallback>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
  capture(authorizationId: string, amountKurus: number): Promise<CaptureResult>;
  voidAuthorization(authorizationId: string): Promise<VoidResult>;
  refund(paymentId: string, amountKurus: number): Promise<RefundResult>;
  verifyWebhook(request: ProviderWebhookRequest): Promise<VerifiedWebhook>;
}
```

### Capability record

The configured adapter must declare:

```text
supports_hosted_checkout
supports_3ds
supports_preauthorization
supports_partial_capture
supports_void
supports_partial_refund
supports_webhooks
supports_marketplace_settlement
```

### Activation state

```text
unconfigured
sandbox_configured
sandbox_qualified
production_configured
production_qualified
active
suspended
```

### Exit gate

- Provider-neutral types and state transitions reviewed.
- Simulated adapter passes local deterministic tests.
- No customer-visible payment option is enabled.

## 7. Phase 2 — Database Payment State Machine

### 7.1 Payment attempts

Create a private append-only or strictly guarded `payment_attempts` contract with:

- Internal payment ID.
- Checkout ID.
- Customer ID.
- Restaurant ID.
- Provider adapter and contract version.
- Sanitized merchant reference.
- Sanitized provider payment reference.
- Idempotency key.
- Currency.
- Authorized, captured, refunded, and disputed amounts.
- Payment and 3D Secure state.
- Provider verification timestamps.
- Sanitized failure classification.

Suggested states:

```text
created
checkout_pending
three_ds_pending
authorized
capture_pending
captured
void_pending
voided
refund_pending
partially_refunded
refunded
failed
unknown
chargeback
```

`unknown` must be used when a request may have reached the provider but the response was not received. A timeout must never be converted directly into a retry or failure.

### 7.2 Payment events

Create immutable `payment_events` for:

- Session creation.
- 3DS initiation and callback.
- Signed webhook receipt.
- Provider status verification.
- Authorization.
- Capture.
- Void.
- Refund.
- Chargeback.
- Settlement adjustment.

Deduplicate provider callbacks using the provider event/reference identity.

### 7.3 Idempotency

- One checkout intent produces at most one effective payment.
- Duplicate callbacks must return the existing result.
- Duplicate webhooks must not duplicate transitions.
- An uncertain mutation must be reconciled through provider status before retry.

### Exit gate

- All valid and invalid state transitions tested.
- Duplicate and interrupted operations reconcile safely.
- No frontend can directly mark a payment successful.

## 8. Phase 3 — Dual Commission and Financial Snapshots

### 8.1 Existing Hungrie commission

Preserve the existing append-only Restaurant commission rules and immutable order terms.

### 8.2 Virtual POS commission rules

Create private append-only `virtual_pos_commission_rules` containing:

```text
id
restaurant_id
rate_bps
effective_from
provider_contract_version
reason
created_by_admin
created_at
operation_id
```

Rules must provide:

- Restaurant-specific rates.
- Future scheduling.
- No unauthorized backdating.
- No ambiguous overlapping rules.
- Immutable historical records.
- Stable idempotent operation IDs.
- Admin audit events.
- Zero-rate rules where contractually appropriate.

### 8.3 Immutable order financial terms

For every `virtual_pos` order, snapshot:

```text
commission_base_kurus

hungrie_rate_bps
hungrie_commission_kurus
hungrie_rule_id

virtual_pos_rate_bps
virtual_pos_commission_kurus
virtual_pos_rule_id

total_commission_kurus
estimated_restaurant_net_kurus
financial_contract_version
```

For `cash` and physical `pos` orders:

```text
virtual_pos_rate_bps = 0
virtual_pos_commission_kurus = 0
```

### 8.4 Actual provider fee

Keep the configured Virtual POS deduction separate from the provider's actual settlement fee:

```text
configured_virtual_pos_commission_kurus
actual_provider_fee_kurus
provider_tax_kurus
fee_difference_kurus
settlement_reference
settled_at
```

Do not overwrite the original commission snapshot when actual settlement data arrives.

### Exit gate

- Every online order has exactly one Hungrie rule and one Virtual POS rule.
- Integer-kuruş calculations reconcile exactly.
- Historical orders remain unchanged.

## 9. Phase 4 — Admin Commission Management

Add Virtual POS commission management to the existing Restaurant commission detail page.

### Admin display

- Current Hungrie commission rate.
- Current Virtual POS commission rate.
- Scheduled future rates.
- Effective timestamps.
- Provider contract/version.
- Online-payment activation state.
- Audit reason and history.

Example:

```text
Hungrie commission: 5.00%
Virtual POS commission: 3.00%
Applies to: Online card payments
Online payments: Disabled — provider not configured
```

### Admin authorization

Preserve:

- Active super-admin requirement.
- Recent TOTP requirement.
- Explicit audit reason.
- Stable operation ID.
- Idempotent scheduling.
- Server-side rate validation.

### Activation gate

Online payment cannot be enabled unless:

- Provider identity and environment are configured.
- Secrets exist in the approved server-side store.
- Callback and webhook endpoints are verified.
- Sandbox certification passes.
- Refund and void behavior pass.
- Every participating Restaurant has an applicable Virtual POS rule.
- Settlement ownership and accounting treatment are approved.
- Customer-facing disclosures are approved.

### Exit gate

- Admin can safely prepare commission rates while customer payment remains disabled.

## 10. Phase 5 — Restaurant Earnings

Extend Restaurant earnings with:

### Summary metrics

- Eligible gross sales.
- Hungrie commission.
- Virtual POS commission.
- Total deductions.
- Estimated Restaurant net.
- Delivered-order count.

### Payment breakdown

- Cash.
- Physical POS at delivery.
- Online card / Virtual POS.

### Order row

For a delivered online order display:

| Field | Example |
|---|---:|
| Eligible gross | ₺500.00 |
| Hungrie commission | 5.00% / −₺25.00 |
| Virtual POS commission | 3.00% / −₺15.00 |
| Total deductions | −₺40.00 |
| Estimated net | ₺460.00 |

For cash and physical POS, display no Virtual POS deduction.

Before settlement integration, the UI must use labels such as:

- Estimated Virtual POS commission.
- Estimated Restaurant net.
- Provider fee not yet reconciled.

It must not describe calculated values as paid, settled, transferred, withdrawable, or final accounting profit.

### Exit gate

- Summary, graph, payment breakdown, pagination, and individual rows reconcile exactly.

## 11. Phase 6 — Customer Checkout and Order Orchestration

### Recommended flow

1. Customer selects `Online card`.
2. Server validates Restaurant state, menu prices, discount, fees, currency, and current financial rules.
3. Server creates an expiring immutable checkout quote.
4. Server creates a provider payment session with an idempotency reference.
5. Customer completes provider-hosted 3D Secure.
6. Server verifies the provider callback/webhook and payment status.
7. Server atomically creates or activates the Restaurant order after authoritative payment verification.
8. Realtime and push notifications are emitted once.
9. The client safely resumes status polling after browser/app interruption.

The server must ignore customer-supplied payment success, price, commission, Restaurant, and settlement values.

### Authorization strategy

Preferred when supported:

- Pre-authorize at checkout.
- Capture when the Restaurant accepts.
- Void when the Restaurant rejects or the response deadline expires.

Fallback:

- Charge after successful 3DS.
- Refund automatically after rejection or timeout.
- Keep the payment unresolved until the provider independently confirms the refund.

### Exit gate

- Closing the app, duplicate callbacks, delayed webhooks, or network interruption cannot create duplicate charges or orders.

## 12. Phase 7 — Refunds, Chargebacks, and Adjustments

Create append-only adjustments for:

- Full refund.
- Partial refund.
- Authorization void.
- Chargeback.
- Chargeback reversal.
- Provider fee correction.
- Settlement correction.
- Reviewed manual accounting adjustment.

Each adjustment must define the treatment of:

- Eligible gross.
- Hungrie commission.
- Virtual POS commission.
- Restaurant net.
- Provider fee and tax.

Never rewrite the original order financial snapshot.

### Reconciliation checks

Detect:

- Authorization never captured or voided.
- Capture without an order.
- Paid order without verified capture.
- Refund stuck or uncertain.
- Webhook and provider-status disagreement.
- Duplicate provider reference.
- Settlement mismatch.
- Commission-rule mismatch.
- Chargeback missing from earnings.

### Exit gate

- Payment, order, refund, commission, adjustment, and settlement records reconcile without direct database edits.

## 13. Phase 8 — Provider Adapter

After signing an agreement:

1. Freeze the provider API and documentation version.
2. Implement exactly one adapter first.
3. Store credentials only in server-side secrets.
4. Separate Development, Staging, and Production merchant identities.
5. Register HTTPS callback and webhook URLs.
6. Implement signature and response verification.
7. Implement status lookup.
8. Implement preauth/capture or sale/refund behavior.
9. Add bounded timeouts and reconciliation; do not blindly retry mutations.
10. Complete provider certification and sandbox test cases.

### Exit gate

- Provider sandbox certification passes with sanitized evidence.

## 14. Phase 9 — Staging Qualification

Test at minimum:

- Successful 3DS transaction.
- Customer cancels 3DS.
- Failed or invalid 3DS verification.
- Insufficient funds.
- Timeout before provider response.
- Successful provider mutation with lost client response.
- Duplicate callback and webhook.
- Restaurant acceptance and capture.
- Restaurant rejection and void/refund.
- Response deadline expiration.
- Capture failure after authorization.
- Full refund.
- Partial refund where supported.
- Invalid webhook signature.
- Wrong currency or amount.
- Cross-Restaurant access attempt.
- Concurrent commission scheduling and order creation.
- Boundary rates and deterministic rounding.
- ₺500.00 at 5% plus 3% produces ₺25.00 plus ₺15.00.
- Earnings and settlement reconciliation.
- Absence of card data and secrets in logs, storage, analytics, evidence, and crash reports.

### Exit gate

- Every mandatory security, payment, refund, reporting, reconciliation, and cleanup scenario passes.

## 15. Phase 10 — Controlled Production Activation

1. Deploy schema and provider code with online payment disabled.
2. Verify the Production provider and merchant identity.
3. Verify webhook and callback configuration.
4. Configure reviewed commission rules.
5. Enable one internal or pilot Restaurant.
6. Execute one approved low-value real payment and refund.
7. Reconcile the provider settlement.
8. Run a bounded pilot observation period.
9. Expand only after reviewed evidence passes.

### Emergency controls

Provide independent controls to disable:

- New online payment sessions.
- A provider adapter.
- A Restaurant's online-payment participation.
- Capture operations where safe.

Refund handling must remain available under a separate reviewed safety policy when new payments are disabled.

Cash and physical POS ordering should remain available when the online provider is unavailable.

## 16. Work That Can Be Completed Before a Bank Agreement

- Provider-neutral payment types.
- Disabled feature flags.
- Payment state machine.
- Dual commission rules and immutable snapshots.
- Admin Virtual POS commission UI.
- Restaurant earnings UI.
- Simulated provider adapter.
- Webhook verification framework.
- Refund and reconciliation models.
- Deterministic local tests.
- Provider capability matrix.
- Activation and safety gates.

## 17. Work That Requires the Actual Agreement

- Live merchant or submerchant identity.
- Provider credentials.
- Provider-specific request signatures.
- Exact fee, tax, and installment rules.
- Settlement ownership and timing.
- Production callback registration.
- Provider certification.
- Live payment/refund tests.
- Production activation.

## 18. Mandatory Invariants

- `pos` continues to mean physical POS at delivery.
- `virtual_pos` is a separate payment method.
- Both configured commissions use the same immutable base.
- Commission terms are selected and snapshotted server-side.
- Frontends never submit authoritative financial calculations.
- Historical financial records are never retroactively recalculated.
- Browser redirects never independently establish payment success.
- Provider mutations are idempotent and uncertain results are reconciled before retry.
- Card data and provider secrets never enter Hungrie client code or evidence.
- Online payment remains disabled until every activation gate passes.
- Production activation requires separate explicit approval.

## 19. Official References

- [TCMB — Payment Services](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Temel%2BFaaliyetler/Odeme%2BHizmetleri)
- [TCMB — Guidance on payment-service business models](https://tcmb1.tcmb.gov.tr/wps/wcm/connect/5b814310-a57b-4e64-82fe-76e520d0e0b1/%C3%96demeler%2BAlan%C4%B1nda%2BSunulan%2B%C4%B0%C5%9F%2BModellerine%2B%C4%B0li%C5%9Fkin%2BRehber.pdf?MOD=AJPERES)
- [TCMB — Licensed electronic-money institutions](https://tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Temel%2BFaaliyetler/Odeme%2BHizmetleri/Elektronik%2BPara%2BKuruluslari)
- [Garanti BBVA — Virtual POS 3D Secure contract example](https://dev.garantibbva.com.tr/sanalpos-satis-vadeli-3dli)
- [iyzico — Webhook signature verification](https://docs.iyzico.com/en/advanced/webhook)
- [iyzico — 3DS implementation](https://docs.iyzico.com/en/payment-methods/api/3ds/3ds-implementation)
- [PCI SSC — Hosted payment-page and SAQ A guidance](https://www.pcisecuritystandards.org/faqs/1438/)
- [Turkish Ministry of Trade — Distance-contract information](https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme)
