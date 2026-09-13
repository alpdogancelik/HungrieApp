# Phase 5 Restaurant desktop web/PWA review

**Status:** Development implementation and rehearsal completed on 2026-09-13. The app owner approved the exact Staging batch on 2026-09-13. The restricted backup was taken, the three checksum-pinned migrations and reviewed Realtime policy were applied, and the Staging Web Push sender was deployed. Restaurant web deployment, pilot onboarding, and device qualification remain in progress. No Production environment was touched, and legacy authorization remains live.

## Development result

The Restaurant proof app is replaced by a bilingual English/Turkish desktop application with login, invitation, pending and suspended states, dashboard, live orders, order detail, history, menu, Restaurant settings, reviews, alert settings, and security routes. Browser Firebase Auth uses session persistence and caller tokens for Supabase. Access routing uses `get_my_access_context_v1()`, while every private read or mutation independently checks canonical Restaurant state and scope.

The app initially fetches active orders, joins `restaurant-orders:v1:<restaurant-id>` as a private Realtime channel, and reconciles on invalidation, reconnect, focus, visibility, network restoration, and a configurable 15-second poll. It acknowledges an order only after rendering it. Opening order acceptance requires a successful initial context/sync, private channel join, and online state. Realtime and notification data are wake-up signals; the app always refetches authoritative state.

The menu UI supports categories, items, availability, accessible move-up/down ordering, JPEG/PNG/WebP upload, ingredients, option groups, selection limits, and price deltas through the v2 definition. `quote_order_v2` and `create_order_v2` accept IDs and quantities, validate selections and removable ingredients, price on the server, and store the definition revision and complete selection snapshot. Legacy menu fields and Customer RPCs remain unchanged.

Development was backed up at `secure/phase5-development-backup/2026-09-13T12-33-04-843Z/manifest.json`. Development had not received the accepted Phase 4 public type-boundary migration, so the checksum-pinned application batch correctly included that prerequisite followed by the three Phase 5 migrations. The applied batch SHA-256 is `4dbab69b9202fa8529ed3e1246e50f59c869ec091963ef1306e8f00357828238`. Development now has 35 migrations, 60 canonical accounts, 9 canonical Restaurant accounts, and all 9 legacy memberships remain present. No Phase 5 operation was fabricated during migration.

## Database and service contracts

The Staging Phase 5 migration batch is:

1. `20260913140000_phase5_restaurant_desktop.sql`
2. `20260913141000_phase5_restaurant_contracts.sql`
3. `20260913142000_phase5_customer_menu_v2.sql`

Combined SHA-256: `e912504aa523c32b090f8d7e323de86666b4228b9a0449602fe8d784c35eb631`.

The batch adds canonical Restaurant dashboard/order/history/detail/settings/review/menu/push RPCs; operation and order-visibility ledgers; versioned menu tables; scoped public Restaurant media; v2 Customer pricing/order creation; canonical private Realtime topic authorization; and FCM delivery claim/completion. Order transitions lock the row, validate expected version and deadline, require approved cancellation reasons, preserve idempotency, and audit changes. Existing legacy order topics and Expo recipient materialization remain active alongside the canonical path.

The Firebase source batch contains `dispatchRestaurantWebPushStaging`. It claims only canonical Web/FCM deliveries through service-only RPCs, sends a generic localized wake-up message without Customer data, records success/retry/dead-letter outcomes, and retires invalid registrations. Function source SHA-256: `8e873b7206454a54942b33a9131250c38b7ca3faca991fa618d2d6db6ddd97a2`.

The complete Restaurant route/source/service-worker/EAS configuration checksum, including the root lockfile and Admin invitation integration, is `7c855a518073122118601f0ce7dc216df7c54b80d9cd1912997705a8e1299ada`. The worker has no fetch handler or Cache API use. It displays generic background notifications and opens an authenticated order route, which refetches current state. Authenticated HTML uses `private, no-store`; CSP, HSTS, frame denial, referrer policy, permissions policy, and `nosniff` are configured.

