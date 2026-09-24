# Restaurant AuthGate Alias Content-Parity Verification Remediation Plan

**Status:** Proposed; separate approval required
**Scope:** Operator verification and evidence capture only
**Phase 6:** Remains `BLOCKED`

## Objective

Make a future alias promotion classifiable and reproducible while retaining exact route and critical-asset content parity as the mandatory pass condition. This plan does not authorize a hosted query, deployment, alias mutation, fixture, migration, push, Earnings activation, or Phase 6 resumption.

## Narrow implementation

1. Refactor the existing content collector to persist each request immediately, including:
   - attempt number, request start/end, elapsed milliseconds, requested and final URL;
   - HTTP status;
   - SHA-256 and byte length;
   - `Cache-Control`, `Age`, `ETag`, `Date`, `Last-Modified`, `Server`, `Via`, request/ray IDs, and available Expo/CDN headers;
   - request cache directives and cache-busting value.
2. Persist a failure-safe append-only attempt file before evaluating parity. A thrown comparison must never erase the observed alias or immutable responses.
3. Query alias metadata independently after promotion on each attempt and record its deployment ID, update timestamp, and retrieval time. Keep metadata convergence and content convergence as separate fields.
4. Use the already verified immutable evidence as the fixed expected set. Do not refetch it as a moving comparison target after promotion.
5. Add a bounded stabilization window using explicit constants proposed for review: ten attempts, five seconds apart, with a maximum wall-clock duration of 50 seconds after the first attempt. Each alias request uses a run- and attempt-specific query parameter and explicit `Cache-Control: no-cache` and `Pragma: no-cache`.
6. Require one complete attempt in which:
   - fresh alias metadata identifies the intended deployment;
   - all required routes return HTTP 200 and the exact immutable HTML hashes;
   - the HTML references the expected critical asset paths;
   - every critical JS/CSS asset returns HTTP 200 and its exact immutable SHA-256;
   - no route or asset is omitted.
7. Record every earlier mismatch. Never relabel an intermediate mismatch as PASS. If the bound expires, fail promotion and execute the independently verified rollback procedure.
8. Run browser smoke tests only after the non-browser metadata and content gates pass. Record browser/service-worker state separately so browser caching cannot be confused with CDN or alias propagation.

## Local qualification before hosted use

Add deterministic tests with a local fake metadata endpoint and HTTP origin for:

- metadata old/content old, then metadata new/content new within the bound;
- metadata new while content remains old;
- metadata old while candidate content appears;
- mixed route and asset generations;
- candidate paths with one wrong asset body;
- transient 404/5xx responses;
- redirect/final-URL mismatch;
- success exactly at the last permitted attempt;
- permanent mismatch causing failure and rollback eligibility;
- evidence persistence when comparison or network handling throws;
- header and per-request timing capture;
- exact hash comparisons with no ETag-only acceptance;
- absence of automatic re-promotion.

The tests must use a fake clock or bounded local delays and verify both the decision and the complete evidence schema.

## Separately authorized hosted validation

After local review and explicit authorization:

1. Perform a fresh fail-closed Staging preflight and capture the current rollback target.
2. Verify the intended immutable candidate and its fixed content manifest.
3. Promote once. Do not add automatic promotion retry.
4. Run the bounded metadata/content observer.
5. If parity converges, proceed only with the separately authorized affected qualification.
6. If parity does not converge, roll back once, verify metadata and exact content restoration, preserve all attempts, and keep Phase 6 blocked.

## Boundaries

- No AuthGate or application behavior changes.
- No weakened hashes, partial-route success, ETag substitution, or majority acceptance.
- No increased application timeout and no mutation retry behavior.
- No automatic alias promotion retry.
- No Development or Production access.
- No backend contract, migration, generated type, authorization, notification, Realtime, or financial changes.
- No Earnings activation.

## Exit evidence for this remediation

Present the operator diff, local tests, evidence schema, exact stabilization constants, failure and rollback behavior, protected-file hashes, and confirmation that application/runtime output is unchanged. Hosted execution remains separately gated.
