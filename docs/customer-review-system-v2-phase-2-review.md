# Customer Review System v2 — Phase 2 Development Qualification Evidence

**Completed:** 2026-09-17

**Result:** Pass

**Authorized environment:** Development only

Phase 2 applied the checksum-pinned review migration to Development, qualified it with real Firebase authentication and disposable hosted fixtures, regenerated the shared public database types, captured representative query plans, removed every probe fixture, and reconciled the original review baseline. Staging and Production were neither read nor mutated. No application behavior, deployment, or EAS build was performed.

## Guarded qualification utility

`scripts/qualify-customer-review-v2-development.mjs` provides independently confirmed `backup`, `preflight`, `apply`, `probe`, `plans`, `types`, and `verify-cleanup` actions. It:

- accepts only migration SHA-256 `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b`;
- resolves the ignored Development registry and rejects a Development reference that overlaps Staging or Production;
- requires an exact Development confirmation for every hosted or mutating action;
- requires the Firebase Admin credential to remain outside the repository;
- suppresses database credentials, tokens, comments, notes, and identity details from output; and
- writes full backup and plan evidence under ignored, owner-only `secure/customer-review-v2-phase2/`.

## Backup, preflight, and migration application

The preflight confirmed an active, healthy PostgreSQL 17 Development project in `eu-central-1`, exactly 45 applied migrations through `20260916130000`, and exactly one pending file: `20260917100000_customer_review_system_v2.sql`. The CLI dry run listed only that migration.

The original Development baseline was empty for both legacy review tables:

| Check | Result |
|---|---:|
| `product_reviews` total/published/hidden | 0 / 0 / 0 |
| `order_reviews` total/published/hidden | 0 / 0 / 0 |
| Duplicate product/order review keys | 0 / 0 |
| Product-review digest | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Order-review digest | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

The owner-only backup manifest is `secure/customer-review-v2-phase2/backup-2026-09-16T23-26-42-173Z/manifest.json`:

| File | Bytes | SHA-256 |
|---|---:|---|
| `schema.sql` | 519,881 | `3be3bf7e5201f8dd1134063d1395bbfc6a5bdeede4a13828ac12fdc8e59cf0d4` |
| `data.sql` | 2,215,216 | `82a214432024e73377f33a113762344578edd15bf743c668d76a59b6d7018c41` |

The manifest and both dumps are mode `0600`; their parent directory is `0700`. Their checksums and freshness were revalidated immediately before application.

Development then reached exactly 46 migrations with `20260917100000` last. Pre/post table totals and protected-row digests were identical. The post-application catalog check found all four new private relations with forced RLS, both anonymous read RPCs, and all five reviewed indexes. Hosted lint of `public`, `private`, and `migration` returned zero error-level findings.

The two previously drifted Development helpers now match the canonical explicit checked-in/Staging projections:

| Function | Hosted definition SHA-256 |
|---|---|
| `list_my_order_reviews` | `f10d31fcce3ad6c3f87ae9873ba60e4a7f4e1813ff65004db15e8548227a9313` |
| `list_my_product_reviews` | `67fd6d41d888eeaeeb6a041989c3a6a90934af1f89a72a6cc5d53f143388290a` |

Neither definition contains a broad `SELECT *` projection.

## Real-identity hosted qualification

Disposable `example.invalid` Firebase identities and real Firebase ID tokens covered active Customer A/B, Restaurant A/B, suspended and revoked Customers, an unmapped identity, and an active email-verified TOTP Admin. The Admin path used a genuine recent-auth MFA token; first-factor-only and stale-auth tokens were tested separately. All Firebase identities were deleted in `finally` cleanup.

| Contract | Qualified result |
|---|---|
| Customer v2 submission | Pass: grouped configured lines, server-owned item snapshots, null legacy fields, and Taste/Speed metrics |
| Canonical replay | Pass: normalized comment plus reactions sorted by menu-item ID returned the same review with `replayed=true` |
| Changed operation reuse | Denied |
| Ownership and status isolation | Cross-Customer, suspended, revoked, unmapped, anonymous, and wrong-role attempts denied |
| Eligibility | Delivered-only behavior and the exact UTC transaction-time boundary passed |
| Customer reads | Own state and newest eligible unreviewed prompt passed |
| v1 compatibility | Value/F/P and historical generated three-score average remained unchanged; repaired list projections omitted drift-only fields |
| Anonymous summary/feed | Overall/Taste/Speed/count only; keyset tie-breaking and page bounds passed; no identity, order, operation, moderation, or reaction fields |
| Restaurant queue/report | Restaurant scope passed; report creation and exact replay passed; duplicate changed operation and cross-Restaurant access denied |
| Restaurant authority | Reporting did not change visibility or metrics; legacy moderation could not alter a v2 review |
| Reaction aggregate | Aggregate-only liked/disliked/percentage passed; no Customer/order/review mapping exposed |
| Admin report transitions | Resolve, reopen, dismiss, and reopen passed; terminal-to-terminal transition denied |
| Admin visibility | Hide removed rating and reaction contributions; restore returned them exactly once |
| Admin authentication | Recent MFA passed; first-factor-only and stale-auth attempts denied |
| Direct access | Anonymous/authenticated direct-table attempts failed closed |
| Audit | Actor/action/target/version/scope/operation/prior/new/report-reason metadata present; no comment or internal note copied |

