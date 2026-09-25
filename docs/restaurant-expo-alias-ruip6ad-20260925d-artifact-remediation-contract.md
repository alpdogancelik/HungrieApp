# Restaurant Expo alias diagnostic artifact remediation contract

**Status:** Local review only; this is not hosted execution authority
**Proposed run:** `ruip6ad_20260925d`
**Required parent:** `0612be3f72ff3792321c74cfad6540900fa3a4c2`
**Restaurant tree:** `ae03238ac8c34f4ef11365b5a5c51dee81187812`

## Artifact identity

The accepted historical artifact remains preserved as evidence. It is not reproducible by the reviewed export command because its Metro asset paths embed the old absolute workspace path. Two independent exports using the exact reviewed public build inputs produced the same 74 files byte-for-byte.

The proposed candidate artifact contract is:

- 74 complete files.
- Artifact inventory SHA-256: `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae`.
- Deterministic archive SHA-256: `952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135`.
- Six required HTML qualification routes.
- Five critical JavaScript/CSS assets.
- Required `manifest.webmanifest`, `sw.js`, and `firebase-config.js` runtime files.
- Both fixed external Firebase runtime dependencies.

The complete inventory, old/new comparison, and deterministic archive are in `docs/restaurant-expo-alias-artifact-remediation-evidence/`. Immutable verification must compare all 74 published files, route references, five critical assets, PWA runtime files, and external runtime dependencies against this fixed evidence.

## Run isolation

Runs `ruip6ad_20260925a`, `ruip6ad_20260925b`, and `ruip6ad_20260925c` are aborted and immutable. Their authorities, attempt markers, and mutable evidence cannot be imported or reused. A future `ruip6ad_20260925d` authority must bind the actual reviewed direct-child checkpoint, source manifest, this contract digest, and its own exclusive evidence directory.

The required direct-child checkpoint inventory is fixed by execution support. It includes the narrowly changed executable/tests plus this contract, the complete artifact evidence, the consolidated review, and the complete implementation diff. The Restaurant application tree must remain unchanged.

## Authorization boundary

No authority exists for the proposed run. No hosted read or mutation may start until the owner reviews the completed checkpoint, actual source manifest, maintenance window, rollback handoff, and exact authorization text and JSON. Earnings remains disabled. Phase 6 remains blocked.
