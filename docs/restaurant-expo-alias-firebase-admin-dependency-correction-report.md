# Restaurant Expo alias Firebase Admin dependency correction

**Status:** LOCAL READINESS PASS; no hosted authority or execution authorized
**Parent:** `a93735ede9be8e8177e7034afdf9f19b3c176c3d`
**Fresh run binding:** `ruip6ad_20260926i`

## Root cause and correction

`firebase-admin` 13.8.0 and `firebase-functions` 7.2.5 were already defined by `functions/package-lock.json` and installed in the Functions package. The diagnostic constructed the absolute path `functions/node_modules/firebase-admin/app`. Node treats that as a filesystem path rather than the package subpath `firebase-admin/app`, bypassing the package `exports` map and producing `MODULE_NOT_FOUND`.

`npm ci --prefix functions --ignore-scripts --no-audit --no-fund` restored the exact lockfile installation without changing `functions/package.json`, `functions/package-lock.json`, or the root lockfile. The diagnostic now anchors `createRequire` at `functions/package.json` and imports `firebase-admin/app` by package name.

Before approval JSON is read, `prepare-authority` now verifies the Functions package/lockfile/installed-version agreement, Firebase Admin lifecycle exports, Firebase Functions resolution, Node fetch/WebSocket support, Node 22 or newer, and the Chrome executable. Missing or mismatched dependencies fail before authority or hosted-attempt creation.

## Reviewed files

| File | SHA-256 |
|---|---|
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `f4e15824c2a0a4a1a61bb233250722e0ae99b5b4a3fc0f0fb34cfb45cee2a8ce` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `4c35efb102bbe56feb412ba6641aa4cb43fe1515ce4b311e038f5341262927ee` |
| `docs/restaurant-expo-alias-firebase-admin-dependency-correction.diff` | `4cee2a51c3a6f61e99f2facd3a482cf6147a17c719bf950275c9f43c2414d95d` |
| `docs/restaurant-expo-alias-ruip6ad-20260926i-run-binding-contract.md` | `038183d452ae0ad65319e5b7bb7fcc45c2c59f49a20f407c645733b0c3cac9a7` |

The diff reconstructs the two executable/test files from the parent with `git apply --unidiff-zero`.

## Qualification

- Execution-support suite: PASS, 64/64.
- Accepted diagnostic suites: PASS, 66/66.
- Total focused tests: PASS, 130/130.
- Restaurant TypeScript and application regressions: PASS.
- Package-scoped `firebase-admin/app` resolution: PASS from the real diagnostic execution context.
- Missing and mismatched dependency negatives: PASS.
- Authority prerequisite ordering: PASS; approval remains unread and no output is created on prerequisite failure.
- Restaurant tree: unchanged at `ae03238ac8c34f4ef11365b5a5c51dee81187812`.
- Artifact manifest/archive: unchanged at `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae` / `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d`.
- Protected evidence: PASS, 35/35 and 42/42.
- Run h authority and two evidence files: byte-for-byte unchanged.
- Lockfiles: byte-for-byte unchanged.

Run h remains permanently aborted. A future run-i authority requires the actual committed direct-child checkpoint, its reproduced source manifest, a fresh owner-selected maintenance window, and separate explicit authorization.
