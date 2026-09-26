# Restaurant Expo Alias Deterministic Metro Export Remediation Review

**Status:** LOCAL REMEDIATION PASS; hosted pre-authority EAS-wrapper proof remains required
**Date:** 2026-09-26
**Parent HEAD:** `a1cf25b443441d424259af2568ced55b00d5560a`
**Hosted actions:** None
**Commit created:** No

## Root cause

The active Expo Metro configuration inherited Expo's numeric module-ID factory. The installed implementation keeps a process-local `nextId` counter and assigns the next integer when Metro first encounters a module. Metro then sorts the graph by those assigned IDs. Consequently, graph traversal order determines both module IDs and serialization order even when the same 2,424 web modules are present. Run-i and repeated local evidence showed the resulting JavaScript identity and all 20 HTML bundle references could change without an application-source change.

The relevant installed paths are:

- `node_modules/expo/node_modules/@expo/metro-config/build/ExpoMetroConfig.js`: `createNumericModuleIdFactory()` uses `nextId++` and is selected by the default Expo configuration.
- `node_modules/metro/src/Server.js`: `_getSortedModules()` assigns IDs while iterating `graph.dependencies.values()` and then sorts by the assigned IDs.

A preliminary path-hash implementation removed traversal dependence but used 48-bit numeric IDs. Its JavaScript gzip size was 803,340 bytes, so the Phase 5 bundle-budget regression correctly failed. That version was not accepted.

## Final correction

Metro's supported `serializer.createModuleIdFactory` configuration hook now uses a checked-in, reviewed module identity map:

- Canonical identities are workspace-relative POSIX paths or explicit virtual-module identities.
- The map is unique and sorted by UTF-8 bytes.
- Compact numeric IDs are the stable array indexes `0..2559`.
- Traversal order and checkout location cannot change an ID.
- A module outside the workspace or absent from the reviewed map fails the export. The operator cannot silently assign a new identity.
- The application runtime and source modules are unchanged.

The active candidate contract now binds:

- Restaurant application tree: `7430599b150adbd19ddafadce1195f1e418daf8a`
- Artifact manifest: `7ca81f0fdbc649e34a929956329bcaafc95ec357c84f342a01f2a0dab2836431`
- Canonical USTAR archive: `dd416dd5f44a4f3dbb3443f7269c61f4d964fe3e3e4de3b38d873db553e183cb`
- JavaScript: `_expo/static/js/web/entry-e60c059055bd9dd055f253e375b7f273.js`
- JavaScript bytes: `3,602,617`
- JavaScript SHA-256: `ad572298de4cd0214e550004cd2b69c97399827628fb646f41f0bb8074a52d47`
- JavaScript gzip (`gzip -9`): `642,338` bytes, within the `682,355`-byte ceiling

The previous artifact identities remain historical and unchanged. No aborted-run record was rewritten.

## Exact export proof

Two fresh Node processes each ran the diagnostic's inner production command with the reviewed Staging environment snapshot:

```text
npm run prepare:web
npx expo export --platform web --clear
```

Each attempt started with an empty Metro cache. Results:

| Check | Attempt 1 | Attempt 2 | Result |
|---|---:|---:|---|
| Files | 74 | 74 | PASS |
| HTML | 20 | 20 | PASS |
| Module graph | 2,424 | 2,424 | PASS |
| Artifact manifest | `7ca81f0f...36431` | `7ca81f0f...36431` | PASS |
| JavaScript | `ad572298...2d47` | `ad572298...2d47` | PASS |
| Canonical archive | `dd416dd5...83cb` | `dd416dd5...83cb` | PASS |
| Complete directory comparison | exact | exact | PASS |
| Archive byte comparison | exact | exact | PASS |

Compared with the former accepted candidate, 53 files are unchanged, one former JavaScript path is removed, one deterministic JavaScript path is added, and 20 HTML files change only through the JavaScript reference. Full byte lengths and hashes are in `docs/restaurant-expo-alias-deterministic-metro-evidence/complete-artifact-comparison.json`.

The exact EAS wrapper is:

```text
npx eas-cli@16.32.0 env:exec preview "npm run prepare:web && npx expo export --platform web --clear" --non-interactive
```

Executing that wrapper reads hosted EAS environment state and was prohibited by this local-only task. A standalone operator now requires a separate, short-lived, read-only Staging authorization and runs it twice through `verifyExactProductionExportReadiness()`. It writes exclusive sanitized evidence outside all diagnostic-run directories and has no deployment or alias action. Diagnostic `prepare-authority` consumes a fresh passing evidence record and cannot initiate the EAS read itself. Both executions must reproduce the fixed manifest and archive. This is a mandatory future hosted-read gate, not a claimed result.

## Changed inventory

