# Restaurant Vercel Staging continuation readiness

Date: 2026-09-27

Classification: **LOCAL CONTINUATION READINESS PASS — HOSTED CONTINUATION NOT EXECUTED**

Phase 6 remains **BLOCKED**.

## Confirmed prior state

The consumed attempt `restaurant-vercel-staging-evaluation-20260927a` created and linked the isolated Vercel project `hungrie-restaurant-web-staging-eval-20260927a` in scope `nurlan-ildirimli-s-projects`. Its first environment-variable write failed. The preserved progress record contains exactly three steps: project-name discovery PASS, project creation/link PASS, and the first Preview variable write FAIL. It contains no deployment step or terminal deployment result. Its `progress.json` SHA-256 is `eef7fea0705809035b4ace7c49c1a366512280397e42068c9a7fef4fe6b8297c`.

The local `.vercel/project.json` identifies that exact project. The raw organization and project IDs are not recorded here; their reviewed SHA-256 fingerprints are `8928fd7f108505fa35d1906b2926cbee6c4f240bc029a715ff25b5c498407951` and `b4845746ef4b9dc3a66dd84b7de8e4f57814f1273bf137c244614e9141d04a8f`.

## Root cause and correction

Vercel CLI 60.1.3 rejects `--sensitive` for variables whose names begin with `EXPO_PUBLIC_`, because these values are included in browser bundles. The supported command contract is `vercel env add NAME preview --force --type config`. All nine reviewed inputs begin with `EXPO_PUBLIC_`; all are public client configuration. This set contains no private server-side secret. The operator rejects any additional non-public variable rather than assigning it a type speculatively.

Continuation B (`restaurant-vercel-staging-evaluation-20260927b`) is also consumed. It performed only a successful read-only project inspection, then failed because its validator incorrectly looked for a top-level `accountId`, `orgId`, or `teamId`. CLI 60.1.3 actually returns ownership as `owner: { name, slug }`. The project ID matched the local link, and `owner.slug` matched the approved scope. B issued zero environment writes and zero deployment commands. Its `progress.json` SHA-256 is `94709e5228f9233fb2f7c14a124273591f38f070ee5df5731b172ed11e6d43d5` and its evidence-manifest SHA-256 is `64f47c26808d6a6594d74adfe4c2ac29ddd5b3e60df3f0a4bd869c3c52143aff`.

The read-only CLI response was independently reproduced with response SHA-256 `ecffad83ba6cc6e805c642201cce6c5ce57d3a97c7acdfedc646ea239f0e1d50`. Its project name is the reviewed project, its project-ID fingerprint is `b4845746ef4b9dc3a66dd84b7de8e4f57814f1273bf137c244614e9141d04a8f`, its owner slug is `nurlan-ildirimli-s-projects`, and its owner display name is `Nurlan Ildirimli's projects`. The unique team record with that slug has ID fingerprint `8928fd7f108505fa35d1906b2926cbee6c4f240bc029a715ff25b5c498407951`, exactly matching the local link's `orgId` fingerprint. `vercel whoami` independently identifies the authenticated username as `nurlanildirimli00-3449`. These are separate semantics: username identifies the authenticated user; slug selects the team scope; the opaque team ID binds that slug to local `orgId`; project ID binds the local link to the inspected project; and owner name is only a display label.

Continuation C (`restaurant-vercel-staging-evaluation-20260927c`) is consumed as well. Its account, team, project, and environment inventory reads all passed; then it stopped before mutation because reconciliation read a nonexistent `bytes` property while the canonical validator returns `utf8Bytes`. C issued zero environment writes and zero deployments. Its progress SHA-256 is `0f34c3dd73db0ddb8493ba60cf17a9cb3eeca8df03814115c02af6c75733632f` and its evidence-manifest SHA-256 is `2a9bd1a393eff2a2a97e5984299c876d80d0e5acbb3449f943b2c2f8cc5b46bc`.

The canonical observation schema is now exactly `{ name, utf8Bytes, sha256, passed }`. Reconciliation rejects missing, extra, reordered, invalid, or obsolete fields rather than applying a fallback. UTF-8 byte lengths and SHA-256 fingerprints are verified for every reviewed local and remote value.

Continuation D (`restaurant-vercel-staging-evaluation-20260927d`) is consumed. All nine Preview config writes succeeded, but its post-write check hashed the encrypted metadata representation returned by `env ls --json` as if it were plaintext. It stopped before deployment. D's progress SHA-256 is `6f85a5c61f8973d6d739b429575185696b41733af4e24d808893618625c67cab` and its evidence-manifest SHA-256 is `87cab7e473a3be51108b0062f34349cdb647c5f02ec5312bebd3dbbd668a4a66`.

