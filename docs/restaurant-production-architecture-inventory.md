# Restaurant Production Architecture Inventory and Gap Matrix

**Inventory date:** 2026-09-29
**Repository checkpoint inspected:** `5c57d4ceeb11fbaee95cb92a24dc3fa6332738a1`
**Phase 6:** `PASS / ACCEPTED / CLOSED`
**Production readiness:** `NOT YET APPROVED / NOT EXECUTED`
**Method:** local repository and ignored local metadata inspection only
**Hosted requests:** 0
**Production mutations:** 0

## Classification

- `VERIFIED READ-ONLY` — directly established from repository bytes or sanitized local records during this inventory. For provider state, this would require an authorized provider read; none occurred.
- `DOCUMENTED BUT UNVERIFIED` — architecture or preserved evidence describes the state, but this inventory did not verify the current provider.
- `NOT ESTABLISHED` — no approved identity or configuration exists in the inspected repository/local release metadata. This does not prove that no unrecorded provider resource exists.
- `UNKNOWN` — neither current evidence nor the intended contract determines the state.

## Decision

The intended Production architecture is a clean, isolated Firebase project plus a clean, isolated Supabase project, with Production-specific client and server credentials. Restaurant web/PWA is intended for `restaurant.hungrie.app`; Customer web for `app.hungrie.app`; Admin for `admin.hungrie.app`. The final Restaurant hosting provider has not been approved. Vercel is proven only for the accepted Staging Preview path.

Production is not ready to provision or release. No Production Firebase project ID, Supabase project record, Vercel project, domain assignment, account set, backup, or release candidate is established. The ten confirmed source/tooling gaps are now `LOCAL PASS / HOSTED NOT EXECUTED`: Production paths fail closed until explicit exact identities and an owner-bound operator contract are supplied.

## Environment matrix

| Environment | Firebase | Supabase | Restaurant web hosting | Customer native delivery | Classification |
|---|---|---|---|---|---|
| Local | Default client configuration points at the shared non-production Firebase project; emulator use is supported by tooling but no emulator block is committed in root `firebase.json`. | Local CLI project `hungrie-app`, PostgreSQL 17, local API/DB/Studio, Realtime, Storage, migrations, and `notification-worker`. | Local Expo static web/export; no hosted target required. | Development EAS profile and local Expo runtime; committed native Android config points at the shared non-production Firebase project. | Repository contracts `VERIFIED READ-ONLY`; live services not applicable or `UNKNOWN`. |
| Development | Shared non-production Firebase project is identified in source; project number is recorded in native config. Provider/Auth/domain/IAM state is not freshly inspected. | Development project ref is bound in Customer runtime code and present in ignored local state with credentials; hosted schema/state is not freshly inspected. | Existing Expo/EAS development paths; no dedicated Vercel Development identity established. | Customer EAS project exists in configuration; Development profile uses internal development client. | Identity/config `DOCUMENTED BUT UNVERIFIED`; local binding bytes `VERIFIED READ-ONLY`. |
| Staging | Intentionally shares Development Firebase Auth. Accepted Phase 6 evidence proves the reviewed non-production web/FCM path at its qualification time; current provider settings were not reread. | Distinct Staging project ref is bound in Customer runtime code and present in ignored local state. Accepted qualification proves reviewed Staging application behavior, not current provider parity. | Existing isolated Vercel Preview project and immutable accepted deployment; no Production alias/domain. | Customer Preview EAS profile; Restaurant EAS project/Preview export contracts exist. | Preserved evidence `DOCUMENTED BUT UNVERIFIED` as current provider state. |
| Production | No approved project ID/number, web app, native app registrations, Auth pool, providers, authorized domains, VAPID key, service identity, IAM, or MFA operator set is recorded. | No Production entry exists in ignored `secure/supabase-projects.local.json`; no project ref or credentials are recorded. | Final provider is undecided. No Production Vercel project, target, domain, protection policy, or rollback deployment is recorded. | Production EAS profiles and application identifiers exist, but their Firebase/native credentials are not isolated from non-production. Store submission is separate. | Required identities `NOT ESTABLISHED`; any unrecorded provider state `UNKNOWN`. |

## Intended isolation model

The approved architecture requires:

1. a new clean Production Firebase project;
2. a new clean Production Supabase project;
3. no Development/Staging identities copied to Production;
4. no Development/Staging Firebase tokens accepted by Production Supabase;
5. no Production Firebase tokens accepted by non-production where bidirectional isolation is required;
6. Production-specific public client configuration and server credentials;
7. Production starting in `maintenance`, becoming `active` only after explicit owner go/no-go;
8. deliberately approved catalog data only, with zero copied profiles, orders, addresses, reviews, push tokens, notification events, or MFA enrollments.

