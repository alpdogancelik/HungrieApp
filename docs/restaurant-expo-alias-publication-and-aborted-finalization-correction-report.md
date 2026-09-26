# Restaurant Expo Alias Publication and Aborted Finalization Correction

**Date:** 2026-09-26
**Scope:** Local-only correction for aborted run `ruip6ad_20260926f`
**Result:** LOCAL READINESS PASS
**Phase 6:** BLOCKED

## Preserved run state

The run remains permanently aborted. Immutable deployment `tnc8x1kw9w` remains rejected, no alias promotion occurred, and rollback deployment `6jki82fy0u` remains the independently verified alias target. The 25 files under `secure/restaurant-alias-diagnostic/ruip6ad_20260926f` are byte-for-byte unchanged from the pre-correction inventory. No hosted mutation, provider command, account change, authority creation, commit, or push was performed.

## A. Publication contract

### Confirmed cause

`_expo/.routes.json` is present in the accepted 74-file export at 910 bytes, but EAS CLI 16.32.0 deliberately excludes it from the public asset list and consumes it as static routing configuration. The installed provider implementation defines `_expo/.routes.json` in `EXPO_ROUTES_PATHS`, skips those paths in `collectAssetsAsync()`, and reads them in `getRoutesConfigAsync()`:

- Installed implementation: `/Users/nurlanildirimli/.nvm/versions/node/v24.11.1/lib/node_modules/eas-cli/build/worker/assets.js`
- Installed version: `16.32.0`
- Installed implementation SHA-256: `c2cca74f7b4b8ebb79f8ae426ce910f67b1b2c1388966ad219b067ca08dd223d`

The 404 therefore does not identify a missing published application asset or an incorrectly constructed URL. It identifies an incorrect assumption in the former publication contract: a provider control input was treated as a public static asset.

Read-only HTTP verification against retained deployment `tnc8x1kw9w` confirmed the distinction. All six HTML routes and five critical assets matched their exact expected bytes and SHA-256 values; all 73 publicly served artifact files matched; and the six routes exposed the security/cache behavior configured by `_expo/.routes.json`. The verifier did not request `/_expo/.routes.json`. No hosted evidence file was written or changed.

### Correction

The export gate still requires all 74 accepted files and the exact canonical archive. It now parses and validates `_expo/.routes.json` as the single deployment-control artifact. Immutable publication requires:

- exact local integrity for all 74 files;
- exact HTTP status, final URL, byte length, and SHA-256 for all 73 publicly served files;
- exact HTML parity for `/login`, `/dashboard`, `/orders/detail?orderId=phase6`, `/menu`, `/reviews`, and `/earnings`;
- exact parity for all five critical JavaScript/CSS assets;
- complete asset references, service-worker content, and two external Firebase runtime assets;
- route-level semantic proof that the routing control was consumed, including its configured response headers;
- one explicit `_expo/.routes.json` record with `publicUrlExpected: false` and disposition `consumed-as-static-routing-configuration`.

The count invariant is now explicit: 73 public files plus one validated deployment control equals the accepted 74-file artifact. A missing, malformed, unaccounted, or semantically ineffective deployment control fails closed. The public 404 is neither ignored nor reclassified as a successful file fetch; that path is outside the provider's public asset contract.

## B. Aborted-run finalization

### Confirmed cause

The earlier state machine required a fresh rollback recapture for every final reconciliation. Run `ruip6ad_20260926f` had already recorded a terminal abort and verified rollback. The recapture preparation then archived the original rollback reference before the promotion-attempt marker blocked the capture. This left immutable historical rollback evidence but no canonical fresh reference, so finalization could not proceed.

### Correction

- A terminal record now blocks fresh rollback recapture before any evidence is moved.
- Normal successful runs continue to require the verified fresh recapture contract.
- Terminal runs consume the preserved initial reference, or the byte-verified historical reference/progress pair when an interrupted recapture already exists.
- Terminal finalization binds the terminal-record hash and, where alias assignment occurred or was uncertain, the independent rollback-verification hash.
- An abort permanently prohibits promotion and deployment retry.
- Pre-deployment aborts may reconcile an exact empty resource inventory. Post-deployment aborts must account for the immutable provider record explicitly.
- Interrupted finalization may resume from its unchanged `STARTED` marker; a completed finalization cannot be repeated or rebound.
- Terminal reconciliation remains `FAIL` with blocker `TERMINAL_NON_PASS_RUN`; it can never become PASS.

