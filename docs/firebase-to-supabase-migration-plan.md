# Hungrie Firebase to Supabase Migration Plan

Status: Milestones 0, 1, 2, and 3 completed and approved; Milestone 4 implemented and pending app-owner exit-gate approval
Primary rule: Security > data correctness > feature parity > speed
Migration style: Incremental, reversible, and verified at every milestone

## 1. Objective

Move Hungrie's application database from Cloud Firestore to Supabase Postgres without losing data, exposing private records, breaking authentication, or interrupting order processing.

The migration includes:

- Firestore collections and user subcollections.
- Firebase realtime listeners used by customers, restaurants, couriers, and admins.
- Database-dependent authorization and restaurant ownership.
- Review aggregation, order transitions, push-token storage, and notification triggers.
- Firebase Authentication in a later, separately approved milestone.

The migration does not include unrelated UI redesigns.

## 2. Non-negotiable rules

- Never ship a Supabase secret key or legacy service-role key in the Expo application.
- The mobile application may contain only the Supabase project URL and publishable key.
- Use separate Supabase development, staging, and production projects.
- Every schema change must be a versioned SQL migration under `supabase/migrations/`.
- Never apply unrecorded production SQL from the dashboard.
- Every client-reachable table must have explicit grants and tested RLS before application access is enabled.
- Staging/import tables must live in a non-exposed schema with client privileges revoked.
- Preserve existing Firestore document IDs during migration.
- Migration programs must be idempotent and use deterministic IDs plus upserts.
- Do not log passwords, tokens, exact addresses, phone numbers, or other PII.
- Do not perform database dual writes independently from the mobile client.
- Do not decommission Firebase until rollback checks and production monitoring pass.
- Do not begin the next milestone until the current milestone's exit gate passes.

## 3. Decisions that must be recorded before implementation

Create `docs/migration-decisions.md` and record these choices:

- [x] Money representation: integer kuruş.
- [x] Supabase project region: EU Central, with KVKK/data-residency validation before project creation.
- [x] Current users retain passwords through the Firebase Auth bridge.
- [x] Maintenance-window cutover with a final delta import.
- [x] Firestore retention: 90 days read-only after verified cutover.
- [x] Audit and order-status history retention: 7 years, subject to legal confirmation.
- [x] Couriers are restaurant-scoped users.
- [x] The app owner is the production rollback owner and go/no-go approver.

No schema migration should begin until these decisions are complete.

## 4. Target identity model

Authentication provider IDs must not become the permanent relational identity of application data.

Use this model:

- `profiles.id text primary key`: preserve the current Firestore user document ID.
- `profiles.firebase_uid text unique`: populated during the Firebase-authentication period.
- `profiles.supabase_user_id uuid unique null references auth.users(id)`: populated during the later Supabase Auth migration.
- Application foreign keys reference `profiles.id`, not Firebase UID claims or `auth.users.id` directly.

Create a locked-down SQL helper such as `private.current_profile_id()` that resolves the requesting JWT subject to a profile:

- During Firebase Auth: match `auth.jwt() ->> 'sub'` to `profiles.firebase_uid`.
- During Supabase Auth: match `auth.uid()` to `profiles.supabase_user_id`.
- Reject tokens from unexpected issuers/audiences.

This allows authentication to move later without rewriting every user foreign key.

Application roles must not use the JWT `role` claim. That claim remains `authenticated`. Store application authorization separately:

- Platform roles in `user_roles`, for example `admin`, `super_admin`, and `courier`.
- Restaurant roles in `restaurant_members`, for example `owner` and `manager`.
- Only trusted server code may modify role and membership tables.

## 5. Target data model

### Core tables