The database's final identity functions read `private.runtime_settings.firebase_project_id`, so the schema can bind a dedicated Firebase issuer. The environment deployment tool writes that identity and keeps Production in maintenance. This design is sound only when the tool receives an exact separately reviewed Production Firebase ID.

## Confirmed local isolation gaps

| ID | Finding | Evidence | Consequence | Required correction | Local status |
|---|---|---|---|---|---|
| `ISO-01` | Customer Firebase embeds and falls back to the shared non-production Firebase configuration. | `mobile/app.json`, `mobile/lib/firebase.ts`, and tracked `mobile/google-services.json`. | A Production build can silently use the non-production Auth/FCM project if EAS inputs are absent or incomplete. | Remove Production fallbacks; require a complete environment contract and Production-native Firebase files/registrations. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-02` | Customer Supabase Production validation accepts any project ref other than the two known non-production refs. | `mobile/lib/supabaseConfig.ts`. | A typo or unrelated Supabase project could pass the Production environment check. | Bind Production to one exact reviewed project ref/fingerprint and test wrong/unknown refs. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-03` | Restaurant Firebase/Supabase startup validates presence only and uses build-proof fallbacks; it does not bind `EXPO_PUBLIC_HUNGRIE_ENV`, Firebase project, Supabase project, VAPID identity, and origin as one Production contract. | `apps/restaurant/src/firebase.ts`, `apps/restaurant/src/supabase.ts`, `apps/restaurant/scripts/write-firebase-config.mjs`. | Cross-environment or incomplete configuration can produce a build rather than fail before export. | Add an exact Production build-input validator used by export, service-worker config, and deployment authority. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-04` | Admin explicitly permits only `development` and `staging` and maps callable names to those suffixes. | `apps/admin-web/lib/firebase.ts`. | Admin Production cannot build/run under a valid Production environment contract. | Add a reviewed Production environment and exact Production callable mapping after the functions exist. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-05` | Firebase Functions define Development/Staging Admin MFA, Restaurant Web Push, and anonymization reconciliation variants only. | `functions/index.js`. | Production Admin MFA orchestration and Restaurant FCM dispatch have no isolated Production secret/function binding. | Add Production-only secrets and exports; keep account deletion scoped to exactly one Production Supabase project. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-06` | Supabase environment deployment defaults `--firebase-project-id` to the shared non-production Firebase project even when target is Production. | `scripts/deploy-supabase-milestone10.mjs`. | An omitted flag could deploy Production schema/runtime trusting non-production tokens. | Require an explicit Firebase ID for Production and reject the non-production ID before any hosted request. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-07` | Production catalog generation passes the shared non-production Firebase project ID into the import transform. | `scripts/create-production-catalog-release.mjs`. | Production catalog provenance can be bound to the wrong identity domain. | Make the Production Firebase ID an exact reviewed input or remove identity coupling from catalog-only data. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-08` | Production environment verification treats every Firebase ID other than the known shared ID as isolated. | `scripts/verify-supabase-milestone11-environment.mjs`. | An arbitrary wrong Firebase ID can be reported as isolated. | Compare against the exact approved Production Firebase project ID and issuer. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-09` | Root `.firebaserc` defaults generic Firebase commands to the shared non-production project. | `.firebaserc`. | An unguarded generic deploy can target non-production and cannot safely express Production. | Create a separate fail-closed Production operator with exact project/credential/command bindings; do not change the default during preparation. | `LOCAL PASS / HOSTED NOT EXECUTED` |
| `ISO-10` | Generic and migration scripts remain intentionally hard-bound to the non-production Firebase project. | `functions/scripts/*` and historical environment scripts. | They are unsafe for Production reuse. | Classify each as non-production-only or create a separately reviewed Production replacement; never parameterize silently. | `LOCAL PASS / HOSTED NOT EXECUTED` |

## Firebase Production gap matrix

