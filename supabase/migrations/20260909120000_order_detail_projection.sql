-- Include customer-visible detail fields in the existing authorized order projection.
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
revoke all on function private.order_api_json(text, boolean) from public, anon, authenticated;
