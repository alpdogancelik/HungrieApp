-- Public RPC signatures must not require authenticated callers to resolve types
-- in the private schema. Keep the typed implementations private and expose text
-- parameters through guarded owner-executed wrappers.

revoke execute on function public.admin_set_account_status_v1(text,private.account_status,text,uuid),
  public.admin_change_admin_role_v1(text,private.admin_account_role,uuid),
  public.admin_invite_admin_account_v1(text,private.admin_account_role,text,uuid),
  public.admin_list_accounts_v1(text,public.account_type,private.account_status,integer,integer),
  public.admin_list_incidents_v1(private.operational_incident_state,integer,integer),
  public.admin_set_incident_state_v1(uuid,private.operational_incident_state,text,uuid)
  from public,anon,authenticated,service_role;

alter function public.admin_set_account_status_v1(text,private.account_status,text,uuid)
  set schema private;
alter function private.admin_set_account_status_v1(text,private.account_status,text,uuid)
  rename to phase4_admin_set_account_status_typed;
alter function public.admin_change_admin_role_v1(text,private.admin_account_role,uuid)
  set schema private;
alter function private.admin_change_admin_role_v1(text,private.admin_account_role,uuid)
  rename to phase4_admin_change_admin_role_typed;
alter function public.admin_invite_admin_account_v1(text,private.admin_account_role,text,uuid)
  set schema private;
alter function private.admin_invite_admin_account_v1(text,private.admin_account_role,text,uuid)
  rename to phase4_admin_invite_admin_account_typed;
alter function public.admin_list_accounts_v1(text,public.account_type,private.account_status,integer,integer)
  set schema private;
alter function private.admin_list_accounts_v1(text,public.account_type,private.account_status,integer,integer)
  rename to phase4_admin_list_accounts_typed;
alter function public.admin_list_incidents_v1(private.operational_incident_state,integer,integer)
  set schema private;
alter function private.admin_list_incidents_v1(private.operational_incident_state,integer,integer)
  rename to phase4_admin_list_incidents_typed;
alter function public.admin_set_incident_state_v1(uuid,private.operational_incident_state,text,uuid)
  set schema private;
alter function private.admin_set_incident_state_v1(uuid,private.operational_incident_state,text,uuid)
  rename to phase4_admin_set_incident_state_typed;

create function public.admin_set_account_status_v1(p_profile_id text,p_status text,
  p_reason_code text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_status is null or p_status not in ('active','suspended','revoked') then
    raise exception 'Supported status required' using errcode='22023';
  end if;
  return private.phase4_admin_set_account_status_typed(
    p_profile_id,p_status::private.account_status,p_reason_code,p_operation_id);
end $$;

create function public.admin_change_admin_role_v1(p_profile_id text,p_admin_role text,
  p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_admin_role is null or p_admin_role not in ('admin','super_admin') then
    raise exception 'Supported Admin role required' using errcode='22023';
  end if;
  return private.phase4_admin_change_admin_role_typed(
    p_profile_id,p_admin_role::private.admin_account_role,p_operation_id);
end $$;

create function public.admin_invite_admin_account_v1(p_email text,p_admin_role text,
  p_token_digest text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_admin_role is null or p_admin_role not in ('admin','super_admin') then
    raise exception 'Supported Admin role required' using errcode='22023';
  end if;
  return private.phase4_admin_invite_admin_account_typed(
    p_email,p_admin_role::private.admin_account_role,p_token_digest,p_operation_id);
end $$;

create function public.admin_list_accounts_v1(p_search text default null,
  p_type public.account_type default null,p_status text default null,
  p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_status is not null and p_status not in ('pending','active','suspended','revoked') then
    raise exception 'Supported account status required' using errcode='22023';
  end if;
  return private.phase4_admin_list_accounts_typed(
    p_search,p_type,p_status::private.account_status,p_limit,p_offset);
end $$;

create function public.admin_list_incidents_v1(p_state text default null,
  p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_state is not null and p_state not in ('open','acknowledged','resolved') then
    raise exception 'Supported incident state required' using errcode='22023';
  end if;
  return private.phase4_admin_list_incidents_typed(
    p_state::private.operational_incident_state,p_limit,p_offset);
end $$;

create function public.admin_set_incident_state_v1(p_incident_id uuid,p_state text,
  p_resolution_note text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('acknowledged','resolved') then
    raise exception 'Supported incident state required' using errcode='22023';
  end if;
  return private.phase4_admin_set_incident_state_typed(
    p_incident_id,p_state::private.operational_incident_state,p_resolution_note,p_operation_id);
end $$;

grant create on schema public to hungrie_api_owner;
alter function public.admin_set_account_status_v1(text,text,text,uuid)
  owner to hungrie_api_owner;
alter function public.admin_change_admin_role_v1(text,text,uuid)
  owner to hungrie_api_owner;
alter function public.admin_invite_admin_account_v1(text,text,text,uuid)
  owner to hungrie_api_owner;
alter function public.admin_list_accounts_v1(text,public.account_type,text,integer,integer)
  owner to hungrie_api_owner;
alter function public.admin_list_incidents_v1(text,integer,integer)
  owner to hungrie_api_owner;
alter function public.admin_set_incident_state_v1(uuid,text,text,uuid)
  owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

revoke all on function private.phase4_admin_set_account_status_typed(text,private.account_status,text,uuid),
  private.phase4_admin_change_admin_role_typed(text,private.admin_account_role,uuid),
  private.phase4_admin_invite_admin_account_typed(text,private.admin_account_role,text,uuid),
  private.phase4_admin_list_accounts_typed(text,public.account_type,private.account_status,integer,integer),
  private.phase4_admin_list_incidents_typed(private.operational_incident_state,integer,integer),
  private.phase4_admin_set_incident_state_typed(uuid,private.operational_incident_state,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.phase4_admin_set_account_status_typed(text,private.account_status,text,uuid),
  private.phase4_admin_change_admin_role_typed(text,private.admin_account_role,uuid),
  private.phase4_admin_invite_admin_account_typed(text,private.admin_account_role,text,uuid),
  private.phase4_admin_list_accounts_typed(text,public.account_type,private.account_status,integer,integer),
  private.phase4_admin_list_incidents_typed(private.operational_incident_state,integer,integer),
  private.phase4_admin_set_incident_state_typed(uuid,private.operational_incident_state,text,uuid)
  to hungrie_api_owner;

revoke all on function public.admin_set_account_status_v1(text,text,text,uuid),
  public.admin_change_admin_role_v1(text,text,uuid),
  public.admin_invite_admin_account_v1(text,text,text,uuid),
  public.admin_list_accounts_v1(text,public.account_type,text,integer,integer),
  public.admin_list_incidents_v1(text,integer,integer),
  public.admin_set_incident_state_v1(uuid,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_set_account_status_v1(text,text,text,uuid),
  public.admin_change_admin_role_v1(text,text,uuid),
  public.admin_invite_admin_account_v1(text,text,text,uuid),
  public.admin_list_accounts_v1(text,public.account_type,text,integer,integer),
  public.admin_list_incidents_v1(text,integer,integer),
  public.admin_set_incident_state_v1(uuid,text,text,uuid)
  to authenticated;

comment on function public.admin_invite_admin_account_v1(text,text,text,uuid) is
  'Phase 4 canonical Admin invitation; public signature does not expose private schema types.';
