# Restaurant Responsive UI Integration Plan

**Status:** `Phase 6 PASS / ACCEPTED / CLOSED`; Production-readiness preparation
**Audited:** 2026-09-29
**Source design:** `apps/restaurant-ui-mock`  
**Target application:** `apps/restaurant`  
**Production impact:** None until separately implemented, qualified, approved, and released

## 1. Decision

Move the approved visual language and responsive layouts from `apps/restaurant-ui-mock` into `apps/restaurant`, while preserving the target application's existing authentication, authorization, repositories, RPCs, realtime recovery, notification behavior, idempotency, privacy rules, and financial safeguards.

Do not copy the mock application as a replacement for the production Restaurant application. The mock is fixture-driven React Native Web UI; the target currently uses semantic web elements and CSS inside Expo Router. Rebuild the approved design as a small DOM/CSS production design system. This is the safer integration path because the target already depends on native browser forms, file inputs, tables, dialogs, Firebase browser APIs, service workers, and PWA behavior.

The source mock remains a review reference. It must never be imported by the target application at runtime.

## 2. Baseline and sequencing constraint

The current working tree contains uncommitted Restaurant Earnings and owner-access work in `apps/restaurant`, and the entire mock is currently untracked. Before UI integration begins:

1. Finish and approve the Restaurant Earnings/Admin Commission work in its own plan.
2. Commit or otherwise record that accepted baseline.
3. Commit the reviewed mock independently, or tag the exact mock snapshot used as the visual source.
4. Start the UI migration from a clean branch/worktree based on the accepted application baseline.
5. Do not mix financial contract changes, database migrations, fixture secrets, or unrelated Admin changes into UI migration commits.

This prevents the redesign from hiding or accidentally reverting the owner-only Earnings access work.

## 3. Non-negotiable behavior to preserve

- Firebase authentication and browser session persistence.
- Supabase access-context resolution and fail-closed authorization.
- One Restaurant identity, one Restaurant assignment, and the existing owner/manager role boundary.
- Pending, suspended, revoked, wrong-role, and transient access-failure handling.
- Static notification-safe order details at `/orders/detail?orderId=<id>`.
- Private Restaurant realtime topics, polling fallback, focus/visibility/online refresh, and reconnect reconciliation.
- Order visibility acknowledgement.
- Expected-version order transitions, stable operation IDs, cancellation reason codes, and uncertain-response reconciliation.
- Server-authoritative totals, status transitions, menu pricing, review data, earnings, commission, and permissions.
- Tenant isolation on every read and mutation.
- Push registration/unregistration, service-worker behavior, and push cleanup before sign-out.
- Anonymous Restaurant review presentation and the existing report workflow.
- Owner-only Earnings visibility and access; managers must not receive financial data or navigation.
- Integer kuruş and basis-point financial handling.
- Turkish and English behavior, including notification language.
- The current desktop/PWA production scope. Phone and tablet browser support can be added and qualified through this work; native iOS/Android approval remains separate.

## 4. Technology and component strategy

### 4.1 Keep in the target application

- Expo Router routes and static web export.
- React DOM elements already used in the target.
- `AuthGate`, access context, repositories, Firebase, Supabase, service worker, and notification listener.
- Semantic `<form>`, `<input>`, `<select>`, `<textarea>`, `<table>`, `<button>`, `<nav>`, `<main>`, and accessible dialog structures.

### 4.2 Port from the mock as design specifications

- Color, spacing, radius, shadow, typography, breakpoint, and motion tokens.
- Cream canvas (`#FFF8EF` in the mock), white surfaces, navy ink, and orange accent.
- Desktop sidebar and top operational bar.
- Four-tab phone navigation: Dashboard, Orders, Menu, More.
- Page headers, cards, chips, buttons, fields, rows, toggles, banners, skeletons, dialogs, and empty/error states.
- Responsive screen composition and information hierarchy.
- Outfit headings and DM Sans body typography, bundled locally or through package assets with no remote font dependency.
- Consistent iconography. Prefer a DOM-compatible Lucide package in the target rather than importing mock React Native components.

