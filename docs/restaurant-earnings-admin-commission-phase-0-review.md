# Restaurant Earnings and Admin Commission — Phase 0 Review

**Completed locally:** 2026-09-22  
**Scope:** Phase 0 contract and fixture-only UI review  
**Status:** Accepted by the app owner on 2026-09-22  
**Next phase:** Not authorized

## 1. Outcome and environment boundary

Phase 0 adds two bilingual, responsive, fixture-only review surfaces under `apps/restaurant-ui-mock`:

- `/concepts/earnings` reviews owner-only Restaurant financial reporting.
- `/concepts/admin-commission` reviews commission management within an Admin Restaurant-detail context.

The mock imports no Firebase or Supabase client, environment configuration, credentials, production repository, generated database type, or hosted data. Financial fixtures contain explicit integer-kuruş and integer-basis-point values shaped like future guarded server responses. The UI does not reconstruct authoritative earnings from current catalog, menu, modifier, or Restaurant configuration values.

Only the local workspace and local temporary browser artifacts were read or changed. Development, Staging, and Production were not read, deployed, or mutated. `apps/admin-web`, `apps/restaurant`, Supabase migrations/functions/tests, generated database types, and production application routes were not changed. No build was uploaded, committed, or pushed.

Pre-existing repository work was preserved: `package-lock.json` was already modified and the entire `apps/restaurant-ui-mock/` directory was already untracked before Phase 0 began. Phase 0 intentionally changed only the mock files listed below and the two phase documents.

## 2. Locked product and financial contract

The Phase 0 UI and the authoritative implementation plan confirm the following decisions:

- Admin owns commission configuration. Only an active `super_admin` with recent TOTP may schedule a rule; Restaurant users cannot change rates.
- Active Restaurant owners may view their own Restaurant's earnings. Managers and all other identities remain denied in the first release.
- Commission rules are append-only. Each has an explicit UTC `effective_from`; existing rules are never edited or deleted.
- Rule selection uses the latest applicable `effective_from` not later than the order's authoritative creation time. Scheduling and order creation require a transactional locking/serialization strategy in Phase 1 so backdating or concurrency cannot reinterpret an existing order.
- Every order snapshots its rule, integer `commission_rate_bps`, and additive `commission_contract_version` at creation. New contract versions are additive and non-retroactive.
- Every first transition to `delivered` creates one immutable financial snapshot from the order's immutable monetary snapshot. Canceled and nonterminal orders contribute nothing.
- Currency values are authoritative integer kuruş; rates are integer basis points. For contract version 1:

  ```text
  commission_base_kurus = max(subtotal_kurus - discount_kurus, 0)
  commission_kurus      = floor((commission_base_kurus * rate_bps + 5000) / 10000)
  restaurant_net_kurus  = commission_base_kurus - commission_kurus
  ```

- The reporting timezone is the Restaurant's validated IANA timezone. Existing non-production Restaurants default to `Asia/Famagusta`, intentionally reflecting the Northern Cyprus pilot.
- A Restaurant cannot become active and order-accepting, and the capability cannot be enabled, without an applicable rule. Missing coverage must fail closed and surface through the approved Admin/operational warning path.
- UI copy describes calculated or estimated earnings after Hungrie commission. It never represents values as paid, transferred, settled, withdrawable, payout history, or final accounting profit.
- Refunds, partial refunds, chargebacks, manual monetary corrections, payouts, settlement, bank transfer, invoices, tax, VAT, and discount-funding attribution remain deferred. Their presence before Production activation requires the separately approved contracts defined in the main plan.

## 3. UI review and changed files

### Restaurant Earnings

The Restaurant concept provides daily, weekly, monthly, and bounded custom ranges; eligible gross sales; commission; estimated net; delivered-order count; cash/POS collection breakdown; a trend with a phone-friendly tabular equivalent; and two fixture pages of PII-free delivered-order financial rows. It provides loading, empty, service-error, offline, reconnecting, stale-data, and owner-only permission states in Turkish and English.

