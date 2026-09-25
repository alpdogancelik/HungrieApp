# Restaurant Expo alias diagnostic `ruip6ad_20260925c` execution contract

**Status:** Local contract only; hosted execution requires separate explicit owner authorization
**Required parent:** `5533606a841e9a7d75b2a3e22ef672bd107fa5d8`
**Restaurant tree:** `ae03238ac8c34f4ef11365b5a5c51dee81187812`
**Rollback deployment:** `6jki82fy0u`
**Aborted runs:** `ruip6ad_20260925a` and `ruip6ad_20260925b` are immutable and prohibited from reuse

## Checkpoint contract

The executable authority may accept exactly one direct-child checkpoint of the required parent. That checkpoint must contain exactly these ten files:

1. `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs`
2. `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs`
3. `scripts/restaurant-alias-diagnostic-execution-support.mjs`
4. `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
5. `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs`
6. `scripts/test-restaurant-alias-diagnostic-access-staging.mjs`
7. `docs/restaurant-expo-alias-diagnostic-remediation-implementation-review.md`
8. `docs/restaurant-expo-alias-diagnostic-remediation-implementation.diff`
9. `docs/restaurant-expo-alias-diagnostic-remediated-execution-contract.md`
10. `docs/restaurant-expo-alias-ruip6ad-20260925c-execution-contract.md`

The owner authorization must name the actual checkpoint and its complete sorted source-manifest SHA-256. Execution support independently requires the exact parent, inventory, source manifest, Restaurant tree, accepted lineage, executable hashes, this contract digest, Staging identities, action lists, maintenance window, and authorization-text digest.

## One-run boundaries

The run owns a new authority record, source manifest, evidence directory, rollback capture, attempt markers, and resource inventory. It permits at most one immutable deployment attempt, one alias assignment, and one rollback assignment. It never imports an authority, attempt marker, mutable reference, resource inventory, or evidence path from either aborted run.

The complete seven-finding remediation contract remains mandatory: deployment-derived three-asset rollback parity; separately fixed five-asset candidate parity; all 74 artifact files and PWA dependencies; four real access states with browser/runtime failure detection; deployment reservation at the provider command boundary; independent read-only uncertain-deployment evidence; executable maintenance-window limits; and exclusive interruption-safe rollback capture.

No Development or Production access, account mutation, Firebase identity mutation, backend change, Earnings activation, source push, deployment retry, promotion retry, or rollback retry is authorized.

## Authorization boundary

This file is not an authority. Hosted work may start only after the owner reviews the actual checkpoint, source manifest, final authorization proposal, UTC maintenance window, exposure risk, rollback handoff, and approval JSON, then provides the exact authorization text. Authority creation remains a separate action after that approval.
