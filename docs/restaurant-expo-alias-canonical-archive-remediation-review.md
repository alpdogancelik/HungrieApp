# Restaurant Expo Alias Canonical Archive Remediation Review

**Disposition:** `LOCAL READINESS PASS`
**Phase 6:** `BLOCKED`
**Parent checkpoint:** `05dccec2ee33567e2949323822ab7dbad5dde6b3`
**Aborted run preserved:** `ruip6ad_20260925e`

## Root cause

The run correctly aborted after its 74-file export inventory matched but its TAR SHA-256 differed. The accepted and freshly generated archives contain the same 74 member names, the same member bytes, and identical USTAR metadata. Their only difference is the ordering of three members:

| Archive | Members 64–66 |
|---|---|
| Historical noncanonical archive, SHA-256 `952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135` | `orders/[orderId].html`, `orders/detail.html`, `orders.html` |
| Canonical archive, SHA-256 `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d` | `orders.html`, `orders/[orderId].html`, `orders/detail.html` |

All three files are 17,919 bytes and have SHA-256 `fcaedaa55749b75a186a688f48943381aa9d02e8ab6b724108f5d03807038709`. All 74 members have mode `0644`, UID/GID `0`, mtime `0`, empty user/group names, regular-file type, and byte-identical content between archives. The historical archive used directory-first `Path.rglob()` ordering before filtering files. The executable used file-only path ordering. The filesystem inventory was correct; the archive construction contract was not singular.

## Correction

The export operator now constructs one canonical USTAR archive as follows:

1. Enumerate files only and derive relative POSIX paths.
2. Reject duplicate member paths.
3. Sort paths by their UTF-8 bytes in ascending order.
4. Write regular files with fixed mode `0644`, UID/GID `0`, mtime `0`, and empty user/group names.
5. Require the exact canonical archive SHA-256 `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d`.

The export gate, deploy archive gate, accepted candidate evidence, and operator executable-hash contract now use that procedure and identity. The strict artifact manifest remains `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae`; no file content or Restaurant application source changed. The superseded archive is retained as `historical-noncanonical-restaurant-static-export.tar` and is explicitly labelled historical. Prior run authorities, records, and evidence were not rewritten.

## Changed inventory

| File | SHA-256 | Purpose |
|---|---|---|
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `e723d48faad8f4bce0a30231133cb944729fba665c6d24a8a7862bb664710159` | Canonical archive construction and accepted archive identity |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `113f6ab3f6af09d86d59d90fa7c9a8f4e325796b1579d60aa97326d9bc99d27c` | Independent-directory and three-orders-entry ordering regression |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `8a3a7de1a1cb48a2b4027951a8cd11858aeffd5d1e002fd6973f932cacfffe4d` | Exact changed diagnostic executable hashes |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/candidate-artifact-manifest.json` | `104d9af8d0f87ec2d631885567bef70bfe2fbbdc600989eaafffdbdfd6bfa54c` | Canonical USTAR contract and identity |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/complete-artifact-comparison.json` | `96fb81608763356ef6c6d00fa73082de30b0efd1d4e830cdb348347cc7a947bd` | Historical/canonical archive distinction |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/evidence-manifest.tsv` | `24ea287ad87bc8cf33c41b3e38f42e2e4a636633acb8e4fcd7c16d0db3d141b2` | Exact evidence inventory |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/restaurant-static-export.tar` | `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d` | Canonical accepted archive |
| `docs/restaurant-expo-alias-artifact-remediation-evidence/historical-noncanonical-restaurant-static-export.tar` | `952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135` | Preserved superseded archive; ignored local evidence |
| `docs/restaurant-expo-alias-canonical-archive-remediation.diff` | `283aa4155839162e9d7eba7e44c953748ce540c827cb1add52abf40ae3f9ead4` | Complete zero-context executable/test diff |

This review's SHA-256 is recorded after finalization.

## Qualification

| Check | Result |
|---|---|
| Accepted vs canonical TAR inventory | PASS; same 74 names, bytes, hashes, and fixed metadata |
| Two independent canonical archive builds | PASS; byte-for-byte identical, 5,642,240 bytes, SHA-256 `477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d` |
| Canonical extraction vs candidate manifest | PASS 74/74; inventory SHA-256 `a3a22439b973ed822aadbe13104daedb934b785f78c9a685cfab5a2995c3f9ae` |
| Focused diagnostic/access/execution-support suite | PASS 109/109 |
| Restaurant TypeScript | PASS |
| Responsive UI Phase 1–5 | PASS 51/51 |
| Notification worker | PASS 11/11 |
| Reviews | PASS 6/6 repository tests and 29/29 UI tests |
| Earnings safeguards | PASS 17/17 plus safeguard checker |
| Phase 7 runner/order flow | PASS 21/21 |
| Local PostgREST 14.5 conflict transport | PASS; conflict, acknowledgement, cancellation, concurrency, replay, authorization, recovery, cleanup, zero retry backends, Earnings disabled |
| Local database lint | PASS; zero findings |
| Changed-script syntax | PASS |
| Restaurant application tree | PASS `ae03238ac8c34f4ef11365b5a5c51dee81187812` |
| Protected evidence | PASS 35/35 and 42/42 against accepted manifests |
| Aborted-run evidence | PASS; run `e` remains 11 files with tree SHA-256 `654c040baf6c01bc417cdb5be9d6900a7951a1161ece83f4249b66aa30a17bd4` |
| Four-account preparation and secure file | PASS; reconciliation remains `AFTER/PASS`; file remains mode `0600` and Git-ignored; credentials were not read or printed |
| Credential and prohibited-value scan | PASS |
| Zero-context source-diff reconstruction | PASS; all three executable/test files reconstructed byte-for-byte |
| `git diff --check` | PASS |

## Boundaries and remaining work

No hosted service was accessed, no account or Firebase state changed, no deployment/alias/rollback command ran, no authority or run ID was created, and no commit or push occurred. The previously authorized run `ruip6ad_20260925e` remains permanently aborted and cannot be reused.

A future hosted attempt requires a separately reviewed checkpoint/run binding, a new run ID, a fresh maintenance window, and explicit owner authorization. Local correction does not establish hosted publication or alias convergence.

**LOCAL READINESS: PASS**
