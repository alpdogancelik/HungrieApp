# Restaurant Expo Alias Pending Access and Firebase Finalization Remediation

**Status:** LOCAL READINESS PASS; uncommitted
**Audited parent:** `7262b4815ded41845f7cd431704ac3594933f70b`
**Affected aborted run:** `ruip6ad_20260926g` (preserved; permanently ineligible for retry)
**Hosted effect:** None
**Phase 6:** BLOCKED

## Scope and evidence integrity

This work changes the immutable-access qualifier and tests, execution support and tests, the rejected-deployment guard and tests, and the exact run-h binding contract. The Restaurant application tree remains `ae03238ac8c34f4ef11365b5a5c51dee81187812`. No application, account, Firebase identity, database, deployment, alias, Earnings, Development, or Production state changed.

All 22 preserved run-g files and all three run-g authority files were hashed before investigation and reverified byte-for-byte afterward. The earlier protected 35-file and 42-file evidence sets pass the accepted diagnostic verification suite.

## Pending-account root cause

The three labels came from the qualification harness, not a demonstrated application authorization or runtime defect.

1. **`UNEXPECTED_RUNTIME_REQUEST` — confirmed primary classifier defect.** `sanitizeRequest()` intentionally removed request URLs but did not retain a safe origin. `evaluateBrowserQualification()` then attempted to read `request.url` or `request.requestedUrl`, neither of which existed. Every sanitized request therefore entered the parse-error branch and was classified as unexpected. The correction persists protocol and origin while retaining only query-parameter names and header names; credential and query values remain absent.
2. **`SAME_ORIGIN_HTTP_ERROR` — confirmed optional browser request.** A new, credential-free Chrome profile against retained immutable deployment `h5pf025zw9` observed the initial document and required JS/CSS/font/manifest responses succeed, followed by the browser's automatic `/favicon.ico` request returning HTTP 404. The application does not reference a favicon and the accepted/publication contract does not require one. Only this exact GET-like browser `Other` response at `/favicon.ico` is retained as an ignored optional observation. Every other same-origin HTTP error remains a blocker.
3. **`SERVICE_WORKER_NOT_READY` — confirmed readiness race.** The original harness sampled readiness immediately after the route heading appeared. A fresh read-only observation showed the same worker move through installing, installed, activating, and activated, then control the page and satisfy readiness. The correction waits for an exact same-origin root-scope activated registration for at most 100 × 50 ms. Missing, wrong-scope, failed, or still-incomplete registration remains a blocker.

The original run threw before persisting its detailed request/response trace, so its exact event ordering cannot be reconstructed. The read-only repeat established that the favicon 404 occurred during initial loading and that worker readiness followed normally. The origin-loss classifier would classify the first recorded request as unexpected at evaluation time. The correction now atomically persists a sanitized per-account evidence record, including request/response timestamps, blockers, worker states, navigation/render state, and no credential values, before any failed decision throws.

Pending and suspended screens remain non-operational. Owner and manager operational requirements, hydration/console error detection, all required same-origin failures, external HTTP origins, protected-before-authorization checks, bounded navigation, manager Earnings denial, and the complete render contract remain fail closed.

## Firebase finalization root cause and correction

The support reader coupled token acquisition to `firebaseApp.options` and unconditionally called `firebaseApp.delete()` in a `finally` block. It had no explicit ownership state, no idempotency, no post-delete registry verification, and could replace the primary reconciliation error with a deletion error. The preserved run contains only the Supabase project read before the repeatable “already deleted” failure, so the actor that first deleted that temporary instance is not recoverable from run-g evidence. The lifecycle contract itself is conclusively unsafe.

The correction:

- retains the Firebase credential provider independently from the app object;
- uses the modular Firebase Admin app lifecycle API;
- introduces an explicit owned/borrowed app lease;
- permits exactly one owned deletion attempt and makes repeat close calls idempotent;
- never deletes injected/borrowed test apps;
- independently checks that the temporary named app is absent from the Admin registry;
- persists `ACTIVE`, `CLOSED`, `BORROWED`, or `CLEANUP_FAILED` evidence with sanitized deletion/verification errors;
- records an already-deleted error but accepts cleanup only when registry absence is independently proven;
- rejects cleanup when the app remains registered or verification fails;
- closes and verifies the lease before `final-reconciliation.json` can be written;
- preserves both the primary operation error and cleanup error with `AggregateError` when both fail.

