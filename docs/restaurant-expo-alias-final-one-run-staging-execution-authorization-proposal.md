# Restaurant Expo/EAS Alias Diagnostic — Final One-Run Staging Execution Authorization Proposal

**Status:** OWNER EXECUTION AUTHORIZATION NOT GRANTED
**Prepared:** 2026-09-25
**Run:** `ruip6ad_20260925b`
**Phase 6:** `BLOCKED`

This proposal is preparation only. It does not authorize authentication, hosted reads, export, deployment, alias assignment, observation, rollback, or cleanup. It requires one audited local compatibility checkpoint that is a direct child of the accepted checkpoint-binding checkpoint before an owner may authorize the run.

## 1. Fixed lineage and unresolved compatibility-checkpoint values

| Checkpoint | Required parent | Source manifest | Committed scope |
|---|---|---|---|
| Execution-support base `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` | `267b9bc5bbe888431d864963890f73c7092ededc` | `8449af0cf852d22154392525d1e2cca5c78461036667065f1f9ec4662c85e059` (1,494 files) | Exact accepted four-file execution-support inventory and hashes |
| Readiness checkpoint `c3180f019de93fae99341628577a9553faad60f7` | `1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92` | `89709da5fb1609b706fae69d41a200dd6914415f65a2ae31007806141a86c12b` (1,496 files) | Exact accepted six-file readiness inventory and hashes |
| Account-preparation checkpoint `583579463f339dd8178917ebaa5e5cae9347dc5c` | `c3180f019de93fae99341628577a9553faad60f7` | `fc3e6b5b6b4340bc7da310d2ef9bfca5514cc21756ae4c85db05cde0cf619c22` (1,501 files) | Exact accepted five-file account-preparation inventory and hashes |
| Checkpoint-binding checkpoint `47104d426b3eb36486956f1de1db0aa5e6616393` | `583579463f339dd8178917ebaa5e5cae9347dc5c` | `dbdb7cb8d08c6f0a69397bb7846ade1fad06661950c218c774cf9cb3311d772a` (1,504 files) | Exact accepted six-file checkpoint-binding inventory and hashes |
| Future HTTP 201 compatibility checkpoint `NEXT_COMPATIBILITY_CHECKPOINT` | `47104d426b3eb36486956f1de1db0aa5e6616393` | `NEXT_SOURCE_MANIFEST_SHA256` | Exact six-file HTTP compatibility inventory defined below |

Every checkpoint must retain Restaurant tree `ae03238ac8c34f4ef11365b5a5c51dee81187812`. The accepted artifact manifest is `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` (74 files), and the deterministic archive is `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d`.

The future compatibility checkpoint must contain exactly:

- `scripts/restaurant-alias-diagnostic-execution-support.mjs`
- `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
- `docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md`
- `docs/restaurant-expo-alias-final-execution-readiness-handoff.md`
- `docs/restaurant-expo-alias-supabase-http201-compatibility-implementation-review.md`
- `docs/restaurant-expo-alias-supabase-http201-compatibility-implementation.diff`

The aborted `ruip6ad_20260925a` authority and evidence are immutable and must never be retried or reused. The new run has a new authority, source manifest, run directory, maintenance window, and explicit owner authorization.

Its owner authorization must bind the actual post-commit SHA-1, the actual complete source-manifest SHA-256, and the final reviewed SHA-256 of this proposal. The following values remain unresolved until that commit is reviewed: `NEXT_COMPATIBILITY_CHECKPOINT`, `NEXT_SOURCE_MANIFEST_SHA256`, the final reviewed proposal SHA-256, the authorization text/digest, the UTC maintenance window, and the new provider deployment ID/URL. No hosted command may run while any required value remains unresolved.

The run ID is `ruip6ad_20260925b`, its evidence directory is `secure/restaurant-alias-diagnostic/ruip6ad_20260925b`, and the frozen rollback deployment is `6jki82fy0u`.

Approved Staging identities are exact:

- Supabase: `rlrfvqskzvpysewdxqcr`
- shared non-production Firebase: `hungrieapp-a2288`
- Restaurant EAS project: `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`
- alias ID: `01a09ada-0ac3-74bf-8361-3c803e655af9`
- alias name: `staging`
- alias URL: `https://hungrie-restaurant--staging.expo.app`
- migration: `20260924140000`, SHA-256 `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641`
- `restaurant_earnings_v1`: disabled

