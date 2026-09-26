# Restaurant read-only EAS evidence initialization remediation review

**Status:** Local correction ready for checkpoint qualification; no hosted request was made
**Parent checkpoint:** `05f7308b11247a22fa3f6d0741a4b3b59a2ac201`
**Failed check preserved:** `ruip6ae_20260926j`
**Replacement check:** `ruip6ae_20260926k`

## Root cause

The standalone read-only EAS operator called non-recursive `mkdir` for the check directory before ensuring its trusted parent `secure/restaurant-alias-export-readiness/` existed. Check j therefore stopped before either EAS wrapper command. Its approved authority remains unchanged at `secure/restaurant-alias-export-readiness-authority/ruip6ae_20260926j.json`, mode `0600`; it is prohibited from reuse. No check-j evidence directory was created and no hosted request occurred.

## Correction

`initializeExclusiveEvidenceDirectory` binds the output to `<trusted-root>/<check-id>`, creates and secures only the trusted root recursively, creates the check directory non-recursively with mode `0700`, and atomically writes a mode-`0600` initialization marker. An existing check directory fails at the exclusive create and is never overwritten. If marker persistence is interrupted, the already-created directory remains the exclusive marker and prevents retry. Parent permission errors fail before a check directory exists.

The standalone operator defaults the trusted root to `secure/restaurant-alias-export-readiness/`. Tests may inject an isolated trusted root and filesystem fault behavior; production callers cannot select a different output beneath the default root through command arguments alone.

## Reviewed files

- `scripts/verify-restaurant-alias-production-export-readiness.mjs` — `e061c83d72f3233909489c59e4981d08fb0ec6560e6aeaa461d0b2032ba4f1eb`
- `scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs` — `153e1718f37e80fc65aabd75d06b2c35dd5aadd83208c3548dbc0b81983da09a`
- `scripts/restaurant-alias-diagnostic-execution-support.mjs` — `b2ad374ec0d524472897a3f3e98386f190480bd18fce7ee228b77fae67ae682a`
- `docs/restaurant-expo-alias-read-only-eas-evidence-initialization-remediation-review.md` — self-hash recorded after finalization
- `docs/restaurant-expo-alias-ruip6ae-20260926k-check-binding-contract.md` — hash recorded after finalization

The execution-support update preserves strict lineage and exact inventory checks while recognizing this future direct-child correction and the corrected verifier/test hashes. Application runtime, artifact bytes, Metro configuration, deployment operator, access qualifier, backend contracts, and environment identities are unchanged.

## Tests

Qualification results:

- Read-only EAS export tests: 9/9 PASS, including missing parent, existing directory, permission failure, and interrupted initialization.
- Execution-support plus read-only prerequisite suite: 77/77 PASS.
- Complete accepted diagnostic focus: 146/146 PASS.
- JavaScript syntax and Restaurant TypeScript: PASS.
- Local check-k initialization proof without invoking the EAS wrapper: PASS.
- Notification worker: 11/11 PASS.
- Reviews repository and UI: 35/35 PASS.
- Earnings safeguards: 17/17 PASS.
- Phase 7 order flow: 1/1 PASS.
- Restaurant tree, 74-file artifact manifest, and canonical archive: unchanged and PASS.
- Protected evidence: 35/35 and 42/42 PASS.
- Credential scan and `git diff --check`: PASS.
- Exact five-file staged inventory and `git diff --cached --check` are mandatory checkpoint gates.

## Boundaries

This correction authorizes no EAS read, export, diagnostic authority, deployment, alias operation, rollback, account change, or push. A new explicit owner authorization is required for check k after the actual checkpoint and complete source manifest are known. Phase 6 remains blocked.
