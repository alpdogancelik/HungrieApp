# Restaurant Expo/EAS diagnostic remediation implementation review

**Disposition:** `LOCAL READINESS PASS`
**Hosted/Phase 6 disposition:** `BLOCKED`
**Parent checkpoint:** `5533606a841e9a7d75b2a3e22ef672bd107fa5d8`
**Restaurant tree:** `ae03238ac8c34f4ef11365b5a5c51dee81187812` (unchanged)
**Authoritative audit:** SHA-256 `b5091d70c5fb5cc6df1ac0c1ab8cbd3be030660407b1486fc08cfe23e10d002d`
**Hosted operations:** none

## Final dispositions for the seven findings

| Finding | Implementation | Disposition |
|---|---|---:|
| Rollback three assets versus candidate five | Rollback references now use a deployment-derived, digested asset/runtime contract discovered across all six routes. Candidate assets remain fixed by the accepted artifact. All downstream evidence carries its own exact set. | PASS |
| Complete 74-file/PWA publication | Immutable and promoted-alias verification fetch all 74 manifest entries and require exact URL, status, bytes, and SHA-256. Service-worker references and two external Firebase runtime hashes are mandatory. | PASS |
| Browser qualifier missed React `#418` and HTTP 404 | Qualification now fails all uncaught/console errors, same-origin HTTP errors, unexpected origins, incomplete rendering, missing service-worker readiness, and manager financial access. | PASS |
| Deployment reservation bypass | The actual deploy action atomically consumes the exclusive support reservation before invoking EAS and cannot be called directly or repeated. Provider URL/project semantics are checked. | PASS |
| Missing uncertain-deployment evidence producer | A separately executable read-only EAS GraphQL producer persists project/run/attempt-bound evidence before reconciliation. It never deploys or fabricates an ID. | PASS |
| Maintenance window not executable | Approval and authority now contain a maximum two-hour window. All hosted action gates enforce it; deploy/promote require 720 seconds remaining, while already authorized rollback recovery may continue after expiry. | PASS |
| Rollback capture phase ownership | Initial and fresh capture use separate exclusive markers. Fresh recapture requires preserved/quarantined history, a ready transition, a complete marker, matching contract digest, and fresh verification. Partial or repeated capture cannot pass. | PASS |

## Changed implementation inventory and SHA-256

| File | SHA-256 |
|---|---|
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `cf0e10538f0922f8e13236fa9eaee9947d83cf4e2c838cee1d1d1f0b54858b53` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `2392f2e9f96e9d6a40787775724f42537a9a0c34bb0f8644c23d0e4faeed349f` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `b76e106ed855d135dfc7339f7d4e213a15aa7aea04ebb9c405ffadaa9050c1a2` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `e7d848771145619d1cc3648388b48757a7165af9346ea02bb0911aaca92a51c6` |
| `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs` | `2e0189fca16b9bbd6a95d87685d38e92b8260f75e6a8225bed5221c3492c3c7d` |
| `scripts/test-restaurant-alias-diagnostic-access-staging.mjs` | `860e4b0589133bc7d452126e7652af6866b3ce7685db104b2c919e3fa9c76ee6` |

Review artifacts:

| File | SHA-256 |
|---|---|
| `docs/restaurant-expo-alias-diagnostic-remediated-execution-contract.md` | `06f1d1862a82c4d8d225b08e6a06ceee4590b59b1ae2bdaaa44d73838df0799f` |
| `docs/restaurant-expo-alias-diagnostic-remediation-implementation.diff` | `4d527e9920cc5b3e41178498547ed6d04984009ed17851619ca2a377df3e8506` |
| `docs/restaurant-expo-alias-ruip6ad-20260925c-execution-contract.md` | `1d89925353d88af8f278fb6b6aa2bf6e0cb4e133bd6d178409b8340430b4b6f5` |

The zero-context complete diff reconstructs the five modified executable/test files and the new access-qualifier test from parent HEAD when applied with `git apply --unidiff-zero`. Reverse application against the working tree passes. Documentation is excluded from the recorded implementation patch to avoid a self-referential diff.

## New-run binding correction

Execution support now accepts only `ruip6ad_20260925c`, uses its isolated authority and evidence paths, and rejects both aborted run IDs. Its accepted lineage now includes the exact current parent `5533606a841e9a7d75b2a3e22ef672bd107fa5d8`, source manifest `f06613f65c5a8866fe914dcd80efd8b04ef53e734aa27c651c445498cf739fc6` (1,506 files), exact six-file inventory, file hashes, and unchanged Restaurant tree.

The future checkpoint must be a direct child of that parent and contain the exact ten-file inventory in the committed run contract. A pure verifier checks owner approval, lineage, actual HEAD, exact parent, complete source manifest, exact inventory, Restaurant tree, diagnostic executable hashes, and committed run-contract digest before authority artifacts can be written. Synthetic qualification proves the exact new-run child passes while old runs, wrong parent, extra files, wrong manifest, changed application tree, changed executable, altered proposal, and broken lineage fail closed.

The committed run contract avoids a digest cycle: it fixes the run, parent, inventory, application tree, artifact boundaries, and authorization schema without embedding the unknown future commit. The later explicit owner approval supplies the actual commit and manifest, which the verifier reproduces from Git.

## Contract behavior

### Candidate

- Exactly 74 accepted manifest files.
- Six operational routes and five direct JS/CSS files remain explicit subsets.
- Every manifest file must return HTTP 200 at the exact requested URL with exact bytes and SHA-256.
- `manifest.webmanifest`, `sw.js`, and `firebase-config.js` are covered by the artifact.
- The service worker must reference the exact Firebase 11.10.0 app and messaging compatibility URLs, whose expected sizes and hashes are verified.
- The same full check runs against the immutable candidate before promotion and the alias after bounded convergence.

