-- Phase 4 canonical Admin surface. Existing Customer/Restaurant policies remain unchanged.

alter table private.account_provisioning_operations
  drop constraint account_provisioning_operations_operation_kind_check,
  add constraint account_provisioning_operations_operation_kind_check check (operation_kind in
    ('customer_bootstrap','invite_restaurant','invite_admin','accept_invite',
     'admin_onboarding','account_status','restaurant_status','restaurant_reassign',
     'admin_role','mfa_recovery','restaurant_create','incident_state','order_support'));

create function private.phase4_page_size(p_limit integer)
returns integer language sql immutable set search_path='' as $$
  select least(greatest(coalesce(p_limit,50),1),100)
$$;

create function private.phase4_page_offset(p_offset integer)
returns integer language sql immutable set search_path='' as $$
  select greatest(coalesce(p_offset,0),0)
$$;

create function public.admin_get_dashboard_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_active_admin('admin');
  return jsonb_build_object(
    'restaurants',jsonb_build_object(
      'total',(select count(*) from public.restaurants),
      'active',(select count(*) from public.restaurants where lifecycle_status='active'),
      'suspended',(select count(*) from public.restaurants where lifecycle_status='suspended')),
    'accounts',jsonb_build_object(
      'total',(select count(*) from private.account_access),
      'pending',(select count(*) from private.account_access where status='pending'),
      'suspended',(select count(*) from private.account_access where status='suspended')),
    'orders',jsonb_build_object(
      'open',(select count(*) from public.orders where status not in ('delivered','canceled')),
      'overdue',(select count(*) from public.orders where status='pending'
        and approval_deadline_at<statement_timestamp())),
    'incidents',jsonb_build_object(
      'open',(select count(*) from private.restaurant_operational_incidents
        where state<>'resolved')),
    'generatedAt',statement_timestamp()
  );
end $$;

create function public.admin_list_restaurants_v1(
  p_search text default null,p_status public.restaurant_lifecycle_status default null,
  p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=private.phase4_page_size(p_limit);
  v_offset integer:=private.phase4_page_offset(p_offset);
begin
  perform private.require_active_admin('admin');
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.name,x.id) from (
      select r.id,r.name,r.description,r.cuisine,r.address,r.phone,r.image_url,
        r.lifecycle_status,r.accepting_orders,r.suspension_reason_code,
        r.created_at,r.updated_at,
        (select count(*) from private.account_access a where a.account_type='restaurant'
          and a.restaurant_id=r.id and a.status<>'revoked')::integer as account_count
      from public.restaurants r
      where (p_status is null or r.lifecycle_status=p_status)
        and (nullif(btrim(coalesce(p_search,'')),'') is null
          or r.name ilike '%'||btrim(p_search)||'%'
          or r.id ilike '%'||btrim(p_search)||'%')
      order by r.name,r.id limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from public.restaurants r
      where (p_status is null or r.lifecycle_status=p_status)
        and (nullif(btrim(coalesce(p_search,'')),'') is null
          or r.name ilike '%'||btrim(p_search)||'%'
          or r.id ilike '%'||btrim(p_search)||'%')),
    'limit',v_limit,'offset',v_offset);
end $$;

create function public.admin_get_restaurant_v1(p_restaurant_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.require_active_admin('admin');
  select to_jsonb(x) into v_result from (
    select r.id,r.name,r.description,r.cuisine,r.address,r.phone,r.image_url,
      r.lifecycle_status,r.accepting_orders,r.suspension_reason_code,
      r.delivery_eta_min_minutes,r.delivery_eta_max_minutes,r.delivery_fee_kurus,
      r.minimum_order_kurus,r.opening_hours,r.preferred_language,r.created_at,r.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'profileId',a.profile_id,'name',p.name,'maskedEmail',
          case when position('@' in p.email)>1 then left(p.email,1)||'***'||substring(p.email from position('@' in p.email)) else null end,
        'role',a.restaurant_role,'status',a.status,'onboardingStep',a.onboarding_step)
        order by a.restaurant_role,a.profile_id)
        from private.account_access a join public.profiles p on p.id=a.profile_id
        where a.account_type='restaurant' and a.restaurant_id=r.id),'[]'::jsonb) as accounts
    from public.restaurants r where r.id=p_restaurant_id
  ) x;
  if v_result is null then raise exception 'Restaurant not found' using errcode='22023'; end if;
  return v_result;
