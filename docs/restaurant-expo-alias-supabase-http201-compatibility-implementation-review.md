# Restaurant Expo Alias Diagnostic — Supabase HTTP 201 Compatibility Implementation Review

**Status:** LOCAL OPERATOR CORRECTION PASS; CHECKPOINT AND HOSTED EXECUTION NOT AUTHORIZED
**Prepared:** 2026-09-25
**Required parent:** `47104d426b3eb36486956f1de1db0aa5e6616393`
**Proposed next run:** `ruip6ad_20260925b`
**Phase 6:** `BLOCKED`

## Finding and root cause

The terminally aborted run `ruip6ad_20260925a` failed before deployment because the common hosted-observation validator required HTTP `200` for every read. The Supabase Management API's POST `/v1/projects/{ref}/database/query` endpoint documents HTTP `201` as its successful response. The preserved sanitized preflight evidence recorded `201` for each of the three read-only SQL transactions and complete valid result bodies for migration parity, the exact function/ACL catalog, and the disabled Earnings capability.

Affected call sites are limited to `createHostedReaders().collect()` operations `supabase-migrations`, `supabase-function-catalog`, and `supabase-earnings-capability`. Baseline preflight, promotion preflight, and finalization all consume that shared read path. Supabase project identity, Firebase project identity, Expo alias metadata, provider reconciliation, route, and asset observations are unaffected.

