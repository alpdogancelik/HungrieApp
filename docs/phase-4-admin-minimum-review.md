# Phase 4 Admin production minimum review

**Status:** Phase 4 is implemented and deployed in non-production staging. The app owner reports that the manual tests supplied during the Restaurant/account QA session passed, and the direct hosted wrong-portal matrix now passes. Formal Phase 4 acceptance remains pending only on the staged order/incident fixture actions, their audit verification, and app-owner acceptance. Legacy Customer/Restaurant authorization is unchanged; no Hungrie production environment was touched.

## Current review decision (2026-09-13)

- The live Admin site is `https://hungrie-admin-web-phase1.vercel.app`, deployment `dpl_7dzvomFsLG2KoiNgbrJffe3Q14y2` from commit `01099d0`. This Vercel production-target alias is Hungrie **staging**, not a Hungrie Production environment. The latest staging callable bundle was checksum-pinned at SHA-256 `a40b9698104a00b8d261ae17f7882c1440117dd1c9e95e7976847f0dfd60b3dd` and deployed successfully.
- The owner reports that all manual tests supplied during the interactive QA session passed. The Restaurant was activated; attempting to suspend its sole active owner was rejected by the database, and the Admin UI now explains why in English and Turkish. The manager account was suspended and reactivated while the Restaurant was suspended. Account activation in that state is permitted; canonical Restaurant operations still require an active Restaurant lifecycle state. This report records the owner's observation, not an independently replayed hosted identity test.
- The PR checks for functional commit `01099d0` passed: migration review, workspace, and database validation. On 2026-09-13 the targeted Firebase logic tests and Admin route/auth/cache check passed again. The live `/accounts` response returned `private, no-cache, no-store`, CSP, HSTS, and frame-denial headers with `x-vercel-cache: MISS`.
- A checksum-pinned hosted isolation probe created transient Customer and Restaurant-manager identities, assigned each a deliberately stale `platform_role: super_admin` claim, and called six Admin RPCs directly. Dashboard, account, order, incident, audit, and Restaurant-creation calls all returned HTTP `403` for both identities. The probe removed both Firebase identities and every related Supabase row in `finally`. Probe source SHA-256: `4cd9cf59d444965975ab7f2c3b40f489aec622a7ba5b8e7522ddf94b7cf941d1`.
- A fresh restricted staging backup was taken before creating synthetic support fixtures at `secure/phase4-staging-backup/2026-09-13T10-52-36-680Z/manifest.json`. The checksum-pinned fixture tool created one synthetic Customer, two synthetic orders, and one open non-response incident for the existing Phase 4 QA Restaurant. No password was persisted or reported. The fixture IDs are listed below for app-owner testing.

- Staging has 32 applied migrations. The original Phase 4 migration and the public RPC type-boundary correction were checksum-pinned and applied after restricted backups. The latest backup manifest is `secure/phase4-staging-backup/2026-09-12T23-40-12-381Z/manifest.json`.
- Two dedicated canonical Admin accounts are active `super_admin` accounts with completed MFA onboarding. Both Firebase identities are verified, enabled, and have one TOTP factor. No invitation remains pending.
- One independent MFA recovery is audited. The recovered account subsequently recorded a new TOTP enrollment and activation; the other super-admin stayed active. The owner confirmed the recovered account signed in with its new MFA factor. No secret, code, token, invitation URL, or raw address is recorded here.
- Read-only staging simulation under the authenticated database role returned guarded dashboard, Restaurant, account, order, incident, and audit responses for a canonical MFA Admin. A simulated Restaurant identity was denied the Admin dashboard with SQLSTATE `42501`. A temporary, valid hosted Firebase identity received `unmapped` access context and HTTP `403` / SQLSTATE `42501` from the Admin dashboard RPC; it was deleted immediately after the probe. Anonymous direct HTTP calls to the dashboard, accounts, and incidents RPCs returned `401`. These simulations do not replace a full hosted identity/tenant E2E matrix.
- Earlier local reset, 576 database assertions, concurrency tests, database lint, shared type generation, and Admin typecheck/build passed after the RPC correction.

### Exit-gate evidence still needed

