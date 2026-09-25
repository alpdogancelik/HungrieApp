# Restaurant Expo/EAS Alias Diagnostic — Final Execution-Readiness Handoff

**Prepared:** 2026-09-25
**Run:** `ruip6ad_20260925a`
**Status:** `BLOCKED — local compatibility correction implemented; audited direct-child checkpoint and owner authorization still required`
**Hosted execution:** Not authorized or performed

## 1. Four-account preparation

The existing protected account-preparation evidence was read locally and independently rechecked without reading or emitting credential values.

| Check | Result |
|---|---|
| Preparation transaction | `PASS` — acknowledged at `2026-09-25T01:20:29.398Z` |
| Independent reconciliation | `PASS` — `AFTER` classification at `2026-09-25T01:20:45.372Z` |
| Run and Restaurant binding | `ruip6ad_20260925a`; `598eacea-dd2a-4549-a198-40593f7fab06` |
| Schema/migration state | Valid schema contract; zero pending migrations |
| Earnings | Disabled |
| Account states | Two active identities, one pending identity, and one globally suspended identity, all bound to the selected Restaurant as planned |
| Authorization versions | Active owner/manager `2`; pending `2`; suspended `7` |
| Reclassification audit | Four records; no recovery record |
| Disposable Customer rows | The five authorized disposable rows are absent after preparation |
| Before-state integrity | Stored SHA-256 equals the current `before-state.json` SHA-256 |
| Evidence protection | Eight evidence files are regular mode-`0600` files |

The secure account file is present at `secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json`. It is a regular mode-`0600` file, is excluded by the repository's `secure/` Git-ignore rule, has exactly the four required roles (`owner`, `manager`, `pending`, and `suspended`), and has a nonempty email and password for each role. No credential value was printed, copied, hashed into this document, or persisted in new evidence.

## 2. Current source, executable, and artifact contracts

| Contract | Current verified value |
|---|---|
| Audited HEAD | `583579463f339dd8178917ebaa5e5cae9347dc5c` |
| Actual parent | `c3180f019de93fae99341628577a9553faad60f7` |
| Sorted source manifest | `fc3e6b5b6b4340bc7da310d2ef9bfca5514cc21756ae4c85db05cde0cf619c22` (1,501 files) |
| Restaurant application tree | `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Accepted artifact manifest | `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` (74 files) |
| Deterministic artifact archive | `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Reviewed proposal file and contract pinned by support code | `e19442464a445c044d7cfd4212718edfd016b1af67f8f44aedeb6c399f72ef70` |

Current executable SHA-256 values:

| Executable | SHA-256 |
|---|---|
| `scripts/restaurant-alias-parity-verifier.mjs` | `e563d7a5203aaf6ea0e04687063d63027568fd2906accec43c26daaeea4ca1d8` |
| `scripts/test-restaurant-alias-parity-verifier.mjs` | `6fa1ce21c047f93678be3c45fb71cd1f0e8167ed142fc259e55efddea1030afb` |
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `a3fe6fb596a6e6aefd17e576beaa2c35a06a19e620e7ab807fbe5a7dc6792ed6` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `d09e43ab5a13a6357da994840f6bdd22730a5118f244f82979468b0f0243b288` |
| `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs` | `9500103b1c54a6c97b1fb126ac0973bb881095d4f81e0e30dc941e7090293c35` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `fc70479e57b94fa3640966c105b71e175cd1c193c60fc3dd3fd0cb8dc445fa82` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `b0737ddf8017170ad6cb246e87502a3f367651627bedea6d01a563b77056aa1b` |

### Compatibility correction and pending checkpoint

The local correction now encodes the complete accepted lineage rather than treating the execution-support base as the immediate authority parent:

1. `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` must remain the exact child of `267b9bc5bbe888431d864963890f73c7092ededc`, with its accepted four-file inventory, file hashes, 1,494-file source manifest, and Restaurant tree.
2. `c3180f019de93fae99341628577a9553faad60f7` must remain the exact child of `1a64f4…`, with its accepted six-file inventory, file hashes, 1,496-file source manifest, and Restaurant tree.
3. `583579463f339dd8178917ebaa5e5cae9347dc5c` must remain the exact child of `c3180f…`, with its accepted five-file inventory, file hashes, 1,501-file source manifest, and Restaurant tree.
4. The future compatibility checkpoint must be the direct child of `583579…` and contain exactly the two support files, this handoff, the execution proposal, and the new compatibility implementation review/diff.
5. Future authorization must bind that actual post-commit SHA-1 and its actual complete source-manifest SHA-256. All five accepted diagnostic executable hashes and the reviewed proposal SHA-256 are independently checked at the future commit.

The correction does not accept an arbitrary descendant. Wrong ancestry, inventory, historical file hash, historical source manifest, Restaurant tree, diagnostic executable, reviewed proposal, future source manifest, authorization digest, or environment remains fail-closed. The current working tree is not itself authorized: one reviewed direct-child checkpoint and a later explicit owner authorization remain mandatory.