### 4.3 Do not port

- `MockProvider`, fixtures, local status transitions, or fixture reset.
- The visible `UI STATE` scenario selector.
- Query-string mock scenarios.
- Hard-coded people, device names, locations, amounts, health indicators, deadlines, or order counts.
- Emoji menu imagery when real Restaurant media exists.
- Mock customer names in Reviews.
- `Concepts` labels/routes except where a feature has separately completed its product/backend approval.
- Any client-calculated commission, net earnings, incident threshold, or operational authority.

### 4.4 Proposed target structure

```text
apps/restaurant/src/
  design/
    tokens.css
    typography.css
    responsive.css
  components/
    AppShell.tsx
    BottomNavigation.tsx
    TopOperationalBar.tsx
    PageHeader.tsx
    Button.tsx
    Card.tsx
    StatusChip.tsx
    FormField.tsx
    Toggle.tsx
    Dialog.tsx
    DataState.tsx
    ConnectivityStatus.tsx
  orders/
    OrderCard.tsx
    OrderBoard.tsx
    OrderDetailPanel.tsx
    OrderActions.tsx
  menu/
    CategoryPanel.tsx
    MenuItemCard.tsx
    MenuItemDialog.tsx
```

These components receive typed data and callbacks. They do not call Supabase/Firebase directly. Route/page containers retain repository and mutation ownership.

## 5. Responsive contract

| Width | Navigation | Primary layout | Required behavior |
|---|---|---|---|
| `< 768px` | Four fixed bottom tabs | One column | Full-width cards, focused order details, full-screen editors/dialogs, safe-area padding, no horizontal overflow |
| `768–1023px` | Four bottom tabs or compact rail after review | Expanded one/two-column views | Orders may use split list/detail only if 44 px actions and readable detail widths remain |
| `>= 1024px` | Persistent sidebar | Dense desktop workspace | Orders board plus selected-order panel; tables/forms use available width without stretched phone layouts |
| `>= 1440px` | Persistent sidebar | Capped content width | Avoid excessively long text lines; orders board remains operationally dense |

Rules:

- One breakpoint source must drive CSS and responsive rendering.
- The shell owns page scrolling. Nested scroll regions are limited to the desktop order board/detail and long dialogs.
- Bottom navigation never covers content or actions.
- Sticky areas must be opaque; scrolling cards and shadows cannot appear through headers.
- Minimum pointer/touch target is 44 by 44 CSS pixels.
- Mobile cards use the full practical width with 16 px page gutters.
- No page may depend on hover.
- Desktop forms may use columns; phone forms must be a single reading order.

## 6. Route and feature differences

