# Customer Review System v2 — Phase 0 Evidence

**Completed:** 2026-09-16
**Scope:** Contract lock and read-only Development/Staging baseline only
**Repository baseline:** branch `phase6-customer-first-release-20260914`, commit `f8176622cdd899bc6aebeba76ba89abf8c2f397a`
**Gate:** Pass — no database or application mutation occurred
**Next phase:** Not authorized

## 1. Method and environment boundary

The capture utility at `scripts/capture-customer-review-v2-phase0.mjs` accepts only `development` or `staging`, requires the matching `<target>:review-v2-phase0-read-only` confirmation, rejects a Production reference, rejects shared Development/Staging references, and opens PostgreSQL with `BEGIN TRANSACTION READ ONLY`. Each successful capture proves `transaction_read_only=on` and ends with `ROLLBACK`.

Raw catalog captures are intentionally ignored under `secure/customer-review-v2-phase0/`, mode `0600`. They contain aggregate counts and database catalog definitions only: no review comment values, Customer/profile identifiers, order identifiers, contact data, tokens, or credentials. Project references are not copied into this tracked document.

| Environment | Captured UTC | Applied migrations | Latest migration | Product reviews | Order reviews | Duplicate product keys | Duplicate order keys |
|---|---:|---:|---:|---:|---:|---:|---:|
| Development | 2026-09-16 19:46:22 | 45 | `20260916130000` | 0 | 0 | 0 | 0 |
| Staging | 2026-09-16 19:46:23 | 45 | `20260916130000` | 6 published, 0 hidden | 0 | 0 | 0 |

Capture integrity:

- Development: 145,424 bytes, SHA-256 `c153d4ed1ec2853f35ab99c2fe65d7c28dd2185a62aea77d62acfd11d201de0c`.
- Staging: 146,436 bytes, SHA-256 `6f6670f12096ed422da577d5e457a9ce7041a394928278902aedc3f8db55e1fa`.
- Both environments have identical migration histories, review columns, constraints, indexes, triggers, policies, grants, and views. Two Development function bodies differ from the checked-in/Staging definitions; the exact drift is recorded below.
- Production is absent from the configured project record used by the capture and was neither queried nor mutated.

The release record and approved plan confirm that Hungrie has never had a public Production client or real Production Customer-review data. v1 retention is therefore an additive schema-transition and rollback safeguard, not an installed-client compatibility promise.

## 2. Data and aggregate baseline

Development has no review rows or review metric rows. Its nine catalog Restaurants all have cached `rating_average=0` and `rating_count=0`.

Staging has six published product reviews for one pilot Restaurant, no hidden product reviews, and no order reviews. The product-review aggregate is:

| Rating count | Rating average | Distribution |
|---:|---:|---|
| 6 | 4.33 | 1★: 0, 2★: 1, 3★: 0, 4★: 1, 5★: 4 |

The same pilot Restaurant has cached `restaurants.rating_average=4.33` and `rating_count=6`; the other ten Staging Restaurants have zero cached ratings. Staging has no order-review metric row. Counts reconcile exactly: table totals equal status totals, duplicate groups are zero, and the product-review aggregate count equals the published product-review count.

These six Staging product reviews are pilot data and must remain historical product reviews. They cannot be converted into order reviews because no trustworthy Taste or Speed ratings can be derived from a meal star.

## 3. Legacy schema and dependency lock

### Order reviews

`public.order_reviews` currently requires non-null `speed_rating`, `taste_rating`, and `value_rating`, each constrained to integer values 1–5. `price_performance_rating` is nullable but, when present, must be 1–5. The stored generated column is exactly:

```sql
round((speed_rating + taste_rating + value_rating)::numeric / 3, 2)
```

`user_name_snapshot`, `restaurant_name_snapshot`, `comment`, and `items_snapshot` are also non-null. The logical duplicate defense is `UNIQUE (order_id, profile_id)`; `review_key` is independently unique. The order/Restaurant/profile triple references the authoritative order with `ON DELETE RESTRICT`.

Existing indexes are the primary and unique indexes plus:

- `(profile_id, created_at DESC)`;
- `(restaurant_id, status, created_at DESC)`.

Existing triggers require a delivered order on insert/update, update timestamps, and apply the runtime write fence. There is no order-review aggregate refresh trigger; `restaurant_order_review_metrics` is a live view.

### Product reviews

`public.product_reviews` requires a 1–5 meal star and non-empty Customer/menu-item name snapshots. Its duplicate defense is `UNIQUE (order_id, menu_item_id, profile_id)`. Foreign keys bind it to the authoritative order and menu item with `ON DELETE RESTRICT`.

