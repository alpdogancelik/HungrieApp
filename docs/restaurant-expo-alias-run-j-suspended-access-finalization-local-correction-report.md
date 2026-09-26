# Restaurant Expo alias run-j suspended-access and finalization local correction

**Scope:** local correction and read-only observation only
**Run preserved:** `ruip6ad_20260926j`
**Disposition:** Phase 6 remains `BLOCKED`; run j remains terminal `FAIL` and cannot be retried, deployed, or promoted.

## Findings

### Suspended access

The retained run contains a complete passing pending-account record but no suspended browser record. The old qualifier threw `suspended login form unavailable` before persisting the suspended page, console, network, service-worker, or navigation state. That historical page therefore cannot be reconstructed and was not invented.

The demonstrated cause is the qualifier's browser ownership lifecycle. It assigned fixed DevTools ports, trusted whichever browser answered a port without binding that endpoint to the newly created profile/process, sent `SIGTERM` without confirming exit, waited only 150 ms, and removed the profile. A stale browser endpoint could therefore be treated as the new suspended context. This is a qualification-harness defect. It is not an authorization or suspended-route defect: a fresh read-only observation against retained immutable deployment `nvu5lw5xri`, with four independently owned browser profiles, passed pending `/pending`, suspended `/suspended`, owner `/dashboard` plus `/orders` restoration, and manager `/dashboard` plus `/orders` restoration.

The correction lets Chrome select an ephemeral port, reads the endpoint only from that profile's `DevToolsActivePort`, verifies both browser and page WebSocket ownership, and waits for confirmed termination before profile deletion. A missing login form now persists sanitized failure evidence before throwing. The access-resolution probe wraps the page's fetch path so its readiness flag is committed before the application can process the successful access-context response; this preserves the existing protected-content-before-authorization failure check during direct-route restoration. HTTP errors, unexpected origins, network failures, console/runtime errors, service-worker failure, incomplete rendering, manager financial access, and unbounded navigation remain blockers.

Response evidence now retains origin, path, query-parameter names, status, MIME type, and request ID without retaining query values. The final correction evidence contains no password, bearer token, authorization value, or API-key value.

### Final reconciliation

The exact ordering defect was that `capturedAt` was evaluated before `await readers.collect()`. In run j, finalization began at `2026-09-26T18:24:21.214Z`, while the six independent observations completed from `18:24:21.530Z` through `18:24:23.781Z`. Validation consequently treated valid completed observations as future-dated.

Finalization now derives its observation timestamp from the maximum of all six required `completedAt` values after collection, persists that timestamp with the observations, and runs the existing strict age, ordering, run, stage, request-ID, hash, and semantic validation against it. Missing or invalid completion timestamps fail closed. Stale observations at the boundary remain rejected.

A terminal record or promotion-prohibition marker now also blocks creation of a deployment-attempt marker. Terminal reconciliation preserves the terminal `FAIL`, returns `TERMINAL_NON_PASS_RUN`, and cannot restore deployment or promotion eligibility. Existing interrupted/repeated finalization and independently verified rollback rules remain enforced.

## Changed files

- `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs`
- `scripts/test-restaurant-alias-diagnostic-access-staging.mjs`
- `scripts/restaurant-alias-diagnostic-execution-support.mjs`
- `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
- this report

No Restaurant application file, backend contract, migration, artifact, archive, account, Firebase identity, alias, or hosted data was changed.

## Qualification

- Isolated read-only browser qualification against `nvu5lw5xri`: pending, suspended, owner, manager **PASS**; owned profile/endpoint for every account; credential-value scan **PASS**.
- Focused diagnostic and execution-support suites: **PASS — 155/155** (including the original verifier policies, owned-browser isolation, async completion ordering, strict stale boundary, terminal deployment prohibition, interruption, and repeated finalization cases).
- Restaurant TypeScript and UI Phase 1–5: **PASS**.
- Notification worker, Reviews repository/UI, Earnings safeguard/check, and order-flow recovery suites: **PASS**.
- Accepted artifact/archive: **PASS** — 74 files, manifest `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89`, archive `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862`. Restaurant tree remains `7430599b150adbd19ddafadce1195f1e418daf8a`.
- Protected evidence: **PASS** — `ruip6a_20260924b` 35/35 and `ruip6a_20260924c` 42/42 against accepted manifests.
- Run-j evidence: **PASS** — all 26 files match the pre-correction SHA-256 inventory byte-for-byte; authority, markers, terminal result, and `STARTED` finalization evidence are unchanged.
- Syntax, `git diff --check`, and credential-value scans: **PASS**.

### Final file identities

- `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs`: `e1b92b167f335961cf41c7eb1e11e941f4c1e9a0a01d5d3d3de58602bfc63504`
- `scripts/test-restaurant-alias-diagnostic-access-staging.mjs`: `cde26eaa19597bda32cbe1e4720dca04d0e1f55a9c2bcea0e70d9f95106b8ed2`
- `scripts/restaurant-alias-diagnostic-execution-support.mjs`: `babc0ba034e911d0e326ff5a0dbc4066f77e2526b70a6aaaca2004f85d565463`
- `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`: `37994df374308cd76eba1c6ca000e10b20848206c3128794fefb694339a92bc9`
- Sanitized isolated browser result: `f05a571836dc63af60c487891bbe2989f53ad0e03d01fe57cc017070003f6b9d`

## Remaining limitation

The historical suspended page is unavailable because the rejected qualifier did not persist evidence before throwing. The retained immutable deployment now passes the corrected read-only four-account qualification, but this local correction does not authorize a new run, deployment, promotion, rollback, or Phase 6 acceptance.