The public contract evidence is the Supabase [Run a query Management API reference](https://supabase.com/docs/reference/api/v1-run-a-query), which identifies the exact POST endpoint and `201` response. The separate [Read only query reference](https://supabase.com/docs/reference/api/v1-read-only-query) also documents `201`; the operator continues using its already-reviewed transaction-wrapped `/database/query` endpoint and does not change endpoints in this correction.

## Narrow correction

The common observation validator now accepts an explicit per-observation allowed-status list, defaulting to `[200]`. Only the three named SQL observations receive `[200, 201]`. The SQL transport wrapper separately requires status `200` or `201` and an array response before any transformation. The existing semantic validators remain mandatory:

- exact Staging Supabase, shared non-production Firebase, EAS project, and alias identities;
- migration `20260924140000` applied exactly once, its accepted local SHA-256, and zero pending migrations;
- exactly three expected function identities with exact definitions, owners, security-definer flags, volatility, configuration, and ACLs;
- exact `restaurant_earnings_v1` row with `enabled: false`;
- fresh run/stage/source bindings, unique request IDs, exact payload digests, and complete protected evidence.

Malformed or incomplete `201` bodies, non-array SQL bodies, statuses other than `200`/`201`, and `201` on non-SQL observations fail closed. Failed collection is persisted before the exception is returned.

## Changed-file inventory and SHA-256

| File | Purpose | SHA-256 |
|---|---|---|
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | Endpoint-scoped response handling; exact lineage and new-run binding | `8be9d0bce40799f3aa9a75539044959eaa0b6a024e5b7f37c3689c75e539eaf9` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | Deterministic 200/201, malformed-body, status, persistence, and full-preflight tests | `fbd3c3af540fd2432eb247b3202a19ed1dfe44e6354dde3e9eef6f2549ecb126` |
| `docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md` | New run, direct-child contract, and HTTP response rule | `4f07c54d1b6291a3272b242324c3e24eb02b62c84d8cd906b31f1b110fd880d4` |
| `docs/restaurant-expo-alias-final-execution-readiness-handoff.md` | Preserved abort, corrected contract, and future execution boundary | `899c55b1ab3636b871452dfbc3b835382709415922827f66537c398334fc2e7c` |
| `docs/restaurant-expo-alias-supabase-http201-compatibility-implementation.diff` | Complete four-file implementation diff from the required parent | `bb251ba1bc45c9803323acba6c7e4c0c4924c34f336092a05a32cc8d91cc02a7` |
| `docs/restaurant-expo-alias-supabase-http201-compatibility-implementation-review.md` | This review | Calculate after final write; reported with the review package |

The complete diff is a 621-line faithful patch from `47104d426b3eb36486956f1de1db0aa5e6616393` for the two executable files and two updated execution documents. The implementation review and diff are not included inside that recorded patch, avoiding self-reference.

## Deterministic qualification

| Command | Result |
|---|---|
| `node --test scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | PASS — 47/47 |
| `node --test scripts/test-restaurant-alias-parity-verifier.mjs scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | PASS — 46/46, including all 14 legacy verifier cases |
| `node --check scripts/restaurant-alias-diagnostic-execution-support.mjs` | PASS |
| `node --check scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | PASS |
| `npm --prefix apps/restaurant run typecheck` | PASS |
| `npm run test:restaurant-responsive-ui-phase1` | PASS — 8/8 |
| `npm run test:restaurant-responsive-ui-phase2` | PASS — 13/13 |
| `npm run test:restaurant-responsive-ui-phase3` | PASS — 14/14 |
| `npm run test:restaurant-responsive-ui-phase4` | PASS — 8/8 |
| `npm run test:restaurant-responsive-ui-phase5` | PASS — 8/8 |
| `npm run notification-worker:test` | PASS — 11/11 |
| `npm run test:review-v2-repositories` | PASS — 6/6 |
| `npm run test:restaurant-earnings-phase3` | PASS — 11/11 |
| `node --test scripts/phase7-order-flow.test.mjs` | PASS — 1/1 |

The six new response-compatibility tests prove: existing `200` behavior; valid SQL `201`; continued rejection of non-SQL `201`; malformed and incomplete `201` bodies; rejection of `199`, `202`, `204`, `400`, and `500`; the real hosted-reader six-call baseline path using injected local providers; and durable failure evidence. No hosted endpoint was contacted.

## Integrity evidence

| Check | Result |
|---|---|
| Parent HEAD | PASS — `47104d426b3eb36486956f1de1db0aa5e6616393` |
| Parent source manifest | PASS — `dbdb7cb8d08c6f0a69397bb7846ade1fad06661950c218c774cf9cb3311d772a`, 1,504 files |
| Restaurant tree | PASS — unchanged `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Accepted artifact manifest | PASS — 74 files, `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` |
| Deterministic archive | PASS — `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Protected `ruip6a_20260924b` | PASS — 35/35, manifest `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44` |
| Protected `ruip6a_20260924c` | PASS — 42/42, manifest `85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538` |
| Aborted run evidence | PASS — three exact preserved hashes recorded in the handoff |
| Four-account credential file | PASS — existing regular mode-`0600` file; Git-ignored; contents not read into reports |

## Proposed direct-child checkpoint contract

A later owner authorization may create one local direct-child commit of `47104d426b3eb36486956f1de1db0aa5e6616393` containing exactly the six files in this review. Before that commit, recompute all six hashes, reconstruct the two executable files from the complete diff, rerun the 47 support and 46 diagnostic tests plus the application regressions, verify all source/artifact/protected evidence, scan for credentials, inspect the staged inventory and full diff, and require both `git diff --check` and `git diff --cached --check` to pass.

The resulting checkpoint and complete source-manifest hashes do not exist yet and must not be invented. A new explicit owner authorization must bind those actual values, proposal `4f07c54d1b6291a3272b242324c3e24eb02b62c84d8cd906b31f1b110fd880d4`, run `ruip6ad_20260925b`, and a current maintenance window. No authority file has been created.

## Remaining limitations

- The correction is qualified with deterministic local HTTP/provider fixtures. A new hosted baseline read is prohibited until a new checkpoint and authorization exist.
- The prior run remains `ABORTED`; its valid SQL values provide diagnostic evidence but do not authorize reuse.
- The four prepared accounts remain unchanged and available, but their next immutable access qualification is a separate future hosted action.
- Alias delivery, device/PWA/push evidence, populated Earnings qualification, cleanup, and overall Phase 6 acceptance remain unresolved.

**LOCAL OPERATOR READINESS: PASS.**
**HOSTED EXECUTION: NOT AUTHORIZED.**
**PHASE 6: BLOCKED.**
