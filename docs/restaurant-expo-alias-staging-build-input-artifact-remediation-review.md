# Restaurant Staging Build-Input and Artifact Remediation Review

**Status:** LOCAL READINESS PASS; separately authorized read-only EAS proof remains required
**Date:** 2026-09-26
**Parent HEAD:** `eceac9a822f376af7b3f32c8131393d5634e2f5c`
**Hosted actions in this work package:** None
**Commit created:** No
**Phase 6:** BLOCKED

## Root cause and disposition

Check `ruip6ae_20260926k` proved that the former accepted artifact was built without two intended Staging public values. Its JavaScript differed by exactly 89 bytes: the reviewed Firebase VAPID value added 83 bytes and the reviewed Restaurant polling interval added three bytes in each of two modules. The same 2,424 modules, IDs, dependency arrays, and serialization order were present. This was build-input drift, not Metro instability.

The build actually reads nine `EXPO_PUBLIC_*` values. The new contract binds all nine by name, UTF-8 byte length, and SHA-256, identifies EAS `preview`, Staging Supabase `rlrfvqskzvpysewdxqcr`, shared non-production Firebase `hungrieapp-a2288`, and EAS project `a2d5538b-bd0c-4205-8153-ba08a3a9b2b1`. It contains no raw values. A mode-0600, Git-ignored local snapshot supplies the reviewed values for local reproduction; its contents are never written to reports or evidence.

The pre-authority and diagnostic export paths now run the validator inside the EAS wrapper before Metro. Missing, changed, wrongly bound, or source-reference-drifted inputs fail before artifact acceptance. Authority, artifact, baseline/final preflight, promotion, deployment, and finalization records bind the contract digest. No gate accepts the superseded artifact.

## Replacement artifact

| Identity | SHA-256 |
|---|---|
| Public build-input contract | `f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e` |
| 74-file artifact manifest | `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89` |
| Canonical USTAR archive | `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862` |
| JavaScript | `b96ac1cef877ed46e3af6c2d6a4815ceed256af887cee1f56e7987a4a5d0f3cd` |
| JavaScript path | `_expo/static/js/web/entry-deb618126de6ff234988f8f3ca2e7588.js` |
| JavaScript bytes | `3,602,706` |
| JavaScript gzip-9 bytes | `642,384` |

Two clean local processes used all nine reviewed public inputs and the exact inner production command. Both produced 74 files, 20 HTML routes, identical complete inventories, the manifest above, and byte-identical 5,642,240-byte canonical archives. The archive is byte-for-byte identical to the preserved check-k export archive. Compared with the superseded deterministic-Metro artifact, 53 files are unchanged, one JS path is added, one JS path is removed, and 20 HTML files change only their JS reference. Historical evidence and artifact bytes remain untouched.

## Runtime and PWA review

All 20 HTML documents reference existing local assets. The candidate retains `manifest.webmanifest`, `sw.js`, `firebase-config.js`, and valid `_expo/.routes.json` routing-control semantics. The five critical JS/CSS assets are exact and the JavaScript remains below the 682,355-byte gzip ceiling.

A local Chrome production-export qualification used intercepted synthetic Firebase/Supabase responses and blocked all unexpected hosted traffic. Pending, suspended, owner, and manager flows passed, including refresh restoration. There were zero browser exceptions and zero unexpected hosted requests. Browser report SHA-256: `99b41a4df89bb09bb8fbce9cac9d87f82174c938e1adc66764910a3a550e7180` (ephemeral local evidence; credentials were not persisted).

## Changed inventory and SHA-256

