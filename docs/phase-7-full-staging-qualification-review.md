# Phase 7 Full Staging Qualification Review

**Status:** Complete and accepted by the app owner on 2026-09-21
**Production changed:** No

**2026-09-21 finalization:** The app owner reported all remaining physical-device, browser, accessibility, notification, visual, and post-fix manual checks passed. This final report supersedes the pending language in the chronological follow-up notes below. Automated cleanup, exact baseline reconciliation, power restoration, and runner removal also passed. The app owner then explicitly approved Phase 7 on 2026-09-21.

**2026-09-20 follow-up:** The app owner reported that a Restaurant notification link still showed a transient access/order error until polling, and requested an optional Restaurant-written cancellation message on Customer Order details. Corrected source and fresh mobile/Restaurant artifacts were subsequently qualified by the app owner. The earlier build-40 evidence remains historical.

**2026-09-21 follow-up:** The app owner reported gray blocks and clipped labels throughout the Customer Categories grid. The card surface, shadow placement, footer sizing, image fitting, and final-row alignment were corrected in source and later passed the app owner's physical-device checks.

**2026-09-21 Orders follow-up:** The app owner reported remaining gray lines in the Customer Orders list. Explicit card dividers, the Android card outline, and the sticky-header elevation were removed; spacing now separates order sections. The corrected layout later passed the app owner's physical-device checks.

**2026-09-21 notification-language follow-up:** The app owner reported English Customer pushes while the app was set to Turkish. The Customer app now restores its saved language before push registration and stores that language on its device token; language switches update the registered token. The worker continues to render Turkish or English from the claimed delivery language, with a profile-language fallback for older tokens. The additive Staging migration `20260921100000_customer_push_language.sql` passed guarded preflight, restricted backup, application, grant checks, and exact order-baseline reconciliation. The app owner later reported the Turkish/English physical-device push retests passed.

**2026-09-21 narrow-screen Search follow-up:** Search/Cuisines cards could wrap an intended four-column row into three undersized cards on narrow phones, leaving a large empty strip. Card widths now derive from usable screen width, with three columns on narrow screens and four when space permits. Recent-search chips scroll horizontally instead of truncating short names. A cuisine image has a visible fallback while loading. The app owner later reported the narrow-screen physical-device check passed.

**2026-09-21 Orders card direction correction:** The app owner clarified that the original web Orders cards are the desired design. The short-lived borderless web change was reversed in source. Native Orders cards now use the same white rounded surface and subtle outer border/shadow as web. Later emulator and app-owner physical-device checks passed the corrected layout; the earlier build-44 screenshot remains historical.

**2026-09-21 Android Orders card verification:** Signed Staging build 48 moved card spacing to the native surface wrapper after build 47 exposed dropped `Pressable` padding. Build 48 was installed in place on the Pixel 9 emulator and showed the intended old web-style white rounded cards, subtle outer border/shadow, correct internal padding, readable actions, and no unwanted internal gray divider lines. The app owner later reported the required physical Pixel 9 and iPhone observations passed.

**2026-09-21 Orders background and sticky-header follow-up:** Mobile light-mode Orders now uses `#FAFAFA`. Its sticky header uses the same opaque color across the full width and is layered above elevated cards with a transparent Android shadow, preventing card-border bleed-through without adding a visible header shadow. Source checks and the app owner's physical-device observation passed.

**2026-09-21 Orders action-layout follow-up:** Order details now renders Reorder as a static, theme-safe orange outlined action because callback-provided native `Pressable` styles were not reliably applied. Native order cards use 14-point side margins instead of 22, reserve the footer for the full price and Reorder action, and place Review on a separate compact outlined row. TypeScript, lint, review UI tests, web export, and the app owner's physical-device observation passed.

This review contains only owner-only durable evidence and app-owner manual observations. It excludes credentials, ID tokens, TOTP seeds, addresses, comments, and Customer PII.

## Source and deployment identity