| Area | Production behavior today | Mock design | Integration decision |
|---|---|---|---|
| Login | Real Firebase sign-in, persistence, generic failure | Polished responsive auth presentation | Restyle around the real submit/error flow |
| Forgot password | Only reachable through Security action | Dedicated presentation route | Add `/forgot-password` using Firebase reset; rate-limit UX and generic success copy |
| Invitation | Real create/sign-in modes, verification email, invitation RPC | Polished invitation presentation | Preserve token query string and both account modes; restyle only |
| Access states | Overlay plus pending/suspended pages; invalid roles/revoked sign out | Checking, service failure, pending, suspended, revoked, wrong-role, session-expired gallery | Build production state components, but do not expose mock gallery route |
| Shell | Brown desktop nav; horizontal mobile nav | Navy sidebar, top status bar, four phone tabs, More screen | Replace presentation; preserve locale, role-aware links, offline state, and push-clean logout |
| Dashboard | Dashboard RPC counts, accepting toggle, realtime connectivity | Hero, four metrics, pending list, health summary | Bind only real values; add no fake sales/health data |
| Live orders | Real active list, realtime + polling + acknowledgement | Phone list and desktop status board/detail panel | Adopt responsive presentation around existing recovery logic |
| Order detail | Full guarded workflow with versioned mutations and reconciliation | Rich detail hierarchy and confirmation dialogs | Adopt visual components; keep production route and state machine unchanged |
| History | Cursor-paginated table, no server search/filter | Search, status/date filters, cards | Restyle now; full filters require a new server contract |
| Menu | Real create, upload, reorder, availability; UI does not expose edit | Category workspace, item cards, multi-select, create/edit dialog | Wire existing save RPC to create and edit; retain real upload/validation |
| Restaurant | Real settings fields including cuisine, language, image URL and existing opening-hours data | Cover/logo UI, acceptance toggle, basic fields, concept hours | Keep every real field; image button needs upload work; hours require explicit scope approval |
| Reviews | Real anonymous v2 reviews, aggregates, filters, report statuses, pagination | More visual summary/cards/dialog | Restyle real repository data; never show mock names or unsupported aggregate scores |
| Alerts | Real FCM web registration, permission states, iOS PWA guidance, test/disable | Device and preference cards | Bind to actual capability/state only; do not fake per-device metadata/preferences |
| Security | Real reset and sign-out | Account/session/safe-use presentation and confirmation | Restyle; centralize logout so push token is unregistered first |
| More | No route | Secondary phone navigation/account/language/sign-out | Add presentation route; role-filter all entries |
| Earnings | Real owner-only authoritative earnings implementation is in current work | Fixture concept design | Promote only after current Earnings phase is accepted; restyle without changing contracts |
| Staff | No Restaurant contract | Concept | Exclude |
| Incidents | Backend/admin operational concepts exist, no approved Restaurant workflow | Concept | Exclude |
| Admin commission | Admin-side feature | Concept | Exclude from Restaurant app |

## 7. Screen-level functional plan

### 7.1 Shell and navigation

- Desktop sidebar: Dashboard, Live orders, History, Menu, Restaurant, Reviews, Alerts, Security, plus Earnings only for an active owner.
- Do not show a Concepts section in production.
- Phone bottom tabs: Dashboard, Live orders, Menu, More.
- More: History, Restaurant, Reviews, Alerts, Security, language, account email/role, and sign-out. Show Earnings only to active owners.
- Top bar: actual Restaurant name, real online/realtime condition, alert shortcut, and language control.
- A browser being online is not enough to show “order screen connected.” Define the indicator from network state plus realtime subscription state plus recent successful reconciliation.
- Use route-aware active states and preserve deep links after refresh.
- Centralize sign-out in one action that first attempts push unregistration and then signs out even if cleanup fails.

### 7.2 Authentication and access

- Login must retain `ensureSessionPersistence()` before Firebase sign-in.
- Invitation must retain static query-token handling, create/existing-account modes, email verification, token refresh, and `accept_my_account_invitation_v1`.
- Forgot password must avoid revealing whether an email exists.
- Auth/access loading must not unmount a previously verified operational screen during a transient context failure.
- Permanent revoked/wrong-role states must clear access and sign out as they do today.
- Pending and suspended pages must include a safe sign-out action.
- Add visible focus, labelled errors, disabled/submitting states, and password manager compatible fields.

### 7.3 Dashboard

Use `restaurant_get_dashboard_v1` and `restaurant_set_accepting_orders_v1` as the authority.

- Hero: Restaurant lifecycle/accepting state and connection condition.
- Acceptance toggle: disabling can work while degraded if the server is reachable; enabling remains blocked unless operational connection requirements pass.
- Metrics may show only fields actually returned by the dashboard contract.
- “Today's sales” must not be calculated from visible orders. If retained, use the authoritative Earnings summary and show it only to owners; otherwise replace it with an operational count.
- Pending orders must come from the active-order repository or an explicitly extended dashboard response.
- Notification health must come from the real push state, not a permanent “OK.”
- Queue freshness needs a timestamp from the latest successful list/realtime reconciliation.
- Realtime `order_changed` should refresh authoritative dashboard/order data rather than only changing a connection icon.

### 7.4 Live orders and detail

Desktop:

- Columns: pending, preparing, ready, out for delivery.
- Selected order appears in a persistent detail panel.
- Columns are derived from one authoritative active-order result; no independent column fetches.
- Card selection does not acknowledge unseen state until the visibility rule is satisfied.
- No drag-and-drop status changes in the first integration. Use explicit labelled actions and confirmation where needed.

