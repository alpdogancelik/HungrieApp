# Restaurant Staging Public Build-Input Read-Only EAS Export Check

**Status:** Plan only; no authority exists and no hosted request is authorized
**Proposed check ID:** `ruip6ae_20260926l`
**Environment:** EAS `preview` for Staging only
**EAS project:** `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`
**Build-input contract:** `f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e`
**Candidate manifest:** `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89`
**Canonical archive:** `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862`

## Purpose

This separately authorized read-only check establishes that the actual EAS `preview` environment injects the nine reviewed Restaurant public build inputs and that two clean executions of the production diagnostic export reproduce the reviewed 74-file artifact and canonical USTAR archive. It cannot deploy, create a diagnostic attempt, assign an alias, roll back, modify an account, or mutate hosted state.

## Preconditions

A future audited direct-child checkpoint must bind its actual commit, source-manifest SHA-256, unchanged Restaurant tree, this plan, the build-input contract, candidate manifest, canonical archive, and the executable hashes. A fresh owner authorization must name `ruip6ae_20260926l`, reproduce those exact identities, contain the exact authorization-text digest, and be valid for at most two hours. The secure authority and source-manifest files must not exist before issuance. All prior check and diagnostic authority/evidence directories remain immutable and excluded from reuse.

## Exact command

The check operator invokes this command exactly twice from `apps/restaurant`, in separate processes:

```text
npx eas-cli@16.32.0 env:exec preview "node ../../scripts/restaurant-alias-staging-public-build-inputs.mjs && npm run prepare:web && npx expo export --platform web --clear" --non-interactive
```

The first command in the wrapper validates all nine injected values by UTF-8 length and SHA-256 and checks that the reviewed source-reference set has not drifted. It emits names and fingerprints only. Any absent or changed value stops before Metro export.

Each successful export must have exactly 74 files and 20 HTML routes, exact manifest `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89`, exact canonical archive `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862`, exact five critical assets, valid routing-control JSON, and the required PWA/runtime files. The two complete file inventories and archives must be byte identical.

## Evidence and failure behavior

The operator exclusively creates `secure/restaurant-alias-export-readiness/ruip6ae_20260926l` beneath a trusted mode-0700 parent and writes mode-0600 initialization, progress, and terminal evidence. Every attempt is persisted before comparison or failure. Evidence includes the source/artifact/archive/build-input-contract identities and sanitized file hashes; it excludes raw environment values and credentials.

Missing input, fingerprint drift, wrapper failure, any file/hash/archive mismatch, a second invocation, stale authority, or incomplete evidence is `FAIL`. No retry is authorized by this plan. Passing evidence remains a prerequisite for a later diagnostic authority and is not deployment or Phase 6 approval.

## Required future authorization

Owner approval must explicitly authorize only two read-only EAS `preview` environment exports for check `ruip6ae_20260926l`, bind the future audited checkpoint/source manifest and the identities above, state that no deployment or hosted mutation is authorized, and provide concrete `issuedAt` and `expiresAt` timestamps no more than two hours apart. Until that separate approval is issued and validated, no EAS command may run.

## Subsequent full diagnostic handoff

A passing check may be consumed only by the separately authorized full diagnostic `ruip6ad_20260926j`. Its terminal evidence must be complete, bound to the same audited checkpoint, source manifest, Restaurant tree, build-input contract, 74-file artifact manifest, and canonical archive, and no more than 30 minutes old when `prepare-authority` validates it. The diagnostic requires a separate owner authorization and maintenance window; the read-only authorization cannot authorize a deployment or alias operation.

The full diagnostic remains limited to one immutable deployment attempt, one alias assignment attempt, the reviewed 600-second observation, and one independently verified rollback assignment. A stale, failed, incomplete, differently bound, or previously consumed read-only result stops authority preparation. No action begins automatically after the read-only check.
