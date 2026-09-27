# Restaurant HTTP 429 observation A supplemental forensic record

**Historical observation:** `ruip6ao_20260927a`

**Disposition:** `ABORTED`; authority consumed; hosted retry and authority reuse permanently prohibited.

This supplemental record does not alter the historical authority or observation directory. It records only conclusions supported by the preserved files, the captured exception, and committed source.

## Preserved evidence

| Historical file | Bytes | SHA-256 |
| --- | ---: | --- |
| `authority-validation.json` | 787 | `823becd7941819d074c731dbe1e5f56ec3d8876df6dc6b1a596459e7b3303945` |
| `browser-observations.json` | 1874 | `4900e98d7607cbfc013a22240e3024c462c6e828e9b81eac415140181fe237c1` |
| `progress.json` | 185 | `f96573588285918f52d97d04eb237027298da06130833181e2f95d011e00de3b` |

The ordered partial-inventory SHA-256 is `0ce41dd0b7026339075e021f89ca2e53c2def2ef5842a26de46d6121b61026dc`. The three files remain mode `0600`, parse as JSON, and contain no detected credential value. No historical `terminal-result.json` or `evidence-manifest.tsv` exists; this record does not fabricate either file.

## Confirmed root cause

The exception arose while persisting the second `Fetch.requestPaused` row. That row schema contained only request ID, timestamp, method, protocol, sanitized origin/path, resource type, header names, credential-header names, and query-parameter names. It did not retain header values, query values, request bodies, cookies, tokens, passwords, or email addresses.

The former detector nevertheless rejected any serialized evidence containing the bare words `authorization`, `cookie`, `password`, `secret`, `token`, or `api-key`, regardless of whether the word was a value, a safe field name, a header name, or part of an origin/path. This was an overly broad lexical detector. The committed Restaurant configuration permits Firebase endpoints including `securetoken.googleapis.com`, and the local qualification adapter explicitly models that origin, so a non-secret origin/path containing `token` is an evidence-supported possible trigger. The exact second URL was not persisted and cannot be confirmed or reconstructed.

There is no evidence that the rejected row contained an actual credential value. There is also no evidence sufficient to identify its exact origin or resource. A genuine credential-bearing header remains a mandatory security failure in the remediated contract.

## Historical response

The only completed hosted response was `GET /suspended`, HTTP `200` over HTTP/2. It recorded `Server: cloudflare`, `CF-Ray: a4192ee6fba10ed1-IST`, `Age: 51262`, cache-control, ETag, last-modified, no browser cache/service-worker source, and remote endpoint `104.18.21.213:443`. No HTTP `429` was observed before the abort, so observation A cannot attribute the earlier rate-limit responses.

## Reconciliation

Observation A is reconciled only by this separately named, repository evidence record. Its historical directory remains incomplete and immutable. The authority and attempt are consumed. Any future observation must use a new observation ID, new authority, new exclusive paths, a separately approved two-hour validity period, and the remediated executable checkpoint.
