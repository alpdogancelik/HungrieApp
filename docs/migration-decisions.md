# Firebase to Supabase Migration Decisions and Risks

Status: Milestone 0 approved; recorded legal confirmations remain prerequisites for later work
Decision owner and production go/no-go approver: App owner
Rollback owner: App owner

## Approved decisions

| Decision | Approved choice | Owner | Follow-up |
|---|---|---|---|
| Money representation | Integer kuruş | App owner | Conversion and parity tests begin with schema work |
| Cutover strategy | Maintenance window and final delta import | App owner | Define duration and customer/operator messaging before production cutover |
| Existing passwords | Preserve through Firebase Auth bridge | App owner | Supabase Auth remains a separate, later milestone |
| Supabase region | EU Central engineering default | App owner | Formal KVKK/privacy confirmation remains required before production data cutover |
| Firebase retention | 90 days read-only after verified production cutover | App owner | Deletion requires a separate confirmation after rollback period |
| Order/audit history | 7 years | App owner | Legal/accounting confirmation required before schema retention policy is finalized |
| Courier model | Restaurant-scoped | App owner | Membership and RLS tests must prevent cross-restaurant access |
| Current Firebase environment | Development | App owner | Do not treat this classification as permission for destructive writes |
| Live inventory access | Temporary least-privilege service account | App owner | Store outside Git and revoke after inventory/export work |
| Supabase environments before launch | Use one Frankfurt development project during the test-only migration; provision isolated staging and production before public launch | App owner | Current Firebase users, orders, and catalog activity are test data rather than production usage |
| Courier dispatch | Restaurant-scoped self-claim | App owner | Only platform couriers assigned to the restaurant may claim a ready order |
| Platform authorization | Separate admin and super-admin privileges | App owner | Super-admin alone manages platform roles and restaurant owners |
| Order fees in the first SQL implementation | Restaurant delivery fee only; service fee, discount, and tip are zero | App owner | Add other fee engines only through a separately reviewed database change |
| Terminal-order privacy | Mask customer contact and delivery-address details from restaurant members and couriers after delivery or cancellation | App owner | Admin support view retains the protected details |
| Catalog removal | Soft-deactivate categories and menu items | App owner | No client-facing catalog hard-delete operation |

The app owner accepted EU Central and seven-year retention as engineering defaults for Milestone 1. Formal legal confirmation remains required before production data cutover and before retention automation is finalized.

## Risk log

