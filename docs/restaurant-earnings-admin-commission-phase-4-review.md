# Restaurant Earnings and Admin Commission — Phase 4 Development Review

**Status:** Phase 4 accepted by the app owner on 2026-09-22; the read-only Staging boundary incident remains permanently documented as an accepted exception, not a PASS. Phase 5 not started.  
**Run ID:** `earnp4_20260922b`  
**Date:** 2026-09-22

## Outcome

The accepted earnings migration was applied once to the isolated Development Supabase project. The financial, concurrency, authorization, pagination, query-plan, detector, scheduler, and real Development-backed UI qualifications passed. Cleanup deleted every run-owned database fixture and all nine disposable Firebase identities, restored all narrowly disabled immutable triggers, reconciled protected baseline counts and digests, and left `restaurant_earnings_v1` disabled.

One environment-boundary incident occurred. Before the guarded Development app launcher existed, the first failed Admin browser-login attempts used the pre-existing `apps/admin-web/.env.local`, which resolves to the Staging Supabase reference. Those attempts made read-only `get_my_access_context_v1` requests to Staging with disposable Development Firebase identities. They did not reach a Restaurant screen, invoke a scheduling RPC, or mutate Staging. The application was stopped immediately after the mismatch was identified. All successful UI qualification was then rerun with a launcher that positively resolves the approved Development registry entry and rejects Staging/Production references.

On 2026-09-22, the app owner accepted this incident as a Phase 4 boundary exception while explicitly requiring that it remain permanently documented and not be reclassified as a successful boundary-control pass. The Development qualification evidence remains valid independently of that accidental read. The exception acceptance satisfies the outstanding boundary decision but does not rewrite the event.

## Environment-boundary incident

### Root cause

The local Admin application was initially launched with `npm --prefix apps/admin-web run dev -- --port 3100`. Its pre-existing `apps/admin-web/.env.local` resolved `NEXT_PUBLIC_SUPABASE_URL` to registered Staging project `rlrfvqskzvpysewdxqcr`. The qualification launch had not yet enforced an explicit Development override, so the file silently selected Staging for that process.

### Scope

- Affected application/process: the first local `@hungrie/admin-web` Next development-server UI attempt on port `3100` and its failed Admin login browser sessions.
- Observed Staging RPC: only `get_my_access_context_v1`, invoked as part of failed-login access checking.
- Access type: read-only access-context inspection using disposable Development Firebase identities.
- No `admin_schedule_restaurant_commission_v1` call reached Staging. No Staging migration, fixture, configuration change, identity creation, deployment, database write, or other hosted mutation occurred.
- The Restaurant application’s successful qualification and every successful Admin flow used Development. Production was never resolved or accessed.

### Detection and containment

The mismatch was detected when the Admin login completed Firebase TOTP but returned the generic invalid-access path instead of a Development Admin session. Inspection of the non-secret `.env.local` identity showed `NEXT_PUBLIC_HUNGRIE_ENV=staging` and Supabase ref `rlrfvqskzvpysewdxqcr`. Both local application servers were stopped immediately, before a Restaurant detail screen or actionable commission control was reached through the affected Admin process. No further Staging access occurred during Phase 4.

### Remediation

A fail-closed launcher, `scripts/run-phase4-development-app.mjs`, was added. It reads the approved local registry directly, requires an action-specific Development confirmation, verifies Supabase ref `rgjlsjwsitbnwoetmidb` and Firebase project `hungrieapp-a2288`, rejects registered Staging/Production refs, and explicitly supplies Development environment variables so `.env.local` cannot select the target. It logs the resolved non-secret project identifiers before starting either application. All affected Admin qualification and all Restaurant qualification were rerun successfully against Development.

### Prevention

- Every future hosted or local qualification launcher must fail closed unless resolved identifiers exactly match the explicitly authorized environment.
- Pre-existing `.env.local` files must never silently override the qualification launcher’s selected environment.
- Before an authenticated request is permitted, the launcher must visibly log the environment name, Supabase project ref, and Firebase project ID without secrets.
- Development qualification must explicitly reject every registered Staging and Production identifier.
- The accepted exception is retained in this review and in the exit-gate matrix; it is not converted to `PASS`.

