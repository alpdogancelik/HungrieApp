# Customer Review System v2 — Phase 9 Acceptance and Legacy Audit

**Completed:** 2026-09-18
**Scope:** Final v2 acceptance and read-only legacy-usage audit
**Status:** Pass — Customer Review System v2 accepted; legacy removal deferred
**Production:** Not accessed or changed

## Acceptance basis

- Phase 7 qualified the complete implementation against Development with real identities, representative-volume plans, exact fixture cleanup, and the complete database/application gate.
- Phase 8 applied only the two reviewed migrations to Staging, preserved the six historical published product reviews and unrelated test data, qualified hosted authorization/privacy/idempotency/moderation/audit behavior, deployed the Restaurant and Admin Staging previews, reconciled automated fixtures exactly, and received app-owner physical-device acceptance.
- The accepted Order History presentation omits the optional large review banner and retains compact review actions on eligible orders. Authoritative recovery, one-review-per-order enforcement, and server-owned expiry remain unchanged.
- There is no older public Hungrie client. The first public Customer release uses the v2 contract, but Production remains outside this acceptance phase.

## Current-workspace gate

The post-acceptance workspace gate was rerun after the final Order History presentation adjustment:

- Complete JavaScript/repository gate: **265 passed, 0 failed, 0 skipped**.
- Focused v2 repository tests: **6 passed**.
- Customer v2 UI tests: **28 passed**.
- Customer repository/auth tests: **113 passed**.
- Cart/checkout regression tests: **14 passed**.
- Config, domain, and database-types package builds passed.
- Customer, Restaurant, and Admin TypeScript checks passed.
- Customer Expo lint and `git diff --check` passed.
- Reviewed migration SHA-256 values remain:
  - `20260917100000_customer_review_system_v2.sql`: `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b`.
  - `20260917110000_customer_review_system_v2_admin_inspection.sql`: `7358386da677a074fe55d0f26fe57da93f90fb4607b9d3f538995d2610de5c0e`.
- The checked-in generated database-types file SHA-256 is `64844911f893a1c68d23b576c2a021606169f56c02b7469b13838d4d5360b8a6`; Phase 8 already proved semantic `public` schema parity across local, Development-derived, Staging, and checked-in bodies.

No local database reset or hosted probe was repeated in Phase 9 because Phase 8 already recorded the passing post-cleanup database gate and exact hosted reconciliation, and Phase 9 made no schema/application-contract change.

## Repository legacy-usage audit

The audit searched non-test Customer, Restaurant, and Admin sources for v1 review RPC names, legacy review facade imports, legacy score fields, public/product-review projections, and navigation routes. The v2 Customer, Restaurant web, and Admin implementations use their versioned v2 contracts. Legacy removal is nevertheless **not ready** because the following source dependencies remain.

| Area | Finding | Removal consequence |
|---|---|---|
| Legacy mobile Restaurant panel | `mobile/app/restaurantpanel/reviews.tsx` is still reachable from two actions in `mobile/app/restaurantpanel/index.tsx`. It imports `fetchRestaurantOrderReviews` and `moderateOrderReview` from the legacy repository. | Replace or remove this route before retiring `list_restaurant_order_reviews` or `moderate_review`. The replacement must remain anonymous/report-only and must not restore Restaurant visibility authority. |
| Orphaned product-review UI | `mobile/components/MenuCard.tsx` imports `useProductReviews`, which reads and submits legacy product reviews. No source import of `MenuCard` was found outside its own file. | Confirm it is absent from all release bundles, then remove the component/hook chain before retiring product-review RPCs. |
| Legacy repository facade | `mobile/src/data/reviewRepository.ts`, `mobile/src/data/supabase/reviewRepository.ts`, the legacy `ReviewRepository` interface, and legacy domain models still compile and enumerate v1 reads/writes/moderation. | Narrow or delete the facade only after all supported callers are removed. |
| Firebase legacy adapters | The legacy facade still imports Firebase menu-item and order-review services as its alternate adapter. | Remove only after the facade and any migration/support dependency are proven unused. |
| Generated database contracts | Generated types still contain v1 RPC signatures and legacy score fields. | Regenerate only after a separately reviewed database removal migration. |
| Historical Staging data | Six published product reviews remain preserved with their original moderation/reply data. | Do not delete or fabricate conversions. A later migration must explicitly preserve, archive, or deliberately retain these rows. |

Direct runtime-source matches remain for each principal v1 Customer/product/order RPC through `mobile/src/data/supabase/reviewRepository.ts`; `moderate_review` also remains referenced there. The legacy Restaurant mobile route makes absence-of-use impossible to prove from telemetry alone.

## Database and telemetry decision

Development and Staging catalogs, grants, policies, function bodies, rows, aggregates, and compatibility behavior were inspected during Phases 7 and 8. Phase 9 did not access either hosted environment again and did not access Production.

Function-statistics or request-log silence would not override the repository finding: a reachable supported source path is sufficient to block removal, while PostgreSQL function statistics can be disabled or reset and are not durable proof of non-use. Telemetry/log qualification therefore belongs after the identified source callers are removed and a non-production observation window has run.

## Required later legacy-removal sequence

Legacy cleanup requires separate explicit approval and must be split from this v2 acceptance:

1. Replace or remove the mobile Restaurant-panel review route and prove Restaurant users retain report-only authority.
2. Remove the orphaned `MenuCard`/`useProductReviews` chain or document a supported product-review use case that requires retaining it.
3. Narrow the legacy repository interface, adapters, domain types, and tests until repository search shows no supported v1 caller.
4. Deploy those application changes to Development and Staging, then inspect bounded telemetry/logs and database function statistics with their observation start/reset time recorded.
5. Capture exact database dependencies, grants, RLS policies, views, generated types, and historical-row digests.
6. Author a separate additive/forward-fix-oriented removal migration using explicit signatures and dependency order. Do not use `CASCADE` and do not delete historical product reviews implicitly.
7. Re-run complete authorization, privacy, v1-row preservation, v2 metrics, builds, and physical-device gates before considering Production.

Legacy score columns should be removed only after RPC/view removal and historical-data decisions are independently reviewed. Historical product-review deletion is not implied by contract retirement.

## Final acceptance

**Pass.** Customer Review System v2 is accepted through Staging and physical-device qualification. Its public metrics, Customer submission, Restaurant reporting/aggregate analytics, and Admin moderation/audit contracts are the approved first-release behavior. Production was not changed. Legacy v1 contracts, columns, adapters, and historical product reviews remain intentionally in place because the audit found source dependencies; their cleanup requires a separate plan, approval, migration, and qualification cycle.

Known evidence limitation: Phase 8 did not record the EAS build IDs or physical iPhone model/OS, and Phase 9 does not fabricate them.
