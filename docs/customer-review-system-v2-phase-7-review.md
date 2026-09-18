# Customer Review System v2 — Phase 7 Review Evidence

**Completed:** 2026-09-18
**Scope:** Development migration and full Development qualification only
**Development gate:** Pass
**Staging / Production / deployments / EAS:** Not accessed or run

## Changes qualified

- Added `scripts/qualify-customer-review-v2-phase7-development.mjs`, a separate checksum-pinned utility with `backup`, `preflight`, `apply`, `types`, `probe`, `plans`, and `verify-cleanup` actions. The Phase 2 utility remains unchanged.
- Every action rejects non-isolated environment metadata, requires the reviewed migration SHA-256 and an action-specific exact Development confirmation, suppresses sensitive hosted output, and uses only the `crv2p7_` disposable fixture prefix.
- Applied only `20260917110000_customer_review_system_v2_admin_inspection.sql` to Development. Development now has 47 migrations through `20260917110000`; Staging and Production remain untouched.

## Backup, preflight, and migration evidence

- Preflight confirmed healthy PostgreSQL 17 in `eu-central-1`, 46 applied migrations through `20260917100000`, only `20260917110000` pending, and zero product reviews, order reviews, reports, reactions, Customer operations, action operations, or duplicate review keys.
- Empty-table SHA-256 digests were `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` for product reviews, order reviews, reports, and reactions.
- The CLI dry-run listed only the reviewed forward-fix.
- Restricted backup manifest: `secure/customer-review-v2-phase7/backup-2026-09-17T22-14-39-702Z/manifest.json` (ignored, owner-only).
  - `schema.sql`: 567,662 bytes; SHA-256 `c986f81c9dbd8f5dc5c117d5f496c2458e79ce8ec9c3a9c627845618219bc459`.
  - `data.sql`: 2,216,408 bytes; SHA-256 `a332e0a7b95ee041c92d89aa0bc5dcfb1dc7c38b822ed84dca775b4ed7ea0b45`.
- Post-application counts and protected digests were unchanged. The report-list and audit functions are owned by `hungrie_api_owner`; execute is authenticated-only; anonymous execute and direct private-object access remain denied.
- Hosted database lint returned `results: []` for `public`, `private`, and `migration` at error level.

## Checksums and generated-type parity

- Base migration: `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b`.
- Admin-inspection migration: `7358386da677a074fe55d0f26fe57da93f90fb4607b9d3f538995d2610de5c0e`.
- Checked-in generated database types: `64844911f893a1c68d23b576c2a021606169f56c02b7469b13838d4d5360b8a6`.
- Hosted, clean-local, and checked-in `public` schema bodies matched exactly at SHA-256 `5ac96a3fc66849047e1ff8bc85f5e2419f347e4626b0d1ca4aaa1cf9b01d3924`. Generator-envelope differences did not create tracked-file churn.

## Real-identity Development journey

- Disposable `example.invalid` Firebase identities covered active Customer A/B, Restaurant A/B, suspended and revoked Customers, an unmapped identity, and an email-verified TOTP Admin. All identities were deleted in `finally`.
- Customer submission proved normalized NFC comment storage, lexically canonical reaction replay, unchanged-operation replay, changed-operation rejection, one review per order, grouped duplicate configured lines, server-owned names and quantities, skipped reactions, and independent feedback for the same base meal in another delivered order.
- Authoritative Customer state restored Reviewed before another action. Cross-Customer, expired, anonymous, wrong-role, suspended, revoked, unmapped, and direct-table attempts failed closed.
- A separate v1 review retained Value, F/P, the historical three-score generated average, and contract version 1. The v2 review retained null legacy fields and contract version 2; no Value/F/P value was fabricated.
- Anonymous summary/feed results used database-owned Taste/Speed metrics, preserved deterministic keyset ties, and contained no Customer identity, order/operation data, or per-review reactions.
- Restaurant queues were tenant-scoped and anonymous. Approved reporting, exact replay, changed/duplicate rejection, invalid reason, 501-character note, control-character rejection, cross-Restaurant denial, and aggregate-only meal feedback passed. Reporting did not alter visibility or metrics.
- Admin inspection returned accurate v1/v2 contract versions without Customer or order PII. Legal resolve/dismiss/reopen transitions passed; direct terminal-to-terminal transition failed. First-factor-only and stale-auth visibility mutations failed, while a genuine recent-auth TOTP token could hide and restore.
- Hide removed one rating/count contribution and its reactions; restore returned them exactly once.
- `admin_list_order_review_audit_v2` returned only report, report-status, and visibility actions; equal-timestamp keyset pagination used the ID tie-breaker. Entries contained the required actor/action/target/contract/Restaurant/operation/state/reason context and omitted submission events, Customer identity, order PII, comments, internal/resolution notes, and reaction rows. Anonymous and Restaurant callers were denied.

