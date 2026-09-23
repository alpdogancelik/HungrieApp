# Restaurant Responsive UI — Phase 1 Evidence

**Status:** Approved complete by the app owner

**Qualified:** 2026-09-23

**Approved:** 2026-09-23

**Scope:** `apps/restaurant` UI Phase 1 only
**Environment:** Local workspace and loopback browser server only

## Outcome

UI Phase 1 is implemented locally. The Restaurant application now has production design tokens and semantic DOM primitives, bundled Outfit and DM Sans fonts with a system-font failure path, a responsive sidebar/top-bar/bottom-navigation shell, one authenticated runtime provider, centralized push-clean sign-out, redesigned public/access surfaces, and the new `/forgot-password` and `/more` routes.

No hosted environment was accessed or mutated. No deployment, push, earnings activation, backend contract change, database migration, or Phase 2 implementation occurred.

## Requirement evidence

| Requirement | Status | Evidence |
|---|---|---|
| Exact `restaurant_get_dashboard_v1` contract | PASS | `dashboardContract.ts` accepts only the five keys emitted by `20260913140000_phase5_restaurant_desktop.sql`, validates the nested Restaurant/count fields, ISO timestamp, role, lifecycle and language, and rejects additions or malformed values. Phase 1 contract tests pass. |
| Existing access context remains authorization authority | PASS | `AuthGate` parses `restaurant_get_my_access_context_v1`; `RestaurantAccessContext` supplies role and owner gating. The dashboard role is only checked for contract/identity consistency. It does not grant access. |
| One shared private Realtime subscription | PASS | Application source contains one `restaurant-orders:v1:` subscription, owned by `RestaurantRuntimeProvider`. Dashboard and Orders no longer create channels. The Phase 1 source-boundary test passes. |
| Foreground FCM and user-interaction audio unlock | PASS | The provider retains Firebase Messaging `onMessage`, calls `alertRestaurantOrder`, and registers one-shot pointer/keyboard unlock handlers. |
| Insert-event alert behavior | PASS | A shared `order_changed` insert with an order ID dispatches `restaurant_new_order` to `alertRestaurantOrder`. |
| Initial authoritative reconciliation | PASS | The provider calls `restaurant_get_dashboard_v1` during initialization. `connected` requires both a subscribed channel and a successfully parsed dashboard snapshot. |
| Event during initialization cannot leave older state | PASS | Request sequence and latest-applied guards reject an older response after a later event-triggered reconciliation. Event revision is published before reconciliation completes. Unit tests cover request ordering. |
| Browser/Realtime reconnect reconciliation | PASS | Online, focus, visible-document and `SUBSCRIBED` transitions request authoritative dashboard reconciliation. |
| Identity/session replacement and unmount cleanup | PASS | Generation checks discard late results. Cleanup invalidates the generation, removes the channel, FCM callback, browser listeners, visibility listener and pending interaction listeners. |
| Dashboard authoritative refresh dispatch | PASS | Shared Realtime events call the provider's dashboard RPC refresh. Dashboard reads the shared parsed snapshot and calls the same refresh after its existing accepting-orders mutation. |
| Orders authoritative refresh dispatch | PASS | Shared event revision causes Orders to call `restaurant_list_orders_v1`; no global order polling was added. |
| Existing Orders recovery behavior | PASS | Orders retains bounded polling, focus/visibility/online reload, `restaurant_acknowledge_order_seen_v1`, prior-item reuse for equal versions, and existing detail/mutation routes. Phase 1 and Phase 7 tests pass. |
| Truthful runtime indicator | PASS | Status is limited to `offline`, `connecting`, `connected`, and `stale`, and copy says live updates/dashboard status. It never claims the order queue is current. |
| Shared push-clean sign-out | PASS | Shell, More, Security, Pending, Suspended and permanent access failures use one module-scoped in-flight operation. It attempts push unregistration first, continues after cleanup rejection, deduplicates concurrent calls, and clears after settlement. Unit tests cover concurrency and cleanup failure. |
| Dependencies and locally bundled fonts | PASS | Only `@expo-google-fonts/dm-sans`, `@expo-google-fonts/outfit`, `expo-font`, and `lucide-react` were added to the Restaurant workspace. Font assets are bundled by Expo. A font-load error renders with the CSS system stack instead of leaving the app blank. The lock-delta test proves no other lock content changed. |
| Design system and primitives | PASS | Added tokens, typography, responsive rules, focus/reduced-motion styles, Button, Card, StatusChip, FormField, Toggle, Dialog, DataState, PageHeader and ConnectivityStatus. Components accept typed data/callback props and do not own Firebase or Supabase. |
| Responsive shell | PASS | Navy sidebar appears at 1024 px, an opaque white sticky top bar displays the authoritative Restaurant name and runtime status, the content canvas is cream, and four bottom tabs appear below 1024 px with safe-area clearance. |
| `/more` | PASS | Contains localized secondary links, authenticated email/role display, language switch, centralized sign-out, and active-owner-only Earnings. |
| `/forgot-password` | PASS | Public static route uses Firebase password reset, preserves persistence setup, and returns non-enumerating success copy for account-related errors. Network/rate-limit failures remain retryable. |
| Login and Invitation | PASS | Restyled with semantic forms, linked labels, autocomplete, visible submit/error states and 44 px controls. Login still establishes persistence before sign-in. Invitation retains query token, create/existing modes, verification, token refresh and invitation RPC. |
| Pending, suspended, revoked, wrong-role and session-expired states | PASS | Pending/Suspended use localized access cards and shared sign-out. Permanent access failures route to localized Login notices and remain fail closed. Transient access failure retains retry without replacing a verified screen. |
| Document language | PASS | Locale changes update `document.documentElement.lang` and persisted Turkish/English selection. |
| Excluded concepts and fixtures | PASS | Production source contains no mock import, `MockProvider`, UI-state selector, Concepts, Staff, Incidents, opening-hours editor or Admin commission UI. |
| Financial and tenant safeguards | PASS | Accepted migration/domain/generated-type hashes are unchanged. Earnings Phase 3/4/5 safeguards pass. No RPC signature, financial calculation, tenant selector or migration changed. |
| Static routes and export | PASS | Expo static export generated 21 routes, including `/forgot-password`, `/more`, `/orders/detail`, Login, Invitation, Pending and Suspended. |
| Turkish/English viewport matrix | PASS | 40 local screenshots: Login, Forgot Password, Invitation, and protected-shell presentation in both languages at 360×800, 390×844, 768×1024, 1024×768 and 1440×900. Exact files and SHA-256 values are in `restaurant-responsive-ui-phase1-evidence/visual/manifest.json`. |
| Accessibility qualification | PASS | Local Chrome checks found one main landmark per capture, two labelled navigation landmarks and two `aria-current` links in the shell, zero unlabelled fields, zero controls below 44 px, zero horizontal overflow, a visible keyboard focus outline, safe-area bottom clearance, opaque sticky surfaces, reduced-motion CSS, and no overflow in the 1024 px at 200% zoom equivalent pass. Locked color pairs meet WCAG AA. |
| Edge browser execution | N/A | Microsoft Edge is not installed in this local macOS workspace. Phase 1 responsive behavior was qualified in local current Chrome; the plan's signed cross-browser/device run remains a later qualification gate. |
| Real authenticated hosted-data screenshots | N/A | Hosted access was explicitly forbidden. Protected-shell responsive evidence uses a local semantic/CSS harness and is labelled as such in the manifest. Real account/device qualification remains Phase 6 scope. |

