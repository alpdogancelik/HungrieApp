# Phase 7 Device, Browser, and Automated Qualification Checklist

**Status:** Open. Empty evidence cells are release blocking. Automated output cannot satisfy manual rows.

## Automated evidence

| ID | Check | Required result | Evidence / result |
|---|---|---|---|
| AUTO-01 | Clean reset, lint, pgTAP, concurrency, runner/power tests | All pass | Pending |
| AUTO-02 | Backup, checksum, migration, grants, RLS, cron, environment isolation | Exact reviewed Staging state; Production untouched | Pending |
| AUTO-03 | LaunchAgent and power preflight | AC, AC sleep disabled, managed assertions active, reviewed paths loaded | Pending |
| AUTO-04 | Authorization matrix | Active roles pass only their portal/scope; pending, suspended, revoked, unmapped and anonymous fail closed; recent-TOTP and stale auth behave correctly | Pending |
| AUTO-05 | Load | 10 workers; 50/min × 15m; 100/min × 2m; latency/error limits pass | Pending |
| AUTO-06 | Deadline | More than 100 drained; natural five-minute order expires; p95/max lag pass | Pending |
| AUTO-07 | Incident detector | Below/at/above threshold, ratio, concurrency, uniqueness, resolution, cooldown, SLA and no automatic suspension pass | Pending |
| AUTO-08 | Persistent soak | 40 real-contract automated terminal journeys over 24h; no uncovered heartbeat gap over 5m | Pending |
| AUTO-09 | Monitoring/reconciliation | No critical incident, permanently missed order, duplicate transition, unexplained backlog, or unexplained failure | Pending |
| AUTO-10 | Cleanup | Only `phase7_` fixtures removed; baseline counts/digests reconcile; settings and Mac power restored; runner removed | Pending |

## Manual Customer device evidence

Run every row on both a physical iPhone using build 40 and Google Pixel 9 using version code 39.

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

## Manual Admin evidence

| ID | Manual observation | Result |
|---|---|---|
| ADMIN-01 | MFA enrollment/sign-in, recent-auth boundary, suspension and recovery |  |
| ADMIN-02 | Restaurant/account/incident handling and audit reason visibility |  |
| ADMIN-03 | Five manual journeys complete with Customer and Restaurant flows (shared total of 10 manual journeys) |  |

## Owner acceptance

- Automated terminal journeys: `0 / 40` until durable evidence is recorded.
- Manual terminal journeys: `0 / 10` until human evidence is recorded.
- App-owner Phase 7 approval: **Not given**.
