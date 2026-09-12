-- Phase 2: additive account data only. Legacy authorization remains authoritative.
create type public.account_type as enum ('customer', 'restaurant', 'admin');
create type private.account_status as enum ('pending', 'active', 'suspended', 'revoked');
create type private.account_onboarding_step as enum (
  'none', 'restaurant_approval_required',
  'admin_mfa_enrollment_required', 'admin_mfa_sign_in_required'
);
create type private.admin_account_role as enum ('admin', 'super_admin');
create type public.restaurant_lifecycle_status as enum ('pending', 'active', 'suspended', 'closed');
create type private.account_invitation_state as enum ('pending', 'accepted', 'expired', 'revoked');
create type private.operational_incident_state as enum ('open', 'acknowledged', 'resolved');

alter table public.restaurants
  add column lifecycle_status public.restaurant_lifecycle_status,
  add column accepting_orders boolean,
  add column suspended_at timestamptz,
  add column suspended_by_profile_id text references public.profiles(id) on delete set null,
  add column suspension_reason_code text;

-- An inactive legacy restaurant has no inferred approval. Development currently
-- has no inactive rows, but this mapping also keeps later migrations fail-closed.
update public.restaurants set
  lifecycle_status = case when is_active then 'active'::public.restaurant_lifecycle_status
    else 'pending'::public.restaurant_lifecycle_status end,
  accepting_orders = is_active;
alter table public.restaurants
  alter column lifecycle_status set not null,
  alter column lifecycle_status set default 'pending',
  alter column accepting_orders set not null,
  alter column accepting_orders set default false,
  add constraint restaurants_suspension_shape check (
    (lifecycle_status = 'suspended' and suspended_at is not null)
    or (lifecycle_status <> 'suspended' and suspended_at is null
        and suspended_by_profile_id is null and suspension_reason_code is null)
  ),
  add constraint restaurants_acceptance_requires_active check (
    not accepting_orders or lifecycle_status = 'active'
  );

-- Legacy is_active remains the live Customer/Restaurant contract in Phase 2.
-- Preserve its operational meaning for later shadow comparison.
create function private.phase2_sync_legacy_restaurant_active()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_active is distinct from old.is_active then
    new.accepting_orders := new.is_active and new.lifecycle_status = 'active';
  end if;
  return new;
end $$;
create trigger phase2_sync_legacy_restaurant_active
before update of is_active on public.restaurants for each row
execute function private.phase2_sync_legacy_restaurant_active();

create function private.phase2_sync_legacy_restaurant_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.lifecycle_status := case when new.is_active then
    'active'::public.restaurant_lifecycle_status else
    'pending'::public.restaurant_lifecycle_status end;
  new.accepting_orders := new.is_active;
  return new;
end $$;
create trigger phase2_sync_legacy_restaurant_insert
before insert on public.restaurants for each row
execute function private.phase2_sync_legacy_restaurant_insert();

create table private.account_access (
  profile_id text primary key references public.profiles(id) on delete restrict,
  account_type public.account_type not null,
  status private.account_status not null,
  onboarding_step private.account_onboarding_step not null default 'none',
  restaurant_id text references public.restaurants(id) on delete restrict,
  restaurant_role public.restaurant_role,
  admin_role private.admin_account_role,
  admin_mfa_enrolled_at timestamptz,
  status_reason_code text,
  created_by_profile_id text references public.profiles(id) on delete set null,
  authz_version bigint not null default 1 check (authz_version > 0),
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_access_shape check (
    (account_type = 'customer' and restaurant_id is null and restaurant_role is null
      and admin_role is null and admin_mfa_enrolled_at is null
      and onboarding_step = 'none' and status <> 'pending')
    or (account_type = 'restaurant' and restaurant_id is not null
      and restaurant_role is not null and admin_role is null
      and admin_mfa_enrolled_at is null and
      (status <> 'pending' or onboarding_step = 'restaurant_approval_required') and
      onboarding_step in ('none', 'restaurant_approval_required'))
    or (account_type = 'admin' and restaurant_id is null and restaurant_role is null
      and admin_role is not null and
      (status <> 'pending' or onboarding_step in
        ('admin_mfa_enrollment_required', 'admin_mfa_sign_in_required')) and
      onboarding_step in ('none', 'admin_mfa_enrollment_required', 'admin_mfa_sign_in_required'))
  ),
  constraint account_access_active_shape check (
    status <> 'active' or
    (onboarding_step = 'none' and (account_type <> 'admin' or admin_mfa_enrolled_at is not null))
  ),
  constraint account_access_timestamps check (
    (status <> 'active' or activated_at is not null) and
    (status <> 'suspended' or suspended_at is not null) and
    (status <> 'revoked' or revoked_at is not null)
  )
);
create index account_access_restaurant_idx on private.account_access(restaurant_id)
  where account_type = 'restaurant';
create index account_access_active_admin_idx on private.account_access(admin_role)
  where account_type = 'admin' and status = 'active';

create function private.phase2_account_access_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.account_type is distinct from old.account_type then
      raise exception 'Account type is immutable' using errcode = '23514';
    end if;
    if old.status = 'revoked' and new is distinct from old then
      raise exception 'Revoked account is terminal' using errcode = '23514';
    end if;
    if (new.status, new.onboarding_step, new.restaurant_id, new.restaurant_role,
        new.admin_role, new.admin_mfa_enrolled_at) is distinct from
       (old.status, old.onboarding_step, old.restaurant_id, old.restaurant_role,
        old.admin_role, old.admin_mfa_enrolled_at) then
      new.authz_version := old.authz_version + 1;
    else
      new.authz_version := old.authz_version;
    end if;
    new.updated_at := statement_timestamp();
  end if;
  return new;
