# Customer Review System v2 — Phase 1 Review Evidence

**Completed:** 2026-09-17
**Scope:** Local migration design and qualification only
**Gate:** Pass
**Migration:** `20260917100000_customer_review_system_v2.sql`
**SHA-256:** `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b`

## Boundary confirmation

Phase 1 changed only the local migration, local database tests/concurrency tooling, and review documentation. No hosted database was contacted or changed. Development, Staging, and Production were not migrated, probed, backed up, or mutated. No application source, generated database type, deployment, build, or EAS operation was run.

## Implemented contract

The additive migration:

- adds `order_reviews.contract_version SMALLINT NOT NULL DEFAULT 1`;
- relaxes only `value_rating` and `user_name_snapshot` catalog nullability, then enforces the versioned row shape with `order_reviews_contract_version_fields_check`;
- retains the stored legacy three-score `average_rating` expression unchanged, so v1 rows retain their historical value and v2 rows naturally have `NULL` there;
- creates the independent live v2 metric projection using `(taste_rating + speed_rating) / 2` for published rows only;
- creates forced-RLS private relations for reactions, Customer submission operations, Restaurant reports, and Restaurant/Admin action operations;
- creates Customer submit/state/prompt RPCs, anonymous summary/feed RPCs, Restaurant anonymous queue/report/aggregate RPCs, and Admin report/visibility/aggregate RPCs;
- caps public/Restaurant/Admin pages at 50 and uses opaque keyset cursors, with `(created_at DESC, id DESC)` for review/report feeds;
- canonicalizes submission hashes from the NFC-normalized trimmed comment and reactions lexically sorted by base menu-item ID;
- validates exact reaction object keys, distinct nonblank IDs, `liked|disliked`, authoritative order membership through `coalesce(menu_item_id, source_menu_item_id)`, and a 100-item maximum;
- derives Restaurant/item names and grouped quantities from server-owned order data and never trusts client labels;
- uses `transaction_timestamp() < delivered_at + interval '30 days'` exactly, with the equality boundary rejected;
- writes review, reaction, operation, and sanitized audit records atomically;
- restores the two Development-drifted Customer list helpers to the checked-in/Staging explicit projections. Their qualified local definition hashes are `67fd6d41d888eeaeeb6a041989c3a6a90934af1f89a72a6cc5d53f143388290a` for `list_my_product_reviews` and `f10d31fcce3ad6c3f87ae9873ba60e4a7f4e1813ff65004db15e8548227a9313` for `list_my_order_reviews`.

Legacy moderation signatures remain callable for historical v1 rows. Both legacy order-review moderation paths now require `contract_version = 1`, so neither can hide or restore a v2 row. A v2 Restaurant may report but cannot change visibility; only the recent-auth Admin v2 action can hide or restore v2 reviews.

## Compatibility and reconciliation

The migration creates a temporary pre-change count/digest covering every legacy score, generated average, comment, snapshot, status, and timestamp. It recomputes the same digest after the catalog alteration and aborts if either count or digest changes.

A populated legacy rehearsal reset the local database through `20260916130000`, loaded the checked-in seed, and applied the Phase 1 migration in one transaction. Result:

```text
before=1|f04a48cb22a2fc67857622fd5cec6f37f4e05798f3928c49126c3427f29bfc82
after =1|f04a48cb22a2fc67857622fd5cec6f37f4e05798f3928c49126c3427f29bfc82|1|1
```

The one legacy row remained byte-equivalent across all protected fields and was marked contract version 1. pgTAP separately proves its Value/name fields remain populated and its generated average remains `4.67`. New v2 fixtures prove Value, F/P, Customer-name snapshot, and the legacy generated average are all `NULL`; no legacy score is fabricated.

## Security and privacy evidence

- All four new private relations have RLS enabled and forced, with access limited to `hungrie_api_owner`; `anon`, `authenticated`, and `service_role` have no direct relation privileges.
- Anonymous execute is granted only to the v2 summary and published-feed RPCs. Customer, Restaurant, and Admin entry points are granted only to `authenticated`, with role/status/scope guards inside owner-executed functions. Private helpers have no client execute grant.
- Direct authenticated review inserts remain denied.
- Public cards, Restaurant queues, and Admin inspection omit Customer identity and order IDs. The safe-item projection strips historical price/customization fields before public, Restaurant, or Admin output.
- Restaurant reaction reads expose only per-menu-item counts and percentages; no Customer/order/review mapping is returned.
- Restaurant reports do not alter visibility or metrics. Admin hide/restore requires active MFA Admin authorization plus authentication no older than five minutes.
- Report and moderation audits include actor (through the audit row), target, contract version, Restaurant scope, operation ID, prior/new state, and report reason where applicable. Tests prove audit metadata contains no Customer comment, internal note, or resolution note.
- Exact replay returns the original review/result. Reusing an operation UUID with different canonical input fails. Customer-operation and Customer/order serialization plus final unique constraints prevent concurrent duplicates.