Indexes cover profile recency, Restaurant/status recency, menu/status recency, primary key, review key, and the logical uniqueness key. Triggers enforce delivered-order status, timestamp/runtime fences, product metric refresh, and reply notification audit.

### Views and dependencies

The catalog confirms these direct dependent views:

- `order_reviews` → `published_order_reviews`, `restaurant_order_review_metrics`;
- `product_reviews` → `published_product_reviews`, `menu_item_review_metrics`, `restaurant_product_review_metrics`.

Current order metrics use `avg(average_rating)`, `avg(speed_rating)`, `avg(taste_rating)`, `avg(value_rating)`, and `avg(coalesce(price_performance_rating,value_rating))`. Current product metrics maintain the cached `restaurants.rating_average/rating_count` values used by Customer catalog surfaces.

The generated database types contain both tables, both published views, the v1 submission RPC, both summary RPCs, and Restaurant moderation RPCs, matching the hosted catalogs.

### Hosted function drift

Despite the matching 45-entry migration histories, `public.list_my_product_reviews(integer)` and `public.list_my_order_reviews(integer)` differ in Development. Development uses `SELECT *` inside each Customer-owned query; Staging and the checked-in `20260903230000_milestone_4_repository_support.sql` migration use explicit privacy-hardened column projections. No other captured function differs.

The ownership predicate remains present in both Development functions, so this is not a cross-Customer disclosure. It is still contract drift: Development returns the owning Customer's `order_id`, `profile_id`, and `review_key` fields that the reviewed Staging/source definition omits. Phase 1 must treat the checked-in/Staging projection as the canonical v1 definition, add an explicit preflight/reconciliation check, and ensure the additive v2 migration does not silently preserve or widen the Development-only `SELECT *` shape. No hosted correction is authorized in Phase 0 or Phase 1.

## 4. Legacy RPC, policy, and grant behavior

`submit_my_customer_order_review_v1(...)` first calls `private.require_active_customer()` and delegates unchanged to `submit_order_review(...)`. Both signatures require `p_value_rating`; the guarded v1 wrapper also exposes `p_price_performance_rating` as a required argument. The underlying function:

- validates Speed, Taste, and Value as 1–5 and optional F/P as 1–5;
- trims and limits the comment to 500 characters;
- requires an owned delivered order;
- snapshots the Customer name, Restaurant name, and order items;
- inserts one row and writes an audit event.

There is no 30-day window or stable operation UUID in v1. v1 reads return full table rows to the owning Customer. Restaurant v1 reads return Customer name snapshots. `restaurant_moderate_review_v1` and the older `moderate_review` permit Restaurant members to hide/publish reviews; this violates the locked v2 report-only rule and must be superseded for v2 without changing v1 during transition.

RLS is enabled and forced on both review tables through three policy classes on each table:

- `anon`: published rows only;
- `authenticated`: published rows, owned rows, own-Restaurant rows, or Admin rows;
- `hungrie_api_owner`: all operations.

Client roles have no direct insert, update, or delete column privileges. However, anonymous/authenticated SELECT grants on the base tables and existing published views currently include `user_name_snapshot`; published order projections also include legacy Value/F/P and `average_rating`. These are known current-state privacy/contract gaps. v2 must expose curated projections with no identity fields and must not broaden base-table writes.

The Customer submission RPCs and Restaurant moderation RPC are executable by `authenticated` (plus owner/service roles); public summary RPCs are executable by `anon` and `authenticated`. `restaurant_list_reviews_v1` also retains a `PUBLIC` execute grant, although its internal `private.require_active_restaurant()` guard fails closed for an unauthorized caller. Phase 1 must explicitly review and narrow every new v2 grant and must not rely on a body guard as a substitute for least-privilege execute grants.

## 5. Current consumers and competing metric sources

