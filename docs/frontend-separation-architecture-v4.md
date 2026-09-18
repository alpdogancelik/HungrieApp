# Hungrie Frontend Separation Architecture

**Status:** Approved — Revision 4 with the Phase 0 desktop-first Restaurant release amendment (2026-09-12)

**Business decisions:** Locked by the app owner; see [Phase 0 decision record](phase-0-architecture-decisions.md)

**Implementation status:** Phase 1, the development-only Phase 2 additive account model, and Phase 3 classification/backfill were separately accepted by the app owner on 2026-09-12. Phase 4 implementation and non-production staging qualification were accepted on 2026-09-13. Phase 5 development implementation, rehearsal, Staging deployment, pilot onboarding, desktop workflow, and browser/device qualification were accepted by the app owner on 2026-09-14. Phase 6 Development implementation, hosted qualification, reviewed Staging migrations, shared non-production deletion functions, Customer Preview environment, and Customer Review System v2 were accepted by the app owner on 2026-09-18. Unrecorded iOS and Android physical-device checklist rows remain release-blocking Phase 7 qualification work and are not represented as passed. Legacy Customer/Restaurant authorization remains live. See [Phase 4 review](phase-4-admin-minimum-review.md), [Phase 5 review](phase-5-restaurant-desktop-review.md), and [Phase 6 review](phase-6-customer-first-release-review.md).

**Current release status:** Hungrie has no live production Customer application or production user base. Development and Staging intentionally share the current non-production Firebase Auth project while using separate Supabase projects. Production will use new, clean Firebase and Supabase projects; no non-production test identities or application data will be copied into them. This plan prepares the first production Customer release, not an upgrade of existing production users.

**Phase status:** Phase 0 through Phase 6 are complete and accepted. Phase 7 full Staging qualification is next. The open physical-device rows carried forward from Phase 6 must pass before any Production expansion or release.

**Scope:** Separate Customer, Restaurant, and Admin applications while retaining Firebase Authentication and one shared Supabase database per environment.

---

## 1. Executive Decision

Hungrie will operate three independently deployed applications:

1. Customer App — the existing Expo application under `mobile/`
2. Restaurant App — a separate Expo Router application, launched on desktop web/PWA first and designed for a separately qualified tablet release and later iOS and Android builds
3. Admin App — a new Next.js application required for the initial production release

The applications share infrastructure and selected pure packages, but they do not share navigation, application state, privileged UI, or authorization assumptions.

The v1 identity model is deliberately strict:

```text
Customer identity
    -> Customer App only

Restaurant identity
    -> Restaurant App only
    -> exactly one restaurant

Admin identity
    -> Admin App only
```

The three identity categories are mutually exclusive. A human who needs more than one category must use separate Firebase identities/accounts. Because the applications use one Firebase Authentication user pool, this normally also requires distinct sign-in identifiers, such as different email addresses.

Firebase answers **who the caller is**. Supabase alone decides **what the caller may do**.

---

## 2. Non-Negotiable Architecture Rules

- One identity has exactly one account type: `customer`, `restaurant`, or `admin`.
- Account type is immutable in v1. Changing type means creating a separate identity and following a deliberate data-transfer process, not editing a role in place.
- One Restaurant identity has exactly one restaurant assignment.
- An Admin identity has no Customer or Restaurant access.
- Firebase custom business-role claims are not an authorization source.
- The Firebase `role: authenticated` claim remains a transport requirement for the Supabase Firebase integration; it is not a Hungrie business role.
- Supabase RLS, guarded RPCs, constraints, and server checks enforce access.
- Access-context responses are routing/UX information, not reusable authorization proof.
- Firestore is not an application-data fallback.
- Private Admin data must never be exposed through shared Next.js caches; Restaurant service workers must never cache private application data.
- Shared database migrations have one owner and one release pipeline.
- The first production Customer build must support the minimum-version contract before strict enforcement. Later incompatible production builds can be force-updated through that contract.
- The five-minute order response deadline is server-authoritative.

---

## 3. Target Repository Structure

Do not rename `mobile/` during the initial separation.

```text
HungrieApp/
├── mobile/                         # Customer Expo app
├── apps/
│   ├── restaurant/                 # Restaurant Expo Router app: web first, native later
│   └── admin-web/                  # Admin Next.js app
├── packages/
│   ├── domain/                     # Pure types, schemas, state machines
│   ├── database-types/             # Generated Supabase types
│   └── config/                     # Shared TS/lint/style configuration
├── supabase/
│   ├── migrations/                 # Sole schema migration source
│   ├── tests/                      # RLS/RPC/constraint tests
│   ├── functions/                  # Backend workers where appropriate
│   └── realtime/                   # Managed Realtime policy source
├── functions/                      # Firebase Auth/notification integration during transition
├── scripts/                        # Controlled provisioning/release tooling
└── docs/
```

Start with three shared packages. Add a shared API client or auth core only when duplication between applications is real and the code has no portal-specific authority baked in. Share domain rules, generated types, validation, and backend contracts; do not force the Customer and Restaurant applications to share routes, UI, state, or sessions. Shared code is an engineering convenience, never an authorization boundary.

Update the root workspace only after a compatibility spike proves both Expo applications and the Admin Next.js application can build against one lockfile:

```json
{
  "workspaces": [
    "mobile",
    "apps/*",
    "packages/*"
  ]
}
```

Keep `functions/` outside the npm workspace initially because it has a separate runtime and deployment lifecycle.

---

## 4. Frontend Technology and Session Model

### 4.1 Customer

- Existing Expo Router application.
- Firebase Auth remains the sign-in provider.
- All application data moves to Supabase.
- Customer navigation contains no Restaurant or Admin routes after cutover.

### 4.2 Restaurant

- Separate Expo Router application, targeting desktop web/PWA for the initial release. Tablet and native devices require separately approved qualification before they become supported Restaurant order devices.
- A desktop-optimized web layout, a later dedicated large-screen/tablet live-order layout, and a later compact phone layout may share domain logic but need not share screen composition.
- Browser-direct Firebase Authentication for the web release; native Firebase Auth integration must be validated before native launch.
- The current Firebase ID token is supplied to the Supabase client through its `accessToken` callback on each supported platform.
- Supabase resolves the caller and applies current database authorization to every private operation.
- Expo route groups/layouts provide UX redirects only; they are not an access-control boundary.
- Web/PWA order notifications need a real service worker and Web Push subscription. `expo-notifications` remains the separate native-push path for iOS/Android.

The Restaurant application has its own route tree, app identifiers, EAS project, release channels, Firebase web/iOS/Android app registrations as needed, notification subscriptions, and deployment lifecycle. It must not import Customer navigation or Customer-only repositories. All Firebase app registrations can remain in the appropriate shared Firebase project for each environment; separate registrations are configuration boundaries, not business authorization.

### 4.3 Admin

- Next.js App Router with TypeScript and a desktop-oriented web interface.
- Browser-direct Firebase Authentication for v1; supply the current ID token to the user-scoped Supabase client through `accessToken`.
- Next.js route groups/layouts provide UX redirects only.
- Every private query is dynamic and uncached unless an identity- and tenant-scoped cache is deliberately designed and security-reviewed.
- Use session-scoped browser persistence by default; any longer-lived persistence requires a separate threat-model decision.

A service-role BFF is not part of v1. A Firebase session cookie is not automatically a user-scoped Firebase ID token for Supabase, so introducing a server-side session bridge requires a separate design and security review.

### 4.4 Dependency and deployment checkpoint

