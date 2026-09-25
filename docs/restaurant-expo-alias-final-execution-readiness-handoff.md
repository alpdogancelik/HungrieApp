# Restaurant Expo Alias Diagnostic — HTTP 201 Compatibility Handoff

**Status:** LOCAL CORRECTION READY FOR REVIEW; HOSTED EXECUTION NOT AUTHORIZED
**Prepared:** 2026-09-25
**Proposed new run:** `ruip6ad_20260925b`
**Phase 6:** `BLOCKED`

## Preserved aborted run

Run `ruip6ad_20260925a` is terminally `ABORTED`. Its authority must never be retried or reused. No provider deployment, alias promotion, or rollback command ran. These protected mode-`0600` records remain byte-for-byte unchanged:

| File | SHA-256 |
|---|---|
| `baseline-preflight-reads-progress.json` | `1765696fcf38bd0046ec5fcab952027cc7c41795be3a7d5888e96aa376ded39e` |
| `promotion-attempt.json` | `dd5826a9fe3f125ef446cfbcceb541ba0c5a8b764379ef9ea4e5b8a548beb96c` |
| `terminal-record.json` | `1e6d3668670a8482b8b2f13c947b2e63f205d929141f1458fc97abf473060c42` |

The aborted preflight recorded HTTP `201` for all three POST `/v1/projects/{ref}/database/query` calls. Their sanitized bodies independently established the exact applied migration with zero pending migrations, the exact three-function definition/owner/ACL catalog, and `restaurant_earnings_v1` disabled. The Supabase Management API reference documents `201` as the successful response for that endpoint.

## Accepted and proposed identities

| Contract | Value |
|---|---|
| Required parent | `47104d426b3eb36486956f1de1db0aa5e6616393` |
| Parent source manifest | `dbdb7cb8d08c6f0a69397bb7846ade1fad06661950c218c774cf9cb3311d772a` (1,504 files) |
| Future checkpoint | `NEXT_HTTP201_COMPATIBILITY_CHECKPOINT` |
| Future source manifest | `NEXT_SOURCE_MANIFEST_SHA256` |
| Restaurant tree | `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Proposal | `4f07c54d1b6291a3272b242324c3e24eb02b62c84d8cd906b31f1b110fd880d4` |
| Support executable | `8be9d0bce40799f3aa9a75539044959eaa0b6a024e5b7f37c3689c75e539eaf9` |
| Support tests | `fbd3c3af540fd2432eb247b3202a19ed1dfe44e6354dde3e9eef6f2549ecb126` |
| Artifact manifest | `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` |
| Deterministic archive | `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Frozen rollback deployment | `6jki82fy0u` |

The future checkpoint must be a direct child of `47104d426b3eb36486956f1de1db0aa5e6616393` and contain exactly the two support files, the proposal, this handoff, and the HTTP 201 implementation review/diff. It must retain the five accepted diagnostic executable hashes and the Restaurant tree.

## Correction contract

HTTP `201` is accepted only for the three named Supabase SQL observations: `supabase-migrations`, `supabase-function-catalog`, and `supabase-earnings-capability`. Each call still uses the exact Staging project endpoint, POST method, and read-only transaction SQL. A successful transport status is insufficient: the response must be an array, persist with an exact payload digest and unique request identity, and pass every existing migration, pending-count, function-definition, owner, security-definer, volatility, configuration, ACL, Earnings-disabled, freshness, environment, and identity assertion.

The Supabase project GET, Firebase project GET, Expo alias metadata POST, provider reconciliation, HTML, and asset observations remain under their existing status contracts. This correction does not globally accept HTTP `201`.

## Four-account state

The four prepared Staging accounts and their independently reconciled preparation evidence remain valid and unchanged. The existing credential file remains at `secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json`, mode `0600`, Git-ignored, with exactly the approved owner, manager, pending, and suspended entries. No credential value appears in this handoff. A later authorized run may reference this existing file read-only after verifying its shape and permissions.

## Remaining execution boundary

Before any further hosted read, the owner must approve a newly audited direct-child checkpoint, a fresh `ruip6ad_20260925b` authority, and a current UTC maintenance window. The run requires a new empty evidence directory and new source-manifest/authority artifacts. It may create exactly one new immutable deployment and attempt exactly one alias promotion. It must keep Earnings disabled and preserve independent rollback to `6jki82fy0u`.

The single hosted action that would begin the new run, only after that separate approval and successful local authority creation, is:

```sh
node scripts/restaurant-alias-diagnostic-execution-support.mjs baseline-preflight \
  --authority="secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925b-authority.json" \
  --source-manifest="secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925b-source-manifest.tsv" \
  --expect-commit="NEXT_HTTP201_COMPATIBILITY_CHECKPOINT" \
  --expect-source-sha256="NEXT_SOURCE_MANIFEST_SHA256" \
  --confirm="staging:restaurant-alias-support:baseline-preflight:ruip6ad_20260925b"
```

No authority file exists for the new run. No hosted execution is authorized by this document. Diagnostic success would not constitute Phase 6 acceptance.
