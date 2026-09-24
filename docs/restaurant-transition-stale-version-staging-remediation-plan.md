# Restaurant stale-version Staging remediation and requalification plan

**Status:** Proposed; separate explicit authorization required before any hosted action  
**Prepared:** 2026-09-24  
**Current source baseline:** `c2cf45f924816a46583cbe68004f8668e4bd50f9`  
**Current Phase 6 state:** `BLOCKED`  
**Production authorization:** None

## 1. Authorization boundary

The owner approved the local remediation with this limitation:

> “This approval closes the LOCAL remediation implementation and qualification step only.”

This plan does not authorize its own execution. A later approval of this plan would authorize only the specifically described Staging checkpoint, backup, migration, disposable probes, Restaurant web deployment, alias promotion, affected Phase 6 requalification, rollback when required, and manifest-scoped cleanup.

It would not authorize:

- Development or Production access;
- any migration other than `20260924140000_restaurant_order_conflict_transport.sql`;
- Firebase Functions, notification-worker, RLS, storage, generated-type, financial, or unrelated backend changes;
- `restaurant_earnings_v1` activation;
- source push;
- deployment of any application other than Restaurant web;
- Production domains, deployment, release preparation, or Phase 6 completion approval.

Phase 6 remains blocked throughout this workflow. Successful remediation removes the stale-conflict blocker but does not waive the remaining owner-observed device/push gates or the separately authorized populated Earnings gate.

## 2. Accepted local remediation

The accepted change preserves public HTTP `409` with JSON code `40001` while using PostgREST's non-retryable `PGRST` transport internally.

Pinned accepted artifacts:

| Artifact | SHA-256 |
|---|---|
| Migration | `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641` |
| SQL regression | `e317c1af5821873ee64398f931a3d6a03c3771a1d4e9a0170c1ea63ab73790f3` |
| PostgREST integration test | `29ea190d059253fff9575e6f95ff2ce0a72116c78abcef338ad60fc2c013de57` |
| Accepted remediation report | `0315e18b0ad7c0093510152e81cb2bb35ef0789203e81e67840601fc1ea954dc` |
| Complete implementation diff | `2ee5a103b41f78d15f4f39f8cbe2424b773a2f058f129ef5fd14e9e86db7f6e0` |
| PostgREST 14.5 evidence | `686017a4a5c477146cb64ce33f1717e2b26a726c944a0e2652e4391322ab1510` |

The source files and accepted evidence must match these hashes before the checkpoint is created. Any difference requires a new local review and owner approval.

## 3. Audited local remediation checkpoint

After explicit authorization:

1. Reverify the exact local-approval statement, source hashes above, Phase 5 baseline, and existing Phase 6 rollback/cleanup evidence.
2. Rerun:
   - complete local database reset and migration chain;
   - actual PostgREST 14.5 conflict qualification;
   - focused SQL regression;
   - Phase 5 Restaurant, cancellation, deadline, notification, Earnings, Phase 7 order recovery, UI Phase 1–5, TypeScript, export, database lint, secret scan, and whitespace checks.
3. Confirm zero disposable local rows, zero retrying local PostgREST backends, and disabled Earnings.
4. Stage only:
   - `package.json`;
   - `supabase/migrations/20260924140000_restaurant_order_conflict_transport.sql`;
   - `supabase/tests/restaurant_order_conflict_transport.sql`;
   - `scripts/test-restaurant-order-conflict-transport.mjs`;
   - the accepted investigation, remediation plan, review, implementation diff, PostgREST evidence, and this approved Staging plan.
5. Do not stage the pre-existing uncommitted Phase 6 runner files, secure workspace files, generated export output, credentials, or unrelated changes.
6. Inspect the complete staged inventory and staged diff, including forced ignored evidence files, for secrets, fixtures, Customer data, and scope drift.
7. Create one local checkpoint:

   ```text
   fix: prevent Restaurant stale order conflict retries
   ```

8. Record its exact commit and a sorted SHA-256 source manifest. Do not push.
9. Require that exact commit and manifest hash for every later hosted action.

