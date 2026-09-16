begin;

create function private.customer_cancellation_reason_code(p_order_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.status <> 'canceled'::public.order_status then null
    else coalesce((
      select case
        when h.source = 'restaurant' then
          case split_part(coalesce(h.reason, ''), ':', 1)
            when 'too_busy' then 'too_busy'
            when 'item_unavailable' then 'item_unavailable'
            when 'closing' then 'closing'
            when 'equipment_issue' then 'equipment_issue'
            when 'delivery_unavailable' then 'delivery_unavailable'
            else 'other'
          end
        when h.source = 'system' and h.reason = 'approval_deadline_expired' then 'approval_deadline_expired'
        when h.source = 'customer' then 'customer_canceled'
        when h.source = 'admin_support' then 'support_canceled'
        else 'other'
      end
      from private.order_status_history h
      where h.order_id = o.id and h.new_status = 'canceled'::public.order_status
      order by h.created_at desc, h.id desc
      limit 1
    ), 'other')
  end
  from public.orders o
  where o.id = p_order_id
$$;

grant create on schema private to hungrie_api_owner;
alter function private.customer_cancellation_reason_code(text) owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
revoke all on function private.customer_cancellation_reason_code(text) from public, anon, authenticated, service_role;
grant execute on function private.customer_cancellation_reason_code(text) to hungrie_api_owner;

create or replace function private.order_api_json(p_order_id text, p_include_items boolean default true)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id,
    'restaurant_id', o.restaurant_id,
    'restaurant_name', r.name,
    'status', o.status,
    'cancellation_reason_code', private.customer_cancellation_reason_code(o.id),
    'payment_method', o.payment_method,
    'notes', o.notes,
    'subtotal_kurus', o.subtotal_kurus,
    'delivery_fee_kurus', o.delivery_fee_kurus,
    'service_fee_kurus', o.service_fee_kurus,
    'discount_kurus', o.discount_kurus,
    'tip_kurus', o.tip_kurus,
    'total_kurus', o.total_kurus,
    'eta_minutes', o.eta_minutes,
    'approval_deadline_at', o.approval_deadline_at,
    'reminder_pending', o.reminder_pending,
    'reminder_requested_at', o.reminder_requested_at,
    'preparing_at', o.preparing_at,
    'ready_at', o.ready_at,
    'out_for_delivery_at', o.out_for_delivery_at,
    'delivered_at', o.delivered_at,
    'canceled_at', o.canceled_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'customer_name', private.authorized_order_contact(o.id) ->> 'customer_name',
    'customer_email', private.authorized_order_contact(o.id) ->> 'customer_email',
    'customer_whatsapp', private.authorized_order_contact(o.id) ->> 'customer_whatsapp',
    'delivery_address_snapshot', private.authorized_order_contact(o.id) -> 'delivery_address_snapshot',
    'items', case when p_include_items then private.order_items_json(o.id) else null end
  ))
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_order_id
$$;

alter function private.order_api_json(text, boolean) owner to hungrie_api_owner;
revoke all on function private.order_api_json(text, boolean) from public, anon, authenticated, service_role;
grant execute on function private.order_api_json(text, boolean) to hungrie_api_owner;

commit;
