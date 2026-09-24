# Restaurant order stale-version remediation review

**Status:** Local implementation and qualification complete; owner review required  
**Date:** 2026-09-24  
**Baseline:** `c2cf45f924816a46583cbe68004f8668e4bd50f9`  
**Phase 6:** `BLOCKED`  
**Hosted access or mutation:** None  
**Commit status:** Uncommitted

## Implemented scope

The implementation contains four reviewable changes:

1. [Additive migration](../supabase/migrations/20260924140000_restaurant_order_conflict_transport.sql) adds a private conflict helper and recreates only `restaurant_acknowledge_order_seen_v1` and `restaurant_transition_order_v1`.
2. [Database regression](../supabase/tests/restaurant_order_conflict_transport.sql) verifies the deliberate internal `PGRST` transport, private-helper boundary, and absence of stale-conflict writes.
3. [PostgREST integration qualification](../scripts/test-restaurant-order-conflict-transport.mjs) exercises the public RPC contract through the actual local PostgREST 14.5 container.
4. `package.json` exposes the integration qualification as `npm run test:restaurant-order-conflict-transport`.

The complete generated implementation patch is available as [restaurant-transition-stale-version-remediation-implementation.diff](./restaurant-transition-stale-version-remediation-implementation.diff).

No existing migration was edited. No client, timeout, retry, generated database type, notification worker, authorization rule, RLS policy, storage policy, state-machine edge, financial calculation, or Phase 6 deployment file was changed.

## Direct SQL consumer audit

The preimplementation audit searched application, package, script, migration, and test sources for `40001`, `serialization_failure`, exception handlers, and both RPC names.

Confirmed consumers:

- The accepted migration contains the two superseded custom `40001` raises.
- The production Restaurant client classifies the PostgREST JSON response `code === "40001"` as a conflict.
- Cancellation v2 calls transition v1 and does not catch or inspect a raw PostgreSQL SQLSTATE.
- Existing database tests call the RPCs for success and other validation errors but do not assert raw SQLSTATE `40001`.
- The Phase 7 flow and Phase 6 qualification scripts consume RPC responses rather than direct database exception metadata.

No accepted direct-SQL consumer requires raw SQLSTATE `40001`. The final audit command returned only the two historical raises and the client-visible response-code classifier:

```text
rg -n "serialization_failure|SQLSTATE...40001|errcode...40001|throws_ok...40001|code...40001" apps packages scripts supabase ...
```

## Contract behavior

The private helper raises SQLSTATE `PGRST` with:

- HTTP status: `409 Conflict`
- JSON response code: `40001`
- Existing messages unchanged
- `details` and `hint`: `null`

PostgREST therefore returns the accepted public conflict contract without treating the application conflict as a retryable serialization failure. The existing client classifier and 12-second timeout are unchanged.

The helper is owned by `hungrie_api_owner`, has an empty `search_path`, and is not executable by `authenticated`. The two public RPCs retain their signatures, owner, volatility, `SECURITY DEFINER`, caller-bound Restaurant lookup, lock order, operation digest/replay sequence, state graph, history/audit behavior, and result structure. Temporary schema `CREATE` privileges needed during ownership transfer are revoked in the same migration transaction.

## Actual PostgREST 14.5 evidence

The final run followed a successful complete local database reset and used container image `public.ecr.aws/supabase/postgrest:v14.5`. Its complete machine-readable output is [restaurant-transition-stale-version-postgrest-evidence.json](./restaurant-transition-stale-version-postgrest-evidence.json).

| Probe | HTTP/result | Elapsed | Result |
|---|---:|---:|---|
| Stale transition | 409, code `40001` | 37.802 ms | PASS |
| Stale acknowledgement | 409, code `40001` | 13.448 ms | PASS |
| Stale cancellation v2 | 409, code `40001` | 5.396 ms | PASS |
| Cross-tenant transition | 403, code `42501` | 6.639 ms | PASS |
| Current pending-to-preparing transition | 200 | 10.184 ms | PASS |
| Stable operation replay | Same 200 body | 3.597 ms | PASS |
| Changed request with reused operation ID | 400, code `22023` | 4.860 ms | PASS |
| Concurrent transition loser | 409, code `40001` | 7.934 ms | PASS |
| Concurrent transition winner | 200 | 7.909 ms | PASS |
| Authoritative order recovery | 200, winning status/version | 7.228 ms | PASS |
| Current cancellation v2 | 200 | 5.175 ms | PASS |

After all stale probes:

- audit rows added: `0`
- status-history rows added: `0`
- visibility rows added: `0`
- notification events added: `0`
- cancellation messages added: `0`
- completed operation-ledger rows added: `0`
- active PostgREST retry backends: `0`
- residual disposable profiles/orders: `0`
- `restaurant_earnings_v1`: disabled

