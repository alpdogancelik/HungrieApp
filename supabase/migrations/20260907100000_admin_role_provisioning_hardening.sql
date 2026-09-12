-- Step 3: require matching Firebase and database admin roles and provide a
-- locked, operator-only bootstrap primitive for the first super-admin.

create unique index user_roles_one_admin_level_per_profile_idx
on private.user_roles(profile_id)
where role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);

create or replace function private.has_platform_role(required_role public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.user_roles ur
    where ur.profile_id = private.current_profile_id()
      and ur.role = required_role
      and (
        required_role = 'courier'::public.platform_role
        or (
          required_role in ('admin'::public.platform_role, 'super_admin'::public.platform_role)
          and private.request_jwt() ->> 'platform_role' = required_role::text
        )
      )
  )
$$;

create or replace function private.apply_platform_admin_role(
  p_profile_id text,
  p_next_role public.platform_role,
  p_actor_profile_id text,
  p_bootstrap boolean,
  p_operation_id uuid,
  p_source text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old_roles text[];
  v_new_roles text[];
  v_super_admin_count integer;
begin
  if p_next_role is not null
     and p_next_role not in ('admin'::public.platform_role, 'super_admin'::public.platform_role) then
    raise exception 'Only admin roles can be managed by this operation' using errcode = '22023';
  end if;
  if p_operation_id is null or p_source not in ('admin_provisioning_cli', 'authenticated_rpc') then
    raise exception 'Valid operation metadata is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hungrie:platform-admin-role', 0));

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.deletion_pending_at is null and p.deleted_at is null
  ) then
    raise exception 'Active target profile is required' using errcode = '22023';
  end if;

  select count(*)::integer into v_super_admin_count
  from private.user_roles where role = 'super_admin'::public.platform_role;

  if p_bootstrap then
    if p_actor_profile_id is not null
       or p_next_role is distinct from 'super_admin'::public.platform_role
       or v_super_admin_count <> 0 then
      raise exception 'Initial super-admin bootstrap is not allowed' using errcode = '42501';
    end if;
  elsif p_actor_profile_id is null or not exists (
    select 1 from private.user_roles ur
    where ur.profile_id = p_actor_profile_id
      and ur.role = 'super_admin'::public.platform_role
  ) then
    raise exception 'Existing super-admin actor required' using errcode = '42501';
  end if;

  select coalesce(array_agg(ur.role::text order by ur.role::text), '{}')
  into v_old_roles
  from private.user_roles ur
  where ur.profile_id = p_profile_id
    and ur.role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);

  if 'super_admin' = any(v_old_roles)
     and p_next_role is distinct from 'super_admin'::public.platform_role
     and v_super_admin_count <= 1 then
    raise exception 'The last super-admin cannot be removed or downgraded' using errcode = '22023';
  end if;

  delete from private.user_roles
  where profile_id = p_profile_id
    and role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);

  if p_next_role is not null then
    insert into private.user_roles(profile_id, role) values (p_profile_id, p_next_role);
  end if;

  select coalesce(array_agg(ur.role::text order by ur.role::text), '{}')
  into v_new_roles
  from private.user_roles ur
  where ur.profile_id = p_profile_id
    and ur.role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);

  perform private.write_audit(
    p_actor_profile_id,
    'platform.role_changed',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'old_roles', to_jsonb(v_old_roles),
      'new_roles', to_jsonb(v_new_roles),
      'bootstrap', p_bootstrap,
      'operation_id', p_operation_id,
      'source', p_source
    )
  );

  return jsonb_build_object('old_roles', v_old_roles, 'new_roles', v_new_roles);
end
$$;

create or replace function public.set_platform_role(
  p_profile_id text,
  p_role public.platform_role,
  p_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_operation_id uuid := gen_random_uuid();
begin
  if not private.has_platform_role('super_admin'::public.platform_role) then
    raise exception 'Super-admin role required' using errcode = '42501';
  end if;

  if p_role in ('admin'::public.platform_role, 'super_admin'::public.platform_role) then
    if p_enabled then
      perform private.apply_platform_admin_role(
        p_profile_id, p_role, v_actor, false, v_operation_id, 'authenticated_rpc'
      );
    elsif exists (
      select 1 from private.user_roles
      where profile_id = p_profile_id and role = p_role
    ) then
      perform private.apply_platform_admin_role(
        p_profile_id, null, v_actor, false, v_operation_id, 'authenticated_rpc'
      );
    else
      perform private.write_audit(v_actor, 'platform.role_changed', 'profile', p_profile_id,
        jsonb_build_object('role', p_role, 'enabled', false, 'changed', false,
          'operation_id', v_operation_id, 'source', 'authenticated_rpc'));
    end if;
    return;
  end if;

  if p_enabled then
    insert into private.user_roles(profile_id, role)
    values (p_profile_id, p_role) on conflict do nothing;
  else
    delete from private.user_roles where profile_id = p_profile_id and role = p_role;
    if p_role = 'courier'::public.platform_role then
      delete from private.restaurant_couriers where profile_id = p_profile_id;
    end if;
  end if;
  perform private.write_audit(v_actor, 'platform.role_changed', 'profile', p_profile_id,
    jsonb_build_object('role', p_role, 'enabled', p_enabled,
      'operation_id', v_operation_id, 'source', 'authenticated_rpc'));
end
$$;

revoke all on function private.apply_platform_admin_role(
  text, public.platform_role, text, boolean, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function private.apply_platform_admin_role(
  text, public.platform_role, text, boolean, uuid, text
) to hungrie_api_owner;

grant create on schema private to hungrie_api_owner;
alter function private.has_platform_role(public.platform_role) owner to hungrie_api_owner;
alter function private.apply_platform_admin_role(
  text, public.platform_role, text, boolean, uuid, text
) owner to hungrie_api_owner;
alter function public.set_platform_role(text, public.platform_role, boolean) owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