The copied-run deterministic check consumed the preserved historical rollback reference and verified deployment `6jki82fy0u` without modifying original evidence. It bound historical reference SHA-256 `361c3f49c8b071fbba91179c12b9cfcb3cc68b56f8935e1cfdb44e9d859ad4d3`, terminal-record SHA-256 `7575a9f2c99ae686e864660a6c12b27429fb7603ebcb4db0197f8ef1b2ca5759`, and rollback-verification SHA-256 `4a41c23c37f0d2c9b8eb865455ff11d40d50a353e785e4eec83fc65716722830`.

## Changed files

| File | SHA-256 |
|---|---|
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `c7d16e809bc570ba684aeefbfcd088534119c0805260d19fb6fbd97ea3bc7cae` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `6394a896da8bc98dab3deb30c727595b586aea85d69b3b4dfdb57a66bf3d868e` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `56616f784834db600db2edfaea84d6dbd9170815bd7abc3aeea63386c6fdf603` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `89b1225469e7f8e41f7046580339218a396a38847ef817dab76ab214051dbf05` |

Complete four-file source diff SHA-256: `cc48d506746cf8bee5be6ef7baa8b34e6316fe2ec4e7520ded736616d9d46664` (453 lines).

## Qualification

| Check | Result |
|---|---|
| Alias parity verifier | PASS 24/24, including original legacy behavior |
| Diagnostic operator | PASS 27/27 |
| Execution support | PASS 55/55 |
| Immutable access qualifier | PASS 8/8 |
| Focused total | PASS 114/114 |
| Two fresh exports under reviewed inputs | PASS; byte-identical 74-file inventories and canonical archives `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d` |
| Publication proof against retained immutable deployment | PASS: 74 artifact files, 73 public files, one routing control, six routes, five critical assets, two external runtime assets |
| Abort before deployment | PASS; exact empty inventory reconciles and remains terminal FAIL |
| Abort after deployment | PASS; retained provider deployment is accounted for and remains terminal FAIL |
| Interrupted recapture | PASS; immutable historical bytes are consumed without rewriting them |
| Uncertain assignment | PASS; finalization is blocked until independent rollback verification exists |
| Interrupted/repeated finalization | PASS; resumable once from `STARTED`, then permanently closed |
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1–5 | PASS 51/51 |
| Notification worker | PASS 11/11 |
| Reviews | PASS 6/6 repository and 29/29 UI tests |
| Earnings | PASS 17/17 plus Phase 3 and Phase 4 safeguard checks |
| Phase 7 runner/order flow | PASS 21/21 |
| PostgREST 14.5 conflict transport | PASS; stale transition/acknowledgement/cancellation, concurrency, idempotency, authorization, recovery, cleanup, zero retry backends, Earnings disabled |
| Local database lint | PASS; zero findings |
| Changed-script syntax | PASS |
| Restaurant application tree | PASS `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Protected prior evidence | PASS 35/35 (`4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44`) and 42/42 (`85de695ef3eee71ef949449b5a5c8da7cbb9ffdae2344ed6fefd0f1b1196d538`) |
| Aborted-run evidence | PASS; 25/25 files byte-for-byte unchanged |
| Secure four-account file | PASS; mode `0600`, Git-ignored, contents not read or printed |
| Credential scan | PASS; only deliberate synthetic bearer fixtures were found; no real credential value is present in the change |
| `git diff --check` | PASS |

## Next-run binding

Run `ruip6ad_20260926g` is the only permitted future run identity. It is bound to a future direct child of checkpoint `7cc25e2d43d91c42fbcc3c9694e8792fc4042079`, the exact seven-file checkpoint inventory, accepted artifact manifest `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae`, canonical archive `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d`, and unchanged Restaurant tree. Run `ruip6ad_20260926f`, its authority, markers, and evidence are excluded from reuse. Immutable deployment `tnc8x1kw9w` is included in the rejected-deployment list and cannot be selected as the next candidate.

## Remaining limitation

The corrected rules are proven locally and against read-only responses from the retained rejected immutable deployment. Whether a future separately authorized immutable deployment publishes all 73 public files and applies the routing control must still be established by that future deployment's exact immutable qualification. This local result does not authorize another run, deployment, promotion, rollback, or Phase 6 acceptance.