The concurrent test issues two valid mutations with the same version. Exactly one commits, the loser receives a prompt conflict, and an authoritative reload returns the committed status and newer version.

## Database state and privilege verification

Migration `20260924140000` is present after the clean reset.

| Function | Owner | `authenticated` execute | Definition SHA-256 |
|---|---|---:|---|
| `private.raise_restaurant_order_conflict_v1(text)` | `hungrie_api_owner` | false | `7f381cd2857ebeb5bd24cb6f55edcc897eeb7d73d45a12d790c24f70656c0c9c` |
| `restaurant_acknowledge_order_seen_v1(text,timestamptz,uuid)` | `hungrie_api_owner` | true | `5229df80acf9bd1546c5c13bfbd62874426c0953e8126f8345dacb4fcf69e843` |
| `restaurant_transition_order_v1(text,timestamptz,text,text,text,uuid)` | `hungrie_api_owner` | true | `a5cd9f921b678df1092c0d26b2e1350e02fec1a80cb726792e7d9c46a23d2797` |

`hungrie_api_owner` has no residual `CREATE` privilege on either `private` or `public`.

## Qualification results

| Command | Result |
|---|---|
| `npx supabase db reset --local` | PASS — complete migration history and seed, including the new migration |
| `npm run test:restaurant-order-conflict-transport` | PASS — actual PostgREST 14.5 contract, concurrency, replay, authorization, recovery, cleanup |
| `npx supabase test db supabase/tests/restaurant_order_conflict_transport.sql` | PASS — 9 tests |
| Phase 5 Restaurant, cancellation, deadline/notification, and Earnings database suites | PASS — 176 tests |
| `npm --prefix functions run test:phase5-restaurant` | PASS — 2 tests |
| `npm run notification-worker:test` | PASS — 11 tests |
| `npm run test:restaurant-responsive-ui-phase2` | PASS — 13 tests |
| `node --test scripts/phase7-order-flow.test.mjs` | PASS — 1 test |
| Responsive UI Phase 1, 3, 4, and 5 suites | PASS — 38 tests |
| Restaurant Earnings Phase 4 contract/check | PASS — 6 tests plus safeguard check |
| `npm run typecheck --workspace @hungrie/restaurant` | PASS |
| `npm run export:web --workspace @hungrie/restaurant` | PASS — 20 static routes |
| `npx supabase db lint --local --schema public,private,migration --level error --fail-on error` | PASS — zero findings |
| New-file secret scan | PASS — no credential material detected |
| `git diff --check` | PASS |

The first incremental migration attempt rolled back because the new helper's ownership transfer required temporary `CREATE` permission on `private`. The final migration uses the repository's established grant/transfer/revoke pattern. Incremental application then passed, and the later full reset independently proved the complete final migration.

## Protected-file verification

The following accepted files remain unchanged:

- `apps/restaurant/src/orders/orderRepository.ts`: `7e690e35c62abe69b763fef733c872e68e15a231ee12d624f71cb4fb3b89859c`
- `apps/restaurant/src/orders/orderModel.ts`: `b73cf5e7071c6581714a0b5ea11ddaf33fa234244bb464a63df7ab0db4364c42`
- `packages/database-types/src/database.generated.ts`: `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37`
- `package-lock.json`: `20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33`
- Phase 6 rollback: `8412118b0a3330190f8108ed74e3c647d2ecfbad7f56bc5b5d8f24fd2b380ab6`
- Phase 6 cleanup verification: `859a909ff2cdec378c5dcf8574ffa8f2cd2b102764b4c1d78379d168af34609d`
- Phase 6 Earnings-disabled evidence: `c83313d1343892ab39154bb3a9dcbff55f90377feb9ecae4ddc9073a76c511c8`
- Phase 6 review: `5a29a90aa0698a90ca5d989ee332190314675316a548cd1ed0511ba6fba248d4`

## Source hashes

- migration: `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641`
- SQL regression: `e317c1af5821873ee64398f931a3d6a03c3771a1d4e9a0170c1ea63ab73790f3`
- PostgREST integration test: `29ea190d059253fff9575e6f95ff2ce0a72116c78abcef338ad60fc2c013de57`
- `package.json`: `0775bdbdb79ad2c348e95582c843113b00beae638b6e36458999229cfafe40ff`
- implementation diff: `2ee5a103b41f78d15f4f39f8cbe2424b773a2f058f129ef5fd14e9e86db7f6e0`
- PostgREST evidence: `686017a4a5c477146cb64ce33f1717e2b26a726c944a0e2652e4391322ab1510`

## Boundaries and disposition

- No hosted environment was accessed or mutated.
- No Staging migration, deployment, alias change, or qualification was performed.
- Nothing was pushed or committed.
- Earnings remained disabled.
- Phase 6 remains `BLOCKED`.
- Hosted remediation and affected Staging requalification require separate explicit authorization after this local change is approved.