| File | SHA-256 |
|---|---|
| `docs/restaurant-expo-alias-staging-public-build-input-contract.json` | `f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e` |
| `docs/restaurant-expo-alias-staging-public-build-input-evidence/candidate-artifact-manifest.json` | `406dbf42ba8c9fefb4f37c3edc36bbbfd24240ff242eae0e4c1d6ba1d66b41b1` |
| `docs/restaurant-expo-alias-staging-public-build-input-evidence/complete-artifact-comparison.json` | `0316a14a1c8840691d27f7a2ed68c02938fd61dd8e6084136576a49da11e133a` |
| `docs/restaurant-expo-alias-staging-public-build-input-evidence/evidence-manifest.tsv` | `80b796f3a1a8fad6b5c229c9967f205c52919fef88f9d2ebd6494d06fe96c13d` |
| `docs/restaurant-expo-alias-staging-public-build-input-evidence/restaurant-static-export.tar` | `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862` |
| `docs/restaurant-expo-alias-ruip6ae-20260926l-read-only-eas-export-plan.md` | `73023632e2e62feabb992100a76294df5bcfc10dc26a00700ccfe2634b9a3c9e` |
| `scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs` | `0fd3bb82e8a619cb00e6de932846fffc4d1ce2946edbe78b7b7072daddd20b92` |
| `scripts/restaurant-alias-diagnostic-execution-support.mjs` | `e2332568bb8c2ae65581588453b19bc49e727538986061e8772c2e09827d687a` |
| `scripts/restaurant-alias-staging-public-build-inputs.mjs` | `4aa0b89a932947fae65696bf6443b1613a62e9032bb983a1b9a37f915c9c4659` |
| `scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs` | `80bf1f9a02a4901e85bb1b02b08e5f825460cb95a533aae332d0ac7d6062adad` |
| `scripts/test-restaurant-alias-diagnostic-execution-support.mjs` | `f878bedbd380feb82eeec7e60289ad9e1d8731dd57e419120632e6eb048d2ef2` |
| `scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs` | `c5e0c9ad30db40567a6836ddcac94ffac348d25f330b9d42fe6188a3ecedd76a` |
| `scripts/test-restaurant-alias-staging-public-build-inputs.mjs` | `423fb4a83e416c14dd3e2348c5cf50b90da8599c8c678a0ce05b678f142377c6` |
| `scripts/verify-restaurant-alias-production-export-readiness.mjs` | `4222eeafca09cc62f4079290fcb963d6fad8047ac090994ed71077a8038a9463` |

The complete executable/contract patch is `docs/restaurant-expo-alias-staging-build-input-artifact-remediation.diff`, SHA-256 `6bf61c7bdaf2787b46c42e8e4f8ef9a20c220a9a03b81164c4410db8143db408`. The zero-context patch reconstructs with `git apply --unidiff-zero`. The generated binary archive is represented by its complete manifest and archive digest rather than embedded as a binary patch.

The secure local snapshot is mode 0600 and Git-ignored. Its file SHA-256 is `79b177d66b4fa0953f56370e0828c659503101969eb9e9d2705438af245dfba4`; this identifies the complete local input object without disclosing values.

## Qualification

- Focused diagnostic, execution-support, access, parity, Metro, read-only export, and build-input tests: **150/150 PASS**.
- Responsive UI Phase 1–5: **51/51 PASS**.
- Restaurant TypeScript: **PASS**.
- Notification worker: **11/11 PASS**.
- Reviews repository: **6/6 PASS**; Reviews UI: **29/29 PASS**.
- Restaurant Earnings safeguards: **11/11 PASS**.
- Phase 7 order-flow: **1/1 PASS**.
- Two clean local exports: **PASS**, exact 74/74 and archive byte equality.
- Local browser qualification: **PASS**, four access states, zero unexpected hosted requests.
- Protected evidence: `ruip6a_20260924b` **35/35 PASS**; `ruip6a_20260924c` **42/42 PASS**.
- Check-k evidence remained exact: initialization `5aafb11b…`, progress `bb788655…`, terminal `301788fb…`.
- Restaurant application tree remained `7430599b150adbd19ddafadce1195f1e418daf8a`.
- Historical artifact/evidence directories: unchanged.
- Syntax, credential/prohibited-path scan, and `git diff --check`: **PASS**.

## Separately authorized read-only proof

The proposed check is `ruip6ae_20260926l`. It runs exactly two EAS `preview` environment wrappers, each validating the nine fingerprints before export, and requires exact manifest/archive equality. It has an exclusive evidence directory and no deployment, alias, rollback, mutation, or diagnostic-run capability.

A future audited direct-child checkpoint must contain exactly the 16 files declared by `SUPPORT.checkpointFiles`, including this review and patch. After that checkpoint has an actual commit and source-manifest identity, the owner must separately approve the read-only plan with concrete issuance/expiry timestamps. No authority file has been created.

## Remaining limitation

The local package proves deterministic output for the reviewed Staging values and matches the one preserved real EAS output from check k. It does not claim that the current hosted EAS `preview` environment still has those exact values. That question requires the separately authorized read-only check. Full diagnostic execution, deployment, alias operations, Earnings activation, and Phase 6 acceptance remain unauthorized and BLOCKED.
