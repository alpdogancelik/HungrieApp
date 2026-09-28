# Qualification E Firebase authorized-domain preflight investigation

Status: **LOCAL CORRECTION PASS; CURRENT HOSTED STATE UNVERIFIED**
Date: 2026-09-28
Consumed qualification: `restaurant-vercel-browser-notification-qualification-20260928e`
Immutable deployment: `dpl_8CM3s16BZRwK9Ls1eMMJCVKmWyYt`
Firebase project: `hungrieapp-a2288`

## Confirmed failure

Qualification E stopped in its prerequisite phase before browser startup or mutation. Its terminal record says only `Firebase authorized-domain inspection failed.` The failed operation was the in-process authenticated `GET` of:

`https://identitytoolkit.googleapis.com/admin/v2/projects/hungrieapp-a2288/config`

There was no child process, so there is no process exit code. The preserved E evidence contains no HTTP status, Google error status, response-shape classification, response length/hash, or validator assertion. It therefore cannot distinguish a missing domain from authentication/permission, transport, HTTP, project-selection, or response-schema failure. No later reconstruction can truthfully recover those missing observations.

This is the confirmed local root cause of the non-diagnostic result: the hosted runner used a combined inspection/assertion path outside the checkpointed operator and collapsed every failure into one generic exception before persisting sanitized inspection evidence. The evidence does **not** establish that the domain was absent.

## Earlier independent evidence

The protected qualification-A record shows that the required hostname was added while preserving four existing domains and was independently verified. Its change record is SHA-256 `c8df1a2935e0b51d62b39aa5f1bee474096b8b33bf15bf72eb54b7d604f0e1e4`. Its terminal Firebase verification is SHA-256 `ab36cd88b75f96412b95a8cb4aa501bebef19c47850d2c448675c951dde593bb`.

Qualification C later recorded a successful read-only preflight with `authorizedDomainPresent: true` and a five-domain count. That record is SHA-256 `a55c03a2b277e97ee61c5b7d0e66d24c5f5443d5cb4624e00c69326a061f790d`.

These records prove the earlier state. They are not substituted for a current inspection.

## Local correction

`scripts/restaurant-vercel-preview-browser-notification-continuation.mjs` now provides one canonical Firebase inspection contract:

- exact project `hungrieapp-a2288`;
- exact `GET /admin/v2/projects/hungrieapp-a2288/config` request with no body;
- the documented `https://www.googleapis.com/auth/identitytoolkit` OAuth scope;
- exact `projects/hungrieapp-a2288/config` response identity;
- a unique, lowercase domain set that is exactly the four-domain baseline either with or without the required Preview hostname;
- separate `AUTHENTICATION_OR_PERMISSION`, `NETWORK_OR_TRANSPORT`, `HTTP_STATUS`, `RESPONSE_SCHEMA`, `PROJECT_SELECTION`, and `AUTHORIZED_DOMAIN_STATE` classifications;
- response and provider-message byte lengths and SHA-256 fingerprints without persisting their contents;
- mandatory sanitized evidence persistence before raising a failed preflight assertion;
- strict rejection of non-GET requests, wrong endpoints, wrong projects, malformed credentials, and malformed responses.

Google's `projects.getConfig` contract documents this endpoint, the `firebaseauth.configs.get` permission, and the accepted Identity Toolkit or Cloud Platform OAuth scopes. Its `Config` schema places `authorizedDomains[]` at the response root.

Changed files:

| File | SHA-256 | Reason |
|---|---|---|
| `scripts/restaurant-vercel-preview-browser-notification-continuation.mjs` | `9a2b73f2d34bf53b23910c1491ee29533f504258f104358289bd169f030094ef` | Canonical read-only request, response validation, safe failure classification, and persist-before-throw lifecycle |
| `scripts/test-restaurant-vercel-preview-browser-notification-continuation.mjs` | `5072bd46f57779f227ecaa5abc40e52e42ea0cc2b7fa92987a6f6fbd24556e95` | Deterministic coverage of the exact endpoint/scope/schema and every failure class |
| `scripts/inspect-restaurant-vercel-firebase-authorized-domain.mjs` | `530b12562bfc308e5363e86051f8375ba479ff7729f76dca550fc907e1b7af56` | Exclusive one-request authority, credential, execution, terminal-evidence, and manifest contract |
| `scripts/test-inspect-restaurant-vercel-firebase-authorized-domain.mjs` | `a83432f6694fa61d5d9a091514232236ded67b91938d0ce5d8945a826f3802c9` | Complete one-request, present/absent, failure-classification, and credential-selection fixtures |

No application source, artifact, Vercel deployment, Firebase configuration, account, bypass, or notification state changed.

## Verification

- Firebase inspection and continuation tests: **40/40 PASS**.
- Vercel deployment/configuration tests: **27/27 PASS**.
- Browser access qualifier tests: **40/40 PASS**.
- Vercel local qualification: **PASS**; report SHA-256 `d091aaf849c5baf867b277b2e3b853b3dc9e07f3e7c7cc912bc0684bd2d8c414`.
- Syntax and `git diff --check`: **PASS**.
- Qualification evidence A-E: **PASS**, all manifest entries match.
- Qualification E authority remains SHA-256 `74e019de4ec5977e82a78a781e4e84faacc48b13e30d090bfc4c70da406bfa2b`.
- Qualification E evidence manifest remains SHA-256 `018b0f2675f014efb4a4ebe96b0371658af9580f347c1d89c016acd2cfbdb3b1`.

The complete Restaurant local release gate executed 302 automated tests and eight browser flows. It reported 27 PASS, one FAIL, and four hosted-only checks. Its single failure is an existing diagnostic-suite binding mismatch: `verifyAcceptedDiagnosticExecutables` rejects the current committed `scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs` hash in `future compatibility checkpoint must retain diagnostic executables and reviewed proposal`. This is outside the Firebase preflight correction and was not weakened or changed.

## Required fresh read-only inspection

A fresh inspection is necessary because qualification E did not preserve enough information to determine the provider-side cause or current domain state. The smallest separately authorized action is:

1. One authenticated HTTPS `GET` to the exact Identity Toolkit config endpoint above.
2. Project fixed to `hungrieapp-a2288`; OAuth scope fixed to `https://www.googleapis.com/auth/identitytoolkit`.
3. Zero retries, zero request body, and no other Firebase or Google API request.
4. Validate HTTP 200, exact config resource name, and the exact five-domain set.
5. Persist only the sanitized classification, status, provider error code, counts, and body/message byte-length and SHA-256 fingerprints. Persist no access token, credential, response body, API key, or unrelated config value.
6. Stop after the inspection. Do not create a Vercel bypass, browser session, qualification authority, FCM token, or notification.

If the result is 401/403, the owner must provide a currently valid credential whose principal has `firebaseauth.configs.get` on `hungrieapp-a2288`; no Firebase configuration change is justified. If the exact domain set differs, report the actual count, set fingerprint, and required-domain presence for separate review without modifying it.

Qualification E remains consumed. Phase 6 remains blocked.