## Hosted-mutation preflight

The fresh preflight record is `secure/restaurant-earnings-admin-commission-phase4/earnp4_20260922b/preflight.json` (ignored and mode `0600`). It established before mutation:

- Supabase Development: `rgjlsjwsitbnwoetmidb`, `HungrieApp Development`, `ACTIVE_HEALTHY`, `eu-central-1`.
- Approved shared non-production Firebase: `hungrieapp-a2288`.
- Development differed from registered Staging `rlrfvqskzvpysewdxqcr`; no Production identifier resolved.
- Live migration history contained exactly 50 ordered migrations through `20260921100000_customer_push_language.sql`.
- The only pending migration was `20260922100000_restaurant_earnings_admin_commission.sql`.
- Migration SHA-256 was exactly `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`.
- Earnings capability objects were absent before apply.
- No stale `earnp4_` database fixtures or Firebase identities existed.
- The explicit run namespace was unique and credentials resolved only from ignored/external protected locations.

No migration-history repair, implicit environment fallback, or additional migration was used.

## Backup and migration application

The backup was created at `2026-09-22T07:08:18.401Z`, before migration application, under owner-only directory `secure/restaurant-earnings-admin-commission-phase4/earnp4_20260922b/`. It was younger than 24 hours at mutation time. The manifest and payload files are mode `0600`; the directory is mode `0700`.

| Protected file | Scope | Bytes | SHA-256 |
|---|---|---:|---|
| `schema.sql` | Schema-only `public`, `private`, `migration`, `cron` | 580103 | `b7746410926aef6003e8e262e158ba56c32b6ee60ec36d33dbecb8cc52559d8e` |
| `restaurants.json` | Targeted sensitive `public.restaurants` data | 8291 | `fb36a8cfa61833021d5212d975014c842c64a9344315595e2ed9ea0ad79b8a6c` |
| `baseline.json` | Non-PII protected counts/digests | 304 | `4517968fbb725f9527070f22e627531519e20fe84cdeaf96d1c48aa98c7e7416` |

No auth data, Firebase credentials, tokens, TOTP secrets, API secrets, or unnecessary Customer PII were included. Backup payload contents were not logged or copied into this evidence. The files are classified `sensitive-restricted-local`, retained until Phase 4 acceptance plus seven calendar days, and then deleted with a non-secret local receipt retained.

Only the checksum-pinned earnings migration was applied. The initial apply wrapper’s postcheck referred to the wrong capability table name after the migration had committed; execution stopped, live history confirmed the migration was recorded exactly once, and only the wrapper was corrected. The accepted migration was not rerun or edited. Post-apply history is aligned through `20260922100000`; no repository migration remains pending.

## Hosted schema, security, and capability

Final hosted inspection at `2026-09-22T07:57:10.774Z` proved:

- Migration recorded exactly once and capability row present with `enabled = false`.
- Five new private relations use forced RLS.
- Six public RPCs are owned by `hungrie_api_owner` and use the accepted empty safe search path.
- Seven reviewed purpose-specific indexes exist.
- All three immutable triggers are enabled.
- Exactly six authenticated RPC execution grants exist; direct grants on the five private financial relations to `public`, `anon`, `authenticated`, and `service_role` are zero.
- Hosted lint over `public`, `private`, and `migration` completed with zero errors through the Development Frankfurt pooler.
- Hosted generated types were captured only under protected `secure/`; SHA-256 `1cde5699f3e4660a2a7bf04121ec9621f382312cedab586c34d21557f57724cc`, mode `0600`. The checked-in generated types were not edited.
- Immediately after migration the four financial data relations were empty. After final cleanup they were again empty: rules `0`, terms `0`, snapshots `0`, alerts `0`.

Capability preflight success, missing-rule failure, activation guards, and enabled fail-closed behavior ran only inside rollback-only transactions. The persistent value remained disabled before fixtures, during ordinary qualification, after those tests, and after cleanup.