end $$;

create function public.admin_list_accounts_v1(
  p_search text default null,p_type public.account_type default null,
  p_status private.account_status default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=private.phase4_page_size(p_limit);
  v_offset integer:=private.phase4_page_offset(p_offset);
begin
  perform private.require_active_admin('admin');
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.profile_id) from (
      select a.profile_id,p.name,
        case when position('@' in p.email)>1 then left(p.email,1)||'***'||substring(p.email from position('@' in p.email)) else null end as masked_email,
        a.account_type,a.status,a.onboarding_step,a.restaurant_id,a.restaurant_role,
        a.admin_role,a.admin_mfa_enrolled_at is not null as admin_mfa_enrolled,
        a.status_reason_code,a.authz_version,a.created_at,a.updated_at
      from private.account_access a join public.profiles p on p.id=a.profile_id
      where (p_type is null or a.account_type=p_type)
        and (p_status is null or a.status=p_status)
        and (nullif(btrim(coalesce(p_search,'')),'') is null
          or p.name ilike '%'||btrim(p_search)||'%'
          or p.email ilike '%'||btrim(p_search)||'%'
          or a.profile_id ilike '%'||btrim(p_search)||'%')
      order by a.created_at desc,a.profile_id limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from private.account_access a join public.profiles p on p.id=a.profile_id
      where (p_type is null or a.account_type=p_type)
        and (p_status is null or a.status=p_status)
        and (nullif(btrim(coalesce(p_search,'')),'') is null
          or p.name ilike '%'||btrim(p_search)||'%'
          or p.email ilike '%'||btrim(p_search)||'%'
          or a.profile_id ilike '%'||btrim(p_search)||'%')),
    'limit',v_limit,'offset',v_offset);
end $$;

create function public.admin_list_orders_v1(
  p_restaurant_id text default null,p_status public.order_status default null,
  p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=private.phase4_page_size(p_limit);
  v_offset integer:=private.phase4_page_offset(p_offset);
begin
  perform private.require_active_admin('admin');
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (
      select o.id,o.restaurant_id,r.name as restaurant_name,o.status,o.total_kurus,
        o.eta_minutes,o.approval_deadline_at,o.created_at,o.updated_at
      from public.orders o join public.restaurants r on r.id=o.restaurant_id
      where (p_restaurant_id is null or o.restaurant_id=p_restaurant_id)
        and (p_status is null or o.status=p_status)
      order by o.created_at desc,o.id limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from public.orders o
      where (p_restaurant_id is null or o.restaurant_id=p_restaurant_id)
        and (p_status is null or o.status=p_status)),
    'limit',v_limit,'offset',v_offset);
end $$;

create function public.admin_get_order_v1(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.require_active_admin('admin');
  select jsonb_build_object(
    'id',o.id,'restaurantId',o.restaurant_id,'restaurantName',r.name,
    'status',o.status,'totalKurus',o.total_kurus,'etaMinutes',o.eta_minutes,
    'approvalDeadlineAt',o.approval_deadline_at,'createdAt',o.created_at,'updatedAt',o.updated_at,
    'customer',jsonb_build_object('name',c.customer_name,'email',c.customer_email,
      'whatsapp',c.customer_whatsapp,'deliveryAddress',c.delivery_address_snapshot),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,
      'quantity',i.quantity,'unitPriceKurus',i.unit_price_kurus,
      'customizationTotalKurus',i.customization_total_kurus,
      'customizations',i.customizations_snapshot) order by i.created_at,i.id)
      from public.order_items i where i.order_id=o.id),'[]'::jsonb))
    into v_result
    from public.orders o join public.restaurants r on r.id=o.restaurant_id
    join private.order_contacts c on c.order_id=o.id where o.id=p_order_id;
  if v_result is null then raise exception 'Order not found' using errcode='22023'; end if;
  return v_result;