| Table | Purpose | ID strategy |
|---|---|---|
| `profiles` | Customer/operator profile | Existing Firestore user ID as `text` |
| `user_roles` | Platform roles | Composite `(profile_id, role)` |
| `restaurants` | Restaurant records | Existing Firestore ID as `text` |
| `restaurant_members` | Owner/manager relationship | Composite `(restaurant_id, profile_id)` |
| `categories` | Restaurant menu categories | Existing Firestore ID as `text` |
| `menu_items` | Current Firestore `menus` records | Existing Firestore ID as `text` |
| `addresses` | User address subcollections | Existing Firestore ID as `text` where available |
| `favorites` | User/restaurant favorites | Composite `(profile_id, restaurant_id)` |
| `orders` | Order header and immutable customer/address snapshots | Existing Firestore ID as `text` |
| `order_items` | Normalized order item snapshots | Deterministic text ID or UUID |
| `order_status_history` | Append-only status transitions | UUID |
| `product_reviews` | Per-product delivered-order reviews | Existing review ID as `text` |
| `order_reviews` | Overall order reviews | Existing review ID as `text` |
| `push_tokens` | Device notification registrations | Deterministic token hash or existing ID |
| `audit_log` | Sensitive operator actions | UUID |

### Required relational behavior

- `categories.restaurant_id -> restaurants.id`.
- `menu_items.restaurant_id -> restaurants.id`.
- `menu_items.category_id -> categories.id` where a category exists.
- `restaurant_members.restaurant_id -> restaurants.id`.
- `restaurant_members.profile_id -> profiles.id`.
- `addresses.profile_id -> profiles.id`.
- `favorites.profile_id -> profiles.id` and `favorites.restaurant_id -> restaurants.id`.
- `orders.profile_id -> profiles.id`.
- `orders.restaurant_id -> restaurants.id`.
- `order_items.order_id -> orders.id` with cascade delete only if order deletion is explicitly allowed.
- Review tables reference their order, restaurant, profile, and menu item where possible.
- Push tokens reference profiles and are unique per installation/token.

### Data representation

- Use `timestamptz` and database-generated `created_at`/`updated_at` values.
- Store order item name, price, quantity, and image as immutable purchase-time snapshots.
- Keep a `jsonb` delivery-address snapshot on `orders`; saved addresses remain normalized.
- Use constrained status values for orders, reviews, restaurants, categories, and menu items.
- Normalize `cancelled` and `canceled` to one canonical database value.
- Add checks for non-negative money, positive quantities, ratings from 1 through 5, and valid status transitions.
- Add indexes for every foreign key and frequent filter/order combination.

Expected query indexes include:

- `orders(profile_id, created_at desc)`.
- `orders(restaurant_id, status, created_at desc)`.
- `orders(courier_profile_id, status, created_at desc)`.
- `menu_items(restaurant_id, category_id, is_active, sort_order)`.
- `categories(restaurant_id, is_active, sort_order)`.
- `product_reviews(menu_item_id, status, created_at desc)`.
- `product_reviews(restaurant_id, status, created_at desc)`.
- `order_reviews(restaurant_id, status, created_at desc)`.

## 6. Authorization model

RLS is required on every table exposed through the Data API.

### Public catalog

- Anonymous and authenticated users may select active restaurants.
- They may select active categories/menu items belonging to active restaurants.
- They may select published reviews only.
- They may never read restaurant ownership, private profile data, phone numbers, addresses, push tokens, or internal audit data.

### Customer data

- Customers may read/update their own profile, subject to column restrictions.
- Customers may CRUD their own saved addresses and favorites.
- Customers may create an order only for their resolved profile.
- Customers may read only their own orders and order items.
- Clients cannot directly change order ownership, totals, restaurant ID, or status.

### Restaurant access

- Restaurant members may read records only for restaurants listed in `restaurant_members`.
- Managers may update menus only within their restaurant.
- Restaurant order-status changes must go through `transition_order()`.
- Owners may manage restaurant members; managers may not promote themselves.
- Review moderation is limited to the review's restaurant.

### Courier and admin access

- Couriers may read available deliveries and deliveries assigned to themselves according to the approved courier model.
- Couriers may claim/transition orders only through secured RPCs.
- Admin access is determined through `user_roles`, not a client-supplied value or the JWT `role` claim.
- Audit and status-history inserts are never granted directly to clients.