| ID | Risk | Evidence/impact | Owner | Resolution gate | Status |
|---|---|---|---|---|---|
| M0-R01 | Live counts and schemas were not captured | Two stable sanitized reports now cover 1,269 documents and 58 Auth users | App owner | Milestone 0 | Resolved |
| M0-R02 | Live Auth provider configuration was unverified | Live configuration confirms password-only authentication; email is enabled and passwords required | App owner | Milestone 0 | Resolved |
| M0-R03 | Deployed Firestore rules/index parity was unverified | Deployed rules match the local checksum and all nine deployed indexes match local definitions | App owner | Milestone 0 | Resolved |
| M0-R04 | Ownership is represented in multiple forms | All nine restaurant `ownerId` values lack matching profile documents, while all nine staff records reference valid restaurants | App owner | Milestone 6 | Confirmed; deferred with owner |
| M0-R05 | Public Firestore reads are broader than target access | Supabase now exposes only active catalog rows and published reviews through curated views; Firebase remains unchanged until domain cutover | Technical implementation | Milestone 3 | Resolved for Supabase; Firebase exposure ends at cutover |
| M0-R06 | Restaurant push-token authorization is inconsistent | Supabase token storage is private and restaurant authorization uses protected memberships; notification registration/cutover remains in Milestone 10 | Technical implementation | Milestones 3 and 10 | Supabase authorization resolved; notification cutover open |
| M0-R07 | Order status aliases exist | The SQL schema and transition RPCs enforce canonical statuses; legacy aliases still require normalization during import | Technical implementation | Milestones 2 and 8 | Schema resolved; import normalization open |
| M0-R08 | Money is currently stored as JavaScript numbers/strings | All 245 orders contain numeric money and reconcile exactly after kuruş conversion | Technical implementation | Milestone 8 | Baseline validated; conversion tests still required |
| M0-R09 | Category seed rows do not uniformly include restaurant IDs | Live and local counts match at 9 restaurants, 94 categories and 822 menus; all live catalog relations resolve | Technical implementation | Milestone 5 | Baseline resolved; transformation tests still required |
| M0-R10 | App Check may not be enforcing requests | Debug-token global exists, but no client initialization was found | App owner | Milestone 1 | Confirmed and deferred with owner |
| M0-R11 | Firebase Storage configuration may be unused | Bucket is configured but no SDK operations were found | Technical implementation | Milestone 0 | Resolved: exclude unless later evidence identifies stored application assets |
| M0-R12 | Scheduled expiry processes at most 200 pending orders per run | A backlog over the query limit could delay cancellation | Technical implementation | Milestone 9 | Open |
| M0-R13 | Direct Firebase imports remain widespread | Backend switching at screen level would be unsafe and inconsistent | Technical implementation | Milestone 4 | Planned |
| M0-R14 | Long-term retention needs legal validation | Seven-year order/audit retention and EU Central residency are not yet legally confirmed | App owner/legal reviewer | Before Milestone 1 project creation and production schema approval | Open |
| M0-R15 | Auth/profile count mismatch | 58 Auth accounts exist but only 52 profile documents exist | App owner | Milestone 6 | Confirmed; classify six accounts before import |
| M0-R16 | Historical orders have missing parent relations | Two orders lack a current profile relation and three lack a current restaurant relation | App owner | Milestone 8 | Confirmed; quarantine or map during import |
| M0-R17 | Product reviews have unresolved relations | Both product reviews fail at least one current order/restaurant/menu relation check | App owner | Milestone 7 | Confirmed; quarantine until manually resolved |
| M0-R18 | No restaurant push tokens are currently stored | Only five user-scoped APNs tokens were discovered | Technical implementation | Milestone 10 | Confirm expected restaurant-panel registration behavior |
| M1-R01 | Supabase account free-project limit blocks environment isolation | Development was created in Frankfurt; the app owner confirmed all current data is test-only and approved deferring staging and production | App owner | Before public launch | Accepted for migration development; staging and production remain mandatory before launch |
| M1-R02 | Existing `HungrieApp` Supabase project is in the wrong region | The existing project is in `eu-west-1`; it was inspected and left untouched. A new Frankfurt development project was created | Technical implementation | Milestone 1 | Resolved for development |
| M1-R03 | Firebase Auth claim reconciliation requires temporary elevated access | All 58 users were reconciled, the hosted probe passed, the local JSON was removed, and the app owner confirmed remote key revocation | App owner | Milestone 1 | Resolved |
| M1-R04 | Existing production dependency tree contains audit findings | `npm audit --omit=dev` reports 47 findings (2 low, 24 moderate, 18 high, 3 critical); no direct finding names `@supabase/supabase-js` | Technical implementation | Separate dependency-hardening work before production release | Open; do not apply breaking automatic fixes during migration tooling work |
| M1-R05 | Existing APNs private key appeared in Firebase CLI deployment output | The ignored debug log was removed and secret scanning is clean, but terminal/session output is outside repository controls | App owner | Before production release | Open: revoke and replace the exposed APNs key |
| M1-R06 | Supabase CLI does not isolate account login with named profiles | Logging into Hungrie replaced the single global Keychain session; repository helpers now inject a PAT copied into an ignored Hungrie-only credential store | Technical implementation | Milestone 1 | Mitigated for this repository; other CLI accounts require login when used |

## Milestone 0 review record

- Repository inventory reviewed by: App owner
- Live baseline reviewed by: App owner
- Review date: 2026-09-02
- Exit-gate decision: Approved; Milestone 0 complete
- Notes: Technical checks and owner review are complete. Legal follow-ups remain prerequisites for later project/schema work as recorded above.

## Milestone 1 review record

- Hosted development exit gate reviewed by: App owner
- Review date: 2026-09-03
- Exit-gate decision: Approved; Milestone 1 complete
- Credential closeout: App owner confirmed remote deletion of the temporary Firebase Authentication Admin key; the local JSON was already removed
- Environment exception: Staging and production are deferred until before public launch because all current Firebase data is test-only
- Runtime state: Firebase remains active and `EXPO_PUBLIC_SUPABASE_ENABLED=false`

## Milestone 2 review record

- Relational schema and identity bridge reviewed by: App owner
- Review date: 2026-09-03
- Exit-gate decision: Approved; Milestone 2 complete
- Hosted state: All application tables remain empty; no Firebase records were imported
- Runtime state: Firebase remains active and `EXPO_PUBLIC_SUPABASE_ENABLED=false`

## Milestone 3 review record

- Security implementation completed: 2026-09-03
- Local and hosted synthetic verification: Passed
- Live Firebase-token matrix: Passed all six cases; temporary Firebase and Supabase fixtures were removed
- Credential closeout: App owner confirmed that the temporary Firebase Authentication Admin key was revoked; local removal was verified
- Reviewed by: App owner
- Review date: 2026-09-03
- Exit-gate decision: Approved; Milestone 3 complete
- Runtime state: Firebase remains active and `EXPO_PUBLIC_SUPABASE_ENABLED=false`
