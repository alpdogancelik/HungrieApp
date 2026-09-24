# Restaurant Alias Diagnostic Execution Support — Local Implementation Review

Status: PASS — local implementation and deterministic qualification only
Hosted execution authority: NOT GRANTED
Phase 6: BLOCKED
Base diagnostic checkpoint: 267b9bc5bbe888431d864963890f73c7092ededc
Accepted proposal SHA-256: 90ebc57b3b07dc0f0a87e252d026b1f62bda6bacbd4edce439d8a0f543fe803b
Run ID reserved by the reviewed proposal: ruip6ad_20260925a
Hosted reads or mutations: None
Commit or push: None

## Outcome

The three documented execution blockers and the subsequent hosted-read/final-alias review findings are closed locally with a separate support module and deterministic tests. The accepted alias verifier, diagnostic timing policy, diagnostic deployment operator, immutable access qualifier, Restaurant application, backend, migrations, and deployment configuration remain unchanged.

The support module:

- deterministically reproduces a future audited support checkpoint source manifest;
- requires a concrete owner authorization bound to the future support checkpoint, its direct parent, manifest, application tree, run, proposal, complete action set, text digest, and explicit Staging/rollback/Earnings-disabled boundaries;
- writes authority and manifest artifacts with mode 0600 under a mode-0700 directory and prohibits overwrite;
- performs separate baseline and final read-only Staging preflight collection;
- binds every persisted hosted observation to the run, stage, source, unique request ID, timestamps, status, and canonical payload digest;
- rereads the persisted six-observation snapshot and rejects missing, stale, duplicate, tampered, unsuccessful, or differently bound evidence before producing a preflight result;
- records each successful, unsuccessful, or incomplete hosted observation before aggregate validation, with sanitized errors;
- validates exact Supabase, Firebase, EAS/alias, migration, function/ACL, pending-migration, and Earnings-disabled state;
- binds final promotion preflight to the exact artifact, candidate, immutable evidence, access evidence, and fresh rollback reference;
- returns ROLLBACK_RECAPTURE_REQUIRED when the rollback reference exceeds five minutes and refuses live rollback drift;
- records FAIL, INCONCLUSIVE, and ABORTED outcomes without claiming restoration;
- writes a promotion-block marker when abort occurs before provider invocation, preserving the accepted operator’s exclusive marker boundary;
- identifies confirmed, uncertain, and not-attempted alias assignment states;
- requires independent rollback verification before recording restoration as verified;
- independently verifies final alias parity and live environment state through the accepted verifier persistence callback, six HTML routes, five critical assets, and two stable complete observations;
- independently verifies the exact 35-file and 42-file protected evidence manifests and makes any missing, incomplete, failed, or mismatched result a persisted final failure;
- loads the run-bound created-resources inventory and requires an exact, duplicate-free cleanup disposition for every recorded resource;
- requires the immutable provider deployment to remain explicitly retained and requires deletion or unregistration claims to cite matching in-run SHA-256 evidence;
- records created, unexpected, and incomplete resources without automatic deletion;
- verifies all 77 protected prior-run files;
- scans persistent evidence for credential-shaped values;
- creates and verifies a sorted SHA-256/byte-length/path evidence manifest;
- returns PASS, FAIL, or BLOCKED without filling missing observations.

## Exact file scope

| Status | Path |
|---|---|
| Added, executable | scripts/restaurant-alias-diagnostic-execution-support.mjs |
| Added | scripts/test-restaurant-alias-diagnostic-execution-support.mjs |
| Added review artifact | docs/restaurant-alias-diagnostic-execution-support-implementation-review.md |
| Added complete source diff | docs/restaurant-alias-diagnostic-execution-support-implementation.diff |

No accepted diagnostic source changed. No application, backend, migration, generated type, package, lockfile, environment, or protected evidence file changed.

## SHA-256 values