Phone/tablet:

- Filtered status chips and vertically stacked order cards.
- Open a dedicated full-screen detail route.
- Primary status action remains reachable without covering content.

All layouts:

- Retain private realtime, polling fallback, focus/visibility/online reload, deduplication, and monotonic version handling.
- Retain `/orders/detail?orderId=...` as the canonical notification/direct-refresh route. A dynamic route may navigate to it but cannot replace it for static hosting.
- Derive deadline countdown from `approval_deadline_at`, update it locally, and reconcile expiration from the server.
- Preserve item customization snapshots, quantities, customer note, Restaurant note if provided by the canonical response, subtotal, fees, total, payment method, cancellation information, and server timestamps.
- Only show a note section when its trimmed content is non-empty.
- Use the canonical transition graph. Do not enable an action solely because the mock shows it.
- Keep stable operation IDs for retries of the same intended transition.
- On version conflict or uncertain response, reload and present the authoritative result before allowing another action.
- Cancellation dialog must use supported reason codes and optional Customer-facing text rules from the existing v2 cancellation contract.
- Offline/stale states disable mutations but may show previously loaded data with a clear stale label.

### 7.5 History

Immediate UI scope:

- Responsive history cards on phone and a compact table/card workspace on desktop.
- Existing keyset pagination and direct order-detail links.
- Server-authoritative order-reference search through tenant-bound `restaurant_list_orders_v2`.
- Delivered/canceled status styling, localized dates, currency, loading, empty, error, and retry states.

Remaining contract gap:

Status and date filters still require a reviewed server contract. They must retain tenant checks, bounded query rules, stable keyset pagination, indexes where required, tests, and typed response validation. Do not label a filter as complete if it only searches the currently loaded page.

### 7.6 Menu management

- Build typed production menu view models instead of `any`.
- Category panel: select, create/edit where supported, reorder with buttons, and accessible move controls.
- Product workspace: real image/name/description/price/availability, selection checkboxes, atomic bulk availability, and item reorder.
- Create/edit dialog: send an existing `id` to `restaurant_save_menu_item_v2` for edits and omit it for creates.
- Preserve IDs of existing ingredients/groups/options during edit when possible.
- Use the existing `restaurant-media` upload path, file-size/MIME checks, tenant path, and public URL workflow.
- Add upload preview, progress/saving state, failure recovery, and cleanup policy for a newly uploaded file when the later save fails.
- Represent prices as validated decimal input converted once to integer kuruş; never use display rounding as business authority.
- Retain group kinds `size`, `modifier`, and `extra`, min/max selection validation, required/optional meaning, option prices, removable ingredients, and order.
- Add unsaved-change confirmation for close, back, route change, and replacing the edited item.
- Do not silently delete old media or definitions without the existing save contract and audit behavior.
- Keep the actual file input accessible even if a designed upload surface activates it.

### 7.7 Restaurant settings

The redesigned form must retain all currently supported data, including fields omitted from the mock:

- Name, description, cuisine, address, phone.
- Preferred language.
- Image URL/current image.
- Delivery ETA range and minimum order if these are exposed in this release.
- Lifecycle state as read-only.
- Accepting-orders control only if it uses the same guarded mutation and connectivity rules as Dashboard.

The mock's “Change image” control requires a real Restaurant image upload contract/storage policy before activation. Until then, keep the current supported URL input or show the image without a fake upload action.

The database contract contains `opening_hours`, but the mock labels this screen as a concept and its README forbids promotion without approval. Treat opening-hours editing as a separately approved sub-scope with schema validation, timezone/day semantics, Customer catalog effects, and server tests.

### 7.8 Reviews

- Keep `restaurantReviewV2Repository`, cursor gating, stable report operations, reason enumeration, note normalization, and response validation.
- Preserve visibility and report-status filters and both Reviews/Meal feedback tabs.
- Keep Customers anonymous. Do not show fixture names, masked names, order identifiers, or Customer details.
- Show only scores/aggregates returned by the authoritative contracts. The mock's global 4.4/Taste 4.6/Speed 4.2 summary cannot ship unless a real summary contract is added.
- Report status remains read-only; reporting does not hide a review or alter aggregates.
- Implement accessible dialog focus containment, Escape/cancel, focus restoration, submission state, and inline validation.

