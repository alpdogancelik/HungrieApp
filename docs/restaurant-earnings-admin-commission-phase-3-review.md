# Restaurant Earnings and Admin Commission — Phase 3 Review

**Completed:** 2026-09-22  
**Scope:** Local Restaurant Earnings implementation only  
**Gate:** Accepted by the app owner on 2026-09-22

## Accepted Phase 1 contract preflight

The accepted Phase 1 migration and Phase 1 evidence were inspected before the Restaurant repository, provider, navigation, range, or pagination implementation. The migration SHA-256 remains `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`.

All three Restaurant earnings RPCs call `private.require_restaurant_owner()` and derive Restaurant scope with `private.current_restaurant_id()`. None accepts a Restaurant ID from the client.

### Actual response contracts

`restaurant_get_earnings_summary_v1(date, date)` returns exactly:

- `restaurantId`, inclusive `from` and `to`, validated `reportingTimezone`, and `currencyCode: "TRY"`;
- integer `eligibleGrossKurus`, `commissionKurus`, `estimatedNetKurus`, and `deliveredOrderCount`;
- complete `cash` and `pos` payment breakdowns containing those same four metrics.

`restaurant_get_earnings_series_v1(date, date, text)` returns the same identity/range/timezone/currency values, the requested `bucket`, and ordered `points`. Each point contains `bucketStart`, all four financial/count metrics, and complete cash/POS breakdowns. Supported buckets are exactly `day`, `week`, and `month`. PostgreSQL `date_trunc('week')` produces Monday bucket starts. Filtering remains on the requested half-open UTC conversion, so partial weeks and months contain only rows matching the requested inclusive local dates; the client does not expand the range.

`restaurant_get_earnings_orders_page_v1(date, date, text, integer)` returns identity/range/timezone/currency, the authoritative clamped `limit`, `items`, and explicit nullable `nextCursor`. A row contains an eight-character uppercase reference, delivery timestamp, `cash | pos`, `TRY`, integer eligible gross, integer rate basis points, commission, and estimated net. It contains no Customer identity or editable financial field.

The page default is 25 and values are clamped to 1–50. Phase 3 explicitly requests 25. Ordering is `(delivered_at DESC, order_id DESC)`; the cursor represents the last visible tuple and retrieves strictly older rows. Its internal base64 timestamp/order-ID encoding is a server implementation detail. The client treats it as a bounded opaque value: it is forwarded unchanged, never decoded, displayed, persisted, or logged. `nextCursor` is `null` at the end. Because the response intentionally omits the underlying order ID, the client can validate descending delivery timestamps but cannot independently validate the hidden tie-break ordering; the accepted database implementation and Phase 1 tests remain authoritative for equal-timestamp order-ID ties.

All ranges are inclusive Restaurant-local calendar dates. One date is valid, reversed ranges fail, and `p_to - p_from <= 365` permits exactly 366 dates. The database alone converts the validated Restaurant-local dates to a half-open UTC interval. No Phase 1 contract mismatch was found.

### Existing Restaurant authorization contract

The existing provider previously exposed only readiness even though `AuthGate` already made the single `get_my_access_context_v1` request. The provider now retains the strictly parsed Restaurant branch from that same request and continues to expose `useRestaurantAccessReady()` unchanged for existing consumers. No parallel access request or authorization model was added.

Malformed access responses clear any prior Restaurant context and fail closed. An active owner of an active Restaurant sees the Earnings navigation. An active manager can reach the direct route only as a permission state and makes no earnings RPC call. Pending, suspended, revoked, closed, unmapped, wrong-portal, malformed, and unauthenticated states receive no actionable financial interface through the existing gate. Every reporting RPC independently repeats the database owner check.

## Implemented Restaurant contract

- Added the statically exported `/earnings` route to the real Restaurant shell.
- Added bilingual summary cards, cash/POS breakdowns, accessible trend rows, and PII-free delivered financial rows.
- Added daily, trailing-seven-date weekly, full-current-calendar-month, and bounded custom ranges.
- The first preset uses the approved `Asia/Famagusta` fallback. After the first authoritative response, presets use its reporting timezone; if that changes selected local dates, the screen reloads the adjusted range.
- Series density is `day` for 1–31 dates, `week` for 32–180, and `month` for 181–366. The selected range is never expanded.
- Summary, series, and the first 25-row page load together. Abort and generation guards prevent an older range or pagination request from overwriting newer data.
- Pagination keeps an in-memory cursor/page stack. Next forwards the opaque server cursor, Previous uses an already-loaded page, range changes reset the stack, and the screen displays only `Page N`.
- Initial offline rendering sends no request. Loss of connectivity preserves only already-loaded in-memory authoritative data, marks it stale with the last refresh time, disables range/forward actions, and automatically refreshes after reconnection.
- The existing service worker has no fetch handler or Cache API access. No financial response is written to browser storage or a client cache.
- English/Turkish copy states that the values are calculated estimates, not payouts, transfers, settlements, withdrawable balances, invoices, tax calculations, or final accounting profit. Taxes, VAT, refunds, chargebacks, and later adjustments remain excluded.

