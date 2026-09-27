# Restaurant run-L HTTP 429 read-only observation proposal

**Status:** Proposal only; owner authorization required before any hosted request

**Observation ID:** `ruip6ao_20260927a`

**Historical source:** terminal run `ruip6ad_20260927l`, immutable deployment `qi1cdfilti`

## Purpose

The observation is limited to identifying the response-producing layer for the HTTP `429` burst preserved by run L. It is not a retry of run L, does not qualify or approve the deployment, and cannot create a diagnostic authority or make the deployment eligible for promotion.

## Required authorization

The owner must separately authorize read-only HTTPS and Chrome DevTools observations against the retained immutable URL for `qi1cdfilti`. Authorization must bind the actual audited diagnostic-enrichment checkpoint, its complete source-manifest SHA-256, this proposal SHA-256, observation ID, exact immutable deployment and URL, a maximum two-hour validity period, and an exclusive protected evidence directory at `secure/restaurant-alias-http-observation/ruip6ao_20260927a`.

The authorization may permit one fresh ephemeral Chrome profile and one bounded sequence consisting of an initial suspended-route document/resource load followed by the existing cache-bypassing restoration load. It must use no account credentials and perform no Firebase or Supabase authentication. It may also permit direct read-only HTTP GET observations of the exact CSS and five font paths already present in the accepted artifact. No request retry, deployment, alias operation, authority reuse, database read, account access, or mutation is permitted.

## Evidence contract

Every response must be persisted before evaluation with:

- UTC request and response timestamps and a unique request ID;
- sanitized requested/final URL, CDP resource type, initiator type/stack, and document URL;
- HTTP status and protocol;
- `Server`, `CF-Ray`, `Retry-After`, `Cache-Control`, `CF-Cache-Status`, `Age`, `ETag`, `Date`, `Last-Modified`, `Via`, `X-Cache`, `X-Cache-Hits`, `X-Request-ID`, `X-Served-By`, `X-Timer`, `Content-Type`, and `Content-Length` when supplied;
- disk, prefetch, and service-worker cache flags plus the remote endpoint;
- error-body byte length and SHA-256 without persisting the body;
- service-worker registration/controller state and browser version;
- atomic terminal `PASS`, `FAIL`, `INCONCLUSIVE`, or `ABORTED` classification.

Cookies, authorization values, request bodies, credentials, response bodies, query values, email addresses, and private account data must never be persisted. Screenshots are unnecessary and prohibited for this unauthenticated observation.

## Decision rules

- `PASS` means the bounded observation completed and the captured safe metadata is sufficient to attribute every observed `429` to a documented layer.
- `INCONCLUSIVE` means the observation completed but the provider omitted the identifying headers or no `429` occurred. It must not be interpreted as deployment qualification.
- Any unexpected origin, authentication request, malformed or incomplete evidence, credential-shaped persisted value, HTTP mutation method, evidence-path collision, timeout, or operator exception is `FAIL` or `ABORTED`.
- No result changes the required-resource failure policy. CSS or font HTTP `429` remains a diagnostic blocker.

## Remaining uncertainty

`Server` and `CF-Ray` can establish Cloudflare handling, while cache status, `Age`, `Via`, `X-Cache`, routing IDs, remote endpoint, `Retry-After`, and a body digest can help distinguish an edge-generated rate limit from a forwarded Expo/EAS or upstream-origin response. Provider-internal routing cannot be proven when those headers are absent or ambiguous; that outcome remains `INCONCLUSIVE` and may require an Expo support request using the sanitized evidence.
