# Restaurant AuthGate Alias Content-Parity Failure Investigation

**Status:** Repository-read-only investigation complete; underlying delivery cause unconfirmed
**Run:** `ruip6a_20260924b`
**Investigated:** 2026-09-24
**Phase 6:** `BLOCKED`
**Hosted access during this investigation:** None

## Scope and evidence integrity

This investigation used only the preserved run evidence and the existing operator scripts. It did not query Expo, fetch either deployment URL, create fixtures, deploy, assign an alias, apply a migration, push source, or enable Earnings.

The protected run evidence manifest remained byte-for-byte unchanged:

```text
4d844aaebe696b01a4584f8c721e028b08510d2b163d473372ccbdd82597bf44  secure/restaurant-authgate-staging-retry/ruip6a_20260924b/evidence-manifest.tsv
```

The original promotion and failure evidence is preserved. No `alias-verification.json` or failure-attempt record exists in the run directory. That absence is material: the verifier discarded the alias observations when it threw.

## Findings

### 1. Deployment identity reported at promotion

`alias-promotion.json` records the completed alias-assignment command at `2026-09-24T16:44:29.034Z`. Its response reports:

| Field | Value |
|---|---|
| Alias | `staging` |
| Deployment identifier | `bfh8u5a0dh` |
| Immutable URL | `https://hungrie-restaurant--bfh8u5a0dh.expo.app` |
| Alias URL | `https://hungrie-restaurant--staging.expo.app` |
| Alias ID | `01a09ada-0ac3-74bf-8361-3c803e655af9` |

This is the alias-assignment response, not an independent metadata read performed after assignment. The script did not make or persist a fresh alias metadata query between promotion and content verification. Therefore `bfh8u5a0dh` is the deployment reported by the promotion operation, while the independently observed post-promotion alias metadata is **unknown**.

Immediately before promotion, `promotion-preflight.json` captured at `2026-09-24T16:44:15.718Z` showed alias metadata pointing to rollback deployment `6jki82fy0u`.

### 2. Expected candidate content

The candidate export and immutable deployment passed exact local/immutable parity. All six route probes returned the same candidate HTML SHA-256:

```text
67f29ffc6cd1ca3a2b7a0658364d4308e32e950dca383781da5d5573ef51cee9
```

The unique critical assets discovered from that HTML were:

| Asset | Expected SHA-256 | Immutable ETag |
|---|---|---|
| `_expo/static/css/tokens-1731bc7f30cf948ad47a5e0861d4f316.css` | `b457868af74b5e594cb7cf07fc975ab43581f5454b94304ee73bdf95365ab61b` | `W/"1731bc7f30cf948ad47a5e0861d4f316"` |
| `_expo/static/css/typography-031cad9766837c47a6d915ff40a10222.css` | `773269ef61348ffd063ba575c3b200bce3ce68903612e0132c9f8c8e9cf6d276` | `W/"031cad9766837c47a6d915ff40a10222"` |
| `_expo/static/css/components-1d9997ebe14e7e299d7e1eea098e7abf.css` | `2cbc79f312e949a6beefb894a99b302a31bb78c86bd42546407b89f718acf80e` | `W/"1d9997ebe14e7e299d7e1eea098e7abf"` |
| `_expo/static/css/responsive-777f71f805aea2eb8c3d70b285b5dafb.css` | `d133c1bfddda136b74f2c580c8429f8aeee17d0c8e80a1825ce7b6b97d973e15` | `W/"777f71f805aea2eb8c3d70b285b5dafb"` |
| `_expo/static/js/web/entry-5a105befa05b0b8e955183da881d5157.js` | `6ea42d898405cec5a2b6da707caf54d832dff2b4a49ff79d83df758374a9904a` | `W/"5a105befa05b0b8e955183da881d5157"` |

The immutable HTML responses were HTTP 200 with `Cache-Control: must-revalidate, private, max-age=0, no-cache, no-store` and ETag `W/"66c60f6434abd32f958cf51dc16e3ee7"`. Referenced JS and CSS responses were HTTP 200 with `Cache-Control: public, max-age=3600`. The immutable verifier did not record `Age`, `Date`, `Last-Modified`, `Server`, request IDs, or CDN-specific headers.

### 3. Actual alias content after promotion

The exact alias route and asset hashes observed by the failing parity invocation are **not recoverable from the preserved evidence**.

`verify-alias` fetched immutable and alias content, compared their hashes in memory, and threw `Alias content differs from immutable deployment.` before writing `alias-verification.json`. It did not write a failure record. Consequently the run preserves neither the mismatching bodies nor their hashes, paths, headers, or individual request times.

The only post-failure alias content observation is the first rollback verification at `2026-09-24T16:44:41.690Z`. It was made after the rollback assignment command and returned:

| Field | Value |
|---|---|
| HTTP status | `200` |
| HTML SHA-256 | `bf9eb41415befbb164e759e0e89e6036173cd9e9cfcf67e6a7ded588ec772aa3` |
| ETag | `W/"1a401454bb0dea50c456d96f3440ea6a"` |
| Age | `189928` |
| Expected deployment | `6jki82fy0u` |

