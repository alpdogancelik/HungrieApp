# Supabase Local Development

Status: Milestone 1 tooling

Firebase remains the active backend. Keep `EXPO_PUBLIC_SUPABASE_ENABLED=false` until a later milestone explicitly changes it.

## Prerequisites

- Node.js 22 or newer.
- Docker Desktop or another Docker-compatible runtime.
- The repository-pinned Supabase CLI 2.116.0 (`npm install` provides it).
- For cloud operations, authenticate to the intended account through the ignored, isolated `secure/supabase-cli-hungrie/` credential home. The repository helpers apply it automatically.

## Local workflow

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:types
npm run typecheck
npm run supabase:stop
```

`supabase/config.toml`, migrations, database tests, and `supabase/seed.sql` are tracked. Root npm scripts use the pinned CLI. Docker state, linked-project state, dumps, credentials, generated reports, and local environment files are ignored.

Database lint is intentionally limited to the application-owned `public`, `private`, and `migration` schemas. pgTAP's third-party compatibility functions live under `extensions` and are validated by the extension package rather than the application linter.

## Cloud environments

Project references and database passwords live only in `secure/supabase-projects.local.json` with file mode `0600`. The Hungrie CLI token lives only under the ignored `secure/supabase-cli-hungrie/` directory. Do not copy either into documentation, Expo configuration, logs, or Git.

On macOS, after logging the Supabase CLI into the Hungrie account, copy that session into the isolated store without printing it:

```bash
npm run supabase:auth:capture
```

```bash
npm run supabase:provision -- \
  --organization-id=<organization-id> \
  --region=eu-central-1 \
  --profile=hungrie

# Re-run with --write only after reviewing the dry run.
npm run supabase:environment -- link development
npm run supabase:environment -- push development
npm run supabase:environment -- config development
npm run supabase:firebase-auth -- development
npm run supabase:cloud:verify
npm run supabase:environment -- types development
npm run supabase:mobile-env -- development
npm run supabase:schema:verify
```

`supabase config push` configures hosted Auth settings but does not create the hosted third-party Auth integration. The separate idempotent `supabase:firebase-auth` command creates it through the Management API, and `supabase:cloud:verify` confirms the approved region, Postgres major version, recorded environments, and Firebase issuer without printing project references or integration identifiers.

Repeat the environment command with `staging` or `production` only after those isolated projects are recorded in the ignored secure state file.

## Mobile configuration

Copy variable names from `mobile/.env.example` to a local ignored environment file. Only the project URL and publishable key are valid Expo values. Database passwords, management tokens, secret keys, service-role keys, and Firebase Admin credentials must never use an `EXPO_PUBLIC_` variable.

The client in `mobile/lib/supabase.ts` is `null` unless all three conditions are met: URL present, publishable key present, and feature flag exactly enabled. It sends the current Firebase ID token through Supabase's access-token callback and does not create or persist a Supabase Auth session.

## Type generation

`npm run supabase:types` regenerates types from the clean local schema. To regenerate from the linked development project after migrations are pushed:

```bash
npm run supabase:environment -- types development
```

`npm run supabase:schema:verify` performs a sanitized hosted check of migration parity, the exact Milestone 2 table set, empty hosted row counts, and required query indexes. It reads ignored credentials internally and never prints project references or credentials.
