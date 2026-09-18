# Customer Review System v2 — Phase 3 Repository Review

**Completed:** 2026-09-17

**Result:** Pass

**Boundary:** Local repository work only. No hosted environment access, database migration, generated-type regeneration, deployment, or EAS build occurred.

## Implemented contracts

The shared domain package now defines the v2 Taste/Speed rating, normalized draft, meal reaction, safe item snapshot, Customer state/prompt/submission, anonymous public summary/feed, Restaurant review/report/aggregate, and Admin report/moderation result types. Legacy v1 types and database contracts remain present for historical compatibility.

The Customer Supabase v2 repository provides:

- `submitCustomerOrderReviewV2`;
- `getCustomerOrderReviewStateV2`;
- `getCustomerReviewPromptV2`;
- `getRestaurantReviewSummaryV2`; and
- `listPublishedRestaurantReviewsV2`.

All JSON results are checked before mapping. Public models contain only review ID, Taste, Speed, two-score overall, comment, safe item snapshots, and the server-provided coarse date. Opaque cursors are returned and forwarded unchanged, while requested limits are clamped to `1..50`.

Separate Restaurant and Admin repository factories use only their guarded v2 RPCs. Restaurant exposes review queue, report creation/status reads, and aggregate reactions; it has no visibility mutation. Admin exposes report inspection/transitions, visibility changes, and aggregate reactions. Every mutation requires a caller-provided operation UUID.

## Single rating source and public privacy

Customer Restaurant catalog projections no longer select or map `active_restaurants.rating_average` or `rating_count`. Restaurant lists, Home/search cards, Restaurant details, menu bundles, and the current review page obtain rating/count data from `get_restaurant_review_summary_v2` only.

The current review-page compatibility layer now reads the anonymous v2 feed and displays only overall, Taste, Speed, comment, coarse date, and safe item snapshots. Its legacy Customer-name masking and Value/F/P presentation were removed. The Phase 5 visual redesign has not begun.

Historical product-review repository methods remain available, but product-review submission no longer invalidates Customer Restaurant rating caches. Source searches confirmed that the migrated Customer metric consumers contain no product-review summary RPC, legacy order-review summary RPC, published legacy review view, Restaurant rating-column selection, metric alias fallback, Customer identity mapping, or F/P fallback.

## Cache behavior

V2 summary and feed caches use Restaurant-specific keys. A confirmed initial submission or exact replay invalidates only:

- the affected Restaurant summary;
- the affected Restaurant feed pages;
- the affected Restaurant detail entry; and
- Restaurant-list entries that embed that summary.

Tests prove that an unrelated Restaurant detail/summary remains cached. Menu and legacy product-review caches are not invalidated by a v2 order review.

## Idempotency and recovery

The durable Customer operation layer stores only `orderId`, `restaurantId`, `operationId`, `canonicalDraftHash`, and `createdAt`, under a profile-hashed SecureStore key. It never persists comment text or reaction data.

The local hash input uses the server contract: trim leading/trailing ordinary spaces, NFC-normalize the comment while preserving allowed tab/newline/carriage-return characters, and sort reactions lexically by menu-item ID. An unchanged draft reuses its operation UUID; a changed draft replaces it. Network or lost-response failures retain it. Confirmed submission/replay, authoritative reviewed state, explicit discard, or confirmed expiry clears it.

A nonvisual recovery coordinator mounts only when the root Customer access gate has confirmed an active Customer and a scoped profile ID. It reconciles pending operations on mount and foreground. The same single-order reconciliation function is available for Phase 4 order navigation. An executable guard test proves that anonymous/not-yet-authorized recovery performs zero private review calls.

## Error behavior

The Customer adapter maps database/transport failures to stable codes without returning raw database messages:

- `session_expired`;
- `account_inactive`;
- `order_unavailable`;
- `review_expired`;
- `already_reviewed`;
- `invalid_reaction_item`;
- `operation_conflict`;
- `validation`;
- `service_unavailable`; and
- `unknown`.

The ownership and delivered-state database denial intentionally remains one public `order_unavailable` classification so the repository does not infer or disclose an order the caller cannot access.

## Test and gate evidence

| Check | Result |
|---|---|
| Focused v2 repository cases | Pass; 8 cases across Customer/public/Restaurant/Admin adapters |
| Mobile repository/auth suite | Pass; 112 tests, zero skipped |
| Complete JavaScript suite | Pass; 232 tests, zero failed/skipped |
| Portal repository malformed-response/privacy checks | Pass |
| Equal-date keyset continuation and opaque cursor forwarding | Pass |
| Exact targeted cache invalidation | Pass |
| Canonical hash, UUID reuse/change, lost-response retention, replay cleanup, account scoping | Pass |
| Active-Customer-only startup/foreground recovery | Pass |
| Package builds (`config`, `domain`, `database-types`) | Pass |
| Customer TypeScript | Pass |
| Restaurant TypeScript, including all `src/` files | Pass |
| Admin TypeScript | Pass |
| Customer Expo lint | Pass |
| Migration checksum | Unchanged: `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b` |
| Generated database-types checksum | Unchanged: `8cc753f9d876f5af9c555dbd9993aafad5ea46d58b10947c4fecc7b33d8a4c2a` |
| Credential/privacy/source scans | Pass |
| `git diff --check` | Pass |

## Security and compatibility findings

- Public and Restaurant output models cannot carry Customer identity, order identifiers, operation metadata, or raw reaction mappings because mappers explicitly select safe fields.
- Restaurant code has no v2 hide/restore method. Only the Admin repository maps the guarded visibility RPC.
- Private recovery cannot run before active Customer authorization.
- Restaurant/Admin repository errors are sanitized and do not forward database text.
- V1 contracts and historical data remain untouched; the Phase 2 migration and generated database types are byte-for-byte unchanged.
- The database-owned v2 summary is now the sole rating source for migrated Customer surfaces.

## Remaining limitations

- Phase 4 must connect the prepared Customer methods to the new bilingual submission sheet and Order History/details actions.
- The current public review page received only the contract/privacy compatibility change; its final design, load-more states, accessibility treatment, and localization belong to Phase 5.
- Restaurant and Admin repositories are implemented and tested but not mounted in their workflow UIs; those workflows belong to their later approved phases.
- Summary hydration uses the existing per-Restaurant public RPC and shared 60-second cache because Phase 3 does not authorize a new bulk database contract.
- No hosted runtime probe was repeated because Phase 3 expressly prohibited hosted access; authorization/RLS behavior remains covered by the completed Phase 2 qualification.

## Phase 4 authorization boundary

Phase 4 is not authorized. If separately approved, it is limited to the Customer order-level submission experience: eligible Order History/details actions and one newest-order prompt, the bilingual Taste/Speed/comment/reaction sheet, configured-line grouping, discard/submission/retry/recovery behavior, accessibility and responsive keyboard/safe-area behavior, and its component/integration tests. It does not authorize Staging/Production mutation, deployment, EAS builds, or later public/Restaurant/Admin workflow work.
