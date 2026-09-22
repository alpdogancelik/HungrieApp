# Restaurant Earnings — Development Baseline Alignment Review

**Activity:** Separately authorized Development-only baseline alignment  
**Status:** Complete; Development aligned through `20260921100000`  
**Phase 4:** Remains blocked and has not resumed  
**Date:** 2026-09-22

## Pre-apply review

Development positively resolved to Supabase project `rgjlsjwsitbnwoetmidb` (`HungrieApp Development`, healthy, Frankfurt). It differs from the recorded Staging reference. No Staging or Production endpoint was queried.

The three authorized migrations are tracked, committed repository files with no working-tree modification. Their checksums match the previously accepted Staging evidence and guarded migration utilities:

| Order | Migration | Purpose | SHA-256 |
|---:|---|---|---|
| 1 | `20260918100000_phase7_staging_reliability.sql` | Add the private repeated-order-non-response detector; schedule it every five minutes; change pending-order expiry to every 15 seconds | `ac3419cade9767d9257fdceb963ee42d5e454934dec73cd59b17a2366286a9cd` |
| 2 | `20260920170000_restaurant_customer_cancellation_message.sql` | Add a private RLS-protected cancellation-message record and guarded Restaurant/Customer v2 RPCs | `74fc88781ad02518cc60c2d86fd8104ca899c3f622d14fca0551fbbd170cc30b` |
| 3 | `20260921100000_customer_push_language.sql` | Add device-language-aware Customer push registration and replace the delivery claim projection with token-first language selection | `d36097b124818e12051cefd80526743f782f1562502d98125e7e80451c279e84` |

### Dependencies and compatibility

- Migration 1 dependencies are present: `private.expire_pending_orders(integer)`, `private.write_audit`, `private.restaurant_operational_incidents`, order deadlines/status history, and pg_cron. The detector function does not already exist.
- Migration 2 dependencies are present: active Restaurant/Customer guards, `restaurant_transition_order_v1`, `get_my_customer_order_v1`, orders, profiles, and API-owner role. Its table and both v2 RPCs do not already exist.
- Migration 3 dependencies are present: notification enum/tables, `push_tokens.preferred_language`, Customer guard, push registration, materialization/current-event helpers, and the existing delivery-claim function. Its new Customer registration RPC does not already exist.
- No authorized migration contains or depends on `restaurant_earnings_v1`, the earnings migration, or any earnings relation/RPC.
- Repository order is dependency-safe. The migrations do not depend on one another beyond the already-applied Development baseline, but will be applied in timestamp order.
- Live history has 47 migrations through `20260917110000`; the pending set is exactly these three migrations followed by the unauthorized earnings migration.

### Data-impact risk

- Migrations 2 and 3 contain no data backfill or destructive DML. Migration 2 creates an empty table. Migration 3 replaces a function and adds a function.
- Migration 1 changes cron configuration. Its jobs can later expire overdue pending orders and create operational incidents/audits. Immediately before backup/application, Development had zero overdue pending orders, zero detector candidates, and zero existing incidents. Protected order/status/incident/push-token counts and digests must reconcile after every application.
- No table-row backup is required because the reviewed migrations do not rewrite existing rows and the live scheduler candidate count is zero. Recovery artifacts contain schema, the two replaced function definitions, the two relevant cron definitions, migration history, and non-PII counts/digests.

### Rollback and forward-fix policy

Do not rewrite migration history or edit an accepted migration. If validation fails, stop immediately. Preserve data, disable only an unsafe newly scheduled job if operational containment is required, and use a separately reviewed additive forward fix. The protected schema/function/cron artifacts describe the pre-apply recovery state without containing Customer rows.

### Required validation after each migration

1. Confirm exactly one new history row and the expected latest version.
2. Confirm the remaining pending set contains only the later authorized migrations plus the earnings migration.
3. Reconcile protected counts/digests and confirm zero overdue/detector candidates.
4. Migration 1: verify detector owner, empty search path, denial to authenticated, and exact cron schedules/commands.
5. Migration 2: verify empty table, RLS, owner, direct-table denial, authenticated RPC grants, and anonymous denial.
6. Migration 3: verify function ownership/search path, authenticated/anonymous grants, push-token privacy, and no token-row mutation.
7. Confirm the earnings capability objects remain absent and no `earnp4_` fixtures exist.

## Pre-hosted automated checks

- Clean local reset through all repository migrations: PASS.
- Local database lint: PASS, zero errors.
- Full pgTAP suite: PASS, 896 tests across 30 files.
- Relevant Phase 7/Phase 4 Node tests: PASS, 21 tests.
- Notification worker regression suite: PASS, 11 tests.
- Admin and Restaurant TypeScript checks: PASS.
- Scoped Development dry-run for migration 1: PASS; only the authorized first migration resolved.
- Accepted Phase 1–3 protected-hash checker: PASS.

## Backup and recovery evidence

The minimized backup was created at `2026-09-22T06:31:19.493Z` under ignored owner-only `secure/restaurant-earnings-development-baseline-alignment/` storage.

