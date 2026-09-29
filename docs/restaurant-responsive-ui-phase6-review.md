# Restaurant Responsive UI Phase 6 Acceptance and Historical Qualification Report

## Current accepted status

**Status:** `PASS / ACCEPTED / CLOSED`
**Acceptance date:** 2026-09-29
**Accepted qualification:** `restaurant-vercel-notification-click-qualification-20260929aj`
**Evidence-manifest SHA-256:** `766e0459606747a72753b7238ca91eb284b5b0a198934fa9d546740c5238f433`
**Terminal-record SHA-256:** `f9a7c43fa69ed5c352621a4e6bb22c5c04b05393b7cc8131e7d6e6320f9977a2`
**Production touched:** No

The accepted Vercel Staging browser/PWA/FCM evidence and its prerequisite chain are recorded in `docs/restaurant-responsive-ui-phase6-acceptance.md` and `docs/restaurant-responsive-ui-phase6-acceptance.json`. Production readiness remains `NOT YET APPROVED / NOT EXECUTED` and is a separate owner-approval boundary.

## Historical 2026-09-24 Expo qualification

The remainder of this document is the preserved report for an earlier rejected candidate. Its `BLOCKED` result describes that historical run and is not the current Phase 6 release status.

**Run:** `ruip6_20260924a`
**Date:** 2026-09-24
**Result:** **BLOCKED — candidate rejected and Staging alias rolled back**
**Production impact:** None
**Source pushed:** No

## Source and authorization

| Requirement | Result | Evidence |
|---|---|---|
| Phase 5 owner approval | PASS | Exact recorded approval: “Yes I approve phase 5.” |
| Windows Edge disposition | N/A | Exact owner waiver: “Okay I authorize to not to do tests in edge in windows, you can do the safari tests too.” This does not establish Windows behavior. |
| Phase 5 checkpoint | PASS | `c2cf45f924816a46583cbe68004f8668e4bd50f9` (`feat: qualify Restaurant responsive UI Phase 5`) |
| Phase 5 source manifest | PASS | SHA-256 `aa5c6b85cc4b7fec6822066b75d05d24acd8d122f36b08216bb97accb1b2c645` |
| Phase 5 screenshots | PASS | All 820 accepted screenshot hashes were revalidated before checkpoint creation. |
| Local-only boundary | PASS | No push; no Development or Production access; no backend contract/function/migration deployment. |

## Staging identity and backup

The fail-closed preflight selected only Supabase Staging `rlrfvqskzvpysewdxqcr`, Firebase `hungrieapp-a2288`, and Restaurant EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`. Staging was healthy with 51 applied migrations and zero pending migrations. `restaurant_earnings_v1` was disabled before, during, and after the run.

The restricted schema backup was 632,202 bytes with SHA-256 `ab2a3b21450b79f3f3c4b18667286f715189ce1d6f282bb847b33a4e7762acfd`. The non-PII baseline SHA-256 was `641e8db8ef3c0bb3aeeb7882a8a66dd878b9d6ddbef7998298d94e38b2d06d5d`.

## Export, deployment, promotion, and rollback

| Requirement | Result | Evidence |
|---|---|---|
| Isolated Restaurant export | PASS | 74 files and 20 static routes; artifact-manifest SHA-256 `32bb85b07a28b509872c5b9aeb41985597892a9ce657ccdcc0daf63b114d2be2` |
| Immutable deployment | PASS | `s4ad8ky39f`, `https://hungrie-restaurant--s4ad8ky39f.expo.app` |
| Immutable smoke | PASS | Six representative routes and nine critical assets returned successfully. |
| Staging alias promotion | PASS | Alias metadata assigned to `s4ad8ky39f`; route and critical-asset content hashes matched the immutable deployment. ETags were supporting evidence only. |
| Captured rollback target | PASS | `6jki82fy0u`, `https://hungrie-restaurant--6jki82fy0u.expo.app` |
| Rollback execution | PASS | Required after the mandatory version-conflict probe failed. |
| Rollback restoration | PASS | Alias metadata returned to `6jki82fy0u`; alias HTML matched SHA-256 `bf9eb41415befbb164e759e0e89e6036173cd9e9cfcf67e6a7ded588ec772aa3` on verification attempt 3. Attempts 1–2 still returned the candidate with CDN age 1382/1387 seconds, so ETag identity was not treated as sole proof. |

