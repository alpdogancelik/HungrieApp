-- Phase 1 release compatibility signal. This does not authorize business data.
create table private.client_release_policy (
  application text not null check (application in ('customer', 'restaurant')),
  platform text not null check (platform in ('ios', 'android')),
  minimum_build_number integer not null check (minimum_build_number > 0),
  minimum_api_contract integer not null check (minimum_api_contract >= 0),
  update_required boolean not null default false,
  store_url text check (store_url is null or store_url ~ '^https://'),
  user_message_key text,
  changed_by_profile_id text references public.profiles(id),
  changed_at timestamptz not null default now(),
  primary key (application, platform)
);

alter table private.client_release_policy enable row level security;
revoke all on private.client_release_policy from public, anon, authenticated, service_role;
grant select on private.client_release_policy to hungrie_api_owner;
create policy client_release_policy_api_read on private.client_release_policy
  for select to hungrie_api_owner using (true);

create or replace function public.get_client_release_policy_v1(
  p_application text,
  p_platform text,
  p_build_number integer,
  p_api_contract integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_policy private.client_release_policy%rowtype;
  v_update_required boolean;
begin
  if p_application is null or p_application not in ('customer', 'restaurant')
     or p_platform is null or p_platform not in ('ios', 'android')
     or p_build_number is null or p_build_number <= 0
     or p_api_contract is null or p_api_contract < 0 then
    raise exception 'Invalid client release check' using errcode = '22023';
  end if;

  select * into v_policy
  from private.client_release_policy
  where application = p_application and platform = p_platform;

  if not found then
    return jsonb_build_object(
      'application', p_application,
      'platform', p_platform,
      'policy_configured', false,
      'update_required', false,
      'minimum_build_number', null,
      'minimum_api_contract', null,
      'store_url', null,
      'user_message_key', null
    );
  end if;

  v_update_required := v_policy.update_required and
    (p_build_number < v_policy.minimum_build_number
      or p_api_contract < v_policy.minimum_api_contract);

  return jsonb_build_object(
    'application', p_application,
    'platform', p_platform,
    'policy_configured', true,
    'update_required', v_update_required,
    'minimum_build_number', v_policy.minimum_build_number,
    'minimum_api_contract', v_policy.minimum_api_contract,
    'store_url', case when v_update_required then v_policy.store_url else null end,
    'user_message_key', case when v_update_required then v_policy.user_message_key else null end
  );
end
$$;

revoke all on function public.get_client_release_policy_v1(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_client_release_policy_v1(text, text, integer, integer) to anon, authenticated;
grant create on schema public to hungrie_api_owner;
alter function public.get_client_release_policy_v1(text, text, integer, integer) owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

comment on function public.get_client_release_policy_v1(text, text, integer, integer) is
  'Sanitized, spoofable client compatibility signal. It never grants database access.';
