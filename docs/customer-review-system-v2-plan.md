# Customer Review System v2 — Phased Implementation Plan

**Status:** Approved direction; implementation has not started

**Scope:** Customer, Restaurant, Admin, Supabase, and public review presentation

**Environments:** Development first, then separately reviewed Staging

**Production:** Out of scope until the normal production-release review

**Related release:** Phase 6 secure Customer first release
**Revision note:** Final contract-lock clarifications added for an exact rolling 30-day UTC eligibility window, first-release/no-legacy-client deployment semantics, configured-line reaction semantics, Order History prompting, Restaurant report-only moderation with an explicit report contract, database-side anonymity, exact v1/v2 schema transition behavior, one authoritative rating source, keyset pagination, query/index qualification, uncertain-submission recovery, Restaurant meal-reaction aggregates, accessibility, and abuse scope.

## 1. Objective

Replace the confusing split between meal reviews and the Restaurant review summary with one clear review journey after a delivered order.

Each delivered order may receive exactly one Customer order review containing:

- **Taste / Lezzet:** required, 1–5 stars.

- **Speed / Hız:** required, 1–5 stars.

- **Order comment:** optional, with a server-enforced length limit.

- **Meal reactions:** optional one-tap like/dislike feedback for each distinct menu item in that order.

The same menu item may receive feedback again when it is purchased in another delivered order. A Customer cannot review the same order twice or submit multiple reactions for the same menu item within one order.

The public Restaurant rating will be based only on completed order reviews. Meal reactions will help evaluate menu items but will not increase the Restaurant review count. The system will not collect or display a **Service / Servis** score or a **Price/performance / F/P** score in the v2 experience.

## 2. Product decisions

These decisions are fixed for this plan and must not be changed during implementation without updating and reviewing this document.

| Topic | Decision |
|---|---|
| Restaurant review unit | One review per delivered order |
| Required scores | Taste and Speed |
| Optional content | One order comment and meal like/dislike reactions |
| Overall Restaurant score | Equal-weight average of Taste and Speed |
| Restaurant review count | Number of published order reviews |
| Duplicate rule | One order review per Customer/order |
| Meal reaction rule | One reaction per Customer/order/menu item |
| Repeated menu item | One reaction in each separate delivered order is allowed |
| Repeated configured lines | Lines with the same menu-item ID intentionally share one reaction in that order; reactions measure the base menu item, not modifier-specific configurations |
| Review eligibility window | A delivered order may be reviewed until exactly `delivered_at + interval '30 days'`, evaluated server-side in UTC; at or after the expiry timestamp submission is rejected |
| Expired review behavior | After the 30-day window, the order remains visible but cannot open or submit a new review |
| Customer editing after submit | Not supported in the first v2 release |
| Restaurant reply | Not included in the first v2 release |
| Restaurant moderation | Restaurant may report a review for Admin examination but cannot hide, publish, delete, edit, or otherwise change its public visibility |
| Admin capability | Inspect, audit, and moderate visibility/status through guarded audited actions; never change a Customer score or rewrite a Customer comment |
| Public identity | No Customer name or identity is displayed. Public projections expose no full name, masked name, display name, profile ID, Firebase UID, order ID, email, phone, address, or exact order timestamp |
| Released-client compatibility | No older production client exists; the first public Hungrie release will use the v2 contract. v1 database contracts are retained temporarily only for schema/data transition safety, not to support installed legacy clients |
| Data baseline | There are no Production users or real Customer review records. Existing Development and Staging records are test/pilot data and remain preserved unless the currently approved phase explicitly authorizes scoped cleanup |
| Meal reaction use | Meal reactions are not shown on individual public review cards. v2 uses them for anonymous Restaurant/Admin menu-item aggregates: liked count, disliked count, and positive percentage |
| Speed meaning | “Order speed” covering preparation and delivery time; explanatory copy must avoid implying a separate courier/service score |
| Languages | Complete Turkish and English copy |

### 2.1 Clarified product semantics

**Review eligibility window.** The 30-day UTC review window is a rolling server-side interval, not a local-calendar rule. Let `expires_at = delivered_at + interval '30 days'`, with the authoritative `delivered_at` and the eligibility evaluation handled in UTC. Submission is allowed only while the server transaction time is strictly earlier than `expires_at`; at the exact expiry timestamp and afterward it is rejected. Client locale, device clock, time zone, or daylight-saving behavior must not change eligibility. An expired order remains visible in Order History/details, but its review action is unavailable.

**Configured-line reaction semantics.** Meal reactions intentionally represent feedback on the base menu item rather than a particular modifier configuration. If the same menu item appears multiple times in one order with different modifiers, quantities, or notes, those lines share one like/dislike reaction for that order. Modifier-level reactions are deliberately deferred.

**Order-history prompting.** Every eligible unreviewed delivered order may show a compact Review action on its own order row/details. Order History may additionally show at most one prominent review prompt at a time. That prompt selects the most recently delivered eligible unreviewed order. After that order is reviewed or expires, the next eligible order may surface. Reviewed and expired orders must never reappear in the prominent prompt.

**Moderation authority.** Restaurant users may flag/report a review with a reason for Admin examination, but a Restaurant report never changes public visibility by itself. Only an authorized Admin moderation action may hide or restore a review, and every moderation state change must create an audit event.

**Restaurant report contract.** v2 accepts only the reason codes `spam`, `abusive_content`, `personal_information`, `not_related_to_order`, `suspected_fraud`, and `other`. A report may include an optional internal note trimmed and limited to 500 characters; the note is never public and is never returned to Customers. Each Restaurant/review pair has at most one report record and therefore at most one active report. Report status is one of `open`, `resolved`, or `dismissed`. Restaurant users may create the report but cannot resolve, dismiss, reopen, delete, or alter review visibility. Admin resolution/dismissal/reopen actions must record the authorized actor, timestamp, prior/new status, reason context, and an optional bounded internal resolution note without copying Customer review text into the audit log. A dismissed or resolved report cannot be resubmitted by the Restaurant in v2; an authorized Admin may reopen the existing report if further examination is required.

