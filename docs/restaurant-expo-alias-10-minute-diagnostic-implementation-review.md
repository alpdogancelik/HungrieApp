# Restaurant Expo/EAS Alias 10-Minute Diagnostic — Corrected Local Implementation Review

**Status:** `PASS — local implementation only; not accepted for checkpointing or hosted execution`
**Reviewed plan:** `docs/restaurant-expo-alias-10-minute-diagnostic-experiment-plan.md`
**Plan SHA-256:** `47611c6cd93ab7d9595649db77589198d8d3f7bf4969c45062ae767d036d01fc`
**Accepted starting checkpoint:** `d2e86dd42b37a327289b908129ac8df006712d51`
**Restaurant application tree:** `ae03238ac8c34f4ef11365b5a5c51dee81187812`
**Hosted reads or mutations:** None
**Commit or push:** None
**Phase 6:** `BLOCKED`

## Outcome

The operator now enforces immutable-to-local-artifact parity, fresh rollback evidence, four-state immutable access qualification, and a complete fail-closed Staging preflight at the same boundary that owns the single alias-assignment command. It independently rechecks live rollback metadata and exact content immediately before reserving the one-promotion marker and invoking the provider command.

The accepted legacy 50-second verifier and the separate 600-second diagnostic policy remain intact. No Restaurant application, AuthGate, backend, migration, financial logic, deployment configuration, or protected prior-run evidence changed.

## Files

The corrective work stayed inside the previously approved five-file source scope:

| File | Current purpose | Corrective change in this review |
|---|---|---|
| `scripts/restaurant-alias-parity-verifier.mjs` | Legacy and diagnostic alias observer | No new promotion-boundary change; retains the accepted 50-second behavior and 600-second policy. |
| `scripts/test-restaurant-alias-parity-verifier.mjs` | Verifier tests | No new promotion-boundary change; retains all prior verifier tests. |
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | Run-independent diagnostic operator | Added exact local-artifact comparison, promotion prerequisite validation, independent protected-evidence verification, immediate rollback recheck, and one fail-closed promotion boundary. |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | Deterministic operator tests | Added immutable parity and prerequisite rejection tests, including proof that the provider command is not called when any gate fails. |
| `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs` | Run-independent immutable access qualifier | Added per-case PASS records and bindings to run, candidate, immutable URL, source, artifact, and immutable-evidence hash. |

Updated review artifacts:

- `docs/restaurant-expo-alias-10-minute-diagnostic-implementation-review.md`
- `docs/restaurant-expo-alias-10-minute-diagnostic-implementation.diff`

No additional source file was required. Existing unrelated untracked files remain untouched and are excluded from the proposed checkpoint.

## Immutable-to-artifact enforcement

`verify-immutable` now loads the fixed 74-file accepted local artifact manifest and compares the immutable candidate against it. The six required mappings are exact:

| Route | Accepted local artifact |
|---|---|
| `/login` | `login.html` |
| `/dashboard` | `dashboard.html` |
| `/orders/detail?orderId=phase6` | `orders/detail.html` |
| `/menu` | `menu.html` |
| `/reviews` | `reviews.html` |
| `/earnings` | `earnings.html` |

It derives exactly five critical JavaScript/CSS paths from the accepted artifact. For each route and asset, it persists the actual response before comparison and then records expected and actual paths, HTTP status, exact requested/final URL equality, byte length, SHA-256, all expected asset references in every HTML response, and individual and aggregate results.

The immutable record cannot pass from self-captured remote hashes. Any missing path, non-200 response, redirect/final-URL difference, byte difference, hash difference, or missing reference rejects the candidate.

## Exact promotion prerequisites

The promotion boundary rejects the operation before rollback revalidation or any provider command unless all of these are present and mutually consistent:

1. **Authority/source:** reviewed run ID, future audited commit, source-manifest SHA-256, unchanged Restaurant tree, exact project/alias identities, and action-specific promotion confirmation.
2. **Local artifact:** run-bound 74-file manifest, recomputed manifest digest `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a`, and actual deterministic archive hash `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d`.
3. **Candidate:** a new deployment ID outside the rejected set, exact immutable URL, source identity, and accepted artifact identity.
4. **Immutable parity:** PASS, six passing routes, five passing assets, exact candidate/source/artifact/archive bindings, evidence-file SHA-256, and completion no more than two hours old.
5. **Immutable access:** PASS for exactly `pending`, `suspended`, `owner`, and `manager`; expected final paths; exact run/candidate/URL/source/artifact/immutable-evidence bindings; evidence-file SHA-256; and capture no more than 30 minutes old.
6. **Frozen rollback reference:** PASS, exact run, deployment `6jki82fy0u`, six routes, the complete recorded critical-asset set, evidence-file SHA-256, and capture no more than five minutes old. A different rollback deployment is rejected for owner review.
7. **Promotion preflight:** PASS, Staging environment, capture no more than ten minutes old, and exact Supabase/Firebase/EAS/alias identities, source/application/artifact/archive identities, candidate and evidence bindings, migration state, Earnings state, and protected-evidence identities.
8. **Migration/capability:** migration `20260924140000` with checksum `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641`, applied exactly once with zero pending migrations, and `restaurant_earnings_v1` disabled.
9. **Independent protected evidence:** the operator rereads and hashes all 35 files in `ruip6a_20260924b` and all 42 files in `ruip6a_20260924c`; it does not rely only on the preflight assertion.
10. **Immediate rollback parity:** after all static gates pass, the promotion action independently retrieves alias metadata and verifies the frozen six-route/full-asset set. Two complete observations at least 30 seconds apart are required. The completed record must still be fresh within 30 seconds when evaluated.
11. **Final revalidation:** all static prerequisites are checked again after the rollback observation and before the provider call. The atomic promotion marker is then created before exactly one alias-assignment command. A failed command leaves the marker and cannot retry automatically.

The required Staging identities are Supabase `rlrfvqskzvpysewdxqcr`, Firebase `hungrieapp-a2288`, EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`, alias ID `01a09ada-0ac3-74bf-8361-3c803e655af9`, alias name `staging`, and URL `https://hungrie-restaurant--staging.expo.app`.

Rollback remains a separately named action with its own explicit confirmation, marker, command, and independent post-rollback parity verification.

## Diagnostic policy preservation

The legacy policy remains exactly 10 attempts, five-second targets, and a 50-second deadline. The diagnostic policy remains exactly:

```text
maximumObservationMs = 600000
pollingIntervalMs = 10000
maximumAttempts = 60
requiredCompleteObservations = 3
stabilitySpacingMs = 30000
```

Diagnostic attempt starts target `+0s` through `+590s`; no request starts at or after `+600s`. PASS still requires an initial complete metadata/six-route/five-asset observation and two later complete observations at least 30 seconds apart, with no intervening regression. FAIL and INCONCLUSIVE remain rollback-required.

## Local qualification

### Focused executable suite

```sh
node --test scripts/test-restaurant-alias-parity-verifier.mjs scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs
```

Result: **46/46 PASS**, 0 failed, 0 skipped, 0 cancelled, 0 todo.

- Verifier tests: 24/24 PASS, including all original 14 legacy tests and all previously accepted diagnostic cases.
- Operator tests: 22/22 PASS.
- All 36 tests reported in the prior implementation review remain passing.
- Ten additional operator tests/expanded cases cover the four corrective findings.

Negative coverage proves rejection for each individually varied condition:

- immutable evidence missing, stale, failed, wrong candidate, incomplete routes/assets, bad evidence hash, wrong artifact manifest, wrong archive, status failure, redirect, byte/hash mismatch, and missing HTML asset references;
- pending, suspended, owner, or manager result missing/failed/wrong route; stale access record; wrong candidate, URL, artifact, immutable hash, qualification identity, or evidence hash;
- rollback record missing, stale, failed, incomplete, unexpected deployment, missing assets, bad hash, or inconsistent preflight binding;
- preflight missing, stale, failed, wrong environment, wrong Supabase/Firebase/EAS/alias identity, wrong source/artifact, wrong migration/checksum/count, pending migrations, Earnings enabled, altered protected evidence, or wrong candidate/access/rollback binding;
- immediate rollback recheck missing, stale, failed, wrong target/set, incomplete stability observations, or bad evidence hash;
- no provider call and no promotion marker when a mandatory gate fails;
- one provider call after all gates pass and no automatic second promotion.