Development, Production, DNS, backend changes, migrations, financial activation, fixture creation, source push, and Phase 6 acceptance are excluded.

## 2. Exact future owner authorization contract

A future approval must explicitly authorize one run, one immutable deployment attempt, one promotion attempt, and one independently executable rollback attempt. It must acknowledge up to 600 seconds of possible mixed or unavailable Staging alias content and must state that Earnings remains disabled.

The approval JSON must contain only:

```json
{
  "contractVersion": 1,
  "decision": "APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC",
  "approvedForHostedExecution": true,
  "environment": "staging",
  "runId": "ruip6ad_20260925b",
  "proposalSha256": "FINAL_REVIEWED_PROPOSAL_SHA256",
  "checkpointParent": "47104d426b3eb36486956f1de1db0aa5e6616393",
  "sourceCommit": "NEXT_COMPATIBILITY_CHECKPOINT",
  "sourceManifestSha256": "NEXT_SOURCE_MANIFEST_SHA256",
  "applicationTree": "ae03238ac8c34f4ef11365b5a5c51dee81187812",
  "authorizedActions": [
    "export", "capture-rollback", "deploy", "verify-immutable",
    "qualify-immutable-access", "promote", "observe-alias", "rollback", "verify-rollback"
  ],
  "authorizedSupportActions": [
    "prepare-authority", "baseline-preflight", "initialize-resources", "begin-deployment",
    "register-deployment", "record-deployment-uncertainty", "reconcile-deployment",
    "prepare-recapture", "verify-recapture", "final-preflight", "prepare-expected-alias",
    "prepare-cleanup", "record-abort", "finalize"
  ],
  "authorizationText": "EXACT_OWNER_TEXT",
  "authorizationTextSha256": "SHA256_OF_EXACT_OWNER_TEXT_BYTES",
  "issuedAt": "UTC_TIMESTAMP"
}
```

`NEXT_COMPATIBILITY_CHECKPOINT` must be a direct child of `47104d…`, contain only the six files listed in section 1, reproduce the owner-approved complete source manifest, retain the Restaurant tree, preserve the accepted diagnostic executable hashes, and pass exact verification of every earlier lineage checkpoint. The authorization text must name the run, Staging, exact final proposal hash, checkpoint, source manifest, maintenance window, rollback, one-deployment/one-promotion limits, mixed-content risk, and Earnings-disabled boundary.

## 3. Credentials and local prerequisites

Credentials are read only after future authorization from:

- `secure/supabase-projects.local.json`
- `secure/supabase-cli-hungrie/access-token`
- `secure/phase7/operator-config.json` and its non-production Firebase credential
- `~/.expo/state.json`
- mode-`0600`, Git-excluded existing `secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json`

The accounts file must have exactly nonempty `pending`, `suspended`, `owner`, and `manager` email/password objects. Credentials, tokens, cookies, authorization headers, and credential-bearing bodies must never be persisted.

Before authority creation require: a clean isolated checkout at the future checkpoint; an empty run directory; current UTC maintenance window; primary and independent rollback operators; exact executable hashes from the future checkpoint review; protected evidence 35/35 and 42/42; exact artifact/archive; no prohibited environment identifiers; and a secure accounts file. Any failure is `ABORTED` before hosted access.

## 4. Common variables and arguments

After future owner authorization only:

