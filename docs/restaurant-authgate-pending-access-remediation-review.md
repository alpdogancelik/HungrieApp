# Restaurant AuthGate Pending/Suspended Navigation Remediation Review

**Baseline:** `920ccdab4345c5ae10ce0e641bdaf06121582a35`
**Date:** 2026-09-24
**Local remediation:** `PASS`
**Phase 6:** `BLOCKED`
**Hosted impact:** None

## Implementation

The correction is limited to `apps/restaurant/src/AuthGate.tsx`:

- Resolved pending and suspended contexts retain the authenticated UID.
- `verified.current` remains false and `restaurantId` remains empty.
- The resolved access context and ready state commit before navigation.
- A post-commit effect chooses `/pending` or `/suspended` and replaces the route only when it differs.
- Active runtime ordering and its separate post-commit Dashboard navigation remain unchanged.

Pending and suspended accounts never receive `RestaurantRuntimeProvider`.

## Root-cause evidence

The route-applying harness reproduced the original gap at the accepted baseline: 8 tests passed and the new pending and suspended cases failed because a repeated callback for the same UID removed the access-state route while access resolution was pending.

The approved UID-only experiment made the component harness pass but the real production export still raised React error `#185`, remained at a blank `/login`, and never navigated to `/pending`. This proved that UID retention alone was insufficient and that direct access-state navigation from inside the auth callback remained unsafe.

With the final correction, the post-commit route lifecycle passes:

| State | Renders | Auth subscriptions | Navigations | Final route | Maximum-update errors |
|---|---:|---:|---:|---|---:|
| Pending | 2 | 2 | 1 | `/pending` | 0 |
| Suspended | 2 | 2 | 1 | `/suspended` | 0 |

The executable suite also covers active owner and manager ordering, direct protected-route restoration, pending-to-active and suspended-to-active recovery, wrong-role, revoked, unmapped, identity replacement, transient access failure, logout, and the single shared private Realtime subscription. Result: 11/11 passed.

## Production-export browser qualification

Browser: Chrome `153.0.8010.53` at 1024×768. The production export was served only from `127.0.0.1`; CDP fulfilled synthetic Firebase and Supabase responses, intercepted every HTTPS request, and blocked WSS.

| Identity | Initial result | Reload/restoration | Navigation count | Intercepted access requests | Uncaught errors | Unexpected hosted requests |
|---|---|---|---:|---:|---:|---:|
| Pending | Visible nonblank `/pending`; no operational shell | `/pending` | 6 | 4 including CORS preflights | 0 | 0 |
| Suspended | Visible nonblank `/suspended`; no operational shell | `/suspended` | 6 | 4 including CORS preflights | 0 | 0 |
| Owner | Dashboard with committed runtime | Dashboard and direct `/orders` restoration | 7 | 6 including CORS preflights | 0 | 0 |
| Manager | Dashboard with committed runtime | Dashboard and direct `/orders` restoration | 7 | 6 including CORS preflights | 0 | 0 |

No case produced React error `#185`, `Restaurant runtime is unavailable`, a blank document, an overlay after readiness, or a navigation/authentication loop. Browser report SHA-256: `bc7bbeac71c3e6051b5244096048003e2b9fce622a04f2f8009f058067930afb`.

## Regression results

| Check | Result |
|---|---|
| Restaurant TypeScript | PASS |
| Static Expo production export | PASS — 20 routes |
| UI Phase 1–5 | PASS — 8, 13, 14, 8, and 8 tests |
| AuthGate lifecycle | PASS — 11 tests |
| Order flow | PASS — 21 Phase 7 tests |
| PostgREST 14.5 conflict transport | PASS — stale transition/acknowledgement/cancellation return HTTP 409/code `40001`; concurrency, replay, recovery, authorization, cleanup pass |
| Notification worker and Restaurant push safeguard | PASS — 11 and 2 tests |
| Reviews repositories/UI | PASS — 6 repository tests and 29 UI tests |
| Earnings safeguards | PASS — Phase 3 11 tests, Phase 4 6 tests, Phase 3–5 protected checks |
| Realtime | PASS — exactly one shared private Restaurant subscription |
| Database lint | PASS — zero errors in public/private/migration |
| CSP and route inventory | PASS — generated inline scripts accepted across 20 HTML pages |
| Bundle | PASS — JS gzip 646,761 bytes; CSS gzip 9,907 bytes |
| Mock/fixture/secret scan | PASS — 113 application/export files, zero findings |
| `git diff --check` | PASS |

Principal commands:

```text
node --test scripts/test-restaurant-authgate-remediation.mjs
npm --prefix apps/restaurant run typecheck
npm --prefix apps/restaurant run prepare:web
npx expo export --platform web --clear
node scripts/qualify-restaurant-authgate-pending-local.mjs
npm run test:restaurant-responsive-ui-phase1
npm run test:restaurant-responsive-ui-phase2
npm run test:restaurant-responsive-ui-phase3
npm run test:restaurant-responsive-ui-phase4
npm run test:restaurant-responsive-ui-phase5
npm --prefix functions run test:phase5-restaurant
npm run notification-worker:test
npm run test:review-v2-repositories
npm run test:review-v2-ui
npm run test:restaurant-earnings-phase3
npm run test:restaurant-earnings-phase4
npm run phase3:restaurant-earnings:check
npm run phase4:restaurant-earnings:check
npm run phase5:restaurant-earnings:check
npm run phase7:runner:test
npm run test:restaurant-order-conflict-transport
npm run supabase:lint
node scripts/check-restaurant-export-csp.mjs
git diff --check
```

## Protected files

| File | SHA-256 |
|---|---|
| Accepted conflict migration | `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641` |
| Generated database types | `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37` |
| Root lockfile | `20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33` |
| Notification service worker | `ef077262cd14ae536e2a61029b411997df5497ff7bda7c8d38e7ef6928ee3be0` |
| Prior Phase 6 remediation evidence manifest | `4f64ed4ee5d489b17c28c1e84147aa632e3a735e613a1bfb59f9dbecb8049092` |
| AuthGate Staging retry evidence manifest | `ecc4c5567cf19e0b838121f8220d1dc71ad7b7593f288ab295e8189576704847` |

## Evidence

- Original failing route lifecycle: `pre-fix-route-lifecycle.txt`
- UID-only browser failure: `browser-failure-after-uid-retention.json`
- Corrected lifecycle: `corrected-route-lifecycle.txt`
- Exact lifecycle counts: `route-lifecycle-counts.json`
- Browser report and four screenshots under `docs/restaurant-authgate-pending-remediation-evidence/`
- Evidence manifest SHA-256: `66627948212179ae8f18e8546f069d53e306c569fecb65dae807424becae6e79`

Evidence contains no bearer token, JWT, authorization value, password, refresh token, or raw credential header value.

## Limitations and boundaries

This qualification is local and synthetic. It does not authorize or establish Staging behavior, Phase 6 completion, Earnings activation, Production readiness, or deployment approval. No hosted service was accessed. The implementation, tests, script, report, and evidence remain uncommitted.