| Artifact | Purpose | Mode | SHA-256 |
|---|---|---:|---|
| `backup-manifest.json` | Scope, identity, sensitivity, retention, paths, and checksums | `0600` | `ff0b278f26a25ba44f7f64e6ffadc14d38b843d954bde59acefd9e980947e992` |
| `schema.sql` | Schema-only `public`, `private`, and `cron` recovery definitions | `0600` | `663fdb76b9d390bf16a4002cdbb416057320293852b58f5e7501fdea23ca78b2` |
| `function-definitions.json` | Pre-apply definitions of the two replaced functions | `0600` | `8c262afd8202e239fb89fddb6e3d557da8dc2e037c63a673a99f835629f6c159` |
| `cron-config.json` | Pre-apply definitions of the two relevant cron jobs | `0600` | `4a8cb0f663fa466c3412afd6a7cc6e50607d27ec9e7f3c6bd8d8ad5ca69a73b8` |
| `protected-baseline.json` | Migration history plus non-PII counts/digests | `0600` | `dfdd9582e2af75320f634a2c3ca12b7d636b0ea1ee84b4d5cc406ebbaf66ec60` |

The containing directory is mode `0700`. No data-row dump was created. Firebase credentials, database credentials, bearer/refresh tokens, TOTP secrets, raw push tokens, Customer PII, and raw hosted errors are excluded. Retention is Phase 4 acceptance plus seven calendar days.

## Hosted application and validation

Migration history advanced from 47 rows/latest `20260917110000` to 50 rows/latest `20260921100000`.

### `20260918100000_phase7_staging_reliability.sql`

- Applied exactly once with its accepted checksum.
- Protected order, status-history, incident, audit, and push-token baseline reconciled.
- Confirmed exact 15-second expiry job and five-minute detector job commands.
- Confirmed detector owner `hungrie_api_owner`, safe empty search path, and no authenticated execution.
- Confirmed zero overdue pending orders and detector candidates after application.

The first automated post-check initially stopped because it compared PostgreSQL's catalog representation against the literal array element `search_path=`. PostgreSQL stored the accepted `set search_path = ''` declaration as `search_path=""`. Direct function-definition inspection confirmed the safe empty search path and every other assertion passed. The checker was corrected to validate the semantic function definition; the migration was not changed or reapplied.

### `20260920170000_restaurant_customer_cancellation_message.sql`

- Applied exactly once with its accepted checksum.
- Private table is empty, RLS-enabled, owned by `hungrie_api_owner`, and unreadable by `authenticated`.
- Both guarded RPCs are executable by `authenticated`; anonymous Customer-order access is denied.
- Protected baseline reconciled and the remaining pending set was exactly migration 3 plus earnings.

### `20260921100000_customer_push_language.sql`

- Applied exactly once with its accepted checksum.
- New registration RPC is owned by `hungrie_api_owner`, uses a safe empty search path, is executable by `authenticated`, and denied to anonymous.
- `private.push_tokens` remains unreadable by authenticated clients and its count/digest is unchanged.
- The replaced delivery-claim function retains its accepted pre-existing `postgres` owner and safe search path; execute remains granted only to `service_role`, not authenticated or anonymous.

The third automated post-check initially stopped because the checker expected the replaced delivery-claim function to be owned by `hungrie_api_owner`. The original accepted notification migration deliberately leaves this service-only function owned by `postgres`; `create or replace` preserved that owner and its ACL is `{postgres, service_role}`. The checker was corrected to the accepted security contract. No database correction or migration reapplication occurred.

## Final qualification

- Hosted Development lint over `public`, `private`, and `migration`: PASS, zero errors.
- Hosted public type generation: PASS; both new public contracts exist and earnings contracts remain absent. Protected generated output is mode `0600`, SHA-256 `f669edf4e3c5503149b2a42b7fec85f5a6883769f7a4980de07893991cf11639`.
- Final protected counts/digests equal the pre-apply baseline: PASS.
- Each authorized migration history count: exactly one.
- Final pending set: only `20260922100000_restaurant_earnings_admin_commission.sql`.
- `private.feature_capabilities` and all `restaurant_earnings_v1` capability objects: absent.
- `earnp4_` Restaurants, profiles, and orders: zero.
- Disposable `earnp4_` Firebase identities: zero.
- Accepted Phase 1–3 protected hashes: unchanged.
- Staging and Production access/mutation: none.
- Deployment, preview, commit, push, earnings migration, and Phase 4 resumption: none.

Final protected verification record: `secure/restaurant-earnings-development-baseline-alignment/final-verification.json`, mode `0600`, SHA-256 `05ec4b74c66fc046092507c6459a68fd6e283392fedfdd9827ab8a8e6b6e8a86`.

## Limitations and boundary

- The direct-host lint attempt was refused by the local network's unavailable IPv6 route. The same Development database was then linted successfully through its Frankfurt session-pooler endpoint. No alternate environment was contacted.
- No real notification was sent, no Firebase identity was created, and no application UI was exercised; those are not part of this separate baseline-alignment activity.
- Phase 4 remains blocked pending explicit authorization to resume. This alignment does not authorize the earnings migration or any Phase 4 fixture activity.