## Changed production files

Modified:

- `apps/restaurant/app/_layout.tsx`
- `apps/restaurant/app/invite.tsx`
- `apps/restaurant/app/login.tsx`
- `apps/restaurant/app/security.tsx`
- `apps/restaurant/package.json`
- `apps/restaurant/src/AuthGate.tsx`
- `apps/restaurant/src/DashboardPage.tsx`
- `apps/restaurant/src/OrdersPage.tsx`
- `apps/restaurant/src/Shell.tsx`
- `apps/restaurant/src/StatePage.tsx`
- `apps/restaurant/src/i18n.ts`
- `apps/restaurant/src/providers.tsx`
- `package-lock.json`
- `package.json`

Added:

- `apps/restaurant/app/forgot-password.tsx`
- `apps/restaurant/app/more.tsx`
- `apps/restaurant/src/RestaurantRuntimeContext.tsx`
- `apps/restaurant/src/dashboardContract.ts`
- `apps/restaurant/src/restaurantRuntimeModel.ts`
- `apps/restaurant/src/restaurantSignOut.ts`
- `apps/restaurant/src/restaurantSignOutCore.ts`
- `apps/restaurant/src/components/AppShell.tsx`
- `apps/restaurant/src/components/AuthLayout.tsx`
- `apps/restaurant/src/components/Button.tsx`
- `apps/restaurant/src/components/Card.tsx`
- `apps/restaurant/src/components/ConnectivityStatus.tsx`
- `apps/restaurant/src/components/DataState.tsx`
- `apps/restaurant/src/components/Dialog.tsx`
- `apps/restaurant/src/components/FormField.tsx`
- `apps/restaurant/src/components/PageHeader.tsx`
- `apps/restaurant/src/components/StatusChip.tsx`
- `apps/restaurant/src/components/Toggle.tsx`
- `apps/restaurant/src/components/navigation.ts`
- `apps/restaurant/src/design/components.css`
- `apps/restaurant/src/design/responsive.css`
- `apps/restaurant/src/design/tokens.css`
- `apps/restaurant/src/design/typography.css`

