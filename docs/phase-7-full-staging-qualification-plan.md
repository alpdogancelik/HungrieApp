# Frontend Separation Phase 7 — Full Staging Qualification

**Status:** Implementation in progress; no qualification gate is accepted yet
**Branch:** `phase7-full-staging-qualification-20260918`
**Environment:** Staging only
**Production:** Must remain unchanged

## Purpose and acceptance contract

Phase 7 runs Customer, Restaurant, and Admin together against Staging and proves authorization isolation, order reliability, incident behavior, performance, recovery, browser/device behavior, and exact cleanup. Acceptance requires all automated evidence, all manual device/browser evidence, 50 terminal soak journeys, and explicit app-owner approval.

The locked limits are: Realtime visibility p95 at most 2 seconds; polling/reconnect recovery at most 20 seconds; deadline cancellation p95 at most 30 seconds late and maximum 75 seconds late; core reads/transitions p95 at most 1 second; quote/create p95 at most 1.5 seconds; unexpected request failure rate below 1%. Load uses ten workers at 50 orders/minute for 15 minutes and 100 orders/minute for two minutes. The 24-hour soak contains 40 automated real-contract journeys and 10 manual journeys.

## Persistent execution

The qualification worker is a Node process managed by the owner user’s macOS LaunchAgent. The LaunchAgent starts `/usr/bin/caffeinate -ims` around the reviewed runner, restarts it after process failure, and remains independent of terminals and coding-agent sessions. A reboot requires the owner user to log in before a LaunchAgent can resume. This design does not claim unattended pre-login recovery. A secured, separately reviewed and restart-tested LaunchDaemon would be required for that.

Every run has an immutable manifest, atomic state, append-only events/measurements/heartbeats, stable operation IDs, resumable per-operation state, and final SHA-256 evidence under owner-only `secure/phase7/<run-id>/`. The manifest binds both the Git commit and a deterministic checksum of the reviewed Phase 7 runner sources; starting evidence fails closed when the source worktree is dirty. Directories use `0700`; sensitive files use `0600`. Live-PID runner, workload, and per-journey locks prevent concurrent processing after a parent restart while a child still survives. A restarted process replays an unchanged operation with its original ID, checks authoritative state after uncertainty, and skips completed work. Stop requests use a separate atomic control file so a long-running worker can acknowledge them without waiting for its parent lock; resuming clears that control file.

The daemon records a heartbeat every minute and operational health every five minutes. Continuity covers the manifest start boundary, every adjacent heartbeat, and the finalization boundary. An uncovered gap over five minutes invalidates a soak. It schedules 40 journeys evenly across 24 hours and catches up at most two overdue journeys per tick.

## Power preflight

Before a soak, preflight records sanitized AC settings and requires AC power, `sleep 0` on the active AC profile, the managed `caffeinate` assertions, an available owner session, and the reviewed LaunchAgent loaded with the expected runner/evidence paths. Display sleep may remain enabled. The prior AC profile must be preserved and restored after completion or abort. Reboot gaps follow the same five-minute continuity rule.

## Guarded commands

```text
npm run phase7:runner:install
npm run phase7:runner:status
npm run phase7:runner:remove
npm run phase7:fixtures:prepare -- --credential=<external-json> --firebase-api-key=<key> --confirm=staging:phase7-fixtures
npm run phase7:staging -- backup --expect-sha256=<sha> --confirm=staging:phase7-backup
npm run phase7:staging -- preflight --expect-sha256=<sha>
npm run phase7:staging -- apply --expect-sha256=<sha> --backup-manifest=<restricted-path> --confirm=staging:phase7-migration
npm run phase7:staging -- verify --expect-sha256=<sha>
npm run phase7:run:start -- --kind=<preflight|authorization|load|deadline|incident|soak|cleanup>
npm run phase7:run:status -- --run-id=<uuid>
npm run phase7:run:resume -- --run-id=<uuid>
npm run phase7:run:stop -- --run-id=<uuid>
npm run phase7:run:verify -- --run-id=<uuid>
```

The Staging migration is checksum pinned and its apply command requires a recent verified backup. Environment guards reject missing, overlapping, or Production-like targets. Disposable database/Firebase objects use the `phase7_` prefix. The isolated load Restaurant has no push registrations.

## Reliability implementation

Migration `20260918100000_phase7_staging_reliability.sql` adds a private five-minute repeated-non-response detector. It evaluates the preceding 30 minutes, opens an incident at three ignored orders and a 50% non-response ratio, serializes concurrent evaluation, permits one unresolved incident per Restaurant, enforces a 60-minute post-resolution cooldown, records the 15-minute acknowledgement and 24-hour resolution targets, and writes a PII-free audit event. It never changes Restaurant lifecycle or order acceptance. Deadline expiry is scheduled every 15 seconds to support the locked lag target.

## Automated qualification

Automated runs cover guarded real-token portal/tenant probes, direct-write denial, paced load, more-than-100 deadline expiry with a natural five-minute order, incident threshold/ratio/concurrency/cooldown behavior, continuous health samples, restart-safe 24-hour journeys, and tagged cleanup reconciliation. A terminal journey is counted only after an authoritative delivered/canceled state is read.

Automation cannot pass a physical or human-observation row. The separate checklist in [Phase 7 device and browser checklist](phase-7-device-browser-checklist.md) is authoritative for those rows.

## Manual qualification

Fresh Customer artifacts remain version `1.0.2`, iOS build `40`, and Android version code `39`. The full carried Phase 6 matrix runs on a physical iPhone and Pixel 9. Restaurant runs on current Chrome and Edge on Windows and macOS. Push permission/revocation, closed-page notification delivery, sleep/wake, physical notification selection, keyboard/safe-area/accessibility, language/theme, PWA installation, private-cache inspection, and visual review require recorded human observation.

## Completion

After automation and manual evidence complete, the Phase 7 review records run/build/deployment IDs, source and artifact checksums, power state, browser/device versions, measurements, continuity, failures/retests, cleanup, limitations, and the LaunchAgent login requirement. Cleanup restores application policies, test accounts/registrations, temporary settings, and prior Mac power configuration, then removes the LaunchAgent and verifies no Phase 7 process remains. The architecture status changes only after every gate passes and the app owner explicitly approves Phase 7.
