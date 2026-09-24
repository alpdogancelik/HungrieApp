# Restaurant AuthGate Alias Content-Parity Staging Validation and Phase 6 Requalification Plan

**Status:** Proposed; explicit owner authorization required before any hosted access or mutation
**Scope:** Staging Restaurant web validation and affected Phase 6 requalification
**Production:** Prohibited
**Earnings:** Must remain disabled
**Phase 6:** `BLOCKED`

## 1. Authorization boundary

Approval of this plan would authorize only the explicitly listed Staging operations against:

- Supabase Staging project `rlrfvqskzvpysewdxqcr`;
- shared non-production Firebase project `hungrieapp-a2288`;
- Restaurant EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`;
- Restaurant `staging` web alias.

It would not authorize Development or Production access, source push, Production deployment, backend-contract changes, another migration, automatic promotion retry, or activation of `restaurant_earnings_v1`.

Successful alias parity would open the remaining qualification gates. It would not complete Phase 6.

## 2. Accepted inputs

The execution must begin from these accepted local records:

| Input | Required identity |
|---|---|
| Current application checkpoint | `69498f3225ebd86316b44ee1b87c8a03794c659e` |
| Accepted application source manifest | `f54392a13790b9a8b064bbedb81064f220dafe79645f49711ca409c37836af8c` |
| Accepted immutable export archive | `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` |
| Conflict migration | `20260924140000`, checksum `750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641` |
| Protected failed-run evidence manifest | `4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44` |
| Accepted parity verifier | `10a725acc7c5281ef6e98d836f72f2f507d5300bf88a07ef4cbe5b692f2a2525` |
| Accepted operator tests | `35ea971cfe03f34eb42aff9201e23c1e970d8f3a7a941d7631642fe08bb95bb4` |

Rejected deployments `8qserom2qp`, `mn77ek9rg5`, and `bfh8u5a0dh` remain evidence only and must not be promoted or reused.

## 3. Audited local checkpoint

Before hosted access:

1. Reverify the owner's local-completion approval and the accepted investigation, plan, implementation diff, qualification report, and 14/14 deterministic test result.
2. Verify all 35 files in `ruip6a_20260924b` against the protected evidence manifest without rewriting them.
3. Rerun:
   - alias parity verifier tests;
   - JavaScript syntax checks;
   - Restaurant TypeScript check;
   - credential/secret scans;
   - application/runtime diff check;
   - immutable archive hash check;
   - `git diff --check`.
4. Stage only the accepted operator correction, verifier, tests, investigation, remediation plan, implementation diff, and qualification report. Inspect the complete staged inventory and staged diff for credentials, unrelated changes, generated output, or application/runtime drift.
5. Create one local checkpoint with the proposed subject:

   ```text
   fix: harden Restaurant alias parity verification
   ```

6. Record the checkpoint SHA-256 source manifest and the hashes of every executable operator file. Do not push.
7. Leave all subsequent Staging reports and evidence uncommitted.

The checkpoint changes operator tooling only. It must not change the Restaurant application artifact.

## 4. Canonical run and fail-closed preflight

Generate a new canonical run ID. Require the run ID, checkpoint hash, source-manifest hash, target environment, and action-specific confirmation on every hosted command.

Before fixtures, export, deployment, or alias mutation:

1. Verify the exact Supabase, Firebase, EAS, and alias identifiers listed in section 1.
2. Prove that Development and Production identifiers are absent from command inputs and runtime configuration.
3. Verify migration `20260924140000` is applied exactly once with its accepted function definitions and privileges; require no pending migrations.
4. Verify `restaurant_earnings_v1` is disabled.
5. Query current alias metadata independently and capture:
   - alias ID and URL;
   - rollback deployment ID, identifier, immutable URL, creation and alias-update timestamps;
   - exact rollback HTML and critical-asset paths/hashes;
   - status, final URL, response size, ETag, Cache-Control, Age, Date, Last-Modified, Server, Via, and available CDN/request identifiers.
6. Require alias metadata and exact content to agree on the rollback deployment before proceeding.
7. Capture a restricted schema backup and a non-PII baseline for only the tables and storage areas that disposable qualification data may touch.
8. Verify zero residual resources from earlier `ruip6*` runs, or identify and resolve them through a separately reviewed recovery step.
9. Record existing unrelated Staging counts and digests so concurrent activity can be distinguished from run-created data.

Any identity, migration, capability, rollback-target, or baseline mismatch stops execution before mutation.

## 5. Disposable fixtures

Create only manifest-recorded resources tagged with the new run ID:

- two disposable Restaurants;
- active owner, manager, second owner, Customer, pending, suspended, revoked, wrong-role, and unmapped identities;
- minimal menu, media, order, review, notification-registration, and disabled-state financial records needed by the approved checks.

Every identity, database row, object path, operation ID, Firebase UID, push token, creation timestamp, and digest must be written to the protected run manifest before dependent work continues. Unrestricted deletion and prefix-only cleanup are prohibited.

Earnings fixtures may be prepared only in their disabled presentation state. Populated Earnings qualification remains blocked pending a separate activation authorization.

## 6. New immutable candidate

1. Export Restaurant web from an isolated checkout of the audited checkpoint using the approved Staging build environment.
2. Prove application/runtime sources are identical to the accepted application source manifest. Operator-only checkpoint files must not enter the web bundle.
3. Produce and hash:
   - source manifest;
   - route inventory;
   - complete artifact manifest;
   - deterministic archive;
   - HTML, JavaScript, CSS, service worker, manifest, and runtime-configuration files.
4. Require 20 production routes and absence of test adapters, mock providers, fixture controls, credentials, and Development/Production configuration.
5. Compare the new export with the accepted immutable artifact. Any unexpected application-file or critical-content difference blocks deployment and requires review.
6. Deploy once to a new immutable Restaurant URL without assigning an alias. Do not reuse the three rejected deployment identifiers.
7. Record the new immutable deployment ID and URL, then verify every required route and critical asset against the fixed local artifact hashes.
8. Run immutable authentication and runtime smoke checks for pending, suspended, owner, and manager identities, including direct-route restoration and bounded navigation. A failure blocks promotion.

After immutable verification passes, freeze its route and critical-asset manifest as the fixed reference for alias observation. It must not be refetched as a moving expected baseline after promotion.

## 7. Single controlled alias promotion

Immediately before promotion, repeat the fail-closed checks for:

- checkpoint and manifests;
- immutable candidate identity and hashes;
- current rollback metadata and content;
- migration state;
- Earnings disabled state;
- fixture manifest integrity.

With a separately supplied action-specific confirmation, assign the `staging` alias to the new immutable candidate exactly once.

There is no automatic promotion retry. A command failure, uncertain assignment, or mismatching response enters verification/rollback handling; it must not cause another promotion command.

## 8. Bounded alias observer

Run the approved observer immediately after the promotion command returns:

```text
maximum attempts:       10
polling interval:       5 seconds
maximum observation:    50 seconds from attempt 1
final attempt target:   +45 seconds
```

For every attempt:

1. Independently query alias metadata and record the returned deployment identifier, alias update time when available, retrieval time, response timing, status, hash, byte length, and allowlisted CDN/cache headers.
2. Request every fixed route and critical asset with run/attempt cache-busting and explicit no-cache request directives.
3. Persist each sanitized observation atomically before parsing or comparison.
4. Record metadata and content convergence separately.
5. Preserve every old, mixed, erroneous, redirected, timed-out, or mismatching response.

Parity passes only when one complete attempt has candidate metadata plus HTTP 200, exact final URLs, exact HTML SHA-256 values, all expected critical-asset references, and exact critical-asset SHA-256 values. Partial, majority, metadata-only, ETag-only, late, or incomplete parity fails.

No request may begin at or after +50 seconds, and a result completing after the deadline cannot pass.

## 9. Failure and independently verified rollback

If metadata/content parity does not converge, a request errors irrecoverably, or the 50-second window expires:

1. Mark the candidate failed and `rollbackRequired: true`.
2. Execute the previously captured rollback assignment once using its independent confirmation.
3. Poll rollback metadata and content with bounded, cache-busted requests.
4. Require metadata to identify the captured rollback deployment and every required rollback route/asset to match its exact captured hash.
5. Preserve promotion, observer, failure, rollback, and restoration evidence.
6. Stop all post-promotion application qualification, clean manifest-scoped fixtures, and keep Phase 6 blocked.

If rollback cannot be independently verified, stop cleanup operations that could impair recovery, preserve the backup and recovery manifest, and report an emergency blocker.

## 10. Mandatory post-parity authentication gate

Only after exact alias parity passes, perform real alias authentication checks for:

- pending identity landing on the pending screen without operational runtime;
- suspended identity landing on the suspended screen without operational runtime;
- active owner reaching Dashboard with the runtime provider committed first;
- active manager reaching Dashboard with the runtime provider committed first;
- pending-to-active and suspended-to-active recovery, followed by restoration of their inactive states;
- direct protected-route refresh and session restoration;
- wrong-role, revoked, and unmapped denial;
- logout and removal of authenticated runtime access.

Record navigation/render bounds, browser console output, request inventory, final route, runtime visibility, and screenshot hashes. Any blank document, React update-depth error, runtime-unavailable exception, premature protected content, or unexpected hosted request fails the gate and triggers rollback.

## 11. Affected Phase 6 requalification

After authentication passes, repeat all candidate-sensitive checks:

### Functional and authorization

- invitation and access states;
- cross-tenant denial and caller-bound Restaurant access;
- complete order lifecycle, cancellations, deadlines, stale-version and concurrent conflicts, idempotent replay, acknowledgement, uncertain-response reconciliation, private Realtime, polling, reconnect, and canonical deep links;
- Menu, Restaurant settings, anonymous Reviews/reporting, Security, and push-clean sign-out;
- disabled owner Earnings state, manager navigation absence, manager direct-route denial, and zero manager financial requests.

### Responsive and accessibility

- Turkish and English at 390×844, 768×1024, 1024×768, and 1440×900;
- 100%/200% zoom, text scaling, reduced motion, safe areas, opaque sticky surfaces, overflow, covered actions, and scroll containment;
- automated accessibility trees, landmarks, headings, labels, errors, live regions, modal isolation, focus restoration, tab keyboard behavior, and keyboard-only paths.

Windows Edge remains `N/A — explicit owner waiver`. Manual VoiceOver and NVDA remain `N/A — owner decision`; automated accessibility evidence remains mandatory.

### Performance and bundle

- measure authentication, workspace, order detail, Menu, Reviews, and Earnings-disabled routes;
- at least five repetitions for every route/configuration;
- separately record cold initial load and client navigation;
- record browser/version, viewport, cache state, network/CPU throttling, method, individual values, median LCP/CLS, navigation duration, console errors, and asset failures;
- preserve the approved route, JS, and CSS budgets.

### Device, PWA, and notification evidence

Request owner-observed evidence for macOS Chrome, Edge, and Safari plus physical iPhone and iPad Safari/PWA. Record exact versions, candidate deployment identity, artifact hashes, screenshots and hashes, responsive/zoom results, PWA installation guidance, permission behavior, foreground/background/closed-page push, Turkish/English payloads, disable/unregister, and sign-out cleanup.

Unobserved device results must remain `INCOMPLETE`, never inferred as PASS.

## 12. Regression suite

Run and record:

- alias parity verifier tests;
- AuthGate lifecycle and browser tests;
- UI Phase 1–5 tests;
- Restaurant TypeScript and static export;
- order-flow and conflict transport tests;
- notification-worker tests;
- Reviews tests;
- Earnings safeguards with the capability disabled;
- Realtime single-subscription check;
- database lint and protected migration checks;
- route, bundle, secret, mock-import, credential-persistence, and protected-file scans;
- `git diff --check`.

## 13. Manifest-scoped cleanup and final state

1. Verify Earnings is disabled before cleanup.
2. Unregister disposable push tokens and preserve the final run manifest.
3. Delete only manifest-listed Firebase identities, storage objects, media, database rows, tokens, and files, using immutable identifiers and recorded digests.
4. Restore pending and suspended fixture states before deleting them when recovery evidence requires it.
5. Leave unrelated and concurrent Staging activity untouched.
6. Reconcile exact baseline counts and digests, verify zero run-tagged resources, no pending migrations, accepted migration/function hashes, and Earnings disabled.
7. Verify the intended final alias deployment and exact content:
   - retain the new candidate only if every required qualification gate passes and owner review permits it;
   - otherwise restore and verify the captured rollback deployment.
8. If cleanup or final-state verification fails, preserve the restricted backup and recovery manifest, list every remaining resource, and keep Phase 6 blocked.

## 14. Evidence and exit gates

Produce an uncommitted report with exact commands, timestamps, checkpoint and manifests, artifact hashes, immutable/candidate/rollback IDs, every parity observation, CDN/cache headers, alias decision, authentication results, functional and authorization results, browser/device evidence, accessibility and performance measurements, fixture inventory, cleanup reconciliation, limitations, and `PASS`, `N/A`, `BLOCKED`, or `INCOMPLETE` for every requirement.

The populated Earnings gate remains `BLOCKED` until a separately reviewed maximum-30-minute activation plan is explicitly authorized, executed, disabled, and independently verified.

Do not request Phase 6 completion while alias parity, mandatory authentication, affected qualification, owner-observed evidence, populated Earnings, cleanup, or final-state gates remain blocked or incomplete.

Only after every mandatory gate passes may the migration-level approval question be presented. That approval would close the responsive UI migration and would not authorize Production deployment.
