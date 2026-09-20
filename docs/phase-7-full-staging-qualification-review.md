# Phase 7 Full Staging Qualification Review

**Status:** Remediation in progress; automated baseline completed, post-fix manual retests remain
**Production changed:** No

This document is the final review template. Populate it only from owner-only durable evidence and manual checklist observations. Never copy credentials, ID tokens, TOTP seeds, addresses, comments, or Customer PII here.

## Source and deployment identity

- Qualified automated baseline source commit: `9659244c2edb291ef2efabd463bf3d44101fe858`
- Post-soak corrected application source commit: `6dcbef4195addb56411313b5ca2d72c341f01f53`; evidence-document head used for fresh builds: `55d6c8028c466bff3d281f19a4c5a0fd132b9edc`
- Migration SHA-256: `ac3419cade9767d9257fdceb963ee42d5e454934dec73cd59b17a2366286a9cd`
- Runner mode: macOS LaunchAgent with owner-login requirement after reboot
- Customer iOS build 40 / artifact SHA-256: Local signed ad-hoc build `Hungrie-1.0.2-build40-post-soak.ipa`; `dc29f9046d4fbb495835db31e16ef1f83eb89f5a53bec8c55cae4cbf2e5d029b`. Metadata verified as version `1.0.2`, build `40`, bundle `com.hungrie.app`. Cloud EAS build was unavailable because the account's monthly iOS build quota was exhausted; the local EAS build used the approved distribution certificate and device provisioning profile.
- Customer Android version code 40 / EAS ID / artifact SHA-256: Pending post-fix build. Version code 39 (`7654738d-62d1-4ca2-a065-93412eb4eec6`) is pre-fix evidence only.
- Restaurant Staging deployment/checksum: `https://hungrie-restaurant--l38zjzhj1h.expo.app` (alias `https://hungrie-restaurant--staging.expo.app`); `f7d21709fb9b92de27b745ce3f2cf1fe72c15c687a628d0857e4a5f726f11353`
- Admin Staging deployment ID/checksum: Pending

## Automated runs

| Kind | Run ID | Result | Evidence checksum / notes |
|---|---|---|---|
| Preflight | `60fd8713-8865-4a2a-8e94-b5fb4ebf5321` | Passed | `ffa9e4e9212cb1125111a60056342d44b65390d2ac83ac7ea7362db1a3cd9a40` |
| Authorization | `0c718e92-0fbe-4aa5-91b2-e8a82c1c2fe9` | Passed | `26f59c2297eb0d1680ad07052c6db1185e4bdc7d7b2a2b065bff73fe177417e8` |
| Load | `66b15925-20a8-44d1-8e73-c91eff0d7c99` | Passed | `db477a0ebddeff9c6b18b094a16b455c2d4497e729d92fdb77750e5ffac25ca1` |
| Deadline | `623e875c-16a1-456e-b2ad-d1eac5dc3092` | Passed | `e83800542b1756db3a214661df22c7db1accfb5d43da67a2553c124ba1765621` |
| Incident | `594007d8-e62c-4958-b3a5-1db3c24b5144` | Passed | `f0719dd7672ccb182dfe5358d309bb5f59364cdb6222a56b5cdc17860cefd20c` |
| Soak | `5bf872a2-e597-4c2c-ae41-8f82bb7b0da5` | Passed | `6fa1ba31829b9987922ca38edc0784a0aa548ed3f2c6831309e77f8ce84c5359` |
| Cleanup | Pending | Pending |  |

## Manual evidence

Ten order journeys were executed and recorded in the owner-only workbook. Six passed; four exposed post-soak findings and require retest on the corrected artifacts. Android emulator observations do not satisfy the physical Pixel 9 gate. See [the Phase 7 checklist](phase-7-device-browser-checklist.md). No blank manual row is a pass.

## Continuity, cleanup, and limitations

- 24-hour monitoring continuity: Passed; 1,434 heartbeats, maximum gap 64.692 seconds, no gap over five minutes
- Automated terminal journeys: `40 / 40`
- Manual terminal journeys: `6 / 10` accepted; four post-fix retests pending
- Critical incidents / missed orders / duplicate transitions: `0 / 0 / 0` in finalized soak evidence
- Baseline and tagged-fixture reconciliation: Pending
- Mac power restoration and LaunchAgent removal: Pending
- Reboot/login interruption: Pending

## Decision

Phase 7 remains open. The backend reliability soak remains valid for the unchanged database, runner, and guarded order contracts; the Customer and Restaurant source fixes require fresh artifacts and targeted manual regression. Phase 8 must not begin until every automated and manual gate passes and the app owner explicitly approves Phase 7.
