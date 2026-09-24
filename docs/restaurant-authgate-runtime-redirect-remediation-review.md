# Restaurant AuthGate Runtime Redirect Remediation Review

**Status:** `APPROVED — local remediation closed`
**Baseline:** `1dedebe432c29009657aa419ca0dc9f23b98d6c0`
**Scope:** local only
**Hosted access or mutation:** none
**Commit/push/deployment:** none
**Phase 6:** remains `BLOCKED`

Owner completion approval recorded on 2026-09-24: “I approve the local AuthGate runtime redirect remediation as complete.” The approval closes only the local correction and does not authorize a checkpoint, hosted retry, Phase 6 completion, or Production work.

## Implementation

The correction is limited to `apps/restaurant/src/AuthGate.tsx` and directly necessary tests.

1. Active access resolution now commits `state`, the Restaurant ID, the access context, and `RestaurantRuntimeProvider` before redirecting away from Login, Pending, or Suspended.
2. The redirect runs in a post-commit effect gated by the complete active runtime predicate.
3. Protected children remain unrendered while authorization or runtime mounting is incomplete.
4. Pending and suspended pages render only with their matching resolved access context.
5. Wrong-role, revoked, and identity-change paths clear the authenticated runtime state before navigation.
6. Existing transient recovery keeps the previously verified runtime mounted.

No provider contract, RPC, repository, timeout, retry, Realtime, notification, authorization, or financial behavior changed.

## Component lifecycle evidence

Command:

```sh
node --test scripts/test-restaurant-authgate-remediation.mjs
```

Result: `PASS — 8/8`.

The tests transpile and mount the real `AuthGate` component. They exercise React state commits and effects with controlled Firebase, access-context, runtime-provider, and router boundaries. They verify:

- owner and manager Login-to-Dashboard ordering;
- runtime-provider mount before `router.replace("/dashboard")`;
- no protected render before active authorization;
- direct protected-route restoration;
- pending-to-active and suspended-to-active recovery;
- wrong-role and revoked denial;
- transient access failure with the verified runtime preserved;
- logout runtime removal; and
- exactly one production `.channel(` subscription.

The test runner prints React's deprecation notice for `react-test-renderer`; this does not affect the assertions or result.

## Local browser evidence

Commands:

```sh
npm --prefix apps/restaurant run export:web
node scripts/qualify-restaurant-authgate-local.mjs
```

Result: `PASS` in `Chrome/153.0.8010.53` at `1024x768`.

The browser loaded the real Restaurant static export. CDP fulfilled synthetic Firebase password/lookup/refresh and caller-bound Supabase access/dashboard/order responses. Every HTTPS request was intercepted and WebSocket access was blocked; unexpected hosted request count was zero.

Observed sequence:

- Login initially had no protected application shell.
- The synthetic active owner submitted the real Login form.
- The application navigated to `/dashboard` and rendered `Operations overview` with authoritative synthetic Restaurant data.
- The access overlay was absent after readiness.
- No uncaught or rejected `Restaurant runtime is unavailable` error occurred.
- A direct `/dashboard` reload restored the Firebase session, active Restaurant context, runtime provider, and Dashboard without the exception.

Evidence:

- browser report SHA-256: `34c63f20bcf61ca836372f683c668956099315756e2f7a6b6124c2a124411bec`
- screenshot SHA-256: `cc7fe9f326c96efd4029fe545a02b5b12ce7bd4139c6d12b981b64cb07248959`

### Evidence hygiene correction

After owner acceptance, the persistent request inventory was regenerated so it stores only method, host, path, query-parameter names, header names, and the names of credential-bearing headers. It stores no request-header values, authorization values, bearer tokens, API-key values, cookies, request bodies, passwords, or refresh/identity tokens. Unexpected requests use the same value-free structure, and persisted console diagnostics pass through bearer/JWT/query-credential redaction.

The sanitized report retains 15 intercepted-request records, records credential-bearing headers by name only, and records zero unexpected hosted requests. A structural and credential-pattern scan passed with zero raw header-value containers and zero credential-shaped matches.

## Regression results