- `apps/restaurant/metro.config.js`
- `apps/restaurant/scripts/deterministic-metro-module-ids.cjs`
- `apps/restaurant/scripts/deterministic-metro-module-map.json`
- `scripts/test-restaurant-deterministic-metro-module-ids.mjs`
- `scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs`
- `scripts/verify-restaurant-alias-production-export-readiness.mjs`
- `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs`
- `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs`
- `scripts/restaurant-alias-diagnostic-execution-support.mjs`
- `scripts/test-restaurant-alias-diagnostic-execution-support.mjs`
- `docs/restaurant-expo-alias-deterministic-metro-evidence/candidate-artifact-manifest.json`
- `docs/restaurant-expo-alias-deterministic-metro-evidence/complete-artifact-comparison.json`
- `docs/restaurant-expo-alias-deterministic-metro-evidence/evidence-manifest.tsv`
- `docs/restaurant-expo-alias-deterministic-metro-evidence/restaurant-static-export.tar`
- `docs/restaurant-expo-alias-ruip6ad-20260926j-run-binding-contract.md`
- This review.

Executable/source SHA-256 values:

| File | SHA-256 |
|---|---|
| `apps/restaurant/metro.config.js` | `c1c09a3089568b12c4aeb9c1d30afb47bb7722dc9605fe534152424a4a2e64ad` |
| `apps/restaurant/scripts/deterministic-metro-module-ids.cjs` | `6201d56d5a815a5827d0625ac72878fed89fd9bb7255ca52cbfd0a690b74e54a` |
| `apps/restaurant/scripts/deterministic-metro-module-map.json` | `928fcbe1ba9aead4c2f180503254a4a6826033c33eabbad8f29fca24e4a056c8` |
| `scripts/test-restaurant-deterministic-metro-module-ids.mjs` | `c262a93e6788b0508bd07fdcb612f1126d9c440274ce4ea04901be7ff5930213` |
| `scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs` | `5ba2c364a4e7e46fb5ef40a34fefb99f1165d7bb9ad93ed7c3cc417c7f76a016` |
| `scripts/verify-restaurant-alias-production-export-readiness.mjs` | `451ab6f2b0e3b68a1ea1fd58eeb99ef0e8e1dd2920a4dc5ca479b1767e430684` |
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `865c1032ce89fef6efac32affcfb30f512a5743a91821c1079be7d599396c018` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `6fce949367cfdc4c985d9fe87f632dba2779f53e4d75235322d4063a3f23839a` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `d6d97de33a8873bcd29de07bc6d623a3dfd3455da1faa3c929beab60d1ae50b4` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `ed88a2a80044301cbea126cb8edf26f9413904255d62408225329dfd670d0f21` |

The execution-support lineage verifier separately retains the historical Restaurant tree for accepted historical checkpoints. Active artifact, publication, access, promotion, rollback, finalization, and pre-authority checks use the new fixed identity. A future run still requires a separately reviewed checkpoint/run binding; the aborted run-i contract is not reusable.

## Qualification

- Deterministic Metro/module-map tests: 3/3 PASS.
- Complete diagnostic, execution-support, deterministic Metro, and read-only EAS-gate focus: 142/142 PASS.
- Restaurant TypeScript: PASS.
- Responsive UI Phase 1: 8/8 PASS.
- Responsive UI Phase 2: 13/13 PASS.
- Responsive UI Phase 3: 14/14 PASS.
- Responsive UI Phase 4: 8/8 PASS.
- Responsive UI Phase 5: 8/8 PASS, including the JavaScript/CSS/route budget.
- Notification worker: 11/11 PASS.
- Reviews repositories/UI boundary: 6/6 PASS.
- Restaurant Earnings safeguards: 11/11 PASS.
- Phase 7 order-flow regression: 1/1 PASS.
- Syntax checks for all changed executables: PASS.
- Protected evidence: `ruip6a_20260924b` 35/35 PASS and `ruip6a_20260924c` 42/42 PASS.
- Run-i evidence: 9/9 hashes byte-for-byte unchanged from the pre-investigation inventory.
- Credential scan: PASS; no private key, bearer value, password value, cookie, or credential-bearing request body was added to source, report, or JSON evidence.
- `git diff --check`: PASS.

## Evidence hashes

- Candidate manifest file: `358490e8f5b22801e61bc94e7364d824df19198419565205ca0e8806cf5e4f26`
- Complete comparison file: `55ed718035aa9ef2266631b1de620d1f5b2debc142baf8d717abc77c2a21df08`
- Evidence manifest file: `6ccfd9a802c1cbd1b68ff7f569c959b405296c014e07e9cbee83a2cc3de658c4`
- Candidate archive: `dd416dd5f44a4f3dbb3443f7269c61f4d964fe3e3e4de3b38d873db553e183cb`

## Remaining gates

No locally fixable deterministic-export blocker remains. Before any diagnostic owner authority may be consumed, the separately authorized read-only gate must run the exact EAS-wrapped export twice against the fixed identity and produce fresh passing evidence. Phase 6 remains BLOCKED; no hosted result, deployment, alias action, rollback, or Phase 6 acceptance is claimed.