The repository currently pins React 19.1 while the root development types include React 18. Before scaffolding either new app:

1. Choose and pin a reviewed Expo SDK/React combination for Restaurant and a reviewed Next.js/React combination for Admin.
2. Resolve root React type/override conflicts without breaking the existing Customer build.
3. Scaffold `apps/restaurant/` as a separate Expo application and prove its web build, Metro, and workspace resolution alongside `mobile/`.
4. Scaffold `apps/admin-web/` and prove Next.js, both Expo builds, shared TypeScript, and the root lockfile work together.
5. Validate separate Restaurant web hosting, service-worker scope, HTTPS, EAS project, Firebase app registrations, and environment ownership.

Do not select the newest Expo or Next.js versions blindly. Keep Restaurant web and native release processes independent of the Customer app, even when they share a build provider.

---

## 5. Canonical Identity and Access Data Model

### 5.1 New enums

Illustrative target types:

```sql
public.account_type
  customer | restaurant | admin

private.account_status
  pending | active | suspended | revoked

private.account_onboarding_step
  none
  restaurant_approval_required
  admin_mfa_enrollment_required
  admin_mfa_sign_in_required

public.restaurant_lifecycle_status
  pending | active | suspended | closed
```

Exact enum placement may change during migration design, but these states and meanings must remain explicit.

### 5.2 Canonical account table

```sql
private.account_access
- profile_id                 primary key -> public.profiles(id)
- account_type               customer | restaurant | admin
- status                     pending | active | suspended | revoked
- onboarding_step            type-specific pending step or none

-- Restaurant fields; null for every other account type
- restaurant_id              -> public.restaurants(id)
- restaurant_role            owner | manager

-- Admin fields; null for every other account type
- admin_role                 admin | super_admin
- admin_mfa_enrolled_at      onboarding audit evidence, not session authorization

-- Lifecycle/audit/concurrency metadata
- status_reason_code         optional support-safe reason code
- created_by_profile_id      nullable for customer self-bootstrap/system import
- authz_version              monotonic authorization revision
- activated_at
- suspended_at
- revoked_at
- created_at
- updated_at
```

Rules:

- The primary key guarantees one classification per profile.
- `account_type` is immutable.
- `authz_version` increments on every status, role, scope, or onboarding transition. It invalidates cached client context; it never replaces a live authorization check.
- Customer rows have no Restaurant or Admin fields.
- Restaurant rows have exactly one `restaurant_id` and `restaurant_role`, and no Admin fields.
- Admin rows have exactly one `admin_role`, no Restaurant fields, and an active Admin also has `admin_mfa_enrolled_at`.
- `active` requires `onboarding_step = none`.
- `pending` is used for Restaurant/Admin onboarding and requires an applicable onboarding step, except during a tightly controlled import transaction. Customer rows are created active under the current business rules.
- `revoked` is terminal in normal product flows. Restoration requires an audited exceptional operation.
- Clients receive no direct write permission on this table.
- All transitions occur through audited `SECURITY DEFINER` functions owned by the non-bypass API owner.

There is no `portal_grants` table in v1.

### 5.3 Why Restaurant and Admin scope live in the same row

The fixed v1 rules make a flattened canonical row safer than keeping three writable authorities:

- One Restaurant identity has one scalar restaurant ID and one role.
- One Admin identity has one scalar Admin role.
- Customer, Restaurant, and Admin are mutually exclusive.

Database `CHECK` constraints can therefore enforce the complete row shape without cross-table triggers. RLS also needs one indexed lookup instead of reconciling `account_access`, `restaurant_members`, and `user_roles` on every request.

The existing `private.restaurant_members` and `private.user_roles` tables become migration inputs, not permanent authorization authorities. The repository's unique index on `restaurant_members(profile_id)` already supports the one-restaurant decision and must pass before backfill.

During the additive compatibility window, controlled provisioning functions may temporarily write both old and new structures. At enforcement cutover:

1. Stop legacy writes.
2. Verify exact parity.
3. Make `account_access` the only writable authority.
4. Retire the old tables or replace required read compatibility with views derived from `account_access`.

Do not keep bidirectional synchronization indefinitely.

The existing `platform_role` enum also contains `courier`. Courier is not an identity category in this architecture. Inventory and quarantine any courier rows, remove courier authorization branches after the rollback window, and constrain `account_access.admin_role` to `admin | super_admin` only.

Additional transactional invariants:

- Never suspend, revoke, or downgrade the last active, MFA-ready super-admin.
- Keep at least one active owner for every active restaurant that has onboarded Restaurant accounts.
- Restaurant reassignment is an audited Admin operation and is allowed only while the Restaurant account is pending or suspended.
- Removing Restaurant scope revokes that identity; it never converts the identity into a Customer.

### 5.5 Restaurant lifecycle

Add an Admin-controlled lifecycle state to `public.restaurants`:

```sql
public.restaurants
- lifecycle_status           pending | active | suspended | closed
- accepting_orders           merchant-controlled operational switch
- suspended_at
- suspended_by_profile_id
- suspension_reason_code
```

`lifecycle_status` and `accepting_orders` are different:

- Admin controls lifecycle status.
- Restaurant staff can open/close order acceptance only while lifecycle status is active.
- A suspended restaurant cannot receive new orders regardless of its opening setting.
- Admin retains management/support access to suspended restaurants.

The existing `is_active` field must be given an explicit compatibility meaning, backfilled into the new lifecycle field, and retired only after all clients use the new contract.

### 5.6 Invitations and provisioning

Restaurant and Admin identities are invite-only. Use a private invitation record such as:

```sql
private.account_invitations
- id                          uuid primary key
- normalized_email
- account_type                restaurant | admin only
- restaurant_id               required only for Restaurant
- restaurant_role             required only for Restaurant
- admin_role                  required only for Admin
- token_digest                never store the plaintext invite token
- state                       pending | accepted | expired | revoked
- expires_at
- invited_by_profile_id
- accepted_by_profile_id
- accepted_at
- created_at
```

Enforce shape constraints so an invitation cannot contain both Restaurant and Admin scope.

Provisioning operations must be idempotent and keyed by an operation ID. A retry must not create a second profile, access row, invite acceptance, or audit event.

Invitation creation must reject a Firebase UID/email that is already classified as another account type. Because Firebase and Supabase cannot commit one transaction together, the provisioning orchestrator records durable step state and compensates safely: a database failure leaves the privileged Firebase identity disabled/pending, and a delivery failure leaves a retryable pending invitation. Partial provisioning never defaults to Customer access.

Invite creation, invite acceptance, and Customer bootstrap must serialize on the normalized verified email (or use an equivalent unique reservation record) so a racing request cannot create both a Customer classification and a privileged invitation. The Firebase subject is the canonical identity key; email is an onboarding/reservation attribute and must not be accepted from an unverified client field.

### 5.7 Operational incidents

Repeated Restaurant non-response is an operational incident, not an account role:

```sql
private.restaurant_operational_incidents
- id
- restaurant_id
- incident_type               repeated_order_non_response
- state                       open | acknowledged | resolved
- window_started_at
- window_ended_at
- ignored_order_count
- eligible_order_count
- threshold_snapshot          jsonb
- first_detected_at
- acknowledged_by_profile_id
- acknowledged_at
- resolved_by_profile_id
- resolved_at
- resolution_note
```

Keep at most one open incident of the same type per restaurant. Creating, acknowledging, and resolving incidents must be audited.

The threshold configuration belongs in a protected, environment-specific operational-policy record and must be changed only through an audited Admin operation.

