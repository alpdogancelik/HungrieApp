# Vercel Protection Bypass inventory-contract remediation

## Confirmed root cause

Qualification `restaurant-vercel-browser-notification-qualification-20260928g` called `GET /v1/projects/{idOrName}/protection-bypass` before bypass generation. The current public Vercel REST contract documents `PATCH` on that path for generation, revocation, and update; it does not document a project-level `GET` on the same path. The first request returned HTTP 404 and the runner aborted before creating a bypass or browser session. A second post-terminal request repeated the same 404 and violated G's zero-retry contract. G remains terminal, consumed, and immutable.

The invalid GET had been introduced to prove that a caller-generated secret did not already exist and to retain a baseline for cleanup comparison. It added no necessary guarantee beyond the already completed project/protection inspection plus mutation-response ownership and an independent post-revocation project read.

## Correction

- Fresh qualification: `restaurant-vercel-browser-notification-qualification-20260928h`.
- Preliminary Protection Bypass inventory GET budget: zero.
- Generation: exactly one `PATCH /v1/projects/prj_PrVORzWTAxmAHL0SqNcA9WXJppS4/protection-bypass` in exact scope `nurlan-ildirimli-s-projects`, with one cryptographically generated 32-character lowercase hexadecimal secret and note equal to the qualification ID.
- Generation response: must contain the exact secret with the qualification-owned note. A malformed response or ownership mismatch stops before browser work.
- Revocation: exactly one PATCH on the same endpoint with `{revoke:{secret,regenerate:false}}`.
- Independent cleanup verification: exactly one documented `GET /v9/projects/prj_PrVORzWTAxmAHL0SqNcA9WXJppS4` after revocation. It must prove the exact project, team, protection state, Toolbar state, absence of the qualification secret, equality with the revocation response, and preservation of every unrelated record observed in the generation response.

No undocumented replacement endpoint is used. Secret material remains absent from persisted evidence. The completed Firebase and Vercel inspections, exact deployment identity, exact scope/team binding, protected bootstrap, four-account checks, service-worker gate, notification gate, and cleanup behavior remain fail closed.

## Verification

- Focused and related Vercel/Firebase/qualification tests: 92/92 PASS.
- Continuation tests: 49/49 PASS.
- Complete local Vercel qualification: PASS, including exact 74-file artifact and canonical archive, supported routing, local HTTP delivery, TypeScript, four-account local browser flows, notification-worker tests, syntax, and diff checks.
- Qualification G evidence manifest, authority, source manifest, and all six evidence files remain byte-for-byte unchanged.
- Hosted requests and mutations during remediation: zero.

Qualification H still requires one explicit owner approval of the exact committed authorization text. This remediation does not constitute Phase 6 acceptance.
