# Restaurant AuthGate Alias Content-Parity Verification Remediation Qualification

**Status:** Local implementation and qualification complete; owner review required
**Scope:** Operator verification and directly related tests only
**Hosted access:** None
**Phase 6:** `BLOCKED`

## Implementation

The accepted immutable Restaurant artifact and application runtime were not changed. The remediation changes only:

- `scripts/deploy-restaurant-authgate-staging-retry.mjs`
- `scripts/restaurant-alias-parity-verifier.mjs`
- `scripts/test-restaurant-alias-parity-verifier.mjs`

The complete review diff is stored in `docs/restaurant-authgate-alias-content-parity-remediation-implementation.diff`.

| File | SHA-256 |
|---|---|
| Operator command | `124cf298bd1c5837bf2a7cc4f529b4454b54abeb38723dcb7b9999a39dcb21f1` |
| Parity verifier | `10a725acc7c5281ef6e98d836f72f2f507d5300bf88a07ef4cbe5b692f2a2525` |
| Deterministic tests | `35ea971cfe03f34eb42aff9201e23c1e970d8f3a7a941d7631642fe08bb95bb4` |
| Complete implementation diff | `2323db169d997a6cc73ffd658d6639bf757eb164963d26df5f5c8eae564d9c2d` |

## Decision contract

The fixed expected content comes from the previously passed `immutable-smoke.json`. Alias verification does not refetch the immutable candidate.

The policy constants are:

```text
maximumAttempts       10
pollingIntervalMs     5000
maximumObservationMs  50000
```

Attempt 1 starts immediately. Attempts 2 through 10 target offsets of 5 through 45 seconds from the first attempt. No request may start at or after 50 seconds. A result that completes after 50 seconds cannot pass.

One complete attempt passes only when:

1. independently retrieved alias metadata identifies the expected deployment;
2. every fixed route returns HTTP 200, retains its requested final URL, and matches the exact immutable HTML SHA-256;
3. every route HTML references every expected critical JS/CSS path;
4. every expected critical asset returns HTTP 200, retains its requested final URL, and matches its exact immutable SHA-256;
5. the route and asset collections are complete.

Metadata and content convergence are recorded separately. ETags are evidence only. Intermediate mismatches remain in the record. Exhaustion produces `passed: false` and `rollbackRequired: true`. The verifier never invokes promotion or rollback and contains no automatic promotion retry.

## Failure-safe evidence

`alias-verification-progress.json` is replaced atomically after initialization, attempt creation, every metadata/content request observation, every parsed result, and the final decision. A hard parity failure is also copied to `alias-verification-failure.json`; a pass is copied to `alias-verification.json`.

The evidence root contains:

- schema version, run ID, sanitized alias URL, fixed expected deployment/routes/assets, policy, start/completion, pass and rollback-required results;
- ordered attempts with separate metadata and content results;
- metadata deployment identifier, metadata update time when supplied, and retrieval time;
- every request observation with attempt, resource kind, request start/end, elapsed milliseconds, sanitized requested/final URL, HTTP status, body SHA-256, byte length, cache-busting context, safe response headers, and sanitized error;
- per-route final-URL and expected-asset-reference results;
- per-asset final-URL result;
- separate `metadataConverged`, `contentConverged`, `withinObservationWindow`, and `completeParity` decisions.

Only allowlisted response headers are retained: `Cache-Control`, `Age`, `ETag`, `Date`, `Last-Modified`, `Server`, `Via`, common CDN/request IDs, and cache diagnostics. Request headers, cookies, request bodies, response bodies, Expo session values, and authorization values are never written. Credential-shaped URL parameters and error text are redacted.

## Deterministic qualification

Command:

```text
node --test scripts/test-restaurant-alias-parity-verifier.mjs
```

Result: **PASS — 14/14 tests**.

Covered cases:

1. old metadata and old content converging to the candidate;
2. new metadata with old content;
3. old metadata with new content;
4. mixed route and asset generations;
5. one incorrect critical asset;
6. transient HTTP 404 and 503 responses;
7. redirect/final-URL mismatch despite candidate bytes;
8. success on attempt 10 at the +45-second boundary;
9. response completion after the 50-second deadline;
10. persistent mismatch and rollback eligibility;
11. evidence survival across network and metadata parsing exceptions;
12. complete timing, digest, size, cache/CDN header, and cache-busting capture;
13. omitted asset references and exact-hash enforcement;
14. credential-shaped URL and error redaction.

The tests use a loopback HTTP server, synthetic metadata endpoint, fake clock, and bounded local execution. No hosted hostname is contacted.

## Regression and protection

| Check | Result |
|---|---|
| `node --check` on operator, verifier, and test | PASS |
| Restaurant TypeScript (`npm run typecheck --workspace @hungrie/restaurant`) | PASS |
| `git diff --check` | PASS |
| Application/runtime working-tree diff | PASS — no changes under `apps/restaurant`, root package manifests, or lockfile |
| Original protected evidence manifest | PASS — 35/35 files match hash and byte length |
| Protected evidence-manifest SHA-256 | PASS — `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44` |
| Accepted immutable export archive | PASS — unchanged SHA-256 `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Credential persistence assertions | PASS — ephemeral authorization/cookie values absent from every persisted snapshot |
| Hosted access/deployment/alias/migration/Earnings | N/A — prohibited and not performed |

## Remaining limitations

- The independent Expo metadata request and CDN observations are locally simulated. Their hosted behavior requires a separately approved Staging validation.
- The operator has not been used to promote, verify, or roll back a hosted alias under this authorization.
- No conclusion about the delivery cause of the original `ruip6a_20260924b` mismatch changes; it remains indeterminate.
- Phase 6 remains blocked, and the prior rejected candidate remains rejected.