### 5.8 Client release policy

Extend the current runtime control with a dedicated release policy:

```sql
private.client_release_policy
- application                customer | restaurant
- platform                   ios | android
- minimum_build_number       integer
- minimum_api_contract       integer
- update_required            boolean
- store_url
- user_message_key
- changed_by_profile_id
- changed_at
```

Expose only a sanitized bootstrap RPC. Phase 1 implements the minimal policy contract and tests simulated Customer build numbers in the existing non-production development project; it does not set staging/production minimums or add a Customer update screen. The first production Customer build must support the contract before strict authorization enforcement. Restaurant native minimum builds become relevant when native clients launch. Use numeric iOS build number/Android version code and an explicit API contract number; do not rely on lexical comparison of marketing versions.

Client-supplied version data is spoofable, so it is not a security boundary. Strict RLS and retired legacy RPCs must remain safe even if a caller lies about its version.

---

## 6. Required Data Invariants

The migration is not ready to enforce until the following are database-backed and tested:

| Identity type | Required detail | Forbidden detail |
|---|---|---|
| Customer | One correctly shaped `account_access` row | Restaurant scope; Admin role |
| Restaurant | One row containing exactly one restaurant ID and Restaurant role | Admin role; Customer classification |
| Admin | One row containing exactly one Admin role and MFA onboarding state | Restaurant scope; Customer classification |

Additional invariants:

- A profile cannot have two account types.
- Each live Firebase subject maps to exactly one non-deleted profile, and each live profile maps to at most one Firebase subject.
- A Restaurant profile has one scalar restaurant ID and cannot represent two restaurant assignments.
- Active Restaurant access requires an existing restaurant.
- Normal Restaurant operations require both an active Restaurant account and an active restaurant.
- Active Admin access requires verified email, completed MFA onboarding, an Admin role, and an MFA-authenticated current session.
- Pending, suspended, revoked, unmapped, and inconsistent identities fail closed.
- Privileged creation, activation, suspension, role change, and recovery write an append-only audit event.

Use row-shape `CHECK` constraints, foreign keys, controlled transactional functions, and invariant tests. Do not rely on UI validation.

---

## 7. Access Context Contract

Because identities are mutually exclusive, one argument-free context function is appropriate:

```ts
type AccessContext =
  | { state: "unmapped" }
  | { state: "configuration_error"; referenceId: string }
  | {
      state: "resolved";
      profileId: string;
      accountType: "customer";
      accountStatus: "active" | "suspended" | "revoked";
      onboardingStep: "none";
    }
  | {
      state: "resolved";
      profileId: string;
      accountType: "restaurant";
      accountStatus: "pending" | "active" | "suspended" | "revoked";
      onboardingStep: "restaurant_approval_required" | "none";
      restaurantId: string;
      restaurantRole: "owner" | "manager";
      restaurantStatus: "pending" | "active" | "suspended" | "closed";
      acceptingOrders: boolean;
    }
  | {
      state: "resolved";
      profileId: string;
      accountType: "admin";
      accountStatus: "pending" | "active" | "suspended" | "revoked";
      onboardingStep:
        | "admin_mfa_enrollment_required"
        | "admin_mfa_sign_in_required"
        | "none";
      adminRole: "admin" | "super_admin";
      emailVerified: boolean;
      currentSessionMfaVerified: boolean;
    };

type AccessContextFetchError =
  | { kind: "network_error"; retryable: true }
  | { kind: "backend_unavailable"; retryable: true };
```

The production response should expose support-safe error references rather than internal schema details.

`unmapped` means the authenticated Firebase subject has no mapped Supabase profile. A mapped profile with no valid canonical access row is `configuration_error`, not an implicit Customer.

`get_my_access_context()` may guide routing, but it does not authorize later calls. Every protected RPC/RLS policy re-evaluates the current database state.

### 7.1 App behavior

| App | Context | Behavior |
|---|---|---|
| Customer | Active Customer | Enter app |
| Customer | Restaurant or Admin | Sign out; show correct portal link |
| Restaurant | Active Restaurant + active restaurant | Enter panel |
| Restaurant | Pending Restaurant | Show approval/onboarding screen only |
| Restaurant | Customer or Admin | Sign out; show wrong-portal message |
| Admin | Pending Admin requiring MFA | Allow MFA onboarding routes only |
| Admin | Active Admin with MFA session | Enter Admin app |
| Admin | Active Admin without MFA session | Require MFA sign-in; no business data |
| Admin | Customer or Restaurant | Sign out; show wrong-portal message |
| Any | Suspended | Deny normal operations; show support/status screen |
| Any | Revoked | Sign out and deny access |
| Any | Configuration error | Fail closed; log correlation ID; show support screen |
| Any | Network/backend failure | Retry/offline UI; never describe account as suspended |

Do not transfer authentication tokens through links between applications.

---

## 8. Account Lifecycle

### 8.1 Customer self-registration

1. Firebase authenticates or creates the identity.
2. A caller-bound `bootstrap_my_customer_account()` RPC reads UID/email from the verified token.
3. The RPC rejects the operation if:
   - the UID already maps to another account;
   - a Restaurant/Admin invitation reserves the verified email;
   - legacy authorization data already identifies the profile as Restaurant or Admin;
   - identity data is inconsistent.
4. In one Supabase transaction, create/map the profile and create `account_access(account_type=customer)`.
5. The caller cannot submit an account type.

The existing product decision determines whether Customer activation also requires verified email; this architecture does not silently add that policy.

### 8.2 Restaurant onboarding

1. Admin creates the restaurant if needed.
2. Admin creates a Restaurant invitation with exactly one restaurant and role.
3. The invitee authenticates with the invited, verified email.
4. A caller-bound acceptance RPC locks the invite and creates/maps:
   - profile;
   - one pending Restaurant `account_access` row containing the invited restaurant ID and role.
5. Admin reviews and activates the Restaurant account.
6. The user signs in to Restaurant App and receives active Restaurant context.

No public operation can assign Restaurant type, restaurant ID, owner role, or manager role.

### 8.3 Admin onboarding and MFA

Enable the Firebase MFA capability for the environment, but enforce the requirement specifically for Admin accounts in Supabase and the Admin app. Do not accidentally impose mandatory MFA on Customer and Restaurant identities merely because the provider setting is project-wide. TOTP is the only approved v1 Admin factor; SMS is not a v1 recovery shortcut.

1. A super-admin creates an Admin invitation and assigns `admin` or `super_admin`.
2. The invitee authenticates with the invited, verified email.
3. Invitation acceptance creates one pending Admin account row containing the assigned Admin role.
4. The first password-authenticated session can access only MFA enrollment and logout.
5. The Admin enrolls TOTP.
6. A narrow trusted Firebase Function verifies the enrolled factor through the Firebase Admin SDK and records `admin_mfa_enrolled_at` while keeping the account pending with `admin_mfa_sign_in_required`. It binds the action to the verified Firebase subject, is idempotent, and cannot activate or assign an Admin role.
7. End the initial session and require a complete MFA sign-in.
8. `complete_my_admin_onboarding()` verifies from the current Firebase ID token:
   - expected issuer/audience;
   - verified email;
   - second-factor sign-in evidence.
9. The RPC activates the account and records an audit event.

Every normal Admin RPC requires active Admin database state and current-session MFA evidence. High-impact actions additionally require recent authentication. Use five minutes as the initial recent-auth window because the current privileged Firebase flow already applies that window; change it only through a documented security decision.

Examples of high-impact actions:

