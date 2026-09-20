# Phase 7 Device, Browser, and Automated Qualification Checklist

**Status:** Open. Empty evidence cells are release blocking. Automated output cannot satisfy manual rows.

## Automated evidence

| ID | Check | Required result | Evidence / result |
|---|---|---|---|
| AUTO-01 | Clean reset, lint, pgTAP, concurrency, runner/power tests | All pass | Pending |
| AUTO-02 | Backup, checksum, migration, grants, RLS, cron, environment isolation | Exact reviewed Staging state; Production untouched | Pending |
| AUTO-03 | LaunchAgent and power preflight | AC, AC sleep disabled, managed assertions active, reviewed paths loaded | Pending |
| AUTO-04 | Authorization matrix | Active roles pass only their portal/scope; pending, suspended, revoked, unmapped and anonymous fail closed; recent-TOTP and stale auth behave correctly | Passed in run `0c718e92-0fbe-4aa5-91b2-e8a82c1c2fe9`; see Phase 7 review |
| AUTO-05 | Load | 10 workers; 50/min × 15m; 100/min × 2m; latency/error limits pass | Passed in run `66b15925-20a8-44d1-8e73-c91eff0d7c99`; see Phase 7 review |
| AUTO-06 | Deadline | More than 100 drained; natural five-minute order expires; persisted drain/job-health evidence and p95/max lag pass | Passed in run `623e875c-16a1-456e-b2ad-d1eac5dc3092`; see Phase 7 review |
| AUTO-07 | Incident detector | Below/at/above threshold, ratio, concurrency, uniqueness, resolution, cooldown, SLA and no automatic suspension pass | Passed in run `594007d8-e62c-4958-b3a5-1db3c24b5144`; see Phase 7 review |
| AUTO-08 | Persistent soak | 40 real-contract automated terminal journeys over 24h; no uncovered heartbeat gap over 5m | Passed in run `5bf872a2-e597-4c2c-ae41-8f82bb7b0da5`: 40/40, maximum heartbeat gap 64.692s; see Phase 7 review |
| AUTO-09 | Monitoring/reconciliation | No critical incident, permanently missed order, duplicate transition, unexplained backlog, or unexplained failure | Soak monitoring passed with 0 critical incidents, missed orders, and duplicate transitions; final fixture cleanup reconciliation remains AUTO-10 |
| AUTO-10 | Cleanup | Cleanup SQL first passes rollback-only validation; only the canonical `phase7_` fixture set is removed; zero nonterminal/duplicate-transition rows; baseline counts/digests reconcile; settings and Mac power restored; runner removed | Pending |

## Manual Customer device evidence

Run the follow-up rows on a physical iPhone using the signed build 41 artifact and Google Pixel 9 using version code 41. Both owner-only artifacts are available; emulator installation is supplementary evidence only. Build 40 is earlier post-soak evidence; Android version code 39 is pre-fix evidence.

| ID | Manual observation | iPhone | Pixel 9 |
|---|---|---|---|
| CUST-01 | Registration, verification, restoration, sign-out/in, deletion/re-registration |  |  |
| CUST-02 | Wrong portal, suspension, revocation, and live authorization loss |  |  |
| CUST-03 | Catalog, profile, addresses, favorites, and notification preferences |  |  |
| CUST-04 | Configured cart, quote, address guidance, idempotent checkout |  |  |
| CUST-05 | Full lifecycle, background/foreground recovery, history/detail, cancellation reason |  |  |
| CUST-06 | Review System v2 once per order and immediate aggregate refresh |  |  |
| CUST-07 | Push receipt, tap to order, signed-out handling, privileged payload rejection |  |  |
| CUST-08 | Offline/reconnect, Supabase outage, maintenance, minimum-version block/restore |  |  |
| CUST-09 | Keyboard, safe area, large text, screen reader, contrast, visual design |  |  |
| CUST-10 | Turkish/English and supported light/dark theme |  |  |
| CUST-11 | Five complete terminal manual order journeys across Customer and staffed Restaurant |  |  |
| CUST-12 | Canceled order shows the Restaurant's customer-visible message when provided and omits its message area when blank; older internal notes remain hidden |  |  |

## Manual Restaurant browser evidence

| ID | Manual observation | macOS Chrome | macOS Edge | Windows Chrome | Windows Edge |
|---|---|---|---|---|---|
| REST-01 | Staffed connected order screen and authoritative lifecycle |  |  |  |  |
| REST-02 | Realtime, polling, reconnect, competing tabs, duplicate triggers |  |  |  |  |
| REST-03 | Foreground, background, and closed-page Web Push |  |  |  |  |
| REST-04 | Real permission grant, denial, and revocation |  |  |  |  |
| REST-05 | Notification selection after sign-out/session expiry |  |  |  |  |
| REST-06 | Machine sleep/wake and network loss/recovery |  |  |  |  |
| REST-07 | PWA installation and private-cache inspection |  |  |  |  |
| REST-08 | Keyboard, screen reader, contrast, zoom, and visual review |  |  |  |  |
| REST-09 | Notification selection loads the related order as soon as Restaurant access is ready, with no false service-unavailable error or poll wait |  |  |  |  |
| REST-10 | Cancellation message is clearly labeled as customer-visible; submitted text and empty-message behavior match Customer Order details |  |  |  |  |

## Manual Admin evidence

| ID | Manual observation | Result |
|---|---|---|
| ADMIN-01 | MFA enrollment/sign-in, recent-auth boundary, suspension and recovery |  |
| ADMIN-02 | Restaurant/account/incident handling and audit reason visibility |  |
| ADMIN-03 | Five manual journeys complete with Customer and Restaurant flows (shared total of 10 manual journeys) |  |

## Owner acceptance

- Automated terminal journeys: `40 / 40` in finalized durable soak evidence.
- Manual terminal journeys: `6 / 10` accepted from the owner-only workbook; four post-fix retests remain. The physical Pixel 9 and other empty manual rows remain open.
- App-owner Phase 7 approval: **Not given**.
