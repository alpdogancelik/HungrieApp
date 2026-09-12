-- Versioned Phase 2 operations. Client EXECUTE grants remain revoked until
-- classification, MFA, provisioning orchestration, and cutover gates pass.
create function private.phase2_operation_begin(p_id uuid, p_kind text, p_digest text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_row private.account_provisioning_operations%rowtype;
begin
  if p_id is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Operation ID and request digest required' using errcode='22023';
  end if;
  insert into private.account_provisioning_operations
    (operation_id,operation_kind,request_digest,state)
  values(p_id,p_kind,p_digest,'pending') on conflict do nothing;
  select * into v_row from private.account_provisioning_operations
    where operation_id=p_id for update;
  if v_row.operation_kind<>p_kind or v_row.request_digest<>p_digest then
    raise exception 'Operation ID reused with different request' using errcode='23505';
  end if;
  if v_row.state='completed' then return v_row.result; end if;
  if v_row.state='failed' then
    raise exception 'Operation requires reviewed recovery' using errcode='42501';
  end if;
  return null;
end $$;

create function public.complete_my_admin_onboarding_v1(p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_profile text:=private.canonical_profile_id(); v_result jsonb;
begin
  if v_profile is null or private.request_jwt()->>'email_verified'<>'true'
    or not private.current_session_mfa_verified() then
    raise exception 'Verified TOTP sign-in required' using errcode='42501';
  end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'admin_onboarding',
    encode(extensions.digest(v_profile,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  update private.account_access set status='active',onboarding_step='none',
    activated_at=statement_timestamp()
    where profile_id=v_profile and account_type='admin' and status='pending'
      and onboarding_step='admin_mfa_sign_in_required'
      and admin_mfa_enrolled_at is not null;
  if not found then raise exception 'Admin onboarding is not ready' using errcode='42501'; end if;
  perform private.write_audit(v_profile,'account.admin_activated','profile',v_profile,
    jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',v_profile,'accountStatus','active'),v_profile);
end $$;

create function public.admin_set_account_status_v1(p_profile_id text,
  p_status private.account_status,p_reason_code text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text; v_old private.account_access%rowtype; v_result jsonb;
  v_remaining integer;
begin
  v_actor:=private.require_active_admin('admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  if p_status not in ('active','suspended','revoked') or p_reason_code is null
    or btrim(p_reason_code)='' then
    raise exception 'Supported status and reason required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hungrie:account-status',0));
  v_result:=private.phase2_operation_begin(p_operation_id,'account_status',
    encode(extensions.digest(p_profile_id||':'||p_status::text||':'||p_reason_code,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select * into v_old from private.account_access where profile_id=p_profile_id for update;
  if not found or v_old.status='revoked' then
    raise exception 'Target account is unavailable' using errcode='42501';
  end if;
  if v_old.account_type='admin' then
    perform private.require_active_admin('super_admin');
  end if;
  if p_status='active' and v_old.account_type='admin' and
    (v_old.status='pending' or v_old.admin_mfa_enrolled_at is null
      or v_old.onboarding_step<>'none') then
    raise exception 'Admin must complete MFA sign-in onboarding' using errcode='42501';
  end if;
  if v_old.account_type='admin' and v_old.admin_role='super_admin'
    and v_old.status='active' and p_status<>'active' then
    select count(*) into v_remaining from private.account_access a
      where a.account_type='admin' and a.admin_role='super_admin'
        and a.status='active' and a.admin_mfa_enrolled_at is not null
        and a.profile_id<>p_profile_id;
    if v_remaining=0 then raise exception 'Last MFA-ready super-admin protected' using errcode='23514'; end if;
  end if;
  if v_old.account_type='restaurant' and v_old.restaurant_role='owner'
    and v_old.status='active' and p_status<>'active'
    and exists(select 1 from public.restaurants r where r.id=v_old.restaurant_id
      and r.lifecycle_status='active') then
    select count(*) into v_remaining from private.account_access a
      where a.account_type='restaurant' and a.restaurant_id=v_old.restaurant_id
        and a.restaurant_role='owner' and a.status='active' and a.profile_id<>p_profile_id;
    if v_remaining=0 then raise exception 'Last active Restaurant owner protected' using errcode='23514'; end if;
  end if;
  update private.account_access set status=p_status,onboarding_step=case
      when p_status='active' then 'none'::private.account_onboarding_step else onboarding_step end,
    status_reason_code=p_reason_code,
    activated_at=case when p_status='active' then statement_timestamp() else activated_at end,
    suspended_at=case when p_status='suspended' then statement_timestamp() else null end,
    revoked_at=case when p_status='revoked' then statement_timestamp() else revoked_at end
    where profile_id=p_profile_id;
  perform private.write_audit(v_actor,'account.status_changed','profile',p_profile_id,
    jsonb_build_object('operation_id',p_operation_id,'from',v_old.status,'to',p_status,
      'reason_code',p_reason_code));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',p_profile_id,'status',p_status),p_profile_id);
end $$;

create function public.admin_set_restaurant_status_v1(p_restaurant_id text,
  p_status public.restaurant_lifecycle_status,p_reason_code text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text; v_old public.restaurant_lifecycle_status; v_result jsonb;
begin
  v_actor:=private.require_active_admin('admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  if p_reason_code is null or btrim(p_reason_code)='' then
    raise exception 'Reason code required' using errcode='22023';
  end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'restaurant_status',
    encode(extensions.digest(p_restaurant_id||':'||p_status::text||':'||p_reason_code,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select lifecycle_status into v_old from public.restaurants
    where id=p_restaurant_id for update;
  if not found then raise exception 'Restaurant not found' using errcode='22023'; end if;
  if p_status='active' and exists(select 1 from private.account_access a
      where a.account_type='restaurant' and a.restaurant_id=p_restaurant_id)
    and not exists(select 1 from private.account_access a
      where a.account_type='restaurant' and a.restaurant_id=p_restaurant_id
        and a.restaurant_role='owner' and a.status='active') then
    raise exception 'Active Restaurant requires an active owner' using errcode='23514';
  end if;
  update public.restaurants set lifecycle_status=p_status,
    is_active=(p_status='active'),
    accepting_orders=case when p_status='active' then accepting_orders else false end,
    suspended_at=case when p_status='suspended' then statement_timestamp() else null end,
    suspended_by_profile_id=case when p_status='suspended' then v_actor else null end,
    suspension_reason_code=case when p_status='suspended' then p_reason_code else null end
    where id=p_restaurant_id;
  if p_status='active' and v_old<>'active' then
    update public.restaurants set accepting_orders=false where id=p_restaurant_id;
  end if;
  perform private.write_audit(v_actor,'restaurant.lifecycle_changed','restaurant',
    p_restaurant_id,jsonb_build_object('operation_id',p_operation_id,
      'from',v_old,'to',p_status,'reason_code',p_reason_code));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('restaurantId',p_restaurant_id,'status',p_status));
end $$;

create function public.admin_reassign_restaurant_account_v1(p_profile_id text,
  p_restaurant_id text,p_restaurant_role public.restaurant_role,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text; v_old private.account_access%rowtype; v_result jsonb;
begin
  v_actor:=private.require_active_admin('super_admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  v_result:=private.phase2_operation_begin(p_operation_id,'restaurant_reassign',
    encode(extensions.digest(p_profile_id||':'||p_restaurant_id||':'||p_restaurant_role::text,
      'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select * into v_old from private.account_access where profile_id=p_profile_id for update;
  if not found or v_old.account_type<>'restaurant' or
    v_old.status not in ('pending','suspended') or
    not exists(select 1 from public.restaurants where id=p_restaurant_id) then
    raise exception 'Restaurant reassignment is not allowed' using errcode='42501';
  end if;
  update private.account_access set restaurant_id=p_restaurant_id,
    restaurant_role=p_restaurant_role where profile_id=p_profile_id;
  perform private.write_audit(v_actor,'account.restaurant_reassigned','profile',p_profile_id,
    jsonb_build_object('operation_id',p_operation_id,'from',v_old.restaurant_id,
      'to',p_restaurant_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',p_profile_id,'restaurantId',p_restaurant_id),p_profile_id);
end $$;

create function public.admin_change_admin_role_v1(p_profile_id text,
  p_admin_role private.admin_account_role,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text; v_old private.account_access%rowtype; v_result jsonb;
begin
  v_actor:=private.require_active_admin('super_admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  perform pg_advisory_xact_lock(hashtextextended('hungrie:account-status',0));
  v_result:=private.phase2_operation_begin(p_operation_id,'admin_role',
    encode(extensions.digest(p_profile_id||':'||p_admin_role::text,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select * into v_old from private.account_access where profile_id=p_profile_id for update;
  if not found or v_old.account_type<>'admin' or v_old.status='revoked' then
    raise exception 'Admin account unavailable' using errcode='42501';
  end if;
  if v_old.admin_role='super_admin' and p_admin_role<>'super_admin'
    and v_old.status='active' and not exists(
      select 1 from private.account_access a where a.account_type='admin'
        and a.admin_role='super_admin' and a.status='active'
        and a.admin_mfa_enrolled_at is not null and a.profile_id<>p_profile_id) then
    raise exception 'Last MFA-ready super-admin protected' using errcode='23514';
  end if;
  update private.account_access set admin_role=p_admin_role where profile_id=p_profile_id;
  perform private.write_audit(v_actor,'account.admin_role_changed','profile',p_profile_id,
    jsonb_build_object('operation_id',p_operation_id,'from',v_old.admin_role,'to',p_admin_role));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',p_profile_id,'adminRole',p_admin_role),p_profile_id);
end $$;

create function public.admin_record_mfa_recovery_v1(p_profile_id text,
  p_evidence_reference text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text; v_result jsonb;
begin
  v_actor:=private.require_active_admin('super_admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  if v_actor=p_profile_id or
    coalesce(p_evidence_reference,'') !~ '^(case|ticket):[A-Za-z0-9._-]{3,100}$' then
    raise exception 'Independent recovery evidence required' using errcode='42501';
  end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'mfa_recovery',
    encode(extensions.digest(p_profile_id||':'||p_evidence_reference,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  if exists(select 1 from private.account_access a where a.profile_id=p_profile_id
      and a.account_type='admin' and a.admin_role='super_admin' and a.status='active')
    and not exists(select 1 from private.account_access a where a.profile_id<>p_profile_id
      and a.account_type='admin' and a.admin_role='super_admin' and a.status='active'
      and a.admin_mfa_enrolled_at is not null) then
    raise exception 'Last MFA-ready super-admin protected' using errcode='23514';
  end if;
  update private.account_access set status='pending',
    onboarding_step='admin_mfa_enrollment_required',admin_mfa_enrolled_at=null
    where profile_id=p_profile_id and account_type='admin' and status<>'revoked';
  if not found then raise exception 'Admin account unavailable' using errcode='42501'; end if;
  perform private.write_audit(v_actor,'account.mfa_recovery_recorded','profile',p_profile_id,
    jsonb_build_object('operation_id',p_operation_id,
      'evidence_reference',p_evidence_reference));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',p_profile_id,'onboardingStep',
      'admin_mfa_enrollment_required'),p_profile_id);
end $$;

-- Retention logic is callable only by the trusted API owner. No cron is added.
create function private.phase2_cleanup_retained_records(p_now timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_invites integer; v_incidents integer;
begin
  update private.account_invitations set state='expired',state_changed_at=p_now
    where state='pending' and expires_at<=p_now;
  delete from private.account_provisioning_operations o
    where o.state='completed' and o.created_at<p_now-interval '1 year';
  update private.account_provisioning_operations o set invitation_id=null
    where o.invitation_id is not null and exists(
      select 1 from private.account_invitations i where i.id=o.invitation_id
        and i.state<>'pending' and i.state_changed_at<p_now-interval '1 year');
  delete from private.account_email_reservations e
    where e.profile_id is null and exists(select 1 from private.account_invitations i
      where i.id=e.invitation_id and i.state<>'pending'
        and i.state_changed_at<p_now-interval '1 year');
  update private.account_email_reservations e set invitation_id=null
    where e.profile_id is not null and exists(select 1 from private.account_invitations i
      where i.id=e.invitation_id and i.state<>'pending'
        and i.state_changed_at<p_now-interval '1 year');
  delete from private.account_invitations i where i.state<>'pending'
    and i.state_changed_at<p_now-interval '1 year';
  get diagnostics v_invites=row_count;
  delete from private.restaurant_operational_incidents i where i.state='resolved'
    and i.resolved_at<p_now-interval '2 years';
  get diagnostics v_incidents=row_count;
  perform private.write_audit(null,'account.retention_cleanup','maintenance',null,
    jsonb_build_object('invitations',v_invites,'incidents',v_incidents));
  return jsonb_build_object('invitations',v_invites,'incidents',v_incidents);
end $$;

create function private.phase2_operation_complete(p_id uuid, p_result jsonb,
  p_profile_id text default null, p_invitation_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  update private.account_provisioning_operations
    set state='completed',result=p_result,target_profile_id=p_profile_id,
        invitation_id=p_invitation_id,updated_at=statement_timestamp()
    where operation_id=p_id and state='pending';
  if not found then raise exception 'Operation is not pending' using errcode='P0001'; end if;
  return p_result;
end $$;

create function public.bootstrap_my_customer_account_v1(p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid text:=private.firebase_subject(); v_claims jsonb:=private.request_jwt();
  v_email text; v_profile text; v_result jsonb;
begin
  if v_uid is null then raise exception 'Firebase identity required' using errcode='42501'; end if;
  v_email:=lower(btrim(coalesce(v_claims->>'email','')));
  if v_email='' then raise exception 'Firebase email claim required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hungrie:email:'||v_email,0));
  v_result:=private.phase2_operation_begin(p_operation_id,'customer_bootstrap',
    encode(extensions.digest(v_uid||':'||v_email,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  if exists(select 1 from private.account_invitations i where i.normalized_email=v_email
    and i.state='pending' and i.expires_at>statement_timestamp())
    or exists(select 1 from private.account_email_reservations e
      where e.normalized_email=v_email and e.account_type<>'customer') then
    raise exception 'Email is reserved for privileged onboarding' using errcode='42501';
  end if;
  select p.id into v_profile from public.profiles p where p.firebase_uid=v_uid
    and p.deletion_pending_at is null and p.deleted_at is null;
  if exists(select 1 from public.profiles p where lower(btrim(p.email))=v_email
    and p.deletion_pending_at is null and p.deleted_at is null
    and p.id is distinct from v_profile) then
    raise exception 'Email already maps to another profile' using errcode='42501';
  end if;
  if v_profile is not null then
    if exists(select 1 from private.user_roles ur where ur.profile_id=v_profile
      and ur.role in ('admin','super_admin','courier'))
      or exists(select 1 from private.restaurant_members rm where rm.profile_id=v_profile)
      or exists(select 1 from private.account_access a where a.profile_id=v_profile
        and a.account_type<>'customer') then
      raise exception 'Identity already has privileged scope' using errcode='42501';
    end if;
  else
    if exists(select 1 from public.profiles p where lower(btrim(p.email))=v_email
      and p.deletion_pending_at is null and p.deleted_at is null) then
      raise exception 'Email already maps to another profile' using errcode='42501';
    end if;
    v_profile:=v_uid;
    insert into public.profiles(id,firebase_uid,name,email)
    values(v_profile,v_uid,left(coalesce(nullif(btrim(v_claims->>'name'),''),v_email),120),v_email);
  end if;
  insert into private.account_email_reservations
    (normalized_email,account_type,firebase_uid,profile_id)
  values(v_email,'customer',v_uid,v_profile)
  on conflict(normalized_email) do update set updated_at=statement_timestamp()
  where account_email_reservations.account_type='customer'
    and account_email_reservations.profile_id=v_profile
    and account_email_reservations.firebase_uid=v_uid;
  if not found then raise exception 'Email classification conflict' using errcode='42501'; end if;
  insert into private.account_access(profile_id,account_type,status,activated_at)
  values(v_profile,'customer','active',statement_timestamp()) on conflict do nothing;
  if not exists(select 1 from private.account_access a where a.profile_id=v_profile
    and a.account_type='customer' and a.status='active') then
    raise exception 'Account classification conflict' using errcode='42501';
  end if;
  perform private.write_audit(v_profile,'account.customer_bootstrapped','profile',v_profile,
    jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',v_profile,'accountType','customer'),v_profile);
end $$;

create function private.phase2_create_invitation(p_email text,p_type public.account_type,
  p_restaurant_id text,p_restaurant_role public.restaurant_role,
  p_admin_role private.admin_account_role,p_token_digest text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_email text:=lower(btrim(coalesce(p_email,''))); v_actor text;
  v_result jsonb; v_invitation uuid; v_digest text;
begin
  if p_type is null or p_type not in ('restaurant','admin') then
    raise exception 'Privileged invitation type required' using errcode='22023';
  end if;
  if v_email='' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
    or p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid email and token digest required' using errcode='22023';
  end if;
  if p_type='restaurant' and p_restaurant_id is not null and p_restaurant_role is not null
    and p_admin_role is null and p_restaurant_role='manager' then
    v_actor:=private.require_active_admin('admin');
  else
    v_actor:=private.require_active_admin('super_admin');
  end if;
  perform private.require_recent_admin_auth(interval '5 minutes');
  perform pg_advisory_xact_lock(hashtextextended('hungrie:email:'||v_email,0));
  v_digest:=encode(extensions.digest(v_email||':'||p_type::text||':'||
    coalesce(p_restaurant_id,'')||':'||coalesce(p_restaurant_role::text,'')||':'||
    coalesce(p_admin_role::text,'')||':'||p_token_digest,'sha256'),'hex');
  v_result:=private.phase2_operation_begin(p_operation_id,
    case when p_type='restaurant' then 'invite_restaurant' else 'invite_admin' end,v_digest);
  if v_result is not null then return v_result; end if;
  if exists(select 1 from public.profiles p where lower(btrim(p.email))=v_email
    and p.deletion_pending_at is null and p.deleted_at is null)
    or exists(select 1 from private.account_email_reservations e where e.normalized_email=v_email
      and (e.account_type<>p_type or e.profile_id is not null)) then
    raise exception 'Email already belongs to an identity' using errcode='42501';
  end if;
  update private.account_invitations set state='revoked',state_changed_at=statement_timestamp()
    where normalized_email=v_email and state='pending';
  insert into private.account_invitations(normalized_email,account_type,restaurant_id,
    restaurant_role,admin_role,token_digest,expires_at,invited_by_profile_id)
  values(v_email,p_type,p_restaurant_id,p_restaurant_role,p_admin_role,p_token_digest,
    statement_timestamp()+interval '7 days',v_actor)
  returning id into v_invitation;
  insert into private.account_email_reservations
    (normalized_email,account_type,invitation_id)
  values(v_email,p_type,v_invitation)
  on conflict(normalized_email) do update set invitation_id=v_invitation,
    updated_at=statement_timestamp()
  where account_email_reservations.account_type=p_type
    and account_email_reservations.profile_id is null;
  if not found then raise exception 'Email reservation conflict' using errcode='42501'; end if;
  perform private.write_audit(v_actor,'account.invited','invitation',v_invitation::text,
    jsonb_build_object('operation_id',p_operation_id,'account_type',p_type));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('invitationId',v_invitation,'expiresAt',statement_timestamp()+interval '7 days'),
    null,v_invitation);
end $$;

create function public.admin_invite_restaurant_account_v1(p_email text,p_restaurant_id text,
  p_restaurant_role public.restaurant_role,p_token_digest text,p_operation_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.phase2_create_invitation(p_email,'restaurant',p_restaurant_id,
    p_restaurant_role,null,p_token_digest,p_operation_id)
$$;

create function public.admin_invite_admin_account_v1(p_email text,
  p_admin_role private.admin_account_role,p_token_digest text,p_operation_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.phase2_create_invitation(p_email,'admin',null,null,
    p_admin_role,p_token_digest,p_operation_id)
$$;

create function public.accept_my_account_invitation_v1(p_token text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid text:=private.firebase_subject(); v_email text;
  v_invitation private.account_invitations%rowtype; v_profile text; v_result jsonb;
begin
  if v_uid is null or private.request_jwt()->>'email_verified'<>'true' then
    raise exception 'Verified Firebase identity required' using errcode='42501';
  end if;
  v_email:=lower(btrim(coalesce(private.request_jwt()->>'email','')));
  if v_email='' or length(coalesce(p_token,''))<32 then
    raise exception 'Valid invitation token required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hungrie:email:'||v_email,0));
  v_result:=private.phase2_operation_begin(p_operation_id,'accept_invite',
    encode(extensions.digest(v_uid||':'||p_token,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select * into v_invitation from private.account_invitations i
    where i.token_digest=encode(extensions.digest(p_token,'sha256'),'hex')
    for update;
  if not found or v_invitation.state<>'pending' or
    v_invitation.expires_at<=statement_timestamp() or v_invitation.normalized_email<>v_email then
    raise exception 'Invitation is not available' using errcode='42501';
  end if;
  if exists(select 1 from public.profiles p where p.firebase_uid=v_uid or
    (lower(btrim(p.email))=v_email and p.deletion_pending_at is null and p.deleted_at is null)) then
    raise exception 'Identity is already mapped' using errcode='42501';
  end if;
  v_profile:=v_uid;
  insert into public.profiles(id,firebase_uid,name,email)
  values(v_profile,v_uid,left(coalesce(nullif(btrim(private.request_jwt()->>'name'),''),v_email),120),v_email);
  insert into private.account_access(profile_id,account_type,status,onboarding_step,
    restaurant_id,restaurant_role,admin_role,created_by_profile_id)
  values(v_profile,v_invitation.account_type,'pending',
    case when v_invitation.account_type='restaurant'
      then 'restaurant_approval_required'::private.account_onboarding_step
      else 'admin_mfa_enrollment_required'::private.account_onboarding_step end,
    v_invitation.restaurant_id,v_invitation.restaurant_role,v_invitation.admin_role,
    v_invitation.invited_by_profile_id);
  update private.account_invitations set state='accepted',accepted_by_profile_id=v_profile,
    accepted_at=statement_timestamp(),state_changed_at=statement_timestamp()
    where id=v_invitation.id;
  update private.account_email_reservations set firebase_uid=v_uid,profile_id=v_profile,
    updated_at=statement_timestamp()
    where normalized_email=v_email and invitation_id=v_invitation.id;
  if not found then raise exception 'Email reservation is inconsistent' using errcode='42501'; end if;
  perform private.write_audit(v_profile,'account.invitation_accepted','invitation',
    v_invitation.id::text,jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',v_profile,'accountType',v_invitation.account_type),
    v_profile,v_invitation.id);
end $$;

-- Called only by a later trusted Firebase enrollment bridge after Admin SDK
-- factor inspection; it does not itself claim that the current session used MFA.
create function private.phase2_record_admin_mfa_enrollment(p_firebase_uid text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_profile text; v_result jsonb;
begin
  if btrim(coalesce(p_firebase_uid,''))='' or p_operation_id is null then
    raise exception 'Verified Firebase subject and operation required' using errcode='22023';
  end if;
  select p.id into v_profile from public.profiles p where p.firebase_uid=p_firebase_uid
    and p.deletion_pending_at is null and p.deleted_at is null;
  if v_profile is null then raise exception 'Admin profile not found' using errcode='42501'; end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'admin_onboarding',
    encode(extensions.digest(p_firebase_uid||':enrollment','sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  update private.account_access set admin_mfa_enrolled_at=statement_timestamp(),
    onboarding_step='admin_mfa_sign_in_required'
    where profile_id=v_profile and account_type='admin' and status='pending'
      and onboarding_step='admin_mfa_enrollment_required';
  if not found then raise exception 'Admin enrollment is not pending' using errcode='42501'; end if;
  perform private.write_audit(v_profile,'account.admin_mfa_enrolled','profile',v_profile,
    jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',v_profile,
      'onboardingStep','admin_mfa_sign_in_required'),v_profile);
end $$;

revoke all on function private.phase2_operation_begin(uuid,text,text),
  private.phase2_operation_complete(uuid,jsonb,text,uuid),
  private.phase2_create_invitation(text,public.account_type,text,public.restaurant_role,
    private.admin_account_role,text,uuid),
  private.phase2_cleanup_retained_records(timestamptz),
  private.phase2_record_admin_mfa_enrollment(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bootstrap_my_customer_account_v1(uuid),
  public.admin_invite_restaurant_account_v1(text,text,public.restaurant_role,text,uuid),
  public.admin_invite_admin_account_v1(text,private.admin_account_role,text,uuid),
  public.accept_my_account_invitation_v1(text,uuid),
  public.complete_my_admin_onboarding_v1(uuid),
  public.admin_set_account_status_v1(text,private.account_status,text,uuid),
  public.admin_set_restaurant_status_v1(text,public.restaurant_lifecycle_status,text,uuid),
  public.admin_reassign_restaurant_account_v1(text,text,public.restaurant_role,uuid),
  public.admin_change_admin_role_v1(text,private.admin_account_role,uuid),
  public.admin_record_mfa_recovery_v1(text,text,uuid)
  from public, anon, authenticated, service_role;

grant create on schema private, public to hungrie_api_owner;
alter function private.phase2_operation_begin(uuid,text,text) owner to hungrie_api_owner;
alter function private.phase2_operation_complete(uuid,jsonb,text,uuid) owner to hungrie_api_owner;
alter function private.phase2_create_invitation(text,public.account_type,text,
  public.restaurant_role,private.admin_account_role,text,uuid) owner to hungrie_api_owner;
alter function private.phase2_cleanup_retained_records(timestamptz) owner to hungrie_api_owner;
alter function private.phase2_record_admin_mfa_enrollment(text,uuid) owner to hungrie_api_owner;
alter function public.bootstrap_my_customer_account_v1(uuid) owner to hungrie_api_owner;
alter function public.admin_invite_restaurant_account_v1(text,text,public.restaurant_role,text,uuid)
  owner to hungrie_api_owner;
alter function public.admin_invite_admin_account_v1(text,private.admin_account_role,text,uuid)
  owner to hungrie_api_owner;
alter function public.accept_my_account_invitation_v1(text,uuid) owner to hungrie_api_owner;
alter function public.complete_my_admin_onboarding_v1(uuid) owner to hungrie_api_owner;
alter function public.admin_set_account_status_v1(text,private.account_status,text,uuid)
  owner to hungrie_api_owner;
alter function public.admin_set_restaurant_status_v1(text,public.restaurant_lifecycle_status,text,uuid)
  owner to hungrie_api_owner;
alter function public.admin_reassign_restaurant_account_v1(text,text,public.restaurant_role,uuid)
  owner to hungrie_api_owner;
alter function public.admin_change_admin_role_v1(text,private.admin_account_role,uuid)
  owner to hungrie_api_owner;
alter function public.admin_record_mfa_recovery_v1(text,text,uuid)
  owner to hungrie_api_owner;
revoke create on schema private, public from hungrie_api_owner;

grant execute on function private.phase2_operation_begin(uuid,text,text),
  private.phase2_operation_complete(uuid,jsonb,text,uuid),
  private.phase2_create_invitation(text,public.account_type,text,public.restaurant_role,
    private.admin_account_role,text,uuid),
  private.phase2_cleanup_retained_records(timestamptz),
  private.phase2_record_admin_mfa_enrollment(text,uuid)
  to hungrie_api_owner;