### Child-table RLS

Foreign keys do not make RLS inherit automatically. `order_items` must have its own policies using an `exists` check against the parent `orders` row. Apply the same pattern to any other child table whose access depends on a parent.

## 7. Secured database operations

Create RPCs for operations that require multi-row validation or atomicity:

- `create_order(...)`.
- `transition_order(order_id, new_status)`.
- `claim_delivery(order_id)` if couriers claim work.
- `submit_product_review(...)`.
- `submit_order_review(...)`.
- `moderate_review(...)`.
- `set_restaurant_member(...)`.

Every `SECURITY DEFINER` function must:

- Resolve the caller from the JWT internally.
- Validate memberships/roles from protected tables.
- Ignore client-supplied ownership or role claims.
- Use a fixed empty `search_path` and fully qualified object names.
- Be owned by a dedicated, non-login role with only necessary privileges.
- Have `execute` revoked from `public` and granted only to intended API roles.
- Validate all transitions and inputs.
- Write audit/history records in the same transaction.
- Be covered by allow and deny tests.

Use server/database enforcement for abuse controls that matter. UI throttling is only an additional usability measure.

## 8. Repository architecture

Screens must not import Firebase or Supabase SDKs directly.

Create backend-neutral interfaces:

- `src/data/authRepository.ts`.
- `src/data/profileRepository.ts`.
- `src/data/restaurantRepository.ts`.
- `src/data/menuRepository.ts`.
- `src/data/orderRepository.ts`.
- `src/data/reviewRepository.ts`.
- `src/data/addressRepository.ts`.
- `src/data/favoritesRepository.ts`.
- `src/data/notificationRepository.ts`.

During migration, each repository may select a Firebase or Supabase implementation through typed feature flags. Do not spread feature-flag checks through screens.

Initial direct-coupling inventory includes:

- `mobile/lib/firebase.ts`.
- `mobile/lib/firebaseAuth.ts`.
- `mobile/lib/api.ts`.
- `mobile/lib/registerPushToken.ts`.
- `mobile/lib/restaurantOwnership.ts`.
- `mobile/src/services/firebaseOrders.ts`.
- `mobile/src/services/menuItemReviews.ts`.
- `mobile/src/services/orderReviews.ts`.
- `mobile/src/services/restaurantMetrics.ts`.
- `mobile/src/features/address/addressStore.ts`.
- `mobile/store/favorites.store.ts`.
- Restaurant-panel, courier, admin, profile, cart, and notification consumers.

Repository return types must preserve the shapes expected by the UI until a separately tested domain-model cleanup is performed.

## 9. Milestones

### Milestone 0 — Inventory and baselines

- [x] Freeze and document the complete Firestore collection/subcollection inventory.
- [x] Record document counts and representative schemas.
- [x] Locate Firebase Cloud Functions, scheduled jobs, App Check, Storage, and notification services outside the mobile directory.
- [x] Record current Firestore indexes and security rules.
- [x] Record current Firebase Auth provider configuration and user count.
- [x] Capture baseline order totals, review totals, restaurant ownership, and active-order counts.
- [x] Add a migration risk/decision log.

Exit gate:

- Inventory is reviewed, sensitive fields are classified, and all open decisions in Section 3 have owners.

Completed and approved by the app owner on 2026-09-02. Baseline fingerprints and deferred anomaly owners are recorded in the Milestone 0 documents.

Rollback: Not applicable; no runtime changes.

### Milestone 1 — Supabase project and local tooling

- [x] Create the Frankfurt development project. By app-owner exception, staging and production are deferred until before public launch because all current Firebase data is test-only.
- [x] Initialize Supabase CLI configuration in the repository.
- [x] Add tracked `.env.example` files containing names only.
- [x] Confirm real `.env` and generated credential files are ignored.
- [x] Install `@supabase/supabase-js` and `react-native-url-polyfill` using Expo-compatible versions.
- [x] Add `lib/supabase.ts` behind a disabled feature flag.
- [x] Add database type generation to the development workflow.
- [x] Establish migration, reset, seed, and test commands.