| Gate | Current evidence | Remaining record |
|---|---|
| Admin MFA and recoverability | Two active, TOTP-ready super-admins; one audited recovery followed by re-enrollment and new MFA sign-in | App-owner acceptance of this evidence |
| Restaurant and account operations | Owner-reported invitation, acceptance, activation, Restaurant suspension, manager suspension/reactivation, and sole-active-owner protection pass | Confirm whether Restaurant restoration was tested; otherwise record it as deferred without treating it as an authorization defect |
| Order and incident support | Guarded read paths pass. A local transactional test covers pending-order cancellation, dispatched-order delivery, incident acknowledgement/resolution, idempotent retries, invalid-transition denial, and audit/history records (29 assertions pass). Suitable staging fixtures now exist. | Complete the four hosted UI transitions below and verify their audit entries |
| Wrong portal and tenant isolation | Simulated Restaurant denial, hosted unmapped identity denial, anonymous denial, plus direct hosted Customer/Restaurant matrix: 12 calls, 12 HTTP `403`, zero successful access; stale role claim ignored | Complete |
| Cache and deployment | Live no-store/CSP headers; route checks and PR CI pass | No open exposure or unexplained authorization difference |
| Release review | Draft PR #4 and this review | Explicit app-owner Phase 4 acceptance after the matrix is recorded |

Do not mark Phase 4 accepted or begin Phase 5 as an accepted successor until the remaining records are complete. No production project or platform-wide canonical enforcement change is part of Phase 4.

### Remaining hosted UI fixture tests

Use only the staged Admin site and the IDs below. Sign out and complete a fresh MFA sign-in first because order support requires the five-minute recent-auth window.

1. In **Orders**, cancel `phase4_qa_cancel_5079253ff8080c` with a test reason. Expect `canceled`.
2. In **Orders**, confirm delivery for `phase4_qa_deliver_5079253ff8080c` with a test reason. It is already `out_for_delivery`; expect `delivered`.
3. In **Incidents**, acknowledge `ce8024ae-fa53-4e4a-bd23-b2099f7da484`. Expect `acknowledged`.
4. Resolve the same incident with a non-empty resolution note. Expect `resolved`.
5. In **Audit**, verify two `order.support_resolved` events and one each of `incident.acknowledged` and `incident.resolved` for those IDs.

Do not paste Customer details, credentials, MFA codes, or secrets into the review. Report only pass/fail and any support-safe reference shown by the app.

## Implementation and staging history

The notes below preserve the earlier implementation and rollout sequence. Statements about pending deployments or identities describe their state at that earlier checkpoint; the current review decision above supersedes them.


The implementation replaces the Admin proof pages with a bilingual English/Turkish desktop application. Browser Firebase Authentication uses session persistence and supplies the current Firebase ID token directly to Supabase. `get_my_access_context_v1()` controls routing, while every Admin RPC independently requires canonical active Admin state, verified email, current TOTP evidence, and the required role. High-impact operations retain the five-minute recent-auth requirement.

The new additive migration is `20260913100000_phase4_admin_minimum.sql`, SHA-256 `c6e7333cff06efe91830132185adb04bdc9fa6964dfa60849f6f80a65d955f18`. It adds guarded dashboard, Restaurant, account, order, incident, and audit RPCs; narrow management operations; service-only MFA enrollment/identity bridge functions; and authenticated grants for existing Phase 2 Admin operations. It does not change legacy Customer/Restaurant policies or routing.

Development was backed up at `secure/phase4-development-backup/2026-09-12T21-55-48-582Z/manifest.json`, dry-run checked, and migrated from 30 to 31 migrations. All 60 Phase 3 canonical rows remained present. No Firebase Function was deployed because Development and Staging share the non-production Firebase project and the approved plan puts hosted Firebase changes behind the second review. Environment-specific callable names and secrets are prepared so deployment cannot select the other Supabase environment through request input. Consequently, the hosted enrollment, suspension/revocation, and recovery journeys remain part of the staging qualification rather than completed Development evidence.

Prepared callable functions:

- `recordAdminMfaEnrollmentDevelopment` / `recordAdminMfaEnrollmentStaging`
- `setAdminAccountStatusDevelopment` / `setAdminAccountStatusStaging`
- `recoverAdminMfaDevelopment` / `recoverAdminMfaStaging`

