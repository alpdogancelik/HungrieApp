-- Replace security-definer views with security-invoker views. Narrow private
-- helpers perform only the protected contact/membership lookup after applying
-- caller authorization.

grant create on schema public, private to hungrie_api_owner;

create or replace function private.authorized_order_contact(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_contact private.order_contacts%rowtype;
  v_actor text := private.current_profile_id();
begin
  if v_actor is null then return null; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then return null; end if;
  if not (
    v_order.profile_id = v_actor
    or private.is_admin()
    or (
      v_order.status not in ('delivered', 'canceled')
      and (
        private.is_restaurant_member(v_order.restaurant_id)
        or (
          v_order.courier_profile_id = v_actor
          and private.is_restaurant_courier(v_order.restaurant_id)
        )
      )
    )
  ) then
    return null;
  end if;
  select * into v_contact from private.order_contacts where order_id = p_order_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'customer_name', v_contact.customer_name,
    'customer_email', v_contact.customer_email,
    'customer_whatsapp', v_contact.customer_whatsapp,
    'delivery_address_snapshot', v_contact.delivery_address_snapshot
  );
end
$$;

create or replace function private.current_restaurant_memberships()
returns table (
  restaurant_id text,
  role public.restaurant_role,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select rm.restaurant_id, rm.role, rm.created_at, rm.updated_at
  from private.restaurant_members rm
  where rm.profile_id = private.current_profile_id()
$$;

create or replace function private.is_order_customer(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.profile_id = private.current_profile_id()
  )
$$;

create or replace function private.is_order_assigned_courier(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.courier_profile_id = private.current_profile_id()
      and private.is_restaurant_courier(o.restaurant_id)
  )
$$;

create or replace function private.is_order_available_to_courier(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.status = 'ready'
      and o.courier_profile_id is null
      and private.is_restaurant_courier(o.restaurant_id)
  )
$$;

alter function private.authorized_order_contact(text) owner to hungrie_api_owner;
alter function private.current_restaurant_memberships() owner to hungrie_api_owner;
alter function private.is_order_customer(text) owner to hungrie_api_owner;
alter function private.is_order_assigned_courier(text) owner to hungrie_api_owner;
alter function private.is_order_available_to_courier(text) owner to hungrie_api_owner;
grant execute on function private.authorized_order_contact(text),
  private.current_restaurant_memberships(), private.is_order_customer(text),
  private.is_order_assigned_courier(text), private.is_order_available_to_courier(text)
  to authenticated, hungrie_api_owner;
revoke all on function private.authorized_order_contact(text),
  private.current_restaurant_memberships(), private.is_order_customer(text),
  private.is_order_assigned_courier(text), private.is_order_available_to_courier(text)
  from public, anon;

create policy orders_courier_available_select on public.orders for select to authenticated
  using (
    status = 'ready'::public.order_status
    and courier_profile_id is null
    and private.is_restaurant_courier(restaurant_id)
  );

drop view public.my_orders;
drop view public.restaurant_orders;
drop view public.courier_available_orders;
drop view public.courier_assigned_orders;
drop view public.admin_orders;
drop view public.my_restaurant_memberships;

create view public.my_orders
with (security_invoker = true, security_barrier = true)
as
select
  o.id, o.restaurant_id, o.status, o.payment_method,
  o.subtotal_kurus, o.delivery_fee_kurus, o.service_fee_kurus,
  o.discount_kurus, o.tip_kurus, o.total_kurus, o.eta_minutes,
  o.approval_deadline_at, o.reminder_pending, o.reminder_requested_at,
  o.preparing_at, o.ready_at, o.out_for_delivery_at, o.delivered_at,
  o.canceled_at, o.created_at, o.updated_at,
  private.authorized_order_contact(o.id) ->> 'customer_name' as customer_name,
  private.authorized_order_contact(o.id) ->> 'customer_email' as customer_email,
  private.authorized_order_contact(o.id) ->> 'customer_whatsapp' as customer_whatsapp,
  private.authorized_order_contact(o.id) -> 'delivery_address_snapshot' as delivery_address_snapshot
from public.orders o
where private.is_order_customer(o.id);

create view public.restaurant_orders
with (security_invoker = true, security_barrier = true)
as
select
  o.id, o.restaurant_id, o.status, o.payment_method,
  o.subtotal_kurus, o.delivery_fee_kurus, o.service_fee_kurus,
  o.discount_kurus, o.tip_kurus, o.total_kurus, o.eta_minutes,
  o.approval_deadline_at, o.reminder_pending, o.reminder_requested_at,
  o.preparing_at, o.ready_at, o.out_for_delivery_at, o.delivered_at,
  o.canceled_at, o.created_at, o.updated_at,
  private.authorized_order_contact(o.id) ->> 'customer_name' as customer_name,
  private.authorized_order_contact(o.id) ->> 'customer_email' as customer_email,
  private.authorized_order_contact(o.id) ->> 'customer_whatsapp' as customer_whatsapp,
  private.authorized_order_contact(o.id) -> 'delivery_address_snapshot' as delivery_address_snapshot
from public.orders o
where private.is_restaurant_member(o.restaurant_id);

create view public.courier_available_orders
with (security_invoker = true, security_barrier = true)
as
select o.id, o.restaurant_id, o.status, o.eta_minutes, o.created_at, o.updated_at
from public.orders o
where o.status = 'ready'::public.order_status
  and private.is_order_available_to_courier(o.id);

create view public.courier_assigned_orders
with (security_invoker = true, security_barrier = true)
as
select
  o.id, o.restaurant_id, o.status, o.payment_method,
  o.subtotal_kurus, o.delivery_fee_kurus, o.service_fee_kurus,
  o.discount_kurus, o.tip_kurus, o.total_kurus, o.eta_minutes,
  o.approval_deadline_at, o.reminder_pending, o.reminder_requested_at,
  o.preparing_at, o.ready_at, o.out_for_delivery_at, o.delivered_at,
  o.canceled_at, o.created_at, o.updated_at,
  private.authorized_order_contact(o.id) ->> 'customer_name' as customer_name,
  private.authorized_order_contact(o.id) ->> 'customer_email' as customer_email,
  private.authorized_order_contact(o.id) ->> 'customer_whatsapp' as customer_whatsapp,
  private.authorized_order_contact(o.id) -> 'delivery_address_snapshot' as delivery_address_snapshot
from public.orders o
where private.is_order_assigned_courier(o.id);

create view public.admin_orders
with (security_invoker = true, security_barrier = true)
as
select
  o.id, o.restaurant_id, o.status, o.payment_method,
  o.subtotal_kurus, o.delivery_fee_kurus, o.service_fee_kurus,
  o.discount_kurus, o.tip_kurus, o.total_kurus, o.eta_minutes,
  o.approval_deadline_at, o.reminder_pending, o.reminder_requested_at,
  o.preparing_at, o.ready_at, o.out_for_delivery_at, o.delivered_at,
  o.canceled_at, o.created_at, o.updated_at,
  private.authorized_order_contact(o.id) ->> 'customer_name' as customer_name,
  private.authorized_order_contact(o.id) ->> 'customer_email' as customer_email,
  private.authorized_order_contact(o.id) ->> 'customer_whatsapp' as customer_whatsapp,
  private.authorized_order_contact(o.id) -> 'delivery_address_snapshot' as delivery_address_snapshot
from public.orders o
where private.is_admin();

create view public.my_restaurant_memberships
with (security_invoker = true, security_barrier = true)
as
select * from private.current_restaurant_memberships();

grant select on public.my_orders, public.restaurant_orders,
  public.courier_available_orders, public.courier_assigned_orders,
  public.admin_orders, public.my_restaurant_memberships to authenticated;

revoke create on schema public, private from hungrie_api_owner;
