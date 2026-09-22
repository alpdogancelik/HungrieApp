# Restaurant Earnings and Admin Commission — Phase 5 Staging Review

**Status:** Phase 5 accepted by the app owner on 2026-09-22; Production unchanged and not authorized.  
**Run:** `earnp5_20260922a`  
**Date:** 2026-09-22  
**Production:** not accessed or changed

## Environment and hosted-mutation preflight

The fail-closed utility positively resolved the approved targets before any write:

| Target | Verified non-secret identity |
|---|---|
| Supabase Staging | `rlrfvqskzvpysewdxqcr` |
| Shared non-production Firebase | `hungrieapp-a2288` |
| Admin Vercel project | `prj_aCnq7HJXVEdrh0l40DDSCavVVPlz` |
| Restaurant EAS project | `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1` |

Development `rgjlsjwsitbnwoetmidb` and every registered Production reference were rejected. The utility logged these non-secret identities before authenticated requests, accepted no implicit environment, and found zero stale `earnp5_` database or Firebase fixtures.

Pre-migration history contained the expected 50 ordered versions through `20260921100000_customer_push_language.sql`. The sole pending migration was `20260922100000_restaurant_earnings_admin_commission.sql`, whose SHA-256 was `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`. Capability objects were absent. Existing rollback targets were captured before mutation:

- Admin deployment `dpl_2g6z6XS4b926eDX7aLMvmv44Kx1x` at `hungrie-admin-web-phase1-49j43bhpx-nurlan-ildirimli-s-projects.vercel.app`.
- Restaurant deployment `https://hungrie-restaurant--dkxapku412.expo.app`, HTML SHA-256 `cc5f41a8a4a788758a58298f78881f86370fc41e16e08f0d00e24c1af12c8a11`.

The deterministic application source manifest covered 104 Admin, Restaurant, shared-package, configuration, and lock files and had SHA-256 `670d75226a4ecf88f4c1bc148083294f326a3970a487b9d446ab9bd8303bb6fd`.

## Backup and migration

The owner-only run directory and files use modes `0700` and `0600`. The protected backup manifest records creation time, Staging identity, scope, checksums, sensitivity, and retention. It was fresh at mutation time and contains:

| Payload | Scope | SHA-256 |
|---|---|---|
| `schema.sql` | schema-only `public`, `private`, `migration`, and `cron` | `b7746410926aef6003e8e262e158ba56c32b6ee60ec36d33dbecb8cc52559d8e` |
| `restaurants.json` | targeted `public.restaurants` data | `5ec863df74dc12b1136cec960b7f3fa4e9e60bd1e5a075a8b838846143689560` |
| `baseline.json` | non-PII protected counts and keyed digests | `1c6aed9c163024cf679250e602d0dc1248204981624840feae013c1b929513ed` |

No authentication secret, token, TOTP seed, unnecessary Customer PII, or backup content is included here. Payload retention is Phase 5 acceptance plus seven calendar days.

Exactly the accepted earnings migration was applied and recorded once. Post-apply history is aligned through `20260922100000`. The persisted `restaurant_earnings_v1` capability row exists with `enabled = false`.

## Hosted structure and security

Direct hosted inspection found:

- Five private relations with enabled and forced RLS.
- Six guarded RPCs owned by `hungrie_api_owner` with empty search paths.
- Six minimum authenticated execute grants and zero direct client grants on private financial relations.
- Seven purpose-specific indexes.
- Three enabled immutable triggers.
- One expected `*/5 * * * *` cron entry.
- Initially zero rules, terms, snapshots, and alerts.
- Hosted database lint: zero errors.
- Hosted/local generated types are semantically identical to the checked-in type contract; the only local textual difference is one trailing newline. The tracked file was not edited.

## Financial, concurrency, authorization, and plans

Nine disposable Firebase identities and eight mapped profiles were created under `earnp5_20260922a`: recent-TOTP super-admin, ordinary MFA Admin, owner, manager, Customer, second owner, suspended, revoked, and unmapped. Five Restaurants cover active, pending, suspended, closed, and cross-Restaurant cases. Exact UIDs and database identifiers are only in the protected manifest.