**Public identity semantics.** Customer names are not part of the public review product. Public database projections must omit Customer names entirely rather than sending a full name and masking it in the client. Restaurant-facing review contracts also do not display Customer names; Admin identity access, if operationally required, stays in a separate authorized internal contract.

**Meal-reaction operational use.** Meal reactions are collected as base-menu-item feedback but are not rendered on individual public review cards and are never exposed to Restaurant users at Customer/order granularity. In v2, Restaurant/Admin analytics may show only menu-item aggregates: `liked_count`, `disliked_count`, and `positive_percentage = liked_count / (liked_count + disliked_count) * 100` when at least one reaction exists. Aggregate rows contain no Customer identity, order ID, review ID, or per-review reaction mapping. Reactions attached to an Admin-hidden review do not contribute to these active aggregates. Meal reactions never affect Restaurant review count or Restaurant rating.

## 3. Current-state problems to correct

1. The public page displays Taste, Speed, and F/P even when the Customer flow did not submit a corresponding order review.

2. Meal-review counts can be used as a fallback for the Restaurant review count, so one order containing several meals may appear to be several Restaurant reviews.

3. The current order-review database contract collects Speed, Taste, Value, and optional Price/performance, while the desired product collects only Taste and Speed.

4. Product reviews and order reviews use different entry points, making it unclear whether the Customer has finished reviewing the order.

5. The public review page does not follow the visual language used by the current Customer Home, Orders, cards, sheets, typography, or state handling.

6. Historical product reviews must not be converted into order reviews because no trustworthy Taste/Speed values can be derived from a meal star.

## 4. Target Customer experience

### 4.1 Entry points

An eligible delivered, Customer-owned order shows one clear action: **Review order / Siparişi değerlendir**. Eligibility ends exactly at the server-calculated UTC expiry timestamp `delivered_at + interval '30 days'`. The action appears in Order details and may appear as a compact action on the order row in Order History. Order History may also show at most one prominent review prompt, always for the most recently delivered eligible unreviewed order. The action disappears or becomes **Reviewed / Değerlendirildi** after successful submission. After expiry, the order remains visible but no new review action is available.

Opening the action presents one Hungrie-styled bottom sheet or full-height mobile sheet:

1. Restaurant name and a short order summary.

2. Taste rating.

3. Speed rating.

4. Optional order comment.

5. Optional meal reactions grouped by distinct menu-item ID.

6. A single submit button.

The Customer must choose both required scores before submission. Meal reactions and the comment may be skipped. Closing a changed draft requires a discard confirmation. The keyboard must meet the sheet with no blank gap, inputs must remain visible, and the sheet must handle small screens and large accessibility text.

### 4.2 Completion behavior

Submission is atomic: either the order review and all included meal reactions are saved together, or none are saved. A lost response may be retried with the same operation ID and must return the original result rather than create a duplicate.

After success:

- The sheet closes once.

- The order immediately shows **Reviewed**.

- Home and Restaurant details invalidate their cached rating summary.

- Reopening the order confirms the authoritative server state.

- The same order cannot open a new submission flow.

- Another delivered order containing the same meal remains reviewable.

**Uncertain-close recovery.** If the app is closed, killed, crashes, backgrounds, or loses the response while submission may have committed, the next launch/foreground/order navigation must query the authoritative Customer-owned review state before showing a new Review action. If the review exists, restore **Reviewed** and do not mint a new operation ID. If the server confirms no review exists and the unchanged draft is retried, reuse the original operation ID.

### 4.3 Error behavior

The UI must distinguish:

- Session expired.

- Account suspended or revoked.

- Order does not belong to the caller.

- Order is not delivered.

- Review window has expired.

- Order was already reviewed.

- Submitted meal does not belong to the order.

- Invalid rating or comment.

- Temporary network/service failure.

- Lost-response replay that actually succeeded.

Authorization and validation errors must not be described as internet failures. Error messages must not reveal whether another Customer, order, or profile exists.

## 5. Target public review experience

The Restaurant review page will use the current Hungrie Customer design system rather than copy another application.

### Header and summary

- Standard Customer safe-area header and back behavior.

- Restaurant name with a short explanation that reviews come from delivered orders.

- Large overall score and published order-review count.

- Two metric cards only: **Taste** and **Speed**.

- No empty F/P or Service card.

- No fallback from meal-review counts.

### Review cards

Each published card may show:

- Coarse relative date.

- Taste and Speed scores.

- Optional order comment.

- A compact list of meal names from the stored snapshot.

Cards use the same surface, border, radius, typography, spacing, color, loading skeleton, empty state, and retry patterns as current Customer screens. No Customer name placeholder, masked identity, avatar, initials, or other identity surrogate is rendered. The layout must work in Turkish and English, light and dark themes if supported, web, iPhone, and Android.

### Rating semantics

- Per-review overall score: `(taste + speed) / 2`.

- Restaurant overall score: average of the per-review overall scores for published order reviews.

- Taste score: average of published Taste ratings.

- Speed score: average of published Speed ratings.

- Review count: number of published order reviews, never number of meals or reactions.

- Reviews hidden by authorized Admin moderation do not contribute to public aggregates. Restaurant reports alone do not affect visibility or aggregates.

- All calculations are database-owned; client calculations are presentation-only.

## 6. Data, schema transition, and compatibility design

### 6.1 Existing data, first-release baseline, and exact schema-transition strategy

**Deployment baseline.** Hungrie has not yet been publicly deployed. There are no installed production clients, Production users, or real Customer review records, and no older app build must continue reading new v2 rows. Existing Development and Staging records are test/pilot data. They must still be preserved during implementation unless the currently approved phase explicitly includes a reviewed, scoped cleanup. The first public Customer release will ship against the v2 review contract. Therefore, this plan does not require a minimum-build compatibility gate to protect an older public client. Legacy v1 database contracts are retained temporarily only to preserve existing Development/Staging data, make the migration additive and reversible, and avoid mixing schema cleanup with the v2 launch. They are not an external backward-compatibility promise.