Firebase Auth bridge requirements:

- [x] Configure the Supabase Firebase third-party auth integration for development. Staging and production remain blocked with their projects.
- [x] Ensure existing and future Firebase users receive `role: authenticated` in their Firebase JWT.
- [x] Configure the client with an `accessToken` callback that returns the current Firebase ID token.
- [x] Do not configure Supabase Auth session persistence as if Supabase Auth were already active.

Exit gate:

- A Firebase-authenticated test user can call a harmless secured Supabase test endpoint, while anonymous and wrong-project tokens are denied.

Exit-gate result: Passed in hosted development on 2026-09-03. The six-case allow/deny matrix passed, the future-user trigger was observed, the disposable test user was deleted, and the app owner confirmed remote revocation of the temporary credential.

Rollback: Disable the Supabase feature flag; Firebase behavior is unchanged.

Current status: Completed and approved on 2026-09-03. See `docs/milestone-1-evidence.md` for the validation record and approved environment exception.

### Milestone 2 — Schema and identity bridge

- [x] Create private/import and public application schemas as designed.
- [x] Create profiles and authentication-identity mapping.
- [x] Create all core tables, constraints, indexes, and timestamp triggers.
- [x] Create protected role/membership tables.
- [x] Create audit/status-history tables.
- [x] Seed only non-sensitive development fixtures.
- [x] Generate TypeScript database types.

Exit gate:

- Migrations rebuild a clean local database from zero.
- Constraint tests demonstrate that invalid/orphaned data is rejected.

Exit-gate result: Passed on 2026-09-03. Two consecutive clean local rebuilds, application-schema lint, 81 database assertions, hosted migration parity, 18 empty hosted application tables, and 55 hosted indexes were verified. Firebase remains active and Supabase remains disabled.

Current status: Completed and approved by the app owner on 2026-09-03. See `docs/milestone-2-evidence.md` for the validation record.

Rollback: Drop/recreate the unused Supabase development project; production is untouched.

### Milestone 3 — Grants, RLS, and RPC security

- [x] Revoke default privileges for `anon` and `authenticated`.
- [x] Grant only required operations per table.
- [x] Enable RLS on every exposed table.
- [x] Implement identity, membership, and role helper functions.
- [x] Implement explicit child-table policies, including `order_items`.
- [x] Implement secured RPCs and audit/history writes.
- [x] Add pgTAP or scripted tests for anonymous, owner, different user, manager, other restaurant, courier, and admin cases.
- [x] Test column exposure and views as well as base tables.

Exit gate:

- Automated RLS tests pass for all allow and deny cases.
- The publishable key cannot bypass intended boundaries.
- No secret key exists in the application bundle or tracked files.

Exit-gate result: Passed on 2026-09-03. Local and hosted security suites, concurrent courier claiming, publishable-key boundaries, schema/advisor checks, secret scanning, and the live Firebase-token issuer/audience/role matrix all passed. Firebase remains active and Supabase remains disabled.

Current status: Completed and approved by the app owner on 2026-09-03. The temporary Firebase Authentication Admin key was revoked and its local JSON was removed. See `docs/milestone-3-evidence.md`.

Rollback: Supabase feature flags remain off.

### Milestone 4 — Repository extraction

- [x] Introduce backend-neutral repository interfaces.
- [x] Wrap current Firebase operations in Firebase repository implementations without changing behavior.
- [x] Remove direct Firebase imports from UI modules.
- [x] Add contract tests against Firebase test data/mocks.
- [x] Implement corresponding Supabase repositories behind per-domain flags.
- [x] Preserve unsubscribe semantics for listeners.

Exit gate:

- The Firebase-backed application passes its existing smoke tests through repositories.
- Switching a repository flag does not require screen changes.

Rollback: Select Firebase implementations for every repository.

Current status: Implemented on 2026-09-03 and awaiting app-owner exit-gate approval. Firebase remains active and Supabase remains disabled. See `docs/milestone-4-evidence.md`.