## Hosted functional qualification

| Requirement | Result | Evidence or limitation |
|---|---|---|
| Access-context and role states | PASS | Active owner, active manager, pending, suspended, revoked, wrong-role, and unmapped states were checked with tagged Firebase identities. Protected dashboard access failed closed for ineligible states. |
| Caller-bound tenant scope | PASS | Owner/manager dashboard and Menu/settings resolved only Restaurant A; Restaurant B owner was denied access to Restaurant A order data. |
| Menu/settings and replay safety | PASS | Availability was changed and restored; identical operation IDs returned identical results. Settings replay returned identical authoritative data. |
| Private Realtime | PASS | A private `restaurant-orders:v1:<restaurant>` subscription reached `SUBSCRIBED` and received the tagged order insert. |
| Visibility acknowledgement | PASS | Stable acknowledgement replay returned the same result. |
| Canonical lifecycle | PASS | A tagged order reached `preparing`, `ready`, `out_for_delivery`, and `delivered`; Customer authority reconciled to delivered. |
| Expected-version conflict | **FAIL** | A stale `restaurant_transition_order_v1` request did not return the expected `40001`. It exceeded the application's 12-second timeout and still did not return within the diagnostic 65-second limit. The result reproduced on a fresh tagged order. No backend change was attempted. |
| Uncertain-response recovery | INCOMPLETE | Local model tests pass, but the hosted conflict timeout prevented completion of the remaining hosted recovery journey. |
| Cancellation paths | INCOMPLETE | Not reached after the mandatory conflict failure. |
| Anonymous Reviews/reporting | INCOMPLETE | Not reached after the mandatory conflict failure. |
| Notifications and push | BLOCKED | Requires owner-observed physical browser/device evidence; candidate was rejected and rolled back before this gate. |
| Security/sign-out | INCOMPLETE | Local regressions pass; the hosted owner-observed push-clean sign-out was not run after candidate rejection. |
| Hosted responsive/accessibility matrix | INCOMPLETE | Candidate was rejected before completing the hosted matrix. Accepted Phase 5 automated evidence remains valid for the source checkpoint but is not relabeled as Phase 6 hosted evidence. |
| Hosted performance | INCOMPLETE | No Phase 6 result is reported because the candidate failed the mandatory functional gate before reproducible hosted measurements were completed. |

The timeout is a release-blocking hosted finding because the Restaurant repository aborts requests after 12 seconds. The candidate was therefore not retained on the Staging alias.

The protected hosted-failure record has SHA-256 `8903774de690fea9d2c06bf63cda3be4eb6d9e922d40a2af5bdd0fa7dfcd480d`. The verified rollback record has SHA-256 `8412118b0a3330190f8108ed74e3c647d2ecfbad7f56bc5b5d8f24fd2b380ab6`.

## Earnings gate

| Requirement | Result | Evidence |
|---|---|---|
| Capability remains disabled | PASS | Verified directly before fixtures and during cleanup verification. |
| Manager RPC denial | PASS | `restaurant_get_earnings_summary_v1` returned HTTP 403 / SQLSTATE `42501` for the tagged manager. |
| Disabled-window owner result | PASS with finding | The owner read RPC remains callable and returned HTTP 200 with zero delivered orders. The capability controls financial snapshot generation; the UI has no client-visible global capability flag. |
| Temporary activation | BLOCKED | Not authorized and never performed. No activation request was issued after the candidate failed. |
| Populated owner qualification | BLOCKED | Requires a corrected candidate and separate explicit owner authorization for the maximum 30-minute Staging window. |

## Cleanup

The final manifest recorded exactly six tagged orders and nine Firebase identities. Cleanup deleted only manifest-scoped resources. Independent verification returned:

- Restaurants: 0 remaining
- Profiles: 0 remaining
- Orders: 0 remaining
- Push tokens: 0 remaining
- Firebase identities: 0 remaining
- Earnings enabled: false
- Applied migrations: 51; none pending

