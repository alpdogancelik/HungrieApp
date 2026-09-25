# Restaurant Staging Four-Account Preparation Operator — Local Implementation Review

**Status:** LOCAL OPERATOR READINESS PASS; uncommitted; hosted execution is not authorized
**Reviewed plan:** `docs/restaurant-staging-four-account-preparation-plan.md`
**Plan SHA-256:** `eacfb9adcb01e40c778f7a0d4ec49af31c23466d2088ab0a69a73931f4f506fa`
**Starting checkpoint:** `c3180f019de93fae99341628577a9553faad60f7`
**Run:** `ruip6ad_20260925a`
**Selected Restaurant:** `598eacea-dd2a-4549-a198-40593f7fab06`
**Environment binding:** Supabase `rlrfvqskzvpysewdxqcr`; Firebase `hungrieapp-a2288`

## 1. Result

The local implementation is ready for owner review. It implements the exact four-identity preparation, independent reconciliation, and independently confirmed recovery workflow described by the reviewed plan. No hosted service was accessed, no real account or credential file was created, no source was committed or pushed, and no application, migration, backend contract, Firebase identity, or hosted state changed.

The operator remains inert without a later owner-signed authority record, an audited operator commit, the exact secure accounts file, the action-specific confirmation, and live preflight observations matching every reviewed hash and count. This review does not provide those inputs and does not authorize hosted execution.

## 2. Changed-file inventory

| File | Purpose | SHA-256 |
|---|---|---|
| `scripts/restaurant-staging-account-preparation.mjs` | Fail-closed preparation, reconciliation, recovery, provider, SQL, evidence, and CLI contract | `39d9ccd615b644715fe33337a9b60e6f7227d2207a0c7ada605a181bdb51105a` |
| `scripts/test-restaurant-staging-account-preparation.mjs` | Deterministic authority, state, evidence, failure, uncertainty, and recovery tests | `8e4e96a7d9131b77f65e32b4619ed7b573ff73f8c190a33f546126b39d608f85` |
| `scripts/test-restaurant-staging-account-preparation-postgres.mjs` | Real local PostgreSQL preparation/recovery transaction test with outer rollback | `5ac0d5049440750444b983d3b8f6c07b5edfd4d5f6153bee4b302ec10c68171b` |
| `docs/restaurant-staging-four-account-preparation-implementation.diff` | Complete patch for the three implementation/test files | `47e3dbcd9dd0c3aeb3973a009a80823e423545432ae19e3087be5ea45a219032` |
| `docs/restaurant-staging-four-account-preparation-implementation-review.md` | This review | Calculated after finalization |

The complete diff contains 800 lines and reconstructs the three executable/test files from `/dev/null`. Existing unrelated untracked Phase 6 operator files were neither edited nor included.

## 3. Exact identity and mutation boundary

The implementation hard-codes and revalidates this reviewed mapping:

| Qualification | Email | Profile/Firebase UID | Prepared access |
|---|---|---|---|
| Owner | `gabava5260@jobscai.com` | `oupm6g6CyzRgY3RjOU3BkpCGmRh1` | Restaurant active owner, version 2 |
| Manager | `nenof71463@meonvr.com` | `6ePlV6emcjZEpqi5jsQTF7chiq83` | Restaurant active manager, version 2 |
| Pending | `setovot129@meonvr.com` | `v9kzlLATn9fQxJ6oPTUjxTDj8MJ3` | Restaurant pending manager, approval required, version 2 |
| Suspended | `gejap71504@meonvr.com` | `TBaq9HQIL9OBwLFP3MKchi3rpSA2` | Restaurant suspended manager, version 7 |

The preparation transaction may change only the four matching `private.account_access` rows, the four matching `private.account_email_reservations` rows, the two reviewed addresses, one reviewed favorite, and two reviewed notification-preference rows. It writes four scoped audit events. It never updates profiles, Firebase users, passwords, the Restaurant, existing Restaurant accounts, historical invitations, orders, provisioning records, prior audits, incidents, reviews, menu data, push registrations, commission records, or financial records. It creates no `private.restaurant_members` row.