The absence of Production users and real Customer review data does not relax the security standard. Authorization, ownership isolation, privacy, idempotency, validation, auditing, and fail-closed behavior must be fully implemented and qualified because this work establishes the contract for the first public release.

- Preserve all existing `order_reviews` and `product_reviews` rows.

- Existing order reviews are marked as legacy contract version `1`.

- Existing product reviews remain historical meal-star reviews and keep their current moderation/reply data.

- Do not synthesize an order review from product reviews.

- Do not delete legacy score columns during this release.

- The first public Customer release creates only v2 order reviews. Development/Staging code paths must stop creating legacy product-star reviews and legacy four-dimension order reviews before release qualification.

The current legacy schema requires `value_rating`, and the existing legacy `average_rating` is generated from the legacy three-score formula. v2 must not fabricate a Value or Price/performance score merely to satisfy that schema. Because no older production client exists, null legacy fields on v2 rows do not need to be made readable by an installed public client. The additive schema transition is explicitly defined as follows:

1. Add `contract_version` to `order_reviews` with existing rows backfilled/defaulted to `1`.
2. Relax only the legacy Value/F/P column nullability/constraints necessary to allow v2 rows to omit those dimensions. Existing v1 values are preserved unchanged.
3. Keep the existing legacy `average_rating` behavior/column available for existing v1 rows during the transition. Do not redefine old rows or rewrite their historical average.
4. v1 RPCs remain unchanged during the transition and continue requiring/inserting the fields required by their v1 contract even though the underlying columns can accept null for v2. No public release depends on these RPCs.
5. v2 rows use `contract_version = 2`, require Taste and Speed, and may store legacy Value/F/P fields as `NULL`.
6. Add a separate database-owned v2 overall calculation/projection using only `(taste_rating + speed_rating) / 2`. v2 public/private contracts must use this calculation and must never use the legacy three-score `average_rating` for v2 semantics.
7. Legacy order reviews may participate in v2 Restaurant summaries using only their recorded Taste and Speed values. Their Value/F/P values remain retained for audit/compatibility but are not displayed and are not part of v2 aggregates.
8. Before and after migration, reconcile row counts, nullability, generated values, v1 RPC output, and representative legacy aggregate output. No legacy row is rewritten merely to look like v2.
9. Do not add fabricated Value/F/P values or compatibility defaults to v2 rows. If a Development/Staging legacy read cannot tolerate v2 nulls, update that internal read path or keep it scoped to `contract_version = 1`; do not corrupt v2 semantics for compatibility.

If the exact current schema differs from the assumptions above, Phase 0 must record the actual constraints/generated expressions and Phase 1 must adapt this migration mechanically while preserving the same compatibility guarantees.

### 6.2 Database additions

Prepare an additive, versioned migration that introduces:

- The `contract_version` compatibility behavior defined above.

- Support for v2 order reviews that require Taste and Speed and do not require Value or Price/performance.

- A dedicated meal-reaction relation keyed by order, menu item, and Customer.

- A private idempotency record keyed by Customer and stable operation UUID, storing a canonical request hash and the resulting review ID.

- Database-owned v2 metric projections for overall, Taste, Speed, count, and anonymous menu-item meal-reaction aggregates (`liked_count`, `disliked_count`, `positive_percentage`).

- Privacy-safe public v2 projections that omit all Customer identity fields and Customer/order PII. Public projections contain no full name, masked name, display name, initials, avatar identity, profile ID, or Firebase UID.

- Customer-owned v2 read contracts for checking whether an order was reviewed and reading the Customer’s own submitted result.

- Restaurant-scoped guarded review/report contracts that do not expose Customer names, enforce the v2 report-reason/status/note rules, and do not permit visibility mutation.

- Restaurant-scoped aggregate meal-reaction reads that expose menu-item totals/percentages only, never Customer/order/review-level reaction mappings.

- Admin-scoped guarded moderation contracts for audited hide/restore/status changes.

If changing an existing column constraint or generated expression is required, perform it inside one reviewed transaction, preserve all existing values, rebuild dependent views explicitly, and prove row counts and legacy output before and after. Do not use `CASCADE` for convenience.

### 6.3 New submission RPC

Add a versioned Customer RPC rather than changing the parameters or behavior of the existing v1 RPC. Its logical input is:

```text

submit_my_customer_order_review_v2(

  order_id,

  taste_rating,

  speed_rating,

  comment,

  meal_reactions_json,

  operation_id

)

```

The server must:

1. Call `private.require_active_customer()`.

2. Bind the operation to the authenticated profile; never accept a Customer/profile ID from the client.

3. Lock or otherwise serialize the owned order/review key during submission.

4. Require an owned order in the delivered state.

5. Compute `expires_at = delivered_at + interval '30 days'` in the server-side UTC contract and require the server transaction time to be strictly earlier than `expires_at`; reject at or after expiry.

6. Validate both scores as integers from 1 through 5.

7. Trim the comment, enforce its length, and reject invalid control content according to the existing text policy.

8. Validate that reactions are a bounded JSON array with a defined schema.

9. Permit only `liked` or `disliked` reaction values.

10. Reject duplicate menu-item IDs in the payload.

11. Prove every submitted menu-item ID exists in the authoritative order snapshot/items.

12. Before computing the idempotency request hash, the server must normalize the trimmed comment and sort meal reactions deterministically by menu-item ID. Hashing must operate on the canonical normalized representation, not on raw client JSON order.

13. Enforce one review per Customer/order and one reaction per Customer/order/menu item with database constraints.

14. Store only the server-created Restaurant and item-name snapshots required by the review contract; never trust client labels. v2 does not require a Customer-name snapshot for public or Restaurant presentation.

15. Write the review, reactions, operation result, and audit event in one transaction.

16. On an exact replay, return the original review with `replayed=true`.

