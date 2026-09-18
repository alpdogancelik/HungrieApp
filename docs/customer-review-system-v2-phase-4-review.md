# Customer Review System v2 — Phase 4 Review

**Implementation date:** 2026-09-17

**Result:** Pass

**Boundary:** Local Customer UI, tests, preview tooling, and documentation only. No Development, Staging, or Production access or mutation, database/schema change, generated-type regeneration, deployment, or EAS build occurred.

## Implemented Customer experience

- Replaced Order Details' meal-by-meal review controls with one authoritative order-level review state/action and the v2 Taste/Speed submission sheet. Historical v1 and product-review repository contracts remain available but are not invoked by Order Details.
- Added an Order History prompt sourced from `get_my_customer_review_prompt_v2`, limited to the one newest eligible unreviewed delivered order. Delivered rows expose compact Review/Reviewed states only after their Customer-owned state check; newly paged rows are checked once and visible rows are revalidated on focus/foreground.
- Added a profile-scoped availability store that deduplicates concurrent checks by order, clears in-memory state on account changes, and publishes only `checking`, `eligible`, `reviewed`, `expired`, or unavailable states derived from the server response. Device time is not used for eligibility.
- Both entry points force a fresh authoritative state read before opening and before submitting. Foreground recovery first marks known states checking, preventing a stale Review action from rendering.
- Added a module-level profile/order submission mutex. Concurrent UI callers share one in-flight durable submission, while the database uniqueness/idempotency contract remains the final protection.
- Confirmed submission, exact replay, and authoritative duplicate recovery close the sheet once and publish Reviewed. Expiry/already-reviewed responses reconcile and close; retryable failures retain the draft and durable operation UUID.
- Explicit discard clears the durable pending operation. Secure persistence remains limited to `orderId`, `restaurantId`, `operationId`, `canonicalDraftHash`, and `createdAt`; comments and reactions are never persisted.

## Sheet, copy, and accessibility contract

- Required Taste/Lezzet and Speed/Hız are the only scores. The locked help text is “Preparation and delivery speed” / “Hazırlama ve teslimat hızı”; no Service score or legacy Value/F/P control is present.
- Optional comments trim ordinary boundary spaces, normalize to NFC, preserve tab/newline/carriage return, reject other control characters, and enforce 500 Unicode code points.
- Configured lines are grouped by base menu-item ID, quantities are summed, and the first stable snapshot name is retained. Reactions are optional `liked`/`disliked` selections per distinct base ID, and pressing the selected reaction clears it. The client and database both enforce the 100-item ceiling.
- Every star has a 44-point target, localized radio semantics such as `Taste, 4 of 5`, selected state, outline/filled icon, and visible numeric value. Rating changes, validation, errors, and success use accessibility announcements; missing scores move focus to the first incomplete group.
- Reaction buttons expose button/selected semantics, icon, text, and an explicit checkmark. Meaning is not color-only.
- The sheet uses scrollable content, a keyboard-avoiding container, safe-area footer padding, wrapping controls/text, theme tokens, and no fixed-height text container. Reduced motion changes the modal transition from slide to none.
- Cross-platform in-sheet discard confirmation covers ratings, comments, reactions, and retained uncertain operations. Submission disables close, discard, and duplicate submission paths.
- `review-v2-preview` is fixture-only, performs no repository/network calls, is redirected away in non-development builds, and exposes English/Turkish, light/dark, open, retry-error, and submitting states with long/grouped item names.
- Android emulator follow-up (Pixel_9, Android 17) found and corrected two preview-state defects: the fixture-only submitting toggle now releases automatically after 2.5 seconds, and retry failures render in a persistent assertive banner above the action footer instead of below off-screen meal content. The banner text and `Try again` action were confirmed through the Android accessibility hierarchy; a focused regression assertion covers the visible message, retry action, and non-color alert icon.

## Automated gate evidence

| Check | Result |
|---|---|
| Focused Phase 4 component/controller suite | Pass; 19 tests in 2 suites, zero failed/skipped |
| Focused v2 repository suite | Pass; 8 tests |
| Mobile repository/auth suite | Pass; 112 tests, including concurrent submission mutex coverage |
| Complete JavaScript/repository gate | Pass; 251 tests, zero failed/skipped |
| Clean local Supabase reset | Pass; 46 migrations applied locally |
| Local database lint | Pass; `results: []` |
| Focused v2 pgTAP | Pass; 90/90 assertions |
| Complete pgTAP suite | Pass; 754/754 assertions |
| Existing concurrency harnesses | Pass; all three |
| Review concurrency harness | Pass; two operation IDs produced one review, one reaction, one operation/audit result, and one published metric contribution |
| Direct-RPC duplicate/replay contract | Pass; exact replay returns replayed and creates no duplicate; changed operation reuse fails |
| Exact UTC expiry contract | Pass; a delivered order at the exact 30-day transaction-time boundary is rejected |
| Package builds | Pass; config, domain, and database-types |
| Typechecks | Pass; Customer, Restaurant, and Admin |
| Customer Expo lint | Pass; zero errors/warnings |
| Local Expo exports | Pass; web (46 routes, 6.24 MB bundle), iOS (12.1 MB Hermes), Android (12.1 MB Hermes) |
| Native iOS simulator compile | Pass after locally disabling Sentry source-map upload; no upload or EAS build occurred |
| Migration checksum | Unchanged: `5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b` |
| Generated database-types checksum | Unchanged: `8cc753f9d876f5af9c555dbd9993aafad5ea46d58b10947c4fecc7b33d8a4c2a` |
| Credential/privacy/source scans | Pass; no credential pattern in Phase 4 sources and no Customer identity/order/operation/raw-reaction fields added to public or Restaurant models |
| Customer legacy-control source scan | Pass for Order History/Details; the unrelated historical product-review hook remains intentionally available |
| `git diff --check` | Pass |