## Financial, concurrency, and reconciliation evidence

The successful disposable probe produced 6 rules, 43 orders, 43 immutable terms, and 40 delivered snapshots before UI-specific rules. It verified:

- Rates `0`, `10000`, and later `1` basis point; future `500` and concurrent `750` basis-point rules.
- Exact stable replay returned the original rule; changed-input operation reuse, duplicate effective time, and backdating were denied.
- Rule selection immediately before, exactly at, and immediately after an effective time.
- Existing-order non-retroactivity and future-order rule selection.
- Below/at/above half-kuruş rounding produced `0`, `1`, and `1` kuruş.
- Cash/POS orders, catalog-change isolation, canceled/nonterminal exclusion, sequential/replayed/concurrent delivery, concurrent stable scheduling, and concurrent order/rule serialization.
- Exactly one terms row per participating order, one identical snapshot per delivered order, one concurrent-delivery snapshot, and one rule/audit result per stable scheduling operation.
- Summary, series, cash/POS, and database snapshot totals reconciled.
- Opaque keyset pagination returned 25 then 10 rows without decoding or logging the cursor.

The mismatch probe changed both commission and net consistently only inside a transaction after disabling the exact snapshot immutability trigger, confirmed mismatch rejection, and rolled back. Catalog and authoritative order monetary-field immutability checks passed.

The query-plan probe inserted 10,000 rollback-only delivered fixtures. The page plan used `delivered_financial_snapshots_restaurant_cursor_idx`; the selective payment summary plan used `delivered_financial_snapshots_restaurant_payment_period_idx`. Neither plan performed an unintended large sequential scan. All 10,000 rows rolled back.

## Authorization evidence

Nine disposable Firebase identities were created and recorded only in the protected manifest: recent-TOTP super-admin, ordinary MFA Admin, Restaurant owner, manager, Customer, second Restaurant owner, suspended, revoked, and unmapped. No real identity was reused.

| Actor/state | Result |
|---|---|
| Recent-TOTP active super-admin | Scheduling and exact replay passed |
| Ordinary active MFA Admin | Commission inspection passed; scheduling denied; UI read-only |
| Stale-TOTP super-admin | Scheduling denied |
| Active owner | Earnings summary/series/page and real UI passed |
| Manager | RPC denied; direct `/earnings` UI permission state made zero earnings RPCs |
| Second Restaurant owner | Own empty totals only; no cross-Restaurant data |
| Customer | Denied |
| Suspended | Denied |
| Revoked | Denied |
| Unmapped | Denied |
| Anonymous | Denied |

Direct private-table access was denied. Audit records contained operational identifiers and no Customer PII.

## Cron and detector evidence

- **Cron configuration:** one `hungrie-restaurant-financial-integrity` job exists with `*/5 * * * *` and the expected detector target. Function ownership, search path, and grants passed hosted inspection.
- **Detector behavior:** direct rollback-only execution against a deliberately missing snapshot created the expected alert; a second execution raised the same alert’s occurrence count to 2, proving deduplication.
- **Observed scheduler execution:** unlike a registration-only claim, `cron.job_run_details` recorded 10 actual Development executions. The last observed start was `2026-09-22 07:55:00.040501+00`.

## Real Development-backed UI

The successful review used a fail-closed local launcher that reads the approved Development registry and refuses matching Staging/Production references. Neither application was deployed. Screenshots and browser evidence remain outside the repository under a temporary owner-only directory.

At exactly 390 px and 1440 px:

- Super-admin loaded the real commission history, opened the custom semantic dialog, saw local and UTC times and the non-retroactivity warning, used Escape, observed focus restoration, and created a Development rule through the UI. Real Development RPC probing separately proved replay; accepted client tests proved stable operation-ID reuse/clearing.
- Suspended Restaurant retained supported preparatory scheduling; closed Restaurant was read-only.
- Ordinary Admin saw no actionable scheduling form.
- Owner loaded authoritative earnings, Daily/Weekly/Monthly/Custom periods, summary, series, cash/POS breakdown, 25/10 pagination, and English/Turkish copy.
- Manager direct access rendered permission denial and generated zero earnings RPC requests.
- Offline simulation preserved in-memory authoritative data with a stale label and refreshed on reconnection. It is recorded as simulation, not a hosted outage.
- No horizontal financial clipping occurred. Inputs had semantic labels; keyboard focus, dialog focus containment, long reason/timestamp wrapping, visible focus, and 200% text reflow passed.