### Syntax, formatting, and application regression

All five implementation files passed `node --check`; `git diff --check` passed.

| Command | Result |
|---|---|
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

No executed test failed or skipped. Hosted preflight, real authentication, immutable deployment, alias assignment, rollback, and real-browser qualification were deliberately not executed because this authorization was local only.

## Integrity evidence

| Check | Result |
|---|---|
| Repository baseline | `d2e86dd42b37a327289b908129ac8df006712d51` |
| Restaurant application tree | PASS — `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| `git diff --exit-code -- apps/restaurant` | PASS |
| Accepted artifact manifest | PASS — `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` |
| Accepted deterministic archive | PASS — `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Archive contents | PASS — 74/74 files, 20 HTML routes, zero missing/mismatched |
| Protected `ruip6a_20260924b` | PASS — 35/35; manifest `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44` |
| Protected `ruip6a_20260924c` | PASS — 42/42; manifest `85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538` |
| Credential-pattern scan | PASS — no API key, JWT, private-key block, or persisted bearer value |

## SHA-256 values

| File | SHA-256 |
|---|---|
| `scripts/restaurant-alias-parity-verifier.mjs` | `e563d7a5203aaf6ea0e04687063d63027568fd2906accec43c26daaeea4ca1d8` |
| `scripts/test-restaurant-alias-parity-verifier.mjs` | `6fa1ce21c047f93678be3c45fb71cd1f0e8167ed142fc259e55efddea1030afb` |
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `a3fe6fb596a6e6aefd17e576beaa2c35a06a19e620e7ab807fbe5a7dc6792ed6` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `d09e43ab5a13a6357da994840f6bdd22730a5118f244f82979468b0f0243b288` |
| `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs` | `9500103b1c54a6c97b1fb126ac0973bb881095d4f81e0e30dc941e7090293c35` |
| Complete implementation diff | `87e4eba77949cc7ea3abc979573f80b467b895b5fec5ae43ad1018082a9e81e1` |

## Remaining limitations

- The new promotion preflight schema is enforced but no hosted preflight record was created. A future separately authorized Staging workflow must collect the real identities, migration state, pending migration count, Earnings state, candidate bindings, and hashes in `promotion-preflight.json`.
- The access qualifier is executable and evidence-bound, but real pending/suspended/owner/manager authentication was not run because it requires prohibited hosted services.
- Local deterministic tests cannot establish whether Expo alias delivery converges within 600 seconds.
- A future hosted run can leave the alias on incompletely propagated content for almost ten minutes. The frozen rollback reference and immediate pre-promotion recheck reduce recovery risk but do not remove the exposure window.
- Alias parity alone cannot complete Phase 6. Earnings remains disabled, and remaining hosted and physical-device gates require separate authorization.

## Proposed audited checkpoint procedure

No checkpoint was created. After separate owner approval:

1. Reverify the starting checkpoint, plan hash, unchanged Restaurant tree, accepted artifact/archive, and all 77 protected evidence files.
2. Re-run the five syntax checks, 46 focused tests, application regressions, credential scan, and `git diff --check`.
3. Regenerate this complete diff and compare its reviewed SHA-256.
4. Stage only the five approved source files and the two review artifacts. Exclude unrelated and secure workspace files.
5. Inspect the full staged inventory, staged diff, and staged credential scan.
6. Create one local audited checkpoint with an owner-approved message; do not push.
7. Generate and record the resulting commit and full source-manifest SHA-256, executable hashes, unchanged Restaurant tree, and protected-evidence results.
8. Present a separate Staging execution request. No hosted command is authorized by local completion approval.