### 7.9 Alerts and PWA

- Preserve `isSupported`, permission checks, iOS standalone detection, service-worker readiness, FCM token acquisition, registration RPC, unregistration, and test sound/notification.
- Present idle, registering, registered, denied, unsupported, iOS-install-required, error, and permission-dismissed states distinctly.
- Do not claim “Chrome · macOS,” current device location, or active time unless derived accurately and needed.
- The mock's notification and sound toggles require defined persistence. Until a real preference contract exists, use explicit Enable/Disable/Test actions matching current behavior.
- Browser PWA install buttons must use an actual captured `beforeinstallprompt` event; otherwise show platform-specific installation guidance.
- Ensure Turkish registration uses `p_language = tr` and that the notification worker continues selecting localized payloads.

### 7.10 Security

- Show the authenticated account email and role.
- Send password-reset email through Firebase with non-enumerating success/error copy.
- Confirm sign-out, then use the shared push-clean sign-out action.
- Do not display a trusted location or session inventory unless a server session contract exists.
- Browser/OS labels, if shown, are informational and must not imply security verification.

### 7.11 Earnings

After the current Earnings plan is completed and approved:

- Replace only the visual layer of the real `EarningsPage` with approved design components.
- Preserve active-owner gating in both navigation and page access.
- Preserve summary/series/page response validation, date limits, server timezone, abort/generation logic, stale/offline/reconnect behavior, keyset paging, immutable snapshots, and disclaimers.
- Keep the statement that values are estimates, not payouts, transfers, balances, invoices, tax calculations, or final profit.
- Never reconstruct earnings from orders visible in the UI.
- Exclude the mock Admin commission screen from this app.

### 7.12 Explicitly excluded concepts

- Staff management.
- Restaurant-facing incident acknowledgement/resolution.
- Admin commission controls.
- Any payout, settlement, transfer, wallet, withdrawal, tax, or invoice behavior.
- Opening-hours editing until separately approved as described above.

## 8. State coverage

Every route must define and test:

- Initial loading and delayed loading/skeleton.
- Success with typical, minimum, and long content.
- Empty data.
- Recoverable service error with reference ID where appropriate.
- Offline with and without cached/previous data.
- Reconnecting and successful reconciliation.
- Stale data after a failed refresh.
- Permission/role denial.
- Session expiration/revocation while mounted.
- Mutation submitting, success, validation error, conflict, unknown outcome, and retry.
- Turkish and English copy.

The state selector remains in the mock. Production states are driven by real page state or test adapters, never an end-user control.

## 9. Accessibility requirements

- One visible page heading and logical heading order.
- Skip link and semantic sidebar/bottom navigation.
- Visible keyboard focus on every interactive control.
- Native buttons/links rather than clickable containers when possible.
- Labels programmatically attached to all inputs; helper and error text referenced with `aria-describedby`.
- `aria-current` for navigation, `aria-pressed` for toggles, and correct tab semantics.
- Dialog focus trap, initial focus, Escape behavior, and focus restoration.
- Live regions limited to meaningful connection, mutation, and validation updates.
- Status never communicated by color alone.
- Contrast checked for muted text, orange controls, chips, warnings, and disabled states.
- 200% text zoom and browser zoom without clipped actions or horizontal page scrolling.
- Tables retain headers and supply a readable responsive alternative.
- Reorder controls have explicit item/category and direction labels.
- Reduced-motion support for transitions and skeletons.

## 10. Security, privacy, and correctness review

- No authorization decisions from hidden navigation or local role flags.
- No repository accepts a Restaurant ID selected by the browser when the caller-bound RPC can resolve it.
- No fixture imports, sample credentials, environment selectors, or secret files in the production bundle.
- No Customer identity in Reviews or Earnings.
- No raw backend error details shown to operators; use stable localized messages and reference IDs.
- No HTML injection from notes, names, reviews, or menu descriptions.
- Uploaded files retain server/storage policy checks; client checks are usability only.
- All mutations retain idempotency/operation ID behavior and audit paths.
- Realtime disconnect never leaves enabling order acceptance falsely available.
- Financial values remain server-authoritative integer values.