## Representative query plans

- A single rolled-back transaction created 5,000 reviews, 5,000 reactions, 5,000 operations, 1,500 reports, and 5,000 audit events, then ran `ANALYZE` and `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
- All reviewed paths used their intended indexes with no sequential scan on the large target relation:
  - public feed: `order_reviews_published_feed_idx`;
  - Customer lookup: `order_reviews_profile_created_idx`;
  - Restaurant queue: `order_reviews_restaurant_status_created_id_idx`;
  - report queue: `order_review_reports_restaurant_status_created_id_idx`;
  - replay lookup: `customer_review_operations_pkey`;
  - reaction aggregate: `order_review_reactions_restaurant_item_reaction_idx`;
  - report-scoped audit: `audit_log_target_created_idx`.
- Sanitized plan JSON is retained under ignored `secure/customer-review-v2-phase7/development-query-plans.json`.

## Cleanup reconciliation

- Final Development history is 47 migrations through `20260917110000`.
- Zero `crv2p7_` profiles, orders, reviews, reports, reactions, or audit records remain.
- Product-review, order-review, report, reaction, and operation totals and protected digests exactly match the preflight baseline.
- No disposable Firebase identity remains. No Restaurant lifecycle flag was changed.

## Complete post-cleanup gate

- Clean local reset: pass through 47 migrations.
- Local and hosted database lint: clean.
- Focused v2 pgTAP: **103/103 passed**.
- Complete pgTAP: **767/767 across 26 files passed**, zero failed or skipped assertions. The unchanged milestone-9 SQL warning about Phase 5 order invalidation remains non-TAP and its file passes.
- Courier, Admin-role, invitation, and Customer-review concurrency harnesses: pass; the review race produced one review, one reaction, and one metric contribution.
- Focused Restaurant/Admin repository suite: **6/6 passed**.
- Customer/public review UI suite: **28/28 passed**.
- Complete JavaScript/repository gate: **265/265 passed**, zero failures or skips, including cart/order and notification regressions.
- Config, domain, and database-types builds: pass.
- Customer, Restaurant, and Admin TypeScript checks: pass. Customer Expo lint: pass.
- Fresh Customer web export: 47 routes. Fresh Restaurant web export: 18 routes. Admin optimized production build: pass.
- Migration safety, grants, privacy, credential, legacy-source, output-secret, checksum, and `git diff --check` scans: pass. Preserved v1/product-review references remain only in compatibility repositories and historical contracts.

## Warnings and forward-fix guidance

- The first post-apply lint command used an invalid Supabase CLI flag combination (`--project-ref` without `--linked`). Migration application and reconciliation had already succeeded. The utility was corrected, and the explicitly linked Development lint then returned no findings.
- Two older external service-account keys lacked Firebase Authentication administration permission and failed before creating fixtures. A currently authorized external project credential completed the journey; no credential was copied into the repository or evidence.
- An initial aggregate assertion expected two-decimal presentation, while the authoritative RPC intentionally returns one decimal (`33.3`). The assertion was corrected without changing application or database behavior.
- An initial plan detector produced a text-order false positive: the audit index scan plan also contained a one-row report-ID lookup. The detector now examines JSON nodes by relation; the 5,000-row `audit_log` access is an index scan.
- The hosted migration is additive and must remain in Development history. Any later defect requires a reviewed additive forward fix; never reset hosted Development, edit migration history, or overwrite preserved data. The restricted backup is available only for an unrecoverable migration/data incident.

## Phase 8 boundary

Phase 8 remains unauthorized. Its exact scope is read-only Staging reconciliation, a restricted Staging backup, checksum-pinned dry-run and application of both reviewed v2 migrations as applicable, post-apply grants/functions/policies/count/metric checks, non-Production Customer/Restaurant/Admin preview deployment, and the complete physical iPhone/Android qualification matrix. Production and EAS builds remain outside scope unless separately authorized.