### Rollback

- Six routes are fixed, while JS/CSS count is deployment-derived.
- Current Staging reality with three assets is valid when all routes reference the recorded set and every route, asset, PWA runtime file, and external dependency matches exact bytes and hashes.
- Reference digest and complete arrays survive historical preservation, fresh recapture, promotion preflight, rollback verification, expected-final construction, and final reconciliation.

### Provider mutation boundaries

- Exactly one deployment reservation is consumed by the deploy command.
- Missing, altered, already consumed, or mismatched reservation evidence stops before provider invocation.
- Provider deployment ID must produce `https://hungrie-restaurant--<deployment-id>.expo.app` and is bound to the accepted EAS project evidence.
- Uncertain response reconciliation is read-only, independently persisted, run-bound, project-bound, and requires exactly one temporal candidate. Zero or multiple candidates remain blocked.
- No deployment retry, promotion retry, or rollback retry was added.

### Maintenance and recovery

- Approval/authority window must be valid, start after issuance, last no more than two hours, and be bound into authority.
- Non-recovery actions reject before the start and at/after the end.
- Deployment and promotion reject unless at least 720 seconds remain.
- A previously authorized rollback and its verification remain executable after deadline so the alias is not stranded.

## Deterministic qualification

### Operator suites

| Suite | Result |
|---|---:|
| Legacy 50-second and accepted 600-second parity verifier | PASS 24/24 |
| Diagnostic operator, immutable publication, promotion, rollback, window, reservation | PASS 25/25 |
| Execution support, lineage, new-run authority, preflight, recapture, uncertainty, cleanup, finalization | PASS 50/50 |
| Real-access decision tests | PASS 8/8 |
| **Focused operator total** | **PASS 107/107** |

The combined deterministic coverage includes baseline reads, three rollback assets versus five candidate assets, all 74 candidate files, PWA dependencies, four access states, hydration/404 negatives, one deployment, direct bypass rejection, uncertain provider response, independent reconciliation, fresh recapture, final preflight, window boundaries, one promotion, 600-second observation semantics, independent rollback verification, cleanup, final reconciliation, and interruption/failure paths at mutation boundaries.

### Application and backend safeguards

| Check | Result |
|---|---:|
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1 | PASS 8/8 |
| Responsive UI Phase 2 | PASS 13/13 |
| Responsive UI Phase 3 | PASS 14/14 |
| Responsive UI Phase 4 | PASS 8/8 |
| Responsive UI Phase 5 | PASS 8/8 |
| Notification worker | PASS 11/11 |
| Review repositories | PASS 6/6 |
| Review UI | PASS 29/29 |
| Earnings Phase 3 | PASS 11/11 |
| Earnings Phase 4 contract | PASS 6/6 |
| Local PostgREST 14.5 order-conflict transport | PASS; stale transition/acknowledgement/cancellation HTTP 409 code 40001, concurrency, idempotency, authorization, recovery, cleanup, zero retry backends, Earnings disabled |
| Syntax checks | PASS |
| `git diff --check` | PASS |

## Integrity evidence

- Restaurant application tree remains `ae03238ac8c34f4ef11365b5a5c51dee81187812`.
- Accepted artifact manifest remains 74 files with digest `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a`.
- Deterministic archive remains `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` (5,642,240 bytes).
- Protected evidence `ruip6a_20260924b`: PASS 35/35, manifest `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44`.
- Protected evidence `ruip6a_20260924c`: PASS 42/42, manifest `85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538`.
- Aborted runs `ruip6ad_20260925a` and `ruip6ad_20260925b` were not modified or reused.
- Credential scan found no real credential values in changed executable or review evidence. Existing synthetic test-only strings remain explicitly synthetic.
- Development, Production, Firebase identity state, account state, Earnings state, alias state, and hosted resources were not accessed for mutation.

## Hosted limitations

The following cannot be observed locally and remain future hosted qualification gates rather than local implementation blockers:

1. Whether a newly deployed immutable artifact publishes all 74 files through EAS Hosting exactly.
2. Whether the strengthened real browser qualifier observes a hydration error or failed local asset on that new candidate.
3. The actual provider deployment-list response following an uncertain future response.
4. Alias metadata/content propagation within 600 seconds and stability of three complete observations.
5. Successful one-attempt rollback and exact restored parity after a future assignment.

Any failure remains fail-closed and requires the already authorized recovery path. Local readiness does not assert a hosted PASS.

## Proposed checkpoint scope

One audited direct-child checkpoint of `5533606a841e9a7d75b2a3e22ef672bd107fa5d8` must contain exactly the ten files enumerated in `docs/restaurant-expo-alias-ruip6ad-20260925c-execution-contract.md`: the six implementation/test files, this review, the complete implementation diff, the remediated execution contract, and the run-specific committed execution contract.

Before checkpointing, recompute every hash, reconstruct the six source/test files from the diff, rerun the 107 focused tests and repository safeguards, verify artifact/protected evidence, inspect the staged inventory/diff, and require `git diff --cached --check` to pass. After commit, run the pure checkpoint verifier against the real commit and manifest before preparing any owner proposal.

## Final result

All seven confirmed locally resolvable blockers are closed in the uncommitted implementation and deterministic qualification.

**LOCAL READINESS: PASS**

**PHASE 6: BLOCKED.** The audited checkpoint and a separate explicit owner authorization with a fresh maintenance window are required before any hosted read or mutation.