If the checkpoint cannot be created from exactly the accepted files, stop before hosted access.

## 4. Staging identity and fresh preflight

Generate a new canonical run ID, proposed form `ruip6r_20260924a`, and use it in every confirmation, fixture tag, operation ID namespace, backup, evidence file, deployment record, and cleanup action.

The fail-closed preflight must identify only:

- Supabase Staging: `rlrfvqskzvpysewdxqcr`;
- shared non-production Firebase: `hungrieapp-a2288`;
- Restaurant EAS project: `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`;
- Restaurant Staging alias: `https://hungrie-restaurant--staging.expo.app`.

Before any hosted mutation, capture and validate:

1. exact remediation checkpoint and source-manifest hash;
2. exact migration SHA-256 `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641`;
3. Staging environment and project identity from two independent configuration sources;
4. absence of Development and Production identifiers in the selected commands and runtime configuration;
5. current remote migration history, expected baseline count, and the reviewed migration as the **only** pending migration;
6. current definitions, owners, ACLs, and SHA-256 hashes of both affected RPCs;
7. absence of `private.raise_restaurant_order_conflict_v1(text)` before application;
8. current `restaurant_earnings_v1 = false`;
9. zero residual `ruip6_` or `ruip6r_` resources from earlier runs;
10. non-PII counts of existing Staging Restaurants/accounts potentially using the globally callable RPCs;
11. current Staging alias deployment identity, immutable URL, HTML/content hashes, headers, and ETags as the fresh web rollback target;
12. current Phase 6 records proving the prior alias rollback and manifest cleanup remain intact.

Also capture the hosted REST `Server`/version evidence when exposed. A missing version header does not weaken the functional requirement: the hosted probes must demonstrate prompt non-retrying behavior directly.

Any unexpected remote migration, capability state, source mismatch, stale fixture, ambiguous target, or failed identity check stops the workflow before mutation.

## 5. Restricted backup and independent recovery

Before migration application, create a protected run directory with mode `0700` and files with mode `0600`. Record:

- schema-only backup for `public`, `private`, migration history, grants, and owners;
- exact pre-migration definitions and ACLs of both affected RPCs;
- migration-history rows and digests;
- the current Staging alias rollback deployment;
- a non-PII baseline inventory limited to objects touched by the run;
- the accepted source and migration hashes;
- a manifest containing every backup file's byte size and SHA-256.

Prepare and locally validate an independently executable database recovery command before applying the migration. Recovery must:

1. require the exact Staging project, run ID, source commit, source-manifest hash, migration hash, and action-specific confirmation;
2. verify the installed remediation function hashes before changing anything;
3. transactionally restore the captured pre-migration function definitions, owners, ACLs, and absence of the helper;
4. reconcile migration history explicitly and verify the reviewed migration is no longer reported as applied;
5. confirm the original function hashes and disabled Earnings afterward;
6. write a protected recovery result and never continue automatically to deployment.

The recovery command must not use unrestricted schema restore or delete unrelated data.

## 6. Apply only the reviewed migration

Migration application requires a distinct confirmation such as:

```text
staging:restaurant-conflict-remediation:migrate:<run-id>
```

Immediately before applying:

- repeat project, commit, source-manifest, migration-hash, pending-history, and Earnings-disabled checks;
- verify that no new migration appeared after preflight;
- verify the restricted backup and recovery manifests.

Apply only `20260924140000_restaurant_order_conflict_transport.sql`. A general push command may be used only after proving that this file is the sole pending migration. Do not use `--include-all` to bypass unexpected history.

After application, require:

- exactly one new migration-history row, version `20260924140000`;
- zero other schema changes;
- helper and RPC definition hashes matching the reviewed local definitions;
- unchanged public function signatures, owners, grants, volatility, and `SECURITY DEFINER` properties;
- no residual schema `CREATE` privilege for `hungrie_api_owner`;
- helper inaccessible to `anon`, `authenticated`, and `service_role`;
- Earnings still disabled;
- database lint/advisor checks without a new error.

