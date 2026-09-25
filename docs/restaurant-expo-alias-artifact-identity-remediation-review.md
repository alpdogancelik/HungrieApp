# Restaurant Expo alias artifact identity remediation review

**Disposition:** `LOCAL READINESS PASS`
**Phase 6:** `BLOCKED`
**Parent checkpoint:** `0612be3f72ff3792321c74cfad6540900fa3a4c2`
**Aborted runs preserved:** `ruip6ad_20260925a`, `ruip6ad_20260925b`, `ruip6ad_20260925c`

## Root cause and disposition

Run `ruip6ad_20260925c` correctly stopped before deployment because its fresh 74-file export did not match the historical accepted artifact. The mismatch is a generated Metro asset-path identity difference, not an application-content change:

- The historical bundle and 46 historical asset paths contain the absolute-workspace-derived prefix `_____Users/nurlanildirimli/Hungrie/HungrieApp/node_modules/`.
- The reviewed export command now emits the repository-relative prefix `__node_modules/` for those same assets.
- Replacing that prefix in the historical JavaScript bundle at its 39 occurrences produces the fresh JavaScript bundle byte-for-byte, including its exact SHA-256.
- The current and historical `package-lock.json` and Metro configuration are byte-identical.
- `firebase-config.js`, `manifest.webmanifest`, and `sw.js` are byte-identical between artifacts.
- No timestamp or generated deployment metadata appears in the changed bytes.

The historical command provenance does not record the Metro server-root state that produced the absolute-path-derived names. The old artifact could not be reproduced with the reviewed current export command and exact public build inputs. Two independent clean exports were byte-for-byte identical, so the reproducible fresh artifact is the proposed fixed candidate identity. The old artifact and all failed-run evidence remain preserved and are not relabelled as passing.

## Complete artifact comparison

| Property | Historical accepted artifact | Reproducible candidate |
|---|---:|---:|
| Files | 74 | 74 |
| Inventory SHA-256 | `6c9f951a01b74c92079e1340d2fbf9cf0494b10256705e9c523c779ff612073a` | `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae` |
| Deterministic archive SHA-256 | `195e20e68ac5cb50eb886313716e3da67b9f36552a01e7c02018a82c02324f4d` | `952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135` |
| Critical JS/CSS | 5 | 5 |
| HTML files | 20 | 20 |

The complete machine-readable comparison records 46 added paths, 46 removed paths, 20 modified HTML files, and 8 unchanged files, with byte lengths and SHA-256 values for every difference. The 46 add/remove pairs are renamed generated assets. The 20 HTML changes reference the new JavaScript bundle name. The full details are in `docs/restaurant-expo-alias-artifact-remediation-evidence/complete-artifact-comparison.json`.

## Correction

The diagnostic operator now binds the exact reproducible artifact inventory and deterministic archive. Its existing immutable verification still requires all 74 files, all six qualification routes, all five candidate JavaScript/CSS assets, exact status/final URL/bytes/SHA-256, route asset references, the three PWA/runtime files, service-worker dependency closure, and the two fixed external Firebase runtime hashes.

Execution support is bound to a future direct child of the current checkpoint, the complete accepted lineage through `0612be3f72ff3792321c74cfad6540900fa3a4c2`, a fixed proposed `ruip6ad_20260925d` evidence namespace, and the reviewed artifact-remediation contract. The three aborted run IDs and evidence directories cannot satisfy this contract.

## Changed-file inventory and SHA-256

| File | SHA-256 |
|---|---|
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `9b9889ba75d6e469d2f888ac9547786cc49a2a9f61f526d4c022bbdd11e2406f` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `46874b6a903f45afd9509ec5dc7460f7a37c57172ce3920848871547713221df` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `75fa86afe4979a4be5df2d2ac80d736c4e69e0aaeb6a2375b09680c11e2ae5b4` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `c00ce412842617ae4d81f47af6e4a6e925c2ea5a3120f9cc7cc7612d5d05bb12` |
| `docs/restaurant-expo-alias-ruip6ad-20260925d-artifact-remediation-contract.md` | `0c8be1a0a4d64048d60c1e1cd07d35ea59aad136e8886afcf7321ce97262a3c5` |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/candidate-artifact-manifest.json` | `9d128ecb166be831d0ef7eb103d6b1e5c95c765abcd7d9e92b28ca1494b3f90e` |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/complete-artifact-comparison.json` | `01a5f4a688f915d1e6857cf975dff50d9ed33ef0c6789d113b41b451de0e0aa7` |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/evidence-manifest.tsv` | `773a808c43e83f6a70472d05c05ed05140ae35d55766d3a034e88f13f9870290` |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/restaurant-static-export.tar` | `952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135` |
| `docs/restaurant-expo-alias-artifact-identity-remediation.diff` | `38b8c3b031524bce934d4f9b8dd1fd2d773c039010dfa2ace76baa1508f313ed` |

This review is the eleventh proposed checkpoint file; its SHA-256 is reported after the file is finalized.

## Qualification results

| Check | Result |
|---|---|
| Two independent exact-input clean exports | PASS; 74/74 files identical, manifest `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae` both times |
| Archive extraction versus candidate inventory | PASS 74/74 |
| Focused diagnostic, access, parity, and execution-support suite | PASS 108/108 |
| Original legacy and 600-second parity tests | PASS within the 108-test suite |
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1–5 | PASS 51/51 |
| Notification worker | PASS 11/11 |
| Review repositories and UI | PASS 35/35 |
| Earnings safeguards | PASS 17/17 |
| Phase 7 order-flow/runner suite | PASS 21/21 |
| Local PostgREST 14.5 order-conflict transport | PASS; conflict 409/code 40001, acknowledgement, cancellation, concurrency, idempotency, authorization, recovery, cleanup, zero retry backends, Earnings disabled |
| Local database lint | PASS, zero findings |
| Syntax checks | PASS |
| Restaurant application tree | PASS `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Protected evidence | PASS 35/35 and 42/42 against accepted manifests |
| Aborted run evidence preservation snapshot | PASS; a=3 files, b=7 files, c=10 files; no file modified by this work |
| Secure four-account file | PASS; exists, mode `0600`, Git-ignored; contents not printed |
| Credential scan | PASS; no JWT; only four existing synthetic credential-shaped test literals in the execution-support test/diff |
| `git diff --check` | PASS |

## Proposed checkpoint contract

The proposed checkpoint is one direct child of `0612be3f72ff3792321c74cfad6540900fa3a4c2` containing exactly the eleven files listed above plus this review in place of no additional file. Before any checkpoint, recompute every hash, regenerate the zero-context executable/test diff, verify with `git apply --unidiff-zero` that it reconstructs those four files byte-for-byte, rerun the complete suites, inspect the staged inventory and full diff, and require `git diff --cached --check` to pass. The actual checkpoint and complete source-manifest SHA-256 must then be inserted into a separately reviewed owner-authorization proposal; no authority exists now.

## Remaining limits

Local work cannot observe whether EAS publishes the new 74-file artifact completely or whether the Staging alias metadata and CDN content converge. Those remain future hosted checks requiring a new run authority and maintenance window. No hosted action occurred in this work package, and no result from an aborted run was reused as a success.

**LOCAL READINESS: PASS**