| File | SHA-256 |
|---|---|
| scripts/restaurant-alias-diagnostic-execution-support.mjs | b8e0671db93c4d8b1adc2a58844d495cb0b42c46931372f84b859017b6682bb4 |
| scripts/test-restaurant-alias-diagnostic-execution-support.mjs | 11e8eb1c41b808004fb0aa7541bfc18b4e029604231feb8c5c7628e7d94c38ad |
| Complete two-file implementation diff | b1c271d712a5ae58e7b889dc6349e31787fe4cfd531d54272c1ef541665c48e6 |

Accepted executable hashes remain:

| File | SHA-256 |
|---|---|
| scripts/restaurant-alias-parity-verifier.mjs | e563d7a5203aaf6ea0e04687063d63027568fd2906accec43c26daaeea4ca1d8 |
| scripts/test-restaurant-alias-parity-verifier.mjs | 6fa1ce21c047f93678be3c45fb71cd1f0e8167ed142fc259e55efddea1030afb |
| scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs | a3fe6fb596a6e6aefd17e576beaa2c35a06a19e620e7ab807fbe5a7dc6792ed6 |
| scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs | d09e43ab5a13a6357da994840f6bdd22730a5118f244f82979468b0f0243b288 |
| scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs | 9500103b1c54a6c97b1fb126ac0973bb881095d4f81e0e30dc941e7090293c35 |

## Authority preparation behavior

Authority preparation is deliberately unusable with the parent diagnostic checkpoint. A future local support checkpoint must:

1. be a direct child of 267b9bc5bbe888431d864963890f73c7092ededc;
2. contain exactly the two support files and these two review artifacts;
3. retain Restaurant tree ae03238ac8c34f4ef11365b5a5c51dee81187812;
4. have its complete sorted source-manifest SHA-256 explicitly supplied by the owner’s future authorization.

The owner-authorization input must have an exact schema, decision APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC, approvedForHostedExecution true, environment staging, run ruip6ad_20260925a, proposal hash, checkpoint parent, future checkpoint and manifest identities, Restaurant tree, the complete ordered action set, authorization text, its matching SHA-256, and a valid timestamp. Missing, placeholder, contradictory, incomplete, or weakly worded records fail closed.

No authority file was created during this local task.

## Preflight behavior

### Baseline

The baseline collector performs independent reads for:

- Supabase project identity and healthy state;
- Firebase project identity through an authenticated project read;
- EAS project plus alias ID/name/URL/current deployment metadata;
- applied migrations and locally derived pending migrations;
- the three accepted function definitions and full owner/security-definer/volatility/search-path/ACL state;
- restaurant_earnings_v1 capability state.

Every assertion has an exact run, stage, source, unique request ID, timestamps, status, canonical payload hash, and payload. Each successful, failed, or incomplete observation is written to a stage-specific progress file before aggregate validation. The hosted path then rereads that file, verifies its read-set digest and exact six-read schema, and uses those persisted observations as the only input to preflight construction.

### Final promotion preflight

The final collector repeats every live read and binds the exact:

- run artifact manifest/archive;
- immutable deployment ID/URL;
- immutable parity evidence SHA-256;
- four-account access evidence SHA-256;
- rollback deployment 6jki82fy0u and rollback-reference SHA-256;
- all 35/35 and 42/42 protected evidence results.

It writes the exact promotion-preflight.json fields consumed by the accepted operator, plus a safe observation-evidence index. A rollback reference older than five minutes produces ROLLBACK_RECAPTURE_REQUIRED. After recapture, final preflight must be rerun; historical evidence is not overwritten or reinterpreted.

## Abort and recovery behavior

record-abort accepts only FAIL, INCONCLUSIVE, or ABORTED. It determines:

- not-attempted: no provider promotion result exists;
- uncertain: the exclusive promotion marker exists without a result;
- confirmed: a promotion result exists.

It preserves the existing inventory, prohibits promotion retry, supplies the separately confirmed rollback command when rollback is required, and never treats rollback-result.json as proof of restoration. Only a passing rollback-verification-result.json can set restorationVerified true.

