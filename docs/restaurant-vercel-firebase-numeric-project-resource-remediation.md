# Firebase Config numeric project-resource remediation

## Root cause

Inspection `restaurant-vercel-firebase-domain-inspection-20260928a` made its one authorized `projects.getConfig` request successfully and received HTTP 200. The returned Config resource name was `projects/405094874808/config`. The local validator accepted only `projects/hungrieapp-a2288/config`, so it classified a valid response as `ABORTED_WRONG_PROJECT` before evaluating `authorizedDomains`.

Identity Platform's `projects.getConfig` method addresses `projects/*/config`, and the returned Config `name` is the canonical resource name. Firebase documents the numeric project number as the globally unique canonical identifier and the project ID as a convenience alias. The repository's committed `mobile/google-services.json` binds project ID `hungrieapp-a2288` to project number `405094874808`; the committed Firebase app ID independently embeds the same project number.

## Correction

The validator now accepts exactly two Config names for this reviewed project mapping:

- `projects/hungrieapp-a2288/config`
- `projects/405094874808/config`

It rejects every other textual or numeric identifier, missing or malformed names, and any altered trusted mapping. Project identity is validated before the exact authorized-domain set. The new inspection authority binds both identifiers, verifies their committed mapping from `mobile/google-services.json`, and verifies the consumed inspection-A authority and evidence manifest before authority preparation.

Fresh inspection `restaurant-vercel-firebase-domain-inspection-20260928b` retains one authenticated GET, zero retries, zero mutations, sanitized evidence only, and exclusive authority/evidence paths. Inspection A remains terminal and retry-ineligible.

## Verification contract

Deterministic fixtures cover textual and numeric valid names, wrong textual and numeric projects, missing and malformed names, altered trusted mappings, authorized-domain present and absent, all provider/error classifications, exact two-hour approval, and the one-request execution lifecycle. The existing Vercel local qualification and unrelated browser/access regressions remain unchanged.

No hosted request or mutation is part of this remediation checkpoint.
