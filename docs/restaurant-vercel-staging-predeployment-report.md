# Restaurant Vercel Staging route-remediation readiness

Date: 2026-09-27

Classification: **LOCAL CONTINUATION READINESS PASS — HOSTED CONTINUATION NOT EXECUTED**

Phase 6 remains **BLOCKED**.

## Confirmed failure and root cause

Continuation `restaurant-vercel-staging-evaluation-20260927e` passed account, scope, project, artifact, and effective Preview-environment gates. All nine reviewed Preview variables were already exact, so it performed zero environment writes. Its single deployment command was rejected before a deployment or Preview URL was created.

Vercel CLI 60.1.3 rejected header source `/:route(+not-found|_sitemap|dashboard|...)`. In the path-pattern grammar, the leading `+` in the `+not-found` alternative was parsed as a modifier rather than a literal URL character. The configuration passed the repository's former tests because those tests inspected values but did not invoke Vercel's route transformer.

The consumed attempt remains immutable:

- progress SHA-256: `d738b62419514f3e079477a29f745c215ad01362498819963371705955b515ef`
- evidence-manifest SHA-256: `1a96c5b712e6b4fe5a49ef969638c18c716931ea2ff0f80312382cb0c07068c9`
- deployment commands: 1/1 consumed
- deployment ID and Preview URL: none

## Correction

The combined parameter expression was replaced by one literal header rule for each of the 17 top-level extensionless HTML paths. `+not-found` uses the supported escaped source `/\\+not-found`. Every route retains `private, no-cache, no-store, max-age=0, must-revalidate`.

The global security-header rule remains first. Immutable `_expo/static` and `assets` cache rules remain ahead of HTML rules. `sw.js`, `firebase-config.js`, and `manifest.webmanifest` retain dedicated cache behavior. The root path and dynamic `/orders/:orderId` retain no-store behavior. The only rewrite remains `/orders/:orderId` to `/orders/[orderId]`; no SPA catch-all was added, so missing assets and the absent optional favicon remain true HTTP 404 responses rather than HTML.

The deployment operator now validates the complete exact Vercel configuration before it creates an evidence directory or contacts Vercel. It rejects the failed expression, missing or duplicate HTML rules, cache drift, service-worker header drift, build/output drift, and rewrite drift. Continuation E is verified by exact hashes and exact terminal structure before any future action.

## Deployment-equivalent local validation

The complete `apps/restaurant/vercel.json` was passed to both validation layers shipped in the locally installed pinned `vercel@60.1.3` package:

- project-configuration JSON schema: PASS;
- Vercel route/header/rewrites transformer: PASS, 30 normalized routes;
- the historical rejected expression under the same transformer: rejected as expected.

This uses the same schema and route transformation code used by the pinned CLI before deployment and exercises the full configuration. It does not contact the Vercel deployment API. It materially prevents the confirmed failure, but cannot guarantee that every future hosted API or platform condition will accept a deployment.

## Preserved contracts

- Existing project: `hungrie-restaurant-web-staging-eval-20260927a`
- Scope: `nurlan-ildirimli-s-projects`
- Account: `nurlanildirimli00-3449`
- Artifact manifest: `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89`
- Canonical archive: `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862`
- Public build-input contract: `f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e`
- Artifact: 74/74 files
- Preview variables: nine exact effective values, established by consumed continuation E; values are not persisted or printed

The fresh continuation is `restaurant-vercel-staging-evaluation-20260927f`, with exclusive future evidence directory `secure/restaurant-vercel-staging-deployment/restaurant-vercel-staging-evaluation-20260927f`.

## Local verification

- Vercel contract tests: 23/23 PASS.
- Pinned Vercel schema and route transformation: PASS.
- Complete local Vercel qualification: PASS, including exact 74-file artifact and canonical archive, 20 extensionless routes, 50 assets, required CSS/fonts, three runtime files, dynamic order routing, `sw.js`, optional favicon 404, missing-asset 404, four isolated account flows, notification worker, TypeScript, and diff checks.
- Environment reconciliation simulation: exact nine-variable state produces zero writes and one Preview deployment command.
- Historical attempts A–E: byte-for-byte hash verification PASS.
- Credential-value and whitespace checks: PASS.

## Single future action requiring owner approval

```sh
node scripts/deploy-restaurant-vercel-staging.mjs \
  --scope=nurlan-ildirimli-s-projects \
  --execute=true \
  --confirm=continue-route-validated-restaurant-vercel-preview
```

The command reuses the existing isolated project, verifies the consumed history and exact local configuration before hosted access, revalidates project identity and all nine effective Preview values, and permits exactly one Preview deployment without retry. It cannot create, delete, transfer, or relink a project, target Production, or manage aliases or domains.

After a successful deployment, the generated Preview URL still requires authorized read-only route, asset, cache, service-worker, and HTTP 429 qualification. Firebase authorized-domain changes and real FCM registration and delivery are separate and remain unqualified.