If application or verification fails, execute database recovery, verify it, preserve evidence, and leave Phase 6 blocked. Do not deploy a web candidate.

## 7. Disposable hosted RPC probes

Create only manifest-recorded, non-PII fixtures tagged with the new run ID. Use two disposable Restaurants, two owners, one manager, one Customer, and the minimum orders required for the probes. Record immutable database IDs, Firebase UIDs, operation IDs, storage paths, timestamps, and digests before use.

Run through the hosted Staging REST endpoint:

1. stale `restaurant_transition_order_v1` returns HTTP 409, JSON code `40001`, unchanged message, and completes below the 12-second application timeout;
2. stale `restaurant_acknowledge_order_seen_v1` returns the same transport contract promptly;
3. stale `restaurant_cancel_order_v2` returns the same transport contract through transition v1;
4. two concurrent valid transitions using one version yield exactly one success and one prompt `409/40001` conflict;
5. authoritative reload returns the winner's monotonic version and state;
6. identical stable-operation replay returns the same result without a second history/audit/notification record;
7. reuse of an operation ID with changed input returns `22023`;
8. a second Restaurant owner and manager cannot read or mutate another tenant's order and receive the accepted denial;
9. ordinary acceptance, valid cancellation, deadline-expiry reconciliation, and supported state transitions still succeed;
10. stale conflicts write no order update, visibility record, history, audit, notification, cancellation message, or completed operation result;
11. caller-bound scope remains authoritative and no browser-supplied Restaurant ID changes it;
12. Earnings remains disabled and no financial snapshot/calculation behavior changes.

Use bounded diagnostic requests. Do not increase the application's timeout or add automatic retries. After each stale/concurrent probe, inspect `pg_stat_activity` and available Staging logs for the exact tagged operation/order identifiers. Require:

- zero matching active retry backend after the response;
- no repeating query executions after client completion;
- no unexplained lock wait;
- no uncaught server error or pool exhaustion.

Run each stale path at least three times with distinct operations and record individual timings. A timeout, wrong response code, lingering backend, duplicate side effect, or tenant breach triggers immediate fixture freeze, database recovery assessment, manifest cleanup, and a blocked result.

## 8. New immutable Restaurant candidate

Only after the database migration and hosted RPC probes pass:

1. export Restaurant web from the exact remediation checkpoint in an isolated checkout;
2. bind only the approved Staging Supabase/Firebase configuration;
3. record the source manifest, route inventory, critical-asset hashes, archive hash, bundle sizes, and configuration scan;
4. require 20 static production routes and no mock/test adapter, fixture, secret, Development, or Production identifiers;
5. deploy immutably without changing the Staging alias;
6. record deployment identity and immutable URL;
7. smoke authentication, public routes, dashboard, order detail, Menu, Reviews, Security, Earnings-disabled presentation, service worker, manifest, JavaScript, CSS, and console behavior;
8. compare exported critical assets with immutable deployment content hashes; treat ETags only as supporting CDN/cache evidence.

Never promote a candidate that fails immutable smoke, route/configuration checks, or artifact parity.

## 9. Controlled alias promotion and affected Phase 6 requalification

Promotion requires a separate action confirmation and revalidation of:

- exact checkpoint, artifact, immutable deployment, Staging project, and current alias rollback target;
- passing hosted RPC probes with zero retry backends;
- disabled Earnings;
- intact backup and cleanup manifests.

After assigning only the Restaurant `staging` alias, prove alias identity and parity through deployment metadata plus HTML, JavaScript, CSS, service worker, and manifest content hashes. Account for CDN age/cache headers and do not rely on ETag equality alone.

Repeat the affected Phase 6 work:

- access states and role-aware navigation;
- complete order lifecycle, stale/concurrent conflict handling, visibility acknowledgement, cancellation reason/message, uncertain-response reconciliation, private Realtime, polling/offline/reconnect recovery, and canonical deep links;
- Menu/settings replay and tenant isolation;
- anonymous Reviews/reporting flows that were not reached in the rejected run;
- Security and push-clean sign-out;
- Chrome, Edge, and Safari responsive/accessibility checks required by the accepted Phase 6 scope;
- reproducible hosted performance measurements for authentication, workspace, order detail, Menu, Reviews, and Earnings-disabled routes;
- required owner-observed macOS/iPhone/iPad/PWA and real push evidence without inventing results.

