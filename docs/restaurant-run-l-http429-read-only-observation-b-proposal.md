# Restaurant HTTP 429 read-only observation B proposal

**Status:** Local proposal only; separate exact owner authorization required before authority preparation or any hosted request.

**Observation ID:** `ruip6ao_20260927b`

**Target:** retained immutable deployment `qi1cdfilti` at `https://hungrie-restaurant--qi1cdfilti.expo.app`

## Purpose

Observation B may collect delivery metadata needed to determine the response-producing layer for the HTTP `429` responses preserved by terminal run L. It is not a retry of run L or consumed observation A. It cannot qualify the deployment, enable promotion, change the Staging alias, or authorize Phase 6 completion.

## Fixed scope

- One fresh ephemeral Chrome profile.
- One initial unauthenticated `/suspended` document load and one cache-bypassing restoration load.
- At most 40 same-origin browser request starts.
- Exactly six fixed CSS/font HTTPS `GET` observations, sequentially at concurrency one.
- At most 46 same-origin request starts across both phases.
- Zero retries and a maximum 120-second observation duration.
- Authority validity exactly two hours from the actual owner approval receipt time.
- Exclusive authority, source-manifest, and evidence paths for `ruip6ao_20260927b`.

The six resources, byte lengths, and SHA-256 identities are executable constants inherited unchanged from the audited observation-A scope. HTTP 200 requires exact bytes. HTTP 429 remains evidence, not success by itself. Other direct-resource statuses fail.

## Safety and evidence

Only sanitized status, protocol, request timing, allowlisted delivery/cache/routing headers, cache and service-worker flags, remote endpoint, sanitized initiator/document URL, header and query-parameter names, and bounded response-body length/SHA-256 may persist. Header values outside the allowlist, query values, bodies, cookies, credentials, tokens, passwords, email addresses, and screenshots are prohibited.

A credential-bearing request, unexpected HTTP origin, non-GET method, unexpected resource, request/duration limit, identity mismatch, evidence collision, sanitation failure, or integrity failure stops requests immediately. Every asynchronous CDP exception must enter the controlled lifecycle. Terminal evidence, cleanup disposition, and a verified evidence manifest are mandatory for `PASS`, `INCONCLUSIVE`, `FAIL`, and `ABORTED`.

`PASS` requires at least one HTTP 429 and sufficient safe routing metadata to attribute every observed 429. No 429 or ambiguous provider metadata is `INCONCLUSIVE`. Safety violations are `FAIL`; bounded runtime/network/interruption failures are `ABORTED`. Every result remains ineligible for deployment, promotion, rollback, or authority reuse.

## Historical separation

Observation `ruip6ao_20260927a`, its authority, and its three partial evidence files are immutable and consumed. Observation B must never read them as mutable run state, complete them in place, reuse their paths, or repeat a request under their authority. The separately named supplemental forensic record documents A without rewriting it.

## Authorization boundary

Future approval must bind the actual audited direct-child remediation checkpoint, complete source manifest, this proposal SHA-256, exact operator and validator hashes, observation B, deployment and origin, fixed resources and limits, actual `issuedAt`, exactly two-hour `expiresAt`, and explicit zero-mutation boundaries. Authority preparation and hosted execution remain prohibited until that completed JSON receives separate explicit owner confirmation.