## Cleanup exit gate

One early fixture attempt stopped on a qualification assertion and was recovered into its exact protected manifest before cleanup. That attempt removed 43 orders, 6 rules, 40 snapshots, 6 audits, all base fixtures, and all 9 identities; zero-fixture verification passed before the clean attempt began.

For the successful attempt, manifest recovery captured 43 orders, 10 rules (including four UI-created rules), 40 snapshots, 10 audits, and zero persisted alerts. Cleanup:

1. Disabled the exact nine manifest-listed Firebase users.
2. Acquired a run-scoped advisory lock and validated namespace/relationships against exact manifest IDs.
3. Kept foreign-key enforcement active and deleted dependents in reviewed order.
4. Temporarily disabled only `restaurant_commission_rules_immutable`, `order_commission_terms_immutable`, and `delivered_financial_snapshots_immutable` on their exact tables because rows existed in all three.
5. Re-enabled and verified all three triggers with `tgenabled = 'O'` before commit.
6. Deleted and verified all nine Firebase UIDs.

Final zero checks returned Restaurants `0`, profiles `0`, orders `0`, rules `0`, terms `0`, snapshots `0`, alerts `0`, and audits `0` for the run. Baseline profile, Restaurant, order, order-item, account-access, and audit counts plus Restaurant/order keyed digests matched the protected pre-migration baseline exactly. The capability is disabled. No current-run artifact is intentionally retained in Development; only the accepted additive schema/migration and disabled capability row remain.

## Automated qualification

| Check | Result |
|---|---|
| Clean local reset and Realtime policy application | PASS |
| Database lint | PASS — local and hosted zero errors |
| Complete pgTAP suite | PASS — 896 assertions across 30 files |
| Earnings concurrency harness and relevant Node checks | PASS — 21 assertions |
| Notification worker regression | PASS — 11 assertions |
| Phase 4 contract tests | PASS — 6/6 |
| Phase 4 static security/protected-hash checker | PASS |
| Phase 2 focused/static checks | PASS — 11/11 plus static checker |
| Phase 3 focused/static checks | PASS — 11/11 plus static checker |
| Admin and Restaurant TypeScript | PASS |
| Admin production build | PASS — dynamic Restaurant detail route present |
| Restaurant static export | PASS — `/earnings` exported |
| 10,000-row hosted plan gate | PASS — rollback-only, both reviewed indexes |
| `git diff --check` | PASS |

Protected hashes remained unchanged: lockfile `784150a7b56cfe45c137673fa3fe52d131c1af6aa4b15426d1b14a71aca96155`, checked-in generated types `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37`, shared domain `8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe`, and accepted migration `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`. Accepted Phase 2/3 component/model/repository hashes also match their evidence.

## Changed-file inventory

Phase 4/baseline-alignment additions or edits are limited to:

- `scripts/restaurant-earnings-phase4-contract.mjs`
- `scripts/restaurant-earnings-phase4-contract.test.mjs`
- `scripts/qualify-restaurant-earnings-phase4-development.mjs`
- `scripts/align-restaurant-earnings-development-baseline.mjs`
- `scripts/qualify-restaurant-earnings-phase4-hosted.mjs`
- `scripts/qualify-restaurant-earnings-phase4-ui.mjs`
- `scripts/run-phase4-development-app.mjs`
- `scripts/check-restaurant-earnings-phase4.mjs`
- `package.json` (commands only; no dependency change)
- `docs/restaurant-earnings-development-baseline-alignment-review.md`
- `docs/restaurant-earnings-admin-commission-phase-4-review.md`
- `docs/restaurant-earnings-admin-commission-plan.md`