The former fixture-only payout-history presentation and runtime `Math.round(gross * rate)` calculation were removed. All displayed financial values now come from explicit server-shaped integer fixtures. Summary collection totals, series totals, and row net values reconcile exactly in the local fixture check.

### Admin commission management

The Admin concept uses a dedicated responsive Admin shell and Restaurant-detail context. It shows the current rule, scheduled next rule, append-only history, exact percentage/effective-time/reason inputs, the UTC cutover instant, and a confirmation dialog showing the old and new rates. It includes loading, empty/missing-rule, permission, validation, idempotent replay, service-error, stale-TOTP, and success states in Turkish and English. Copy states that existing orders retain their original rule and are never recalculated.

### Files changed or created

| File | Reason |
|---|---|
| `apps/restaurant-ui-mock/src/financial-fixtures.ts` | Adds explicit integer financial summaries, series, order rows, and append-only commission-rule fixtures. |
| `apps/restaurant-ui-mock/src/screens/FinancialConceptScreens.tsx` | Implements the bilingual responsive Restaurant and Admin financial concepts and their review states. |
| `apps/restaurant-ui-mock/app/concepts/admin-commission.tsx` | Adds the fixture-only Admin concept route. |
| `apps/restaurant-ui-mock/app/concepts/earnings.tsx` | Routes Earnings to the reviewed financial concept. |
| `apps/restaurant-ui-mock/src/screens/ConceptScreens.tsx` | Removes the old client-calculated payout-history Earnings concept. |
| `apps/restaurant-ui-mock/src/mock-context.tsx` | Adds local query-controlled language/state selection for repeatable UI review. |
| `apps/restaurant-ui-mock/src/ui.tsx` | Allows page headers to wrap safely at narrow widths. |
| `apps/restaurant-ui-mock/README.md` | Documents both routes and the fixture/server-authority boundary. |
| `docs/restaurant-earnings-admin-commission-plan.md` | Records that Phase 0 is implemented and awaiting owner approval; later phases remain unstarted. |
| `docs/restaurant-earnings-admin-commission-phase-0-review.md` | Records Phase 0 contract, checks, evidence, and gate status. |

No file was deleted or renamed.

## 4. Tests, checks, and direct evidence

| Check | Result | Evidence |
|---|---|---|
| Mock TypeScript check | PASS | `npm run typecheck --workspace @hungrie/restaurant-ui-mock`; zero errors. |
| Static web export | PASS | `npm run export:web --workspace @hungrie/restaurant-ui-mock`; 24 routes exported, including both financial concept routes. A prior run emitted Expo's non-failing `NO_COLOR`/`FORCE_COLOR` warning; the final export completed without that warning. |
| Fixture reconciliation | PASS | Local Node assertion: 4 summaries, 5 series points, and 6 order rows passed; cash + POS equals eligible gross, gross − commission equals estimated net, and the monthly series reconciles to the monthly summary. Node emitted a non-failing module-type warning because this ad hoc command directly imported a TypeScript ES module from a package without `type: module`; no package metadata was changed merely to silence it. |
| Prohibited old presentation scan | PASS | No `Payout history`, `Ödeme geçmişi`, or former runtime gross-rate calculation remains under the mock source/routes. |
| Responsive and bilingual matrix | PASS | Automated local Chrome inspection covered both routes in Turkish and English at 360, 390, 768, 1024, and 1440 px: 20/20 combinations contained the expected localized route content and had `scrollWidth === clientWidth`. |
| Required UI states and controls | PASS | Automated local Chrome inspection covered 37/37 total cases: the 20 viewport/language combinations; seven Restaurant states; custom range; page 2; seven Admin states; and the confirmation dialog. Expected content was present with no document-level horizontal overflow. |
| Temporary visual inspection | PASS | Corrected screenshots were kept only under `/tmp/hungrie-phase0-review`. Representative Turkish/English phone, tablet, desktop, custom-range, confirmation, permission, and stale-TOTP captures were inspected. Phone layout defects found during review were corrected and recaptured. |
| Keyboard and labels | PASS | Both routes exposed zero unlabeled interactive elements. Tab traversal reached all 16 enabled Restaurant controls and all 14 enabled Admin controls before returning to the document; native visible focus outlines were present on each interactive target. |
| Enlarged content | PASS | Both routes were rendered locally at 200% Chrome page scale at a 768 px viewport; content remained present and document width did not exceed viewport width. |
| Repository/environment boundary | PASS | Final repository status/diff review confirms no production application or database path changed. No hosted environment was contacted or mutated. |

