# Milestone 3 Evidence

Status: Completed and approved
Last updated: 2026-09-03
Migration authority: `docs/firebase-to-supabase-migration-plan.md`

No Firebase application data was imported. No user identifiers, contact details, addresses, access tokens, database credentials, or project references are recorded here.

## Implemented

- Added least-privilege grants and RLS policies for all exposed application tables, including explicit parent authorization for order items and reviews.
- Added strict Firebase issuer/audience identity mapping for `hungrieapp-a2288` and future native Supabase identity mapping through `profiles.supabase_user_id`.
- Kept application authorization in protected role, membership, and restaurant-courier tables; Firebase's fixed bridge claim is not used as an application role.
- Added restaurant-scoped courier assignments and moved order contact/address snapshots into a protected one-to-one table.
- Added curated active-catalog and published-review views plus customer, restaurant-member, courier, admin, and caller-membership views with terminal-order contact masking.
- Added authenticated RPCs for profile initialization/update, default-address selection, order quote/create/reminder/transitions, courier claiming, review submission/moderation, role and membership management, and catalog management/deactivation.
- Made pricing server-controlled, using current menu/customization prices and the restaurant delivery fee. Service fee, discount, and tip remain zero.
- Enforced the approved order workflow and atomic audit/status-history recording. Catalog removal is soft deactivation only.
- Removed the temporary Milestone 1 authentication probe and generated current hosted TypeScript database types.

## Completed validation

- Clean local migration replay and synthetic seed rebuild succeeded repeatedly from zero.
- Database lint passed for `public`, `private`, and `migration` with no errors.
- Five pgTAP suites passed 195 assertions covering schema security, identity mapping, role isolation, private-schema denial, view masking, RPC allow/deny paths, financial validation, and audit/history behavior.
- A real two-session concurrency test proved that exactly one scoped courier can claim a ready order and that only one assignment/history transition is committed.
- The hosted transactional test passed 13 publishable-key and synthetic-identity cases and rolled back all hosted fixtures.
- Hosted verification confirmed seven matching migrations, 20 expected application/protected/import tables, required indexes and security definitions, and zero security or performance advisor errors.
- The publishable-key matrix allowed the curated public catalog while denying protected columns, anonymous mutation, and malformed-token mutation.
- Full repository tests, TypeScript, Expo ESLint, Expo public configuration validation, tracked database-type generation, patch validation, and the final repository secret-pattern scan passed.
- Firebase remains active and `EXPO_PUBLIC_SUPABASE_ENABLED=false`; no application screen or repository was switched.

## Live Firebase-token matrix

The sanitized hosted probe passed on 2026-09-03 using a newly created temporary Firebase Authentication Admin credential stored outside the repository. It verified:

- a valid Hungrie Firebase token was accepted;
- anonymous, malformed, expired, wrong-project, and missing-role tokens were denied;
- the user-creation claim trigger assigned the bridge claim;
- the synthetic Firebase user and Supabase profile were deleted afterward.

Only sanitized booleans were written under ignored `secure/`. The app owner confirmed that the temporary key was revoked in Google Cloud IAM, and local JSON removal was verified on 2026-09-03.

## Review record

- Reviewed by: App owner
- Review date: 2026-09-03
- Exit-gate decision: Approved; Milestone 3 complete
- Rollback posture: Supabase remains disabled, so Firebase application behavior is unchanged; any correction is delivered as a new migration.
