# Staging Commission Configuration — Stage A Review

## Result

Stage A completed successfully on 23 September 2026 local time. Exactly one prospective version-1 commission rule was created for each of the 11 approved Staging Restaurants. Every rule uses:

- Rate: `500` basis points (`5.00%`)
- Effective UTC: `2026-09-24T09:00:00Z`
- Effective Restaurant-local time: 24 September 2026, 12:00 `Asia/Famagusta`
- Reason: `Initial Staging commission configuration: 5.00% prospective rate`

`restaurant_earnings_v1` remained disabled. Stage B was not started.

## Environment and contract guards

- Supabase target: Staging `rlrfvqskzvpysewdxqcr`
- Firebase target: shared non-production project `hungrieapp-a2288`
- Explicitly rejected Supabase target: Development `rgjlsjwsitbnwoetmidb`; the registered Production target was also excluded by the protected registry check.
- Accepted migration: `20260922100000_restaurant_earnings_admin_commission.sql`
- Verified SHA-256: `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`
- Latest recorded Staging migration: `20260922100000`
- Execution run: `stgcommission_20260924a`
- Guarded operation: only `admin_schedule_restaurant_commission_v1` was called for mutation.

Immediately before scheduling, the protected preflight captured 11 expected Restaurants, zero commission rules, zero applicable operation audits, zero nonterminal orders, zero missing nonterminal terms, two active MFA-enrolled super-admin access records, a future effective time, and a disabled capability. No unexpected Restaurant, lifecycle change, accepting-order change, migration drift, or rule conflict was present.

## Authentication and recovery history

The older protected identity-handoff passwords no longer authenticated. Two guarded attempts stopped with `INVALID_LOGIN_CREDENTIALS` before a TOTP challenge and before any scheduling RPC. No token, password, TOTP value, email, or raw hosted error body was recorded.

Execution then used non-persisted macOS prompts for an active Staging super-admin login and TOTP. The resulting token passed conservative client checks for a TOTP second factor and authentication age below four minutes, followed by authoritative `get_my_access_context_v1` validation as an active `super_admin`. The complete batch finished within that recent-authentication window; no mid-batch renewal was required.

The protected continuation manifest retained all original operation IDs. Because the failed attempts made no mutation, the successful pass was still a first run. All 11 scheduling responses reported `replayed: false`.

## Authoritative rule and audit inventory

| Restaurant | Rule ID | Operation ID | Audit ID | Result |
|---|---|---|---|---|
| `31fdf62e-a49e-41c4-b519-712c7dcd095f` | `274d22bb-19c4-498f-b6ff-395a72ed8300` | `f5ded304-90da-4f28-a93b-67d16fa800c3` | `2c6cc882-2aa6-426f-ad51-382d27c14480` | Created |
| `598eacea-dd2a-4549-a198-40593f7fab06` | `77cccd30-a956-4599-ab2a-77f8a12fbd1e` | `aa57e00e-63c4-4875-a9a2-79bfef364307` | `e7593c8b-a5cd-467a-8298-abb90bd35254` | Created |
| `ada-pizza` | `dd374842-b161-4f56-8aba-d55a29f4a448` | `d74ff9c8-42b4-4b18-baf2-872d618a8b26` | `e7e7f14e-4ef0-4be1-ac16-01cf4cf2887d` | Created |
| `alacarte-cafe` | `556e01e2-6257-403e-82a4-17585fd27568` | `d05f626a-275b-4188-9a44-0bbcf7008f37` | `67d38aa9-d78b-4133-b804-7a7ea276a665` | Created |
| `burger-house` | `f93ce977-70e7-4c03-a5bc-622a03a40004` | `e568c676-1ea3-473a-b9fc-22d9bb1ce0c4` | `562c4f87-76ae-43b9-8489-0f9d73ae700b` | Created |
| `erto-cafe` | `b535e28c-5f71-47e1-aa07-c7299f6d2199` | `ad37502d-92db-45e5-a948-65183bdc71a9` | `472b24e6-cf87-4ac5-a8df-1e87aca46f2c` | Created |
| `lavish` | `dcb0d0e5-8e08-468f-b0b1-53d9de583323` | `a8d642c0-2ec7-4938-bbb1-92862b80ed8c` | `dcab3365-df93-426f-a5a6-62d2bb172aa9` | Created |
| `lombard-kitchen` | `20782c80-fc96-41c1-8af9-7fbaa43d4fb6` | `22bf418f-9515-46f3-a33c-9574f06559e6` | `543e56f4-d1e0-4c9d-9271-d03644505cde` | Created |
| `munchies` | `0436dd41-4f3d-4d6a-8fee-9e2e405212ed` | `750f6370-7b22-4d28-971a-c8facc98fd0e` | `881572a6-05f9-47dc-9138-2b2111dfee0f` | Created |
| `root-kitchen-coffee` | `c58913cb-39fa-4369-977d-073d2b00c13c` | `970b9597-9c30-4a5e-a91a-44938d70f450` | `c8e393fe-6df0-4d0e-927c-01772c96ffc1` | Created |
| `voy` | `d4ec48ec-299f-469c-967e-c7ea612bdf72` | `163394d1-cac2-4a1e-afaa-c4ffd0fdd69c` | `d0b44335-fef7-4041-957e-9d51d02b3dce` | Created |