## Verification

- Clean local database reset applied all 35 migrations.
- All 612 database assertions passed, including legacy notification and Realtime compatibility.
- Courier, Admin-role, and invitation concurrency tests passed.
- Database lint returned no errors.
- Phase 5 Firebase messaging unit tests passed.
- All JavaScript repository tests passed.
- Restaurant and Admin TypeScript checks passed.
- Shared packages, Restaurant web export, and Admin production build passed.
- Restaurant export produced all 16 static routes.
- Route/security inspection found 13 required product routes, seven required security headers, no service-worker cache handler, and correct Restaurant invitation portal selection.

## Exact Staging review bundle

Read-only review on 2026-09-13 found 32 applied Staging migrations and exactly the three Phase 5 migrations pending. Staging currently has 14 profiles, 14 canonical accounts, and 11 canonical Restaurant accounts. The managed Realtime policy SHA-256 is `11d60aebcfde9ee2656afd3ad2efa0bb7ecbc4929d9d0aca79641067e9eb3815`. Restricted review record: `secure/phase5-staging/review-1789303276365.json`.

The app owner approved this exact Staging batch on 2026-09-13 and supplied the pilot owner and manager addresses out of band. The addresses are not persisted in this review. Execution evidence so far:

- Restricted backup: `secure/phase5-staging-backup/2026-09-13T12-49-08-704Z/manifest.json`.
- Backup schema SHA-256: `0b975e548ac7575bf6e2b59d636645c0a811bca4369ac4e21af71df63b53e409`.
- Backup data SHA-256: `0ea2ad34e9f42d4a9884714e7fcbb07fc47f4edce68a8b743089a40ed5f74c63`.
- The migration dry-run passed, and only the three reviewed Phase 5 migrations were applied in order.
- Hosted verification found 35 applied migrations, 14 canonical accounts, 11 canonical Restaurant accounts, nine unchanged legacy memberships, an authenticated canonical dashboard RPC, private delivery ledgers, service-only delivery claims, and one canonical Realtime policy.
- The reviewed receive-only Realtime policy was applied with SHA-256 `11d60aebcfde9ee2656afd3ad2efa0bb7ecbc4929d9d0aca79641067e9eb3815`.
- `dispatchRestaurantWebPushStaging` was deployed successfully in `us-central1` with its one-minute scheduler and the existing Staging Supabase secrets. No secret value was recorded in this review.
- The dedicated non-production VAPID public key and the remaining public Firebase/Supabase browser configuration were added to the EAS Preview environment. The VAPID value is intentionally omitted here.
- The first EAS upload exposed a deployment-procedure defect: `eas deploy --environment preview` did not inject Preview values into the preceding local Expo export. That deployment was never used for a pilot. The deployment script now runs a cache-cleared export through `eas env:exec preview` and refuses an export that lacks the reviewed Firebase project, VAPID key, or Supabase URL.
- The corrected EAS deployment is `https://hungrie-restaurant--dzcrems18v.expo.app`, assigned to the Staging alias `https://hungrie-restaurant--staging.expo.app`. Hosted inspection confirms the real Staging Firebase project, VAPID key, and Supabase URL are in the bundle, `/sw.js` is available, and the worker has no fetch handler or Cache API use.
- The Staging Admin portal was configured to generate Restaurant invitation links for the EAS Staging alias and redeployed as Vercel deployment `dpl_6qAVaAHNwkkuZaxKg5Y9FiwpN18o`, retaining `https://hungrie-admin-web-phase1.vercel.app` as its alias.
- Hosted Restaurant HTML is `private, no-store`, includes CSP `frame-ancestors 'none'`, HSTS, `nosniff`, referrer policy, and permissions policy. EAS Hosting did not emit the configured legacy `X-Frame-Options` response header; the effective CSP frame denial remains present. This hosting behavior is recorded for review rather than weakening the CSP.
- Pilot owner enrollment exposed a static route and access-gate defect: `/invite/<token>` returned 404 on EAS Hosting, and an unmapped Firebase identity was routed away before its invitation could be accepted. A read-only Staging check confirmed one pending, zero accepted invitations and zero pending Restaurant accounts for the pilot owner after Firebase email verification. The fixed Admin flow issues `/invite?token=<one-time-token>` URLs; Restaurant serves `/invite` as a static page and allows unmapped invitees to reach its caller-bound acceptance RPC. The login page now shows the same generic sign-in error when redirected with `reason=failed`. EAS deployment `https://hungrie-restaurant--q3bmbts859.expo.app` is assigned to the Staging alias; Admin deployment `dpl_GQYLa1rD3nJv2WM9t19C5cwdFAKP` generates the corrected link format. The hosted `/invite?token=invalid-test-only` route returns 200 with `private, no-store`; `/invite/not-a-real-token` returns 404. No real invitation token was used in this check. The owner must be re-invited through Admin to invalidate the original link exposed in the support screenshot, then accept using **Existing account** with the already verified Firebase identity. No account activation occurred during this correction.
- The replacement owner invitation was accepted, leaving one mapped, pending Restaurant owner on a pending Restaurant. An attempted Admin activation did not commit an account-status operation. The callable log confirms valid Firebase authentication and records the attempt with an operation ID, but the current server log categorizes its underlying error as unknown. The Admin UI now uses that exact operation ID as its safe error reference and shows a targeted retry instruction; deployment `dpl_4gxCW16MUfQj2ihRAPWdGKcPfxpe` is live at the unchanged Admin alias. The activation itself remains unverified; the owner and Restaurant remain pending until a successful Admin transition.
- A later read-only Staging check confirmed the pilot owner account and Restaurant are both active, with `accepting_orders=false`. The manager account and invitation are not yet present. The earlier failed activation remains recorded as a diagnostic incident; its cause was not established from the available server log.
- The app owner subsequently confirmed that the pilot owner and manager both signed in. A read-only Staging check found both accounts active on the same active Restaurant, with order acceptance still off; the manager's canonical private-topic predicate returned true. The reported persistent navigation back to Dashboard came from `AuthGate` resetting to its loading state on every pathname change, unmounting the Expo Router Stack and restarting at the index redirect. The gate now keeps an already verified navigator mounted during route changes, while the existing access-context checks and protected RPC authorization remain in place. Restaurant TypeScript and all 16 static web routes exported successfully. The checksum-pinned web bundle `b65f04fb848d2e75a55059898fade116e29bbd20fbbc772ce2b61464c027ee78` was deployed as `https://hungrie-restaurant--s6x7mlyc4w.expo.app` and assigned to the unchanged Staging alias. Hosted `/orders` and `/menu` returned 200 with private no-store HTML and the configured CSP/security headers. Signed-in browser navigation and order delivery still require pilot retesting; the hosted response check alone does not close the issue.

Remaining Staging sequence:

1. Retest owner and manager navigation on the updated Staging alias, including Live orders, Menu, language changes, and direct route refreshes.
2. Run owner/manager capability, cross-tenant, suspension, deadline race, duplicate transition, Realtime/poll/focus recovery, FCM foreground/background/closed-page, and cache tests.
3. Record Windows and Mac device models, OS versions, Chrome/Edge versions, PWA installation state, permission state, sleep/background recovery, and staffed connected-screen readiness.

The Staging apply and browser/device qualification remain required for the Phase 5 exit gate. Development completion does not authorize those writes or qualify Phase 5 for acceptance.

## Rollback

If a migration fails, stop before function or web deployment and use the restricted backup only when a forward fix cannot safely restore migration history. If the sender fails, leave delivery rows retryable/dead-lettered and remove only `dispatchRestaurantWebPushStaging`; never expose credentials or relax canonical guards. If the web build fails qualification, remove the Staging alias/update and keep Restaurant order acceptance off for pilot identities. Legacy clients, topics, tables, and RPCs remain available throughout Phase 5, so rollback must not weaken authorization.