## Strict repository validation

The repository rejects missing or extra fields and invalid dates, timestamps, IANA zones, currency, integer amounts/counts/rates, payment methods, references, limits, cursor bounds, buckets, ordering, or cross-response identities. It enforces:

- `eligible gross - commission = estimated net` for totals, breakdowns, points, and rows;
- cash plus POS equals each summary/point metric and delivered count;
- series totals equal the simultaneously loaded summary;
- first-page emptiness agrees with the summary count;
- Restaurant, range, timezone, currency, and bucket identities agree across responses;
- day, Monday-based week, and first-of-month bucket semantics, including partial boundary buckets;
- delivered timestamps fall within the returned Restaurant-local range;
- an authoritative page limit of 25 for this client.

Frontend arithmetic is limited to validation and formatting server-returned integer kuruş/basis-point values. It never calculates authoritative commission, net, aggregates, points, or rows.

## Authorization matrix

| Context | Navigation | Direct route | Earnings RPC |
|---|---:|---:|---:|
| Active owner, active Restaurant | Visible | Financial UI | Allowed; server rechecks |
| Active manager, active Restaurant | Hidden | Permission state | Not called |
| Pending/suspended/revoked account | Hidden through existing gate | Non-actionable gate state | Not called |
| Pending/suspended/closed Restaurant | Hidden through existing gate | Non-actionable lifecycle/gate state | Not called |
| Unmapped, Customer, Admin, malformed context | Hidden | Non-actionable/sign-out/error state | Not called |
| Anonymous | Hidden | Login redirect | Not called |
| Server permission rejection after client preflight | Client state is not authoritative | Permission state | RPC denial wins |

## Automated qualification

`npm run test:restaurant-earnings-phase3` passed 11 of 11 tests:

1. Range validation accepts one and 366 inclusive local dates and rejects reversed, 367, and invalid dates.
2. Presets implement today, trailing seven dates, full month, leap day, and year rollover in the Restaurant timezone.
3. Automatic series density changes exactly at 31/32 and 180/181 without expanding the requested range; a partial ISO-week fixture retains its exact range.
4. Summary, series, and page parsers enforce exact contracts and reconciliation.
5. Page parsing accepts the server bounds 1, 25, and 50 while the Phase 3 bundle requires explicit size 25.
6. Opaque cursors are forwarded unchanged, null ends pagination, previous pages remain in memory, and reset clears them.
7. Request generations reject older range and pagination results.
8. The repository invokes only the three approved owner-scoped RPCs with exact arguments.
9. The repository classifies permission, validation, network, service, and malformed responses without leaking raw messages.
10. Restaurant access parsing retains one validated provider context and owner gating denies all other role/status/lifecycle/context branches.
11. The real route source preserves offline data in memory, exposes bilingual states, and never calculates commission.

| Check | Result |
|---|---|
| Phase 3 static contract/security checker | PASS |
| Restaurant TypeScript check | PASS |
| Production Restaurant web export | PASS; 19 static routes including `/earnings` |
| Exported route file verification | PASS; `dist/earnings.html` exists |
| Existing Restaurant route/header/service-worker security check | PASS; 14 baseline routes, 0 cache handlers, 7 headers |
| `git diff --check` | PASS |
| Protected-file SHA-256 comparison | PASS |

## Responsive and accessibility review

A local headless-Chrome review used the shipped Restaurant stylesheet and deterministic PII-free representative earnings/state markup. Screenshots and the browser harness remain only under `/tmp/hungrie-phase3-*`; none was added to the repository. English and Turkish long-copy layouts, large currency values, custom dates, trend rows, history rows, pagination, and required state cards were exercised. The 360, 390, and 1440 px captures were visually inspected.

| Width | Document client/scroll width | Financial content clipped | Focus outline | Semantic probes |
|---:|---:|---:|---:|---:|
| 360 | 345 / 345 | 0 | 3 px | 2 labelled date inputs; 2 labelled trend values |
| 390 (Turkish long copy) | 375 / 375 | 0 | 3 px | 2 labelled date inputs; 2 labelled trend values |
| 768 | 753 / 753 | 0 | 3 px | same |
| 1024 | 1009 / 1009 | 0 | 3 px | same |
| 1440 | 1425 / 1425 | 0 | 3 px | same |

The narrow shell intentionally keeps its primary navigation in an independently keyboard-scrollable horizontal region. The financial document itself has no horizontal overflow. A separate 360 px, 200% root-text probe initially exposed pagination/table-header overflow; the responsive rules were corrected. The rerun produced equal `clientWidth`/`scrollWidth` (`345 / 345`) with no clipped financial element. Buttons and inputs are keyboard reachable, focus is visible, date controls have explicit labels, trend progress values have accessible names, table headers remain available to assistive technology on the mobile card layout, and long values wrap rather than clip.

