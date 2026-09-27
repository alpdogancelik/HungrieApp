# Run-M immutable parity-reference remediation

## Confirmed root cause

Run `ruip6ad_20260927m` completed immutable publication and all four account qualifications, then promoted deployment `w7iqi04bsy`. Alias observation failed before its first request because the operator passed `immutable-smoke.json` route and asset rows directly to the parity verifier. Those rows store content identity under `expected.sha256`, `expected.byteLength`, and `expected.finalUrl`; the verifier contract requires normalized top-level `sha256`, `bytes`, and `finalUrl` fields. The missing normalized fields were all six route hashes/lengths/final URLs and all five critical-asset hashes/lengths/final URLs. This was an evidence-schema mismatch between the immutable producer and observation consumer.

Pre-promotion validation passed because it checked immutable PASS state, counts, identities, and evidence hashes, but it did not build or validate the exact reference consumed by alias observation. Application behavior, AuthGate, and Restaurant routing were not implicated.

## Correction

The parity verifier now exports its reference validator. Immutable verification materializes `immutable-parity-reference.json` from independently verified expected and actual data. The reference binds the run, deployment, URL, source commit, source manifest, immutable evidence digest, six routes, five critical assets, exact bytes and hashes, final URLs, and route asset references.

Final preflight, the promotion boundary, and observation call the same validation contract. Promotion records the reference evidence digest, and observation requires the identical digest. Missing, malformed, stale, incomplete, identity-mismatched, or digest-mismatched references fail before alias mutation.

The next-run coordinator implements one exact comprehensive owner approval with separately stated read-only and diagnostic scopes. It derives the diagnostic start after both read-only exports pass, enforces 30-minute freshness and a two-hour authority lifetime, preserves one-attempt limits, performs rollback after every promoted outcome, and finalizes one consolidated result.

## Historical evidence

Run-M authority, immutable publication, access qualification, preflight, promotion, terminal result, final reconciliation, and evidence manifest remain unchanged. The preserved failure is the executable regression fixture; no historical file is rewritten.

## Verification scope

Regression coverage includes the original nested immutable schema, complete reference generation, missing fields, malformed hashes, stale capture, run/deployment/source identity mismatch, immutable evidence digest mismatch, final-preflight binding mismatch, prevention of promotion, unchanged successful parity/stability requirements, comprehensive approval identity/lifetime/limits, dynamic maintenance start, export failure, every pre-promotion stop, and one rollback after an observation failure.

Remaining hosted-only uncertainty is whether a future newly deployed immutable candidate and the Staging alias will satisfy provider delivery parity. This local correction prevents that uncertainty from being tested through promotion with an invalid reference.

## Local qualification result

- Focused diagnostic, parity, execution-support, access, export-readiness, build-input, Metro, and single-approval tests: **194/194 PASS**.
- Complete local release gate: **PASS** with 28 mandatory checks passing, zero failures, zero blocked checks, two byte-identical 74-file exports, and eight isolated local account flows.
- Syntax and whitespace checks: **PASS**.
- Restaurant application tree: `7430599b150adbd19ddafadce1195f1e418daf8a` (unchanged).
- Accepted artifact manifest, canonical archive, and Staging build-input contract: unchanged.
- Run-M preserved directory: 56/56 files byte-for-byte unchanged across implementation and qualification.

The changed checkpoint inventory is limited to the parity verifier, diagnostic operator, execution support, their directly relevant tests, the local release gate, the new single-approval coordinator and tests, this report, and the next-run contract. Local readiness is **PASS**. A future hosted run still requires one exact comprehensive owner approval bound to the committed checkpoint and complete source manifest.