The authoritative refresh verified for every row: matching Restaurant and operation identity, integer rate `500`, contract version `1`, exact effective instant, exact trimmed reason, one immutable rule, and one matching successful scheduling audit. No additional commission rule or approved-operation audit existed.

## Before/after reconciliation

- Rules: `0` before; `11` after.
- Matching scheduling audits: `0` before; `11` after.
- Restaurant-state projection SHA-256 before: `0dde3f0a9b73780bb358cc3bbf423aa01ce667923bbdbbcf3ac8cab1eb4cf6cd`
- Restaurant-state projection SHA-256 after: `0dde3f0a9b73780bb358cc3bbf423aa01ce667923bbdbbcf3ac8cab1eb4cf6cd`
- Lifecycle and accepting-order state: unchanged for all 11 Restaurants.
- Nonterminal orders and missing terms: zero before and after for all 11 Restaurants.
- Pilot historical delivered orders outside the financial contract: `12`; terms `0`; snapshots `0`.
- QA historical delivered orders outside the financial contract: `1`; terms `0`; snapshots `0`.
- Capability after scheduling and final verification: disabled.

No historical order, commission term, delivered snapshot, Restaurant lifecycle, accepting-order state, application, deployment, schema, generated type, or accepted contract was changed. No backfill or historical-visibility UI was introduced.

## Evidence locations and changed files

Sensitive machine-readable evidence remains owner-only and ignored under `secure/restaurant-earnings-staging-commission/stgcommission_20260924a/`. It contains no login password, TOTP, bearer token, or raw hosted error body.

Repository additions for this activity:

- `scripts/configure-restaurant-earnings-staging-stage-a.mjs`
- `docs/restaurant-earnings-staging-commission-configuration-review.md`

No deployment, commit, or push occurred. Production was not accessed. Stage B activation was not attempted or authorized.

## Requirement and exit-gate matrix

| Requirement or gate | Status | Direct evidence |
|---|---|---|
| Exact Staging Supabase/Firebase identity | PASS | Guarded runner resolved `rlrfvqskzvpysewdxqcr` and `hungrieapp-a2288`; Development and registered Production refs were rejected. |
| Accepted migration history and checksum | PASS | Latest migration `20260922100000`; SHA-256 matched the accepted value. |
| Fresh 11-Restaurant inventory | PASS | Protected preflight captured exactly the approved IDs and states. |
| No existing/conflicting rules before first run | PASS | Baseline rules and relevant audits were both zero. |
| Future approved effective time | PASS | Database-time preflight reported the exact approved instant as future. |
| Active recent-MFA super-admin | PASS | Fresh TOTP token and authoritative active `super_admin` context validated before mutation. |
| Schedule exactly 11 approved 500-bps rules | PASS | Final authoritative rule count `11`; table above records every identity. |
| Exact reason/effective time/version/operation IDs | PASS | Per-operation response validation plus authoritative refresh passed for all 11. |
| Idempotent/partial recovery controls | PASS | Original operation IDs were retained; no mutation occurred during failed authentication; every successful operation was recorded immediately. |
| Exactly one audit per operation | PASS | Final audit count `11`; rule/audit IDs reconcile in the table above. |
| Preserve lifecycle and accepting states | PASS | Before/after Restaurant projection digests are identical. |
| Preserve historical orders/terms/snapshots | PASS | Pilot remains `12/0/0`; QA remains `1/0/0` for delivered-without-snapshot/terms/snapshots. |
| Capability remains disabled | PASS | Preflight, each authoritative refresh, and final verification all reported `false`. |
| No backfill or historical UI | PASS | Only the guarded scheduling RPC was used; no application or historical data mutation was performed. |
| No deployment, commit, or push | PASS | None performed during Stage A. |
| Production untouched | PASS | Fail-closed target resolution permitted only the exact Staging project; no Production request was made. |
| Stage B activation | N/A | Separately gated and not authorized; no activation attempt was made. |

## Limitation and next gate

These rules do not become currently applicable until `2026-09-24T09:00:00Z`. Stage A does not establish activation readiness at or after that instant. A fresh read-only Stage B preflight must re-check current rule coverage, nonterminal terms, financial-integrity warnings, unchanged contracts, and disabled capability. Enabling `restaurant_earnings_v1` requires separate explicit authorization.
