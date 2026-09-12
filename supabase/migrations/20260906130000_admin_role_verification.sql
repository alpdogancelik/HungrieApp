-- Caller-bound, read-only platform authorization for admin route verification.

create or replace function public.get_my_admin_authorization()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id text := private.require_profile();
  v_role public.platform_role;
begin
  select case
    when bool_or(ur.role = 'super_admin'::public.platform_role) then 'super_admin'::public.platform_role
    when bool_or(ur.role = 'admin'::public.platform_role) then 'admin'::public.platform_role
    else null
  end
  into v_role
  from private.user_roles ur
  where ur.profile_id = v_profile_id;

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'platform_role', v_role,
    'is_admin', coalesce(v_role in ('admin'::public.platform_role, 'super_admin'::public.platform_role), false),
    'is_super_admin', coalesce(v_role = 'super_admin'::public.platform_role, false)
  );
end
$$;

revoke all on function public.get_my_admin_authorization() from public, anon;
grant execute on function public.get_my_admin_authorization() to authenticated;

grant create on schema public to hungrie_api_owner;
alter function public.get_my_admin_authorization() owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;