- Qualified automated baseline source commit: `9659244c2edb291ef2efabd463bf3d44101fe858`
- Post-soak corrected application source commit: `6dcbef4195addb56411313b5ca2d72c341f01f53`; evidence-document head used for fresh builds: `55d6c8028c466bff3d281f19a4c5a0fd132b9edc`
- Cancellation-message and Restaurant notification follow-up source commit: `027ddda4130c6c8592ec1a9a9679e07f7561152f`
- Orders card Android verification source commit: `d2f71254b7fb778736af6f14e11247ce6cd3f099`
- Final qualified source commit: `d3564441541fed3694f851f73f82f7ac720d575d`
- Migration SHA-256: `ac3419cade9767d9257fdceb963ee42d5e454934dec73cd59b17a2366286a9cd`
- Follow-up additive Staging cancellation-message migration SHA-256: `74fc88781ad02518cc60c2d86fd8104ca899c3f622d14fca0551fbbd170cc30b`; applied and grant/RLS verified after a restricted backup. Pre/post migration orders and status-event counts and the order digest reconciled exactly.
- Follow-up additive Staging Customer push-language migration SHA-256: `d36097b124818e12051cefd80526743f782f1562502d98125e7e80451c279e84`; applied after restricted backup and verified. Customer RPC ownership/grants, token privacy, token-first language selection, and the pre/post order baseline reconciled. Physical push observations later passed by app-owner report.
- Runner mode: macOS LaunchAgent with owner-login requirement after reboot
- Customer iOS build 40 / artifact SHA-256: Local signed ad-hoc build `Hungrie-1.0.2-build40-post-soak.ipa`; `dc29f9046d4fbb495835db31e16ef1f83eb89f5a53bec8c55cae4cbf2e5d029b`. Metadata verified as version `1.0.2`, build `40`, bundle `com.hungrie.app`. Cloud EAS build was unavailable because the account's monthly iOS build quota was exhausted; the local EAS build used the approved distribution certificate and device provisioning profile.
- Customer Android version code 40 / EAS ID / artifact SHA-256: `7931a822-75fe-4d11-b99b-e41fb8734b94`; `71c567962d0708aacc53e2932bd573d3827bf8b816fb1a50d657d18d8a842ae2`. The internal APK is `Hungrie-1.0.2-version40-post-soak.apk`; package metadata and emulator installation confirm `com.hungrie.app`, `1.0.2` (40). Version code 39 (`7654738d-62d1-4ca2-a065-93412eb4eec6`) is pre-fix evidence only.
- Follow-up Customer iOS build 41: local signed ad-hoc artifact `Hungrie-1.0.2-build41-cancellation-message.ipa`; SHA-256 `1f136955ba98a0bfccbadf239c51b73efe0ce8e7e6948cf8bcd38c1bbf015cb7`. IPA metadata confirms `com.hungrie.app`, version `1.0.2`, build `41`. The owner-only artifact is mode `0600`; the app owner later reported the physical iPhone retest passed.
- Follow-up Customer Android version code 41: EAS build `0ca9df2e-805e-443b-9b1d-673090fb8871`; owner-only APK `Hungrie-1.0.2-version41-cancellation-message.apk`, SHA-256 `6589e3488e4edf290a4b95bad6f165e70dafa47f8bf08a6608004b2473812d4e`. Package metadata and emulator installation confirm `com.hungrie.app`, version `1.0.2` (41). The artifact is mode `0600`; the app owner later reported the physical Pixel 9 retest passed.
- Follow-up Customer Android version code 48: EAS build `a76a3636-ae49-4392-aaea-85cb91cc15c2`; owner-only APK `Hungrie-1.0.2-version48-orders-cards.apk`, SHA-256 `8e509cbb9f5afc138a84767335aaf3ed0904c5483dbf56728acabda1766f5635`. Package metadata and emulator installation confirm `com.hungrie.app`, version `1.0.2` (48), and the expected Staging signer. Emulator screenshot SHA-256: `17ae869152f454c0f725a24d74b7ada04182c92502e64bf0265ced744ef43777`. The app owner later reported the physical Pixel 9 and iPhone checks passed.
- Restaurant Staging deployment/checksum: `https://hungrie-restaurant--l38zjzhj1h.expo.app` (alias `https://hungrie-restaurant--staging.expo.app`); `f7d21709fb9b92de27b745ce3f2cf1fe72c15c687a628d0857e4a5f726f11353`
- Follow-up Restaurant Staging deployment/checksum: `https://hungrie-restaurant--dkxapku412.expo.app` (same Staging alias); `f7e465831abfe73bcd6eac8c3887c65637072b40ba4024a521033cf558ec075d`. The app owner later reported the notification cold-link manual timing retest passed.
- Admin Staging deployment ID/checksum: `dpl_313uBGgZkTBNv1m9R3FMDMkrG7d5`; `d19af5190011f509a45fa5a3da426300a0bf59a08dbc0f30dec7d40889c7fe8a`; alias `https://hungrie-admin-web-phase1.vercel.app`

