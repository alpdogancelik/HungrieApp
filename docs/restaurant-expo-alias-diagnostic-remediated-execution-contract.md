# Restaurant Expo/EAS diagnostic remediated execution contract

**Status:** Local implementation contract only; no hosted execution authority
**Basis:** `restaurant-expo-alias-comprehensive-read-only-staging-reality-audit.md`
**Accepted parent:** `5533606a841e9a7d75b2a3e22ef672bd107fa5d8`
**New run:** `ruip6ad_20260925c`
**Aborted authorities:** `ruip6ad_20260925a` and `ruip6ad_20260925b` are permanently consumed and prohibited from reuse

## Artifact contracts

The candidate and rollback deployments have independent contracts.

- The candidate is fixed by the accepted 74-file manifest. Immutable verification and promoted-alias verification fetch every manifest entry and require exact URL, HTTP 200, byte length, and SHA-256. The six operational routes and five direct JS/CSS assets remain explicit subsets. The service worker must reference both approved Firebase 11.10.0 compatibility URLs, and those external resources must match their recorded bytes and hashes.
- The rollback contract is discovered from all six rollback route documents. It records each route's referenced JS/CSS paths, the unique deployment-wide asset union, three deployment-owned PWA runtime files, and two service-worker external dependencies. Every entry carries byte length and SHA-256. Its canonical contract digest follows the reference through preservation, recapture, promotion preflight, rollback observation, expected-final state, and finalization. No candidate asset count is imposed on rollback.

## Mutation and recovery boundaries

- Authority contains a start and end timestamp for a maintenance window no longer than two hours.
- Deployment and promotion require at least 720 seconds remaining: 600 seconds for bounded observation and 120 seconds for independent rollback verification.
- No non-recovery action may begin outside the window. A rollback already authorized for an attempted assignment and its verification may continue after the deadline.
- The execution-support deployment reservation is consumed atomically by the actual deployment command. Missing, mismatched, repeated, or already consumed reservations stop before provider execution.
- Initial rollback capture and fresh recapture have different exclusive attempt markers. Partial capture evidence cannot be retried or accepted, and completed canonical evidence cannot be overwritten.
- Uncertain deployment response handling uses a separately executable read-only Expo GraphQL observation. It persists the exact project, endpoint, request identity, timestamps, response digest, and deployments before reconciliation. It never fabricates an identifier or invokes another deployment.
- Promotion and rollback retain one-attempt markers. Provider assignment responses are operation evidence, while independent metadata and byte parity determine restoration.

## Real access qualification

Pending, suspended, owner, and manager qualification fails for any uncaught exception or rejection, console error/assertion, network transport failure, same-origin HTTP 4xx/5xx, unexpected runtime origin, missing service-worker readiness, incomplete route/heading/shell rendering, authorization-before-readiness, unbounded navigation, or manager Earnings access/request.

All request evidence remains sanitized. Headers, cookies, tokens, passwords, and bodies are excluded.

## Future authorization prerequisites

A future hosted diagnostic requires all of the following after a separate audited checkpoint:

1. A new run ID and evidence directory. Neither aborted run may be reused.
2. A freshly reviewed source manifest, application tree, 74-file artifact manifest, deterministic archive, executable hashes, proposal hash, and owner authorization digest.
3. A fresh maintenance window encoded in approval and authority JSON.
4. Fresh fail-closed Staging preflight, Earnings-disabled proof, protected-evidence proof, and exact rollback capture.
5. Exactly one immutable deployment reservation and provider attempt.
6. Complete immutable publication and four-account browser qualification before promotion.
7. One alias assignment, bounded observation, one rollback, independent exact rollback verification, manifest-scoped reconciliation, and final evidence manifest.

The audited checkpoint must be the exact direct child of the accepted parent with the ten-file inventory in `restaurant-expo-alias-ruip6ad-20260925c-execution-contract.md`. Execution support accepts only the new run ID and its isolated authority/evidence paths. It verifies the complete accepted lineage through the parent, the actual checkpoint manifest, exact committed inventory, executable hashes, proposal-contract digest, and unchanged Restaurant tree before authority artifacts can be prepared.

Successful alias parity remains a diagnostic result only. It does not approve Phase 6, Earnings activation, Production deployment, or any other hosted operation.