| Surface | Current source/behavior | Required v2 change later |
|---|---|---|
| Customer order detail | `OrderDetailsScreen` + `ReviewSheet`; submits separate product stars and restores reviewed menu-item IDs | Replace with one eligible order-level v2 action/sheet |
| Customer order-review card | `OrderReviewCard` + `OrderReviewSheet`; requires Speed, Taste, and Value | Replace with Taste/Speed/comment/reactions contract |
| Public Restaurant reviews | `mobile/app/restaurant-reviews/[id].tsx`; order summary/list, masked-name fallback, F/P card, offset-like fixed limit, Restaurant cached-rating fallback | Anonymous v2 projection, no name surrogate/F/P, keyset cursor, sole v2 summary |
| Home and Search | `HomeScreen` and Search read catalog `ratingAverage/ratingCount` | Read the database-owned v2 order-review summary |
| Restaurant details/menu/cart | `RestaurantMenuScreen`, Restaurant/menu repositories, and cart model read cached Restaurant rating fields | Remove as v2 rating fallback/competitor |
| Supabase review repository | Reads `published_product_reviews`, `published_order_reviews`, product/order summaries; client-calculates one fallback summary | Add guarded v2 reads and remove competing calculation/fallback |
| Restaurant web | `apps/restaurant/src/ReviewsPage.tsx` lists product/order reviews with Customer names and provides Publish/Hide controls | Anonymous v2 review/report-only presentation |
| Legacy mobile Restaurant panel | `mobile/app/restaurantpanel/reviews.tsx` reads/moderates order reviews | Must not remain a v2 visibility path |
| Admin web | No dedicated review consumer exists | Phase 6 adds separately authorized inspection/report/moderation contracts |

The runtime repository selector already fails closed to Supabase for non-auth domains. Firebase review service files remain source-history/adapter implementations, but current runtime data selection does not silently fall back to them.

The exact competing sources to remove from new Customer surfaces are:

1. `get_restaurant_product_review_summary` and `published_product_reviews` totals.
2. `get_restaurant_order_review_summary` legacy three-score output.
3. `restaurants.rating_average/rating_count` and their `ratingAverage/ratingCount` mappings.
4. The public review page’s `summaryFromRestaurantDoc` fallback.
5. Client-side `calculateRestaurantOrderReviewSummary` calculations.

## 6. Locked v2 contract

- Eligibility is evaluated transactionally on the server as `server transaction time < delivered_at + interval '30 days'`; the exact expiry instant and later are denied. Device time, locale, DST, and calendar dates are irrelevant.
- One review exists per Customer/order. The order must belong to an active Customer and be delivered.
- Required scores are Taste and Speed, integer 1–5. Overall is `(taste + speed) / 2`; Restaurant metrics are database-owned published-review averages/counts.
- The comment is optional, server-trimmed, Unicode-normalized to NFC, and limited to 500 characters. Canonical hashing uses `normalize(btrim(coalesce(comment,'')), NFC)` and does not collapse internal whitespace.
- Meal reactions are optional `liked`/`disliked` values for distinct base menu-item IDs. Configured lines with the same base ID share one reaction. The payload maximum is 100 reactions, matching the authoritative maximum of 100 configured order lines in `private.build_order_quote_v2`.
- Before hashing, reactions are validated, deduplicated by rejection, and sorted lexically by menu-item ID. Hash input uses only the normalized contract fields, not raw JSON property or array order.
- The same stable operation UUID plus the same canonical request returns the original review with `replayed=true`; reuse with changed canonical input is rejected.
- Order History may show compact actions for every eligible order but at most one prominent prompt, targeting the most recently delivered eligible unreviewed order.
- Public and Restaurant review contracts contain no Customer name, mask, initials, avatar identity, profile/Firebase ID, order ID, operation ID, contact/address/payment data, exact order timestamp, or per-review meal reaction.
- Restaurant users may create one report per Restaurant/review using only the six approved reason codes and an optional trimmed 500-character internal note. Report status is `open`, `resolved`, or `dismissed`; only Admin may resolve, dismiss, or reopen.
- Restaurant reports never change visibility. Only authorized audited Admin actions may hide or restore; neither role may edit Customer scores/comments.
- Restaurant/Admin meal feedback is aggregate-only: liked count, disliked count, and nullable positive percentage. Admin-hidden review reactions are excluded.
- Existing v1 rows and product reviews remain unchanged. Existing order rows become contract version 1. v2 never fabricates Value/F/P and never uses the legacy three-score average.
- All new Customer rating surfaces use one database-owned v2 order-review summary, with no product-review or cached legacy fallback.

## 7. Locked Customer copy