An initial screenshot attempt used a plain static server without Expo clean-URL rewriting and captured 404 pages. Those captures were rejected as evidence. A clean-URL local server was then used, and only the corrected captures and automated browser results above were reviewed.

## 5. Phase 0 requirement and exit-gate matrix

| Phase 0 requirement or gate item | Status | Direct evidence |
|---|---|---|
| Confirm fixed product decisions and calculation examples | PASS — direct evidence | Contract lock in section 2; fixture reconciliation and explicit 8.00% examples; bilingual UI disclaimers. |
| Confirm intentional `Asia/Famagusta` Northern Cyprus pilot default | PASS — direct evidence | Contract lock in section 2 and timezone displayed on both concepts. |
| Confirm transactional backdating/concurrency rule | PASS — direct evidence | Section 2 fixes the Phase 1 locking/serialization obligation and forbids reinterpretation of existing orders; Admin confirmation presents an exact UTC cutover. No Phase 1 implementation was performed. |
| Confirm additive/non-retroactive contract-version evolution | PASS — direct evidence | Section 2 contract lock plus current-rule copy showing contract version 1 and explicit no-recalculation language. |
| Confirm activation cannot proceed without an applicable rule | PASS — direct evidence | Section 2 contract lock and Admin empty state explicitly block order acceptance pending a guarded initial rule. |
| Confirm owner-only Restaurant financial access | PASS — direct evidence | Restaurant permission state states active-owner-only access and manager denial; state included in the 37/37 browser matrix. |
| Replace mock payout history with non-settlement reporting | PASS — direct evidence | Earnings route now contains period summaries, collection breakdown, trend/table, and delivered-order rows; prohibited old-presentation scan passed. |
| Review responsive Admin and Restaurant wireframes in Turkish and English | PASS — direct evidence | 20/20 viewport/language combinations plus representative visual inspection; no document-level horizontal overflow. |
| No backend or production application changed | PASS — direct evidence | Changed-file inventory and repository boundary review; no Admin/Restaurant production app or Supabase path changed. |
| Product contract accepted by app owner | PASS — direct evidence | The app owner explicitly approved Phase 0 on 2026-09-22. |
| UI accepted by app owner | PASS — direct evidence | The app owner's explicit Phase 0 approval on 2026-09-22 accepts the reviewed UI. |

No Phase 0 requirement is blocked, incomplete, or marked N/A. The app owner's explicit approval on 2026-09-22 closes Phase 0 only and does not authorize Phase 1.

## 6. Limitations, risks, and open items

- These are fixture-only design surfaces, not proof of database calculations, authorization, concurrency, idempotency, immutable snapshots, or query performance. Those belong to Phase 1 and later gates.
- Browser review used local headless Google Chrome. It is not hosted, physical-device, Safari, Edge, Development, or Staging qualification, and it is not represented as such.
- Temporary screenshots are local evidence only and are not tracked artifacts.
- Because `apps/restaurant-ui-mock/` was untracked before Phase 0, Git cannot distinguish its pre-existing content from Phase 0 edits in ordinary status output. The explicit changed-file list above records the Phase 0 touch set; unrelated mock files and the pre-existing `package-lock.json` modification were preserved.
- The repository's `.gitignore` ignores `/docs/`, so the updated main plan and this evidence file exist in the workspace but do not appear in ordinary `git status` output. Nothing was staged to override that repository policy.
- Phase 1 remains unauthorized. No migration, RPC, grant, generated type, database test, production UI integration, deployment, commit, or push was performed.