17. Reject reuse of an operation ID with a different canonical request hash.

18. Return a small result such as `{ reviewId, replayed }` without private data.

### 6.4 Public and private reads

Public anonymous contracts expose only published data required to render the Restaurant review page. They must not expose:

- Any Customer name, masked name, display name, initials, avatar identity, `profile_id`, or Firebase UID.

- `order_id` or operation ID.

- Address, phone, email, note, payment method, or total.

- Exact order-event history or exact order timestamp.

- Internal moderation notes or audit metadata.

Customer private reads require an active Customer and enforce order ownership. Restaurant reads require active membership in the review’s Restaurant, omit Customer names/private identity, and allow report creation but not visibility mutation. Admin reads require active Admin authorization; operational identity access, if required, is kept separate from public/Restaurant projections, and sensitive moderation actions are audited.

### 6.5 One authoritative Restaurant rating source

The v2 order-review projection is the single source of truth for public Restaurant review metrics. Home cards, Restaurant details, and the public Review page must all consume the same database-owned v2 summary contract for:

- overall rating;
- Taste average;
- Speed average; and
- published order-review count.

Existing product-review totals and legacy `restaurants.rating_*`-style fields may remain temporarily for schema/data transition safety, but no released legacy client depends on them and v2 Customer surfaces must not read them as a fallback or competing rating source. A cache may mirror the authoritative projection for performance only if invalidation/reconciliation proves that it cannot diverge semantically.

### 6.6 Pagination, indexes, and query-plan qualification

Public review lists use deterministic keyset/cursor pagination ordered by `(created_at DESC, id DESC)`. Unlimited list loading and offset-based pagination are not permitted for the v2 public review feed. The cursor must contain the last returned `(created_at, id)` pair, with `id` acting as the deterministic tie-breaker.

The migration must provide reviewed indexes for the actual access paths, including at minimum:

- published Restaurant review pagination/filtering by Restaurant, moderation/publication state, and `(created_at, id)`;
- Restaurant-scoped review/report queues by Restaurant and moderation/report state;
- Customer-owned review lookup for a Customer/order pair;
- idempotency replay lookup for a Customer/operation pair; and
- Restaurant/Admin menu-item reaction aggregate paths required to compute or read liked/disliked totals efficiently.

Unique constraints that already satisfy an access path may serve as the required index; do not create redundant indexes mechanically. Exact index definitions must be based on the real query predicates and schema. Development qualification must inspect representative `EXPLAIN`/`EXPLAIN ANALYZE` plans using realistic review volumes and confirm that public pagination, Customer lookup, Restaurant review queues, and operation replay avoid unintended large sequential scans.

### 6.7 Restaurant report and meal-reaction aggregate contracts

**Restaurant report logical contract**

- A report belongs to exactly one Restaurant and one review; the server derives/validates Restaurant scope from the authenticated Restaurant membership and the target review.
- Allowed reason codes are exactly: `spam`, `abusive_content`, `personal_information`, `not_related_to_order`, `suspected_fraud`, and `other`.
- `internal_note` is optional, server-trimmed, and limited to 500 characters. It is never public and is never returned to the Customer.
- Report status is exactly one of `open`, `resolved`, or `dismissed`.
- A unique Restaurant/review constraint allows only one report record for that pair. Restaurant users cannot create another report after the existing report is resolved or dismissed; only an authorized Admin may reopen that existing record.
- Restaurant users may create a report but cannot resolve, dismiss, reopen, delete, hide, publish, or otherwise mutate review visibility.
- Admin report transitions are guarded and audited. Audit data records the authorized actor, target report/review, prior/new status, timestamp, and reason context without copying the Customer comment into the audit log.
- Report state and review visibility are separate. Creating, resolving, dismissing, or reopening a report does not itself hide/publish a review unless a separate authorized Admin moderation action changes review visibility.

**Meal-reaction aggregate logical contract**

- Restaurant/Admin reads are grouped by Restaurant and base `menu_item_id`; individual reaction rows are not exposed to Restaurant users.
- Each aggregate exposes `liked_count`, `disliked_count`, and `positive_percentage` only.
- `positive_percentage = liked_count / (liked_count + disliked_count) * 100` when the denominator is greater than zero; when no reactions exist, `positive_percentage` is `NULL` and the UI displays an empty/no-feedback state rather than `0%`.
- The database owns aggregate counts/percentage inputs; the client may round the displayed percentage to one decimal place for presentation only.
- Reactions attached to an Admin-hidden review do not contribute to active Restaurant aggregates. Restoring that review restores its reaction contributions exactly once.
- Aggregate contracts expose no Customer identity, `order_id`, `review_id`, operation ID, exact order timestamp, or mapping that allows a Restaurant user to connect a reaction to an individual review.
- Meal-reaction aggregates never affect Restaurant overall rating, Taste, Speed, or order-review count.

## 7. Security and abuse requirements

- Direct inserts, updates, and deletes by `anon` or `authenticated` remain denied for review tables.

- All Customer mutations go through guarded RPCs.

- Anonymous users can read only curated published projections.

- Restaurant users cannot alter scores, hide/publish/delete reviews, impersonate Customers, access Customer names/private identity, or access reviews belonging to another Restaurant. They may only create guarded reports for their own Restaurant’s reviews.

- Restaurant report creation accepts only the approved reason-code enum and an optional server-trimmed note of at most 500 characters. A unique Restaurant/review report record prevents duplicate active or repeated dismissed/resolved submissions; only Admin may reopen an existing report.

- Restaurant meal-reaction access is aggregate-only. No Restaurant contract returns which Customer, order, or review produced a like/dislike reaction.

- A suspended, revoked, pending, unmapped, Restaurant, or Admin identity cannot submit Customer reviews through direct API calls.

- Review submission must remain denied when Firebase authentication is valid but canonical Customer access is not active.

- Database constraints remain the final duplicate defense even if the client submits concurrently from two devices.

