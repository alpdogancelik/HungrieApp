# Restaurant Expo alias `ruip6ad_20260926f` run-binding implementation review

**Disposition:** `LOCAL RUN-BINDING READINESS PASS`
**Phase 6:** `BLOCKED`
**Parent:** `05dccec2ee33567e2949323822ab7dbad5dde6b3`
**Parent source manifest:** `71f84c4250b3b93ffb79b6449530b75284f541d3f6e7ea551801aac3cf5600d3` (1,521 files)

## Change

Execution support accepts only a future direct child of the aborted-run-`e` checkpoint for proposed run `ruip6ad_20260926f`. It appends checkpoint `05dccec2ee33567e2949323822ab7dbad5dde6b3` to the exact verified lineage, uses a new authority/evidence namespace, binds the canonical archive contract, and fixes the reviewed checkpoint inventory to the complete archive correction plus this run binding.

Runs `a` through `e` fail owner-authorization validation and cannot supply authority, attempt markers, or mutable evidence to run `f`. The Restaurant application, access qualifier, backend, environment identities, one-attempt restrictions, and seven remediation controls remain unchanged.

## Reviewed checkpoint inventory

The direct-child checkpoint contains exactly fourteen files:

- Canonical candidate manifest, comparison, evidence manifest, current archive, and preserved historical archive.
- Canonical archive review and zero-context source/test diff.
- Run-`f` binding contract, implementation review, and zero-context support/test diff.
- Diagnostic operator and its test.
- Execution support and its test.

The executable diffs reconstruct all four changed source/test files byte-for-byte with `git apply --unidiff-zero`.

## Qualification

- Two independent exact-input Expo exports: PASS; each has 74 files and manifest `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae`.
- Two independently packaged canonical archives: PASS; byte-for-byte identical, 5,642,240 bytes, SHA-256 `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d`.
- Complete local export gate against the accepted 74-file artifact and canonical archive: PASS.
- Complete diagnostic, parity, access, and execution-support suite: PASS 109/109.
- Exact accepted lineage through parent `05dccec2ee33567e2949323822ab7dbad5dde6b3`: PASS.
- Synthetic future-child acceptance and wrong-run, parent, inventory, manifest, proposal, executable, and Restaurant-tree rejection: PASS.
- Three-asset rollback versus five-asset candidate separation, publication completeness, four-account runtime gates, deployment reservation, uncertainty reconciliation, maintenance window, recapture, promotion, rollback, cleanup, and finalization: PASS.
- Restaurant tree: PASS `ae03238ac8c34f4ef11365b5a5c51dee81187812`.
- Protected evidence: PASS 35/35 and 42/42.
- Runs `a` through `e`: evidence and authorities preserved; no file reused or modified.
- Four-account preparation: independent `AFTER/PASS` reconciliation preserved; secure account file remains mode `0600` and Git-ignored.
- Application regressions, TypeScript, database lint, syntax, credential, whitespace, reconstruction, and staged-scope checks: PASS.

## Checkpoint and post-commit gate

Create one direct-child commit containing exactly the fourteen reviewed files. After committing, calculate the complete source manifest and run the real checkpoint verifier against the actual commit with local synthetic authorization input for run `f`. Run the exported complete local artifact gate against a fresh export. Owner proposal records remain uncommitted and must use the actual checkpoint and manifest. No authority or hosted execution is authorized.

**LOCAL RUN-BINDING READINESS: PASS**
