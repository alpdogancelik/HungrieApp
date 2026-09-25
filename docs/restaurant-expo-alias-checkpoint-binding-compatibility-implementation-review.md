# Restaurant Expo/EAS Alias Diagnostic Checkpoint-Binding Compatibility — Implementation Review

**Status:** LOCAL IMPLEMENTATION READY FOR REVIEW; NO CHECKPOINT OR HOSTED AUTHORIZATION
**Prepared:** 2026-09-25
**Starting HEAD:** `583579463f339dd8178917ebaa5e5cae9347dc5c`
**Run:** `ruip6ad_20260925a`
**Phase 6:** `BLOCKED`

## Root cause

The accepted execution-support module treated `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` as both the historical execution-support base and the required immediate parent of the future authorized source commit. It also required that future commit to reproduce the earlier readiness checkpoint's six-file inventory. Two later accepted checkpoints made that contract impossible to satisfy truthfully:

1. readiness checkpoint `c3180f019de93fae99341628577a9553faad60f7`, a direct child of `1a64f4…`;
2. account-preparation checkpoint `583579463f339dd8178917ebaa5e5cae9347dc5c`, a direct child of `c3180f…`.

The account preparation completed and reconciled successfully, so hosted execution must originate from a new reviewed direct child of `583579…`. Supplying the actual parent previously failed authorization validation; supplying the obsolete parent passed the first field check but failed direct-parent and inventory verification.

## Narrow correction

The correction preserves strict validation and encodes an exact permitted lineage:

| Commit | Exact parent | Source manifest | Files | Restaurant tree |
|---|---|---|---:|---|
| `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` | `267b9bc5bbe888431d864963890f73c7092ededc` | `8449af0cf852d22154392525d1e2cca5c78461036667065f1f9ec4662c85e059` | 1,494 | `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| `c3180f019de93fae99341628577a9553faad60f7` | `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` | `89709da5fb1609b706fae69d41a200dd6914415f65a2ae31007806141a86c12b` | 1,496 | unchanged |
| `583579463f339dd8178917ebaa5e5cae9347dc5c` | `c3180f019de93fae99341628577a9553faad60f7` | `fc3e6b5b6b4340bc7da310d2ef9bfca5514cc21756ae4c85db05cde0cf619c22` | 1,501 | unchanged |
| Future compatibility checkpoint | `583579463f339dd8178917ebaa5e5cae9347dc5c` | Must equal the later owner-approved manifest | Exact six-file inventory below | unchanged |

For each accepted historical checkpoint, authority preparation now verifies the exact parent, commit inventory, SHA-256 of every committed file in that checkpoint, complete sorted source-manifest hash and count, and Restaurant tree. The future compatibility checkpoint must be a direct child of `583579…`; generic descendant acceptance is absent.

The future commit must contain exactly:

1. `scripts/restaurant-alias-diagnostic-execution-support.mjs`
2. `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
3. `docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md`
4. `docs/restaurant-expo-alias-final-execution-readiness-handoff.md`
5. `docs/restaurant-expo-alias-checkpoint-binding-compatibility-implementation-review.md`
6. `docs/restaurant-expo-alias-checkpoint-binding-compatibility-implementation.diff`

The actual future commit and its actual complete source-manifest SHA-256 remain values for a later audited checkpoint review and owner authorization. Authority preparation also verifies at that commit the exact five accepted diagnostic executable hashes and the reviewed execution-proposal hash.

## Fail-closed coverage retained

The implementation rejects:

- any altered parent in the three accepted historical checkpoints;
- any altered historical inventory, committed file hash, source manifest/count, or Restaurant tree;
- a future commit whose parent is not exactly `583579…`;
- any extra, omitted, or substituted future checkpoint file;
- a wrong future source manifest or checked-out HEAD;
- any changed Restaurant application tree;
- any changed accepted diagnostic executable;
- a missing or altered reviewed execution proposal;
- a wrong proposal hash, authorization digest, action list, run, environment, or application tree;
- Development or Production authorization;
- all existing hosted preflight, recapture, rollback, protected-evidence, cleanup, and final-reconciliation failures.

No application runtime, AuthGate, account-preparation operator, database contract, migration, Firebase behavior, Supabase behavior, deployment operator, parity verifier, access qualifier, financial behavior, timeout, retry policy, or hosted state changed.

## Changed-file inventory