end $$;

create function public.admin_list_incidents_v1(
  p_state private.operational_incident_state default null,
  p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=private.phase4_page_size(p_limit);
  v_offset integer:=private.phase4_page_offset(p_offset);
begin
  perform private.require_active_admin('admin');
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)
    order by x.first_detected_at desc,x.id) from (
      select i.id,i.restaurant_id,r.name as restaurant_name,i.incident_type,i.state,
        i.window_started_at,i.window_ended_at,i.ignored_order_count,i.eligible_order_count,
        i.threshold_snapshot,i.first_detected_at,i.acknowledged_at,i.resolved_at,i.resolution_note
      from private.restaurant_operational_incidents i
      join public.restaurants r on r.id=i.restaurant_id
      where p_state is null or i.state=p_state
      order by i.first_detected_at desc,i.id limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from private.restaurant_operational_incidents i
      where p_state is null or i.state=p_state),'limit',v_limit,'offset',v_offset);
end $$;

create function public.admin_list_audit_v1(
  p_action text default null,p_target_type text default null,
  p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=private.phase4_page_size(p_limit);
  v_offset integer:=private.phase4_page_offset(p_offset);
begin
  perform private.require_active_admin('admin');
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)
    order by x.created_at desc,x.id) from (
      select l.id,l.actor_profile_id,l.action,l.target_type,l.target_id,l.metadata,l.created_at
      from private.audit_log l
      where (nullif(btrim(coalesce(p_action,'')),'') is null or l.action=p_action)
        and (nullif(btrim(coalesce(p_target_type,'')),'') is null or l.target_type=p_target_type)
      order by l.created_at desc,l.id limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from private.audit_log l
      where (nullif(btrim(coalesce(p_action,'')),'') is null or l.action=p_action)
        and (nullif(btrim(coalesce(p_target_type,'')),'') is null or l.target_type=p_target_type)),
    'limit',v_limit,'offset',v_offset);
end $$;

