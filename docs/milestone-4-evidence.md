# Milestone 4 Evidence

Status: Implemented; pending app-owner exit-gate approval
Last updated: 2026-09-03
Migration authority: `docs/firebase-to-supabase-migration-plan.md`

No Firebase records were imported. No identifiers, contact details, addresses, access tokens, database credentials, or project references are recorded here.

## Implemented

- Added backend-neutral repository selection primitives under `mobile/src/data/`.
- Added per-domain repository facades for auth, profiles, restaurants, menu/catalog, orders, reviews, addresses, favorites, and notifications.
- Added explicit backend-neutral TypeScript contracts in `mobile/src/data/contracts.ts` instead of deriving repository interfaces from Firebase implementations.
- Kept Firebase implementations active by default and preserved existing Firebase service behavior behind those facades.
- Added concrete Supabase repository implementations for profile, restaurant, menu/catalog, order, review, address, favorites, and restaurant-panel locale/session surfaces using the Milestone 3 views and RPCs.
- Kept authentication itself Firebase-backed because Supabase Auth remains deferred to Milestone 12.
- Added an explicit inactive Supabase notification adapter because push-token persistence and server notification delivery remain owned by Milestone 10.
- Added explicit public per-domain repository flags in `mobile/.env.example` and `mobile/app.json`.
- Repointed app screens, shared components, hooks, screens, and stores away from direct Firebase service imports and toward repository facades.
- Moved restaurant-panel menu/details Firestore reads and writes behind repository methods.
- Moved restaurant-panel auth/session and panel-locale persistence behind `restaurantRepository`.
- Moved courier and admin order operations from `authRepository` into `orderRepository`.
- Moved favorites remote persistence behind a selected favorites repository while preserving the existing Zustand store API.
- Moved Firebase address and restaurant-panel session implementations under `mobile/src/data/firebase/`; feature modules now re-export repository APIs.
- Preserved listener unsubscribe semantics through the repository boundary.
- Added repository contract tests for global Supabase disable behavior, per-domain selection behavior, real facade/Supabase adapter presence, and listener unsubscribe behavior.

## Validation

- `npm --prefix mobile run test:repositories`: 5 tests passed.
- `npm --prefix mobile run test:supabase-config`: 3 tests passed.
- `npm run typecheck`: passed.
- `npm --prefix mobile run lint`: passed.
- `npm run expo:config`: passed.
- `npm test`: passed, including the repository tests and the existing Supabase pgTAP/concurrency suite.
- Import-boundary scan found no direct Firebase, legacy Firebase service, restaurant-panel auth implementation, or `lib/api` imports in `mobile/app`, `mobile/components`, `mobile/src/features`, `mobile/src/hooks`, `mobile/src/screens`, or UI-facing stores.
- `mobile/.env.local` and `mobile/.env.example` still set `EXPO_PUBLIC_SUPABASE_ENABLED=false`.
- `mobile/app.json` exposes every repository domain flag as `firebase`.

## Runtime posture

- Firebase remains the selected backend for every repository domain.
- Supabase remains disabled for application traffic.
- No data import, dual-write, Firebase decommissioning, or next-milestone data switching was performed.

## Exit decision

- Reviewed by: Pending app owner
- Review date: Pending
- Exit-gate decision: Pending approval
- Rollback posture: keep every repository domain selected as Firebase. Domain-specific Supabase implementations remain inactive until later data milestones approve repository switching.