- Payload sizes, comment lengths, array length, and RPC limits are bounded server-side.

- v2 prevents review creation without a genuine Customer-owned delivered order, but advanced coordinated review-fraud detection is not part of this release. Audit context must remain sufficient for later investigation without expanding public data exposure.

- All dynamic text is rendered as text; no HTML is accepted or executed.

- Audit events record actor, target, action, contract version, and Restaurant scope without copying the comment into the audit log.

- Logs and support references must not contain review text, tokens, email addresses, or Customer PII.

- Metrics include Admin-published/visible reviews only and update transactionally after submission or authorized Admin moderation. A Restaurant report alone never changes public aggregates.

- RLS and function grants are reviewed explicitly after every new object is created.

## 8. Delivery phases

Each phase has its own completion gate. Do not begin Staging deployment merely because Development implementation compiles.

### Phase 0 — Contract lock and baseline evidence

**Work**

- Record current Development and Staging counts for order reviews, product reviews, published/hidden state, duplicates, and aggregate outputs.

- Capture the current table constraints, function signatures, grants, RLS policies, views, and dependent objects.

- Confirm the current Customer, Restaurant, and Admin screens that consume each review contract.

- Produce static wireframes for the review sheet and public review page using Hungrie’s current design tokens.

- Finalize Turkish and English copy, including the meaning of Speed.

- Decide the maximum number of distinct meal reactions accepted in one payload based on the maximum order size.

- Confirm the exact rolling UTC review window, base-menu-item reaction semantics, single-prominent-prompt behavior, no-public-name rule, explicit Restaurant report contract, and aggregate-only Restaurant meal-reaction analytics are represented in wireframes, contracts, copy, RPC rules, and tests.

- Record the exact legacy `value_rating`, Price/F/P, `average_rating`, generated-expression, nullability, dependency, trigger, and v1 RPC behavior before writing the migration.

- Record every current Home/Restaurant/review metric source so v2 can remove competing product-review/legacy rating fallbacks deliberately.

- Record that no public/production client has ever been deployed; v1 retention is a schema-transition safeguard rather than an installed-client compatibility requirement.

**Gate**

- Product behavior, formulas, copy, privacy fields, and wireframes are reviewed.

- No database or application mutation has occurred.

### Phase 1 — Migration and RPC design

**Work**

- Write one additive Development migration for the v2 schema, views, constraints, grants, RPCs, compatibility changes, required indexes, and database-owned v2 rating projections.

- Keep v1 contracts unchanged and callable during the internal schema-transition period; no public client depends on them.

- Add deterministic idempotency and request-hash behavior.

- Add the guarded Restaurant report relation/RPC with approved reason codes, 500-character optional note bound, unique Restaurant/review record, `open`/`resolved`/`dismissed` status, and Admin-only resolution/reopen actions.

- Add database-owned Restaurant/Admin menu-item reaction aggregates with no Customer/order/review identifiers in the aggregate contract.

- Implement the exact v1/v2 schema-transition strategy: existing rows `contract_version = 1`, legacy Value/F/P nullable only as required for v2, v1 RPC behavior unchanged during transition, no fabricated legacy values on v2 rows, and a separate v2 overall calculation based only on Taste/Speed.

- Define keyset pagination on `(created_at, id)` and the reviewed query/index plan for public, Restaurant, Customer, and idempotency access paths.

- Add Customer ownership, Restaurant scope, and Admin authorization tests before deployment.

- Add a reconciliation query comparing pre-migration and post-migration legacy rows.

- Add an explicit rollback/forward-fix procedure.

**Gate**

- Clean local database reset succeeds.

- Database lint is clean.

- All existing pgTAP tests pass unchanged.

- New pgTAP tests pass for v2 success, isolation, validation, duplicate attempts, and replay.

- Migration review confirms no `CASCADE`, destructive data rewrite, fabricated legacy scores, broad grants, redundant/unjustified indexes, or Production target.

### Phase 2 — Development database qualification

**Work**

- Create a restricted Development backup.

- Dry-run the exact checksum-pinned migration batch.

- Apply only to Development.

- Regenerate shared Supabase types.

- Run hosted Firebase-token probes for active Customer success and every wrong-role/status denial.

- Submit representative order reviews and meal reactions through real hosted tokens.

- Report one review as a Restaurant using each accepted contract path; verify duplicate/repeated Restaurant reports are rejected as specified, report notes/status remain internal, and the report alone does not change visibility/metrics. Then resolve/dismiss/reopen through authorized Admin actions and verify audit behavior.

- Create representative meal reactions and verify Restaurant aggregate liked/disliked/positive-percentage results without exposing Customer/order/review-level reaction mappings; verify Admin-hidden reviews are excluded from active reaction aggregates.

- Seed or use representative Development review volumes and inspect query plans for public keyset pagination, Customer review lookup, Restaurant review/report queues, and idempotency replay.

- Remove disposable probe data.

**Gate**

- Hosted Development row counts reconcile.

- Cross-Customer, cross-Restaurant, and anonymous private-data probes are denied.

- Exact lost-response replay returns one review.

- Any remaining Development/Staging v1 consumers still operate against legacy contracts and preserve legacy average semantics; no public-client compatibility claim is required.

- v2 rows may omit legacy Value/F/P fields and all v2 public metrics use the Taste/Speed v2 calculation.

- Query-plan evidence shows the reviewed access paths use appropriate indexes at representative volumes.

- No Staging or Production mutation has occurred.

### Phase 3 — Shared types and repository layer

**Work**

- Add v2 domain types for Taste, Speed, order comment, meal reaction, public summary, and replay result.

- Add Customer repository methods for submit, own-review lookup, and reviewed-state restoration.

- Add public repository methods for the single authoritative v2 Restaurant summary and keyset-paginated published reviews using `(created_at, id)` cursors.

- Add Restaurant/Admin repository methods only through their guarded contracts, including Restaurant menu-item reaction aggregate reads and report creation/status reads without Customer identity.

