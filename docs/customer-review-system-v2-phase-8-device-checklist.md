# Customer Review System v2 — Phase 8 Physical-Device Checklist

**Status:** Complete — accepted by the app owner on 2026-09-18
**Environment:** Staging only
**Required binaries:** Customer `1.0.2`, iOS build `39`, Android version code `38`

The app owner reported that the complete physical-device qualification works correctly on both platforms and accepted the Staging result. EAS build IDs and the physical iPhone model/OS were not supplied for the repository record; they are intentionally recorded as unavailable rather than inferred. No credential or TOTP material is included in this document.

## Devices

| Platform | Model | OS | Build ID | Result |
|---|---|---|---|---|
| iOS | Physical iPhone (model not recorded) | Not recorded | Not recorded | Pass — app-owner attestation |
| Android | Google Pixel 9 | Android 17 | Not recorded | Pass — app-owner attestation |

## Customer matrix — repeat on both devices

| Check | iPhone | Pixel 9 | Evidence / notes |
|---|---|---|---|
| English and Turkish copy | Pass | Pass | App-owner attestation |
| Light and dark themes | Pass | Pass | App-owner attestation |
| Large text / display scaling without clipping | Pass | Pass | App-owner attestation |
| VoiceOver / TalkBack labels, values, and announcements | Pass | Pass | App-owner attestation |
| Reduced motion | Pass | Pass | App-owner attestation |
| Keyboard meets sheet; comment and submit remain visible | Pass | Pass | App-owner attestation |
| Safe areas, scrolling, and platform touch targets | Pass | Pass | App-owner attestation |
| Taste and Speed are required; invalid submit is announced | Pass | Pass | App-owner attestation |
| Optional comment and no-comment submissions | Pass | Pass | App-owner attestation |
| Liked, disliked, and skipped meal reactions | Pass | Pass | App-owner attestation |
| Duplicate configured lines share one base-item reaction | Pass | Pass | App-owner attestation |
| Same base meal is independently reviewable in another order | Pass | Pass | App-owner attestation |
| One review per order; duplicate UI/RPC attempt fails | Pass | Pass | App-owner attestation |
| Compact actions remain on eligible orders; removed prominent banner does not reappear | Pass | Pass | Accepted post-qualification presentation change |
| Expired order remains visible but cannot open/submit | Pass | Pass | App-owner attestation |
| Offline submit, reconnect, and same-operation retry | Pass | Pass | App-owner attestation |
| Background/foreground during submission | Pass | Pass | App-owner attestation |
| Full termination after commit restores authoritative Reviewed state | Pass | Pass | App-owner attestation |
| Session expiry, suspended, revoked, wrong-role, and outage states are distinct | Pass | Pass | App-owner attestation |
| Home, Restaurant details, and review page refresh to one summary | Pass | Pass | App-owner attestation |

## Restaurant, Admin, and browser matrix

| Check | Result | Evidence / notes |
|---|---|---|
| Restaurant A cannot access Restaurant B reviews | Pass | Automated hosted probe and app-owner acceptance |
| Approved report reasons and optional 500-character note | Pass | Automated hosted probe and app-owner acceptance |
| Duplicate/repeated report rejected; reporting leaves review public and metrics unchanged | Pass | Automated hosted probe and app-owner acceptance |
| Aggregate reactions show liked/disliked/positive percentage only | Pass | Automated hosted probe and app-owner acceptance |
| No Customer/order/review-level reaction mapping | Pass | Automated privacy probe and app-owner acceptance |
| Admin resolve, dismiss, reopen; illegal transition denied | Pass | Automated hosted probe and app-owner acceptance |
| Recent-TOTP Admin hide/restore removes and restores metrics/reactions exactly once | Pass | Automated hosted probe and app-owner acceptance |
| Anonymous network responses omit Customer identity, order PII, and per-review reactions | Pass | Automated privacy probe and app-owner acceptance |
| Restaurant live alias returns CSP, HSTS, no-store, and expected Staging configuration | Pass | Live deployment checks recorded in Phase 8 evidence |
| Admin Staging portal protects `/reviews` and returns CSP, HSTS, and private/no-store | Pass | Live deployment checks recorded in Phase 8 evidence |

## Completion and cleanup

Every applicable row passed by app-owner attestation on 2026-09-18. The guarded automated journey removed all database and Firebase fixtures, Firebase enumeration found no matching automated identities, and cleanup reconciled the original six-product-review/zero-order-review baseline. No guarded device-fixture manifest was recorded as created, so there was no separately recorded device-fixture set to retain or delete.