- Creating or changing Admin roles
- Suspending/restoring accounts or restaurants
- Changing restaurant ownership
- Viewing/exporting unusually broad PII
- Changing runtime/release policy
- Executing destructive maintenance controls

Before production MFA enforcement:

- Create at least two recoverable super-admin identities.
- Document factor-loss recovery and identity verification.
- Audit all recovery/factor-removal operations.
- Test Identity Platform/MFA in a non-production Firebase project.

Factor-loss recovery requires approval by a different MFA-ready super-admin after a callback to a pre-registered contact and a live identity check. Record the verifier, approval, and support-safe evidence references without storing raw identity documents. The app owner authorizes a separately documented and audited emergency path only when no MFA-ready super-admin is available. Every reset requires TOTP re-enrollment and a new MFA sign-in; it does not directly activate or grant an Admin role. See the [Phase 0 decision record](phase-0-architecture-decisions.md) for the approved procedure and release gate.

### 8.4 Suspension and revocation

Global account suspension:

1. Set `account_access.status = suspended` first.
2. Current database requests fail immediately.
3. Revoke Firebase refresh tokens/sessions.
4. Disconnect application subscriptions where possible and force token/channel refresh.
5. Revoke or disable owned push tokens as appropriate.
6. Audit actor, target, reason, and operation ID.

For a Restaurant identity, this `account_access.status = suspended` transition is also the Restaurant-account suspension. A separate Restaurant-account status table is unnecessary because the identity has no Customer/Admin access. This remains distinct from suspending the restaurant entity itself.

Restaurant entity suspension:

1. Set `restaurants.lifecycle_status = suspended`.
2. Reject new Customer orders.
3. Deny normal Restaurant mutations and show a restricted status/support view.
4. Preserve Admin support access.
5. Keep the five-minute server deadline for pending orders. Admin reviews each already-open order, cancels it with a reason or marks an already-dispatched order delivered only after verifying delivery. Notify the Customer and audit each resolution. Restaurant staff cannot mutate orders while the restaurant is suspended.
6. Audit the transition.

Revocation is stronger than suspension and is normally terminal. Never default a revoked or inconsistent identity to Customer access.

---

## 9. Authorization Functions

Use two kinds of helpers.

Boolean predicates for RLS:

- `private.is_active_customer()`
- `private.is_active_restaurant_account()`
- `private.can_access_restaurant(target_restaurant_id)`
- `private.is_active_admin()`
- `private.has_admin_role(required_role)`
- `private.current_restaurant_id()`
- `private.is_restaurant_operational(target_restaurant_id)`

Exception-raising guards for RPCs:

- `private.require_active_customer()`
- `private.require_active_restaurant()`
- `private.require_restaurant_owner()`
- `private.require_active_admin(required_role default 'admin')`
- `private.require_admin_mfa()`
- `private.require_recent_admin_auth(max_age interval)`

All helpers must:

- derive the profile from the verified token subject;
- accept only the configured Firebase issuer/audience in v1; remove the current UUID-shaped Supabase Auth subject fallback unless a later identity-provider ADR restores it;
- consult `account_access` on every sensitive statement;
- ignore Firebase `platform_role` for business authorization;
- use fixed empty `search_path` where security-definer;
- be owned by the existing non-bypass API owner;
- have execution revoked from `public`/`anon` unless explicitly required;
- expose only the minimum execute grants;
- fail closed on a missing/inconsistent canonical row or referenced restaurant record.

### 9.1 Existing Admin migration requirement

The current `private.has_platform_role()`, `private.restaurant_members`, `private.user_roles`, and mobile Admin authorization participate in legacy access decisions. Revision 4 requires an additive migration path that:

1. Introduces database-only account/Admin helpers.
2. Updates Customer, Restaurant, Admin, Realtime, notification, and worker paths to read `account_access`.
3. Updates the new Admin frontend to ignore business-role claims.
4. Verifies parity with hosted Firebase ID tokens.
5. Removes old claim-dependent helpers and client logic only after cutover.
6. Retires the legacy membership/role tables as authorities, optionally leaving temporary read-only compatibility views derived from `account_access`.

Stale legacy role claims may be logged for reconciliation but must neither grant nor deny business access.

### 9.2 Versioned access-management RPCs

The exact signatures belong in the implementation specification, but the public surface should be narrow and versioned:

- `bootstrap_my_customer_account_v1()` — caller can create only a Customer classification
- `accept_my_account_invitation_v1(token)` — caller-bound, hashed-token validation
- `get_my_access_context_v1()` — read-only routing/onboarding context
- `complete_my_admin_onboarding_v1()` — requires verified email and MFA-authenticated token
- `admin_invite_restaurant_account_v1(...)`
- `admin_invite_admin_account_v1(...)`
- `admin_set_account_status_v1(...)`
- `admin_set_restaurant_status_v1(...)`
- `admin_reassign_restaurant_account_v1(...)` — pending/suspended accounts only
- `admin_change_admin_role_v1(...)` — recent-MFA super-admin only
- `admin_record_mfa_recovery_v1(...)` — audited break-glass flow

Never expose a generic client-callable “set account type/role” function.

### 9.3 Current-code authorization inventory

Before enforcement, audit and migrate every current use of the older identity helpers:

- `private.require_profile()` proves only that an identity maps to a profile; Customer-only address, favorite, quote, order, reminder, cancellation, review, and notification operations must add the active-Customer guard.
- Replace the generic client-callable `ensure_my_profile()` path with Customer-only bootstrap plus the trusted Restaurant/Admin invitation flow; an arbitrary authenticated identity must never create an unclassified profile that later defaults to Customer.
- Restaurant order/menu/details/review operations must read the scalar restaurant scope from `account_access` or verify every supplied target against it.
- Restaurant users must not be able to change the Admin-controlled restaurant lifecycle through the existing `is_active` field.
- Admin operations must use active Admin + current MFA, with recent authentication for high-impact actions.
- Realtime topic resolution and authorization must move from legacy membership/role tables to `account_access` and restaurant lifecycle state.
- Notification recipient materialization, account deletion/anonymization, import scripts, and background jobs must use the same canonical classification.
- The current Supabase-Auth-subject fallback in `private.current_profile_id()` is removed for v1 because Firebase is the only approved identity provider.

---

## 10. Authorization Matrix

The implementation specification must turn this summary into a CRUD/capability matrix for every resource.

| Resource/action | Anonymous | Customer | Restaurant | Admin/system |
|---|---:|---:|---:|---:|
| Active public restaurant/menu projection | Read | Read | Read | Read/manage |
| Customer profile/address/favorites | No | Own only | No | Narrow support RPC only |
| Create order | No | Active Customer only | No | No normal UI path |
| Customer order history | No | Own only | No | Narrow support RPC |
| Active Restaurant orders | No | Own order only | Own restaurant only | Support scope |
| Menu/details mutation | No | No | Own restaurant + capability | Manage/support capability |
| Restaurant activation/suspension | No | No | No | Authorized Admin only |
| Account type/status mutation | No | No | No | Authorized Admin only |
| Admin role mutation | No | No | No | Recent-MFA super-admin only |
| Audit log | No | No | No | Role-scoped Admin read |
| Operational incidents | No | No | Own status if required | Manage/resolve |

Coverage must include:

- Tables and views
- Column-level exposure and mutation
- RPC/database functions
- Storage objects and buckets
- Realtime Broadcast/Presence/Postgres Changes
- Firebase Functions and server routes
- Edge Functions/background jobs
- Service-role/secret-key code paths
- Notification registration and delivery