That proves rollback content was restored after rollback assignment. It cannot establish what the alias served before rollback.

### 4. Candidate, rollback, or neither

The verifier proves at least one alias response did not equal its corresponding immutable candidate response. It does not preserve enough information to classify the response set as:

- entirely the previous rollback deployment;
- a mixture of old and new content;
- a different deployment;
- or a genuine content inconsistency within the candidate deployment.

The rollback HTML identity was known before promotion and was observed again after rollback. There is no preserved pre-rollback alias hash to connect the failed parity response to it. Any stronger classification would be a hypothesis.

### 5. Timing

| Event | Recorded time | Elapsed from recorded promotion completion |
|---|---|---:|
| Promotion preflight captured | `2026-09-24T16:44:15.718Z` | `-13.316 s` |
| Alias assignment response recorded | `2026-09-24T16:44:29.034Z` | `0 s` |
| First rollback verification captured | `2026-09-24T16:44:41.690Z` | `12.656 s` |
| Rollback evidence completed | `2026-09-24T16:44:41.691Z` | `12.657 s` |

The parity command ran after the promotion record and failed before the rollback assignment and its first verification. Thus every failing parity probe occurred somewhere inside the open interval from `0` to less than `12.656` seconds after recorded promotion completion. Exact request start/end times and per-response elapsed times were not recorded. The immutable and alias collections ran concurrently; each collection fetched routes and then assets sequentially.

### 6. Response headers

No response metadata from the failing alias requests survives. The current collector would have retained only `status`, `ETag`, `Cache-Control`, and `Content-Type` if the overall comparison had passed. It does not collect `Age` or other CDN headers.

The expected immutable responses and the later rollback response are documented above. They are contextual evidence and must not be presented as headers from the failed alias probes.

### 7. What the verifier distinguishes

| Condition | Current behavior | Finding |
|---|---|---|
| Alias metadata propagation | Promotion command response only; no fresh metadata poll | Not distinguished |
| CDN content propagation | One immediate content collection; no timed observations or cache-busting | Not distinguished from a lasting mismatch |
| Browser cache | Verification uses Node `fetch`, outside a browser | Browser cache is not involved in this parity invocation |
| Service-worker cache | Node `fetch` is not controlled by the application worker; `sw.js` has no `fetch` handler or Cache API use | Service-worker caching is not involved in this parity invocation |
| Genuine deployment-content mismatch | Exact hashes are compared | A mismatch is detected, but its source cannot be classified |

The comparison itself is strict. Its diagnostic capture and propagation model are insufficient.

### 8. Stabilization behavior

The alias parity gate has no stabilization window. It makes one immediate collection and fails on the first mismatch.

The same operator script already uses a bounded model for rollback verification: at most ten attempts, five seconds apart, with a unique query parameter and `Cache-Control: no-cache`/`Pragma: no-cache`. That behavior is not used for forward alias verification.

A bounded stabilization window can preserve the exact parity requirement. Intermediate mismatches remain recorded as mismatches; promotion succeeds only when independently queried alias metadata identifies the candidate and every required alias route and critical asset exactly matches the immutable candidate in a complete attempt. Exhausting the window remains a hard failure followed by rollback. This changes when the gate decides, not what counts as passing.

## Root-cause conclusion

### Confirmed

1. Candidate `bfh8u5a0dh` matched its exported artifact before promotion.
2. The promotion operation reported assigning `staging` to `bfh8u5a0dh`.
3. An immediate, single-shot post-promotion comparison detected at least one exact content mismatch.
4. The comparison failed less than 12.656 seconds after the promotion record and before rollback verification.
5. The verifier discarded all mismatching response evidence and did not independently verify post-promotion alias metadata.
6. Browser and application service-worker caching did not participate in the Node parity request.
7. Rollback to `6jki82fy0u` was assigned and its HTML content was verified.

### Unconfirmed hypotheses

- alias metadata propagation lag;
- CDN content propagation lag;
- a mixed edge response set;
- a genuine alias-to-deployment routing/content defect.

The preserved run cannot select among these hypotheses. The immediate cause of the qualification failure was a real strict-hash mismatch. The root cause of that mismatch is **indeterminate because the failure path did not persist the observations needed to classify it**. CDN caching must not be claimed as the cause.

## Requirement disposition

| Requirement | Result |
|---|---|
| Exact deployment ID from promotion response | PASS — `bfh8u5a0dh` |
| Independent post-promotion alias metadata ID | INCOMPLETE — never queried/persisted |
| Expected immutable hashes | PASS — recovered above |
| Actual failing alias hashes and headers | INCOMPLETE — discarded before evidence write |
| Classify alias as rollback/candidate/neither | INCOMPLETE — evidence does not support classification |
| Exact elapsed time for every probe | INCOMPLETE — per-request timing absent |
| Browser/service-worker cache assessment | PASS — excluded from the Node verifier path |
| Existing stabilization window | PASS — none for forward verification; bounded polling exists only for rollback |
| Phase 6 | BLOCKED |
