# Restaurant Expo/EAS Alias Diagnostic — Consolidated Local Operational Readiness

**Date:** 2026-09-25
**Run:** `ruip6ad_20260925a`
**Hosted activity:** none
**Phase 6:** `BLOCKED`
**Local status:** `LOCAL READINESS PASS`

## Scope and baseline

The audit began at `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` (parent `267b9bc5bbe888431d864963890f73c7092ededc`, source manifest `8449af0cf852d22154392525d1e2cca5c78461036667065f1f9ec4662c85e059`, 1,494 files). The Restaurant tree remains `ae03238ac8c34f4ef11365b5a5c51dee81187812`. No hosted service, credential, deployment, alias, rollback, or capability was accessed.

## Complete workflow audit matrix

| Transition | Executable evidence / gate | Audit result and disposition |
|---|---|---|
| Owner approval | strict approval JSON and exact text digest | Corrected to require both diagnostic and support action lists and the audited child lineage. |
| Authority/source | exclusive authority and source manifest | Child checkpoint scope now includes the complete reviewed six-file changeset. |
| Baseline preflight | six independently persisted reads | Existing exact environment, migration, ACL, Earnings, alias, and protected checks retained. |
| Initial rollback capture | canonical reference and progress | Safe only when six routes and exactly five assets; explicit diagnostic contract added at support consumption. |
| Export | fixed 74-file manifest and deterministic archive | Accepted operator unchanged. |
| Deployment | exclusive deployment attempt plus atomic inventory | Added empty initialization, pre-invocation reservation, one-attempt enforcement, revision history, exact provider registration, uncertainty, and independent-read reconciliation. |
| Immutable parity | six HTML and five assets | Accepted operator unchanged and mandatory before final preflight. |
| Four-account access | pending/suspended/owner/manager evidence | Accepted qualifier unchanged and candidate-bound. |
| Historical preservation | history copy and quarantine | Added durable attempt before any movement; independent byte/hash preservation. |
| Fresh recapture | new canonical reference/progress and verification | Added mandatory verified state; every interruption and byte/timestamp/binding/cardinality mismatch blocks. |
| Final preflight | fresh reads plus all candidate/rollback/resource evidence | Now consumes verified canonical bytes and the exact registered deployment inventory. |
| Promotion | accepted exclusive promotion marker | Existing single assignment retained. Blocking marker is distinguished from real provider invocation. |
| Observer | accepted 600-second verifier | Existing full metadata/six-route/five-asset exact parity and stability policy retained. |
| Terminal classification | terminal record | Correctly distinguishes not-attempted, uncertain, and confirmed assignment. |
| Rollback | accepted exclusive rollback marker | Required after every real promotion attempt, including observer PASS. No automatic retry. |
| Rollback verification | exact parity verifier | Provider response alone is never restoration proof; normal PASS requires recorded independent verification. |
| Cleanup | atomic cleanup disposition | Added exact inventory hash binding, retained provider record, no unverified deletion, and blockers for omissions/duplicates/unexpected resources. |
| Expected final alias | verified fresh rollback reference | Added exact six-route/five-asset run-bound construction and original historical hash preservation. |
| Finalization | fresh hosted reads, exact alias parity, protected checks, manifest | Added immutable expected/cleanup inputs, interruption marker, rollback requirements, credential scan, and final evidence manifest. |

## Defects found and closed

1. Final preflight accepted a fresh-looking rollback reference without proving a recapture completed. Closed with an exclusive durable recapture attempt and mandatory verification.
2. An interruption before canonical movement was invisible. Closed by writing `INITIATED` before preservation or movement.
3. Historical reference and progress could be lost or partially moved. Closed with byte-identical history copies plus separately tracked quarantine identities.
4. Rollback assets had `>=1` versus finalization `=5`. This diagnostic now requires exactly five; no truncation or invention.
5. Deployment resources were not constructed by the operator workflow. Closed with atomic schema-v2 inventory and hashed revision history.
6. A deployment timeout could encourage a second attempt or fabricated ID. Closed with a pre-provider exclusive marker, zero fabricated resources, and independently persisted provider-read reconciliation.
7. Cleanup input could be constructed independently of inventory. Closed with exact inventory SHA-256 and persisted cleanup input binding.
8. Expected final alias was a manual input. Closed with exclusive construction from verified rollback evidence.
9. A blocking promotion marker was treated as an attempted assignment. Closed by inspecting `providerCommandInvoked` or accepted provider-attempt fields.
10. Observer PASS did not itself ensure the alias was returned to rollback. Final PASS now requires rollback attempt/result/verification and independent final alias parity.
11. Finalization inputs could differ from their persisted files. Closed with byte-exact hashes and exclusive finalization state.
12. A future checkpoint was impossible because support still required a child of `267b9…`. Closed by making the accepted support checkpoint `1a64f4…` the required parent and defining the six-file reviewed scope.

## Deterministic scenario coverage

The support suite exercises:

- **A success:** authority/schema, baseline, registered deployment, immutable/access binding, verified recapture, final preflight, promoted-run evidence, rollback evidence, exact cleanup, hosted-reader exact final parity, and final manifest.
- **B pre-promotion failures:** wrong/stale/tampered reads, identity/migration/ACL/Earnings drift, candidate/access/rollback mismatch, missing mandatory evidence, and blocking promotion marker.
- **C recapture interruptions:** after initiation, after preservation, before reference movement, after reference movement, after progress movement, and before capture; absent verification and changed historical/canonical evidence also fail.
- **D deployment uncertainty:** no fabricated deployment, no second attempt, one independently bound reconciliation, and ambiguous-resource preservation.
- **E promotion uncertainty:** terminal state requires rollback and never permits promotion retry.
- **F observer:** accepted verifier suites cover PASS, FAIL, INCONCLUSIVE, mixed generation, HTTP failure, timeout, incomplete requests, exact hash failure, final permitted attempt, and stability regression.
- **G rollback:** provider response alone is insufficient; normal success requires independent recorded rollback verification and final exact alias parity; uncertain/failed recovery remains terminal.
- **H finalization:** missing/changed evidence, protected mismatch, cleanup mismatch, unexpected resources, asset cardinality, credentials, and interruption all prevent PASS.

## Changed files

- `scripts/restaurant-alias-diagnostic-execution-support.mjs`
- `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
- `docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md`
- `docs/restaurant-expo-alias-final-one-run-operational-readiness-audit.md`
- `docs/restaurant-alias-diagnostic-execution-support-implementation-review.md`
- `docs/restaurant-alias-diagnostic-execution-support-implementation.diff`

No accepted diagnostic verifier, diagnostic deployment operator, access qualifier, Restaurant application, backend, migration, or protected evidence file changed.

## Regression evidence

| Check | Exact command | Result |
|---|---|---|
| Support + accepted diagnostic suites | `node --test scripts/test-restaurant-alias-parity-verifier.mjs scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | PASS — 83/83 total: 37 support and 46 accepted diagnostic tests, including legacy verifier cases |
| Seven syntax checks | `node --check` on verifier/test, diagnostic operator/test, access qualifier, support/test | PASS |
| Restaurant TypeScript | `npm run typecheck --workspace @hungrie/restaurant` | PASS |
| Responsive UI Phase 1 | `npm run test:restaurant-responsive-ui-phase1` | PASS — 8/8 |
| Responsive UI Phase 2 | `npm run test:restaurant-responsive-ui-phase2` | PASS — 13/13 |
| Responsive UI Phase 3 | `npm run test:restaurant-responsive-ui-phase3` | PASS — 14/14 |
| Responsive UI Phase 4 | `npm run test:restaurant-responsive-ui-phase4` | PASS — 8/8 |
| Responsive UI Phase 5 | `npm run test:restaurant-responsive-ui-phase5` | PASS — 8/8 |
| Notification worker | `npm run notification-worker:test` | PASS — 11/11 |
| Reviews | `npm run test:review-v2-repositories && npm run test:review-v2-ui` | PASS — 6/6 repository/UI contract tests and 29/29 Jest tests |
| Earnings safeguards | `npm run test:restaurant-earnings-phase3 && npm run phase3:restaurant-earnings:check` | PASS — 11/11 plus safeguard checker |
| Order flow | `node --test scripts/phase7-order-flow.test.mjs` | PASS — 1/1 |
| Protected evidence | `verifyProtectedEvidence(process.cwd())` | PASS — `ruip6a_20260924b` 35/35 and `ruip6a_20260924c` 42/42 |
| Accepted artifact/archive | independent manifest and archive SHA-256 for both protected runs | PASS — 74 files, manifest `6c9f951…`, archive `195e20e…` |
| Base identity | `git rev-parse HEAD`, `HEAD^`, `HEAD:apps/restaurant`, `buildSourceManifest` | PASS — exact accepted checkpoint, parent, tree, 1,494-file source manifest |
| Accepted diagnostic executables | `sha256sum` on five files | PASS — all five accepted hashes unchanged |
| Credential scan | credential-shaped regex over all six changed artifacts | PASS — only deliberate synthetic bearer redaction fixture and its recorded diff |
| Prohibited mutation scan | source/test plus executable guard | PASS — support contains no provider deployment, alias mutation, rollback, or retry command |
| Whitespace | `git diff --check` and trailing-whitespace scan over all six files | PASS |

Implementation source hashes:

- support: `b7374024b74f28e2dedd157e2de25b2a5368fd43484aa8528c6ed7d2ea6ceae5`
- support tests: `84cf80869b12195d90192fcf46e2821574abeb4b02a9ae32e9b17eef5d4925c5`
- complete two-source-file diff: `20d2fde68d417b48e329c239a983ac9cb6b5aff032f36dd92c95855c030e3dd5`
- updated execution proposal: `9cf30053110f0380c09e297a645834d4ac9f020dd4214aa68b97ce9ab7103b41`

This report is not an execution authority.

## Remaining external prerequisites

- Owner review and approval of one audited local child checkpoint containing exactly the six files above.
- Exact new checkpoint and source-manifest hash.
- Separate owner authorization text/JSON, maintenance window, exposure acknowledgement, and secure real non-production account file.
- Real hosted Staging identity/preflight observations and a new provider deployment ID/URL.
- Independent provider read only if the single deployment outcome is uncertain.
- Remaining Phase 6 functional, device, PWA, push, and populated Earnings gates.

Local readiness does not imply hosted success. Phase 6 remains `BLOCKED`.

## Final local disposition

**LOCAL READINESS PASS.** Every locally reproducible blocker found in the full transition audit is closed, all mandatory deterministic scenarios fail closed or pass as intended, and executable/document contracts agree. This result does not establish actual Expo/EAS, CDN, Staging account, browser, device, push, PWA, or Earnings behavior. A new audited checkpoint and explicit one-run owner authorization are still required. Phase 6 remains `BLOCKED`.