### Milestone 5 — Public catalog migration

Scope: restaurants, categories, and menu items only.

- [ ] Export Firestore catalog collections.
- [ ] Transform and import into non-exposed staging tables.
- [ ] Validate IDs, counts, active flags, prices, category relations, ordering, and image references.
- [ ] Promote validated data into application tables with upserts.
- [ ] Compare Firebase and Supabase repository contract results.
- [ ] Enable Supabase catalog reads in development, then staging.
- [ ] Run customer and restaurant-panel menu smoke tests.

Exit gate:

- Catalog parity report has no unexplained differences.
- Anonymous access can read active catalog rows only.
- Orders and authentication still use Firebase.

Rollback: Switch catalog repository flag back to Firebase.

### Milestone 6 — Profiles, ownership, addresses, and favorites

- [ ] Import profiles with preserved Firebase IDs and Firebase UID mappings.
- [ ] Transform owner/manager fields into `restaurant_members`.
- [ ] Import address subcollections and favorite arrays.
- [ ] Validate default-address uniqueness and membership ownership.
- [ ] Enable domains individually: profiles, then membership, then addresses, then favorites.
- [ ] Test account deletion/anonymization behavior.

Exit gate:

- Users cannot read one another's data.
- Restaurant operators cannot access another restaurant.
- Counts and ownership match Firestore baselines.

Rollback: Re-enable individual Firebase repositories.

### Milestone 7 — Reviews and metrics

- [ ] Normalize legacy `itemId`/`menuItemId` fields.
- [ ] Import product and order reviews.
- [ ] Quarantine unresolved records for human review rather than guessing.
- [ ] Implement transactional submission/moderation RPCs.
- [ ] Replace client recomputation with database aggregation logic or verified views.
- [ ] Compare rating averages/counts against Firestore.
- [ ] Test published/hidden visibility and restaurant moderation boundaries.

Exit gate:

- Review counts and aggregates reconcile.
- Unauthorized review creation/moderation tests fail as expected.

Rollback: Return review reads/writes to Firebase; retain imported Supabase data for diagnosis.

### Milestone 8 — Orders and order items

- [ ] Export and normalize orders/items into staging.
- [ ] Validate subtotal, fees, discount, tip, total, restaurant, profile, status, and item snapshots.
- [ ] Quarantine inconsistent financial records.
- [ ] Implement atomic `create_order()` and `transition_order()` RPCs.
- [ ] Implement reminder and courier assignment operations securely.
- [ ] Confirm status history and audit records are created transactionally.
- [ ] Test customer, restaurant, courier, and admin workflows.

Exit gate:

- Every migrated order total reconciles or appears in an approved exception report.
- Invalid status transitions and cross-tenant access are rejected.
- Do not switch production order writes yet.

Rollback: Orders continue using Firebase.

### Milestone 9 — Realtime

Migrate these flows:

- Individual order tracking.
- Customer order lists/history.
- Restaurant active order queue.
- Courier queue.
- Super-admin dashboard.
- Global order-status notifications.

For each subscription:

1. Fetch the authorized initial dataset.
2. Open the authorized realtime channel.
3. Merge inserts/updates/deletes without duplicates.
4. Recover after app foregrounding or connection loss.
5. Remove the channel on unmount/logout/account change.

Start with Postgres Changes if needed for delivery speed. Before production scale, evaluate private Broadcast channels, which Supabase currently recommends for scalability and security.

Exit gate:

- Reconnect, duplicate-event, logout, cross-user, cross-restaurant, and background/foreground tests pass.
- A courier cannot receive unrelated order events.

Rollback: Switch realtime repositories to Firestore listeners.

### Milestone 10 — Push notifications and backend jobs

- [ ] Move push-token persistence to Supabase.
- [ ] Inventory and replace Firestore-triggered notification functions.
- [ ] Use Edge Functions or another trusted server for Expo push delivery.
- [ ] Move scheduled auto-cancel/reminder work out of client-only execution where appropriate.
- [ ] Add retries, idempotency keys, delivery logging, and dead-letter handling.
- [ ] Confirm secret keys exist only in server-managed secrets.