- Remove product-review aggregates and legacy Restaurant rating fields as fallback/competing sources for all v2 Home, Restaurant, and Review-page metrics.

- Invalidate only the relevant Restaurant/catalog review caches after confirmed success.

- Preserve the operation UUID across uncertain retries and clear it only after authoritative success or a changed draft.

- On app restart, foreground, order navigation, or recovery from an uncertain submission, query the authoritative Customer-owned review state before offering a new submission. If the review exists, restore Reviewed state and do not create a new operation ID. If no review exists and the unchanged draft is retried, reuse its existing operation ID.

**Gate**

- Repository tests cover mapping, single-source metric usage, keyset pagination (including equal timestamps), cache invalidation, authoritative restart recovery, replay, and error classification.

- No repository mounts or sends private calls before active Customer authorization.

- TypeScript and generated-type builds pass.

### Phase 4 — Customer submission experience

**Work**

- Replace separate per-meal review buttons with one order-level review action.

- In Order History, allow compact Review actions on eligible rows and at most one prominent prompt for the most recently delivered eligible unreviewed order.

- Build the new bilingual review sheet using existing Customer design tokens and components.

- Collect required Taste and Speed scores.

- Collect one optional comment and optional meal reactions.

- Group duplicate configured lines by menu-item ID while showing an accurate quantity/name summary.

- Add draft-discard protection, submitting state, retry behavior, accessibility labels, screen-reader announcements, large-text support, sufficient color contrast, reduced-motion behavior, and minimum interactive touch targets (44 pt on iOS; equivalent platform-appropriate target on Android).

- Star controls must expose semantic values such as `Taste, 4 of 5` / localized equivalent and announce selection changes without relying on color alone.

- Restore authoritative Reviewed state after app restart, foreground recovery, notification navigation, and any uncertain prior submission before rendering a new Review action.

- Prevent double taps and concurrent submissions in the client while relying on the server constraint as final protection.

**Gate**

- Component tests cover validation, grouping, focus, keyboard layout, submit locking, uncertain-close/restart recovery, accessibility semantics/announcements, reduced motion, touch targets, retry, and localization.

- Web, iPhone, and Android layouts show no keyboard gap, clipped buttons, hidden input, or unsafe-area overlap.

- One order cannot be reviewed twice from the UI or direct RPC.

- At or after `delivered_at + interval '30 days'` the order cannot open or submit a review, including through direct RPC; tests use server UTC boundaries rather than client calendar dates.

### Phase 5 — Public Restaurant reviews and Home metrics

**Work**

- Rebuild the public Restaurant review page in the Hungrie Customer design language.

- Display only overall, Taste, Speed, and the order-review count.

- Render published review cards from the public v2 projection with no Customer name/identity field and no per-review meal reaction presentation.

- Remove the product-review fallback and all v2 F/P/Service presentation.

- Switch Home, Restaurant cards, Restaurant details, and the Review page to the same authoritative order-review summary; no v2 screen may fall back to product-review totals or legacy `restaurants.rating_*` fields.

- Load public reviews only through `(created_at, id)` keyset pagination; do not use unlimited or offset pagination.

- Refresh affected summaries after successful submission, on focus, and on foreground recovery without creating request loops.

- Provide loading, empty, offline, error, and retry states.

**Gate**

- One order contributes exactly one Restaurant review count.

- Five meal reactions inside that order do not change the Restaurant review count.

- Only Admin-hidden reviews disappear from public lists and aggregates; a Restaurant report by itself does not hide a review or change aggregates.

- Home, Restaurant details, and Review page show the same score/count without an app restart.

- Anonymous responses contain no private identifiers, PII, Customer names, masked names, display names, initials, or identity surrogates.

- Public review responses do not include per-review meal reactions.

### Phase 6 — Restaurant and Admin handling

**Work**

- Update Restaurant Reviews to show Taste, Speed, the order comment, and safe item snapshots.

- Remove v2 F/P/Service labels.

- Keep scores immutable to Restaurant users.

- Replace Restaurant hide/publish moderation with guarded report-only behavior using the fixed reason codes `spam`, `abusive_content`, `personal_information`, `not_related_to_order`, `suspected_fraud`, and `other`; allow an optional internal note up to 500 characters; enforce one Restaurant/review report record with `open`, `resolved`, or `dismissed` status; and keep resolution/dismissal/reopen Admin-only. Restaurant reports never change review visibility or rating aggregates.

- Show Restaurant users anonymous per-menu-item reaction aggregates: liked count, disliked count, and positive percentage. Do not expose reaction rows, Customer identity, order IDs, review IDs, or a mapping from a reaction back to an individual public review.

- Keep hide/restore/publish-status changes Admin-only through guarded audited actions with transactional review and meal-reaction aggregate refresh.

- Admin report resolution/dismissal/reopen actions record actor, timestamp, prior/new status, reason context, and optional bounded internal resolution note; they do not rewrite Customer scores/comments.

- Update Admin inspection to show review contract version, moderation status, and safe audit context.

- Keep internal IDs available only where operationally required and authorized.

**Gate**

- A Restaurant can see only its own reviews.

- Restaurant report creation and Admin report/moderation actions create appropriate audit events without copying Customer review text into the audit log.

- Neither role can change a Customer score or create a Customer review.

- Restaurant review views do not display Customer names or private identity. Customer identity/order PII is available only in a separately approved Admin operational view when genuinely required.

- A Restaurant report cannot change public visibility or rating/count; only an authorized Admin moderation action can do so.

- Restaurant reaction analytics match database aggregates for representative items, exclude reactions attached to Admin-hidden reviews, and expose no Customer/order/review-level linkage.

- A Restaurant cannot create a second report for the same review after the first report is open, resolved, or dismissed; only Admin may reopen the existing report.

### Phase 7 — Full Development qualification

Run:

- Clean local Supabase reset.

- Database lint.

- Complete pgTAP suite.

- Shared type generation/build.

- Customer repository and component tests.

- Cart/order regression tests.

