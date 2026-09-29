# Hungrie Production Firebase & Supabase Deferred Work

## 1. Current decision

- Production Firebase provisioning: **DEFERRED BY OWNER**
- Production Supabase provisioning: **DEFERRED BY OWNER**
- Reason: additional Restaurant testing will be completed first on the existing isolated Vercel staging/evaluation Preview workflow.
- This is an owner sequencing decision, not a technical failure.
- Production backend qualification: **NOT EXECUTED**
- Existing Development and Staging environments remain unchanged.
- Production must remain isolated when this work resumes.

This handoff was prepared from repository checkpoint `77c2540e9c60e78fe0243f08edd0c7871f5c0ab2`. Phase 6 remains `PASS / ACCEPTED / CLOSED`. ISO-01 through ISO-10 remain `LOCAL PASS / HOSTED NOT EXECUTED`.

Authoritative related records:

- `docs/restaurant-production-architecture-inventory.md`
- `docs/restaurant-production-architecture-inventory.json`
- `docs/restaurant-production-readiness-plan.md`
- `docs/restaurant-production-readiness-checklist.json`
- `docs/restaurant-production-environment-contract.example.json`
- `docs/restaurant-production-operator-classification.json`
- `docs/restaurant-nonproduction-tool-classification.json`
- `docs/restaurant-responsive-ui-phase6-acceptance.md`
- `docs/restaurant-responsive-ui-phase6-acceptance.json`

Vercel is selected as the intended Restaurant Production hosting platform. The existing isolated Vercel staging/evaluation project remains non-production and may be used only for explicitly authorized Preview testing. It must not be converted into the Production project or receive Production domains.

## 2. Important architecture decisions already made

### Production Firebase

The Production Firebase project must be new, clean, Production-only, and separate from `hungrieapp-a2288`. The latter remains Development/Staging only and is forbidden as a Production fallback.

### Production Supabase

The Production Supabase project must be new, clean, Production-only, and separate from every Development and Staging project. No Production project ref has been selected or recorded.

### Restaurant hosting

The intended Production platform is Vercel. No Vercel Production deployment, project activation, alias, domain, or public traffic change is authorized by this decision.

## 3. Firebase Production remaining work

### Project provisioning

- [ ] Create the dedicated Production Firebase project under the owner-approved account or organization.
- [ ] Record the exact project ID and project number without inventing either value.
- [ ] Record ownership, billing, operator, and recovery responsibilities.
- [ ] Confirm any region or data-location decisions that apply to selected Firebase services.

### Firebase applications

- [ ] Register the Production web application.
- [ ] Register the Production iOS application using the reviewed bundle identifier.
- [ ] Register the Production Android application using the reviewed package identifier.
- [ ] Obtain and independently bind Production public client configuration.
- [ ] Store native configuration through the approved secret/build mechanism; never reuse the tracked non-production Android configuration.

### Authentication

- [ ] Configure only the required providers, including email/password.
- [ ] Review authorized domains for the Restaurant, Customer, and Admin Production origins.
- [ ] Qualify Admin MFA/TOTP, password reset, invitations, and action-link destinations.
- [ ] Prove environment isolation and absence of Development/Staging fallback.

### IAM and service accounts

- [ ] Create a dedicated Production Admin SDK service identity.
- [ ] Grant least privilege for Firebase Authentication operations actually required.
- [ ] Grant `cloudmessaging.messages.create` only to the approved sender identity.
- [ ] Grant minimum Functions deployment/runtime permissions.
- [ ] Avoid Owner or Editor when narrower roles satisfy the reviewed operation.
- [ ] Establish credential custody, rotation, revocation, and emergency access.

### FCM

- [ ] Bind FCM to the exact Production Firebase project.
- [ ] Establish a Production VAPID key and its custody.
- [ ] Qualify Restaurant web push and Customer notification dependencies.
- [ ] Qualify foreground delivery, background delivery, and a real notification click.
- [ ] Prove Production token isolation and scoped token cleanup.

### Functions

- [ ] Deploy the explicit Production variants for Admin MFA, deletion, Restaurant web push, reconciliation, and every other retained active Function.
- [ ] Bind every variant to the exact Production Firebase and Supabase identities.
- [ ] Approve region, runtime, secrets, schedules, retry policy, and operational ownership.

### Isolation qualification

- [ ] Prove Development/Staging Firebase tokens are rejected by Production where required.
- [ ] Prove Production tokens cannot authenticate against unintended environments.
- [ ] Verify exact issuer, audience, project, and service-account bindings.
- [ ] Prove there is no fallback to `hungrieapp-a2288`.

### Production Firebase evidence

- [ ] Persist sanitized project-identity and application-registration evidence.
- [ ] Persist IAM and authorized-domain state without credentials.
- [ ] Record public configuration and credential fingerprints only where appropriate.
- [ ] Complete hosted qualification and an integrity manifest.

None of this work is authorized now.

## 4. Supabase Production remaining work

### Project provisioning

- [ ] Create a clean Production Supabase project under the approved organization.
- [ ] Confirm organization ownership, region, PostgreSQL version, and runtime expectations.
- [ ] Record the exact project ref only after the provider creates it.

### Exact environment binding