## 11. Implementation phases and approval gates

Each phase ends with a review artifact. The next phase must not begin until the app owner explicitly approves both completion of the current phase and the start of the next phase.

### UI Phase 0 — Baseline and specification lock

- Reconcile/commit the Earnings baseline and mock snapshot.
- Capture route screenshots at 360, 390, 768, 1024, and 1440 px in Turkish and English.
- Approve tokens, breakpoints, shell navigation, role matrix, and excluded concepts.
- Record current production behavior tests before presentation changes.

**Exit:** clean baseline, approved visual specification, no production behavior change.  
**Approval:** “Approve UI Phase 0 and authorize UI Phase 1.”

### UI Phase 1 — Design system, shell, and access surfaces

- Add tokens, fonts, icons, primitives, responsive shell, desktop sidebar, top bar, phone bottom navigation, and More route.
- Restyle login, invitation, forgot password, access overlay, pending, and suspended states.
- Centralize locale and push-clean sign-out.
- Verify role-aware Earnings navigation.

**Exit:** all routes remain reachable; auth/access behavior unchanged; responsive shell qualified.  
**Approval:** “Approve UI Phase 1 and authorize UI Phase 2.”

### UI Phase 2 — Operational order workflow

- Dashboard, active orders, desktop board/detail panel, phone order list/detail, countdowns, notes, totals, status actions, cancellation dialogs, and connectivity states.
- Preserve realtime/poll/reconciliation/idempotency and notification deep links.
- Add targeted tests for version conflicts, uncertain mutations, offline/reconnect, and deadline expiry.

**Exit:** complete canonical order flow on approved desktop and phone browser widths.  
**Approval:** “Approve UI Phase 2 and authorize UI Phase 3.”

### UI Phase 3 — History, menu, and Restaurant profile

- History presentation with current pagination.
- Menu category/item workspace, real create/edit, media upload, reorder, bulk availability, option groups, validation, and unsaved changes.
- Restaurant profile retaining every real field.
- Handle history filter and Restaurant image/opening-hours gaps only through separately reviewed contracts/scope.

**Exit:** no regression in menu transactions, media, pricing definitions, or settings.  
**Approval:** “Approve UI Phase 3 and authorize UI Phase 4.”

### UI Phase 4 — Reviews, Alerts, Security, and Earnings presentation

- Restyle the real review repositories/reporting flow.
- Restyle actual push/PWA capability states.
- Restyle reset/sign-out security flow.
- Restyle approved real Earnings without changing financial authority.

**Exit:** privacy, push recovery, owner-only access, and financial safeguards pass.  
**Approval:** “Approve UI Phase 4 and authorize UI Phase 5.”

### UI Phase 5 — Cross-route responsive and accessibility qualification

- Complete all state, language, viewport, keyboard, zoom, and assistive-technology checks.
- Test long Turkish strings, long Restaurant/menu text, maximum option groups, many orders, and empty/error states.
- Verify no horizontal overflow, covered action, safe-area conflict, transparent sticky header, or scroll trap.
- Run web performance and bundle review; remove mock-only/dead CSS.

**Exit:** signed device/browser checklist and zero unresolved release-blocking defects.  
**Approval:** “Approve UI Phase 5 and authorize UI Phase 6 Staging qualification.”

### UI Phase 6 — Staging qualification and release readiness

**Final status:** `PASS / ACCEPTED / CLOSED` on 2026-09-29 for the qualified Vercel Restaurant Staging browser/PWA/FCM path. The accepted qualification is `restaurant-vercel-notification-click-qualification-20260929aj`; its evidence-manifest SHA-256 is `766e0459606747a72753b7238ca91eb284b5b0a198934fa9d546740c5238f433` and terminal-record SHA-256 is `f9a7c43fa69ed5c352621a4e6bb22c5c04b05393b7cc8131e7d6e6320f9977a2`. Production was untouched. See `docs/restaurant-responsive-ui-phase6-acceptance.md`.