```sh
RUN_ID=ruip6ad_20260925b
CHECKPOINT=NEXT_COMPATIBILITY_CHECKPOINT
SOURCE_SHA256=NEXT_SOURCE_MANIFEST_SHA256
REPO_ROOT=/absolute/path/to/audited/checkout
AUTHORITY_DIR="$REPO_ROOT/secure/restaurant-alias-diagnostic-authority"
AUTHORITY_FILE="$AUTHORITY_DIR/$RUN_ID-authority.json"
SOURCE_MANIFEST="$AUTHORITY_DIR/$RUN_ID-source-manifest.tsv"
ACCOUNTS_FILE="$AUTHORITY_DIR/ruip6ad_20260925a-accounts.json"
RUN_DIR="$REPO_ROOT/secure/restaurant-alias-diagnostic/$RUN_ID"
SOURCE_CHECKOUT=/absolute/path/to/isolated/audited/checkout
CHROME_PATH=/absolute/path/to/approved/Chrome
DIAGNOSTIC="$REPO_ROOT/scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs"
ACCESS="$REPO_ROOT/scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs"
SUPPORT="$REPO_ROOT/scripts/restaurant-alias-diagnostic-execution-support.mjs"
```

Common diagnostic arguments:

```sh
DARGS=(--environment=staging --authority="$AUTHORITY_FILE" --source-manifest="$SOURCE_MANIFEST" --run-id="$RUN_ID" --expect-commit="$CHECKPOINT" --expect-source-sha256="$SOURCE_SHA256" --source-checkout="$SOURCE_CHECKOUT")
SARGS=(--authority="$AUTHORITY_FILE" --source-manifest="$SOURCE_MANIFEST" --expect-commit="$CHECKPOINT" --expect-source-sha256="$SOURCE_SHA256")
```

Authority creation is local and exclusive:

```sh
node "$SUPPORT" prepare-authority --approval="$APPROVAL_FILE" --output="$AUTHORITY_DIR"
```

## 5. Exact one-run operation order

Every support action uses `--confirm=staging:restaurant-alias-support:<action>:$RUN_ID`. Every diagnostic action uses `--confirm=staging:restaurant-alias-diagnostic:<action>:$RUN_ID`. No command is repeated automatically.

1. **Baseline preflight**

   ```sh
   node "$SUPPORT" baseline-preflight "${SARGS[@]}" --confirm="staging:restaurant-alias-support:baseline-preflight:$RUN_ID"
   ```

   It must persist six independent reads and pass exact project, alias, migration, function/ACL, Earnings-disabled, source/artifact, and protected-evidence checks. Supabase project, Firebase project, and Expo alias reads remain HTTP 200-only. The three exact POST `/v1/projects/{ref}/database/query` SQL observations may be HTTP 200 or the endpoint-documented HTTP 201, but only with the complete expected array/body shape and every existing semantic assertion passing. Alias metadata must equal `6jki82fy0u`; otherwise stop for owner review.

2. **Initial rollback capture**

   ```sh
   node "$DIAGNOSTIC" capture-rollback "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:capture-rollback:$RUN_ID"
   ```

   Require six exact route pairs and exactly five discovered critical assets. Any other asset cardinality aborts this diagnostic before promotion.

3. **Export fixed artifact**

   ```sh
   node "$DIAGNOSTIC" export "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:export:$RUN_ID"
   ```

4. **Initialize the empty resource inventory, then reserve the only deployment attempt**

   ```sh
   node "$SUPPORT" initialize-resources "${SARGS[@]}" --confirm="staging:restaurant-alias-support:initialize-resources:$RUN_ID"
   node "$SUPPORT" begin-deployment "${SARGS[@]}" --confirm="staging:restaurant-alias-support:begin-deployment:$RUN_ID"
   ```

   `deployment-attempt.json` is exclusive and is created before invoking the provider. It permanently prevents a second deployment in this run.

5. **Invoke exactly one immutable deployment**

   ```sh
   node "$DIAGNOSTIC" deploy "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:deploy:$RUN_ID"
   ```

   On a clear successful response, immediately register the exact provider evidence:

   ```sh
   node "$SUPPORT" register-deployment "${SARGS[@]}" --confirm="staging:restaurant-alias-support:register-deployment:$RUN_ID"
   ```

   On a timeout, parse failure, interrupted response, or any uncertain outcome, do not deploy again. Record uncertainty:

   ```sh
   node "$SUPPORT" record-deployment-uncertainty "${SARGS[@]}" --reason="REVIEWED_SANITIZED_REASON" --confirm="staging:restaurant-alias-support:record-deployment-uncertainty:$RUN_ID"
   ```

   A separately authorized, independent, sanitized provider deployment-list observation may then be consumed once with:

   ```sh
   node "$SUPPORT" reconcile-deployment "${SARGS[@]}" --observation="$RUN_DIR/provider-deployment-reconciliation.json" --confirm="staging:restaurant-alias-support:reconcile-deployment:$RUN_ID"
   ```

   Zero or multiple correlated deployments remains non-passing. Every observed ambiguous deployment is retained as unexpected evidence. No identifier is invented.