create function public.admin_create_restaurant_v1(p_name text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text; v_id text:=gen_random_uuid()::text; v_result jsonb;
begin
  v_actor:=private.require_active_admin('admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  if btrim(coalesce(p_name,''))='' or length(btrim(p_name))>160 then
    raise exception 'Valid restaurant name required' using errcode='22023';
  end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'restaurant_create',
    encode(extensions.digest(btrim(p_name),'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  insert into public.restaurants(id,name,is_active,lifecycle_status,accepting_orders,
    description,cuisine,address,delivery_fee_kurus,minimum_order_kurus,opening_hours,preferred_language)
  values(v_id,btrim(p_name),false,'pending',false,'','','',0,0,'{}'::jsonb,'tr');
  perform private.write_audit(v_actor,'restaurant.created','restaurant',v_id,
    jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('restaurantId',v_id,'status','pending'),null);
end $$;

create function public.admin_set_incident_state_v1(
  p_incident_id uuid,p_state private.operational_incident_state,
  p_resolution_note text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text; v_old private.operational_incident_state; v_result jsonb;
begin
  v_actor:=private.require_active_admin('admin');
  if p_state not in ('acknowledged','resolved') then
    raise exception 'Supported incident state required' using errcode='22023';
  end if;
  if p_state='resolved' and btrim(coalesce(p_resolution_note,''))='' then
    raise exception 'Resolution note required' using errcode='22023';
  end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'incident_state',
    encode(extensions.digest(p_incident_id::text||':'||p_state::text||':'||
      coalesce(p_resolution_note,''),'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select state into v_old from private.restaurant_operational_incidents
    where id=p_incident_id for update;
  if not found or v_old='resolved' or (v_old='acknowledged' and p_state='acknowledged') then
    raise exception 'Incident transition unavailable' using errcode='22023';
  end if;
  update private.restaurant_operational_incidents set state=p_state,
    acknowledged_by_profile_id=case when p_state='acknowledged' then v_actor else acknowledged_by_profile_id end,
    acknowledged_at=case when p_state='acknowledged' then statement_timestamp() else acknowledged_at end,
    resolved_by_profile_id=case when p_state='resolved' then v_actor else null end,
    resolved_at=case when p_state='resolved' then statement_timestamp() else null end,
    resolution_note=case when p_state='resolved' then btrim(p_resolution_note) else resolution_note end
    where id=p_incident_id;
  perform private.write_audit(v_actor,'incident.'||p_state::text,'operational_incident',
    p_incident_id::text,jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('incidentId',p_incident_id,'state',p_state),null);
end $$;

create function public.admin_resolve_order_v1(
  p_order_id text,p_resolution text,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text; v_order public.orders%rowtype; v_target public.order_status; v_result jsonb;
begin
  v_actor:=private.require_active_admin('admin');
  perform private.require_recent_admin_auth(interval '5 minutes');
  if p_resolution not in ('cancel','confirm_delivered') or btrim(coalesce(p_reason,''))=''
    or length(p_reason)>500 then raise exception 'Valid support resolution required' using errcode='22023'; end if;
  v_result:=private.phase2_operation_begin(p_operation_id,'order_support',
    encode(extensions.digest(p_order_id||':'||p_resolution||':'||p_reason,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status in ('delivered','canceled') then
    raise exception 'Order resolution unavailable' using errcode='22023';
  end if;
  v_target:=case when p_resolution='cancel' then 'canceled'::public.order_status
    else 'delivered'::public.order_status end;
  if v_target='delivered' and v_order.status<>'out_for_delivery' then
    raise exception 'Only dispatched orders may be verified delivered' using errcode='22023';
  end if;
  update public.orders set status=v_target,reminder_pending=false,
    delivered_at=case when v_target='delivered' then statement_timestamp() else delivered_at end,
    canceled_at=case when v_target='canceled' then statement_timestamp() else canceled_at end
    where id=p_order_id;
  insert into private.order_status_history(order_id,previous_status,new_status,
    changed_by_profile_id,source,reason)
  values(p_order_id,v_order.status,v_target,v_actor,'admin_support',btrim(p_reason));
  perform private.write_audit(v_actor,'order.support_resolved','order',p_order_id,
    jsonb_build_object('operation_id',p_operation_id,'from',v_order.status,
      'to',v_target,'reason',btrim(p_reason)));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('orderId',p_order_id,'status',v_target),null);
end $$;

create function public.server_record_admin_mfa_enrollment_v1(
  p_firebase_uid text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if coalesce(private.request_jwt()->>'role','')<>'service_role' then
    raise exception 'Trusted service required' using errcode='42501';
  end if;
  return private.phase2_record_admin_mfa_enrollment(p_firebase_uid,p_operation_id);
end $$;

create function public.server_get_firebase_uid_v1(p_profile_id text)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_uid text;
begin
  if coalesce(private.request_jwt()->>'role','')<>'service_role' then
    raise exception 'Trusted service required' using errcode='42501';
  end if;
  select firebase_uid into v_uid from public.profiles where id=p_profile_id
    and deletion_pending_at is null and deleted_at is null;
  if v_uid is null then raise exception 'Profile identity unavailable' using errcode='22023'; end if;
  return v_uid;
end $$;

grant create on schema private,public to hungrie_api_owner;
alter function private.phase4_page_size(integer) owner to hungrie_api_owner;
alter function private.phase4_page_offset(integer) owner to hungrie_api_owner;
alter function public.admin_get_dashboard_v1() owner to hungrie_api_owner;
alter function public.admin_list_restaurants_v1(text,public.restaurant_lifecycle_status,integer,integer) owner to hungrie_api_owner;
alter function public.admin_get_restaurant_v1(text) owner to hungrie_api_owner;
alter function public.admin_list_accounts_v1(text,public.account_type,private.account_status,integer,integer) owner to hungrie_api_owner;
alter function public.admin_list_orders_v1(text,public.order_status,integer,integer) owner to hungrie_api_owner;
alter function public.admin_get_order_v1(text) owner to hungrie_api_owner;
alter function public.admin_list_incidents_v1(private.operational_incident_state,integer,integer) owner to hungrie_api_owner;
alter function public.admin_list_audit_v1(text,text,integer,integer) owner to hungrie_api_owner;
alter function public.admin_create_restaurant_v1(text,uuid) owner to hungrie_api_owner;
alter function public.admin_set_incident_state_v1(uuid,private.operational_incident_state,text,uuid) owner to hungrie_api_owner;
alter function public.admin_resolve_order_v1(text,text,text,uuid) owner to hungrie_api_owner;
alter function public.server_record_admin_mfa_enrollment_v1(text,uuid) owner to hungrie_api_owner;
alter function public.server_get_firebase_uid_v1(text) owner to hungrie_api_owner;
revoke create on schema private,public from hungrie_api_owner;

revoke all on function private.phase4_page_size(integer),private.phase4_page_offset(integer)
  from public,anon,authenticated,service_role;
grant execute on function private.phase4_page_size(integer),private.phase4_page_offset(integer)
  to hungrie_api_owner;

revoke all on function public.admin_get_dashboard_v1(),
  public.admin_list_restaurants_v1(text,public.restaurant_lifecycle_status,integer,integer),
  public.admin_get_restaurant_v1(text),
  public.admin_list_accounts_v1(text,public.account_type,private.account_status,integer,integer),
  public.admin_list_orders_v1(text,public.order_status,integer,integer),
  public.admin_get_order_v1(text),
  public.admin_list_incidents_v1(private.operational_incident_state,integer,integer),
  public.admin_list_audit_v1(text,text,integer,integer),
  public.admin_create_restaurant_v1(text,uuid),
  public.admin_set_incident_state_v1(uuid,private.operational_incident_state,text,uuid),
  public.admin_resolve_order_v1(text,text,text,uuid),
  public.server_record_admin_mfa_enrollment_v1(text,uuid),
  public.server_get_firebase_uid_v1(text)
  from public,anon,authenticated,service_role;

grant execute on function public.admin_get_dashboard_v1(),
  public.admin_list_restaurants_v1(text,public.restaurant_lifecycle_status,integer,integer),
  public.admin_get_restaurant_v1(text),
  public.admin_list_accounts_v1(text,public.account_type,private.account_status,integer,integer),
  public.admin_list_orders_v1(text,public.order_status,integer,integer),
  public.admin_get_order_v1(text),
  public.admin_list_incidents_v1(private.operational_incident_state,integer,integer),
  public.admin_list_audit_v1(text,text,integer,integer),
  public.admin_create_restaurant_v1(text,uuid),
  public.admin_set_incident_state_v1(uuid,private.operational_incident_state,text,uuid),
  public.admin_resolve_order_v1(text,text,text,uuid)
  to authenticated;
grant execute on function public.server_record_admin_mfa_enrollment_v1(text,uuid)
  to service_role;
grant execute on function public.server_get_firebase_uid_v1(text) to service_role;

-- Phase 2 operations become callable only through their own canonical guards.
grant execute on function public.complete_my_admin_onboarding_v1(uuid),
  public.admin_set_account_status_v1(text,private.account_status,text,uuid),
  public.admin_set_restaurant_status_v1(text,public.restaurant_lifecycle_status,text,uuid),
  public.admin_reassign_restaurant_account_v1(text,text,public.restaurant_role,uuid),
  public.admin_change_admin_role_v1(text,private.admin_account_role,uuid),
  public.admin_record_mfa_recovery_v1(text,text,uuid),
  public.admin_invite_restaurant_account_v1(text,text,public.restaurant_role,text,uuid),
  public.admin_invite_admin_account_v1(text,private.admin_account_role,text,uuid),
  public.accept_my_account_invitation_v1(text,uuid)
  to authenticated;

comment on function public.admin_get_dashboard_v1() is
  'Phase 4 canonical Admin summary; requires active MFA-authenticated Admin.';