Public catalog access means access to a deliberately safe projection, not unrestricted access to the underlying restaurant/menu tables.

Admin support access should use narrow views/RPCs and DTOs. Admin identity does not become a Customer or Restaurant identity merely because an Admin can perform a support operation.

---

## 11. Application Boundaries

### 11.1 Customer App

Contains:

- Customer authentication/onboarding
- Home, search, catalog, restaurant/menu browsing
- Cart and checkout
- Addresses/favorites
- Customer orders/reviews
- Customer profile/settings
- Minimum-version/update gate

Does not contain:

- Restaurant panel routes/components
- Admin routes/components
- Restaurant/Admin side effects or push registration
- Firebase application-data fallback

### 11.2 Restaurant App

The Restaurant Expo app is one separate product across web, iOS, and Android, not a route group inside the Customer app. The initial production release targets desktop web/PWA on staffed Windows and Mac desktop/laptop devices with current Chrome and Edge. A connected order screen is required whenever a pilot restaurant accepts orders. Tablet and native builds have separate approval and qualification gates. Its planned UI has three operational modes:

| Surface | Primary experience |
|---|---|
| Desktop web | Detailed menu forms, modifiers, category ordering, tables, bulk availability changes, reporting/settings |
| Large-screen tablet | Always-on live orders, prominent accept/reject controls, preparation status, connection/alert health |
| Phone | Push alerts, active-order monitoring, quick responses, sold-out/open-close switches, focused edits |

Share domain logic, validation, API access, and order state handling. Use web/native-specific components or layouts where controls genuinely differ; a phone screen stretched onto desktop is not the target. Support accessible move-up/down controls wherever drag-and-drop is offered. The separately qualified tablet surface must support the full order workflow before tablet use is approved; it is not an initial desktop-release gate.

Initial web/PWA routes:

```text
/login
/pending
/suspended
/dashboard
/orders
/orders/detail?orderId=<id>
/history
/menu
/restaurant
/reviews
/settings
/security
```

The static Restaurant web deployment uses a fixed order-detail page with the order ID in the query string, so a notification click or direct browser refresh can load the page before authenticated data is fetched. Order access is still checked by the guarded Supabase RPC.

Build order:

1. Login and access context
2. Pending/suspended UX
3. Authenticated shell
4. Live active orders and order detail
5. Secure/idempotent order transitions
6. Order history
7. Menu/category management
8. Restaurant details and accepting-orders state
9. Reviews
10. Alert/security settings

Menu-management scope:

- Create/edit foods, images, descriptions, base prices, and ingredients.
- Define removable ingredients (for example, “no onion”), sizes or price variants, required/optional modifier groups, single- or multiple-choice selections, and paid extras.
- Validate minimum/maximum selection counts, permitted combinations, and price changes on the server; client forms are not the pricing authority.
- Reorder categories and foods within a category. Existing `categories.sort_order` and `menu_items.sort_order` provide a starting field, but writes need a scoped, transactional reorder contract.
- Toggle one food active/inactive, or select multiple foods for one bulk availability action. Updates must be atomic and reject any ID outside the actor's restaurant.
- Preserve the exact selected options and server-computed prices in the order snapshot, so later menu edits do not rewrite existing orders.

The current `menu_items.customizations` array supports a simpler flat option model. Required groups, selection limits, removable ingredients, and size pricing need a versioned menu-definition design and migration; do not assume the current JSON shape already enforces those rules. Category/food reorder and bulk availability should use narrow, versioned RPCs with restaurant ownership checks and transaction-level validation. Define owner/manager permissions before granting these operations.

The app has no Firestore application-data repositories and fails closed when Supabase is unavailable.

### 11.3 Admin App

Initial production routes:

```text
/login
/onboarding/mfa
/suspended
/dashboard
/restaurants
/restaurants/[restaurantId]
/accounts
/orders
/incidents
/audit
/security
```

Required initial capabilities:

- Restaurant creation/onboarding
- Restaurant activation/suspension
- Restaurant account invitation/activation/suspension
- Account state investigation
- Order monitoring/support
- Repeated non-response incidents
- Necessary audit visibility
- Admin MFA onboarding/recovery support

Future system controls, exports, analytics, and broad role-management UI can follow after the production operational minimum is safe.

Both web deployments require strict CSP/security headers, output encoding, safe error reporting, and no caching of authenticated data in shared server/CDN caches. The Restaurant PWA's service worker must also exclude authenticated application data from its cache.

---

## 12. Five-Minute Order Deadline

The existing schema already stores `approval_deadline_at`, order creation sets it from database time, and a backend expiry job cancels expired pending orders. Preserve that direction and harden it.

Required behavior:

1. Only an active Customer can create an order.
2. The database verifies the target restaurant is active and accepting orders.
3. The database sets `approval_deadline_at = statement_timestamp() + interval '5 minutes'`.
4. Customer UI displays a countdown derived from the server deadline.
5. The expiry job atomically changes only `pending` orders to `canceled` with reason `approval_deadline_expired`.
6. A Restaurant acceptance transition locks the order and checks the deadline itself.
7. If the deadline has passed, the same transaction cancels/rejects acceptance instead of allowing a late acceptance before the scheduler runs.
8. Cancellation is idempotent and produces one history/audit event.

Monitor:

- Age of the oldest overdue pending order
- Expiry-job failures and last successful run
- Number of expired orders processed per run
- Backlog exceeding the batch limit
- Deadline-to-cancellation delay

The current once-per-minute batch job and bounded batch size must be load-tested against launch volume. Increase frequency/capacity or drain repeatedly if the documented cancellation-delay target cannot be met.

---

## 13. Restaurant Order Delivery and Recovery

The target is immediate visibility whenever the Restaurant app is connected, with durable recovery rather than an intentionally relaxed delivery window.

### 13.1 Delivery pattern

1. Restaurant App performs a secured initial fetch of active orders.
2. It subscribes to a private restaurant-specific Realtime topic.
3. Realtime payloads contain only invalidation metadata such as order ID/version, not Customer PII.
4. On invalidation, the app refetches through an authorized query/RPC.
5. The app reconciles on reconnect, network restoration, web tab visibility/focus or native foreground return, and token refresh.
6. A bounded polling fallback runs while the active-order dashboard is open and online.
7. Web Push and native push are secondary wake-up signals, not the sole source of truth.

The current invalidation-then-refetch design is a useful foundation and should be reused for the web client.

### 13.2 Deduplication and concurrency

- Key client updates by order ID plus server version/`updated_at`.
- Treat Realtime, polling, focus refresh, and push as duplicate triggers for the same reconciliation.
- Never process an order solely from an event payload.
- Lock the order during transitions.
- Validate current state, actor, restaurant, lifecycle status, and deadline inside the transition RPC.
- Return the authoritative resulting state.
- Optionally accept an expected version to detect two dashboards racing.

### 13.3 Visibility acknowledgement

Add a caller-bound, idempotent acknowledgement such as `acknowledge_restaurant_order_seen(order_id)` if operational measurement needs to distinguish:

- Notification dispatched
- Order visible in a connected Restaurant app
- Restaurant responded by accepting/rejecting

The acknowledgement never changes order acceptance state and cannot extend the five-minute deadline.

### 13.4 Realtime revocation

Private Broadcast authorization can be cached for the life of a connection. Therefore:

- Authorization policies include active account, restaurant assignment, and tenant checks at join.
- Clients refresh auth/reconcile on a short documented interval and on lifecycle events.
- Suspension attempts to disconnect the known Restaurant client/session.
- Broadcasts carry no sensitive order data.
- Every resulting fetch and mutation rechecks live database authorization.

This ensures a stale channel can reveal at most a privacy-safe invalidation, not order details.

### 13.5 Web/PWA and native notification delivery

The current Customer notification implementation does **not** provide closed-page Web Push: remote token registration is disabled on web, and its browser `Notification` call only works while page JavaScript is running. The existing Supabase notification worker currently sends Expo push tokens only. Extend the delivery architecture deliberately; reusing its current web branch is insufficient.

- While the Restaurant app is open, use Realtime plus a prominent in-app visual/sound alert, with sound behavior tested per supported browser and device.
- For a backgrounded or closed web/PWA app, register a dedicated service worker, request Web Push permission through a user action, create a browser push subscription, and send through a web-push-capable worker. The service worker should display only a generic new-order alert and deep-link into an authenticated order screen.
- For later iOS/Android native builds, register separate native Expo/APNs/FCM tokens and deliver through the appropriate native provider. Do not assume `expo-notifications` implements Web Push.
- Extend the private notification-subscription registry to distinguish web subscriptions from native tokens, bind every subscription to the authenticated Restaurant identity and its one restaurant, and enforce active-account/active-restaurant checks at registration and delivery. No browser or native client may choose another restaurant ID.
- Use a durable, idempotent order notification event/outbox so retries or multiple devices cannot create duplicate order transitions; push payloads are minimal wake-up signals, never a source of Customer PII or final order state.
- Logout and account/restaurant suspension deactivate affected server-side subscriptions; reconnect/permission changes reconcile local and server state. Failed or invalid push endpoints are retired by the worker.
- Web Push is unavailable when permission is denied or the browser/device does not support it. On iPhone/iPad, the web app must be added to the Home Screen before Web Push permission can be requested; that device class has a later qualification gate. During the desktop-only pilot, validate the approved Windows/Mac Chrome/Edge setups and require a staffed, connected order screen whenever orders are accepted. Closed-page push cannot replace that screen.

The service worker may cache the app shell/static assets but must never cache authenticated API responses, access context, order details, Customer information, or token-bearing requests. It must not embed Supabase service-role credentials or perform privileged mutations. Every notification click reopens the app and fetches the current order through Supabase authorization. Separate Firebase app registrations and push providers do not change the canonical `account_access` authorization rules.

---

## 14. Repeated Non-Response Escalation

The individual-order timer and Restaurant-health incident are separate mechanisms.

An order counts as ignored only when it reaches backend cancellation with the specific reason `approval_deadline_expired`. Customer cancellations, payment failures, Admin cancellations, or system maintenance do not count.

A scheduled detector evaluates a documented rolling policy containing:

- Minimum ignored-order count
- Observation window
- Ignored percentage among eligible orders
- Optional consecutive-failure threshold
- Minimum eligible-order volume
- Incident cool-down/deduplication behavior
- Resolution criteria

The policy values must be approved from pilot data and stored as audited environment configuration, not scattered constants.

When the threshold is met:

1. Create or update one open Restaurant operational incident.
2. Notify the Admin application/monitoring channel.
3. Show supporting order IDs/timestamps through a narrow Admin RPC.
4. Admin contacts the restaurant and records acknowledgement/resolution.

Do not automatically suspend the restaurant for the first incident in v1 unless a later business decision explicitly authorizes automatic suspension.

---

## 15. Firestore Data Cutover

Final responsibility:

```text
Firebase Auth -> authentication only
Supabase      -> profiles, access, catalog, orders, reviews, notifications, authorization
```

Rules:

- `apps/restaurant/` and `apps/admin-web/` contain no Firestore application-data repositories on any platform.
- If Supabase fails, they show an unavailable/retry state.
- Customer production configuration must not silently resolve a data domain to Firebase.
- During migration, backend selection is explicit and observable; failure is not a reason to switch databases.
- Existing Firestore data is migrated/reconciled deliberately.
- Any retained Firestore path receives equivalent authorization until disabled.
- Firestore rules are closed for retired application data after cutover verification.
- Firebase Functions remaining for Auth, messaging, or migration must validate identity and use narrowly scoped Supabase operations.

The current checked-in Customer defaults select Firebase whenever Supabase is disabled or a domain flag is absent. Production cutover must replace that fail-open-to-Firebase behavior with validated, fail-closed environment configuration before strict account enforcement.

---

## 16. Minimum Version and Forced Update

There are no existing production Customer users or builds to upgrade. The mechanism is retained for the first production release and future incompatible releases. Phase 1 proves only the backend contract with simulated builds in the existing non-production development project. Customer-facing update UI, store URLs, staging/production minimum build numbers, and support messaging are prepared with the first production Customer release.

### 16.1 Bootstrap flow

Before mounting normal Customer navigation:

1. Read sanitized runtime/release status.
2. Send application ID, platform, numeric build, and API contract version.
3. If below minimum, show a non-dismissible update screen with the correct store link.
4. If the environment is in maintenance, show maintenance UI.
5. Treat network failure as retryable connectivity failure, not as permission to bypass the gate.

### 16.2 Security limitation

Version headers/parameters can be forged. The forced-update gate prevents incompatible UI use; it does not authorize data. Backend policies must reject cross-portal access regardless of app version.

Old RPCs or policies that would bypass the new account model must be revoked after the supported replacement is released. Do not retain unsafe behavior for old builds.

### 16.3 Expo delivery

- Use EAS Update for compatible JavaScript-only changes where appropriate.
- Define an Expo `runtimeVersion` policy before relying on OTA delivery.
- Native-incompatible changes require a new App Store/Play Store build.
- For later production upgrades, release and verify the compatible build before raising the minimum supported build.

---

## 17. Database and Deployment Ownership

### 17.1 Environments

**Environment decision (2026-09-12):** Development and Staging intentionally share the current non-production Firebase project and its Auth user pool. The same test Firebase UID may be used against either environment; separate Firebase app registrations do not create separate Auth pools. Staging is therefore not identity-isolated from Development. Development and Staging retain separate Supabase projects, database authorization, RLS, secrets, and deployment controls. This exception applies only to non-production Firebase identity and does not block current Development or Staging work.

Before the first production release, create a new, clean Firebase Production project and a new, clean Supabase Production project. Never convert or repurpose the shared non-production project. Apply approved schema, migrations, RLS, RPCs, functions, infrastructure, and environment configuration, but do not copy non-production Firebase users, Customer/Restaurant/Admin accounts, orders, addresses, reviews, push subscriptions, MFA enrollments, incidents, or other test records. Create any required initial production identities and data deliberately through approved production-safe provisioning. Production clients must use only Production Firebase; Production Supabase must validate only its issuer and audience. Verify non-production tokens are rejected by Production and Production tokens are rejected by Development/Staging where isolation requires it. Complete the production environment-isolation and authorization suite before launch. Production project creation is a release prerequisite, not a Phase 3 or Phase 4 prerequisite.

Approved production domains, subject to DNS, HTTPS, and hosting validation before deployment:

| App | Production domain |
|---|---|
| Customer web | `app.hungrie.app` |
| Restaurant | `restaurant.hungrie.app` |
| Admin | `admin.hungrie.app` |

Preview deployments must never connect to production Auth or data.

### 17.2 Central migration pipeline

Only the database release pipeline may apply `supabase/migrations`.

Frontend pipelines may:

- Validate generated types
- Run contract tests
- Verify expected schema/API version
- Deploy the frontend