Removed after equivalent shared-runtime behavior was implemented:

- `apps/restaurant/src/RestaurantNotificationListener.tsx`

Qualification/support files:

- `scripts/check-phase5-restaurant.mjs`
- `scripts/check-restaurant-earnings-phase3.mjs`
- `scripts/check-restaurant-earnings-phase4.mjs`
- `scripts/check-restaurant-earnings-phase5.mjs`
- `scripts/test-restaurant-responsive-ui-phase1.mjs`
- `scripts/qualify-restaurant-responsive-ui-phase1.mjs`
- `docs/restaurant-responsive-ui-phase1-evidence/visual/manifest.json`
- 40 PNG files under `docs/restaurant-responsive-ui-phase1-evidence/visual/`

The Earnings check scripts changed only to follow the moved owner-navigation source and to pin the deliberately changed package-lock hash. The protected financial migration, generated database types and domain source hashes remain unchanged.

## Dependency and lockfile evidence

Added Restaurant runtime dependencies:

- `@expo-google-fonts/dm-sans@^0.4.2`
- `@expo-google-fonts/outfit@^0.4.3`
- `expo-font@~14.0.11`
- `lucide-react@^0.468.0`

Current package-lock SHA-256: `20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33`.

The executable lock-delta check removes those four approved workspace dependencies and the new `lucide-react` package entry, then proves the result is structurally identical to `HEAD:package-lock.json`.

## Local commands and results

| Command | Result |
|---|---|
| `npm run typecheck --workspace @hungrie/restaurant` | PASS |
| `npm run test:restaurant-responsive-ui-phase1` | PASS — 8/8 |
| `npm run phase5:restaurant:check` | PASS |
| `npm run notification-worker:test` | PASS — 11/11 |
| `npm run test:review-v2-repositories` | PASS — 6/6 |
| `npm run test:review-v2-ui` | PASS — 29/29 |
| `npm run test:restaurant-earnings-phase3` | PASS — 11/11 |
| `npm run test:restaurant-earnings-phase4` | PASS — 6/6 |
| `npm run phase3:restaurant-earnings:check` | PASS |
| `npm run phase4:restaurant-earnings:check` | PASS |
| `npm run phase5:restaurant-earnings:check` | PASS |
| `npm run phase7:runner:test` | PASS — 21/21 |
| `npm run build:proof` | PASS — shared packages, Restaurant static export and Admin production build |
| `npm run qualify:restaurant-responsive-ui-phase1` | PASS — 40 screenshots; 0 overflow, unlabelled fields or undersized targets |
| `git diff --check` | PASS |

## Repository and environment audit

- Staging index is empty; no commit was created.
- Existing unrelated secure files and artifacts remain untouched and untracked/ignored as before.
- No credential, token, secret, environment file, backup, fixture secret or secure artifact is part of the Phase 1 diff.
- No mock runtime source or fixture is imported by `apps/restaurant`.
- No Development, Staging or Production endpoint was accessed.
- No deployment or Git push occurred.
- `restaurant_earnings_v1` was not activated.
- UI Phase 2 has not started.

## Exit status

All agent-controlled UI Phase 1 requirements are complete, and the app owner approved UI Phase 1 on 2026-09-23. UI Phase 2 remains unstarted and requires separate authorization.