## 3. Independent rollback handoff

The backup operator should open a separate terminal before promotion and use the same audited isolated checkout, protected authority, source manifest, and run evidence as the primary operator. These commands are prepared but must not be run until a future owner authorization has created a valid authority and explicitly authorized hosted rollback.

```sh
cd /Users/nurlanildirimli/Hungrie/HungrieApp

RUN_ID=ruip6ad_20260925a
CHECKPOINT=NEXT_COMPATIBILITY_CHECKPOINT
SOURCE_SHA256=NEXT_SOURCE_MANIFEST_SHA256
REPO_ROOT=/Users/nurlanildirimli/Hungrie/HungrieApp
AUTHORITY_FILE="$REPO_ROOT/secure/restaurant-alias-diagnostic-authority/$RUN_ID-authority.json"
SOURCE_MANIFEST="$REPO_ROOT/secure/restaurant-alias-diagnostic-authority/$RUN_ID-source-manifest.tsv"
SOURCE_CHECKOUT="$REPO_ROOT"
DIAGNOSTIC="$REPO_ROOT/scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs"

test "$(git rev-parse HEAD)" = "$CHECKPOINT"
test -f "$AUTHORITY_FILE"
test -f "$SOURCE_MANIFEST"
test -f "$REPO_ROOT/secure/restaurant-alias-diagnostic/$RUN_ID/rollback-reference.json"
```

If the primary process fails after the single promotion attempt, stops with rollback required, or leaves assignment outcome uncertain, execute exactly once:

```sh
node "$DIAGNOSTIC" rollback \
  --environment=staging \
  --authority="$AUTHORITY_FILE" \
  --source-manifest="$SOURCE_MANIFEST" \
  --run-id="$RUN_ID" \
  --expect-commit="$CHECKPOINT" \
  --expect-source-sha256="$SOURCE_SHA256" \
  --source-checkout="$SOURCE_CHECKOUT" \
  --confirm="staging:restaurant-alias-diagnostic:rollback:$RUN_ID"
```

After that command returns successfully, independently verify restoration:

```sh
node "$DIAGNOSTIC" verify-rollback \
  --environment=staging \
  --authority="$AUTHORITY_FILE" \
  --source-manifest="$SOURCE_MANIFEST" \
  --run-id="$RUN_ID" \
  --expect-commit="$CHECKPOINT" \
  --expect-source-sha256="$SOURCE_SHA256" \
  --source-checkout="$SOURCE_CHECKOUT" \
  --confirm="staging:restaurant-alias-diagnostic:verify-rollback:$RUN_ID"
```

The rollback command uses exclusive `rollback-attempt.json` creation, so it must not be repeated after an uncertain response. The backup operator must inspect the protected run directory and coordinate with the primary operator before invoking it. A provider assignment response does not prove restoration. Only `verify-rollback` can establish independent metadata plus exact six-route and complete critical-asset parity against the frozen `6jki82fy0u` reference; it requires two stable complete observations. If rollback or verification is interrupted or uncertain, stop and preserve evidence rather than retrying assignment.

These commands intentionally identify the target through the frozen `rollback-reference.json`; they do not accept an ad hoc deployment ID. The future preflight must independently prove that reference is exactly `6jki82fy0u` before promotion.

## 4. Maintenance window and observation prerequisites

Before local authority creation or the first hosted read, the owner must provide one explicit UTC maintenance window. It must cover immutable deployment and qualification, pre-promotion revalidation, up to 600 seconds of alias observation, and enough time for rollback plus independent verification. Staging users may see mixed, unavailable, or prior-generation content for the full observation period and until rollback verification finishes.

The diagnostic observer permits at most 60 attempt starts at an approximately 10,000 ms polling target. No request may begin at or after the 600,000 ms deadline. Every attempt independently retrieves alias metadata and checks all six HTML routes and five critical assets by exact URL, HTTP status, byte length, expected asset references, and SHA-256. Evidence is persisted before comparison. A diagnostic `PASS` requires an initial complete metadata/content match and two further complete matches, each at least 30 seconds apart, with no intervening regression and all observations completed inside the deadline. Late first convergence that cannot complete stability observations is fail-closed (`INCONCLUSIVE` or `FAIL`) and requires rollback. No automatic deadline extension, promotion retry, or rollback retry is permitted.