When abort occurs before promotion, the support tool atomically creates a providerCommandInvoked false promotion marker. The accepted operator’s exclusive marker prevents later promotion in the same run.

## Final reconciliation behavior

Finalization requires a complete expected alias reference with six routes and all five critical assets. It independently reads the Staging identities, migration/function/ACL state, zero pending migrations, Earnings disabled, and final alias metadata/content. Exact final alias restoration requires two complete observations at least 30 seconds apart through the accepted rollback parity verifier.

The required evidence set changes based on whether promotion was attempted. Missing evidence returns BLOCKED. Alias mismatch, protected-evidence mismatch, terminal non-PASS state, or credential-shaped persistent evidence returns FAIL. Cleanup returns BLOCKED unless the persisted run-bound inventory and cleanup declaration contain the exact same unique type/ID set, every disposition is supported and complete, all verified deletion claims cite matching in-run evidence, the immutable deployment is retained explicitly, and persisted unexpected resources are reconciled. No unexpected resource is deleted.

## Deterministic local tests

Final support suite: PASS — 30/30, zero failed, skipped, cancelled, or todo. All previously accepted 28 execution-support cases remain present and passing, with two final-reconciliation regression cases added.

Coverage includes:

- exact accepted parent source-manifest reproduction;
- deterministic future authority/manifest preparation and file permissions;
- placeholder, missing, contradictory, wrong-environment, wrong-action, and digest rejection;
- baseline/final preflight separation;
- independent read IDs plus exact run/stage/source bindings, payload digests, freshness, and persisted read-set integrity;
- rejection of missing, stale, duplicate, tampered, unsuccessful, and differently bound hosted observations;
- real createHostedReaders final-alias verification with injected local metadata and HTTP fixtures;
- six-route/five-asset stable success, metadata transport failure, HTTP 503/404, missing asset references, and exact hash mismatch;
- persistence of metadata and request observations before parity comparison;
- wrong Supabase/Firebase/EAS identity;
- migration missing/pending/checksum drift;
- function and ACL drift;
- Earnings enabled;
- candidate/access/rollback mismatch;
- rollback staleness, required recapture, and successful fresh replacement;
- live alias drift;
- not-attempted, uncertain, and confirmed promotion;
- permanent promotion blocking after abort;
- rollback-response insufficiency;
- final alias mismatch;
- protected evidence missing, incomplete, failed, or hash-mismatched;
- exact cleanup reconciliation for omissions, additions, duplicate identities, type/ID mismatch, incomplete or unsupported dispositions, unverified deletion claims, persisted unexpected resources, and immutable deployment accounting;
- incomplete cleanup and missing mandatory evidence;
- manifest sorting and mutation detection;
- credential evidence detection and error sanitization;
- absence of provider deploy/promotion/rollback commands in support tooling.

Intermediate development runs exposed the previously reported sanitizer import issue and two local-fixture callback assumptions. Each was corrected before final qualification. The final support suite passed 30/30 with no failed or skipped test.

Accepted diagnostic suite: PASS — 46/46, including all original legacy verifier tests.

Application regressions:

| Check | Result |
|---|---|
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1 | PASS — 8/8 |
| Responsive UI Phase 2 | PASS — 13/13 |
| Responsive UI Phase 3 | PASS — 14/14 |
| Responsive UI Phase 4 | PASS — 8/8 |
| Responsive UI Phase 5 | PASS — 8/8 |
| Notification worker | PASS — 11/11 |
| Review v2 repositories/UI | PASS — 6/6 |
| Restaurant Earnings safeguards | PASS — 11/11 |
| Phase 7 order flow | PASS — 1/1 |

No hosted endpoint was contacted by these tests. The only spawned command in authority preparation tests was a deterministic fake Git runner; the accepted parent manifest test read local Git blobs.

## Integrity results