end $$;
create trigger phase2_account_access_transition
before update on private.account_access for each row
execute function private.phase2_account_access_transition();

create table private.account_email_reservations (
  normalized_email text primary key check (normalized_email = lower(btrim(normalized_email))
    and normalized_email <> ''),
  account_type public.account_type not null,
  firebase_uid text unique,
  profile_id text unique references public.profiles(id) on delete restrict,
  invitation_id uuid unique,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_email_reservation_shape check (
    (account_type = 'customer' and invitation_id is null and profile_id is not null)
    or (account_type in ('restaurant', 'admin') and
      num_nonnulls(invitation_id, profile_id) >= 1)
  )
);

create table private.account_invitations (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null check (normalized_email = lower(btrim(normalized_email))
    and normalized_email <> ''),
  account_type public.account_type not null check (account_type in ('restaurant', 'admin')),
  restaurant_id text references public.restaurants(id) on delete restrict,
  restaurant_role public.restaurant_role,
  admin_role private.admin_account_role,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  state private.account_invitation_state not null default 'pending',
  expires_at timestamptz not null,
  invited_by_profile_id text references public.profiles(id) on delete set null,
  accepted_by_profile_id text references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  state_changed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint account_invitation_shape check (
    (account_type = 'restaurant' and restaurant_id is not null
      and restaurant_role is not null and admin_role is null)
    or (account_type = 'admin' and restaurant_id is null
      and restaurant_role is null and admin_role is not null)
  ),
  constraint account_invitation_acceptance check (
    (state = 'accepted' and accepted_by_profile_id is not null and accepted_at is not null)
    or (state <> 'accepted' and accepted_by_profile_id is null and accepted_at is null)
  ),
  constraint account_invitation_expiry check (expires_at > created_at)
);
create unique index account_invitation_one_pending_email_idx
  on private.account_invitations(normalized_email) where state = 'pending';
alter table private.account_email_reservations
  add constraint account_email_reservation_invitation_fk foreign key (invitation_id)
  references private.account_invitations(id) on delete restrict;

create table private.account_provisioning_operations (
  operation_id uuid primary key,
  operation_kind text not null check (operation_kind in
    ('customer_bootstrap', 'invite_restaurant', 'invite_admin', 'accept_invite',
     'admin_onboarding', 'account_status', 'restaurant_status', 'restaurant_reassign',
     'admin_role', 'mfa_recovery')),
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('pending', 'completed', 'failed')),
  target_profile_id text references public.profiles(id) on delete restrict,
  invitation_id uuid references private.account_invitations(id) on delete restrict,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table private.restaurant_operational_incidents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  incident_type text not null check (incident_type = 'repeated_order_non_response'),
  state private.operational_incident_state not null default 'open',
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  ignored_order_count integer not null check (ignored_order_count >= 0),
  eligible_order_count integer not null check (eligible_order_count >= ignored_order_count),
  threshold_snapshot jsonb not null check (jsonb_typeof(threshold_snapshot) = 'object'),
  first_detected_at timestamptz not null default statement_timestamp(),
  acknowledged_by_profile_id text references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by_profile_id text references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  constraint incident_window check (window_ended_at >= window_started_at),
  constraint incident_acknowledgement check (
    (state = 'open' and acknowledged_at is null and resolved_at is null)
    or (state = 'acknowledged' and acknowledged_at is not null and resolved_at is null)
    or (state = 'resolved' and resolved_at is not null)
  )
);
create unique index restaurant_one_open_non_response_incident_idx
  on private.restaurant_operational_incidents(restaurant_id, incident_type)
  where state <> 'resolved';

-- New private relations are inaccessible through the Data API roles. The
-- non-bypass function owner has explicit RLS policies and minimum table grants.
alter table private.account_access enable row level security;
alter table private.account_email_reservations enable row level security;
alter table private.account_invitations enable row level security;
alter table private.account_provisioning_operations enable row level security;
alter table private.restaurant_operational_incidents enable row level security;
revoke all on private.account_access, private.account_email_reservations,
  private.account_invitations, private.account_provisioning_operations,
  private.restaurant_operational_incidents from public, anon, authenticated, service_role;
grant select, insert, update on private.account_access, private.account_email_reservations,
  private.account_invitations, private.account_provisioning_operations,
  private.restaurant_operational_incidents to hungrie_api_owner;
grant delete on private.account_email_reservations, private.account_invitations,
  private.account_provisioning_operations,
  private.restaurant_operational_incidents
  to hungrie_api_owner;
create policy phase2_account_access_owner on private.account_access
  for all to hungrie_api_owner using (true) with check (true);
create policy phase2_email_reservations_owner on private.account_email_reservations
  for all to hungrie_api_owner using (true) with check (true);
create policy phase2_invitations_owner on private.account_invitations
  for all to hungrie_api_owner using (true) with check (true);
create policy phase2_provisioning_owner on private.account_provisioning_operations
  for all to hungrie_api_owner using (true) with check (true);
create policy phase2_incidents_owner on private.restaurant_operational_incidents
  for all to hungrie_api_owner using (true) with check (true);

revoke all on function private.phase2_sync_legacy_restaurant_active(),
  private.phase2_sync_legacy_restaurant_insert(),
  private.phase2_account_access_transition() from public, anon, authenticated, service_role;
grant create on schema private to hungrie_api_owner;
alter function private.phase2_account_access_transition() owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