Windows Edge remains `N/A — explicit owner waiver`; VoiceOver and NVDA remain `N/A — owner decision`. Automated accessibility evidence remains mandatory.

`restaurant_earnings_v1` stays disabled. Populated Earnings qualification remains `BLOCKED` pending its own fresh authorization request and maximum 30-minute activation window.

## 10. Rollback and abort conditions

Abort and do not promote when any of these occurs:

- identity, commit, source, migration, fixture, or artifact mismatch;
- unexpected pending/applied migration;
- migration verification failure;
- stale request timeout, non-409 response, non-`40001` body, repeated backend, or pool pressure;
- authorization or tenant-isolation failure;
- idempotency, version, state-machine, notification, or financial regression;
- immutable deployment smoke/parity failure;
- cleanup manifest drift;
- Earnings unexpectedly enabled.

If failure occurs before alias promotion, keep the alias unchanged, clean only manifest resources, and decide from evidence whether database recovery is required. If failure occurs after promotion:

1. reassign the alias to the freshly captured rollback deployment;
2. poll until deployment metadata and content hashes prove restoration despite CDN caching;
3. execute database recovery when the migration is implicated or the accepted baseline must be restored;
4. verify original function hashes, migration history, alias content, disabled Earnings, and zero run fixtures;
5. preserve all failure and recovery evidence and leave Phase 6 blocked.

Rollback success must be independently verified; issuing a rollback command is insufficient.

## 11. Manifest-scoped cleanup

Before cleanup:

- verify Earnings disabled;
- unregister every disposable push token;
- recover the final protected manifest from database identities and Firebase UIDs;
- compare current resources with the recorded manifest and stop on drift.

Delete only resources explicitly recorded for the new run, in dependency order, using exact immutable IDs, operation IDs, actor IDs, storage paths, Firebase UIDs, timestamps, and digests. Do not use prefix-only or unrestricted deletion as authority. Prefixes may detect anomalies but cannot authorize deletion.

After cleanup, require:

- zero run Restaurants, profiles, orders, reviews, reports, events, deliveries, operations, visibility rows, tokens, media objects, and Firebase identities;
- unrelated concurrent Staging activity unchanged;
- reviewed migration state matching the final accepted disposition;
- no unexpected pending migrations;
- `restaurant_earnings_v1 = false`;
- Staging alias on the accepted candidate when qualification passes, or verified rollback target when it fails.

If cleanup or recovery fails, preserve the backup/recovery manifest, enumerate every residual resource, keep Earnings disabled, and mark the workflow and Phase 6 `BLOCKED`.

## 12. Evidence and exit

Produce an uncommitted remediation/Staging report containing:

- authorization text and boundaries;
- remediation checkpoint and source-manifest hashes;
- exact migration and function-definition hashes;
- preflight identities, tenant counts, backup/recovery manifests, and rollback target;
- migration command, history before/after, and post-application privileges;
- every hosted probe request class, response status/code, timing, side-effect count, and backend-activity check;
- immutable export/deployment/asset hashes and alias-parity evidence;
- affected Phase 6 functional, browser/device, accessibility, performance, push/PWA, and Earnings-disabled results;
- manifest-scoped cleanup and final-state proof;
- every requirement marked `PASS`, `N/A`, `BLOCKED`, or `INCOMPLETE`.

Passing this plan would not by itself complete Phase 6. The populated Earnings gate and any remaining owner-observed evidence retain their existing authorization and completion requirements. Production remains entirely out of scope.

## Requested authorization

Approval of this plan would authorize the audited local remediation checkpoint and the explicitly described Staging-only remediation, Restaurant web deployment, affected non-financial Phase 6 requalification, rollback when required, and manifest-scoped cleanup. It would not authorize Earnings activation, source push, Development/Production access, Phase 6 completion, or Production deployment.
