# Restaurant Earnings and Admin Commission — Phase 1 Review

**Completed:** 2026-09-22  
**Scope:** Local database foundation only  
**Gate:** Accepted by the app owner on 2026-09-22  
**Migration:** `20260922100000_restaurant_earnings_admin_commission.sql`  
**SHA-256:** `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`

## Environment boundary

Only the local workspace and local Supabase containers were read or changed. Development, Staging, and Production were not contacted, read, migrated, backed up, deployed, or mutated. No commit, push, EAS operation, application deployment, or hosted function operation was performed. `apps/admin-web`, `apps/restaurant`, and `supabase/config.toml` have no Phase 1 diff.

The pre-existing modified `package-lock.json` and untracked `apps/restaurant-ui-mock/` were preserved. Phase 1 did not install dependencies or rewrite the lockfile.

## Implemented contract

The additive migration provides:

- a server-owned `restaurant_earnings_v1` capability, seeded disabled;
- validated `restaurants.reporting_timezone`, defaulted to the approved Northern Cyprus pilot value `Asia/Famagusta`;
- private append-only commission rules with `0..10000` integer basis points, explicit UTC effective time, additive contract version, stable operation ID, canonical request SHA-256, and trimmed 1–500 character reason;
- immutable order commission terms selected by the latest rule with `effective_from <= order.created_at`;
- immutable delivered-order financial snapshots calculated from order fields only;
- private, deduplicated financial-integrity warnings and a five-minute detector that is inert while the capability is disabled;
- Admin read/schedule/support-summary RPCs and owner-scoped Restaurant summary, series, and keyset-page RPCs;
- indexes for rule selection, backdating checks, financial period scans, payment grouping, warnings, and `(delivered_at, order_id)` pagination.

Both local fixture Restaurants have explicit version-1 rules effective on 2026-01-02. The historical fixture order was created and delivered on 2026-01-01, so it intentionally has no fabricated terms or snapshot and remains outside earnings totals. The capability remains disabled after reset.

## Calculation and transaction design

Version 1 uses database integer/numeric arithmetic only:

```text
commission_base_kurus = max(subtotal_kurus - discount_kurus, 0)
commission_kurus      = floor((commission_base_kurus * rate_bps + 5000) / 10000)
restaurant_net_kurus  = commission_base_kurus - commission_kurus
```

The calculation never reads menu items, modifiers, current prices, delivery fees, service fees, tips, or current Restaurant settings. Authoritative order monetary fields become immutable after insertion.

Order insertion and commission scheduling acquire the same transaction-scoped advisory lock derived from the Restaurant ID. Scheduling simulates whether the new rule would outrank the currently selected rule for any existing order and rejects the operation if so. Capability activation and order-acceptance changes share a separate global advisory lock, then acquire Restaurant locks in a stable order, preventing an activation race from creating uncovered accepting Restaurants.

An `AFTER INSERT` order trigger snapshots terms for every order-creation path when a rule applies. Missing rules preserve legacy behavior only while the capability is disabled; enabled creation fails closed. An `AFTER INSERT OR UPDATE OF status` trigger creates a snapshot for every authoritative delivery path. Identical replay is accepted; disagreement emits a PII-free PostgreSQL log reference and aborts without overwriting the existing row. The detector persists any remaining mismatch as an Admin-visible warning on its next run.

Legacy test fixtures that mark an order delivered without `delivered_at` remain possible only while the capability is disabled. Enabled operation rejects that incomplete state.

## API, privacy, and security review

- All five new private relations have forced RLS and no direct `anon`, `authenticated`, or `service_role` privileges.
- Anonymous callers have no execute privilege on any new public commission or earnings RPC.
- All 21 commission/earnings/financial functions use an empty fixed `search_path`; every public RPC is owned by `hungrie_api_owner`.
- Admin reads require an active MFA Admin. Scheduling requires active `super_admin`, TOTP, and `auth_time` within five minutes.
- Restaurant reads call `require_restaurant_owner()` and derive Restaurant scope from canonical account state; no Restaurant identifier is accepted from the client.
- Manager, Customer, anonymous, pending, suspended, revoked, unmapped, wrong-role, stale-TOTP, and cross-Restaurant attempts are denied in the focused suite.
- Responses contain no Customer identity, contact, address, note, configured item, or full order ID. The page exposes only a server-generated short reference and financial fields.
- Scheduling audit metadata is limited to Restaurant ID, old/new basis points, effective time, contract version, rule ID target, and operation ID.

## Automated evidence