Cleanup verification evidence SHA-256: `859a909ff2cdec378c5dcf8574ffa8f2cd2b102764b4c1d78379d168af34609d`.

## Local regression and protected files

| Check | Result |
|---|---|
| Responsive UI Phase 1 | PASS — 8/8 |
| Responsive UI Phase 2 | PASS — 13/13 |
| Responsive UI Phase 3 | PASS — 14/14 |
| Responsive UI Phase 4 | PASS — 8/8 |
| Responsive UI Phase 5 | PASS — 8/8 |
| Restaurant TypeScript | PASS |
| Static Restaurant export | PASS — 20 routes |
| Admin build proof | PASS |
| Notification worker | PASS — 11/11 |
| Reviews repositories/UI | PASS — 6/6 and 29/29 |
| Earnings model/contract/safeguards | PASS — 11/11, 6/6, and 13 checks |
| Phase 7 runner/order-flow safeguards | PASS — 21/21 |
| Production route/bundle scan | PASS — 20 routes, 647,213 gzipped JS bytes, 9,907 gzipped CSS bytes |
| Mock/fixture/secret import scan | PASS — no production source matches |
| Private Restaurant Realtime subscriptions | PASS — exactly one |
| `git diff --check` | PASS |

Protected hashes remained unchanged:

| File | SHA-256 |
|---|---|
| `package-lock.json` | `20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33` |
| Generated database types | `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37` |
| Notification service worker | `ef077262cd14ae536e2a61029b411997df5497ff7bda7c8d38e7ef6928ee3be0` |
| Earnings migration | `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94` |

## Commands

The hosted actions used the canonical run ID, explicit Staging environment, action-specific confirmation, exact Phase 5 commit, and exact source-manifest hash. Representative commands were:

```text
node scripts/restaurant-responsive-ui-phase6-staging.mjs preflight|backup|fixtures|verify-disabled|qualify-api|inventory|cleanup|cleanup-verify --run-id=ruip6_20260924a --environment=staging --confirm=staging:restaurant-ui-phase6:<action>:ruip6_20260924a --expect-commit=c2cf45f924816a46583cbe68004f8668e4bd50f9 --expect-source-sha256=aa5c6b85cc4b7fec6822066b75d05d24acd8d122f36b08216bb97accb1b2c645
node scripts/deploy-restaurant-responsive-ui-phase6-staging.mjs export|deploy|verify-immutable|promote|verify-alias|rollback --run-id=ruip6_20260924a --environment=staging --confirm=staging:restaurant-ui-phase6:<action>:ruip6_20260924a --expect-commit=c2cf45f924816a46583cbe68004f8668e4bd50f9 --expect-source-sha256=aa5c6b85cc4b7fec6822066b75d05d24acd8d122f36b08216bb97accb1b2c645
npm run test:restaurant-responsive-ui-phase1
npm run test:restaurant-responsive-ui-phase2
npm run test:restaurant-responsive-ui-phase3
npm run test:restaurant-responsive-ui-phase4
npm run test:restaurant-responsive-ui-phase5
npm run typecheck --workspace @hungrie/restaurant
npm run build:proof
npm run notification-worker:test
npm run test:review-v2-repositories
npm run test:review-v2-ui
npm run test:restaurant-earnings-phase3
npm run test:restaurant-earnings-phase4
npm run phase5:restaurant-earnings:check
npm run phase7:runner:test
git diff --check
```

## Exit matrix

| Gate | Result |
|---|---|
| Audited Phase 5 checkpoint | PASS |
| Fail-closed Staging preflight and backup | PASS |
| Immutable deployment and initial smoke | PASS |
| Alias promotion integrity | PASS |
| Mandatory hosted functional qualification | **BLOCKED** |
| Owner-observed browser/device/PWA/push evidence | BLOCKED |
| Separately authorized populated Earnings qualification | BLOCKED |
| Manifest-scoped cleanup | PASS |
| Verified rollback | PASS |
| Overall Phase 6 exit | **BLOCKED** |

Phase 6 cannot be approved from this run. A corrected and separately reviewed candidate must make stale expected-version requests complete within the application timeout, then repeat the affected hosted functional, browser/device, performance, push/PWA, and separately authorized Earnings gates.