Frontend pipelines may not create/alter tables, policies, functions, or grants.

Migration order:

1. Expand schema additively.
2. Deploy compatible backend functions.
3. Backfill and verify.
4. Deploy clients.
5. Enforce after adoption gates.
6. Remove deprecated contracts last.

Use one root lockfile and one generated `database-types` source after the workspace migration.

---

## 18. Migration and Release Sequence

No access-control migration begins until the architecture checkpoint and conflict inventory are approved. The architecture and [Phase 0 decision record](phase-0-architecture-decisions.md) were accepted by the app owner on 2026-09-12. Phase 1 and the development-only Phase 2 implementation were separately accepted on 2026-09-12. The app owner approved the development conflict inventory for additive Phase 2 work, then authorized and completed manual cleanup of its three conflict cases before Phase 3. Phase 2 performed no account-type backfill or enforcement.

### Phase 0 — Architecture checkpoint

- Record approval of this Revision 4 with the desktop-first Restaurant amendment.
- Finalize owner/manager permissions.
- Finalize Admin role capabilities.
- Finalize MFA factor/recovery procedure.
- Finalize Restaurant suspended-mode handling.
- Record domains and environment owners.
- Record supported Restaurant browsers/devices, projected peak order rate, release owner, and incident commander.
- Record the initial desktop web/PWA pilot devices, the later tablet qualification gate, and the staffed connected-order-device requirement.

### Phase 1 — Tooling and operational foundation

- Resolve React/type overrides.
- Scaffold the separate Restaurant Expo web proof app with a pinned SDK and validate its service-worker/HTTPS hosting path.
- Scaffold the pinned Admin Next.js proof app.
- Prove both Expo applications, Admin Next.js, shared-package builds, independent EAS projects, and CI together.
- Establish the one root-owned migration pipeline.
- Extend monitoring, backup/restore, runtime control, and release-policy tooling.
- Prove in the existing non-production development project that the release-policy contract marks simulated obsolete Customer iOS/Android build numbers as requiring an update; preserve its prior migration progress and do not change Customer startup UX or staging/production policy values.
- Do not add production features yet.

### Phase 2 — Expand development schema without enforcement

- Add account/status/onboarding types.
- Add `account_access`, invitations, restaurant lifecycle, and incident structures; extend the minimal release-policy structure established in Phase 1 if the final contract requires it.
- Add new database-only authorization helpers and access-context RPC.
- Add versioned guarded RPCs while keeping old clients functional temporarily.
- Add no permissive fallback.
- Pass local reset/lint, pgTAP, hosted Firebase-token, Realtime, Storage, and service-path tests.

### Phase 3 — Dry-run classification, backfill, and shadow comparison

Classify every current profile using fresh environment data:

- Admin role -> proposed Admin
- Restaurant membership -> proposed Restaurant
- Neither -> proposed Customer, subject to review

Stop for manual resolution when a profile has:

- Both Admin role and Restaurant membership
- Customer orders/addresses plus staff identity that must become exclusive
- Missing Firebase/profile mapping
- Orphaned restaurant membership
- More than one membership
- Courier legacy role
- Duplicate/ambiguous normalized email

Produce counts, conflict records, and a reversible report. Apply the idempotent backfill in staging, rerun it to prove it is a no-op, and compare old/new authorization decisions in shadow mode. Do not silently choose a type for conflicts.

Exit gate:

- Every active profile is classified or deliberately quarantined.
- No unresolved Admin/Restaurant overlap exists.
- Every Restaurant classification has exactly one restaurant.
- All row-shape/lifecycle invariants pass.
- Shadow decisions have no unexplained differences.

### Phase 4 — Build and qualify the Admin production minimum

- Build Admin login, MFA onboarding, Restaurant onboarding, account/restaurant suspension, order monitoring, incident view, and audit view.
- Replace Firebase business-role authorization with Supabase checks.
- Complete Admin security, recent-auth, recovery, and cache-isolation tests in staging.
- Establish at least two recovery-capable super-admins and test the separately controlled owner-authorized break-glass procedure.

The Admin application must be production-ready before Restaurant production onboarding, but it is not promoted blindly before full staging qualification.

### Phase 5 — Build and qualify the Restaurant vertical slice

- Build login -> access context -> active orders -> secure transition.
- Add initial fetch, private Realtime invalidation, refetch, reconnect reconciliation, and polling fallback.
- Build the web/PWA service worker, Web Push registration/delivery, and foreground alerts separately from future native push.
- Qualify desktop menu forms, bulk availability/reorder actions, and the desktop live-order layout. Defer the dedicated tablet layout to a separately approved qualification gate.
- Pilot with controlled Restaurant identities in staging on every supported browser/device.
- Test PWA installation, push permission denial/revocation, closed/backgrounded pages, sleep, network loss, duplicates, deadline races, suspension, and notification failure.

Tablet support and native iOS/Android builds follow as separately approved Restaurant releases after the desktop web pilot. They reuse the same account model, RPCs, order events, and notification outbox, but need their own layout, order-workflow, notification, and device testing. Native builds also need native Firebase/Auth/Expo push registration. A successful desktop web build does not qualify tablet or native behavior.

### Phase 6 — Build the secure Customer first release

- Move every application-data repository to Supabase.
- Add exclusive access-context routing and minimum-version UI.
- Remove automatic data fallback behavior.
- Prove a complete Customer order flow against the new guarded contracts.
- Verify minimum-version/update handling on physical iOS and Android devices before the first production release, using staging policy values.

### Phase 7 — Full staging qualification

Run all three applications together against the staging backend.

Exit gate:

- Zero cross-portal/cross-tenant access.
- Zero permanently missed orders and duplicate transitions.
- Restaurant desktop web/PWA closed-page notification and connected desktop order-workflow tests pass on approved Windows and Mac pilot devices with current Chrome and Edge; a staffed connected order screen is available whenever orders are accepted.
- Deadline race, expiry, non-response incident, MFA, suspension, recovery, and simulated minimum-version tests pass.
- Reliability/load tests pass at the documented multiple of forecast peak traffic.
- A named owner approves the measured soak window and minimum successful order volume.

### Phase 8 — Clean production expansion and isolation checks

- Create the new Firebase and Supabase Production projects; verify their clean Auth and application-data state, then take/verify a production backup and restore point.
- Apply approved additive migrations and environment configuration through the central pipeline while enforcement remains off. Never seed Production from non-production users or application records.
- Run the classification inventory against the clean Production project. Its legacy backfill should insert zero rows; any unexpected legacy identity or data requires investigation before release.
- Verify cross-environment token rejection in both directions, counts, cron, workers, private Realtime policies, notification delivery, and health checks.
- Require zero unexplained shadow-authorization differences for deliberately provisioned Production identities.

### Phase 9 — Deploy Admin, then Restaurant

- Deploy and validate Admin first.
- Onboard/support the initial production Restaurant accounts through Admin.
- Deploy the Restaurant Expo web/PWA build to controlled canaries.
- Require every Restaurant to complete a connectivity, notification, and order-response readiness test.
- Validate the dedicated desktop order layout on approved Windows and Mac devices with current Chrome and Edge. Require a staffed connected order screen whenever the restaurant accepts orders; closed-page push is a secondary wake-up signal.
- Complete the owner-approved canary soak with no critical incident.

### Phase 10 — Release the first production Customer build

- Publish the first production-ready Customer build before changing enforcement.
- Verify clean installation and first-release behavior on every supported platform; no existing production install must be upgraded.
- Confirm store URLs, production minimums, and future-update support messaging.
- Complete a live smoke order while Admin and Restaurant are already operational.

