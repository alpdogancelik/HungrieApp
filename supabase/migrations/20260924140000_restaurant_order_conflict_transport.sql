-- Transport application-level optimistic concurrency conflicts without asking
-- PostgREST 14 to retry them as database serialization failures.

begin;

create function private.raise_restaurant_order_conflict_v1(p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code', '40001',
      'message', p_message,
      'details', null,
      'hint', null
    )::text,
    detail = '{"status":409,"headers":{}}';
end
$$;

create or replace function public.restaurant_acknowledge_order_seen_v1(
  p_order_id text,p_order_version timestamptz,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_digest text; v_result jsonb;
begin
  v_digest:=encode(extensions.digest(p_order_id||':'||p_order_version::text,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'order_seen',v_digest); if v_result is not null then return v_result; end if;
  if not exists(select 1 from public.orders where id=p_order_id and restaurant_id=v_restaurant and updated_at=p_order_version) then
    perform private.raise_restaurant_order_conflict_v1('Order version unavailable');
  end if;
  insert into private.restaurant_order_visibility(order_id,profile_id,order_version)
  values(p_order_id,v_actor,p_order_version) on conflict(order_id,profile_id) do update
    set order_version=excluded.order_version,last_seen_at=statement_timestamp();
  v_result:=jsonb_build_object('orderId',p_order_id,'seen',true);
  perform private.phase5_operation(p_operation_id,'order_seen',v_digest,v_result); return v_result;
end $$;

create or replace function public.restaurant_transition_order_v1(
  p_order_id text,p_expected_version timestamptz,p_new_status text,
  p_reason_code text default null,p_note text default null,p_operation_id uuid default gen_random_uuid())
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_order public.orders%rowtype; v_target public.order_status; v_digest text; v_result jsonb;
begin
  if p_new_status not in ('preparing','ready','out_for_delivery','delivered','canceled') then
    raise exception 'Unsupported order status' using errcode='22023'; end if;
  v_target:=p_new_status::public.order_status;
  if length(coalesce(p_note,''))>500 then raise exception 'Note is too long' using errcode='22023'; end if;
  if v_target='canceled' and (p_reason_code is null or p_reason_code not in
    ('too_busy','item_unavailable','closing','equipment_issue','delivery_unavailable','other')) then
    raise exception 'Cancellation reason required' using errcode='22023'; end if;
  v_digest:=encode(extensions.digest(concat_ws(':',p_order_id,p_expected_version,p_new_status,p_reason_code,p_note),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'order_transition',v_digest); if v_result is not null then return v_result; end if;
  select * into v_order from public.orders where id=p_order_id and restaurant_id=v_restaurant for update;
  if not found then raise exception 'Order unavailable' using errcode='42501'; end if;
  if v_order.updated_at<>p_expected_version then
    perform private.raise_restaurant_order_conflict_v1('Order changed; refresh and retry');
  end if;
  if v_order.status='pending' and v_order.approval_deadline_at<=statement_timestamp() then
    update public.orders set status='canceled',canceled_at=statement_timestamp(),reminder_pending=false where id=p_order_id;
    insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source,reason)
      values(p_order_id,'pending','canceled',null,'system','approval_deadline_expired');
    v_result:=jsonb_build_object('orderId',p_order_id,'status','canceled','version',
      (select updated_at from public.orders where id=p_order_id),'reasonCode','approval_deadline_expired');
    perform private.phase5_operation(p_operation_id,'order_transition',v_digest,v_result);return v_result;
  end if;
  if not ((v_order.status='pending' and v_target in ('preparing','canceled'))
    or (v_order.status='preparing' and v_target in ('ready','out_for_delivery','canceled'))
    or (v_order.status='ready' and v_target in ('out_for_delivery','canceled'))
    or (v_order.status='out_for_delivery' and v_target in ('delivered','canceled'))) then
    raise exception 'Invalid order transition' using errcode='22023'; end if;
  update public.orders set status=v_target,reminder_pending=false,
    preparing_at=case when v_target='preparing' then coalesce(preparing_at,statement_timestamp()) else preparing_at end,
    ready_at=case when v_target='ready' then coalesce(ready_at,statement_timestamp()) else ready_at end,
    out_for_delivery_at=case when v_target='out_for_delivery' then coalesce(out_for_delivery_at,statement_timestamp()) else out_for_delivery_at end,
    delivered_at=case when v_target='delivered' then coalesce(delivered_at,statement_timestamp()) else delivered_at end,
    canceled_at=case when v_target='canceled' then coalesce(canceled_at,statement_timestamp()) else canceled_at end
    where id=p_order_id returning updated_at into p_expected_version;
  insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source,reason)
    values(p_order_id,v_order.status,v_target,v_actor,'restaurant',
      case when v_target='canceled' then p_reason_code||coalesce(':'||nullif(btrim(p_note),''),'') else null end);
  perform private.write_audit(v_actor,'restaurant.order_transitioned','order',p_order_id,
    jsonb_build_object('operation_id',p_operation_id,'from',v_order.status,'to',v_target,'reasonCode',p_reason_code));
  v_result:=jsonb_build_object('orderId',p_order_id,'status',v_target,'version',p_expected_version);
  perform private.phase5_operation(p_operation_id,'order_transition',v_digest,v_result); return v_result;
end $$;

grant create on schema private,public to hungrie_api_owner;
alter function private.raise_restaurant_order_conflict_v1(text) owner to hungrie_api_owner;
alter function public.restaurant_acknowledge_order_seen_v1(text,timestamptz,uuid) owner to hungrie_api_owner;
alter function public.restaurant_transition_order_v1(text,timestamptz,text,text,text,uuid) owner to hungrie_api_owner;
revoke create on schema private,public from hungrie_api_owner;

revoke all on function private.raise_restaurant_order_conflict_v1(text)
  from public,anon,authenticated,service_role;

commit;