- Notification regression tests.

- TypeScript checks.

- Expo lint.

- Customer web export.

- Restaurant build/checks.

- Admin build/checks.

Perform a hosted Development journey:

1. Create a delivered order containing duplicate configurations and several menu items.

2. Submit Taste, Speed, a comment, and mixed optional meal reactions.

3. Simulate a lost response and retry with the same operation ID.

4. Confirm one order review and one reaction per distinct selected menu item.

5. Simulate the app closing after a commit but before the success response, reopen/navigate back to the order, query authoritative state first, and confirm Reviewed is restored without offering a new submission.

6. Review the same meal from another delivered order.

7. Confirm Home and the public page refresh to the same aggregate.

8. Report the review as the Restaurant with an approved reason and optional internal note; confirm a second Restaurant report for the same review is rejected, confirm it remains public, and exercise Admin dismiss/resolve/reopen plus hide/restore with audit verification.

9. Verify Restaurant menu-item reaction aggregates (liked, disliked, positive percentage), confirm no Customer/order/review reaction mapping is returned, and confirm Admin-hidden review reactions leave the active aggregate and return exactly once after restore.

10. Probe another Customer’s order and another Restaurant’s review directly.

11. Suspend and revoke the Customer, confirming further submissions are denied.

**Gate**

- All automated and hosted Development checks pass.

- A review document records exact migration hashes, backup, test counts, known limitations, and rollback procedure.

- Development implementation is reviewed before Staging preparation.

### Phase 8 — Staging deployment and physical-device qualification

**Work**

- Read-only inspect Staging and reconcile baseline review data.

- Back up Staging.

- Dry-run the exact reviewed migration and verify its checksum.

- Apply the migration and verify grants, functions, policies, row counts, and metrics.

- Deploy updated Customer, Restaurant, and Admin previews without touching Production.

- Confirm the release record states that Hungrie has no previously deployed public client. No legacy-client minimum-build compatibility step is required for this review rollout; the first public build uses v2 contracts.

Test on physical iPhone and Android:

- Taste and Speed required validation.

- Optional comment and no-comment submission.

- Optional like, dislike, and skipped meal reactions.

- Duplicate configured lines grouped correctly.

- One review per order and another review for the same meal in another order.

- Review-window boundary behavior using server UTC: one instant before `delivered_at + interval '30 days'` succeeds; at the exact expiry timestamp and afterward submission is rejected while the order remains visible.

- Multiple unreviewed delivered orders: row actions remain available where eligible, while only the most recent eligible order receives the prominent Order History prompt.

- Offline submission, reconnect, uncertain response, idempotent retry, and full app termination after server commit but before client success handling; reopening must query authoritative review state before offering submission again.

- App background/foreground during submission.

- Session expiry, suspended, revoked, wrong-role, and Supabase outage behavior.

- Keyboard positioning, small screen, large text, Turkish, English, screen-reader labels/announcements, contrast, reduced-motion mode, and platform-appropriate touch-target sizing.

- Immediate Home/Restaurant/review-page refresh.

- Restaurant report contract: allowed reasons, 500-character optional note bound, duplicate/repeated-report prevention, `open`/`resolved`/`dismissed` states, Admin-only resolution/reopen, and proof that Restaurant reports do not alter public metrics.

- Restaurant menu-item reaction aggregates show liked/disliked/positive-percentage values without exposing Customer/order/review-level reaction linkage.

- Anonymous privacy inspection in browser network tools, verifying that no Customer name (full or masked), display name, profile identifier, or per-review meal reaction is delivered by the public API.

**Gate**

- Every applicable device-check row passes on both platforms.

- Staging contains no duplicate reviews/reactions or disposable probe data.

- The app owner reviews and accepts the Staging result.

### Phase 9 — Acceptance and later cleanup

Phase 6 may count this review redesign as complete only after the Staging and physical-device gates pass. Production remains unchanged until its separate release process.

Legacy v1 RPCs, legacy score columns, and historical product reviews remain in place through the internal schema-transition period to keep this migration additive and easy to inspect. No public client depends on them because Hungrie has not yet been deployed. Their removal belongs to a later legacy-removal phase after repository search, Development/Staging telemetry/log inspection, and database inspection prove that no current supported code path calls them. Removal requires a separate migration and review; it must not be bundled into the v2 launch.

## 9. Required automated test matrix

### Authorization

- Active Customer can review only their delivered order.

- Pending, preparing, ready, out-for-delivery, canceled, foreign, or review-window-expired orders are rejected.

- Eligibility uses the authoritative UTC boundary `server_transaction_time < delivered_at + interval '30 days'`; one instant before expiry is eligible, while the exact expiry timestamp and later are rejected.

- Unmapped, pending, suspended, revoked, Restaurant, and Admin identities are rejected.

- Anonymous access sees only published privacy-safe projections.

- Restaurant A cannot read or report Restaurant B reviews. Restaurant A cannot hide/publish/delete even its own reviews; only Admin moderation can change visibility.

### Validation

- Taste and Speed accept only integers 1–5.

- Missing required score is rejected.

- Oversized or malformed comments are rejected.

- Malformed reaction JSON is rejected.

- Unsupported reaction values are rejected.

- Duplicate reaction menu IDs are rejected.

- A menu item outside the order is rejected.

- Oversized reaction arrays are rejected.

### Concurrency and idempotency

- Two simultaneous submissions for the same order create one review.

- Exact operation replay returns the same review with `replayed=true`.

- Equivalent payloads whose meal reactions arrive in different array orders produce the same canonical request hash and replay successfully.

- Equivalent comments produce the same canonical request hash after the required trimming and normalization.

- Reusing an operation ID with changed ratings/comment/reactions is rejected.

- A network timeout after commit can be retried safely.

- Metric triggers run once for the committed logical review.

### Metrics and moderation

- Overall equals the equal-weight Taste/Speed average.

- One order counts once regardless of item quantity or reactions.

- Admin-hidden reviews do not contribute.