- Deploy to Staging only through the existing reviewed process.
- Run real owner and manager accounts, cross-tenant denial, active order lifecycle, push from background/closed page, menu edit/upload, reviews/reporting, and Earnings checks.
- Verify Turkish/English notifications and direct order-detail refresh.
- Reconcile test fixtures and record rollback point.
- Produce final review with residual risks and exact release candidate.

**Exit:** explicit owner acceptance of the redesign. Production remains unchanged until the later production release phase authorizes deployment.  
**Approval:** “Approve Restaurant responsive UI migration.”

### Next phase — Restaurant Production Readiness

Production is a separate release boundary. Its initial state is `NOT YET APPROVED / NOT EXECUTED`; follow `docs/restaurant-production-readiness-plan.md` and its machine-readable checklist. Phase 6 acceptance does not authorize a Production deployment, provider configuration, identity, domain, FCM send, Earnings activation, store submission, or public release.

## 12. Test and evidence matrix

### Automated

- Target Restaurant TypeScript check.
- Static Expo web export.
- Existing Restaurant/Phase 5 functions and database tests.
- Existing review repository/UI tests.
- Earnings contract/model/repository tests from its accepted plan.
- New component tests for route/role navigation and state rendering.
- New order workflow tests for action availability and reconciliation callbacks.
- New menu editor tests for create/edit payloads, integer prices, group limits, unsaved changes, and file validation.
- Accessibility checks for landmarks, labels, tabs, dialog roles, and keyboard focus.
- Bundle scan proving no mock fixture imports or secrets.

### Manual viewport coverage

- 360 × 800 and 390 × 844 phone browser/PWA.
- 768 × 1024 tablet browser.
- 1024 × 768 compact desktop.
- 1440 × 900 desktop.
- Current Chrome and Edge on approved Windows/Mac desktop devices.
- Safari/iOS PWA guidance where Alerts behavior is presented; this does not approve native iOS.

### Critical real-data flows

1. Login, invitation, verification, pending approval, activation, suspension, revocation, and sign-out.
2. New order realtime arrival, push arrival, acknowledgement, deadline, accept, prepare, ready, out for delivery, deliver, and each cancellation path.
3. Offline order screen, reconnect, stale version, concurrent operator transition, and unknown mutation response.
4. History pagination and direct detail refresh.
5. Menu create/edit/upload/reorder/bulk availability and cross-tenant rejection.
6. Restaurant settings save and acceptance toggle guard.
7. Anonymous reviews, filters, pagination, report creation, duplicate report, and aggregate tab.
8. Notification enable/deny/re-enable/test/unregister and localized closed-page payload.
9. Owner Earnings and manager denial/navigation absence.

## 13. Required product/contract decisions before implementation reaches those controls

1. Whether phone/tablet browser support becomes part of the next Restaurant release gate or remains an additional qualified surface.
2. Whether Dashboard shows owner-only current-day financial data or operational metrics only.
3. Whether History search/status/date filters justify a new server RPC now.
4. Whether Restaurant cover/logo upload is in scope and which storage/lifecycle policy applies.
5. Whether opening-hours editing is approved now and what timezone/exception rules apply.
6. Whether notification/sound preferences need persisted server contracts or the UI should expose only Enable/Disable/Test.
7. Whether tablet orders use a split view or the phone list/detail pattern.
8. Whether managers may edit all menu/profile fields currently allowed by the general Restaurant guard, or whether a new capability matrix is required.

Decisions 2 through 8 should be resolved during the phase that first needs them. They do not block establishing the baseline and design system.

## 14. Completion definition

The migration is complete only when the target application visually implements the approved responsive design, all real production behaviors remain intact, every unsupported mock concept is absent or clearly deferred, owner/manager boundaries pass, critical order recovery still works, all required viewport/language/accessibility evidence is recorded, Staging is explicitly accepted, and Production has not changed without its separate release authorization.