| Check | Result |
|---|---|
| HEAD | 267b9bc5bbe888431d864963890f73c7092ededc |
| Restaurant tree | PASS — ae03238ac8c34f4ef11365b5a5c51dee81187812 |
| Accepted artifact manifest | PASS — 6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a |
| Deterministic archive | PASS — 195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d |
| Protected ruip6a_20260924b | PASS — 35/35; manifest 4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44 |
| Protected ruip6a_20260924c | PASS — 42/42; manifest 85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538 |
| Existing accepted diagnostic files | PASS — unchanged |
| Credential scan | PASS — no real or hardcoded credential, password, private key, or JWT; one deliberate synthetic bearer value appears only in the redaction test and its recorded diff |
| Diff whitespace | PASS |

## Revised one-run execution sequence

After a separately approved support checkpoint and then a concrete hosted authorization:

1. Reproduce the future checkpoint source manifest and prepare the protected authority artifacts with prepare-authority.
2. Run baseline-preflight with confirmation staging:restaurant-alias-support:baseline-preflight:ruip6ad_20260925a.
3. Run the accepted operator capture-rollback action; require 6jki82fy0u and exact content parity.
4. Run export, deploy exactly one new immutable candidate, and verify-immutable.
5. Run the real pending/suspended/owner/manager immutable access qualifier.
6. If the rollback reference is stale, run capture-rollback again into new evidence after preserving the earlier reference; do not overwrite it. The execution procedure must archive the older file under a unique evidence name before recapture.
7. Run final-preflight with confirmation staging:restaurant-alias-support:final-preflight:ruip6ad_20260925a.
8. Run promote once. The accepted operator performs its independent two-observation rollback recheck before its single provider command.
9. Run observe-alias for the fixed 600-second maximum.
10. On FAIL, INCONCLUSIVE, interruption, uncertainty, or owner stop, run record-abort, then the independently confirmed rollback and verify-rollback commands.
11. On diagnostic PASS, complete only the separately authorized post-parity work or restore the rollback target.
12. Supply a manifest-scoped cleanup disposition and complete expected-alias reference, then run finalize with confirmation staging:restaurant-alias-support:finalize:ruip6ad_20260925a.
13. Preserve and hash all evidence. Phase 6 remains blocked until all separate functional, device, PWA, push, cleanup, and Earnings gates pass.

## Remaining hosted prerequisites

- A new audited support checkpoint and its complete sorted source-manifest hash.
- A concrete owner authorization explicitly bound to that checkpoint, manifest, run, complete action set, rollback, and Earnings-disabled boundary.
- Approved Staging-only Supabase management, Firebase Admin, and Expo sessions.
- Four approved real non-production identities and a protected credentials file.
- A declared Staging maintenance window and observer notification.
- A reviewed procedure for preserving an older rollback-reference file before fresh recapture; the accepted capture action writes the canonical filename.
- A concrete manifest-scoped cleanup disposition listing the immutable provider deployment record and every local artifact.
- Exact expected-final-alias reference selection for candidate retention or rollback restoration.
- Separate authorization for every hosted action-specific confirmation.
- Separate Phase 6 functional, device, PWA, push, and populated Earnings qualification.

## Proposed next local checkpoint procedure

No checkpoint is authorized by this review.

After owner approval:

1. Verify HEAD is 267b9bc5bbe888431d864963890f73c7092ededc and Restaurant tree is unchanged.
2. Verify this review, complete diff, and both executable hashes.
3. Reconstruct the two support files from the complete diff and compare byte-for-byte.
4. Reverify accepted artifact/archive and all 77 protected evidence files.
5. Rerun the complete current 30-test support suite, 46 accepted diagnostic tests, syntax, application regressions, credential scans, and diff checks.
6. Stage exactly the two support files plus this review and complete diff.
7. Inspect the full staged inventory and diff; require cached diff whitespace checks to pass.
8. Create one local direct-child checkpoint. Do not push.
9. Record its commit, parent, source manifest, four-file inventory, executable hashes, unchanged Restaurant tree, and protected evidence.
10. Prepare a new concrete hosted execution request using the checkpoint and manifest. Local checkpoint approval must not be treated as hosted authorization.