## Index rationale

- `order_reviews_restaurant_status_created_id_idx` replaces the cursor-incomplete legacy Restaurant/status index and supports scoped status queues with deterministic keyset order.
- `order_reviews_published_feed_idx` is a smaller partial index for the anonymous published-only feed; it omits the constant status key and is not equivalent to the all-status queue index.
- Existing `order_reviews_order_id_profile_id_key` serves Customer/order lookup; no duplicate lookup index was added.
- The Customer-operation and action-operation primary keys serve replay lookup; no duplicate operation indexes were added.
- The Restaurant/review report unique constraint prevents repeat reports. Separate Restaurant/status and global status keyset indexes support Restaurant and Admin queues respectively.
- Reaction primary/unique constraints enforce review/item and Customer/order/item uniqueness. The `(restaurant_id, menu_item_id, reaction)` index supports aggregate grouping and filtering.
- The composite review scope unique constraint is required by the composite reaction foreign key; it is an integrity index rather than an alternate query index.

Representative hosted-volume `EXPLAIN ANALYZE` qualification remains intentionally assigned to Phase 2. Phase 1 verifies exact index presence and predicate/order alignment locally.

## Validation results

| Check | Result |
|---|---|
| Clean local reset through all 46 migrations and seed | Pass |
| Populated pre-v2 migration rehearsal and digest reconciliation | Pass; `1` row, identical digest, version `1` |
| Database lint (`public`, `private`, `migration`, error level) | Pass; zero findings |
| Focused v2 pgTAP | Pass; 90 assertions |
| Complete unchanged pgTAP suite | Pass; 26 files, 754 assertions |
| Existing courier concurrency harness | Pass |
| Existing Admin-role concurrency harness | Pass |
| Existing invitation concurrency harness | Pass |
| New distinct-operation review concurrency harness | Pass; one review/reaction/operation/audit/metric contribution |
| Migration static scan | Pass; no `CASCADE`, Production reference, table/column destructive drop, truncate, broad grant, or fabricated v2 Value/F/P |
| Index inventory/redundancy review | Pass; every added index has a distinct integrity or access-path purpose |
| `git diff --check` | Pass |

The first complete pgTAP invocation after a raw reset reported two missing local Realtime policy assertions. This repository intentionally installs that receive-only policy with `npm run supabase:realtime:policy:local`; after applying that prescribed local-only policy, all 754 assertions passed. No hosted environment was involved.

## Rollback and forward-fix procedure

Nothing has been deployed, so the current rollback is simply to omit the unapproved migration from a future hosted batch; no database rollback is required.

After any future deployment, a forward fix is preferred. Immediately revoke affected v2 RPC execute grants if containment is needed, preserve all review/report/operation/audit rows, add a corrective migration, and rerun reconciliation. Destructive removal is allowed only after proving there are zero v2 reviews and no dependent reports/reactions/operations: explicitly drop v2 functions/views/tables/types/indexes without `CASCADE`, restore legacy `NOT NULL` constraints only after proving no null legacy fields, then drop `contract_version`. Historical rows or audit evidence must never be discarded to simulate rollback.

## Remaining limitations

- The migration has not been applied to Development or any other hosted environment.
- Hosted Firebase-token authorization probes, backups, realistic-volume query plans, and hosted row-count reconciliation belong to Phase 2.
- Shared generated types and application/repository consumers remain unchanged until Phase 3.
- Historical v1 product reviews and v1 order-review contracts remain present for transition safety. Legacy Restaurant moderation can still operate on legacy v1 review rows only; it cannot target v2 rows.
- No frontend behavior, accessibility implementation, device validation, deployment, or build was part of this phase.

## Phase 2 authorization boundary

Phase 2, if separately approved, is Development database qualification only: create a restricted Development backup; checksum-pin/dry-run/apply this migration to Development; regenerate shared Supabase types; run real hosted Customer/Restaurant/Admin authorization, privacy, replay, report, moderation, aggregate, reconciliation, and representative-volume query-plan probes; and remove disposable probe data. Staging and Production remain untouched.