Ignored `secure/` manifests and backups and external temporary browser artifacts are not repository deliverables. Next/Expo files generated during local servers were removed/restored. No accepted migration/RPC, checked-in generated database type, shared domain contract, accepted Phase 2/3 behavior, dependency, or `package-lock.json` was changed by Phase 4.

## Requirement and exit-gate matrix

| Requirement or exit gate | Status | Direct evidence |
|---|---|---|
| Exact Development Supabase/Firebase identities | PASS | Protected preflight matched `rgjlsjwsitbnwoetmidb` and `hungrieapp-a2288` |
| Baseline through `20260921100000`; sole pending earnings migration | PASS | 50-version preflight history and one-item pending set |
| Accepted migration checksum and sole application | PASS | Exact SHA-256; recorded once; history through `20260922100000` |
| Fresh minimized backup, permissions, checksums, retention | PASS | Protected manifest and three verified mode-`0600` payloads |
| Capability absent before apply and disabled afterward | PASS | Preflight absence; post-apply/final hosted inspections |
| Protected baseline capture | PASS | `baseline.json` checksum and final exact reconciliation |
| Unique namespace; no stale fixtures | PASS | `earnp4_20260922b`; preflight zero checks |
| Hosted RLS, ownership, search paths, grants, indexes | PASS | 5 forced-RLS tables, 6 guarded RPCs, 7 indexes, zero direct private grants |
| Real disposable identity matrix | PASS | Nine manifest-listed identities and authorization probe |
| Rates, rounding, boundaries, replay, conflicts, non-retroactivity | PASS | Protected `probe-evidence.json` and reconciled facts |
| Delivery/order scheduling concurrency | PASS | Concurrent snapshot/scheduling/race assertions |
| Summary/series/payment/page reconciliation | PASS | RPC/database reconciliation and 25/10 pages |
| 10,000-row query plans | PASS | Both expected indexes; no unintended large sequential scan; rollback |
| Capability activation/fail-closed qualification | PASS | Rollback-only preflight/failure/enabled guard tests; persistent state false |
| Cron configuration | PASS | One five-minute expected job |
| Detector behavior | PASS | Direct rollback-only deduplication to occurrence 2 |
| Actual scheduler execution | PASS | 10 real `cron.job_run_details` rows observed |
| Real Development-backed Admin/Restaurant UI | PASS | Successful strict Development rerun at 390/1440; temporary evidence path |
| Mandatory manifest-driven cleanup | PASS | Exact-ID cleanup, 9 Firebase deletions, zero run rows |
| Foreign keys active; narrow trigger bypass restored | PASS | No broad bypass; three exact triggers re-enabled and verified |
| Final capability disabled and baseline reconciled | PASS | Final cleanup verification and hosted inspection |
| Accepted artifacts protected | PASS | Recorded hashes unchanged |
| No deployment, preview, commit, push, or Phase 5 | PASS | Command/status review |
| No Staging or Production mutation | PASS | No Staging/Production write occurred; Production was never resolved/accessed |
| Strict no-Staging-access boundary | ACCEPTED EXCEPTION | Initial Admin UI login attempts made read-only Staging `get_my_access_context_v1` requests; app-owner exception accepted 2026-09-22; incident remains permanently documented and is not a PASS |
| Boundary incident disposition | ACCEPTED EXCEPTION | App owner accepted the documented exception without erasing or reclassifying the incident; independent Development evidence remains valid |
| App-owner Phase 4 completion approval | PASS | App owner explicitly approved Phase 4 on 2026-09-22 after separately accepting the documented boundary exception |

## Environment boundary and acceptance

Production was never resolved or accessed. No Staging mutation occurred. The only Staging contact was the read-only failed-login `get_my_access_context_v1` activity described above; all successful qualification, all mutations, all fixtures, and all cleanup were limited to Development and the approved shared non-production Firebase project.

The app owner accepted the read-only contact as a boundary exception and subsequently approved Phase 4 on 2026-09-22. The exception does not turn the strict boundary into a pass or erase history. Phase 4 approval does not authorize Phase 5, which has not started.