The complete pgTAP run emits the existing informational warning that a Phase 5 order invalidation fixture is skipped, but TAP reports all 754 assertions as executed and passing; no test is marked skipped.

## Local visual evidence

- The development fixture was rendered through local Metro in headless Chrome at desktop width and under an emulated 390-point mobile viewport. The sheet stayed within its 560-point desktop cap and within the mobile viewport; its header wrapped, cards and reactions remained scrollable, and the safe footer remained visible. A discovered headless-Chrome viewport-width mismatch was fixed by using `width: 100%` with a web-only `maxWidth`, then recaptured with device-metric emulation.
- Light English desktop and light English mobile fixture captures were inspected locally. The component suite separately verifies Turkish copy and reduced-motion behavior.
- The initial headless iPhone 17 Pro simulator (iOS 26.2) attempt was blocked before React rendered by an Expo development-launcher `keyWindow` failure, not application code. The repository owner subsequently reported the complete iPhone English/Turkish, light/dark, large-text, keyboard, VoiceOver, safe-area, and reduced-motion interaction matrix passing on 2026-09-17.
- The repository owner reported the complete physical Google Pixel 9 / Android 17 matrix passing on 2026-09-17, including English/Turkish, light/dark, enlarged font and display scaling, software keyboard, TalkBack, Android back behavior, touch targets, long/grouped content, submitting/retry behavior, scrolling, and reduced motion.

Temporary screenshots and derived builds were kept outside the repository under `/tmp`; they are qualification artifacts, not shipped assets.

## Security and compatibility findings

- No private review RPC is issued before the root access gate confirms an active Customer and a Supabase profile ID. Account changes clear availability state and use profile-scoped secure-storage keys.
- The client never computes the 30-day window. Opening and submission require the server's `eligible` result; the database still enforces `transaction_timestamp() < delivered_at + interval '30 days'` in UTC.
- Draft hashing continues to use the NFC-normalized, ordinary-space-trimmed comment plus reactions lexically sorted by menu-item ID. Uncertain transport failures retain the same UUID; changed drafts replace it.
- Public/Restaurant contracts were not expanded and still cannot expose Customer identity, order PII, operation metadata, or raw per-review reactions. Restaurant visibility authority was not introduced.
- V2 Customer rating consumers remain summary-only. No product-review cache is invalidated and no `restaurants.rating_*`, product-review, or stale legacy metric fallback was added.
- V1 rows/contracts and historical product-review functionality remain untouched. No Value/F/P value is fabricated.
- `npm audit --omit=dev` reports 33 advisories in the current dependency tree (2 low, 17 moderate, 14 high, 0 critical), primarily in the Expo/Metro toolchain. Phase 4 adds test-only packages and does not perform the major Expo upgrades suggested by the audit; this remains release-dependency work outside this phase.

## Physical Android checklist

**Device:** Google Pixel 9
**OS:** Android 17
**Tester:** Repository owner
**Date:** 2026-09-17
**Configurations:** English and Turkish; light and dark; default and enlarged font/display scaling; TalkBack and reduced motion exercised.

Use the already-installed local development client; do not start an EAS build. From the repository root, run `npm --prefix mobile start -- --dev-client --clear`, connect the device to the displayed local Metro session, then open `fastfood://review-v2-preview` (or navigate to `/review-v2-preview` from the development launcher). The route is deliberately unavailable in non-development builds and makes no application API calls.

| Case | Result |
|---|---|
| English and Turkish copy, including the preparation-and-delivery Speed definition | Pass |
| Light and dark themes; selected/unselected stars and reactions remain distinguishable | Pass |
| Large font and display scaling; no clipped text, controls, or fixed-height containers | Pass |
| Software keyboard open/close; comment and footer remain reachable with no keyboard gap | Pass |
| TalkBack labels, selected state, announcements, validation focus, and traversal order | Pass |
| 44-point-equivalent touch targets and reaction meaning without color dependence | Pass |
| Scroll through long item names and grouped configured lines | Pass |
| Android back button: clean close or dirty/uncertain discard confirmation as appropriate | Pass |
| Submitting state locks duplicate actions; retryable error keeps the draft and retries once | Pass |
| Reduced-motion behavior | Pass |

## Remaining limitations and Phase 5 boundary

Phase 4 is complete: its implementation, automated checks, web inspection, iPhone interaction matrix, and physical Android checklist pass. The initial headless iOS development-launcher limitation remains documented above but did not reproduce in the user-run matrix. Dependency audit advisories remain release-dependency work outside this phase.

Phase 5 remains unauthorized pending separate explicit approval. Its exact scope is limited to the public Restaurant review page and unified Customer rating presentation: overall/Taste/Speed/count only, anonymous privacy-safe cards and safe snapshots, opaque keyset loading/error/empty states, and consistent database-owned v2 summaries across Home, search, Restaurant details, and the review page. It does not authorize hosted database mutation, Restaurant/Admin workflow UI, deployment, Production access, or EAS builds.