| File | SHA-256 |
|---|---|
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `fc70479e57b94fa3640966c105b71e175cd1c193c60fc3dd3fd0cb8dc445fa82` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `b0737ddf8017170ad6cb246e87502a3f367651627bedea6d01a563b77056aa1b` |
| `docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md` | `e19442464a445c044d7cfd4212718edfd016b1af67f8f44aedeb6c399f72ef70` |
| `docs/restaurant-expo-alias-final-execution-readiness-handoff.md` | `c04c9e6d0ad7e4cdd0678451c525ee527ca2fece139237c66ace832936a20b4c` |
| `docs/restaurant-expo-alias-checkpoint-binding-compatibility-implementation.diff` | `66bf47fb8023269cb79ffb90d594232131e242540f4a4d737af6e53ae6ee7494` |
| This implementation review | Calculated and reported externally so the document does not self-reference its own digest |

The complete implementation diff contains the two source/test modifications, the updated execution proposal, and the previously untracked handoff as a new file. It is 565 lines and 43,558 bytes. It intentionally does not contain itself or this review.

## Qualification results

| Check | Result |
|---|---|
| Execution-support suite | PASS — 41/41 |
| Accepted diagnostic suite | PASS — 46/46, including the original 14 legacy verifier cases |
| New lineage acceptance | PASS — all three accepted commits reproduced exactly |
| New lineage rejection | PASS — parent, inventory, committed file, source manifest, and Restaurant-tree drift rejected |
| Future checkpoint gates | PASS — wrong parent, inventory, source manifest, Restaurant tree, executable, proposal, and accepted-lineage evidence rejected |
| Seven executable syntax checks | PASS |
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1 | PASS — 8/8 |
| Responsive UI Phase 2 | PASS — 13/13 |
| Responsive UI Phase 3 | PASS — 14/14 |
| Responsive UI Phase 4 | PASS — 8/8 |
| Responsive UI Phase 5 | PASS — 8/8 |
| Phase 5 Restaurant safeguards | PASS |
| Notification worker | PASS — 11/11 |
| Review repositories | PASS — 6/6 |
| Review UI | PASS — 29/29 |
| Earnings Phase 3 | PASS — 11/11 plus safeguard checker |
| Earnings Phase 4 | PASS — 6/6 plus safeguard checker |
| Earnings Phase 5 safeguards | PASS — 13 checks |
| Phase 7 runner/order flow | PASS — 21/21 |
| Restaurant application tree | PASS — unchanged `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Accepted artifact manifest | PASS — 74 files, `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` |
| Deterministic archive | PASS — `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Protected `ruip6a_20260924b` | PASS — 35/35; manifest `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44` |
| Protected `ruip6a_20260924c` | PASS — 42/42; manifest `85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538` |
| Credential/prohibited-environment scan | PASS — no credential values or new Development/Production execution paths; the only bearer-shaped strings are two unchanged synthetic negative-test fixtures |
| `git diff --check` | PASS |

No test was skipped. One initial local support-suite run exposed an assertion-regex mismatch (`Restaurant application tree changed` versus the narrower expected phrase); the test expectation was corrected without changing production behavior, and the complete suite then passed 41/41.

## Proposed next checkpoint contract

The next action, if separately approved, is one local commit only:

- required parent: `583579463f339dd8178917ebaa5e5cae9347dc5c`;
- exact inventory: the six files listed above;
- no application, backend, configuration, secure evidence, credential, or unrelated file;
- complete source manifest calculated after commit and independently reviewed;
- exact reviewed proposal SHA-256 `e19442464a445c044d7cfd4212718edfd016b1af67f8f44aedeb6c399f72ef70`;
- unchanged Restaurant tree, accepted artifact/archive, five diagnostic executables, and protected evidence;
- suggested commit message: `fix: bind Restaurant alias diagnostic checkpoint lineage`.

After that checkpoint, a separate owner authorization must name its exact commit and source-manifest hashes, exact proposal hash, maintenance window, authorization text/digest, one-deployment/one-promotion limits, rollback authority, and Earnings-disabled boundary. The first hosted action remains `baseline-preflight`; local checkpoint approval alone cannot create an authority or start hosted execution.

## Remaining blocker and boundaries

No implementation defect is known in this compatibility changeset. The mandatory remaining blocker is procedural: the six-file direct-child checkpoint does not yet exist and no owner execution authorization binds it. Consequently, no diagnostic authority file can be truthfully created and no hosted command may run.

No Firebase or Supabase account or data was read or modified during this work. No authority was created or renewed. No Expo deployment, promotion, observation, rollback, Earnings activation, Development/Production access, commit, or push occurred. Phase 6 remains `BLOCKED`.
