# Restaurant read-only EAS export check `ruip6ae_20260926k` binding contract

**Status:** Local binding only; no authority exists and no hosted check is authorized
**Required parent:** `05f7308b11247a22fa3f6d0741a4b3b59a2ac201`
**Parent source manifest:** `061385917032166e6795e346f683109e9512b95dd32dc5ba8f3e571d5f9a4aaf` (1,547 files)
**Restaurant tree:** `7430599b150adbd19ddafadce1195f1e418daf8a`
**Artifact manifest:** `7ca81f0fdbc649e34a929956329bcaafc95ec357c84f342a01f2a0dab2836431`
**Canonical archive:** `dd416dd5f44a4f3dbb3443f7269c61f4d964fe3e3e4de3b38d873db553e183cb`

## Exact checkpoint scope

The future direct-child checkpoint contains exactly:

1. `docs/restaurant-expo-alias-read-only-eas-evidence-initialization-remediation-review.md`
2. `docs/restaurant-expo-alias-ruip6ae-20260926k-check-binding-contract.md`
3. `scripts/restaurant-alias-diagnostic-execution-support.mjs`
4. `scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs`
5. `scripts/verify-restaurant-alias-production-export-readiness.mjs`

The actual commit and complete source-manifest SHA-256 are unknown until this exact checkpoint is created. The check-k owner authorization must bind those actual values.

## Evidence initialization contract

The only permitted evidence path is `secure/restaurant-alias-export-readiness/ruip6ae_20260926k`. The operator creates and secures the trusted parent when absent, then creates this check directory exclusively and writes its initialization marker before any EAS wrapper call. Existing, partial, interrupted, or previously used directories fail closed and may not be deleted or reused to make the check pass.

The approved command remains exactly:

```text
npx eas-cli@16.32.0 env:exec preview "npm run prepare:web && npx expo export --platform web --clear" --non-interactive
```

It must run exactly twice under a fresh, separately approved, maximum-two-hour authorization. Each result must contain the identical 74-file inventory and match the accepted artifact manifest and canonical archive. Evidence is sanitized and isolated from diagnostic runs.

## Isolation

Check `ruip6ae_20260926j` and its authority are immutable and prohibited from reuse. Runs `ruip6ad_20260925a` through `ruip6ad_20260925e` and `ruip6ad_20260926f` through `ruip6ad_20260926i` remain immutable. This contract authorizes no hosted read, deployment, diagnostic authority, alias operation, rollback, mutation, Earnings activation, or Phase 6 acceptance.
