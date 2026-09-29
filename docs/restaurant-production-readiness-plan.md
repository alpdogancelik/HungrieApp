# Restaurant Production Readiness Plan

**Status:** `NOT YET APPROVED / NOT EXECUTED`
**Prepared:** 2026-09-29
**Phase 6:** `PASS / ACCEPTED / CLOSED`
**Production mutations authorized:** None

## Local architecture inventory result

The local/read-only inventory is complete. See `restaurant-production-architecture-inventory.md` and its machine-readable JSON. No hosted provider request was made.

- Production Firebase identity: `NOT ESTABLISHED`
- Production Supabase identity: `NOT ESTABLISHED`
- Restaurant Production hosting platform: `VERCEL / INTENDED / DOCUMENTED / NOT PROVISIONED`
- Production Firebase provisioning: `DEFERRED BY OWNER`
- Production Supabase provisioning: `DEFERRED BY OWNER`
- Additional isolated Vercel Preview testing: `IN PROGRESS / ALLOWED`
- Production activation: `NOT AUTHORIZED`
- Unrecorded external provider state: `UNKNOWN`
- Confirmed local environment-binding gaps: 0 open; 10 resolved as `LOCAL PASS / HOSTED NOT EXECUTED`
- Production mutations performed: 0

The local fail-closed identity/build/operator remediation is complete. Vercel is selected as the intended Restaurant Production platform, but no Production project, deployment, domain, or activation exists. Firebase and Supabase Production provisioning are deferred by owner while additional isolated Preview testing continues. Resume backend work from `production-firebase-supabase-deferred-work.md` only after the explicit resume trigger.

## Purpose

Prepare an exact, isolated Restaurant Production release candidate and an owner-reviewable go/no-go package. This plan does not authorize deployment, configuration changes, credentials, identities, real messages, store submission, Earnings activation, public activation, or destructive cleanup.

## Proven in Vercel Staging

The accepted evidence establishes, for the reviewed Staging identities and immutable Preview deployment: deterministic Restaurant export and canonical archive; Preview deployment and route/resource delivery; no observed required-resource HTTP 429 in the accepted path; Firebase browser authentication; Pending, Suspended, Owner, and Manager access behavior; service-worker activation/control; FCM token creation; Supabase token registration/persistence; foreground and background FCM delivery; real notification-click navigation; bounded token/browser/bypass cleanup; Vercel Protection Bypass creation/revocation; and sanitized evidence integrity.

These results inform Production preparation. They do not prove Production configuration or authorize Production use.

## Production prerequisites

Every item uses `PASS`, `FAIL`, `BLOCKED`, `NOT EXECUTED`, or `NOT APPLICABLE`.

### Environment isolation

- `NOT EXECUTED` — identify a clean Production Firebase project.
- `NOT EXECUTED` — identify a clean Production Supabase project.
- `NOT EXECUTED` — prove Production identities and credentials are separated from Development and Staging.
- `NOT EXECUTED` — run token/project-isolation tests without exposing secrets.

### Firebase

- `NOT EXECUTED` — review Production Auth providers, templates, persistence, and abuse controls.
- `NOT EXECUTED` — approve Production authorized domains.
- `NOT EXECUTED` — establish Production FCM/VAPID configuration and secret ownership.
- `NOT EXECUTED` — grant and verify the minimum Production send permission for the approved service identity.
- `NOT EXECUTED` — review administrator MFA and credential rotation/revocation.

### Supabase

- `NOT EXECUTED` — bind the exact Production project identity.
- `NOT EXECUTED` — reconcile migration history and generated types.
- `NOT EXECUTED` — qualify RLS, RPC grants, private Realtime, Storage policies, and runtime gates.
- `NOT EXECUTED` — establish Production secret ownership and rotation.
- `NOT EXECUTED` — create and verify backups plus a restore drill.

### Vercel and hosting