The Admin app selects these names from the build-owned `NEXT_PUBLIC_HUNGRIE_ENV`. Each callable has environment-specific Supabase URL/service-key secrets. The browser cannot choose the backend target at runtime.

Verification completed:

- Local reset and database lint pass.
- 574 pgTAP assertions and all existing concurrency tests pass.
- Phase 4 Firebase logic tests pass.
- Shared packages, Restaurant web export, Admin production build, TypeScript, route inventory, CSP, and no-store checks pass.
- Development migration is applied with backup and checksum evidence.
- Read-only staging review confirms 30 applied migrations, 9 profiles, 9 canonical Restaurant accounts, zero legacy Admin roles, zero canonical Admins, and exactly the Phase 4 migration pending.

The current shared non-production Firebase project is active and has seven deployed legacy/runtime functions. None of the six Phase 4 environment-specific callable names is deployed. The original staging function source bundle SHA-256 was `846fd1ff4d790782841acdfa479457dd3f7e16db2bb6041018201230ace2c16b`. Its deployment stopped before creating functions because Firebase CLI required undeclared Development-specific secrets while analyzing the complete source. Development callables were then bound to the existing Development secrets. The corrected replacement bundle SHA-256 is `8cd0cb501007624402963f2e817d0dd9c592bce0dc130cc729d7714f7f17ccbe`; the original first-super-admin bootstrap tool SHA-256 was `770b33c8e31be054ca769a01630f405b6562b42a2b0bedc426b9a8668c76cb01`; its Firebase CLI operator-session revision is `8e55d4db0beb3116e536cf09cf0ee30c00ee5a75b63ed5aac34ae37629ed896a`. The restricted review manifest is `secure/phase4-staging/migration-review-1789251150687.json`.

The approved staging backup was recorded at `secure/phase4-staging-backup/2026-09-12T22-32-41-522Z/manifest.json`, and the checksum-pinned migration was applied successfully, raising staging from 30 to 31 migrations while preserving all 9 canonical Restaurant rows. Identity Platform and TOTP are now enabled, and the two staging-specific Supabase secret versions were created. The remaining staging bundle requires Identity Platform TOTP enablement; only the three `Staging` callable deployments from the corrected replacement checksum; Admin web staging configuration; and two dedicated test super-admin identities. `phase4:staging:migration` already passes its read-only dry run and requires the reviewed checksum, a backup manifest less than 24 hours old, and an exact apply confirmation. `phase4:staging:functions` deploys only the three reviewed callable names and requires the reviewed source checksum and an exact confirmation.

The first identity uses `phase4:staging:bootstrap-admin` through the authenticated Firebase CLI operator session and an exact plan checksum. It must be a fresh, enabled, verified identity in `hungrieapp-a2288`. The tool refuses to proceed unless staging still has zero canonical Admins and no UID/email collision. After its TOTP onboarding, it invites the second through the normal invitation flow. Recovery is tested on one while the other remains MFA-ready; both must finish active, TOTP-enrolled, freshly MFA-authenticated, and recoverable. No email address, Firebase credential, invitation token, TOTP seed, or service key belongs in the review artifact.

Staging rollback remains fail closed. If the migration fails, stop before deploying callables or provisioning identities and restore the database from the reviewed backup only when the migration transaction or migration history cannot be safely forward-fixed. If a callable deployment fails, leave canonical Admins pending/suspended, delete only the three new `Staging` callable deployments, and keep their secret versions disabled until the corrected batch is reviewed. If bootstrap or onboarding partially fails, do not delete or activate the account automatically; keep it pending, revoke its Firebase sessions, and resolve it through an audited retry or recovery operation. Legacy Customer and Restaurant authorization remains live throughout, so Phase 4 failure does not require relaxing canonical guards.

**Separate staging review gate:** No staging migration, Firebase setting/function deployment, Admin identity creation, or canonical enforcement is authorized by the development implementation. App-owner approval of the exact staging bundle is required before those writes.


**Staging execution update:** The approved backup, migration, Identity Platform initialization/TOTP enablement, and staging secret creation completed. The first callable deployment attempt created no function and exposed a full-source secret preflight issue; the corrected source is committed in draft PR #4 and awaits replacement-checksum approval. Both initially supplied super-admin email addresses already existed as enabled, verified users in the shared Firebase pool, so no identity mutation or canonical bootstrap was performed. Fresh dedicated addresses or an explicit decision to use fresh plus-address aliases are required.


