# Restaurant Earnings and Admin Commission — Phase 2 Review

**Completed:** 2026-09-22  
**Scope:** Local Admin commission management only  
**Gate:** Accepted by the app owner on 2026-09-22

## Phase 1 contract preflight

The accepted Phase 1 implementation and evidence were inspected before UI work. The migration SHA-256 remains `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`, matching the accepted Phase 1 review.

`admin_get_restaurant_commission_v1` returns the following exact top-level fields:

- `restaurantId`, validated `reportingTimezone`, and server-owned `capabilityEnabled`;
- the latest rule with `effective_from <= statement_timestamp()` as `currentRule`;
- the earliest rule with `effective_from > statement_timestamp()` as `nextScheduledRule`;
- the latest 100 append-only rules as `history` and `historyHasMore` from a full count;
- the latest 20 unresolved financial-integrity alerts as `warnings`.

`admin_schedule_restaurant_commission_v1` returns the authoritative rule ID, Restaurant ID, integer basis points, contract version, effective timestamp, trimmed reason, operation ID, and `replayed` boolean. The generated RPC argument types and Phase 1 domain response types match these implementations.

The actual Restaurant lifecycle enum is `pending | active | suspended | closed`. The scheduling RPC rejects only `closed`; pending and suspended Restaurants can receive preparatory rules. The UI therefore presents all non-active states as deterministic business states, makes closed Restaurants read-only, and does not invent deleted or inactive states.

The database uses `btrim` and a 1–500-character bound for reasons. It does not enforce Unicode normalization. The app owner explicitly chose to mirror the accepted Phase 1 contract, so Phase 2 trims and validates 1–500 characters without adding browser-only normalization. Unicode normalization is N/A for this phase by that decision.

No preflight mismatch blocks the implemented Phase 2 contract.

## Implemented Admin contract

- The Restaurant list links identifiers and names to the existing detail route. The detail route no longer displays raw JSON.
- The responsive English/Turkish detail screen presents readable Restaurant metadata, lifecycle and order-acceptance state, capability state, timezone, current coverage, earliest scheduled rule, append-only history, the additional-history notice, and allowlisted PII-free warnings.
- Coverage is distinct for a current rule, no current/future rule, and future-only coverage. A future rule is never labelled current.
- Capability-disabled and capability-enabled coverage consequences are explained from the Phase 1 trigger contract.
- Only an active, MFA-verified `super_admin` context receives the scheduling form. Ordinary Admins are read-only; closed Restaurants and unauthorized or malformed contexts receive no actionable scheduling form.
- The four-minute Firebase `authTime` check is a conservative UX preflight. The database five-minute check remains authoritative. Re-authentication uses the existing sign-out and login/TOTP flow.
- Percentage text is converted directly to an integer digit representation. No `parseFloat`, floating percentage multiplication, native `confirm()`, optimistic history insertion, or client-selected authority is used.
- Restaurant-local wall-clock input is resolved through `Intl.DateTimeFormat` round trips. Zero UTC matches are rejected as nonexistent and multiple matches as ambiguous. The confirmation shows both the localized value and canonical UTC.
- Canonical operation identity consists of Restaurant ID, integer basis points, canonical UTC timestamp, and trimmed reason. A UUID is retained across exact retries and uncertain outcomes, replaced only by changed canonical inputs, and cleared only after a validated success plus authoritative refresh.
- The custom dialog has a labelled `dialog`/`aria-modal` contract, focus entry, focus trapping, Escape handling while idle, focus restoration, and visible focus.

## Repository validation and error boundaries

The feature repository rejects missing, extra, or wrongly typed response fields; invalid UUIDs, timestamps, timezones, basis points, lifecycle/role/status values, warning types/details, contract versions, limits, and response/request identity mismatches. It validates all four consumed RPC responses:

- `admin_get_restaurant_v1`
- `get_my_access_context_v1`
- `admin_get_restaurant_commission_v1`
- `admin_schedule_restaurant_commission_v1`

Malformed responses use a dedicated fail-safe state. Lifecycle restrictions, authorization denial, stale authentication, operation conflict, duplicate effective time, retroactive scheduling, input validation, transport failure, service failure, and unknown errors remain separate classifications. Raw database messages are never rendered.

## Authorization behavior

| Identity or Restaurant state | Inspection | Scheduling UI |
|---|---:|---:|
| Active MFA `super_admin`, active/pending/suspended Restaurant | Allowed | Allowed; server remains authoritative |
| Active MFA ordinary Admin | Allowed | Read-only message; no form |
| Closed Restaurant | Allowed | Lifecycle read-only message; no form |
| Stale Firebase authentication | Existing screen remains visible | RPC is not called; re-authentication guidance |
| Suspended/revoked/pending Admin, unmapped, non-Admin, malformed context, unauthenticated | Auth architecture denies or redirects | No actionable form |
| RPC authorization denial | Existing authoritative data is not invented | Permission error |

## Automated qualification

`npm run test:admin-commission-phase2` passed 11 of 11 tests:

1. Percentage parsing converts accepted English and Turkish text to exact integer basis points.
2. Percentage parsing rejects boundaries and non-canonical formats.
3. Reason validation mirrors Phase 1 trimming and the 1–500-character limit.
4. Restaurant-local conversion returns exact UTC and rejects DST gaps and overlaps.
5. Canonical drafts retain operation IDs for exact retry and replace them only after input changes.
6. Authorization is actionable only for active MFA super-admins and non-closed Restaurants.
7. The four-minute recent-auth preflight is conservative and non-authoritative.
8. The repository strictly maps all four RPC responses and sends exact scheduling arguments.
9. The repository rejects malformed responses, unsafe warnings, identity mismatches, and unknown fields.
10. The repository classifies permission, freshness, conflicts, validation, network, and service failures without raw messages.
11. The Admin component exposes accessible confirmation and no actionable controls for denied branches.