| Intent | English | Turkish |
|---|---|---|
| Entry action | Review order | Siparişi değerlendir |
| Completed | Reviewed | Değerlendirildi |
| Sheet title | How was your order? | Siparişin nasıldı? |
| Delivered context | Review your delivered order from {restaurant}. | {restaurant} siparişini değerlendir. |
| Taste | Taste | Lezzet |
| Speed | Speed | Hız |
| Speed help | Preparation and delivery speed | Hazırlama ve teslimat hızı |
| Comment | Comment (optional) | Yorum (isteğe bağlı) |
| Comment placeholder | Tell us about your order… | Sipariş deneyimini anlat… |
| Meal section | How were the meals? (optional) | Yemekler nasıldı? (isteğe bağlı) |
| Like / dislike | Liked / Disliked | Beğendim / Beğenmedim |
| Submit | Submit review | Değerlendirmeyi gönder |
| Submitting | Submitting… | Gönderiliyor… |
| Discard title | Discard this review? | Değerlendirmeden vazgeçilsin mi? |
| Discard body | Your ratings, comment, and meal reactions will be lost. | Puanların, yorumun ve yemek tepkilerin kaybolacak. |
| Keep editing | Keep editing | Düzenlemeye devam et |
| Discard | Discard and close | Vazgeç ve kapat |
| Public explanation | Reviews from delivered orders | Teslim edilen siparişlerden gelen değerlendirmeler |
| Empty public state | No order reviews yet. | Henüz sipariş değerlendirmesi yok. |
| Load more | Load more reviews | Daha fazla değerlendirme yükle |
| Retry | Try again | Tekrar dene |

Error copy remains category-specific and non-enumerating:

| Category | English | Turkish |
|---|---|---|
| Session | Your session expired. Sign in again. | Oturumun sona erdi. Tekrar giriş yap. |
| Access | Your account cannot submit reviews. | Hesabın değerlendirme gönderemiyor. |
| Ownership/access | This order is unavailable for review. | Bu sipariş değerlendirilemiyor. |
| Not delivered | Reviews open after delivery. | Değerlendirme teslimattan sonra açılır. |
| Expired | The 30-day review period has ended. | 30 günlük değerlendirme süresi sona erdi. |
| Duplicate/recovered | This order has already been reviewed. | Bu sipariş zaten değerlendirildi. |
| Invalid meal | One or more meals are not part of this order. | Bir veya daha fazla yemek bu siparişe ait değil. |
| Invalid input | Check the ratings, comment, and meal reactions. | Puanları, yorumu ve yemek tepkilerini kontrol et. |
| Temporary failure | We could not submit your review. Try again. | Değerlendirmen gönderilemedi. Tekrar dene. |

Star controls must expose localized semantic values such as “Taste, 4 of 5” and “Lezzet, 5 üzerinden 4”, announce changes, and never rely on color alone.

## 8. Wireframe review

The static artifact is [customer-review-system-v2-phase-0-wireframes.svg](customer-review-system-v2-phase-0-wireframes.svg). It covers English/light and Turkish/dark/large-text review sheets, the anonymous public page, loading/empty/offline/error/reviewed/expired states, keyset loading, 44-point targets, safe areas, keyboard reachability, reduced-motion intent, discard protection, and authoritative recovery.

It uses the checked-in Hungrie token values: primary `#FE8C00`, light background `#F8FAFC`, dark background `#0F1115`, existing surface/border roles, radii 16/24/32, and the ChairoSans family. It deliberately renders no Customer name, avatar, initials, identity placeholder, F/P, Service score, or per-review reaction.

## 9. Phase 0 gate and limitations

Phase 0 passes: behavior, formulas, bilingual copy, privacy exclusions, reaction bound, canonicalization, authority boundaries, accessibility intent, and wireframes are locked. Development and Staging evidence was captured read-only and reconciled. No migration, database write, application behavior change, deployment, code generation, build, EAS action, or Production access occurred.

Known risks intentionally carried into Phase 1 and later:

- Development has the two broader `SELECT *` Customer-list helper bodies described above despite matching migration history; the canonical Staging/source definitions must be checksum-qualified before any Development migration is applied.
- Current base-table/public grants expose name snapshots and current Restaurant tooling can alter visibility; the v2 migration must introduce safe contracts before any v2 UI ships.
- Staging has only product-review pilot data and no order-review rows, so representative legacy order-row reconciliation must be proven with local fixtures before hosted qualification.
- Current indexes lack the `(created_at, id)` tie-breaker and there is no v2 report, reaction, or idempotency relation.
- The SVG is a static contract artifact, not a device-layout pass; physical keyboard, large-text, screen-reader, contrast, and reduced-motion qualification remains required in Phases 4 and 8.
- No advanced fraud detection is included beyond genuine owned delivered-order enforcement and audit context.

Phase 1 is limited to authoring and locally validating the additive migration, guarded v2 contracts, indexes, pgTAP coverage, reconciliation, and rollback/forward-fix procedure. It does not authorize applying anything to Development, Staging, or Production.