The recovery transaction restores the four Customer access/reservation states and five disposable rows from the protected snapshot. Authorization versions remain monotonic: prepared versions are 2/2/2/7 and recovered versions are 3/3/3/8. Preparation and recovery audit history is retained.

## 4. Fail-closed implementation

### Authority and local input gates

The operator requires an exact version-1 authority object with:

- decision `APPROVE_RESTAURANT_STAGING_ACCOUNT_PREPARATION`;
- `approvedForHostedMutation: true` and environment `staging`;
- the exact run, diagnostic checkpoint, plan digest, Supabase project, Firebase project, and Restaurant;
- a 40-character audited operator commit equal to current `HEAD`;
- exactly the actions `prepare`, `reconcile`, and `recover`;
- owner authorization text and its exact SHA-256;
- a valid, current authorization window no longer than 24 hours.

The accounts file must be exactly `secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json`, a regular mode-`0600` Git-ignored file, with exactly the four approved role/email entries and non-placeholder passwords. Password values are used only by later access qualification; this operator never writes them into evidence or output.

### Read-only preflight and snapshot

Before SQL mutation, the future hosted provider must independently read all four Firebase users and the database. Firebase must return the exact UID/email bindings, enabled and verified users, and password provider only. The database snapshot is a read-only transaction and records:

- local-versus-applied migration parity and zero pending migrations;
- required tables, constraints, trigger, unique membership index, and audit function;
- Earnings disabled;
- exact Restaurant row and SHA-256;
- complete four-profile/access/reservation rows and reviewed row hashes;
- exact five disposable rows and hashes;
- authorization-overlap, identity-dependency, history, and Restaurant relationship counts;
- preparation/recovery audit counts.

The exclusive `preparation-attempt.json` marker is created before provider access. Firebase and database observations are atomically persisted to `preflight-progress.json` before validation, so malformed, interrupted, and unsuccessful preflight observations remain reviewable. The complete protected `before-state.json` and raw-byte `before-state.sha256` are created before mutation.

### Transaction

The generated SQL uses one transaction, a run-specific advisory transaction lock, `lock_timeout='5s'`, and `statement_timeout='30s'`. It locks the Restaurant, identities, reservations, and disposable rows. Inside the lock it rechecks:

- exact profile, access, reservation, disposable, and Restaurant hashes;
- exact current account shapes and authorization versions;
- absence of memberships, platform roles, orders, reviews, push tokens, and target invitations;
- exact protected provisioning/audit history;
- exact five disposable rows;
- exact selected-Restaurant relationship counts;
- disabled Earnings.

Every delete, update, and insert has an exact row-count assertion. Before `COMMIT`, the transaction rechecks all four prepared access rows, all reservations, unchanged profile and Restaurant hashes, absence of authorization overlaps and unexpected dependencies, unchanged history, unchanged Restaurant relationships, removal of the five disposable rows, and exactly four new run-bound audit events.

The revoked Customer row is replaced rather than updated through the transition trigger. This preserves the accepted schema contract while moving to the reviewed suspended Restaurant state. It does not weaken or bypass account constraints.

### Post-commit reconciliation and recovery

A successful response is insufficient by itself. The operator performs an independent read-only postcondition snapshot and validates all prepared states and protected counts before writing `PASS`.

For SQL rejection, transport loss, or an uncertain response, it independently reads current state and classifies it as `BEFORE`, `AFTER`, `RECOVERED`, or `PARTIAL_OR_UNKNOWN`. An uncertain preparation response is always `BLOCKED`, including when the read shows `AFTER`. A partial or unavailable reconciliation is `BLOCKED`.

Recovery requires the original before-state bytes and matching digest, a separate action confirmation containing the canonical authority SHA-256, an exclusive recovery-attempt marker, and the exact prepared state. It restores only reviewed rows, increments authorization versions, writes recovery audits, and independently verifies the recovered state. A response lost after a demonstrably complete recovery may reconcile to `PASS`; all other failed or uncertain recovery states remain `BLOCKED`.

