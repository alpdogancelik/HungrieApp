# Restaurant order stale-version timeout investigation

**Status:** Complete repository-read-only investigation with disposable local database reproduction; remediation not implemented  
**Date:** 2026-09-24  
**Source baseline:** `c2cf45f924816a46583cbe68004f8668e4bd50f9`  
**Phase 6:** `BLOCKED`  
**Hosted access or mutation:** None

## Finding

The failure mechanism is confirmed locally: an application conflict is raised with PostgreSQL SQLSTATE `40001` through PostgREST 14.5, which automatically retries transactions that end with `40001`. The stale-version branch deterministically raises the same error on every retry, so the REST request does not return the conflict and can continue after the browser's 12-second abort.

This is confirmed locally. It is not a row-lock wait, trigger delay, notification delay, or idempotency-ledger deadlock in the reproduced case.

Applying this cause to the previously observed 65-second Staging timeout is a high-confidence inference, not a new hosted observation: the same accepted RPC branch and symptom reproduced locally, and the documented PostgREST defect exactly matches the activity pattern. This investigation did not access Staging or independently query its PostgREST build. The later authorized Staging requalification must confirm that the remediation eliminates the hosted timeout.

## Accepted execution path

1. `restaurant_transition_order_v1` validates the target and cancellation inputs.
2. `private.phase5_operation` checks for a completed operation replay and locks an existing ledger row only if one exists ([migration](../supabase/migrations/20260913140000_phase5_restaurant_desktop.sql#L119)).
3. The RPC locks the caller-bound Restaurant order with `SELECT ... FOR UPDATE` ([migration](../supabase/migrations/20260913140000_phase5_restaurant_desktop.sql#L219)).
4. It compares `orders.updated_at` with `p_expected_version` and raises custom SQLSTATE `40001` on mismatch ([migration](../supabase/migrations/20260913140000_phase5_restaurant_desktop.sql#L221)).
5. Only a current-version request reaches the state-machine validation, order update, status history, audit, notification/realtime triggers, and completed operation-ledger write.

`restaurant_cancel_order_v2` delegates its lock, replay, version check, and transition to this RPC ([cancellation migration](../supabase/migrations/20260920170000_restaurant_customer_cancellation_message.sql#L37)). `restaurant_acknowledge_order_seen_v1` independently raises custom `40001` for an unavailable version ([desktop migration](../supabase/migrations/20260913140000_phase5_restaurant_desktop.sql#L185)). These are the only two custom `40001` raises found in the repository.

The browser repository aborts after 12 seconds ([orderRepository.ts](../apps/restaurant/src/orders/orderRepository.ts#L4)), and the UI recognizes response code `40001` as a conflict ([orderModel.ts](../apps/restaurant/src/orders/orderModel.ts#L34)). The retry loop prevents that response from reaching the UI.

## Local reproduction evidence

The reproduction used only the local Supabase stack, PostgreSQL 17.6, transaction isolation `read committed`, and `public.ecr.aws/supabase/postgrest:v14.5`. Disposable IDs used the `ruip6_local_` prefix.

| Probe | Result | Interpretation |
|---|---:|---|
| Direct SQL stale `restaurant_transition_order_v1` | SQLSTATE `40001` in 1.546 ms | The function's stale branch itself terminates promptly. |
| Local REST stale `restaurant_transition_order_v1` | No response at 20.006 s | PostgREST did not return the database error. |
| Local REST stale `restaurant_acknowledge_order_seen_v1` | No response at 2.005 s | The second custom `40001` path has the same behavior. |
| `pg_stat_activity` during stale REST request | Active RPC query repeatedly restarted; no `wait_event`, no row-lock wait, no backend transaction ID held across samples | The reproduced delay is transaction retry, not lock contention. |
| Client abort | Database execution remained active until local PostgREST restart | The 12-second application timeout does not terminate the server-side retry loop reliably. |
| Current-version `preparing` to `ready` over REST | HTTP 200 in 25.601 ms | Ordinary transition path is healthy in the same stack. |
| Current-version cancellation v2 over REST | HTTP 200 in 8.039 ms | Ordinary cancellation path is healthy in the same stack. |
| PostgREST custom-error probe | HTTP 409 in 14.474 ms; body code `40001` | A non-retryable transport can preserve the current API conflict code. |

The activity sample for the acknowledgement reproduction contained an active PostgREST RPC backend with no wait event. Restarting the **local-only** PostgREST container cleared it; the final active matching backend count was zero.

The custom-error probe raised SQLSTATE `PGRST` with a JSON error envelope containing code `40001` and HTTP status 409. PostgREST 14.5 returned:

```json
{"code":"40001","details":null,"hint":null,"message":"Order changed; refresh and retry"}
```

The probe function was dropped after the test.

## Transaction, trigger, and idempotency assessment

- **Lock contention — ruled out for the reproduced timeout.** The direct function completed immediately, and the REST backend was active without a lock wait. A real competing `FOR UPDATE` holder could delay a transition, but it does not explain the observed continuous re-execution.
- **Transaction ordering — contributory only through PostgREST retry policy.** The version check correctly follows the order lock, so concurrent writers serialize and the loser observes the newer version. The defect occurs when that expected loser response is encoded as retryable `40001`.
- **Idempotency replay — not the cause.** A completed stable operation ID returns its stored result before the order lock. For a new stale request, no ledger result is written because the exception rolls back the request. Every automatic retry therefore reaches the same stale check.
- **Triggers — not the cause.** The stale branch raises before any order update. It cannot invoke `orders_set_updated_at`, financial immutability/snapshot triggers, status notification generation, or `orders_private_realtime`.
- **Blocking queries — ruled out in the reproduction.** There was no `pg_stat_activity.wait_event`; query age repeatedly reset while the same RPC was re-executed.

The behavior matches the documented PostgREST defect: [PostgREST issue #3673](https://github.com/PostgREST/postgrest/issues/3673) identifies automatic retry of `40001`, and the [PostgREST changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) records the fix in a later release. Supabase's [SQLSTATE 40001 troubleshooting note](https://github.com/orgs/supabase/discussions/50151) describes the same failure mode for custom RPC errors.

## Blast radius

| Flow | Assessment | Evidence |
|---|---|---|
| Stale status transition | **Confirmed affected** | Direct SQL is immediate; REST loops on the custom `40001`. |
| Concurrent transitions | **Confirmed affected for the loser** | The order row lock serializes writers; the second request then reaches the stale comparison and the affected error path. |
| Stale cancellation v2 | **Confirmed by execution path** | Cancellation v2 calls the affected transition RPC with the supplied expected version. |
| Stale visibility acknowledgement | **Confirmed affected** | Independent local REST reproduction timed out on its custom `40001`. |
| Current-version acceptance/status advance | **Not affected in local reproduction** | REST current-version transition returned 200 in 25.601 ms. |
| Current-version cancellation | **Not affected in local reproduction** | REST cancellation v2 returned 200 in 8.039 ms. |
| Deadline handled inside a Restaurant transition | **Conditionally affected** | A stale version fails before the deadline branch. A current version reaches the deadline branch normally. |
| Scheduled deadline expiry | **Not directly affected** | `private.expire_pending_orders` uses `FOR UPDATE SKIP LOCKED` and does not raise custom `40001` ([runtime migration](../supabase/migrations/20260906120000_milestone_11_runtime_safety.sql#L102)). |
| Completed stable-operation replay | **Not affected by this defect** | The stored result is returned before the order lock/version check. |
| Genuine database serialization failure elsewhere | **Potential platform-wide operational risk** | PostgREST 14.5 can retry genuine `40001` failures too; no additional application-raised instances were found. |

## Existing test gap and verification

The database test covers a successful current-version transition and notification materialization, but no stale version ([phase_5_restaurant_desktop.sql](../supabase/tests/phase_5_restaurant_desktop.sql#L36)). The Phase 2 UI test verifies only the client-side `40001` classification. The Phase 7 order-flow test mocks successful RPCs and cannot reveal PostgREST transaction retries.

Commands rerun after investigation:

```text
npx supabase test db supabase/tests/phase_5_restaurant_desktop.sql
  PASS — 34 tests
node --test scripts/phase7-order-flow.test.mjs
  PASS — 1 test
node scripts/test-restaurant-responsive-ui-phase2.mjs
  PASS — 13 tests
npx supabase test db supabase/tests/milestone_10_notifications_jobs.sql
  PASS — 38 tests, including scheduled deadline expiry
npx supabase test db supabase/tests/phase_7_customer_cancellation_message.sql
  PASS — 13 tests
git diff --check
  PASS
```

The cancellation test's first concurrent invocation collided with the deadline suite while both tried to enable pgTAP and failed on `pg_extension_name_index`. Running it alone immediately passed all 13 tests; no application assertion failed.

These existing suites pass but do not cover the demonstrated transport behavior.

## Cleanup and preservation

- Removed all disposable local rows containing `ruip6_local_`: final count `0`.
- Removed the temporary `ruip6_local_pgrst_conflict_probe()` function.
- Verified matching active retry backends: `0`.
- Did not change migrations, RPCs, triggers, authorization, RLS, generated types, client behavior, or hosted state.
- Did not access Development, Staging, or Production.
- Did not push, deploy, change the Staging alias, or activate Earnings.
- Preserved Phase 6 rollback, cleanup, Earnings-disabled, fixture-manifest, and review artifacts. Their recorded SHA-256 values are unchanged:
  - rollback: `8412118b0a3330190f8108ed74e3c647d2ecfbad7f56bc5b5d8f24fd2b380ab6`
  - cleanup verification: `859a909ff2cdec378c5dcf8574ffa8f2cd2b102764b4c1d78379d168af34609d`
  - Earnings disabled: `c83313d1343892ab39154bb3a9dcbff55f90377feb9ecae4ddc9073a76c511c8`
  - fixture manifest: `b5926cde4636c53a51a8612e6aeeb85e42a250dc68c7b2bea6675ecab9cb10ee`
  - Phase 6 review: `5a29a90aa0698a90ca5d989ee332190314675316a548cd1ed0511ba6fba248d4`

## Conclusion

The local root cause is confirmed: an application-level optimistic-concurrency conflict uses a database serialization SQLSTATE that PostgREST 14.5 treats as automatically retryable. It is the demonstrated explanation for the matching Staging symptom, subject to confirmation in the later authorized Staging rerun. The application timeout exposes the symptom but does not cause it. Increasing that timeout or adding client retries would leave the server-side loop intact and is rejected.
