# Customer Review System v2 — Phase 8 Review Evidence

**Started:** 2026-09-18
**Scope:** Staging deployment and physical-device qualification only
**Status:** Complete — passed and accepted by the app owner on 2026-09-18
**At Phase 8 completion:** Production was untouched; Phase 9 had not yet been authorized

## Guarded rollout utility

- Added `scripts/qualify-customer-review-v2-phase8-staging.mjs` with checksum-pinned `backup`, `preflight`, `apply`, `types`, `probe`, `plans`, `prepare-device-fixtures`, `cleanup-device-fixtures`, and `verify-cleanup` actions.
- Every hosted action resolves the isolated Staging registry entry, rejects Development/Production overlap, requires an action-specific exact confirmation, redacts sensitive output, and confines fixtures to `crv2p8_` or `crv2p8_device_` prefixes.
- Backups, plans, generated types, build/device credentials, and manifests are owner-only beneath ignored `secure/customer-review-v2-phase8/`.

## Backup, preflight, and migration

- Preflight confirmed healthy PostgreSQL 17 in `eu-central-1`, 45 migrations through `20260916130000`, and exactly the two reviewed migrations pending.
- Preserved unrelated baseline: 43 profiles, 11 Restaurants, and 30 orders.
- Review baseline: six published product reviews, zero hidden product reviews, zero order reviews, reports, reactions, operations, or duplicate review keys.
- Product-review digest: `6fc2f33238c212d4ec988bd8aa442dbc3aa642f1085ba976fd13990a8ccd3933`. Empty order/report/reaction digest: `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
- Restricted backup manifest: `secure/customer-review-v2-phase8/backup-2026-09-17T22-36-56-016Z/manifest.json`.
  - `schema.sql`: 520,317 bytes; SHA-256 `867d8beedb4d5bad1360b68ffc6737d08da641b32f07b70710f6d66b064f92fd`.
  - `data.sql`: 512,292 bytes; SHA-256 `87e23059f00d44252dcc6fffc53578ca9f2d2829b3f0cceaeb556debfb821453`.
- Applied in one batch:
  - `20260917100000_customer_review_system_v2.sql` — `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b`.
  - `20260917110000_customer_review_system_v2_admin_inspection.sql` — `7358386da677a074fe55d0f26fe57da93f90fb4607b9d3f538995d2610de5c0e`.
- Staging now has 47 migrations through `20260917110000`. Historical rows/statuses/digests remained unchanged; authenticated-only Admin inspection, owner-only helpers, and hosted database lint passed.

## Type parity and hosted journey

- Staging, clean-local, and checked-in `public` generated-type bodies match at SHA-256 `5ac96a3fc66849047e1ff8bc85f5e2419f347e4626b0d1ca4aaa1cf9b01d3924`. Generator-envelope differences caused no tracked-file churn.
- Disposable real Firebase identities qualified active Customer submission, NFC canonicalization, mixed/skipped reactions, grouped configured lines, exact replay, changed-operation denial, authoritative recovery, repeated-meal independence, prompt selection, and server-owned UTC expiry.
- Public summary/feed consistency, keyset ties, privacy, v1 compatibility, and absence of legacy v2 fallback passed.
- Restaurant tenancy, report validation/replay/duplicate denial, unchanged visibility/metrics, and aggregate-only reactions passed.
- Accurate v1/v2 Admin inspection, legal/illegal transitions, genuine recent-TOTP hide/restore, first-factor/stale-auth denial, safe audit filtering/pagination, and exact aggregate removal/restoration passed.
- Anonymous, cross-tenant, suspended, revoked, unmapped, wrong-role, and direct-table attempts failed closed.
- All automated identities and database fixtures were deleted in `finally`; Firebase enumeration found none. Post-probe cleanup exactly reconciled the original baseline.

## Representative query plans

A rolled-back 5,000-review / 5,000-reaction / 5,000-operation / 1,500-report / 5,000-audit workload used all seven reviewed indexes without a large target-table sequential scan: public feed, Customer lookup, Restaurant queue, report queue, report audit, operation replay, and reaction aggregate. Sanitized evidence is retained at `secure/customer-review-v2-phase8/staging-query-plans.json`.

## Local and preview gates

- Pre-mutation clean local reset, local lint, 103 focused v2 pgTAP assertions, 767 complete pgTAP assertions, all concurrency harnesses, focused review suites, and the 265-test JavaScript/repository gate passed with zero failures or skips.
- Config/domain/database-types builds, all three application typechecks, Customer lint, fresh Customer/Restaurant exports, and Admin production build passed.
- Customer metadata advanced to marketing `1.0.2`, iOS build `39`, and Android version code `38` without starting an EAS build.
- Customer EAS Preview environment matches the restricted Staging environment exactly.
- Restaurant Staging alias deployed: `https://hungrie-restaurant--staging.expo.app` (deployment `https://hungrie-restaurant--cq01ezrs8n.expo.app`).
- Admin Staging portal deployed from Vercel project `hungrie-admin-web-phase1`: alias `https://hungrie-admin-web-phase1.vercel.app`, immutable deployment `https://hungrie-admin-web-phase1-i5akck4zo-nurlan-ildirimli-s-projects.vercel.app`.
- Live Restaurant `/reviews` and Admin `/reviews` responses returned private/no-store caching, CSP, HSTS, and nosniff headers. Admin additionally returned `X-Frame-Options: DENY`; its anonymous HTML contained no review data or private identifiers, and the route remains behind the application `AuthGate`.
- No Firebase Function deployment was performed because Phase 8 contains no function change.

## Physical-device acceptance and final reconciliation

- On 2026-09-18, the app owner reported that the complete Phase 8 experience works correctly and accepted every applicable row in `customer-review-system-v2-phase-8-device-checklist.md` on a physical iPhone and Google Pixel 9 / Android 17.
- The accepted Customer presentation includes the later removal of the large Order History review banner. Eligible orders retain their compact order-level Review action, and authoritative review recovery remains intact.
- The repository record does not contain the EAS build IDs or the physical iPhone model/OS. These identifiers are documented as not recorded; no values were inferred or fabricated.
- The guarded automated journey deleted all of its database and Firebase fixtures in `finally`, Firebase enumeration found no matching identities, and the six-product-review/zero-order-review baseline reconciled exactly. No guarded device-fixture manifest was recorded as created.
- The completed local gates, hosted Staging qualification, live Restaurant/Admin preview checks, physical-device attestation, and app-owner acceptance satisfy the Phase 8 gate. Production remained untouched; Phase 9 still required separate authorization at this checkpoint.

## Gate result

**Pass.** Staging has 47 checksum-pinned migrations; pre-existing review data and unrelated test data were preserved; hosted authorization, privacy, idempotency, moderation, audit, aggregate, type-parity, and query-plan checks passed; Restaurant and Admin Staging previews passed live security/configuration checks; both physical-device matrices were accepted by the app owner; and automated fixtures reconciled to the locked baseline. Build IDs and the physical iPhone model/OS were not supplied for the evidence record. Phase 9 required separate explicit approval and was subsequently authorized as recorded in the main plan.

## Forward-fix guidance

The two additive migrations remain in Staging history. A later defect requires a reviewed additive forward fix; never reset hosted Staging or edit migration history. On privacy or authorization failure, disable the affected preview route/grant, preserve sanitized evidence, clean disposable fixtures, and rerun the isolation suite. The restricted backup is reserved for an unrecoverable migration/data incident.