## 5. Exact future command contract

These commands describe a possible later authorized run. They were not executed:

```bash
node scripts/restaurant-staging-account-preparation.mjs prepare \
  --authority=<secure-mode-0600-owner-approved-authority.json> \
  --accounts=secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json \
  --confirm=staging:restaurant-account-preparation:prepare:ruip6ad_20260925a

node scripts/restaurant-staging-account-preparation.mjs reconcile \
  --authority=<same-authority.json> \
  --accounts=secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json \
  --confirm=staging:restaurant-account-preparation:reconcile:ruip6ad_20260925a

node scripts/restaurant-staging-account-preparation.mjs recover \
  --authority=<same-authority.json> \
  --accounts=secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-accounts.json \
  --confirm=staging:restaurant-account-preparation:recover:ruip6ad_20260925a:<canonical-authority-sha256>
```

The later operator commit must be recorded in the authority and equal `HEAD`. The recovery digest is SHA-256 of the canonical two-space-indented authority JSON plus one trailing newline. Recovery is independently executable; it is never automatic.

## 6. Evidence contract

All evidence is placed beneath:

`secure/restaurant-alias-diagnostic-authority/ruip6ad_20260925a-account-preparation/`

The directory is mode `0700`; files are mode `0600`. Exclusive markers and snapshots are never overwritten. Atomic progress and terminal files use a temporary file followed by rename.

| File | Creation and meaning |
|---|---|
| `preparation-attempt.json` | Exclusive, run-bound start marker before provider access |
| `preparation-authority.json` | Exact validated authority copied after marker creation |
| `preflight-progress.json` | Atomic Firebase then database observations, persisted before evaluation |
| `before-state.json` | Exclusive complete pre-mutation snapshot |
| `before-state.sha256` | SHA-256 of exact snapshot bytes |
| `postcondition-report.json` | Exclusive independent post-commit database snapshot |
| `preparation-result.json` | Atomic terminal `PASS`, `FAIL`, or `BLOCKED` result and reconciliation |
| `reconciliation-result.json` | Separate read-only reconciliation result; never overwrites postconditions |
| `recovery-attempt.json` | Exclusive independently authorized recovery marker |
| `recovery-result.json` | Atomic recovery result and independent reconciliation |

Errors are reduced to bounded name, code, and sanitized message. Persistent results never contain account passwords, bearer values, cookies, authorization headers, credential bodies, or raw database API errors.

## 7. Qualification results

### Operator and real database

| Command/check | Result |
|---|---|
| `node --check` on all three implementation/test files | PASS |
| `node --test scripts/test-restaurant-staging-account-preparation.mjs scripts/test-restaurant-staging-account-preparation-postgres.mjs` | PASS — 58/58 |
| Deterministic unit/fault-injection cases | PASS — 57/57 |
| Real local PostgreSQL preparation and recovery | PASS — generated SQL executed against the current schema; prepared and recovered state verified; outer fixture transaction rolled back; zero residue |
| Duplicate invocation | PASS — exclusive attempt blocks a second mutation |
| Lock failure and SQL exception | PASS — no prepared state; independent `BEFORE` reconciliation |
| Uncertain preparation response | PASS — both before-commit and after-commit cases remain `BLOCKED` |
| Interrupted preflight/snapshot | PASS — attempt/progress evidence survives; no mutation |
| Recovery and uncertain recovery | PASS — exact confirmation, restored rows, monotonic versions, independent reconciliation |
| Credential-file shape/security | PASS — exact roles, emails, path, mode `0600`, and Git exclusion required; secret values absent from evidence |
| Unrelated and historical rows | PASS — counts and local PostgreSQL assertions preserved |

The first full database-suite invocation found pre-existing local fixture contamination and a missing local Realtime policy. It was not accepted as qualification. The repository-approved `npm run supabase:reset` rebuilt only local Supabase and reapplied the local receive-only Realtime policy. The clean rerun passed:

