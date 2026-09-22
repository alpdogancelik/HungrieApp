# Restaurant Earnings and Admin Commission — Phased Implementation Plan
**Status:** Phase 5 accepted; Production unchanged and not authorized.  
**Scope:** Admin commission configuration, database-owned order financial snapshots, and Restaurant earnings reporting  
**Environments:** Local Development first, then separately approved Development and Staging work  
**Production:** Out of scope until the normal Production expansion and release review  
**Related UI:** `apps/restaurant-ui-mock` Earnings concept
## 1. Objective
Allow an authorized Admin to configure a commission rate for each Restaurant and allow Restaurant owners to view accurate earnings calculated from delivered orders.
The database, rather than either frontend, will select the applicable commission rule and calculate every amount. Each order will retain an immutable snapshot of the commission terms that applied when the order was created. A later Admin rate change will affect only orders created under the new rule and will never silently rewrite historical earnings.
The first release will report financial calculations only. It will not claim that Hungrie paid a Restaurant or that a Restaurant paid Hungrie. The currently supported payment methods are `cash` and `pos`, both collected at the door, so payout, invoice, balance collection, and bank-transfer workflows require a separate settlement contract.
## 2. Fixed product decisions
| Topic | Decision |
|---|---|
| Commission owner | Admin configures the rule; Restaurant users cannot change it |
| Admin permission | Only an active `super_admin` with recent TOTP authentication may create or schedule a commission rule |
| Restaurant permission | Active Restaurant owners may view earnings for their own Restaurant; managers cannot view financial reporting in the first release |
| Rule history | Rules are append-only; an existing rule is never edited or deleted |
| Effective time | Every rule has an explicit UTC `effective_from` timestamp |
| Order rule selection | The applicable rule is selected and snapshotted when the order is created |
| Later rate changes | Affect only orders created at or after the new rule's effective time |
| Eligible orders | Only orders that reach `delivered` contribute to earnings |
| Canceled orders | Contribute zero and do not receive a completed financial result |
| Commission unit | Integer basis points; `100` basis points equals `1.00%` |
| Currency math | Integer kuruş only; floating-point currency calculations are forbidden |
| Initial commission base | `max(subtotal_kurus - discount_kurus, 0)` |
| Excluded amounts | Delivery fee, service fee, and tip are excluded from the initial commission base and Restaurant net calculation |
| Customizations | Included because their prices are already included in `subtotal_kurus` |
| Rounding | Round commission to the nearest kuruş using deterministic database integer arithmetic |
| Historical recalculation | Forbidden during ordinary reads and ordinary rule changes |
| Payout history | Deferred until a real settlement ledger and payment process exist |
| Refunds/chargebacks | Deferred; a future implementation must use append-only financial adjustments rather than rewriting the original snapshot |
| Reporting timezone | Store timestamps in UTC and group display periods using the Restaurant's validated IANA timezone; default existing non-production Restaurants to `Asia/Famagusta` |
| UI languages | Complete Turkish and English copy |
Timezone rationale. Asia/Famagusta is an intentional first-release default because Hungrie's initial Restaurant pilot operates in Northern Cyprus. Timestamps remain stored in UTC, and each Restaurant's reporting periods are grouped using its validated IANA timezone. Do not replace this default with Europe/Istanbul unless the operating market or Restaurant timezone policy changes through a reviewed product decision.
### Calculation contract
For commission rate `rate_bps`:
```text
commission_base_kurus = max(subtotal_kurus - discount_kurus, 0)
commission_kurus      = floor((commission_base_kurus * rate_bps + 5000) / 10000)
restaurant_net_kurus  = commission_base_kurus - commission_kurus
```
Example:
```text
Merchandise subtotal: ₺1,000.00
Discount:             ₺0.00
Commission rate:      8.00% (800 basis points)
Commission:           ₺80.00
Estimated net:        ₺920.00
```
The Restaurant UI must label the result as calculated or estimated net earnings until a settlement system exists. It must not label a calculation as paid, transferred, available for withdrawal, or settled.
The displayed restaurant_net_kurus represents estimated earnings after Hungrie commission under this contract, not final accounting profit, payout balance, or legally settled net income. Until separate contracts exist, the UI must not imply that taxes, VAT, refunds, chargebacks, settlement adjustments, bank fees, or other financial obligations have been included.
If future discounts can be funded separately by Hungrie and by the Restaurant, implementation must stop and add an approved discount-attribution contract before those discounts are included in financial reporting.
## 3. Data model
Add one reviewed additive migration. Final migration names and timestamps are chosen when implementation begins.
### 3.1 Commission rules
Create a private, append-only `restaurant_commission_rules` table containing at least:
- `id uuid primary key`
- `restaurant_id text not null`
- `rate_bps integer not null check (rate_bps between 0 and 10000)`
- `effective_from timestamptz not null`
- `created_at timestamptz not null`
- `created_by_profile_id text not null`
- `reason text not null` with a server-enforced length limit
- `operation_id uuid not null`
Required constraints and behavior:
- Prevent duplicate Admin operations with a unique stable operation ID.
- Prevent ambiguous overlapping rules for the same Restaurant and effective time.
- Preserve all previous rules for audit and historical explanation.
- Reject an effective time that would change the rule for an already-created order.
- Enforce that backdating protection transactionally inside the guarded scheduling RPC. The scheduling operation and concurrent order creation must use an approved locking/serialization strategy so a newly inserted rule cannot race with an order creation and retroactively become the rule for an order that was already created. The RPC must prove that the proposed effective_from cannot alter rule selection for any existing order before committing.
- Permit a scheduled future rule.
- Resolve a rule using the latest `effective_from` that is not later than the order's `created_at`.
- Expose rules only through guarded RPCs; grant no direct client table writes.
### 3.2 Order commission terms
At order creation, persist immutable terms bound to the order:
- `order_id`
- `restaurant_id`
- `commission_rule_id`
- `commission_rate_bps`
- `commission_contract_version`
- `snapshotted_at`
The order-creation transaction must fail closed if the feature is enabled and no applicable commission rule exists. Activation therefore requires every order-accepting Restaurant to have a reviewed initial rule.
Retries must use the existing order idempotency contract. A retry of the same committed order must return the same order and commission terms rather than selecting a newer rule.
commission_contract_version is part of the immutable order contract. Any future change to commission-calculation semantics that can change financial meaning must introduce a new additive contract version. Existing orders and financial snapshots remain interpreted under the version they were created with; a newer version must never retroactively reinterpret or recalculate historical orders.
### 3.3 Delivered-order financial snapshots
Create a private, immutable, one-row-per-order financial snapshot table containing at least:
- `order_id` as the primary key
- `restaurant_id`
- `delivered_at`
- `payment_method`
- `currency_code`, initially `TRY`
- `subtotal_kurus`
- `discount_kurus`
- `commission_base_kurus`
- `commission_rate_bps`
- `commission_kurus`
- `restaurant_net_kurus`
- `commission_rule_id`
- `commission_contract_version`
- `calculated_at`
Create the snapshot in the same authoritative transaction that first changes an order to `delivered`. Concurrent or replayed delivery transitions must produce exactly one identical snapshot. If an existing snapshot disagrees with the expected calculation, fail closed and record an operational error rather than overwriting it.
The delivered financial snapshot must be calculated exclusively from the order's authoritative immutable monetary snapshot/fields established for that order. It must never read current menu prices, current modifier prices, current Restaurant configuration, or any later catalog state to reconstruct historical amounts. Menu or pricing changes after order creation must not change the financial result of that order.
Direct authenticated access to the snapshot table remains denied. Reporting uses guarded, database-owned functions.
### 3.4 Financial adjustments boundary
Do not add refunds, chargebacks, manual corrections, invoices, balances, or payouts to the first release. A future feature must use append-only adjustment and settlement entries that reference the original order snapshot. It must never mutate the original financial snapshot.
If any refund, partial refund, chargeback, manual monetary correction, or equivalent post-delivery adjustment path exists or is introduced before this feature reaches Production, Production activation of Restaurant earnings must stop until an approved append-only financial-adjustment contract is implemented and the earnings reports reconcile those adjustments correctly. Do not knowingly publish materially incomplete earnings as if they were final.
## 4. Guarded database contracts
Exact function names may change during review, but the public contract should provide these capabilities.
### Admin contracts
- `admin_get_restaurant_commission_v1(restaurant_id)`
  - Active Admin may view current and scheduled rules.
  - Response contains no Customer or order PII.