The real Staging probe passed:

- Rates 0, 10000, and 1 basis point; exact replay; changed-input operation conflict; duplicate effective time; backdating rejection; before/exact/after rule selection; and existing-order non-retroactivity.
- Below/at/above half-kuruş rounding; cash and POS; catalog isolation; sequential/replayed/concurrent delivery; canceled/nonterminal exclusion; stable concurrent scheduling retries; and concurrent order/rule creation.
- 43 participating orders, exactly 43 terms rows, 40 delivered snapshots, and one stable rule/audit result per operation.
- Summary, series, cash/POS, snapshot, and database reconciliation.
- Opaque keyset pagination returned 25 then 11 rows.
- Owner success; ordinary Admin read-only; and manager, cross-Restaurant, Customer, suspended, revoked, unmapped, anonymous, stale-authentication, and direct-table denial.
- Capability preflight success/failure and enabled fail-closed behavior only in rollback-only transactions. Persistent capability state remained disabled.
- Direct detector execution and deduplication in a rollback-only test.

The rollback-only 10,000-row probe used `delivered_financial_snapshots_restaurant_cursor_idx` and `delivered_financial_snapshots_restaurant_payment_period_idx`; neither plan contained an unintended large sequential scan.

Cron evidence is separated correctly:

- Configuration: the expected five-minute job and detector target are registered.
- Detector behavior: direct rollback-only execution demonstrated deduplication.
- Actual scheduler observation: 13 real `cron.job_run_details` executions were observed by the latest inspection; latest start was `2026-09-22 12:05:00.039836+00`.

## Immutable builds and aliases

### Admin

The Admin application was built from an isolated, environment-file-free source tree using the Vercel project's Production target, whose public configuration was independently verified as Staging (`rlrfvqskzvpysewdxqcr`, `hungrieapp-a2288`). The exact deployment is:

- ID: `dpl_9BX3H48cBDwA5nKsVhcHeWkGuUe9`
- URL: `hungrie-admin-web-phase1-9pjzi4p3l-nurlan-ildirimli-s-projects.vercel.app`
- Bundle SHA-256: `0d7ae36dc8435391bd823a9b3f1360f2efc3dc33ac7f45606d6d8cb3fd4fec26`

Authenticated immutable-deployment inspection verified embedded Staging identifiers, absence of the Development reference, required routes, CSP, HSTS, frame denial, no-sniff, and private/no-store caching. `hungrie-admin-web-phase1.vercel.app` now resolves to that exact READY deployment. The previous target remains recorded for immediate rollback.

### Restaurant

The Restaurant application was exported from an isolated source tree with the EAS `preview` environment, whose Supabase/Firebase identities were verified as Staging. The export contains `/earnings` and 18 other static routes. The exact deployment is:

- Identifier: `6jki82fy0u`
- URL: `https://hungrie-restaurant--6jki82fy0u.expo.app`
- Bundle SHA-256: `de135784ca9c27465f3677ff3e3492f3d0dc62bce75b60f88bb001c49c09f34a`

Immutable-deployment inspection verified `/`, `/login`, and `/earnings`, embedded Staging identifiers, absence of Development, CSP, HSTS, no-sniff, and private/no-store caching.

The first EAS assignment of alias `staging` to `6jki82fy0u` reported success, but six subsequent no-cache requests continued to serve the prior alias ETag/content. The mandatory post-promotion smoke therefore failed, and the alias was immediately restored to recorded deployment `dkxapku412`; a content-hash check proved the rollback was exact.

The app owner then explicitly authorized an instrumented retry. The second assignment succeeded. Cache-bypassed checks of both `/` and `/earnings` returned status 200, matching ETags, and byte-identical content between `hungrie-restaurant--staging.expo.app` and immutable deployment `6jki82fy0u`. The full authenticated browser matrix was rerun against the alias and passed. The qualified build remains at the Staging alias; the prior exact target remains recorded for rollback.

## Deployed UI and responsive evidence

Automated Chrome 153 qualification used the promoted Admin alias and first the immutable Restaurant deployment, then the promoted Restaurant alias, against real Staging identities. Temporary screenshots and browser evidence remain outside the repository.