## Representative-volume query plans

One hosted transaction inserted 5,000 reviews, 5,000 operations, 5,000 reactions, and 1,500 reports across active Restaurants, ran `ANALYZE`, captured `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, and rolled back. The full sanitized JSON is stored owner-only at `secure/customer-review-v2-phase2/development-query-plans.json`.

| Access path | Index used | Large target-table sequential scan | Execution time |
|---|---|---:|---:|
| Customer lookup | `order_reviews_profile_created_idx` | No | 0.032 ms |
| Operation replay | `customer_review_operations_pkey` | No | 0.028 ms |
| Public feed | `order_reviews_published_feed_idx` | No | 0.119 ms |
| Reaction aggregate | `order_review_reactions_restaurant_item_reaction_idx` | No | 2.294 ms |
| Report queue | `order_review_reports_restaurant_status_created_id_idx` | No | 0.081 ms |
| Restaurant review queue | `order_reviews_restaurant_status_created_id_idx` | No | 0.060 ms |

The Customer query correctly selected the existing profile/created access path at this data distribution. The other five plans selected the reviewed v2 constraint/index paths. No plan fixture was committed.

## Generated types

Development and a clean local database produced byte-identical `public` schema type bodies. The hosted output replaced `packages/database-types/src/database.generated.ts`:

- hosted file SHA-256: `8cc753f9d876f5af9c555dbd9993aafad5ea46d58b10947c4fecc7b33d8a4c2a`;
- public schema body SHA-256: `038f65a3723179efc933f46ebab024c8fd199f13464b464a87d32555da2a1d6c`;
- local public-schema parity: exact; and
- generator-envelope parity: not exact because the hosted generator identifies PostgREST 14.5 and emits its newer wrapper/generic formatting. This does not change the compared `public` schema body.

The database-types package build and Customer, Restaurant, and Admin TypeScript checks all passed.

## Cleanup and reconciliation

Final prefix scans returned zero probe rows for profiles, orders, reviews, reports, reactions, and audit events. Product/order review counts, statuses, duplicate counts, and SHA-256 digests exactly matched the preflight baseline. Altered Restaurant flags were restored and all disposable Firebase identities were removed.

The final hosted security catalog check passed:

- all four private relations have forced RLS;
- only the summary/feed pair is executable by both `anon` and `authenticated`;
- all ten Customer/Restaurant/Admin v2 RPCs are authenticated-only;
- private v2 helpers have no `anon` or `authenticated` execution grant; and
- private v2 relations have no direct client select/insert/update/delete grant.

## Final validation

| Check | Result |
|---|---|
| Clean local Supabase reset | Pass; all 46 migrations replayed |
| Local database lint | Pass; zero findings in `public`, `private`, and `migration` |
| Focused v2 pgTAP | Pass; 90 assertions |
| Complete pgTAP suite | Pass; 26 files, 754 assertions |
| Existing courier/Admin-role/invitation concurrency harnesses | Pass |
| Review distinct-operation concurrency harness | Pass; one review, reaction, audit, and metric contribution |
| Hosted database lint | Pass; zero error-level findings |
| Database-types build | Pass |
| Customer, Restaurant, and Admin typechecks | Pass |
| Migration checksum and safety scan | Pass; checksum pinned; no `CASCADE`, destructive drop/truncate, Production reference, broad grant, or fabricated v2 legacy score |
| Qualification utility syntax and output/secret scan | Pass; no credential, token, Firebase identity, comment, or internal note emitted or checked in |
| `git diff --check` | Pass |

## Warnings and forward-fix boundary

- The first probe attempt used a replay payload that accidentally omitted the normalized trailing newline. It correctly received changed-operation rejection; its `finally` block removed all fixtures and cleanup reconciliation passed before the corrected exact-replay probe ran.
- The first plan gate assumed the Customer lookup would use the unique order/profile constraint. PostgreSQL selected the existing, appropriate `order_reviews_profile_created_idx`; the reviewed assertion was corrected to match the captured plan and the complete rolled-back workload was rerun.
- Supabase CLI 2.116.0 reported that 2.117.0 is available. The installed version completed all required gates.
- Development now contains the approved v2 migration. A later defect must use a reviewed forward-fix migration; hosted reset, migration-history editing, or destructive rollback is prohibited.
- No Staging or Production access occurred. No frontend behavior, deployment, EAS build, or device validation belongs to Phase 2.

## Phase 3 authorization boundary

Phase 3 is not authorized. If separately approved, it is limited to shared v2 domain/generated types and repository methods, single-source database-summary consumption, keyset/replay/recovery/cache behavior, repository tests, package builds, and TypeScript checks. It does not authorize Customer UI work, hosted mutation, deployment, or EAS builds.
