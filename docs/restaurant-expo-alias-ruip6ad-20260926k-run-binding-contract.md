# Restaurant Expo alias diagnostic `ruip6ad_20260926k` run-binding contract

**Status:** Local checkpoint contract only; no hosted authority or execution

## Accepted parent

- Parent checkpoint: `041dc3ec4b0f4f1112bc0b052d7b86f59829f59e`
- Parent source-manifest SHA-256: `fcf09671b2b7dcf25acfe7355be24b00cdd1dfd9f2b57406cde367eea60cf5e4`
- Parent source-manifest files: `1559`
- Restaurant tree: `7430599b150adbd19ddafadce1195f1e418daf8a`

The candidate checkpoint must be one direct child of this parent and must contain exactly these seven files:

1. `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs`
2. `scripts/test-restaurant-alias-diagnostic-access-staging.mjs`
3. `scripts/restaurant-alias-diagnostic-execution-support.mjs`
4. `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
5. `docs/restaurant-expo-alias-run-j-suspended-access-finalization-local-correction-report.md`
6. `docs/restaurant-expo-alias-run-j-suspended-access-finalization-local-correction.diff`
7. `docs/restaurant-expo-alias-ruip6ad-20260926k-run-binding-contract.md`

Any other parent, inventory, Restaurant tree, executable identity, or source manifest fails closed.

## Run and artifact identity

- New diagnostic run: `ruip6ad_20260926k`
- Evidence directory: `secure/restaurant-alias-diagnostic/ruip6ad_20260926k`
- Frozen rollback deployment: `6jki82fy0u`
- Artifact manifest: `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89`
- Canonical archive: `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862`
- Public build-input contract: `f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e`
- Access qualifier: `e1b92b167f335961cf41c7eb1e11e941f4c1e9a0a01d5d3d3de58602bfc63504`
- Access qualifier tests: `cde26eaa19597bda32cbe1e4720dca04d0e1f55a9c2bcea0e70d9f95106b8ed2`

Runs `ruip6ad_20260925a` through `ruip6ad_20260926j`, their authorities, markers, mutable evidence, and rejected deployments are excluded from reuse. Run j remains terminal `FAIL` and promotion/deployment retry remains prohibited.

## Pre-authority gate

All local prerequisites, checkpoint lineage, source manifest, executable hashes, artifact/archive, build-input contract, four-account configuration shape, protected evidence, and run-directory exclusivity must pass before requesting fresh export-readiness evidence.

A future read-only EAS export check must use a new exclusive check identity, run the exact EAS-wrapped export twice, and match all 74 files, the artifact manifest, canonical archive, build-input contract, actual candidate checkpoint, and actual source manifest. Diagnostic authority preparation may consume that PASS record only within the existing 30-minute freshness bound. No read-only check or authority is created by this contract.

After fresh evidence passes, the owner must separately approve exact authorization text with a future maintenance window. The authority remains exclusive, single-use, Staging-only, and bound to the actual committed checkpoint and source manifest.

## Recovery and completion boundary

One immutable deployment, one promotion, bounded 600-second observation, and one independently verified rollback are the maximum permitted operations after later authorization. A terminal result cannot reopen deployment or promotion. Diagnostic success does not complete Phase 6, authorize Earnings, or authorize Production.
