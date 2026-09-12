-- Development decision: restaurants manage their own couriers. A restaurant
-- member hands an accepted order to the restaurant's courier and closes the
-- delivery; no separate courier claim is required.

create or replace function public.transition_order(
  p_order_id text,
  p_new_status public.order_status,
  p_reason text default null
)
returns public.order_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_order public.orders%rowtype;
  v_allowed boolean := false;
  v_source text;
begin
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'Transition reason is too long' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status in ('delivered', 'canceled') or v_order.status = p_new_status then
    raise exception 'Invalid order transition' using errcode = '22023';
  end if;

  if private.is_admin() then
    v_source := 'admin';
    v_allowed := (v_order.status, p_new_status) in (
      ('pending', 'preparing'), ('pending', 'canceled'),
      ('preparing', 'ready'), ('preparing', 'out_for_delivery'), ('preparing', 'canceled'),
      ('ready', 'out_for_delivery'), ('ready', 'canceled'),
      ('out_for_delivery', 'delivered'), ('out_for_delivery', 'canceled')
    );
  elsif v_order.profile_id = v_actor then
    v_source := 'customer';
    v_allowed := v_order.status = 'pending' and p_new_status = 'canceled';
  elsif private.is_restaurant_member(v_order.restaurant_id) then
    v_source := 'restaurant';
    v_allowed := (v_order.status, p_new_status) in (
      ('pending', 'preparing'), ('pending', 'canceled'),
      ('preparing', 'out_for_delivery'), ('preparing', 'canceled'),
      ('ready', 'out_for_delivery'), ('ready', 'canceled'),
      ('out_for_delivery', 'delivered'), ('out_for_delivery', 'canceled')
    );
  elsif v_order.courier_profile_id = v_actor
        and private.is_restaurant_courier(v_order.restaurant_id) then
    v_source := 'courier';
    v_allowed := v_order.status = 'out_for_delivery' and p_new_status = 'delivered';
  end if;

  if not v_allowed then
    raise exception 'Caller is not allowed to perform this transition'
      using errcode = '42501';
  end if;

  update public.orders set
    status = p_new_status,
    reminder_pending = false,
    preparing_at = case when p_new_status = 'preparing' and preparing_at is null
      then statement_timestamp() else preparing_at end,
    ready_at = case when p_new_status = 'ready' and ready_at is null
      then statement_timestamp() else ready_at end,
    out_for_delivery_at = case when p_new_status = 'out_for_delivery' and out_for_delivery_at is null
      then statement_timestamp() else out_for_delivery_at end,
    delivered_at = case when p_new_status = 'delivered' and delivered_at is null
      then statement_timestamp() else delivered_at end,
    canceled_at = case when p_new_status = 'canceled' and canceled_at is null
      then statement_timestamp() else canceled_at end
  where id = p_order_id;

  insert into private.order_status_history (
    order_id, previous_status, new_status, changed_by_profile_id, source, reason
  ) values (p_order_id, v_order.status, p_new_status, v_actor, v_source,
    nullif(btrim(coalesce(p_reason, '')), ''));
  perform private.write_audit(v_actor, 'order.transitioned', 'order', p_order_id,
    jsonb_build_object('from', v_order.status, 'to', p_new_status, 'source', v_source));
  return p_new_status;
end
$$;

alter function public.transition_order(text, public.order_status, text) owner to hungrie_api_owner;