6. **Immutable parity and real access qualification**

   ```sh
   node "$DIAGNOSTIC" verify-immutable "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:verify-immutable:$RUN_ID"
   node "$ACCESS" "${DARGS[@]}" --accounts="$ACCOUNTS_FILE" --chrome="$CHROME_PATH" --confirm="staging:restaurant-alias-diagnostic:qualify-immutable-access:$RUN_ID"
   ```

   Require exact six-route/five-asset artifact parity and passing real pending, suspended, owner, and manager cases bound to the same candidate.

7. **Preserve history and perform one fresh rollback recapture**

   ```sh
   node "$SUPPORT" prepare-recapture "${SARGS[@]}" --confirm="staging:restaurant-alias-support:prepare-recapture:$RUN_ID"
   node "$DIAGNOSTIC" capture-rollback "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:capture-rollback:$RUN_ID"
   node "$SUPPORT" verify-recapture "${SARGS[@]}" --confirm="staging:restaurant-alias-support:verify-recapture:$RUN_ID"
   ```

   `prepare-recapture` first creates an exclusive durable attempt, then copies and hashes the historical canonical files, quarantines reference and progress separately, and stops at `READY_FOR_RECAPTURE`. Any interruption blocks final preflight. `verify-recapture` requires new canonical bytes, matching completion timestamps, `6jki82fy0u`, six routes, exactly five assets, unchanged history/quarantine, and fresh timestamps. Recapture is never retried automatically.

8. **Final fail-closed promotion preflight**

   ```sh
   node "$SUPPORT" final-preflight "${SARGS[@]}" --confirm="staging:restaurant-alias-support:final-preflight:$RUN_ID"
   ```

   It consumes the exact verified fresh-recapture hashes and the exact one-deployment resource inventory. Missing, interrupted, stale, altered, duplicated, differently bound, or incomplete evidence prevents promotion.

9. **Exactly one alias assignment**

   ```sh
   node "$DIAGNOSTIC" promote "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:promote:$RUN_ID"
   ```

   The accepted diagnostic operator performs an immediate independent rollback recheck before creating its exclusive promotion marker and invoking the provider once. A pre-promotion blocking marker with `providerCommandInvoked:false` is not a provider assignment. An uncertain provider response is an attempted assignment and requires rollback. No promotion retry is permitted.

10. **Bounded observer**

    ```sh
    node "$DIAGNOSTIC" observe-alias "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:observe-alias:$RUN_ID"
    ```

    Maximum 60 starts, approximately 10 seconds apart, no start at or after 600 seconds. Every attempt independently records alias metadata, six HTML routes, five assets, status, requested/final URL, bytes, SHA-256, cache/CDN headers, CF-Ray, and timing before comparison. PASS requires one complete observation and two further complete observations at least 30 seconds apart with no regression. Late success without room for stability is INCONCLUSIVE. Partial, mixed, failed, regressed, or timed-out observations fail closed.

11. **Terminal classification and mandatory rollback**

    If promotion was attempted, rollback is required after PASS, FAIL, INCONCLUSIVE, ABORTED, interruption, or uncertain assignment. When observation is non-PASS or a promoted path fails, record the terminal result once before recovery when possible:

    ```sh
    node "$SUPPORT" record-abort "${SARGS[@]}" --classification=FAIL --reason="REVIEWED_SANITIZED_REASON" --confirm="staging:restaurant-alias-support:record-abort:$RUN_ID"
    ```

    Then invoke rollback exactly once:

    ```sh
    node "$DIAGNOSTIC" rollback "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:rollback:$RUN_ID"
    node "$DIAGNOSTIC" verify-rollback "${DARGS[@]}" --confirm="staging:restaurant-alias-diagnostic:verify-rollback:$RUN_ID"
    ```

    Provider success is not restoration proof. Exact metadata, six-route, and five-asset parity is required independently. If rollback response is uncertain, do not retry; retain the marker and run the final independent alias verifier through finalization. Any further recovery mutation requires separate owner authorization.

