# Phase 7 Device, Browser, and Automated Qualification Checklist

**Status:** Qualification complete; awaiting explicit app-owner Phase 7 approval. Automated output does not replace the app owner's manual observations.

## Automated evidence

| ID | Check | Required result | Evidence / result |
|---|---|---|---|
| AUTO-01 | Clean reset, lint, pgTAP, concurrency, runner/power tests | All pass | Passed on 2026-09-21: clean local reset; clean database lint; 29 pgTAP files / 805 assertions; courier, Admin-role, invitation-reissue, and incident concurrency probes; 21/21 persistent-runner/power tests; JavaScript regression suite |
| AUTO-02 | Backup, checksum, migration, grants, RLS, cron, environment isolation | Exact reviewed Staging state; Production untouched | Passed: restricted backup manifests and file checksums verified; migration `ac3419cade9767d9257fdceb963ee42d5e454934dec73cd59b17a2366286a9cd` applied; 15-second expiry and five-minute incident schedules verified; authenticated detector execution denied; guarded owner verified; Production unchanged |
| AUTO-03 | LaunchAgent and power preflight | AC, AC sleep disabled, managed assertions active, reviewed paths loaded | Passed in preflight run `60fd8713-8865-4a2a-8e94-b5fb4ebf5321`; AC power, idle sleep disabled, managed `caffeinate`, owner session, reviewed LaunchAgent paths, and post-reboot login requirement verified. Evidence SHA-256 `ffa9e4e9212cb1125111a60056342d44b65390d2ac83ac7ea7362db1a3cd9a40` |
| AUTO-04 | Authorization matrix | Active roles pass only their portal/scope; pending, suspended, revoked, unmapped and anonymous fail closed; recent-TOTP and stale auth behave correctly | Passed in run `0c718e92-0fbe-4aa5-91b2-e8a82c1c2fe9`; see Phase 7 review |
| AUTO-05 | Load | 10 workers; 50/min × 15m; 100/min × 2m; latency/error limits pass | Passed in run `66b15925-20a8-44d1-8e73-c91eff0d7c99`; see Phase 7 review |
| AUTO-06 | Deadline | More than 100 drained; natural five-minute order expires; persisted drain/job-health evidence and p95/max lag pass | Passed in run `623e875c-16a1-456e-b2ad-d1eac5dc3092`; see Phase 7 review |
| AUTO-07 | Incident detector | Below/at/above threshold, ratio, concurrency, uniqueness, resolution, cooldown, SLA and no automatic suspension pass | Passed in run `594007d8-e62c-4958-b3a5-1db3c24b5144`; see Phase 7 review |
| AUTO-08 | Persistent soak | 40 real-contract automated terminal journeys over 24h; no uncovered heartbeat gap over 5m | Passed in run `5bf872a2-e597-4c2c-ae41-8f82bb7b0da5`: 40/40, maximum heartbeat gap 64.692s; see Phase 7 review |
| AUTO-09 | Monitoring/reconciliation | No critical incident, permanently missed order, duplicate transition, unexplained backlog, or unexplained failure | Passed: soak monitoring recorded 0 critical incidents, permanently missed orders, and duplicate transitions; final reconciliation passed in AUTO-10 |
| AUTO-10 | Cleanup | Cleanup SQL first passes rollback-only validation; only the canonical `phase7_` fixture set is removed; zero nonterminal/duplicate-transition rows; baseline counts/digests reconcile; settings and Mac power restored; runner removed | Passed on 2026-09-21. Rollback-only validation passed with 0 duplicate transitions and 0 nonterminal orders. Tagged automation fixtures and the separately identified post-baseline manual-test artifacts were removed after a fresh restricted backup. Cached-session recreation was blocked with Firebase-subject tombstones. Cleanup run `eaf2ed51-c786-4ecc-9642-e7c98104fc09` restored exact baseline counts/digests and verified with SHA-256 `826580e9c17fb81b4ebfaa25014e4fef26c8ef21dc44c21a9c2cfe5574fb9207`. Mac power was restored; the LaunchAgent/plist and managed processes were removed; no runnable Phase 7 run remains |

## Manual Customer device evidence

Run the follow-up rows on a physical iPhone and Google Pixel 9 using build/version code 51 after the app owner builds it. Build 51 makes native order cards wider, separates review from the price row, and restores a visible theme-safe Reorder button on Order details; build 50 changes the mobile Orders background to `#FAFAFA` and keeps its full-width sticky header opaque above elevated cards; build 48 contains the corrected web-style Orders cards with native wrapper-owned spacing; build 45 includes the narrow-screen Search/Cuisines layout fix; build 44 includes the Customer push-language fix. Emulator installation is supplementary evidence only. Build 40 is earlier post-soak evidence; Android version code 39 is pre-fix evidence.