- [ ] Bind the exact Production URL and project ref.
- [ ] Configure public client values and separate server credentials.
- [ ] Validate all values through the fail-closed Production contract.
- [ ] Prove there is no Staging fallback or loosely matched hostname.

### Database foundation

- [ ] Audit the complete migration chain and record migration hashes.
- [ ] Review Production-safe ordering, extensions, and environment-specific steps.
- [ ] Apply migrations only under future explicit approval.
- [ ] Verify the complete schema and migration history afterward.

### RLS and authorization

- [ ] Verify forced RLS, grants, private schemas, and security-definer RPC contracts.
- [ ] Qualify Customer, Restaurant, and Admin authorization and tenant scoping.
- [ ] Test cross-tenant and wrong-role rejection.

### Realtime

- [ ] Verify private Restaurant topics and policies.
- [ ] Qualify authenticated subscriptions, reconnect behavior, and environment isolation.

### Storage

- [ ] Create/configure `restaurant-media` if retained by the reviewed release.
- [ ] Verify read/write/delete policies, MIME and size limits, and tenant path enforcement.

### Functions and workers

- [ ] Deploy the notification worker with explicit Production secrets.
- [ ] Review retries, wake-up behavior, error handling, and operator ownership.

### Cron and jobs

- [ ] Verify pending-order expiry, incident detection, and notification wake-up schedules.
- [ ] Review financial-integrity jobs separately where applicable.

### Reviews and orders

- [ ] Qualify Review v2 contracts, order creation, transitions, conflict transport, expiry, and incidents.

### Financial schema

Commission tables and migrations may exist. Restaurant Earnings remains disabled unless separately approved. Basic Production provisioning must not activate Earnings.

### Backup and recovery

- [ ] Create the approved encrypted backup target and initial backup.
- [ ] Verify retention, restoration procedure, and an isolated restore drill.
- [ ] Record evidence, RPO/RTO, rollback strategy, and recovery ownership.

### Token and project isolation

- [ ] Configure the exact Firebase-to-Supabase integration.
- [ ] Accept only the reviewed Production Firebase issuer/audience.
- [ ] Reject non-production identity and prove there is no Staging token leakage.

### Hosted qualification

- [ ] Verify migrations, RLS, RPCs, Realtime, Storage, order workflows, notification persistence, cleanup, and sanitized evidence integrity.

None of this work is authorized now.

## 5. Production account work to do later

Controlled, isolated qualification identities will be required for Customer, Restaurant Pending, Restaurant Suspended, Restaurant Owner, Restaurant Manager, Admin, and Super Admin if the reviewed Admin contract requires it. Later work must cover invitation/onboarding, MFA, suspension, role and tenant isolation, retention, and cleanup. No Production account may be created under this handoff.

## 6. Production domains to revisit later

| Intended domain | State |
|---|---|
| `app.hungrie.app` | `DOCUMENTED / NOT PROVISIONED` |
| `restaurant.hungrie.app` | `DOCUMENTED / NOT PROVISIONED` |
| `admin.hungrie.app` | `DOCUMENTED / NOT PROVISIONED` |

No DNS or provider-domain mutation is authorized.

## 7. Production configuration contract

The completed ISO-01 through ISO-10 remediation requires all real Firebase IDs, the Supabase project ref, Vercel project/domain identities, Functions bindings, public client configuration, server credentials, source checkpoint, approval digest, action scope, and expiry to be explicitly and exactly bound.

Use `docs/restaurant-production-environment-contract.example.json` only as a schema example. Real values must remain in the approved ignored location. Never guess an identifier, inherit a Staging value, or rely on an implicit current project.

## 8. Production qualification sequence for later

1. Owner resumes Production backend work.
2. Create the Firebase Production project.
3. Create the Supabase Production project.
4. Record exact provider identities.
5. Bind the repository Production contract.
6. Configure least-privilege IAM and secrets.
7. Configure Firebase Auth, applications, and domains.
8. Prepare Supabase backup and restore controls.
9. Apply Production database migrations under explicit approval.
10. Verify RLS, RPC, Realtime, and Storage.
11. Deploy required Functions and workers.
12. Create controlled Production qualification accounts.
13. Create a deterministic Restaurant Production candidate.
14. Deploy a maintenance/protected candidate.
15. Run Production browser and account qualification.
16. Run Production FCM qualification.
17. Run environment and token-isolation qualification.
18. Verify backup and rollback.
19. Owner performs Production Go/No-Go.
20. Public activation is approved separately.

This sequence is documentation only.

## 9. Explicit future approval boundaries

Future explicit owner approval is required before creating Production Firebase or Supabase resources; changing IAM, Firebase configuration or authorized domains; creating Production secrets or accounts; applying Supabase migrations or changing hosted data; sending real Production FCM messages; creating a Vercel Production deployment; attaching public domains or aliases; activating public traffic; activating Earnings; or submitting stores.

## 10. Resume instruction

### How to resume

Resume when the owner says: **“Production Firebase ve Supabase'e geçelim”**.

First refresh repository state, verify this handoff is still current, inspect every change since checkpoint `77c2540e9c60e78fe0243f08edd0c7871f5c0ab2`, and update the gap matrix. Do not blindly execute stale provider commands. Then prepare the first bounded Production provisioning stage for explicit owner review.