The read-only inventory response contains exactly nine records with `type: encrypted`, `visibility: config`, target `[preview]`, no branch, no usable record ID, and a roughly 1 KB encrypted `value`. The encrypted field is not an effective-value representation, and a record ID is not invented from it. Records remain unambiguous because each reviewed name has exactly one Preview/no-branch entry. Vercel CLI 60.1.3 `env pull --environment=preview` is now used for independent effective-value verification through a mode-0600 temporary file that is removed in `finally`. All nine pulled values matched the reviewed UTF-8 lengths and SHA-256 fingerprints. Injected Vercel system values are ignored by name and never logged; they cannot satisfy or replace a reviewed value.

The fresh continuation ID is `restaurant-vercel-staging-evaluation-20260927e`. It uses the new exclusive directory `secure/restaurant-vercel-staging-deployment/restaurant-vercel-staging-evaluation-20260927e` and cannot reuse any consumed directory.

Before a mutation, the continuation verifies:

- all four consumed attempts’ exact progress/evidence hashes and terminal schemas;
- the authenticated Vercel username, without equating it to a team name or slug;
- the unique approved team slug and its opaque team ID, which must exactly match the locally linked `orgId`;
- the local link’s project name and project/organization ID fingerprints;
- remote project name and project ID, `owner.slug`, nonempty owner display name, empty root directory, and absence of build/output settings that conflict with the exact reviewed local configuration;
- the mode-0600 nine-variable input and build-input contract;
- the complete local Vercel qualification and exact artifact identities.

It then lists the Preview environment in JSON in memory. Output containing readable values is never persisted. An exact config value is skipped, a missing value is added, and a conflicting reviewed value is replaced with `--force --type config`. Duplicate identities, unexpected Preview variables, malformed output, or a post-write fingerprint mismatch stop execution. A second inventory read must prove all nine exact values before deployment.

Only then may the operator issue one Preview deployment. Project creation/linking, Production deployment, aliases, domains, promotion, rollback, deletion, and retries are absent from the continuation command set.

## Fixed Preview variable inventory

Each of these is browser-visible and stored through CLI `--type config`:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_VAPID_KEY`
- `EXPO_PUBLIC_RESTAURANT_POLL_MS`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`

Values remain in the existing Git-ignored, mode-0600 input file. Evidence records only names, classifications, disposition, status, byte/fingerprint validation, and sanitized command-output hashes.

## Preserved delivery contract

- Artifact manifest: `d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89`
- Canonical archive: `b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862`
- Public build-input contract: `f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e`
- Files: 74/74 exact
- Direct routes: 20/20
- Critical/static assets, fonts, runtime configuration, `sw.js`, root service-worker scope, security headers, cache controls, and true missing-asset HTTP 404 behavior remain mandatory.

No Restaurant application, AuthGate, routing, notification, backend, Firebase, Supabase, Expo Hosting, or Production behavior changed.

## Local verification

- Vercel contract tests: 21/21 PASS, including the canonical `utf8Bytes` schema, all-nine-variable reconciliation states, the full no-network/no-mutation decision path, deterministic evidence finalization, the actual CLI 60.1.3 project/owner response shape, username validation, unique team-slug-to-team-ID mapping, wrong-project/wrong-scope/wrong-org rejection, and ambiguous identity rejection.
- Complete Vercel local qualification: PASS, including exact fresh export/archive, 74 files, 20 routes, 50 assets, three runtime files, dynamic order route, missing-asset 404, four isolated account flows, notification worker, TypeScript, and diff check.
- Responsive UI Phase 1–5: 51/51 PASS.
- Reviews: 35/35 PASS.
- Earnings: 17/17 PASS; Earnings remains disabled.
- Notification worker: 11/11 PASS.
- Order conflict transport probe: PASS.
- Syntax, credential-value scan, prohibited-command inspection, and whitespace checks: PASS.
- Consumed progress evidence before/after SHA-256: unchanged.

## Remaining hosted action

The exact continuation command, which still requires separate owner approval, is:

```sh
node scripts/deploy-restaurant-vercel-staging.mjs \
  --scope=nurlan-ildirimli-s-projects \
  --execute=true \
  --confirm=continue-effective-env-verified-restaurant-vercel-preview
```

This will first verify the authenticated username and exact team-slug-to-team-ID mapping, then perform read-only project and environment inspection, reconcile the nine Preview config values, verify the resulting environment, and issue exactly one Preview deployment. It does not create another project.

After deployment, the generated Preview URL still requires exact artifact/routing/header/service-worker qualification. Real FCM registration and delivery remain unqualified. If Firebase rejects the generated hostname, adding it as an authorized domain is a separate Firebase mutation and is not included. Notification PASS cannot be claimed until real registration, delivery, click handling, unregister cleanup, and required device/PWA checks pass.