## Automated runs

| Kind | Run ID | Result | Evidence checksum / notes |
|---|---|---|---|
| Preflight | `60fd8713-8865-4a2a-8e94-b5fb4ebf5321` | Passed | `ffa9e4e9212cb1125111a60056342d44b65390d2ac83ac7ea7362db1a3cd9a40` |
| Authorization | `0c718e92-0fbe-4aa5-91b2-e8a82c1c2fe9` | Passed | `26f59c2297eb0d1680ad07052c6db1185e4bdc7d7b2a2b065bff73fe177417e8` |
| Load | `66b15925-20a8-44d1-8e73-c91eff0d7c99` | Passed | `db477a0ebddeff9c6b18b094a16b455c2d4497e729d92fdb77750e5ffac25ca1` |
| Deadline | `623e875c-16a1-456e-b2ad-d1eac5dc3092` | Passed | `e83800542b1756db3a214661df22c7db1accfb5d43da67a2553c124ba1765621` |
| Incident | `594007d8-e62c-4958-b3a5-1db3c24b5144` | Passed | `f0719dd7672ccb182dfe5358d309bb5f59364cdb6222a56b5cdc17860cefd20c` |
| Soak | `5bf872a2-e597-4c2c-ae41-8f82bb7b0da5` | Passed | `6fa1ba31829b9987922ca38edc0784a0aa548ed3f2c6831309e77f8ce84c5359` |
| Cleanup | `eaf2ed51-c786-4ecc-9642-e7c98104fc09` | Passed | `826580e9c17fb81b4ebfaa25014e4fef26c8ef21dc44c21a9c2cfe5574fb9207`; exact tagged cleanup and baseline reconciliation |

## Manual evidence

Ten order journeys were executed and recorded in the owner-only workbook. The app owner reported all ten journeys, all post-fix retests, and every remaining manual device/browser row passed on 2026-09-21. See [the Phase 7 checklist](phase-7-device-browser-checklist.md). The evidence records owner observation rather than inferring manual success from automation.

## Continuity, cleanup, and limitations

- 24-hour monitoring continuity: Passed; 1,434 heartbeats, maximum gap 64.692 seconds, no gap over five minutes
- Automated terminal journeys: `40 / 40`
- Manual terminal journeys: `10 / 10` accepted by app-owner report
- Critical incidents / missed orders / duplicate transitions: `0 / 0 / 0` in finalized soak evidence
- Baseline and tagged-fixture reconciliation: Passed. Rollback-only cleanup validation passed; all tagged fixtures were removed; 31 post-baseline manual terminal orders and 3 test profiles were removed after a fresh restricted backup; cached-session recreation was blocked by three Firebase-subject tombstones; baseline counts and digests reconcile exactly
- Final cleanup run: `eaf2ed51-c786-4ecc-9642-e7c98104fc09`; evidence SHA-256 `826580e9c17fb81b4ebfaa25014e4fef26c8ef21dc44c21a9c2cfe5574fb9207`
- Consolidated owner-only automated reconciliation SHA-256: `16cc86236bd58f44b139a7e820a9c4c428c4e2ea2286cc66c5c75f728ed6e50e`
- Mac power restoration and LaunchAgent removal: Passed. The saved AC profile was restored, the LaunchAgent plist was removed, `launchctl` reports it unloaded, no Phase 7 or managed `caffeinate` process remains, and no runnable Phase 7 run remains
- Reboot/login interruption: None recorded. The runner retained the documented owner-login requirement and never claimed unattended pre-login recovery

## Decision

All automated and manual Phase 7 qualification gates are complete. The final local qualification recorded a clean reset, clean database lint, 29 pgTAP files with 805 passing assertions, four passing concurrency probes, 21 passing persistent-runner/power tests, and a passing JavaScript regression suite. Staging migration ownership, grants, cron schedules, backup checksums, environment isolation, cleanup, and exact baseline restoration were reverified. Production was not changed.

The app owner explicitly approved Phase 7 on 2026-09-21. Phase 7 is complete and Phase 8 may begin through its separately reviewed process. Production remains unchanged and outside this approval.