Exit gate:

- Order notifications work for foreground, background, terminated, and logged-out states.
- Duplicate pushes and unauthorized sends are prevented.

Rollback: Restore Firebase notification backend and token repository.

### Milestone 11 — Production data cutover

Preferred for a small/medium deployment: scheduled maintenance window.

1. Announce and enable maintenance/read-only mode for database-changing actions.
2. Take a full Firestore backup and verify it is restorable.
3. Run the final idempotent export/transform/import.
4. Reconcile counts, financial totals, ownership, reviews, statuses, and active orders.
5. Run the production RLS/security suite.
6. Run customer, restaurant, courier, admin, realtime, and notification smoke tests.
7. Switch production feature flags to Supabase.
8. Monitor closely and keep Firestore unchanged as the rollback source.

If zero/low downtime is mandatory, use a trusted server-side synchronization pipeline with an outbox, retries, idempotency, and reconciliation. Do not dual-write independently from the mobile client.

Go/no-go conditions:

- No unresolved financial discrepancies.
- No unresolved ownership or authorization discrepancies.
- No failing RLS tests.
- No missing active orders.
- Realtime and push tests pass.
- Rollback has been rehearsed.

Rollback trigger examples:

- Unauthorized cross-user or cross-restaurant access.
- Missing/duplicated orders.
- Incorrect totals or status transitions.
- Material authentication failures.
- Realtime/push failure above the agreed threshold.

Rollback action:

- Re-enable maintenance mode.
- Point repository flags back to Firebase.
- Do not attempt an unreviewed reverse sync from Supabase into Firestore.
- Reconcile writes made after cutover before reopening.

### Milestone 12 — Supabase Auth migration

This milestone requires separate approval.

- [ ] Choose password-preserving migration or password reset.
- [ ] Export/import users with official migration tooling where applicable.
- [ ] Populate `profiles.supabase_user_id` without changing stable `profiles.id` values.
- [ ] Update RLS identity resolution to support both providers during rollout.
- [ ] Replace Firebase auth repository with Supabase Auth implementation.
- [ ] Configure email verification, password reset, redirect URLs, and production SMTP.
- [ ] Test token refresh, app backgrounding, logout, account deletion, and deep links.
- [ ] Remove the Firebase identity path only after all active users/sessions have an approved transition.

Exit gate:

- Authentication success/error behavior matches the existing app.
- Profiles, orders, addresses, favorites, memberships, and reviews remain attached to the same people.

Rollback: Keep dual-provider identity resolution and restore Firebase auth repository.

### Milestone 13 — Decommission and cleanup

- [ ] Observe the agreed stability period.
- [ ] Confirm no production reads/writes/listeners still use Firebase.
- [ ] Remove Firebase SDK code and environment variables.
- [ ] Remove temporary flags and compatibility adapters.
- [ ] Archive migration reports and exception decisions.
- [ ] Rotate server-side migration credentials and remove temporary access.
- [ ] Retain or delete Firestore according to the approved retention plan.
- [ ] Update architecture, onboarding, incident, and disaster-recovery documentation.

Exit gate:

- Dependency and source audits find no unintended Firebase runtime usage.
- Production backup/restore and Supabase monitoring procedures are documented.

## 10. Data migration pipeline

The migration pipeline must be scripted and repeatable:

1. Export each Firestore collection/subcollection.
2. Store raw exports in an encrypted, access-controlled location outside git.
3. Transform records into deterministic staging files.
4. Load files into a private staging schema.
5. Run validation queries.
6. Upsert valid rows into final tables in dependency order.
7. Write invalid rows to an exception report without unnecessary PII.
8. Re-run and prove that no duplicates or changes occur unexpectedly.

Import dependency order:

1. Profiles.
2. Restaurants.
3. User roles and restaurant memberships.
4. Categories.
5. Menu items.
6. Addresses and favorites.
7. Orders.
8. Order items.
9. Product and order reviews.
10. Push tokens where still valid.