Limitation: no privileged Firebase Restaurant-owner credential or hosted backend was introduced for this local-only phase. Visual review therefore used deterministic local markup with the shipped CSS; authorization, RPC arguments/responses, state transitions, race handling, and reconciliation are qualified independently by focused tests, source/static checks, and the production export. Hosted identity and data qualification remains Phase 4, not Phase 3.

## Changed-file inventory

- `apps/restaurant/app/earnings.tsx`
- `apps/restaurant/src/EarningsPage.tsx`
- `apps/restaurant/src/earningsModel.ts`
- `apps/restaurant/src/earningsRepository.ts`
- `apps/restaurant/src/RestaurantAccessContext.ts`
- `apps/restaurant/src/AuthGate.tsx`
- `apps/restaurant/src/Shell.tsx`
- `apps/restaurant/src/styles.css`
- `scripts/test-restaurant-earnings-phase3.mjs`
- `scripts/check-restaurant-earnings-phase3.mjs`
- root `package.json` script registration only
- this review and the main plan status line

No migration, RPC, generated database type, shared domain contract, Admin application file, dependency, or lockfile was changed in Phase 3.

## Environment and protected boundary

All inspection, edits, tests, builds, and browser rendering occurred in the local workspace. Development, Staging, and Production were not contacted. No database mutation/reset, hosted read/write, deployment, commit, push, or Phase 4 work occurred.

Protected hashes after qualification:

- `package-lock.json`: `784150a7b56cfe45c137673fa3fe52d131c1af6aa4b15426d1b14a71aca96155`
- generated database types: `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37`
- shared domain types: `8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe`
- accepted Phase 1 migration: `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`
- accepted Phase 2 Admin component: `bccfd9c1d8112ee8f1dfd90dbd87a5f9dc0f231584369d60e526802236cc95d4`
- accepted Phase 2 model: `6e24854bbcc1f8b7fe40619d9def0f89cc6eb8ce162e1a8965ff2aaa3b9dee60`
- accepted Phase 2 repository: `b385d5a3a74d89ac778fa01ad1cca2e73c57a7d30d704839b7395b9e87a75a68`

Pre-existing Phase 0–2 work, `package-lock.json`, the Phase 1 migration/types/seed/tests/harness, unrelated concurrency scripts, and `apps/restaurant-ui-mock` were preserved.

## Requirement and exit-gate matrix

| Requirement or gate | Status | Direct evidence |
|---|---|---|
| Inspect actual Phase 1 RPCs/evidence before client work | PASS | Preflight section and matching migration SHA-256 |
| Verify summary, series, page fields and reconciliation | PASS | Actual contract inventory and focused tests 4 and 8 |
| Verify pagination default/bounds/cursor/order/end semantics | PASS | Migration inspection plus focused tests 5–6 |
| Verify one-to-366 inclusive Restaurant-local date contract | PASS | Migration inspection plus focused test 1 |
| Verify day/week/month and partial-boundary semantics | PASS | RPC inspection plus focused test 3 |
| Extend the existing provider without a parallel access query | PASS | Provider/AuthGate implementation and static single-RPC assertion |
| Owner-only navigation and no manager RPC | PASS | Authorization matrix, focused test 10, component owner guard |
| Strictly validate all consumed backend responses | PASS | Repository validation section and focused tests 4–5, 8–9 |
| Server-derived financial UI with no client authority | PASS | Focused test 11 and static arithmetic check |
| Approved preset and bucket policies | PASS | Focused tests 2–3 |
| Cancellation/generation race protection | PASS | Focused test 7 and guarded load/pagination paths |
| Opaque 25-row in-memory pagination | PASS | Focused tests 5–6 and exact RPC arguments |
| Loading/empty/permission/malformed/validation/network/service/offline/reconnecting/stale states | PASS | Explicit bilingual branches, classifier/source tests, state render review |
| No financial persistence or service-worker caching | PASS | Static check and existing security check reporting 0 cache handlers |
| Complete English/Turkish non-settlement copy and no Customer PII | PASS | Static bilingual/privacy checks and responsive review |
| Five-width keyboard/focus/labels/200%-text qualification | PASS | Responsive table and corrected rerun evidence |
| Restaurant typecheck/tests/security/export/route/diff checks | PASS | Automated qualification table; 11/11 focused tests |
| Preserve migrations/RPCs/types/Admin/dependencies/lockfile | PASS | Protected hashes and changed-file inventory |
| Total-page display | N/A | Backend intentionally provides no count; UI correctly displays only `Page N` |
| Persistent offline financial cache | N/A | Explicitly prohibited; data remains in memory only |
| Local-only environment boundary and no Phase 4 work | PASS | Environment boundary and repository review |
| App-owner Phase 3 approval | PASS | Explicitly approved on 2026-09-22 |

## Phase boundary

All Phase 3 requirements and exit gates pass. Phase 3 was accepted by the app owner on 2026-09-22. Phase 4 has not started and remains separately gated.