- `admin_schedule_restaurant_commission_v1(restaurant_id, rate_bps, effective_from, reason, operation_id)`
  - Requires active `super_admin` and recent TOTP authentication.
  - Validates rate, Restaurant lifecycle, effective time, reason, and operation ID.
  - Uses canonical request hashing and idempotent replay.
  - Writes a PII-free audit event containing prior rate, new rate, effective time, rule ID, and operation ID.
- `admin_get_restaurant_earnings_summary_v1(restaurant_id, from, to)`
  - Allows authorized support inspection without exposing Customer identity, address, note, or configured item details.
### Restaurant contracts
- `restaurant_get_earnings_summary_v1(from, to)`
  - Derives Restaurant scope exclusively from the authenticated active owner.
  - Returns gross eligible sales, commission, estimated net, delivered-order count, and `cash`/`pos` breakdown.
- `restaurant_get_earnings_series_v1(from, to, bucket)`
  - Returns bounded daily, weekly, or monthly chart points in the Restaurant timezone.
- `restaurant_get_earnings_orders_page_v1(from, to, cursor, limit)`
  - Returns only the Restaurant's delivered-order financial rows.
  - Uses stable keyset pagination.
  - Omits Customer identity, address, telephone, order note, and other unnecessary PII.
All functions must:
- Set a safe `search_path` and use explicit schema qualification.
- Be owned by the approved API owner role.
- Revoke access from `public` and `anon`.
- Grant only the required execute permission to authenticated callers.
- Recheck active account status on every call.
- Reject cross-Restaurant identifiers even if a caller changes request parameters manually.
- Return bounded results and use indexes demonstrated by representative-volume query plans.
## 5. Admin experience
Add commission management to the Admin Restaurant detail page rather than creating a disconnected global control.
The screen will show:
- Current commission percentage and effective date.
- Scheduled next rate, if present.
- Append-only rate history.
- A form for percentage, effective date/time, and required reason.
- A confirmation dialog showing the old rate, new rate, and the exact time new orders begin using it.
- Recent-authentication guidance when TOTP is stale.
- Success, loading, empty, permission, validation, replay, and service-error states.
The UI must explain that changing the rate does not recalculate existing orders. Percentage input is converted to basis points with exact decimal validation; arbitrary floating-point values must not reach the database.
## 6. Restaurant experience
Promote the Earnings concept from `apps/restaurant-ui-mock` into an approved Restaurant route after the database contract passes.
The first production-backed screen includes:
- Daily, weekly, monthly, and bounded custom date ranges.
- Eligible gross sales.
- Commission amount and applied rate explanation.
- Estimated Restaurant net earnings.
- Delivered-order count.
- `cash` and `pos` collection breakdown.
- A trend chart or accessible tabular equivalent.
- Paginated delivered-order financial rows with short order reference, delivery time, payment method, eligible gross, commission, and estimated net.
- Loading, empty, offline, retry, stale-data, and permission states.
The screen excludes payout history, bank details, withdrawal controls, invoices, Customer details, and editable financial values.
On phone, cards and order rows remain one full-width column. Tablet may use expanded cards. Desktop may use summary cards and a denser table. Turkish and English labels must be complete, with proper currency and date formatting.
## 7. Activation and existing data
The application has not been released to Production and has no Production user/order history. This removes the need for a Production historical backfill, but it does not permit silently rewriting Development or Staging fixtures.
Use a disabled-by-default server-owned capability during rollout:
1. Apply the additive schema and guarded read/write contracts locally.
2. Configure an explicit initial commission rule for every test Restaurant.
3. Enforce an activation invariant: every Restaurant with lifecycle_status = active and accepting_orders = true must have exactly one applicable commission rule for new orders before the commission capability can be enabled or order acceptance can be turned on under this contract. The activation/preflight check must fail unless the count of order-accepting Restaurants without an applicable rule is exactly zero.
4. Verify no nonterminal order lacks snapshotted commission terms.
5. Clean or deliberately migrate only tagged non-production fixtures.
6. Enable the capability in Development after approval.
7. Repeat backup, checksum, fixture, and reconciliation gates before Staging activation.
If a future environment contains genuine pre-feature delivered orders, do not fabricate commission history. Display them outside commission totals or label them unavailable until a separately reviewed historical policy exists.
After activation, continuously detect and surface any active/order-accepting Restaurant that lacks an applicable commission rule. This condition must create an operational/Admin alert and must not remain a silent customer-facing order-creation failure. Restaurant onboarding/activation flows should prevent accepting_orders = true while this invariant is unsatisfied.
## 8. Security and privacy requirements
- Only `super_admin` may schedule rates; recent TOTP is mandatory.
- Admin read access follows the existing active Admin guard.
- Restaurant earnings are owner-only in the first release.
- Managers, Customers, anonymous callers, suspended accounts, revoked accounts, wrong-role identities, and other Restaurants fail closed.
- No frontend may submit a calculated commission or net amount as authoritative data.
- No direct client writes to rules, terms, or snapshots are allowed.
- Audit events contain financial rule metadata but no Customer PII.
- Restaurant responses contain only financial fields needed by the screen.
- Rate-change responses and errors must not reveal unrelated Restaurant data.
- Service-role credentials and privileged database connections remain outside every frontend bundle.
## 9. Required tests
### Database and concurrency
- Basis-point validation at minimum, maximum, and invalid boundaries.
- Exact rounding at values immediately below, at, and above half-kuruş boundaries.
- Rule selection immediately before, exactly at, and immediately after `effective_from`.
- Scheduled rate changes affect only newly created orders.
- Backdated rule attempts and concurrent rule-scheduling/order-creation races cannot change rule selection for an already-created order.
- Retry of an existing idempotent order retains its original commission rule.
- Delivered transition creates exactly one snapshot.
- Concurrent delivery transitions cannot create duplicates or disagreeing values.
- Canceled and nonterminal orders never contribute to earnings.
- Discounts reduce the initial base; delivery fee, service fee, and tip do not enter it.
- Delivered financial snapshots use only the order's immutable monetary snapshot and remain unchanged after later menu, modifier, or Restaurant configuration changes.
- Contract-version tests prove that a newer calculation version does not reinterpret or recalculate historical orders.
- Summary, series, payment-method, and paginated-row totals reconcile exactly to snapshots.
- UTC boundaries and `Asia/Famagusta` daily/monthly boundaries are correct, including daylight-saving transitions.
- Representative-volume queries use reviewed indexes.
### Authorization
- Active recent-TOTP `super_admin` can schedule a valid rule.
- Ordinary Admin, stale-TOTP Admin, Restaurant owner/manager, Customer, anonymous, pending, suspended, revoked, and unmapped identities cannot schedule rules.
- Active Restaurant owner can read only that Restaurant's earnings.
- Manager access is denied in the first release.
- Restaurant A cannot read Restaurant B by changing IDs, cursors, dates, or direct RPC requests.
- Direct table reads/writes and forged calculated amounts fail.
### Application
- Admin percentage parsing produces exact basis points.
- Confirmation and audit history show the correct old/new rates and effective time.
- Restaurant totals equal database responses in Turkish and English.
- Phone widths of 360 and 390 px have no clipped values or horizontal overflow.
- Tablet 768 px and desktop 1024/1440 px use their intended layouts.
- Keyboard navigation, visible focus, semantic labels, enlarged text, empty states, and errors pass.
- Frontend tests prove that fixture calculations cannot replace server values in the real route.
- UI copy describes the amount as estimated earnings after Hungrie commission and does not imply final accounting profit, settlement, payout, or inclusion of deferred taxes/refunds/adjustments.
**
Phase 1 test fidelity requirement
Phase 1 is not complete merely because the migration applies and the test suite is green. The tests must explicitly prove every financial boundary, concurrency, idempotency, authorization, and historical-integrity rule defined by this plan.
At minimum, Phase 1 review must confirm:
- Basis-point validation at minimum, maximum, and invalid boundaries.
- Deterministic rounding immediately below, exactly at, and immediately above half-kuruş boundaries.
- Commission-rule selection immediately before, exactly at, and immediately after effective_from.
- Concurrent commission scheduling and order creation cannot backdate or ambiguously select a rule.
- An idempotent order retry preserves the originally snapshotted commission rule even if a newer rule has since become effective.
- Concurrent or replayed delivered transitions create exactly one identical financial snapshot.
- Disagreement with an existing financial snapshot fails closed and never overwrites historical values.
- Financial snapshots derive only from the order's authoritative immutable monetary snapshot and never from current catalog, menu, modifier, or Restaurant configuration values.
- Canceled and nonterminal orders never contribute to earnings.
- Missing applicable commission rules fail closed, and the activation/onboarding guard prevents an order-accepting Restaurant from entering that state.
- Cross-Restaurant, wrong-role, suspended, revoked, stale-TOTP, anonymous, and direct-table access attempts are denied through the real guarded contracts.
- Contract-version evolution never reinterprets or recalculates historical orders or snapshots.
- Representative-volume query plans use the reviewed indexes and do not introduce unintended large sequential scans.
Passing only happy-path tests is insufficient. The Phase 1 evidence must map each specification invariant to one or more concrete automated tests and include the relevant test names and counts in the review record.
## 10. Phased implementation and approval gates
Each phase ends with documented evidence and explicit app-owner approval before the next phase begins.
### Phase 0 — Contract and UI review
- Confirm the fixed product decisions and calculation examples.
- Confirm that Asia/Famagusta is the intentional Northern Cyprus pilot default, the backdating/concurrency rule is transactionally defined, contract-version evolution is additive/non-retroactive, and Restaurant activation cannot proceed without an applicable commission rule.
- Confirm owner-only Restaurant financial access.
- Replace the mock payout history with a non-settlement presentation such as period summaries or delivered-order financial rows.
- Review responsive Admin and Restaurant wireframes in Turkish and English.
**Exit gate:** Product contract and UI accepted; no backend or production application changed.
### Phase 1 — Local database foundation
- Add commission rules, immutable order terms, financial snapshots, indexes, guarded RPCs, grants, and audit events.
- Extend generated database/domain types.
- Add pgTAP, concurrency, idempotency, isolation, rounding, time-boundary, and query-plan tests.
**Exit gate:** Clean local reset, database lint, complete pgTAP suite, concurrency suite, type generation, and security review pass.
### Phase 2 — Admin implementation
- Add current/scheduled/history presentation to the Admin Restaurant detail page.
- Implement exact percentage input, recent-TOTP handling, confirmation, stable operation IDs, replay handling, and safe audit display.
**Exit gate:** Admin unit/type/build checks and the complete role/recent-auth matrix pass locally.
### Phase 3 — Restaurant implementation
- Promote the approved Earnings mock into `apps/restaurant`.
- Add owner-only navigation, repository contracts, summary/series/order rows, bilingual copy, and responsive states.
- Remove payout claims from the approved first release.
**Exit gate:** Restaurant typecheck/export and responsive/accessibility inspection pass at all required widths.
### Phase 4 — Development qualification
- Take a restricted Development backup and record migration/configuration checksums.
- Apply only the reviewed migration.
- Configure tagged test Restaurants and rates.
- Exercise real Admin and Restaurant identities, rate boundaries, rate changes across order creation, delivered/canceled orders, replay, concurrency, authorization, and cleanup.
- Reconcile every displayed aggregate with authoritative snapshots.
**Exit gate:** Development evidence and exact fixture cleanup pass; app owner approves Staging work.
### Phase 5 — Staging qualification
- Back up and preflight Staging.
- Apply checksum-pinned migration and deploy checksum-pinned Admin/Restaurant builds.
- Repeat the authorization and financial-reconciliation matrix with disposable tagged fixtures.
- Verify phone, tablet, Chrome, and Edge behavior and restore the clean baseline.
**Exit gate:** All automated and manual rows pass, cleanup reconciles, and the app owner explicitly accepts the feature. Production remains unchanged.
## 11. Acceptance criteria
- Admin can schedule an explicit Restaurant commission rate with recent TOTP and an audit reason.
- Existing orders never change when a later rate is scheduled.
- Each new order receives exactly one immutable commission-rule snapshot.
- Each delivered order receives exactly one authoritative financial snapshot calculated only from that order's immutable monetary state, never current catalog pricing.
- New commission contract versions never retroactively reinterpret historical orders.
- Every order-accepting Restaurant has an applicable commission rule; missing coverage is blocked by activation guards and surfaced operationally.
- Restaurant earnings totals exactly reconcile to delivered-order snapshots.
- Canceled orders contribute zero.
- Currency calculations use integer kuruş and deterministic rounding.
- Restaurant owners see only their Restaurant; managers and other identities fail closed.
- Admin and Restaurant interfaces work in Turkish and English at phone, tablet, and desktop widths.
- The UI makes no payout or settlement claim.
- Development and Staging qualification, cleanup, and reconciliation pass.
- Production is not changed without the normal separately approved Production phase.
## 12. Deliberately deferred work
- Bank accounts and identity verification for payments.
- Payout initiation, transfer status, and payout history.
- Restaurant invoices and commission collection.
- Refunds, partial refunds, chargebacks, and disputes.
- Hungrie-funded versus Restaurant-funded discount attribution.
- Tax, VAT, withholding, accounting exports, and legal invoices.
- Multiple currencies.
- Tiered, category-specific, item-specific, promotional, or volume-based commission rules.
- Manager financial permissions or custom staff permissions.
- Historical commission reconstruction for orders created before this contract.
Each deferred capability requires its own product, financial, authorization, audit, and migration review.