Validation reports must include:

- Source/export/staging/final row counts.
- Missing foreign keys.
- Duplicate IDs and uniqueness violations.
- Order financial reconciliation.
- Status-value distribution.
- Review count and aggregate comparison.
- Restaurant ownership/membership comparison.
- Address/default-address comparison.
- Timestamp conversion failures.
- Quarantined record count with approved disposition.

## 11. Testing matrix

Test on iOS, Android, and web where the feature exists.

### Authentication and identity

- Anonymous, valid Firebase user, wrong Firebase project, expired token, Supabase user, deleted user.
- Customer, restaurant manager, restaurant owner, courier, admin, and super-admin.
- App background/foreground and refresh-token behavior.

### Authorization

- Each intended operation succeeds for the correct actor.
- The same operation fails for another customer/restaurant/courier.
- Anonymous access returns only public catalog/published review data.
- Direct REST calls with the publishable key cannot bypass UI restrictions.

### Data correctness

- Price and total calculations.
- Order creation and all valid/invalid transitions.
- Review eligibility and uniqueness.
- Rating aggregates after publish/hide/restore.
- Ownership, favorites, and default addresses.
- Delete/anonymize account behavior.

### Realtime and resilience

- Initial fetch plus subsequent change.
- Offline/reconnect without duplication.
- Subscription cleanup after logout and account change.
- App foreground/background transitions.
- Multiple devices updating one order.
- Delayed/out-of-order events.

### Operational

- Clean database rebuild from migrations.
- Backup restoration.
- Import idempotency.
- Feature-flag rollback.
- Monitoring and alert delivery.

## 12. Required evidence per milestone

Do not mark a milestone complete without attaching:

- Migration filenames/commit references.
- Automated test output.
- RLS allow/deny test output where relevant.
- Data reconciliation report where relevant.
- Manual smoke-test checklist.
- Known exceptions and human approvals.
- Rollback test result.

Update the status table below after each milestone.

| Milestone | Status | Evidence link | Approved by | Date |
|---|---|---|---|---|
| 0 Inventory | Completed | [Inventory](migration-inventory.md), [baseline](migration-baseline.md), [decisions](migration-decisions.md) | App owner | 2026-09-02 |
| 1 Project/tooling | Not started | | | |
| 2 Schema/identity | Not started | | | |
| 3 RLS/RPC security | Not started | | | |
| 4 Repositories | Not started | | | |
| 5 Catalog | Not started | | | |
| 6 Profiles/ownership | Not started | | | |
| 7 Reviews | Not started | | | |
| 8 Orders | Not started | | | |
| 9 Realtime | Not started | | | |
| 10 Notifications | Not started | | | |
| 11 Production cutover | Not started | | | |
| 12 Supabase Auth | Not started | | | |
| 13 Decommission | Not started | | | |

## 13. Definition of done

The migration is complete only when:

- Supabase is the sole production database and intended authentication provider.
- All required data reconciles with approved exceptions.
- RLS/RPC security tests pass.
- Customer, restaurant, courier, and admin workflows pass.
- Realtime and notifications are stable.
- No secret credentials are shipped or tracked.
- Firebase runtime dependencies and code paths are removed.
- Firestore retention/deletion follows the approved policy.
- Backup, restore, monitoring, incident response, and rollback documentation is complete.

## 14. Immediate next action

Revoke the temporary Firebase audit key, complete or explicitly accept the recorded EU-region and retention legal reviews, then begin Milestone 1. Continue to block Supabase schema work until those prerequisites are recorded.

## 15. Official references

- Supabase Firestore data migration: https://supabase.com/docs/guides/platform/migrating-to-supabase/firestore-data
- Supabase Firebase Auth integration: https://supabase.com/docs/guides/auth/third-party/firebase-auth
- Supabase Firebase Auth migration: https://supabase.com/docs/guides/platform/migrating-to-supabase/firebase-auth
- Supabase React Native Auth: https://supabase.com/docs/guides/auth/quickstarts/react-native
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime database changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
