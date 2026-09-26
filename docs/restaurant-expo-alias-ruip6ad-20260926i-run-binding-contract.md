# Restaurant Expo alias diagnostic `ruip6ad_20260926i` run-binding contract

**Status:** Local binding only; no authority or maintenance window exists
**Required parent:** `a93735ede9be8e8177e7034afdf9f19b3c176c3d`
**Parent source manifest:** `96916aff299d24d367b637c41ce3094e440f69db06c6dd5c192b368f43f561e6` (1,533 files)
**Restaurant tree:** `ae03238ac8c34f4ef11365b5a5c51dee81187812`

## Local dependency gate

Authority preparation must first pass the local diagnostic prerequisite verifier. It requires the lockfile-defined Functions installation, package-scoped resolution of `firebase-admin/app`, the required Firebase Admin lifecycle exports, `firebase-functions`, Node fetch and WebSocket support, Node 22 or newer, and the local Chrome executable. A missing or mismatched prerequisite fails before approval is read and before authority, source-manifest, evidence, or hosted-attempt files can be created.

The Functions dependencies remain exactly `firebase-admin` 13.8.0 and `firebase-functions` 7.2.5 from `functions/package-lock.json`. The diagnostic must resolve `firebase-admin/app` using a `createRequire` anchored at `functions/package.json`; absolute package-subpath resolution is prohibited.

## Candidate and recovery identities

- Candidate artifact manifest: `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae`.
- Canonical archive: `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d`.
- Publication contract: 74 local files, comprising 73 public files plus applied `_expo/.routes.json` routing-control semantics.
- Frozen rollback deployment: `6jki82fy0u`, with six routes, its deployment-derived three assets, three runtime files, and two external runtime assets.
- Staging Supabase: `rlrfvqskzvpysewdxqcr`.
- Shared non-production Firebase: `hungrieapp-a2288`.
- Restaurant EAS project: `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`.
- Alias ID/name: `01a09ada-0ac3-74bf-8361-3c803e655af9` / `staging`.

## Exact checkpoint scope

The future direct-child checkpoint contains exactly:

1. `scripts/restaurant-alias-diagnostic-execution-support.mjs`
2. `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
3. `docs/restaurant-expo-alias-firebase-admin-dependency-correction-report.md`
4. `docs/restaurant-expo-alias-firebase-admin-dependency-correction.diff`
5. `docs/restaurant-expo-alias-ruip6ad-20260926i-run-binding-contract.md`

Authority preparation must reproduce the actual direct-child commit, this five-file inventory, its complete source manifest, this contract digest, all accepted lineage entries, accepted diagnostic executable hashes, the canonical artifact/archive, and the unchanged Restaurant tree.

## Isolation and authorization

Runs `ruip6ad_20260925a` through `ruip6ad_20260925e` and `ruip6ad_20260926f` through `ruip6ad_20260926h` are immutable and prohibited from reuse. Run i requires a new exclusive authority, source-manifest copy, evidence directory, rollback reference, resource inventory, and one-attempt markers. Rejected deployments remain rejected.

No maintenance window is selected. This contract does not authorize authority creation or any hosted read or mutation. Earnings remains disabled and Phase 6 remains blocked.