- `PASS` — Vercel selected as the intended Restaurant Production platform; project/domain provisioning remains unexecuted.
- `NOT EXECUTED` — define the Production project, domain, HTTPS, deployment protection, and access model.
- `NOT EXECUTED` — qualify headers/CSP, static routing, cache policy, service-worker scope, and absence of Preview Toolbar behavior.
- `NOT EXECUTED` — define immutable candidate, promotion, rollback, and independent verification procedures.

### Application artifact

- `NOT EXECUTED` — select the exact release checkpoint.
- `NOT EXECUTED` — produce two deterministic clean exports.
- `NOT EXECUTED` — bind source manifest, 74-file artifact manifest, canonical archive, executable hashes, and reviewed candidate signature/approval.

### Accounts

- `NOT EXECUTED` — create separately authorized Production Customer, Restaurant, and Admin identities.
- `NOT EXECUTED` — prove account-type and tenant isolation.
- `NOT EXECUTED` — qualify Owner, Manager, Pending, and Suspended behavior.
- `NOT EXECUTED` — require and qualify Admin MFA.

### Notifications

- `NOT EXECUTED` — qualify the Production FCM send path and VAPID identity.
- `NOT EXECUTED` — prove Production token isolation and absence of Staging token leakage.
- `NOT EXECUTED` — perform separately authorized foreground, background, real-click, and scoped-cleanup qualification.

### Operational safety

- `NOT EXECUTED` — approve backups, restoration, rollback, maintenance mode, incident ownership, and observability.
- `NOT EXECUTED` — prove Production-safe logs and evidence sanitation.
- `NOT EXECUTED` — document secret rotation/revocation and emergency access.

### Payments and Earnings

The implemented Restaurant payment methods remain cash and card-on-delivery POS. Online payment or Virtual POS is not established by source and is outside this plan. Restaurant Earnings remains disabled unless separately authorized; Production readiness does not activate it.

### Store and activation boundaries

App Store/Play Store submission, public domain activation, Production traffic, and final release remain separate owner decisions.

## Production mutation matrix

| Action | Approval boundary |
|---|---|
| Repository inspection, local tests, manifests, deterministic local builds, static analysis | No additional approval |
| Read-only environment inspection | Only when an existing authorization explicitly covers the exact provider, environment, identity, requests, and evidence path |
| Production deployment or rollback | Explicit owner approval |
| Production alias, domain, DNS, HTTPS, or public activation | Explicit owner approval |
| Production Firebase configuration, IAM, credentials, authorized domains, accounts, identities, or real FCM sends | Explicit owner approval |
| Production Supabase migration, schema, policies, secrets, data, backups/restores, or runtime gates | Explicit owner approval |
| Production secrets or destructive cleanup | Explicit owner approval |
| Earnings activation | Separate explicit owner approval |
| Store submission | Separate explicit owner approval |

Staging autonomy and prior authorizations do not transfer to Production.

## Go/no-go

The machine-readable checklist is `restaurant-production-readiness-checklist.json`. Overall readiness remains `NOT_YET_APPROVED_NOT_EXECUTED`. A Production go decision is forbidden until every mandatory item is `PASS` or explicitly `NOT APPLICABLE`, all required owner approvals are recorded, the exact candidate and rollback are independently verified, and there are no `FAIL`, `BLOCKED`, or `NOT EXECUTED` mandatory items.

## Local isolation remediation

`ISO-01` through `ISO-10` are `LOCAL PASS / HOSTED NOT EXECUTED`. Customer, Restaurant, Admin, Functions, Firebase and Supabase operators now reject missing, non-production, ambiguous, or mismatched Production identities. Legacy hard-bound tools are machine-classified non-production-only. No Production identifier, credential, or provider state was invented.

## First justified next action

Continue owner-directed testing on the existing non-production Vercel Preview workflow. Production backend work resumes only when the owner says “Production Firebase ve Supabase'e geçelim”; then refresh this repository and the dedicated deferred-work handoff before proposing any provider action.