An aborted run remains terminal and cannot regain deployment or promotion eligibility. Existing abort-before-deployment, abort-after-deployment, uncertain assignment, independently verified rollback, interruption, resume, and repeat-finalization protections remain active.

## Changed files

| File | SHA-256 |
|---|---|
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `befeeeb14b81aa969b9ba62951df52d1e3b9d0d54b111f094206d578db675025` |
| `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs` | `e2621bd4f6f300daf3a9c997990c244680b8e09bf7b7801dbd2d65d59c593828` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `d9246b103665fc71db72b0c9b041391dc938f6d363ca8ac6ce51726824bf2add` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `f04b10d579767ea03a22b1dea4fef144087ea6099ab93a851c3e2be3fb88c3c7` |
| `scripts/test-restaurant-alias-diagnostic-access-staging.mjs` | `01a4a6c21809133620fd1610c3a7fd5e7d8d499b1438b76d8c0a9c26d19cd51c` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `a7229b45a05b61daddc1787e0d9680040b631cf1b7a4004141e4b6875a75bc48` |
| `docs/restaurant-expo-alias-ruip6ad-20260926h-run-binding-contract.md` | `9eaaa418496ddd838ad5464d7393bbc25a094084b9a6374f51058a283a9ae4bd` |

The exact checkpoint inventory is these seven files plus this report and the complete six-file executable/test patch in `docs/restaurant-expo-alias-pending-access-firebase-finalization-remediation.diff` (nine files total). Run h binds parent `7262b4815ded41845f7cd431704ac3594933f70b`, rejects prior deployment `h5pf025zw9`, and retains artifact manifest `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae` and canonical archive `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d`.

## Qualification

| Command / check | Result |
|---|---|
| Access, diagnostic operator, and parity suites | PASS — 66/66 |
| Execution-support suite | PASS — 61/61 |
| Focused total | PASS — 127/127 |
| AuthGate lifecycle | PASS — 11/11 |
| Responsive UI Phases 1–5 | PASS — 51/51 |
| Notification worker | PASS — 11/11 |
| Reviews repositories | PASS — 6/6 |
| Reviews UI | PASS — 29/29 |
| Restaurant Earnings Phase 3 | PASS — 11/11 |
| Restaurant Earnings Phase 4 contract | PASS — 6/6 |
| Phase 7 order/runner safeguards | PASS — 21/21 |
| Restaurant functions safeguards | PASS — 2/2 |
| Restaurant TypeScript | PASS |
| Restaurant static web export | PASS — 20 routes |
| Local production-export four-access browser simulation | PASS — pending, suspended, owner, manager; zero exceptions |
| Terminal-abort and Firebase cleanup simulation | PASS — reconciliation remains terminal and cleanup precedes evidence |
| Six changed-file syntax | PASS |
| `git diff --check` | PASS |
| Restaurant application tree | PASS — unchanged |
| Run-g evidence | PASS — 22/22 unchanged |
| Run-g authority evidence | PASS — 3/3 unchanged |
| Accepted protected evidence | PASS — 35/35 and 42/42 |
| Credential scan | PASS — no credential values in changed persistent evidence |

No test was skipped.

## Remaining limitation

Run g did not preserve its detailed browser trace, so the exact original unexpected-request URL and precise ordering among its three terminal labels cannot be recovered. The source defect proves why every sanitized request was classified as unexpected, and the credential-free retained-deployment observation proves the favicon and service-worker behavior. A future separately authorized hosted run would still be required to observe the corrected qualifier with all four real identities and to exercise real Firebase Admin cleanup. This local result does not authorize a new run, deployment, alias change, rollback, or Phase 6 acceptance.