| Check | Result |
|---|---|
| Clean local reset through the additive migration and seed | PASS |
| Database lint for `public`, `private`, and `migration` at error level | PASS — zero findings |
| Focused commission/earnings pgTAP | PASS — 91 assertions |
| Complete pgTAP suite | PASS — 30 files, 896 assertions |
| Existing courier, Admin-role, invitation, and incident concurrency suites | PASS |
| New commission/order/delivery concurrency suite | PASS |
| Stable concurrent scheduling replay | PASS — one rule, one audit, one replay |
| Concurrent order versus backdated scheduling | PASS — order retained 800 bps; rule rejected |
| Concurrent delivery | PASS — one snapshot, 200 kuruş commission, delivered state |
| Representative query plans | PASS — summary, series, and page used `delivered_financial_snapshots_restaurant_cursor_idx` across 10,000 rollback-only rows; no snapshot sequential scan |
| Generated public database types | PASS — regenerated from the clean local schema |
| Shared config/domain/database-types builds | PASS |
| Static grants, owner, RLS, capability, seed, cron, and historical-fixture checks | PASS |
| `git diff --check` | PASS |

The complete pgTAP run emits the repository's existing informational `Phase 5 order invalidation skipped` warning; TAP reports all 896 assertions executed and passing.

## Requirement and evidence matrix

| Requirement | Status | Evidence |
|---|---|---|
| Integer kuruş, basis points, deterministic rounding | PASS | Focused below/at/above-half tests plus 0/10000 boundaries |
| Explicit UTC effective time and before/exact/after selection | PASS | Rule-boundary fixtures and terms assertions |
| Append-only, non-retroactive rules | PASS | Immutable triggers, backdating rejection, historical-version assertions |
| Canonical idempotent scheduling | PASS | Changed-input denial plus concurrent one-rule/one-audit replay probe |
| Concurrent scheduling/order protection | PASS | Shared Restaurant advisory lock race probe |
| One immutable terms row per participating order | PASS | Universal insert trigger, immutable-row test, stable order-retry test |
| One authoritative delivered snapshot | PASS | Universal delivery trigger, replay, mismatch, and concurrent-delivery tests |
| Snapshot uses order state only | PASS | Catalog and Restaurant configuration mutation leaves values unchanged |
| Canceled/nonterminal orders excluded | PASS | Focused snapshot and reconciliation assertions |
| Cash/POS summary, series, and page reconcile | PASS | Exact gross/commission/net/count and pagination assertions |
| `Asia/Famagusta` reporting and DST boundaries | PASS | Spring local-midnight and autumn repeated-hour assertions |
| Owner-only Restaurant access | PASS | Owner success and manager/pending/suspended/revoked/unmapped/Customer/anonymous denial |
| Admin and recent-TOTP boundaries | PASS | Admin read, ordinary-Admin scheduling denial, stale-TOTP denial, super-admin success |
| Missing-rule activation invariant | PASS | Capability preflight and order-acceptance/order-creation fail-closed tests |
| Operational warning path | PASS | Five-minute detector, deduplicated warning table, mismatch persistence assertion |
| Direct private access denied | PASS | Privilege assertions and catalog inspection |
| Additive contract-version evolution | PASS | Future version-2 rule leaves version-1 snapshot and amount unchanged |
| Representative-volume index behavior | PASS | 10,000-row rollback-only JSON plan assertions |
| Refunds, payouts, settlements, tax, balance, and adjustment work excluded | PASS | No such schema, RPC, or type was added |
| Development, Staging, and Production untouched | PASS | Local-only commands and changed-file review |
| App-owner Phase 1 acceptance | PASS | Explicitly approved on 2026-09-22 |

## Changed-file inventory

- Additive migration, local seed rules, focused pgTAP, and the new concurrency/query-plan harness.
- Shared generated database types and explicit domain response types.
- Root test registration plus two existing local concurrency cleanup paths updated to remove immutable financial child fixtures under PostgreSQL's local test-only replica mode.
- This review document and the main phased-plan status.

No production application source or route was changed.

## Rollback and forward-fix boundary

Nothing has been deployed. Before any hosted approval, rollback is to omit this unapproved migration from a hosted migration batch. After a future deployment, preserve rules, order terms, snapshots, warnings, and audit history; contain by disabling the server-owned capability and revoking affected RPC execution if required, then use an additive forward-fix migration. Do not delete or rewrite historical financial records to simulate rollback.

## Phase boundary

Phase 1 was accepted by the app owner on 2026-09-22. Phase 2 Admin application work has not started and remains separately gated; this acceptance does not authorize it.