| Requirement | State | Finding / decision needed |
|---|---|---|
| Project existence and ownership | `NOT ESTABLISHED` | No approved Production project ID or number is recorded. A provider read was not authorized. |
| Web app registration | `NOT ESTABLISHED` | Customer/Restaurant/Admin Production web configuration is absent. |
| Android app | `NOT ESTABLISHED` | Package `com.hungrie.app` is configured, but tracked `google-services.json` belongs to non-production and cannot be used for Production. |
| iOS app | `NOT ESTABLISHED` | Bundle `com.hungrie.app` and store identifiers are configured; a Production Firebase iOS registration/credentials are not established. |
| Restaurant native apps | `NOT ESTABLISHED` | Identifiers exist, but the accepted release is desktop web/PWA; native Restaurant release remains separate. |
| Email/password Auth | `DOCUMENTED BUT UNVERIFIED` | Required by application login flows; Production provider state is unknown. |
| Admin TOTP MFA | `DOCUMENTED BUT UNVERIFIED` | Application and callable contracts exist for non-production; Production callable functions and two recoverable super-admin identities are missing. |
| Authorized domains | `NOT ESTABLISHED` | Must include only approved Production portal/domain needs; Preview domains must not be copied blindly. |
| FCM/VAPID | `NOT ESTABLISHED` | Production web VAPID ownership, web config, Admin send path, and browser qualification are missing. |
| Service account / IAM | `NOT ESTABLISHED` | Need a least-privilege Production operator/sender identity. FCM send requires `cloudmessaging.messages.create`; Auth Admin privileges must be separated and justified. |
| Functions region/runtime | `DOCUMENTED BUT UNVERIFIED` | Node 22 is declared; no explicit region contract or Production deployment inventory is approved. |
| Server secrets | `NOT ESTABLISHED` | Production Supabase URL/service key, APNs material if applicable, and secret ownership/rotation are missing. |
| Account deletion | `BLOCKED` | Current callable is designed for shared non-production Development/Staging deletion. A single-environment Production contract is required. |
| Token isolation | `NOT EXECUTED` | Requires exact issuer/audience config and separately authorized bidirectional disposable-token probes. |

## Supabase Production gap matrix

| Requirement | State | Finding / decision needed |
|---|---|---|
| Project identity | `NOT ESTABLISHED` | No Production project entry exists in ignored local state. Intended region is `eu-central-1`, PostgreSQL 17. |
| Migration level | `NOT EXECUTED` | Repository has 52 migrations through `20260924140000_restaurant_order_conflict_transport.sql`; no Production migration history exists locally. |
| Runtime state | `NOT ESTABLISHED` | Must remain `production / maintenance` until final activation. |
| Firebase issuer/audience | `BLOCKED` | Final schema supports environment-owned identity, but deployment/default/verification gaps `ISO-06` and `ISO-08` must be fixed first. |
| RLS/RPC | `DOCUMENTED BUT UNVERIFIED` | Local migrations/tests define guarded RLS/RPC contracts. Production replay, grants, advisors, and cross-tenant probes remain outstanding. |
| Realtime | `DOCUMENTED BUT UNVERIFIED` | Private Broadcast policy and raw-order-publication removal are scripted. Production managed schema/private-only state is not established. |
| Storage | `DOCUMENTED BUT UNVERIFIED` | Restaurant media policies exist; Production bucket/policy/object-lifecycle state is not established. |
| Edge Functions | `DOCUMENTED BUT UNVERIFIED` | `notification-worker` is the configured function. Production deployment and exact secrets are absent. |
| Vault/secrets | `NOT ESTABLISHED` | Worker URL/secret and Expo access token ownership/rotation are not provisioned. |
| Cron/jobs | `DOCUMENTED BUT UNVERIFIED` | Order expiry, notification dispatch/receipts, reliability, and financial-integrity schedules exist in migrations. Production schedules and maintenance suppression are unverified. |
| Backups | `NOT ESTABLISHED` | Encrypted EU GCS backup tooling exists with intended daily 30-day/monthly 12-month retention, RPO 24h/RTO 4h. No Production bucket/archive is established. |
| Restore drill | `NOT EXECUTED` | Fail-closed isolated restore tooling exists; no Production backup has been restored. |
| Catalog | `BLOCKED` | Clean catalog-only release tooling exists, but `ISO-07` must be resolved and expected counts/source must be separately reviewed. |
| Earnings | `NOT EXECUTED` | Schema is present behind `restaurant_earnings_v1`; Production activation is excluded and requires separate approval. |

## Hosting gap matrix

| Requirement | State | Finding / decision needed |
|---|---|---|
| Final Restaurant host | `DOCUMENTED BUT UNVERIFIED` | Owner selected Vercel as the intended Production platform. No Production Vercel project, deployment, domain, or activation is provisioned. The staging/evaluation project remains non-production. |
| Production project/scope | `NOT ESTABLISHED` | The linked Vercel project is the isolated Staging evaluation project. It must not be promoted or repurposed silently. |
| Domain/DNS/HTTPS | `NOT ESTABLISHED` | Intended `restaurant.hungrie.app`; ownership, DNS, certificate, and activation are unverified and separately authorized. |
| Headers/CSP | `DOCUMENTED BUT UNVERIFIED` | `apps/restaurant/vercel.json` defines HSTS, CSP, no-store HTML/config, immutable assets, and service-worker scope. Production behavior needs immutable qualification. |
| Service worker | `DOCUMENTED BUT UNVERIFIED` | Root-scoped `/sw.js`, no fetch cache, Firebase config import, FCM background/click behavior were proven in Staging. Production origin/config remain unqualified. |
| Protection/access | `NOT ESTABLISHED` | Decide prelaunch protection, operator access, public launch boundary, and emergency access. |
| Preview Toolbar | `NOT APPLICABLE` for intended public Production | Must prove no injection on exact Production bytes; no normalization exception. |
| Immutable candidate | `NOT EXECUTED` | Requires checkpoint, complete source manifest, two clean deterministic exports, 74-file manifest, canonical archive, and executable hashes. |
| Rollback | `NOT ESTABLISHED` | Define retained prior immutable deployment, domain/alias reassignment, one-attempt procedure, independent verification, and database maintenance coordination. |
| Customer/Admin hosting | `DOCUMENTED BUT UNVERIFIED` | Intended `app.hungrie.app` and `admin.hungrie.app`; provider projects and release operators are not established. |

