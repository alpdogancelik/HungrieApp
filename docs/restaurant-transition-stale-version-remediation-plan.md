# Restaurant order stale-version remediation execution plan

**Status:** Proposed; explicit owner authorization required before implementation  
**Based on:** [stale-version timeout investigation](./restaurant-transition-stale-version-timeout-investigation.md)  
**Phase 6:** Remains `BLOCKED`

## Decision

Add a narrowly scoped database migration that changes how the two application-defined order-version conflicts are transported through PostgREST 14.5. Preserve the public response code `40001`, HTTP conflict semantics, messages, caller-bound authorization, tenant isolation, operation-ID behavior, monotonic versions, and the canonical state machine.

The proposed error is:

```sql
raise sqlstate 'PGRST' using
  message = jsonb_build_object(
    'code', '40001',
    'message', p_message,
    'details', null,
    'hint', null
  )::text,
  detail = '{"status":409,"headers":{}}';
```

This uses PostgREST's documented custom-error envelope. The browser still receives `code: "40001"`, which preserves the accepted application contract and existing `mutationFailureKind` behavior. The internal transport SQLSTATE becomes `PGRST`, so PostgREST 14.5 does not retry it as a database serialization failure.

If preserving raw database SQLSTATE `40001` for direct SQL callers is also required, this migration must not proceed. The alternative is a separately reviewed platform upgrade to a PostgREST release containing the `40001` retry fix. Managed Staging runtime availability must be established before choosing that route.

## Proposed implementation

1. Create one new migration; do not edit accepted migrations.
2. Add a private helper such as `private.raise_restaurant_order_conflict_v1(p_message text)` that emits HTTP 409 and JSON code `40001` through SQLSTATE `PGRST`.
3. Replace only these two raises in recreated function definitions:
   - stale/unavailable version in `restaurant_acknowledge_order_seen_v1`
   - stale expected version in `restaurant_transition_order_v1`
4. Keep function signatures, volatility, `SECURITY DEFINER`, empty `search_path`, owners, grants, validation order, lock order, authorization calls, state graph, history/audit writes, realtime behavior, and idempotency ledger unchanged.
5. Do not change `restaurant_cancel_order_v2`; it receives the corrected behavior through its existing call to transition v1.
6. Do not change the 12-second client timeout and do not add automatic retries.

## Required regression tests

Add database and local PostgREST integration coverage that proves:

- stale transition returns HTTP 409 with JSON `code: "40001"` promptly;
- stale acknowledgement returns the same contract promptly;
- stale cancellation v2 returns the same contract through the delegated transition;
- a current transition and current cancellation still succeed;
- two concurrent transitions yield one valid state change and one prompt conflict;
- no retrying PostgREST backend remains after the conflict response;
- a completed stable operation ID replays its original result;
- reuse of an operation ID with a different digest still fails with `22023`;
- caller-bound Restaurant authorization and cross-tenant denial remain `42501`;
- a conflict writes no order update, visibility row, status history, audit record, notification, customer cancellation message, or completed ledger result;
- deadline expiry still works both through the transition path and `private.expire_pending_orders`;
- financial immutability and delivered-snapshot safeguards remain unchanged;
- client-side conflict classification still recognizes the returned `40001` body code;
- abort/uncertain-response reconciliation remains explicit and gains no automatic mutation retry.

The transport tests must run through local PostgREST 14.5, not only direct `psql`, because direct function tests cannot reproduce the middleware retry defect. Add an elapsed-time ceiling appropriate for local CI and inspect `pg_stat_activity` after each stale probe.

## Qualification sequence

1. Reconfirm the accepted source baseline and protected Phase 6 evidence hashes.
2. Implement the migration and tests locally only.
3. Reset a disposable local database and run the complete migration history.
4. Run the new direct SQL and REST conflict tests, concurrency test, Phase 5 Restaurant database suite, Phase 7 order-flow suite, notification tests, Earnings safeguards, TypeScript checks, export checks, secret scans, and `git diff --check`.
5. Produce a remediation review with the full diff, function definitions, timing evidence, response bodies, backend activity samples, and cleanup proof.
6. Present that local result for approval. Do not access a hosted environment during this step.
7. Only under later explicit authorization, apply the reviewed migration to Staging and repeat the affected Phase 6 order qualification against a new immutable candidate.

## Rollback

Prepare a separate rollback migration that restores the two accepted function definitions and their original grants/ownership. Because restoring custom SQLSTATE `40001` also restores the timeout defect on PostgREST 14.5, rollback is an emergency contract restoration, not an acceptable final state. A failed Staging qualification must leave Phase 6 blocked and the Staging web alias at its accepted rollback target.

## Boundaries

- No authorization, tenant, RLS, storage, notification-worker, financial, or order-state contract changes.
- No client timeout increase.
- No automatic retry for uncertain mutations.
- No mutation of Development, Staging, or Production without later explicit authorization.
- No push, deployment, alias change, Earnings activation, or Production work.
- Phase 6 remains blocked until the remediation is separately approved, implemented, qualified, deployed to Staging under authorization, and the affected Staging qualification is repeated.

## Approval requested

Approval of this plan would authorize only the local implementation and local qualification described above. It would not authorize hosted migration, Staging deployment, Phase 6 resumption, push, Earnings activation, or Production work.
