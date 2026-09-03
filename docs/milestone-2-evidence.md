# Milestone 2 Evidence

Status: Completed and approved
Last updated: 2026-09-03
Migration authority: `docs/firebase-to-supabase-migration-plan.md`

No Firebase records were imported and no identifiers, contact details, addresses, tokens, or project credentials are recorded here.

## Implemented

- Created locked `private` and `migration` schemas plus ten public application tables.
- Added the profile identity bridge using preserved text profile IDs, nullable unique Firebase UIDs, and nullable unique Supabase Auth UUIDs.
- Added protected platform roles, restaurant memberships, order history, push tokens, and audit records.
- Added strict restaurant/catalog, address, favorite, order/item, review, import, and identity relationships.
- Canonicalized order/payment/review/role enums and integer-kuruş financial constraints.
- Added delivered-order review guards, single-default-address enforcement, exact push-token ownership, and restrictive historical deletion behavior.
- Enabled RLS on every public application table while leaving all client grants and policies absent until Milestone 3.
- Added 55 hosted indexes, including every foreign-key lookup and the planned customer, restaurant, courier, catalog, and review paths.
- Added minimal local-only synthetic fixtures with `fixture_*` identifiers and `example.invalid` contacts. No fixture seed was pushed to hosted development.
- Generated the tracked database types from the final hosted development schema.

## Validation

- Two consecutive clean local database resets replayed all three migrations and the synthetic seed successfully.
- Database lint passed for all Hungrie-owned schemas with no errors.
- Four pgTAP files passed 81 assertions covering schema shape, fixtures, constraints, relationship isolation, review eligibility, timestamps, deletion behavior, and pre-Milestone-3 access denial.
- The full repository test suite, TypeScript, Expo ESLint, and Expo public configuration validation passed.
- Hosted development reports three matching local/remote migrations, exactly 18 application/protected/import tables, zero hosted application rows, 55 indexes, and every required query index present.
- A 1,737-file tracked/untracked secret-pattern scan found zero sensitive-key patterns and confirmed `EXPO_PUBLIC_SUPABASE_ENABLED=false`.

## Runtime and deferred work

- Firebase remains the only active application backend and `EXPO_PUBLIC_SUPABASE_ENABLED=false` remains unchanged.
- Known Firebase orphan records remain test-only and will enter the later quarantine/import workflow rather than weakening schema constraints.
- Staging, production, formal retention review, and APNs-key rotation remain mandatory pre-launch work under previously recorded decisions.
- Milestone 3 owns client grants, RLS policies, identity helpers, secured RPCs, and removal of the temporary authentication probe.

## Review record

- Reviewed by: App owner
- Review date: 2026-09-03
- Exit-gate decision: Approved; Milestone 2 complete