12. **Expected final alias, manifest-scoped cleanup, final reconciliation**

    ```sh
    node "$SUPPORT" prepare-expected-alias "${SARGS[@]}" --confirm="staging:restaurant-alias-support:prepare-expected-alias:$RUN_ID"
    node "$SUPPORT" prepare-cleanup "${SARGS[@]}" --confirm="staging:restaurant-alias-support:prepare-cleanup:$RUN_ID"
    node "$SUPPORT" finalize "${SARGS[@]}" --expected="$RUN_DIR/expected-final-alias-reference.json" --cleanup="$RUN_DIR/cleanup-disposition.json" --confirm="staging:restaurant-alias-support:finalize:$RUN_ID"
    ```

    The expected alias is built from the verified fresh rollback reference and, on a normal promoted path, exact recorded rollback verification. Cleanup must match the atomic resource inventory exactly; the immutable provider deployment is explicitly `retained-provider-record`. No unverified deletion is accepted. Finalization independently checks hosted state, exact alias parity, protected evidence, credentials, mandatory files, cleanup, and writes a sorted evidence manifest. An interrupted finalization never creates PASS and may resume only with the same immutable expected/cleanup hashes.

## 6. Classifications and stop conditions

- **PASS:** the diagnostic observer achieved three stable complete observations, mandatory rollback then independently restored `6jki82fy0u`, cleanup reconciled exactly, and final reconciliation passed. This is diagnostic PASS only.
- **FAIL:** exact parity failed, stability regressed, protected evidence or credentials failed, rollback verification failed, or final alias parity failed.
- **INCONCLUSIVE:** the deadline prevented required stability observations or a provider outcome could not be resolved safely.
- **ABORTED:** a prerequisite, identity, freshness, source, maintenance-window, or unexpected-state gate stopped the run.

Stop immediately on wrong environment, alias drift, Earnings enabled, pending migrations, protected-evidence mismatch, rejected candidate, asset cardinality other than five, missing account, second-attempt marker, incomplete access qualification, recapture interruption, stale final preflight, observer anomaly, cleanup mismatch, or credential-shaped persistent evidence. Never broaden cleanup or retry deployment, promotion, recapture, or rollback.

## 7. Evidence contract

Mandatory evidence includes authority/source manifests; baseline and final hosted read progress; initial and fresh rollback capture/progress; historical and quarantine copies; fresh recapture attempt/verification; artifact/archive manifest; deployment attempt and atomic resource inventory history; immutable deployment/smoke; access qualification/screenshots; promotion preflight/recheck/attempt/result; every observer attempt; terminal record where applicable; rollback attempt/result/verification; expected final alias; cleanup disposition; finalization reads/parity/reconciliation; and sorted evidence manifest.

All JSON is atomic mode `0600`. Exclusive attempt files are never overwritten. Protected evidence 35/35 and 42/42 is reverified before and after. Persistent evidence is scanned for bearer tokens, JWTs, private keys, cookies, passwords, sessions, API keys, and authorization values.

## 8. External prerequisites and approval boundary

Before execution the owner must separately approve: the audited child checkpoint and source manifest; final proposal hash; maintenance window and exposure; four real non-production accounts; exact authority text/JSON; and the one-run hosted actions above. Any provider read used to reconcile an uncertain deployment also requires explicit read authorization if it was not part of the original run authorization.

Alias diagnostic PASS does not complete Phase 6. Functional, responsive, accessibility, performance, physical-device, Safari/PWA, push, and populated Earnings qualification remain separate. Earnings stays disabled. Phase 6 remains `BLOCKED`.