| Check | Result |
|---|---|
| AuthGate lifecycle suite | `PASS — 8/8` |
| Responsive UI Phase 1 | `PASS — 8/8` |
| Responsive UI Phase 2 / Orders | `PASS — 13/13` |
| Responsive UI Phase 3 | `PASS — 14/14` |
| Responsive UI Phase 4 | `PASS — 8/8` |
| Responsive UI Phase 5 | `PASS — 8/8` |
| Restaurant TypeScript | `PASS` |
| Restaurant static export | `PASS — 20 routes` |
| Phase 5 Restaurant safeguard | `PASS` |
| Phase 5 Restaurant functions | `PASS — 2/2` |
| Notification worker | `PASS — 11/11` |
| Review repositories | `PASS — 6/6` |
| Review UI | `PASS — 29/29` |
| Earnings Phase 3 | `PASS — 11/11 plus safeguard` |
| Earnings Phase 4 | `PASS — 6/6 plus safeguard` |
| Earnings Phase 5 safeguard | `PASS — 13 checks` |
| Phase 7 order flow and runner | `PASS — 21/21` |
| PostgREST conflict transport | `PASS — PostgREST 14.5; stale transition/acknowledgement/cancellation 409/code 40001, concurrency, replay, authorization, recovery, cleanup` |
| Selected Restaurant/review/notification/Earnings/conflict database suite | `PASS — 275 tests` |
| Local database lint | `PASS — zero findings` |
| Production mock/import scan | `PASS` |
| Credential/private-key scan | `PASS` |
| One private Restaurant Realtime subscription | `PASS` |
| `git diff --check`, including new test scripts | `PASS` |

An initial database batch ran concurrently with the disposable PostgREST conflict test. Its Earnings preflight saw prerequisites being removed by the other test's cleanup and failed before producing a TAP plan. The same five-file database suite was rerun serially after cleanup and passed all 275 tests; the Earnings file also passed independently with 91 tests. This was a local test-orchestration error, not a product failure.

## Route and bundle evidence

- static HTML routes: `20`
- gzipped JavaScript: `646,723` bytes
- gzipped CSS: `9,907` bytes
- entry JavaScript SHA-256: `2231e1a90cd8d61d8ac35ba2f7c99217350010784405f4eb13f19f70dc848f52`
- service worker SHA-256: `ef077262cd14ae536e2a61029b411997df5497ff7bda7c8d38e7ef6928ee3be0`

## Protected files and evidence

| File/evidence | SHA-256 |
|---|---|
| `apps/restaurant/src/orders/orderRepository.ts` | `7e690e35c62abe69b763fef733c872e68e15a231ee12d624f71cb4fb3b89859c` |
| `apps/restaurant/src/orders/orderModel.ts` | `b73cf5e7071c6581714a0b5ea11ddaf33fa234244bb464a63df7ab0db4364c42` |
| generated database types | `337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37` |
| `package-lock.json` | `20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33` |
| conflict migration | `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641` |
| Phase 6 remediation evidence manifest | `4f64ed4ee5d489b17c28c1e84147aa632e3a735e613a1bfb59f9dbecb8049092` |

The Phase 5 migration baseline guard now permits exactly the separately approved conflict migration at the pinned checksum. It still rejects any other migration delta and independently protects generated types, the Restaurant service worker, and the lockfile.

## Review inventory

- `apps/restaurant/src/AuthGate.tsx`: `d24fd2e6fd599b68496c320409bbcd07cd576fbfda05d63e6740f25faaffd3b4`
- `scripts/test-restaurant-authgate-remediation.mjs`: `1fe5dc975c64c05e3ccfec9e30ee5f79cc8300e5ddc55e537c2335c39037322d`
- `scripts/qualify-restaurant-authgate-local.mjs`: `88ea8bc4eb28a0ccaf9d54a7fcc5c4ff8bbdb02a973a4ce9410a44b2b50d323a`
- Phase 5 protected migration test: `48f6b74fe3be05267bfc9e2c4cb8a33a3b6274a30d486bae28a5a7d6f6629c4a`
- complete implementation diff: `a63749102dcb5f43911b9c35e546a11e8d7a7db47006d884c98ea3c8311c3bd2`

All remediation changes remain uncommitted. Existing Phase 6 evidence, rollback records, and cleanup manifests remain preserved. No Development, Staging, or Production environment was accessed or modified. No source was pushed, no candidate was deployed, no alias changed, and Earnings was not activated.

## Remaining limitation

The browser qualification deliberately substitutes local synthetic identity/access responses and blocks Realtime transport. It proves the client lifecycle and redirect ordering in the production bundle; it does not repeat hosted authentication, private Realtime, push delivery, or device/PWA qualification. Those remain part of a separately authorized future Staging requalification. Phase 6 remains `BLOCKED`.