### Phase 11 — Enforcement cutover

Use a scheduled ordering window:

1. Freeze unrelated deployments.
2. Temporarily disable new Customer checkout through the server-owned capability switch.
3. Verify Production has no legacy Firestore application writes or nonterminal legacy orders. Do not import non-production test orders.
4. Activate account-type guards across RLS, RPCs, Storage, Realtime, functions, and service APIs.
5. Set minimum Customer iOS/Android builds no higher than the verified first production build; do not use the version gate as authorization.
6. Re-enable Supabase Customer checkout.
7. Complete a Customer -> Restaurant -> Customer live order smoke test.
8. Monitor continuously through the approved high-frequency window.

Confirm wrong-portal identities fail through direct API calls, not only UI. If cutover fails, disable checkout or enter maintenance and forward-fix; do not restore unsafe authorization or Firestore fallback.

### Phase 12 — Soak and remove legacy surfaces

- Monitor authorization errors, lockouts, deadline lag, Realtime health, notification delivery, and incidents.
- Remove Customer-app Restaurant/Admin routes and side effects.
- Remove Firestore data repositories/fallback selection.
- Remove claim-dependent Admin checks and obsolete courier paths.
- Retire legacy membership/role write tables after parity verification.
- Remove deprecated RPCs only after telemetry shows no supported caller.
- Require the approved clean soak period, meaningful production order volume, zero Firestore application writes, and zero successful legacy RPC calls.

---

## 19. Test Strategy and Release Gates

### 19.1 Database tests

- Exactly one account type per profile
- Exactly one restaurant per Restaurant profile
- Customer row cannot contain Restaurant/Admin fields
- Restaurant row cannot contain Admin fields
- Admin row cannot contain Restaurant fields
- Pending/suspended/revoked denial
- Restaurant lifecycle suspension
- Owner/manager capability matrix
- Admin/super-admin capability matrix
- Last-super-admin protection
- Cross-restaurant ID tampering
- Customer ownership isolation
- Safe public projections
- Security-definer ownership/search-path/grants

### 19.2 Hosted identity bridge tests

- Valid production-project Firebase token
- Wrong issuer/audience
- Missing `role: authenticated` transport claim
- Stale/missing `platform_role` does not affect business authorization
- Unverified Admin email
- Admin without MFA evidence
- Admin with MFA evidence
- Stale `auth_time` for sensitive action
- Revoked/suspended database account with otherwise valid token

### 19.3 Application E2E tests

- Every identity in the correct app
- Every identity in both wrong apps
- Pending onboarding routes only
- Suspension while app is open
- Admin MFA enrollment and next sign-in
- Restaurant reconnect and missed-event recovery
- Restaurant PWA installation, service-worker update/scope, foreground alert, background/closed-page Web Push, permission denial, and browser/device compatibility
- Restaurant tablet order workflow before tablet release, and native iOS/Android push registration, receipt/tap handling, and foreground/background recovery before native release
- Restaurant desktop menu modifiers, server-priced selections, reorder, and atomic bulk availability; repeat layout-specific order and catalog checks before later tablet/phone releases
- Duplicate Realtime/poll/push invalidations
- Two Restaurant tabs racing an order transition
- Five-minute deadline race
- Forced Customer update
- Supabase outage never falls back to Firestore
- Authenticated Next.js responses are not publicly cached
- Restaurant service worker caches no authenticated response, order/customer data, access context, or token-bearing request

### 19.4 Migration/release gates

- Zero cross-tenant or cross-portal access in the matrix
- Zero unexplained backfill conflicts
- First production-ready Customer build available and its minimum-version contract verified before strict enforcement
- Admin and Restaurant production apps operational before strict Customer enforcement
- Database backup and restore drill complete
- Named go/no-go and rollback owners
- Documented monitoring window
- Measured and approved order visibility/recovery targets
- Pilot Restaurant desktop web/PWA notification and staffed-device readiness pass on current Chrome and Edge on approved Windows and Mac devices
- Measured and approved deadline-job lag
- Approved repeated-non-response thresholds

---

## 20. Monitoring

Track separately by application and environment:

- Authentication and access-context failures
- Wrong-portal sign-in attempts
- Pending/suspended/revoked denials
- Configuration-error correlation IDs
- Admin MFA/recent-auth failures
- Cross-tenant authorization denials
- Realtime join/reconnect/lag
- Created-to-visible Restaurant order latency
- Polling recovery count
- Duplicate invalidation count
- Oldest overdue pending order
- Auto-cancel job success/backlog
- Notification delivery/dead letters
- Web Push subscription health, permission-denied rates, and native push delivery separately by provider/platform
- Repeated-non-response incidents
- Minimum-version blocks after the first release; no existing-user update adoption metric applies before launch
- Firestore access after cutover, which should reach zero

Never record ID tokens, invite tokens, raw addresses, payment details, or unnecessary Customer PII in logs.

---

## 21. Remaining Implementation Decisions

These choices remain, but none may reopen the locked identity rules:

- Reviewed Restaurant Expo SDK/React and Admin Next.js/React versions, web hosting, HTTPS, and service-worker scope
- Minimum iOS/Android versions and native release timing — decide before native development/release qualification
- Required tablet screen sizes and tablet release timing — decide before the separately approved tablet qualification gate
- Printer/POS integration timing
- Web Push permission/onboarding UX — decide before Restaurant pilot qualification; the staffed connected screen requirement is already approved
- Realtime polling/reconciliation intervals based on staging load tests
- Created-to-visible order latency acceptance target
- Auto-cancel scheduler lag target/capacity
- Repeated-non-response thresholds and resolution window
- Minimum supported Customer build numbers and store URLs
- DNS, HTTPS, hosting, and environment configuration for the approved production domains — validate before the relevant deployment

---

## 22. Explicit Non-Goals for v1

- Customer + Restaurant access on one identity
- Multi-restaurant Restaurant identities
- Standalone Courier identity/app
- Migrating Firebase Auth to Supabase Auth
- Token transfer or silent SSO between portal domains
- A general-purpose Admin BFF
- Firestore application-data fallback
- Forcing one identical Restaurant UI layout across web, tablet, and phone
- Building every future Admin analytics/system feature before launch

---

## 23. Final Recommendation

Proceed with a Customer Expo app, a separate web-first universal Restaurant Expo app, and a web-only Admin Next.js app. Keep one exclusive `account_access` classification, one Restaurant assignment per Restaurant identity, Firebase Authentication for identity, and Supabase as the sole business-authorization authority.

The first access-control implementation work should be the additive account schema, database-only authorization helpers, conflict-reporting backfill, and tests. It must not begin until the remaining implementation decisions that affect permissions, MFA recovery, Restaurant suspension, and release gates are recorded.

No frontend route guard, Firebase Web App registration, cached access-context response, application version, or custom role claim may substitute for current server/database authorization.

---

## References

- [Supabase Firebase Auth integration](https://supabase.com/docs/guides/auth/third-party/firebase-auth)
- [Firebase decoded ID-token claims](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.decodedidtoken)
- [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa)
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Expo runtime versions and updates](https://docs.expo.dev/eas-update/runtime-versions/)
- [Expo Router universal applications](https://docs.expo.dev/router/introduction/)
- [Firebase background Web Push](https://firebase.google.com/docs/cloud-messaging/web/receive-messages)
- [Web Push for iOS/iPadOS Home Screen apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