Additional checks:

| Check | Result |
|---|---|
| Phase 2 static contract/security checker | PASS |
| Existing Phase 4 Admin route/auth/cache checker | PASS |
| Admin TypeScript check | PASS |
| Production Admin build | PASS; `/restaurants/[restaurantId]` emitted as a dynamic route |
| `git diff --check` | PASS |
| Protected-file SHA-256 comparison | PASS; all four baseline hashes unchanged |

## Responsive and accessibility review

A local headless-Chrome render used the shipped Admin stylesheet and representative detail, form, history, long-reason, currency, timestamp, and confirmation-dialog markup. Screenshots were written only to `/tmp/hungrie-phase2-{width}.png` and were not added to the repository. The 360 px and 1440 px results were also visually inspected.

| Width | Document/client width | Clipped checked controls/cards | Dialog width | Visible focus |
|---:|---:|---:|---:|---:|
| 360 | 360 / 360 | 0 | 328 | 3 px |
| 390 | 390 / 390 | 0 | 358 | 3 px |
| 768 | 753 / 753 | 0 | 620 | 3 px |
| 1024 | 1009 / 1009 | 0 | 620 | 3 px |
| 1440 | 1425 / 1425 | 0 | 620 | 3 px |

The labelled dialog remained vertically scrollable for a deliberately long reason. A 200% root-text probe initially exposed Admin navigation overflow at the tablet breakpoint; responsive navigation was corrected and the rerun reported equal `scrollWidth` and `clientWidth` (`753 / 753`). Semantic labels, focus rules, long text wrapping, currency wrapping, and dialog keyboard logic are also covered by the focused/static checks.

Limitation: the responsive render used local deterministic fixture markup with the shipped CSS because no privileged Firebase Admin credential was introduced or persisted for this local-only phase. RPC integration and UI state transitions are qualified independently by strict repository/model tests and the production build.

## Changed-file inventory

- Admin route/list/style updates and the new Restaurant commission management component.
- New commission model and strict repository modules.
- New focused test and static contract/security checker, registered as root scripts without dependency changes.
- This review document and the main plan status line.

No migration, database function, generated database type, shared domain type, Restaurant application file, Restaurant Earnings implementation, dependency, or lockfile was changed in Phase 2.

## Environment boundary

All reads, edits, builds, tests, and rendering occurred in the local workspace. Development, Staging, and Production were not contacted. No database reset or mutation, hosted read/write, deployment, commit, push, or Phase 3 work occurred.

The pre-existing `package-lock.json`, Phase 1 migration/types/seed/tests/harness work, unrelated concurrency-script changes, and `apps/restaurant-ui-mock` work were preserved. Final protected hashes are:

- `package-lock.json`: `784150a7b56cfe45c137673fa3fe52d131c1af6aa4b15426d1b14a71aca96155`
- generated database types: `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37`
- shared domain types: `8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe`
- accepted Phase 1 migration: `bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94`

## Requirement and exit-gate matrix

| Requirement or gate | Status | Direct evidence |
|---|---|---|
| Inspect accepted Phase 1 evidence and implementation first | PASS | Preflight section and matching migration checksum |
| Current, scheduled, 100-record history, additional-history, timezone, capability, warnings contract | PASS | Exact RPC inspection plus strict repository test 8 |
| Actual lifecycle states and business restrictions | PASS | Enum/RPC inspection plus authorization test 6 |
| Separate current, uncovered, and future-only coverage | PASS | Dedicated UI branches and static contract check |
| Reason trimming and 1–500 bound | PASS | Server inspection and focused test 3 |
| Unicode normalization | N/A | App-owner decision to mirror accepted Phase 1, which does not enforce it |
| Strict validation of all four RPC responses | PASS | Focused tests 8–9 |
| Active super-admin-only actionable scheduling | PASS | Focused tests 6 and 11 |
| Four-minute client/five-minute server recent-auth model | PASS | Focused test 7 and existing sign-out/TOTP flow integration |
| Deterministic canonical operation-ID reuse | PASS | Focused test 5 and exact repository arguments |
| Exact percentage parsing | PASS | Focused tests 1–2 and static floating-authority check |
| Restaurant-local timezone and DST handling | PASS | Focused test 4 using normal, spring-gap, and autumn-overlap fixtures |
| Responsive bilingual Restaurant detail flow | PASS | Production build, bilingual static check, and five-width render evidence |
| Accessible custom confirmation | PASS | Focused test 11, semantic render probe, visible focus, and source inspection |
| Authoritative refresh after original/replay success | PASS | Component invokes schedule response validation then `getCommission`; no optimistic history path |
| Loading/empty/read-only/permission/stale/validation/replay/success/conflict/lifecycle/malformed/service states | PASS | Explicit branches, classifier tests, and bilingual static check |
| No migration/RPC/generated-type/Restaurant-app/dependency changes | PASS | Protected hashes, changed-file inventory, and repository diff review |
| Admin tests, typecheck, static checks, and production build | PASS | 11/11 plus all listed qualification commands |
| Local-only environment boundary | PASS | Command and repository review; no hosted or deployment operation performed |
| App-owner Phase 2 approval | PASS | Explicitly approved on 2026-09-22 |

## Phase boundary

All Phase 2 implementation and qualification gates pass. Phase 2 was accepted by the app owner on 2026-09-22. Phase 3 has not started and remains separately gated.
