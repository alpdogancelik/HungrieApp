-- Phase 2 helpers read the new authority, but no legacy policy calls them yet.
create function private.canonical_profile_id()
returns text language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.firebase_uid = private.firebase_subject()
    and p.deletion_pending_at is null and p.deleted_at is null
$$;

create function private.is_active_customer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_access a
    where a.profile_id = private.canonical_profile_id()
      and a.account_type = 'customer' and a.status = 'active')
$$;

create function private.is_active_restaurant_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_access a
    join public.restaurants r on r.id = a.restaurant_id
    where a.profile_id = private.canonical_profile_id()
      and a.account_type = 'restaurant' and a.status = 'active'
      and r.lifecycle_status = 'active')
$$;

create function private.can_access_restaurant(p_restaurant_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_access a
    join public.restaurants r on r.id = a.restaurant_id
    where a.profile_id = private.canonical_profile_id()
      and a.account_type = 'restaurant' and a.status = 'active'
      and a.restaurant_id = p_restaurant_id and r.lifecycle_status = 'active')
$$;

create function private.current_restaurant_id()
returns text language sql stable security definer set search_path = '' as $$
  select a.restaurant_id from private.account_access a
  join public.restaurants r on r.id = a.restaurant_id
  where a.profile_id = private.canonical_profile_id()
    and a.account_type = 'restaurant' and a.status = 'active'
    and r.lifecycle_status = 'active'
$$;

create function private.is_restaurant_operational(p_restaurant_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.lifecycle_status = 'active'
      and r.accepting_orders)
$$;

create function private.current_session_mfa_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.firebase_subject() is not null
    and coalesce(private.request_jwt() -> 'firebase' ->> 'sign_in_second_factor' = 'totp',false)
$$;

create function private.is_active_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.request_jwt() ->> 'email_verified' = 'true', false)
    and private.current_session_mfa_verified()
    and exists(select 1 from private.account_access a
      where a.profile_id = private.canonical_profile_id()
        and a.account_type = 'admin' and a.status = 'active'
        and a.onboarding_step = 'none' and a.admin_mfa_enrolled_at is not null)
$$;

