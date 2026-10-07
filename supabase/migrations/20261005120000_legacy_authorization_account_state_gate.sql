-- Legacy authorization compatibility must never bypass canonical account_access.
-- Keep the old function signatures for callers and policies, but derive every
-- effective authorization decision from the current account model.

create or replace function private.current_profile_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.profile_id
  from private.account_access a
  where a.profile_id = private.canonical_profile_id()
    and a.status = 'active'::private.account_status
$$;

create or replace function private.has_platform_role(required_role public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case required_role
    when 'admin'::public.platform_role then
      private.has_admin_role('admin'::private.admin_account_role)
    when 'super_admin'::public.platform_role then
      private.has_admin_role('super_admin'::private.admin_account_role)
    else false
  end
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin()
$$;

create or replace function private.is_restaurant_member(target_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_restaurant(target_restaurant_id)
$$;

create or replace function private.is_restaurant_owner(target_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_restaurant(target_restaurant_id)
    and exists (
      select 1
      from private.account_access a
      where a.profile_id = private.canonical_profile_id()
        and a.account_type = 'restaurant'::public.account_type
        and a.status = 'active'::private.account_status
        and a.restaurant_id = target_restaurant_id
        and a.restaurant_role = 'owner'::public.restaurant_role
    )
$$;

-- Courier was a pre-account-model role and has no canonical account type.
-- Retaining an old courier row must therefore confer no authority.
create or replace function private.is_restaurant_courier(target_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false
$$;

create or replace function private.can_access_order(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = target_order_id
      and (
        (private.is_active_customer() and o.profile_id = private.canonical_profile_id())
        or private.can_access_restaurant(o.restaurant_id)
        or private.is_active_admin()
      )
  )
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
  select a.restaurant_id, a.restaurant_role, a.created_at, a.updated_at
  from private.account_access a
  join public.restaurants r on r.id = a.restaurant_id
  where a.profile_id = private.canonical_profile_id()
    and a.account_type = 'restaurant'::public.account_type
    and a.status = 'active'::private.account_status
    and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status
$$;

create or replace function private.is_order_customer(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_customer() and exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.profile_id = private.canonical_profile_id()
  )
$$;

create or replace function private.can_subscribe_order_topic(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resource text;
begin
  if target_topic = 'orders:admin' then
    return private.is_active_admin();
  end if;
  if target_topic like 'orders:profile:%' then
    v_resource := substr(target_topic, length('orders:profile:') + 1);
    return coalesce(private.is_active_customer()
      and v_resource <> '' and v_resource = private.canonical_profile_id(), false);
  end if;
  if target_topic like 'orders:restaurant:%' then
    v_resource := substr(target_topic, length('orders:restaurant:') + 1);
    return coalesce(v_resource <> '' and private.can_access_restaurant(v_resource), false);
  end if;
  -- No canonical courier account exists; all legacy courier topics fail closed.
  if target_topic like 'orders:courier-queue:%'
     or target_topic like 'orders:courier:%' then
    return false;
  end if;
  return false;
end
$$;

create or replace function public.my_order_realtime_topics()
returns table(topic text, topic_kind text, resource_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select private.require_profile() as profile_id
  ), topics(topic, topic_kind, resource_id) as (
    select 'orders:profile:' || actor.profile_id, 'profile', actor.profile_id
      from actor where private.is_active_customer()
    union all
    select 'orders:restaurant:' || private.current_restaurant_id(),
      'restaurant', private.current_restaurant_id()
      from actor where private.is_active_restaurant_account()
    union all
    select 'orders:admin', 'admin', actor.profile_id
      from actor where private.is_active_admin()
  )
  select topics.topic::text, topics.topic_kind::text, topics.resource_id::text
  from topics
  order by topics.topic_kind, topics.topic
$$;

create or replace function public.get_my_admin_authorization()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id text;
  v_role private.admin_account_role;
begin
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  if private.is_active_admin() then
    select a.admin_role into v_role
    from private.account_access a
    where a.profile_id = v_profile_id
      and a.account_type = 'admin'::public.account_type
      and a.status = 'active'::private.account_status;
  end if;

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'platform_role', v_role::text,
    'is_admin', coalesce(v_role in ('admin'::private.admin_account_role,
      'super_admin'::private.admin_account_role), false),
    'is_super_admin', coalesce(v_role = 'super_admin'::private.admin_account_role, false)
  );
end
$$;

-- Replace direct identity comparisons in customer-resource RLS with explicit
-- canonical account-type checks. In particular, an old courier assignment on
-- an order must not authorize a current Customer account.
drop policy if exists addresses_self_all on public.addresses;
create policy addresses_self_all on public.addresses for all to authenticated
  using (
    private.is_active_customer()
    and profile_id = private.current_profile_id()
  )
  with check (
    private.is_active_customer()
    and profile_id = private.current_profile_id()
  );

drop policy if exists favorites_self_all on public.favorites;
create policy favorites_self_all on public.favorites for all to authenticated
  using (
    private.is_active_customer()
    and profile_id = private.current_profile_id()
  )
  with check (
    private.is_active_customer()
    and profile_id = private.current_profile_id()
  );

drop policy if exists orders_authenticated_select on public.orders;
create policy orders_authenticated_select on public.orders for select to authenticated
  using (
    (private.is_active_customer() and profile_id = private.current_profile_id())
    or private.can_access_restaurant(restaurant_id)
    or private.is_active_admin()
  );

drop policy if exists product_reviews_authenticated_select on public.product_reviews;
create policy product_reviews_authenticated_select on public.product_reviews for select to authenticated
  using (
    status = 'published'::public.review_status
    or (private.is_active_customer() and profile_id = private.current_profile_id())
    or private.can_access_restaurant(restaurant_id)
    or private.is_active_admin()
  );

drop policy if exists order_reviews_authenticated_select on public.order_reviews;
create policy order_reviews_authenticated_select on public.order_reviews for select to authenticated
  using (
    status = 'published'::public.review_status
    or (private.is_active_customer() and profile_id = private.current_profile_id())
    or private.can_access_restaurant(restaurant_id)
    or private.is_active_admin()
  );

-- Notification delivery is also a private-data authorization surface. Derive
-- all recipients from active canonical accounts instead of stale memberships.
create or replace function private.materialize_notification_deliveries()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event private.notification_events%rowtype;
begin
  for v_event in
    select * from private.notification_events
    where state = 'pending'
    order by created_at
    for update skip locked
  loop
    if not private.notification_event_is_current(v_event) then
      update private.notification_events set state = 'obsolete' where id = v_event.id;
      continue;
    end if;

    if v_event.event_type = 'order_status' then
      insert into private.notification_deliveries(event_id, token_id)
      select v_event.id, t.id
      from public.orders o
      join private.account_access a on a.profile_id = o.profile_id
        and a.account_type = 'customer'::public.account_type
        and a.status = 'active'::private.account_status
      join public.profiles pr on pr.id = a.profile_id
        and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id = a.profile_id
        and t.is_active and t.revoked_at is null and t.provider = 'expo'
      left join private.notification_preferences p on p.profile_id = a.profile_id
      where o.id = v_event.order_id and coalesce(p.order_status_enabled, true)
      on conflict do nothing;
    elsif v_event.event_type in ('restaurant_new_order', 'restaurant_reminder') then
      insert into private.notification_deliveries(event_id, token_id)
      select v_event.id, t.id
      from public.orders o
      join private.account_access a on a.restaurant_id = o.restaurant_id
        and a.account_type = 'restaurant'::public.account_type
        and a.status = 'active'::private.account_status
      join public.restaurants r on r.id = a.restaurant_id
        and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status
      join public.profiles pr on pr.id = a.profile_id
        and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id = a.profile_id
        and t.is_active and t.revoked_at is null and t.provider = 'expo'
      left join private.notification_preferences p on p.profile_id = a.profile_id
      where o.id = v_event.order_id and coalesce(p.restaurant_orders_enabled, true)
      on conflict do nothing;

      insert into private.notification_deliveries(event_id, token_id)
      select v_event.id, t.id
      from public.orders o
      join private.push_tokens t on t.restaurant_id = o.restaurant_id
        and t.is_active and t.revoked_at is null
        and t.provider = 'fcm' and t.platform = 'web' and t.app = 'restaurant'
      where o.id = v_event.order_id
        and exists (
          select 1
          from private.account_access a
          join public.restaurants r on r.id = a.restaurant_id
          where a.profile_id = t.registered_by_profile_id
            and a.account_type = 'restaurant'::public.account_type
            and a.status = 'active'::private.account_status
            and a.restaurant_id = o.restaurant_id
            and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status
        )
      on conflict do nothing;
    elsif v_event.event_type = 'review_reply' then
      insert into private.notification_deliveries(event_id, token_id)
      select v_event.id, t.id
      from public.product_reviews rv
      join private.account_access a on a.profile_id = rv.profile_id
        and a.account_type = 'customer'::public.account_type
        and a.status = 'active'::private.account_status
      join public.profiles pr on pr.id = a.profile_id
        and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id = a.profile_id
        and t.is_active and t.revoked_at is null and t.provider = 'expo'
      left join private.notification_preferences p on p.profile_id = a.profile_id
      where rv.id = v_event.review_id and coalesce(p.review_replies_enabled, true)
      on conflict do nothing;
    end if;

    update private.notification_events
    set state = case
      when exists (
        select 1 from private.notification_deliveries d where d.event_id = v_event.id
      ) then 'processing'
      else 'completed'
    end
    where id = v_event.id;
  end loop;
end
$$;

-- Preserve the established ownership and client-facing grants. Explicitly
-- prevent accidental PUBLIC/anonymous execution of the compatibility helpers.
revoke all on function private.current_profile_id() from public, anon;
revoke all on function private.has_platform_role(public.platform_role) from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_restaurant_member(text) from public, anon;
revoke all on function private.is_restaurant_owner(text) from public, anon;
revoke all on function private.is_restaurant_courier(text) from public, anon;
revoke all on function private.can_access_order(text) from public, anon;
revoke all on function private.current_restaurant_memberships() from public, anon;
revoke all on function private.is_order_customer(text) from public, anon;
revoke all on function private.can_subscribe_order_topic(text) from public, anon;
revoke all on function public.my_order_realtime_topics() from public, anon;
revoke all on function public.get_my_admin_authorization() from public, anon;
revoke all on function private.materialize_notification_deliveries()
  from public, anon, authenticated, service_role;

-- These boolean helpers are referenced directly by authenticated RLS policies.
-- The private schema itself remains unavailable to API clients.
grant execute on function private.is_active_customer(),
  private.can_access_restaurant(text), private.is_active_admin()
  to authenticated;