## Customer native delivery

| Requirement | State | Finding / decision needed |
|---|---|---|
| EAS project | `DOCUMENTED BUT UNVERIFIED` | Customer project ID is committed; current EAS ownership/state was not inspected. |
| Production profile | `VERIFIED READ-ONLY` repository contract | EAS `production` environment, auto-increment, Android AAB, iOS submit metadata, package/bundle `com.hungrie.app`. |
| Firebase native config | `BLOCKED` | Android file is non-production; Production iOS/Android Firebase registrations and credentials are missing. |
| Expo push | `DOCUMENTED BUT UNVERIFIED` | Client obtains Expo push tokens using the EAS project ID; Production Expo credentials and worker token are not established. |
| APNs | `NOT ESTABLISHED` | Server supports APNs production/sandbox configuration, but keys, team/topic ownership, and Production delivery are unverified. |
| Store submission | `NOT EXECUTED` | Separate explicit owner decision after Production go/no-go. |

## Local work that needs no Production mutation approval

1. Fix `ISO-01` through `ISO-10` with fail-closed tests.
2. Define a single Production public build-input schema for Customer, Restaurant, Admin, and service worker.
3. Add exact cross-provider identity validation: Firebase project ID/number, Supabase ref, EAS/Vercel project, origins, bundle/package IDs, and server function names.
4. Create Production-safe operators in dry-run mode with synthetic fixtures; preserve explicit target and one-attempt controls.
5. Review all 52 migrations and environment-specific post-migration steps; decide whether Staging-named reliability migrations apply unchanged to Production.
6. Produce deterministic local artifacts, manifests, archives, SBOM/dependency results, and rollback rehearsal fixtures after the release checkpoint is selected.
7. Specify backup/restore, observability, incident, maintenance, key-rotation, account, and catalog acceptance contracts.

## Explicit owner approval boundaries

Approval is required before any Production provider read unless an existing authorization exactly covers it. Separate explicit approval is required for project creation/adoption, IAM/service accounts, secrets, Firebase apps/providers/domains, Supabase migrations/config/functions/Vault/Cron/data/backups, Vercel projects/domains/deployments, EAS credentials/builds, real accounts, real FCM/APNs/Expo sends, runtime activation, Earnings, stores, DNS, public traffic, rollback, or destructive cleanup.

## Safest dependency order

1. **Local remediation:** close `ISO-01`–`ISO-10`; add exact identity manifests and tests.
2. **Owner architecture decisions:** Vercel is selected for Restaurant hosting. Choose the Production Firebase/Supabase organizations and projects, domain strategy, account ownership, observability, backup custody, and whether any legacy Firebase Functions remain.
3. **Read-only provider inventory:** under a bounded authorization, establish whether candidate Production resources already exist; record exact identities without mutation.
4. **Provisioning authorization:** create/adopt clean Firebase and Supabase projects and hosting projects in maintenance/protected state; configure least privilege and secret custody.
5. **Backend foundation:** apply reviewed migrations/config, exact Firebase OIDC issuer, RLS/RPC/Realtime/Storage/Edge/Vault/Cron, backup and isolated restore drill; keep maintenance.
6. **Release candidate:** bind exact source, deterministic artifacts, Production public config, native config, and signed candidates.
7. **Production qualification:** create only approved identities/data; run isolation, access, order, notification, performance, backup/rollback, browser/native, and evidence gates without public activation.
8. **Go/no-go:** owner reviews complete evidence and rollback state.
9. **Activation:** separately authorize domain/store/public release and runtime `active`; monitor the bounded launch window.

## Next action

The local fail-closed Production identity contract is complete. Production Firebase and Supabase provisioning are `DEFERRED BY OWNER` while additional isolated Vercel Preview testing continues. Resume from `production-firebase-supabase-deferred-work.md` only after the owner says “Production Firebase ve Supabase'e geçelim”. Production remains not established and activation remains unauthorized.