create function private.has_admin_role(p_required_role private.admin_account_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_admin() and exists(
    select 1 from private.account_access a
    where a.profile_id = private.canonical_profile_id()
      and a.account_type = 'admin' and a.status = 'active'
      and (a.admin_role = p_required_role or
        (p_required_role = 'admin' and a.admin_role = 'super_admin')))
$$;

create function private.require_active_customer()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_customer() then
    raise exception 'Active Customer account required' using errcode = '42501';
  end if;
  return private.canonical_profile_id();
end $$;

create function private.require_active_restaurant()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_restaurant_account() then
    raise exception 'Active Restaurant account and restaurant required' using errcode = '42501';
  end if;
  return private.canonical_profile_id();
end $$;

create function private.require_restaurant_owner()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_profile text := private.require_active_restaurant();
begin
  if not exists(select 1 from private.account_access a where a.profile_id=v_profile
    and a.restaurant_role='owner') then
    raise exception 'Restaurant owner required' using errcode='42501';
  end if;
  return v_profile;
end $$;

create function private.require_active_admin(p_required_role private.admin_account_role default 'admin')
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_admin_role(p_required_role) then
    raise exception 'Active MFA-authenticated Admin required' using errcode='42501';
  end if;
  return private.canonical_profile_id();
end $$;

create function private.require_admin_mfa()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.current_session_mfa_verified() then
    raise exception 'Current Admin MFA session required' using errcode='42501';
  end if;
end $$;

create function private.require_recent_admin_auth(p_max_age interval default interval '5 minutes')
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_auth_time bigint;
begin
  perform private.require_active_admin('admin');
  if p_max_age <= interval '0' or p_max_age > interval '5 minutes' then
    raise exception 'Invalid recent-auth window' using errcode='22023';
  end if;
  if coalesce(private.request_jwt()->>'auth_time','') !~ '^[0-9]+$' then
    raise exception 'Recent authentication required' using errcode='42501';
  end if;
  v_auth_time := (private.request_jwt()->>'auth_time')::bigint;
  if to_timestamp(v_auth_time) < statement_timestamp() - p_max_age
     or to_timestamp(v_auth_time) > statement_timestamp() + interval '1 minute' then
    raise exception 'Recent authentication required' using errcode='42501';
  end if;
end $$;

create function public.get_my_access_context_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile text; v_access private.account_access%rowtype; v_restaurant public.restaurants%rowtype;
begin
  if private.firebase_subject() is null then
    raise exception 'Firebase authentication required' using errcode='42501';
  end if;
  v_profile := private.canonical_profile_id();
  if v_profile is null then return jsonb_build_object('state','unmapped'); end if;
  select * into v_access from private.account_access where profile_id=v_profile;
  if not found then
    return jsonb_build_object('state','configuration_error',
      'referenceId', md5(v_profile));
  end if;
  if v_access.account_type='customer' then
    return jsonb_build_object('state','resolved','profileId',v_profile,
      'accountType','customer','accountStatus',v_access.status,
      'onboardingStep',v_access.onboarding_step);
  elsif v_access.account_type='restaurant' then
    select * into v_restaurant from public.restaurants where id=v_access.restaurant_id;
    if not found then
      return jsonb_build_object('state','configuration_error','referenceId',md5(v_profile));
    end if;
    return jsonb_build_object('state','resolved','profileId',v_profile,
      'accountType','restaurant','accountStatus',v_access.status,
      'onboardingStep',v_access.onboarding_step,'restaurantId',v_access.restaurant_id,
      'restaurantRole',v_access.restaurant_role,'restaurantStatus',v_restaurant.lifecycle_status,
      'acceptingOrders',v_restaurant.accepting_orders);
  else
    return jsonb_build_object('state','resolved','profileId',v_profile,
      'accountType','admin','accountStatus',v_access.status,
      'onboardingStep',v_access.onboarding_step,'adminRole',v_access.admin_role,
      'emailVerified',coalesce(private.request_jwt()->>'email_verified'='true',false),
      'currentSessionMfaVerified',private.current_session_mfa_verified());
  end if;
end $$;

revoke all on function public.get_my_access_context_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_my_access_context_v1() to authenticated;
grant create on schema private, public to hungrie_api_owner;
alter function private.canonical_profile_id() owner to hungrie_api_owner;
alter function private.is_active_customer() owner to hungrie_api_owner;
alter function private.is_active_restaurant_account() owner to hungrie_api_owner;
alter function private.can_access_restaurant(text) owner to hungrie_api_owner;
alter function private.current_restaurant_id() owner to hungrie_api_owner;
alter function private.is_restaurant_operational(text) owner to hungrie_api_owner;
alter function private.current_session_mfa_verified() owner to hungrie_api_owner;
alter function private.is_active_admin() owner to hungrie_api_owner;
alter function private.has_admin_role(private.admin_account_role) owner to hungrie_api_owner;
alter function private.require_active_customer() owner to hungrie_api_owner;
alter function private.require_active_restaurant() owner to hungrie_api_owner;
alter function private.require_restaurant_owner() owner to hungrie_api_owner;
alter function private.require_active_admin(private.admin_account_role) owner to hungrie_api_owner;
alter function private.require_admin_mfa() owner to hungrie_api_owner;
alter function private.require_recent_admin_auth(interval) owner to hungrie_api_owner;
alter function public.get_my_access_context_v1() owner to hungrie_api_owner;
revoke create on schema private, public from hungrie_api_owner;
revoke all on function private.canonical_profile_id(), private.is_active_customer(),
  private.is_active_restaurant_account(), private.can_access_restaurant(text),
  private.current_restaurant_id(), private.is_restaurant_operational(text),
  private.current_session_mfa_verified(), private.is_active_admin(),
  private.has_admin_role(private.admin_account_role), private.require_active_customer(),
  private.require_active_restaurant(), private.require_restaurant_owner(),
  private.require_active_admin(private.admin_account_role), private.require_admin_mfa(),
  private.require_recent_admin_auth(interval) from public, anon, authenticated, service_role;
grant execute on function private.canonical_profile_id(), private.is_active_customer(),
  private.is_active_restaurant_account(), private.can_access_restaurant(text),
  private.current_restaurant_id(), private.is_restaurant_operational(text),
  private.current_session_mfa_verified(), private.is_active_admin(),
  private.has_admin_role(private.admin_account_role), private.require_active_customer(),
  private.require_active_restaurant(), private.require_restaurant_owner(),
  private.require_active_admin(private.admin_account_role), private.require_admin_mfa(),
  private.require_recent_admin_auth(interval) to hungrie_api_owner;
