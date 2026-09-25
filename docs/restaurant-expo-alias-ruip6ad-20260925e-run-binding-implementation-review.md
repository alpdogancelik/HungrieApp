# Restaurant Expo alias `ruip6ad_20260925e` run-binding implementation review

**Disposition:** `LOCAL RUN-BINDING READINESS PASS`
**Phase 6:** `BLOCKED`
**Parent:** `0fef9c48fdf976ad860f1bd587af4334c926cd91`
**Parent source manifest:** `b86fa4c5b37f68d72a4e81c38db468fbe5720bf39be533ac637a02a01686ea09` (1,518 files)

## Change

Execution support now accepts only a future direct child of the reproducible-artifact checkpoint for proposed run `ruip6ad_20260925e`. It uses a new authority/evidence namespace and fixed execution-contract digest. Runs `a`, `b`, `c`, and `d` fail owner-authorization validation and cannot supply authority or mutable evidence to run `e`.

The diagnostic operator, access qualifier, accepted 74-file artifact, deterministic archive, Restaurant application tree, environment identities, maintenance-window rules, seven remediation controls, and one-attempt mutation boundaries are unchanged.

## Five-file checkpoint inventory

| File | SHA-256 |
|---|---|
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `804a51b6f98a05b626157d6391857d3d1ed6d54ff8902b3bcf126035f15a9114` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `0572693b3a11a6a7a8ec3c3331c96eabf418150be92a7b95c2a97ddd2cff881a` |
| `docs/restaurant-expo-alias-ruip6ad-20260925e-run-binding-contract.md` | `301376512928cc0297656372c3b57ffdcecc2cf8eb50422bb9cd54833a5baa30` |
| `docs/restaurant-expo-alias-ruip6ad-20260925e-run-binding.diff` | `1017a0e2334cf17450d4fd0f893dc8e2b9c1509b6f25843e57ad0b9cc5d9c857` |
| `docs/restaurant-expo-alias-ruip6ad-20260925e-run-binding-implementation-review.md` | calculated after finalization |

The zero-context diff reconstructs both executable/test files byte-for-byte with `git apply --unidiff-zero`.

## Qualification

- Complete diagnostic, parity, access, and execution-support suite: PASS 108/108.
- Actual accepted lineage through parent `0fef9c48fdf976ad860f1bd587af4334c926cd91`: PASS.
- Synthetic future-child acceptance plus wrong-run, wrong-parent, inventory, source-manifest, proposal, executable, and Restaurant-tree rejection: PASS.
- Reproducible candidate artifact: PASS 74/74 files; manifest `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae`; archive `952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135`.
- Three-asset rollback versus five-asset candidate separation, publication completeness, four-account runtime gates, deployment reservation, uncertainty reconciliation, maintenance window, recapture, promotion, rollback, cleanup, and finalization tests: PASS.
- Restaurant tree: PASS `ae03238ac8c34f4ef11365b5a5c51dee81187812`.
- Protected evidence 35/35 and 42/42: PASS.
- Prior run `d` approval, authority, and source-manifest hashes: unchanged; run `d` evidence directory remains absent.
- Four-account preparation: existing independent `AFTER/PASS` reconciliation preserved; secure account file remains mode `0600` and Git-ignored.
- Syntax, credentials, whitespace, and staged-scope checks: PASS.

## Checkpoint procedure

Create one direct-child commit containing exactly these five files. After committing, compute the complete source manifest and execute the real checkpoint verifier with an in-memory synthetic approval for run `e`. Only after that passes may an uncommitted owner proposal, approval template, and rollback handoff be prepared. This review authorizes neither authority creation nor hosted execution.

**LOCAL RUN-BINDING READINESS: PASS**
