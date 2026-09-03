# Milestone 1 Evidence

Status: Completed and approved
Last updated: 2026-09-03
Migration authority: `docs/firebase-to-supabase-migration-plan.md`

No database passwords, API secrets, Firebase identifiers, user identifiers, emails, or tokens are recorded here.

## Completed

- Authenticated the Supabase CLI to the new account. Cloud helpers inject a PAT from the dedicated ignored `secure/supabase-cli-hungrie/` credential store because the CLI's `--profile` flag selects API endpoint configuration rather than an account session.
- Inspected the pre-existing `HungrieApp` project and left it untouched because it is outside the approved Frankfurt region.
- Created a separate `HungrieApp Development` project in `eu-central-1` using Postgres 17 and a generated high-entropy database password.
- Stored cloud project state only in ignored `secure/` storage with mode `0600`.
- Pushed the versioned authentication probe migration to hosted development.
- Configured and independently verified exactly one hosted Firebase third-party Auth integration for the expected Firebase issuer.
- Verified the hosted probe denies anonymous requests and malformed bearer tokens using only the publishable key.
- Generated database types from the hosted development schema.
- Wrote only the development URL and publishable key to ignored `mobile/.env.local` with mode `0600`; verified `EXPO_PUBLIC_SUPABASE_ENABLED=false`.
- Initialized versioned Supabase configuration, migrations, seed configuration, pgTAP tests, local/cloud helper commands, and a repository-pinned Supabase CLI 2.116.0.
- Proved a clean local start and database reset.
- Database lint passed with no schema errors.
- The temporary secured RPC passed five local pgTAP assertions covering grants and role-claim behavior.
- Generated tracked TypeScript database types and passed the mobile TypeScript check.
- Installed `@supabase/supabase-js` 2.114.0; retained `react-native-url-polyfill`.
- Added a safe disabled mobile client with no Supabase Auth persistence, refresh, or URL-session detection.
- Added and passed missing, partial, and configured-but-disabled client configuration tests.
- Added a dry-run-first existing-user claim reconciliation utility that preserves unrelated claims and emits sanitized counts only.
- Deployed `assignSupabaseRoleOnUserCreate` to Firebase in `us-central1`; only that new function was selected for deployment.
- Reconciled all 58 Firebase accounts: 58 updated, zero conflicting role claims, and a verification pass reported 58 already correct with zero remaining updates.
- Passed all six hosted probe cases: a valid Hungrie Firebase token was allowed; anonymous, malformed, expired, wrong-project, and missing-role tokens were denied.
- Observed the deployed creation trigger assigning the role to the disposable test user and verified that the test user was deleted afterward.
- Passed the complete local test suite, Expo lint/config validation, TypeScript, database lint, migration replay, and a 1,727-file tracked/untracked secret-pattern scan with zero hits.

## Deferred before production launch

- Rotate the separately exposed APNs private key before production release.
- Provision Frankfurt staging and production projects and repeat hosted checks before public launch. The app owner approved deferral because the current Firebase dataset and accounts are test-only.

The app owner confirmed remote revocation of the temporary Firebase Authentication Admin key on 2026-09-03. Its local JSON had already been permanently removed.

The current application dependency tree has separately recorded npm audit findings. They were not auto-fixed because forced upgrades could change the existing Expo runtime and are outside this database-tooling milestone.

The Supabase CLI supports a single macOS Keychain account session rather than named account sessions. Logging into the Hungrie account replaced the CLI's global session. The repository now copies that PAT into an ignored, Hungrie-specific credential store and injects it only into these helpers, but any other Supabase CLI account must be logged into again when used outside this repository.

During the Firebase function deployment, verbose Firebase CLI output included the value of an existing APNs private key. The generated debug log was removed and the repository secret scan is clean, but the app owner must rotate/revoke that APNs key because terminal/session output is not an acceptable secret boundary.

## Exit decision

Milestone 1 passed and was approved on 2026-09-03. Firebase continues to serve all application data and `EXPO_PUBLIC_SUPABASE_ENABLED` remains false. The staging/production and APNs items above remain mandatory pre-launch work but do not block Milestone 2 under the approved test-only exception.
