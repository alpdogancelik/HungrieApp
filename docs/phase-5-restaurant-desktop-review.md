# Phase 5 Restaurant desktop web/PWA review

**Status:** Development implementation and rehearsal completed on 2026-09-13. The exact Staging batch is prepared for separate app-owner review. No Staging Phase 5 migration, Realtime policy, Firebase Function, VAPID setting, EAS update, or pilot identity was created by this implementation step. No Production environment was touched, and legacy authorization remains live.

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

After separate app-owner approval, the Staging sequence is:

1. Take a fresh restricted Staging schema/data backup.
2. Dry-run and apply only the three migrations using their checksum.
3. Apply the reviewed receive-only Realtime policy containing legacy and canonical topic predicates.
4. Configure the dedicated non-production Web Push VAPID key without recording its private material.
5. Deploy only `dispatchRestaurantWebPushStaging`, pinned to function checksum `8e873b7206454a54942b33a9131250c38b7ca3faca991fa618d2d6db6ddd97a2`.
6. Deploy the Restaurant app to EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1` on the Staging branch/alias. Do not connect `restaurant.hungrie.app`.
7. Create a fresh pilot Restaurant and invite one stable owner and one stable manager through the Admin app. The app owner supplies both email addresses at this step.
8. Run owner/manager capability, cross-tenant, suspension, deadline race, duplicate transition, Realtime/poll/focus recovery, FCM foreground/background/closed-page, and cache tests.
9. Record Windows and Mac device models, OS versions, Chrome/Edge versions, PWA installation state, permission state, sleep/background recovery, and staffed connected-screen readiness.

The Staging apply and browser/device qualification remain required for the Phase 5 exit gate. Development completion does not authorize those writes or qualify Phase 5 for acceptance.

## Rollback

If a migration fails, stop before function or web deployment and use the restricted backup only when a forward fix cannot safely restore migration history. If the sender fails, leave delivery rows retryable/dead-lettered and remove only `dispatchRestaurantWebPushStaging`; never expose credentials or relax canonical guards. If the web build fails qualification, remove the Staging alias/update and keep Restaurant order acceptance off for pilot identities. Legacy clients, topics, tables, and RPCs remain available throughout Phase 5, so rollback must not weaken authorization.