Supplementary Android evidence: signed Staging build 48 was installed in place on the Pixel 9 emulator. The Orders screen showed distinct white rounded cards, subtle outer borders/shadows, correct internal padding, readable actions, and no unwanted internal gray divider lines. This observation supports CUST-14 but does not replace its physical Pixel 9 row.

| ID | Manual observation | iPhone | Pixel 9 |
|---|---|---|---|
| CUST-01 | Registration, verification, restoration, sign-out/in, deletion/re-registration | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-02 | Wrong portal, suspension, revocation, and live authorization loss | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-03 | Catalog, profile, addresses, favorites, and notification preferences | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-04 | Configured cart, quote, address guidance, idempotent checkout | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-05 | Full lifecycle, background/foreground recovery, history/detail, cancellation reason | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-06 | Review System v2 once per order and immediate aggregate refresh | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-07 | Push receipt, tap to order, signed-out handling, privileged payload rejection | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-08 | Offline/reconnect, Supabase outage, maintenance, minimum-version block/restore | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-09 | Keyboard, safe area, large text, screen reader, contrast, visual design | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-10 | Turkish/English and supported light/dark theme | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-11 | Five complete terminal manual order journeys across Customer and staffed Restaurant | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-12 | Canceled order shows the Restaurant's customer-visible message when provided and omits its message area when blank; older internal notes remain hidden | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-13 | Categories and Search/Cuisines cards show food images or a visible loading fallback and complete labels; narrow-screen rows fill the width without accidental wrapping or gray footer blocks; incomplete final row aligns from the left | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-14 | Orders list uses distinct rounded white cards with a subtle outer border/shadow like the old web version; its full-width `#FAFAFA` sticky header remains opaque above scrolling cards, with no border bleed-through, unwanted gray internal lines, or visible sticky-header shadow; content and actions remain readable | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-15 | Set Turkish, receive an order-status push and review-reply push in Turkish; switch to English and confirm later pushes use English; repeat after cold start | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-16 | On a narrow phone, recent searches scroll horizontally and short names such as “Desserts” remain readable | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |
| CUST-17 | Delivered Order details shows “Reorder / Siparişi tekrarla” as a clearly visible outlined action in light and dark themes; wider Orders cards show the full price while Review and Reorder remain readable on separate rows | Passed — app-owner report, 2026-09-21 | Passed — app-owner report, 2026-09-21 |

## Manual Customer web evidence

| ID | Manual observation | Result |
|---|---|---|
| CWEB-01 | Orders retain the original white rounded cards, subtle outer borders/shadows, status, cancellation reason, and actions | Passed — app-owner report, 2026-09-21 |

## Manual Restaurant browser evidence

| ID | Manual observation | macOS Chrome | macOS Edge | Windows Chrome | Windows Edge |
|---|---|---|---|---|---|
| REST-01 | Staffed connected order screen and authoritative lifecycle | Passed | Passed | Passed | Passed |
| REST-02 | Realtime, polling, reconnect, competing tabs, duplicate triggers | Passed | Passed | Passed | Passed |
| REST-03 | Foreground, background, and closed-page Web Push | Passed | Passed | Passed | Passed |
| REST-04 | Real permission grant, denial, and revocation | Passed | Passed | Passed | Passed |
| REST-05 | Notification selection after sign-out/session expiry | Passed | Passed | Passed | Passed |
| REST-06 | Machine sleep/wake and network loss/recovery | Passed | Passed | Passed | Passed |
| REST-07 | PWA installation and private-cache inspection | Passed | Passed | Passed | Passed |
| REST-08 | Keyboard, screen reader, contrast, zoom, and visual review | Passed | Passed | Passed | Passed |
| REST-09 | Notification selection loads the related order as soon as Restaurant access is ready, with no false service-unavailable error or poll wait | Passed | Passed | Passed | Passed |
| REST-10 | Cancellation message is clearly labeled as customer-visible; submitted text and empty-message behavior match Customer Order details | Passed | Passed | Passed | Passed |

All Restaurant cells above are recorded from the app owner's 2026-09-21 completion report.

## Manual Admin evidence

| ID | Manual observation | Result |
|---|---|---|
| ADMIN-01 | MFA enrollment/sign-in, recent-auth boundary, suspension and recovery | Passed — app-owner report, 2026-09-21 |
| ADMIN-02 | Restaurant/account/incident handling and audit reason visibility | Passed — app-owner report, 2026-09-21 |
| ADMIN-03 | Five manual journeys complete with Customer and Restaurant flows (shared total of 10 manual journeys) | Passed — app-owner report, 2026-09-21 |

## Owner acceptance

- Automated terminal journeys: `40 / 40` in finalized durable soak evidence.
- Manual terminal journeys: `10 / 10`; the app owner reported all remaining device/browser rows and post-fix retests passed on 2026-09-21.
- App-owner Phase 7 approval: **Not given**.