**Staging hosted rollout update:** The corrected function bundle was approved and deployed. All three Staging callables are active in `us-central1`, use Node.js 22, and bind only `SUPABASE_STAGING_URL:v1` and `SUPABASE_STAGING_SERVICE_ROLE_KEY:v1`. The Admin web application was configured against the existing `Hungrie Admin Web` Firebase registration and staging Supabase, deployed to `https://hungrie-admin-web-phase1.vercel.app`, and returned private no-store plus CSP/frame headers on login, dashboard, and invitation routes. Two fresh Gmail plus-alias Firebase identities were created, completed email verification, and remain enabled. The checksum-pinned bootstrap then created the first canonical account as the sole staging Admin with `super_admin`, `pending`, and `admin_mfa_enrollment_required`; the second identity has no canonical profile or access row yet. TOTP enrollment and the subsequent complete MFA sign-in remain interactive staging steps.


**First MFA enrollment correction:** The first verified identity was bootstrapped as the sole pending staging super-admin. Its first browser enrollment enrolled a Firebase TOTP factor, but the subsequent service-only recording callable was blocked by the Admin site's CSP before reaching Cloud Functions. Because the enrollment secret appeared in a support screenshot, the factor was immediately removed and Firebase sessions were revoked; canonical access remained pending and no Admin operation became available. The CSP now permits the reviewed `*.cloudfunctions.net` callable endpoint, the corrected Admin build is deployed as `dpl_5tMnzdWdjd7QeAq5aKufad8XD5TH`, and the account must complete enrollment again with a fresh secret.


**First super-admin onboarding result:** The replacement TOTP enrollment callable succeeded and the next full MFA sign-in activated the first canonical staging super-admin. Staging now has one active, MFA-recorded super-admin. A direct sign-in attempt by the second Firebase identity correctly failed closed with `reason=denied` because that identity has not yet accepted a canonical invitation.


**Second invitation first attempt:** No invitation row was created. The first Admin account was active and MFA-ready, but its authentication age had exceeded the five-minute high-impact-operation window before the attempt. The database denied the invitation as designed. The Admin UI now translates that specific denial into an English/Turkish sign-out/sign-in instruction; deployment `dpl_F6z928dqaLzjghqF5DYa121PUrUv` is live.


**Admin RPC type-boundary correction:** Repeated invitation attempts wrote no invitation. Staging Postgres logs identified `permission denied for schema private`: six public Admin RPC signatures exposed private enum types even though authenticated clients intentionally have no `private` schema usage. Migration `20260913110000_phase4_public_rpc_type_boundary.sql` (SHA-256 `a3022674eccfe92cf4e1172dcf915ac8ecb82095a7e4a4c32412c870b4ad37cd`) moved the typed implementations behind owner-executed private functions and replaced their public signatures with validated text parameters. A fresh restricted staging backup is recorded at `secure/phase4-staging-backup/2026-09-12T23-40-12-381Z/manifest.json`. The migration was applied as staging migration 32; the active Admin and all ten canonical rows were preserved, private-schema usage remains denied, and authenticated execute is present only on the public wrapper. Local reset, 576 pgTAP assertions, concurrency tests, lint, generated types, and package/Admin typechecks pass.


**Second super-admin onboarding result:** Both dedicated staging identities are verified and enabled in Firebase with one TOTP factor each. Both canonical accounts are active, have completed onboarding, record MFA enrollment, and hold `super_admin`; no invitation remains pending. The independent recovery rehearsal remains before the Phase 4 hosted exit gate.


**Recovery retry diagnosis:** Two Kingsofreport-initiated recovery calls returned SQLSTATE `42501`; staging Postgres logs identified `Recent authentication required`. No canonical account or Firebase TOTP factor changed. The Admin UI now checks Firebase `authTime` before privileged actions and gives an English/Turkish sign-out/sign-in instruction before the server call; deployment `dpl_Hui7vp3AZ5XSpHuWTF1dD7JCQwHD` is live. The database remains the authority for the five-minute check. The two-person recovery rehearsal is still pending.