At 390 and 1440 px it passed:

- Recent-TOTP super-admin scheduling, accessible labeled dialog, focus placement/restoration, Escape close, exact local/UTC times, and non-retroactivity copy.
- Ordinary Admin read-only presentation and active/suspended/closed lifecycle behavior.
- Owner earnings, manager direct-route denial with zero earnings RPC requests, Daily/Weekly/Monthly/Custom controls, 25-plus-row next/previous pagination, English/Turkish, semantic labels, long values, enlarged text, and no horizontal clipping.
- Locally simulated offline/stale/reconnect states; these are not represented as a hosted outage.

The displayed values used the authoritative Staging RPC/snapshot data already reconciled by the hosted probe. The automated UI created one additional manifest-recovered rule; the protected manifest now records 7 rules, 43 orders, 40 snapshots, 7 audit rows, and zero alert fixtures.

The app owner directly reported that the current desktop Edge, physical iPhone Safari, physical iPad Safari, VoiceOver on an Apple device, enlarged text, focus/navigation, dialog, financial clipping, pagination, bilingual copy, and owner/manager matrices all passed. Per the app owner's explicit decision, exact device, OS, browser-version, and viewport metadata were not required for this run and were not invented. These rows rely on direct app-owner observation, not automation or emulation.

## Automated checks

| Check | Result |
|---|---|
| Clean local reset and Realtime policy application | PASS |
| Local and hosted database lint | PASS — zero errors |
| Complete local pgTAP suite | PASS — 896 assertions across 30 files |
| All concurrency harnesses | PASS |
| Phase 2 focused/static checks | PASS — 11/11 plus static checker |
| Phase 3 focused/static checks | PASS — 11/11 plus static checker |
| Phase 4 contract/static checks | PASS — 6/6 plus static checker |
| Admin and Restaurant TypeScript | PASS |
| Shared package builds | PASS |
| Admin isolated production build | PASS |
| Restaurant isolated static export | PASS — `/earnings` present |
| Phase 5 static environment/security checker | PASS — 13 checks |
| `git diff --check` | PASS |

Protected hashes remain: migration `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`, generated types `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37`, shared domain `8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe`, and lockfile `784150a7b56cfe45c137673fa3fe52d131c1af6aa4b15426d1b14a71aca96155`.

## Cleanup results

After alias and manual gates passed, the manifest was recovered immediately before cleanup and contained 43 orders, 9 rules, 40 snapshots, 9 audit rows, and zero alerts. Cleanup disabled the manifest-listed Firebase users, acquired the run-scoped database cleanup lock, validated exact manifest ownership, and deleted rows in reviewed dependency order with foreign-key enforcement active. Only the three exact immutable triggers on their own private tables were temporarily disabled; all three were restored and verified enabled before commit. `session_replication_role`, `DISABLE TRIGGER ALL`, and broad constraint bypasses were never used.

All nine Firebase UIDs were deleted and independently verified absent. Final current-run counts were Restaurants `0`, profiles `0`, orders `0`, rules `0`, terms `0`, snapshots `0`, alerts `0`, and audits `0`. Protected profile, Restaurant, order, order-item, account-access, and audit counts plus keyed Restaurant/order digests reconciled exactly with the pre-mutation baseline. Final hosted inspection again found zero financial rows, all three immutable triggers enabled, and `restaurant_earnings_v1` disabled. No fixture or identity was intentionally retained.

## Changed-file inventory

Phase 5 repository changes are limited to:

- `scripts/qualify-restaurant-earnings-phase5-staging.mjs`
- `scripts/qualify-restaurant-earnings-phase5-hosted.mjs`
- `scripts/qualify-restaurant-earnings-phase5-ui.mjs`
- `scripts/check-restaurant-earnings-phase5.mjs`
- `package.json` (commands only; no dependency or lockfile change)
- `docs/restaurant-earnings-admin-commission-phase-5-review.md`
- `docs/restaurant-earnings-admin-commission-plan.md` (status only)