| Repository regression | Result |
|---|---|
| `supabase test db --local supabase/tests` | PASS — 31 files, 905 tests |
| `npm run supabase:lint` | PASS — no public/private/migration errors |
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1 | PASS — 8/8 |
| Responsive UI Phase 2 | PASS — 13/13 |
| Responsive UI Phase 3 | PASS — 14/14 |
| Responsive UI Phase 4 | PASS — 8/8 |
| Responsive UI Phase 5 | PASS — 8/8 |
| Notification worker | PASS — 11/11 |
| Restaurant push functions | PASS — 2/2 |
| Review repositories | PASS — 6/6 |
| Review UI | PASS — 29/29 |
| Earnings Phase 3 | PASS — 11/11 |
| Earnings Phase 4 contract | PASS — 6/6 |
| Phase 7 runner/order flow | PASS — 21/21 |
| Local PostgREST conflict transport | PASS — stale transition/acknowledgement/cancellation returned HTTP 409 code 40001; cross-tenant denial, idempotency, concurrency, recovery, and Earnings-disabled checks passed; cleanup true |

No regression was skipped. The local Supabase reset was confined to the local Docker stack and performed no hosted access.

## 8. Integrity and boundary verification

| Check | Result |
|---|---|
| `git rev-parse HEAD` | PASS — `c3180f019de93fae99341628577a9553faad60f7` |
| Reviewed plan | PASS — `eacfb9adcb01e40c778f7a0d4ec49af31c23466d2088ab0a69a73931f4f506fa` |
| Restaurant application tree | PASS — unchanged `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Accepted artifact inventory | PASS — 74 files; manifest `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` |
| Deterministic archive | PASS — both protected copies `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Protected `ruip6a_20260924b` | PASS — 35/35; manifest `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44` |
| Protected `ruip6a_20260924c` | PASS — 42/42; manifest `85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538` |
| Credential scan | PASS — no JWT, Firebase API key, private key, or Supabase personal-token pattern in the three source/test files or complete diff |
| `git diff --check` | PASS |

Previous Phase 6 evidence and unrelated secure files were read only for integrity checks and were not rewritten.

## 9. External prerequisites and limitations

A later owner-reviewed work package must still:

1. create one audited local checkpoint containing only this approved package;
2. supply a fresh, exact owner authority bound to that checkpoint and a current window;
3. create the real mode-`0600`, Git-ignored accounts file from existing credentials without exposing or resetting passwords;
4. provide authorized Staging Supabase management access and shared non-production Firebase Admin access from the approved external credential source;
5. rerun fresh Firebase and database preflight and require every reviewed hash/count to remain exact;
6. separately authorize the hosted `prepare` action and, if needed, the independent `recover` action;
7. keep Earnings disabled and preserve all Phase 6 deployment/rollback boundaries;
8. perform the later real four-state immutable authentication qualification.

The operator intentionally has no general-purpose email, UID, Restaurant, row, or delete arguments. Any before-state drift aborts rather than adapting the mutation. The fixed row hashes are based on the read-only discovery captured in the plan and will require a new review if Staging changes.

## 10. Proposed audited local checkpoint procedure

The owner may later authorize one local checkpoint only after:

1. requiring `HEAD` `c3180f019de93fae99341628577a9553faad60f7`;
2. verifying the plan and all five package hashes from this review;
3. reconstructing the three source files from the complete diff byte-for-byte;
4. rerunning the 58 operator tests, syntax checks, 905 database tests on a clean local baseline, and the recorded application regressions;
5. reverifying the Restaurant tree, artifact/archive, protected evidence, credential scan, and `git diff --check`;
6. staging exactly the three scripts plus this review and complete diff;
7. inspecting the complete staged inventory/diff and requiring `git diff --cached --check` to pass;
8. creating one local commit only, without push or hosted access.

The resulting checkpoint would still not authorize Staging mutation. Phase 6 remains `BLOCKED`.