Fresh preflight must also prove the exact Staging identities (`rlrfvqskzvpysewdxqcr`, `hungrieapp-a2288`, EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`), alias ID `01a09ada-0ac3-74bf-8361-3c803e655af9`, alias URL `https://hungrie-restaurant--staging.expo.app`, accepted migration `20260924140000` with SHA-256 `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641`, zero pending migrations, Earnings disabled, protected evidence integrity, exact source/artifact identities, rollback target `6jki82fy0u`, and complete rollback content parity. The four real accounts must qualify against the new immutable candidate before the one permitted alias assignment.

## 5. Owner authorization text for review

The following is the final text template. Its only unresolved value is the explicit maintenance window. After replacing that value, the exact UTF-8 bytes become the approval's `authorizationText` and their SHA-256 becomes `authorizationTextSha256`.

> I authorize one Staging-only Restaurant Expo/EAS alias diagnostic for run ruip6ad_20260925a during the UTC maintenance window `<MAINTENANCE_WINDOW_UTC>`. I bind this authorization to audited compatibility checkpoint `<NEXT_COMPATIBILITY_CHECKPOINT>`, source manifest `<NEXT_SOURCE_MANIFEST_SHA256>`, its required parent 583579463f339dd8178917ebaa5e5cae9347dc5c, Restaurant application tree ae03238ac8c34f4ef11365b5a5c51dee81187812, reviewed proposal e19442464a445c044d7cfd4212718edfd016b1af67f8f44aedeb6c399f72ef70, accepted artifact manifest 6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a, and deterministic archive 195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d. I authorize exactly one new immutable Restaurant deployment, immutable artifact and four-account access qualification, exactly one staging alias assignment, the bounded 600-second exact-parity observation, and manifest-scoped finalization. I acknowledge possible mixed or unavailable Staging alias content for up to 600 seconds and until independently verified rollback completes. On FAIL, INCONCLUSIVE, ABORTED, interruption, or uncertain assignment, I authorize exactly one rollback assignment to the frozen deployment 6jki82fy0u and independent exact rollback verification; I am the backup rollback operator. No promotion retry is authorized. Restaurant Earnings must remain disabled. This authorization excludes Development, Production, DNS, backend or migration changes, Firebase identity or password changes, source push, Stage B, Earnings activation, and Phase 6 acceptance.

### Approval JSON review target

This payload is the review template for the future direct-child compatibility checkpoint. It cannot be completed until that checkpoint exists and its complete source manifest has been independently calculated and reviewed. It must not be saved as an authority or used for hosted work before those exact values and the authorization text digest are supplied by a separate owner approval.

```json
{
  "contractVersion": 1,
  "decision": "APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC",
  "approvedForHostedExecution": true,
  "environment": "staging",
  "runId": "ruip6ad_20260925a",
  "proposalSha256": "e19442464a445c044d7cfd4212718edfd016b1af67f8f44aedeb6c399f72ef70",
  "checkpointParent": "583579463f339dd8178917ebaa5e5cae9347dc5c",
  "sourceCommit": "<NEXT_COMPATIBILITY_CHECKPOINT>",
  "sourceManifestSha256": "<NEXT_SOURCE_MANIFEST_SHA256>",
  "applicationTree": "ae03238ac8c34f4ef11365b5a5c51dee81187812",
  "authorizedActions": [
    "export",
    "capture-rollback",
    "deploy",
    "verify-immutable",
    "qualify-immutable-access",
    "promote",
    "observe-alias",
    "rollback",
    "verify-rollback"
  ],
  "authorizedSupportActions": [
    "prepare-authority",
    "baseline-preflight",
    "initialize-resources",
    "begin-deployment",
    "register-deployment",
    "record-deployment-uncertainty",
    "reconcile-deployment",
    "prepare-recapture",
    "verify-recapture",
    "final-preflight",
    "prepare-expected-alias",
    "prepare-cleanup",
    "record-abort",
    "finalize"
  ],
  "authorizationText": "<EXACT_OWNER_AUTHORIZATION_TEXT_AFTER_MAINTENANCE_WINDOW_IS_FILLED>",
  "authorizationTextSha256": "<SHA256_OF_EXACT_AUTHORIZATION_TEXT_UTF8_BYTES>",
  "issuedAt": "2026-09-25T01:24:13Z"
}
```

## 6. Hosted-execution boundary

After this compatibility correction is separately reviewed and checkpointed, the owner supplies the exact maintenance window and exact authorization text/digest, and local `prepare-authority` succeeds, the single action that begins hosted execution is:

```sh
node "$SUPPORT" baseline-preflight "${SARGS[@]}" \
  --confirm="staging:restaurant-alias-support:baseline-preflight:ruip6ad_20260925a"
```

`prepare-authority` is a local gate and does not begin hosted execution. No deployment or alias action may precede a passing `baseline-preflight`. Diagnostic parity success alone does not complete Phase 6; the remaining functional, physical-device, PWA, push, populated Earnings, cleanup, and final acceptance gates remain separate.

No authority file was created, and no hosted read, deployment, alias operation, rollback, account mutation, Firebase/Supabase mutation, Earnings change, commit, or push occurred while preparing this handoff. Phase 6 remains `BLOCKED`.