- A Restaurant report does not change visibility or Restaurant rating/count aggregates.

- Report creation accepts only approved reason codes, trims/enforces the 500-character optional-note limit, and prevents a second Restaurant report for the same Restaurant/review pair regardless of whether the existing report is `open`, `resolved`, or `dismissed`.

- Admin can resolve, dismiss, or reopen an existing report through audited guarded actions; Restaurant users cannot perform those transitions.

- Restoring an Admin-hidden review restores aggregates exactly once.

- Meal reactions never alter the Restaurant order-review count or rating.

- Restaurant menu-item aggregates compute `liked_count`, `disliked_count`, and positive percentage correctly and expose no Customer/order/review linkage.

- Reactions attached to an Admin-hidden review are excluded from active Restaurant aggregates; restoring the review restores those aggregate contributions exactly once.

- Legacy order reviews use only their trustworthy Taste/Speed fields in v2 summaries.

### First-release compatibility baseline

- Qualification records explicitly confirm that no public/production Hungrie client predates v2.

- v2 rows may leave legacy Value/F/P and legacy v1 average fields null where the schema-transition design permits; no fabricated values are inserted for hypothetical old clients.

- Any remaining Development/Staging v1 read is either compatible with its own v1 rows or explicitly scoped to `contract_version = 1`; v2 semantics are never altered to satisfy it.

### Pagination and performance

- Public review pagination is keyset-based on `(created_at DESC, id DESC)` and remains deterministic when multiple reviews share the same timestamp.

- No v2 public review endpoint uses unlimited loading or offset pagination.

- Public Restaurant review, Restaurant report/moderation queue, Customer order-review lookup, and operation replay queries have appropriate reviewed indexes or equivalent unique-constraint indexes.

- Representative-volume query plans are inspected and do not show unintended large sequential scans for the approved access paths.

### Privacy

- Public payloads omit profile ID, order ID, contact data, address, note, payment, and exact history.

- Public projections contain no Customer name field at all: no full name, masked name, display name, initials, avatar identity, profile ID, or Firebase UID.

- Logs, errors, support references, and audit metadata omit comment text and credentials.

- Direct table writes remain denied.

## 10. Rollback and incident handling

The database migration must be forward-fix oriented. If local or Development checks fail, correct the additive migration before Staging. If Staging application qualification fails, keep the new contracts deployed but leave the feature unreachable from approved clients, unless the reviewed migration itself corrupts data or authorization.

Do not delete newly submitted reviews to disguise a failed rollout. Preserve them, disable the client entry point if necessary, and correct projections or UI through a reviewed forward fix. Restore from the restricted backup only when a transaction or migration-history failure cannot be safely forward-fixed.

If privacy or authorization fails:

1. Stop qualification immediately.

2. Disable the affected public/guarded execute grant or client route.

3. Preserve audit evidence without copying PII into documentation.

4. Revoke exposed sessions or credentials if applicable.

5. Correct and rerun the complete isolation suite before resuming.

## 11. Acceptance criteria

The review system is accepted only when all of the following are true:

- Customers submit exactly one Taste/Speed review per eligible delivered order while `server_transaction_time < delivered_at + interval '30 days'` in the UTC server contract.

- Expired orders remain visible but cannot create new reviews.

- Optional meal reactions remain order-scoped and repeatable only across different orders; multiple configured lines for the same base menu item intentionally share one reaction within an order. Restaurant/Admin operational use is aggregate-only (`liked_count`, `disliked_count`, positive percentage) with no Customer/order/review-level linkage.

- Order History never shows more than one prominent review prompt at a time, and it targets the most recently delivered eligible unreviewed order.

- The public score and count are database-owned and come from one authoritative v2 order-review projection on every Customer screen; product-review totals and legacy Restaurant rating fields are not competing/fallback sources.

- F/P and Service no longer appear in the v2 Customer experience.

- Existing review data is preserved without fabricated conversions.

- Duplicate, cross-tenant, wrong-role, suspended, and revoked submissions fail closed.

- Lost responses do not create duplicate reviews.

- Public review responses contain no Customer/order PII and no Customer name or identity surrogate of any kind.

- Restaurant users can report reviews only through the fixed reason/status/note contract and cannot hide, publish, delete, edit, resolve, dismiss, reopen, or otherwise change public visibility; Admin-only report resolution and visibility moderation are audited.

- Public review lists use deterministic `(created_at, id)` keyset pagination and the approved query paths are index-qualified at representative volumes.

- Closing or killing the app during an uncertain submission cannot cause a second review prompt before authoritative server state is checked.

- Accessibility checks cover screen-reader semantics/announcements, contrast, large text, reduced motion, and platform-appropriate touch targets.

- Customer, Restaurant, and Admin interfaces follow their established design systems.

- Development automation, hosted probes, Staging deployment checks, and physical iPhone/Android qualification pass.

- The release record states that no older public Hungrie client exists; the first public build is v2, so no legacy-client minimum-build workaround or fabricated legacy score is required.

- Production has not been changed by this work.

## 12. Deliberately deferred work

- Service/courier rating.

- Price/performance rating.

- Customer editing or deleting a submitted review.

- Restaurant replies to order-level reviews.

- Helpful-vote/review-vote systems.

- Review search, advanced filters, or ranking algorithms.

- Automated sentiment analysis or AI moderation.

- Modifier/configuration-level meal reactions; v2 reactions remain base-menu-item scoped.

- Public display/ranking of meal-reaction aggregates or per-review meal reactions. v2 does provide anonymous aggregate reaction analytics to authorized Restaurant/Admin users, but public Customer-facing reaction presentation remains deferred.

- Advanced review-fraud and coordinated-manipulation detection, including suspicious low-value-order patterns, device/account clustering, and reputation scoring. v2 still requires a genuine owned delivered order and preserves authorized audit context for later investigation.

- Deleting legacy v1 contracts or historical product reviews.

Each deferred feature requires its own product decision, privacy review, and migration plan.