Protected manifests/backups and external browser/build artifacts are ignored and are not repository deliverables. Accepted Phase 1 migration/RPCs, generated types, shared domain contracts, Phase 2/3 behavior, dependencies, and lockfile were not changed.

## Requirement and exit-gate matrix

| Requirement or exit gate | Status | Direct evidence |
|---|---|---|
| Exact Staging identities; Development/Production rejected | PASS | Fresh fail-closed preflight and embedded-config checks |
| Aligned history; sole pending checksum-pinned migration | PASS | 50-version preflight and accepted SHA-256 |
| Fresh minimized protected backup | PASS | Three mode-`0600` payloads with verified checksums |
| Apply only accepted migration | PASS | Recorded exactly once; post-history through `20260922100000` |
| Hosted RLS, ownership, search paths, grants, indexes, triggers | PASS | 5 relations, 6 RPCs/grants, 7 indexes, 3 triggers, zero direct grants |
| Hosted lint and generated-type parity | PASS | Zero lint errors; semantic parity; tracked types unchanged |
| Capability persistently disabled | PASS | Post-apply, probe, UI, and latest inspection all false |
| Unique disposable real-identity matrix | PASS | Protected manifest with 9 UIDs and scoped IDs |
| Complete financial/concurrency/authorization matrix | PASS | Hosted probe and reconciled facts |
| Opaque pagination and reconciliation | PASS | 25/11 pages plus RPC/database totals |
| Rollback-only 10,000-row plans | PASS | Both intended indexes; no large sequential scan |
| Cron configuration | PASS | Expected five-minute job |
| Direct detector behavior | PASS | Rollback-only deduplication |
| Actual scheduled execution | PASS | 13 scheduler rows independently observed |
| Immutable Admin build qualified/promoted | PASS | Exact deployment ID, headers/config, alias resolution, deployed UI |
| Immutable Restaurant build qualified | PASS | Exact identifier, routes, headers/config, deployed UI |
| Restaurant alias promotion and post-smoke | PASS | Initial mismatch rolled back; app-owner-authorized retry produced byte-identical `/` and `/earnings` responses and passed authenticated alias UI rerun |
| Chrome desktop matrix | PASS | Chrome 153 automated real-Staging qualification |
| Current desktop Edge matrix | PASS | Direct app-owner report; exact version intentionally not collected by app-owner decision |
| Physical iPhone Safari | PASS | Direct app-owner report; exact device/OS metadata intentionally not collected |
| Physical iPad Safari | PASS | Direct app-owner report; exact device/OS metadata intentionally not collected |
| VoiceOver on an Apple device | PASS | Direct app-owner report; exact device attribution intentionally not collected |
| Manual metadata detail | N/A | App owner explicitly waived version/device/viewport detail for this run; no values fabricated |
| Mandatory manifest-driven cleanup | PASS | Exact-ID transaction, FK enforcement active, narrow trigger handling, 9 Firebase deletions |
| Zero fixtures and Firebase identities | PASS | All run database categories zero; Firebase remaining zero |
| Restored protections and baseline reconciliation | PASS | Three immutable triggers enabled; counts and keyed digests match baseline |
| Final capability disabled | PASS | Independent final hosted inspection returned false |
| No Development or Production access | PASS | Phase 5 commands resolved only approved Staging/non-production targets |
| No deployment outside two approved builds | PASS | One Admin and one Restaurant immutable build only; no functions/Customer/Production deploy |
| No commit, push, or Production mutation | PASS | Repository/command review |
| App-owner Phase 5 acceptance | PASS | App owner explicitly approved Phase 5 on 2026-09-22 |

## Boundary and current disposition

The Phase 4 read-only Staging incident is historical context only. Phase 5 independently used fail-closed identity checks and did not access Development or Production. Production remains unchanged.

All agent-controlled, deployment, manual-report, cleanup, and acceptance gates are complete. The exact qualified Admin and Restaurant builds remain at their approved Staging aliases, the capability is disabled, all disposable fixtures and identities are gone, and the protected Staging baseline reconciles around the accepted additive migration. The app owner explicitly accepted Phase 5 on 2026-09-22. This acceptance covers Staging qualification only and does not authorize Production access, activation, or deployment.
