# Restaurant Expo alias diagnostic `ruip6ad_20260926j` run-binding contract

**Status:** Local binding only; no diagnostic authority, read-only EAS authorization, or maintenance window exists
**Required parent:** `a1cf25b443441d424259af2568ced55b00d5560a`
**Parent source manifest:** `a2e022bdbbc494f9125c23b7f72cc784a4a37a0ac8d3f1e897388e24bc81e052` (1,536 files)
**Restaurant tree:** `7430599b150adbd19ddafadce1195f1e418daf8a`

## Fixed candidate

- Artifact manifest: `7ca81f0fdbc649e34a929956329bcaafc95ec357c84f342a01f2a0dab2836431`.
- Canonical archive: `dd416dd5f44a4f3dbb3443f7269c61f4d964fe3e3e4de3b38d873db553e183cb`.
- Publication contract: 74 local files, 73 public files, and applied `_expo/.routes.json` routing-control semantics.
- Metro module identities: reviewed UTF-8-sorted 2,560-entry map with compact index IDs and fail-closed unknown-module handling.
- Frozen rollback deployment: `6jki82fy0u`; its six routes and deployment-derived three-asset contract remain separate from the five-asset candidate contract.

## Mandatory separate read-only EAS export gate

Diagnostic authority preparation may not execute the EAS environment check. It must consume a fresh passing evidence record created by the standalone read-only operator.

The read-only check requires separate explicit owner authorization bound to the actual checkpoint and source manifest. It executes exactly twice:

```text
npx eas-cli@16.32.0 env:exec preview "npm run prepare:web && npx expo export --platform web --clear" --non-interactive
```

It may read only EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1` environment `preview`. It may not create a deployment, diagnostic authority, diagnostic attempt marker, alias assignment, rollback, fixture, or mutation. Evidence is written exclusively beneath `secure/restaurant-alias-export-readiness/<check-id>/`, separately from every historical diagnostic run. Both observations must contain the exact same 74-file inventory, artifact manifest, and canonical archive. Passing evidence expires after 30 minutes for diagnostic authority preparation.

## Staging identities

- Supabase: `rlrfvqskzvpysewdxqcr`.
- Shared non-production Firebase: `hungrieapp-a2288`.
- Restaurant EAS project: `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`.
- Alias: `01a09ada-0ac3-74bf-8361-3c803e655af9` / `staging`.
- Earnings must remain disabled.

## Exact future checkpoint inventory

The direct-child checkpoint contains exactly these 16 files:

1. `apps/restaurant/metro.config.js`
2. `apps/restaurant/scripts/deterministic-metro-module-ids.cjs`
3. `apps/restaurant/scripts/deterministic-metro-module-map.json`
4. `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs`
5. `scripts/restaurant-alias-diagnostic-execution-support.mjs`
6. `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs`
7. `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
8. `scripts/test-restaurant-deterministic-metro-module-ids.mjs`
9. `scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs`
10. `scripts/verify-restaurant-alias-production-export-readiness.mjs`
11. `docs/restaurant-expo-alias-deterministic-metro-export-remediation-review.md`
12. `docs/restaurant-expo-alias-deterministic-metro-evidence/candidate-artifact-manifest.json`
13. `docs/restaurant-expo-alias-deterministic-metro-evidence/complete-artifact-comparison.json`
14. `docs/restaurant-expo-alias-deterministic-metro-evidence/evidence-manifest.tsv`
15. `docs/restaurant-expo-alias-deterministic-metro-evidence/restaurant-static-export.tar`
16. `docs/restaurant-expo-alias-ruip6ad-20260926j-run-binding-contract.md`

The actual commit and complete source-manifest SHA-256 are unknown until this exact checkpoint is created. Subsequent authorization must bind those actual values. Wrong parent, inventory, source manifest, Restaurant tree, contract digest, artifact, archive, executable hash, run ID, or historical lineage fails closed.

## Isolation

Runs `ruip6ad_20260925a` through `ruip6ad_20260925e` and `ruip6ad_20260926f` through `ruip6ad_20260926i` remain immutable and prohibited from reuse. Run j requires its own diagnostic authority, evidence directory, rollback evidence, resource inventory, and one-attempt markers after the separate read-only export gate passes.

This contract authorizes no hosted read or mutation. It does not authorize the read-only EAS check, diagnostic authority creation, deployment, alias action, rollback, Earnings activation, or Phase 6 acceptance.
