-- Private Broadcast authorization is cached by Supabase Realtime for the life
-- of a joined channel. Bind every protected topic to the canonical account
-- row authz_version so an authority change stops future broadcasts to old joins.

create or replace function private.account_realtime_generation(p_authz_version bigint)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select p_authz_version::text
$$;

create or replace function private.customer_order_realtime_topic(
  p_profile_id text, p_authz_version bigint
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'orders:profile:v2:' || p_profile_id || ':' ||
    private.account_realtime_generation(p_authz_version)
$$;

create or replace function private.restaurant_order_realtime_topic(
  p_restaurant_id text, p_profile_id text, p_authz_version bigint
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'restaurant-orders:v2:' || p_restaurant_id || ':' || p_profile_id || ':' ||
    private.account_realtime_generation(p_authz_version)
$$;

create or replace function private.admin_order_realtime_topic(
  p_profile_id text, p_authz_version bigint
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'orders:admin:v2:' || p_profile_id || ':' ||
    private.account_realtime_generation(p_authz_version)
$$;

create or replace function private.can_subscribe_order_topic(target_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(
    case a.account_type
      when 'customer'::public.account_type then
        target_topic = private.customer_order_realtime_topic(a.profile_id, a.authz_version)
      when 'admin'::public.account_type then
        target_topic = private.admin_order_realtime_topic(a.profile_id, a.authz_version)
      else false
    end
  ), false)
  from private.account_access a
  join public.profiles p on p.id = a.profile_id
  where a.profile_id = private.canonical_profile_id()
    and a.status = 'active'::private.account_status
    and p.deleted_at is null
    and p.deletion_pending_at is null
$$;

create or replace function private.can_subscribe_restaurant_v2_topic(target_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(
    target_topic = private.restaurant_order_realtime_topic(
      a.restaurant_id, a.profile_id, a.authz_version
    )
  ), false)
  from private.account_access a
  join public.profiles p on p.id = a.profile_id
  join public.restaurants r on r.id = a.restaurant_id
  where a.profile_id = private.canonical_profile_id()
    and a.account_type = 'restaurant'::public.account_type
    and a.status = 'active'::private.account_status
    and a.onboarding_step = 'none'::private.account_onboarding_step
    and p.deleted_at is null
    and p.deletion_pending_at is null
    and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status
$$;

-- The static v1 topic is unsafe after mid-session authority loss because the
-- provider caches its successful join decision. It now fails closed.
create or replace function private.can_subscribe_restaurant_v1_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select false $$;

create or replace function public.my_customer_order_realtime_topics_v1()
returns table(topic text, topic_kind text, resource_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select private.customer_order_realtime_topic(a.profile_id, a.authz_version),
    'profile'::text, a.profile_id
  from private.account_access a
  join public.profiles p on p.id = a.profile_id
  where a.profile_id = private.require_active_customer()
    and a.account_type = 'customer'::public.account_type
    and a.status = 'active'::private.account_status
    and p.deleted_at is null
    and p.deletion_pending_at is null
$$;

create or replace function public.my_order_realtime_topics()
returns table(topic text, topic_kind text, resource_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select case a.account_type
      when 'customer'::public.account_type then
        private.customer_order_realtime_topic(a.profile_id, a.authz_version)
      when 'restaurant'::public.account_type then
        private.restaurant_order_realtime_topic(a.restaurant_id, a.profile_id, a.authz_version)
      when 'admin'::public.account_type then
        private.admin_order_realtime_topic(a.profile_id, a.authz_version)
    end,
    a.account_type::text,
    coalesce(a.restaurant_id, a.profile_id)
  from private.account_access a
  join public.profiles p on p.id = a.profile_id
  left join public.restaurants r on r.id = a.restaurant_id
  where a.profile_id = private.canonical_profile_id()
    and a.status = 'active'::private.account_status
    and p.deleted_at is null
    and p.deletion_pending_at is null
    and (a.account_type <> 'restaurant'::public.account_type
      or (a.onboarding_step = 'none'::private.account_onboarding_step
        and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status))
$$;

create or replace function public.restaurant_order_realtime_topic_v2()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_topic text;
begin
  select private.restaurant_order_realtime_topic(a.restaurant_id, a.profile_id, a.authz_version)
  into v_topic
  from private.account_access a
  join public.profiles p on p.id = a.profile_id
  join public.restaurants r on r.id = a.restaurant_id
  where a.profile_id = private.canonical_profile_id()
    and a.account_type = 'restaurant'::public.account_type
    and a.status = 'active'::private.account_status
    and a.onboarding_step = 'none'::private.account_onboarding_step
    and p.deleted_at is null
    and p.deletion_pending_at is null
    and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status;
  if v_topic is null then
    raise exception 'Active Restaurant account and restaurant required' using errcode = '42501';
  end if;
  return v_topic;
end
$$;

create or replace function private.broadcast_order_invalidation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new public.orders%rowtype;
  v_old public.orders%rowtype;
  v_order_id text;
  v_version timestamptz;
  v_topic text;
begin
  if tg_op <> 'DELETE' then v_new := new; end if;
  if tg_op <> 'INSERT' then v_old := old; end if;
  v_order_id := coalesce(v_new.id, v_old.id);
  v_version := coalesce(v_new.updated_at, v_old.updated_at, statement_timestamp());

  for v_topic in
    select distinct recipients.topic
    from (
      select private.customer_order_realtime_topic(a.profile_id, a.authz_version) as topic
      from private.account_access a
      join public.profiles p on p.id = a.profile_id
      where a.profile_id in (v_new.profile_id, v_old.profile_id)
        and a.account_type = 'customer'::public.account_type
        and a.status = 'active'::private.account_status
        and p.deleted_at is null and p.deletion_pending_at is null
      union all
      select private.restaurant_order_realtime_topic(a.restaurant_id, a.profile_id, a.authz_version)
      from private.account_access a
      join public.profiles p on p.id = a.profile_id
      join public.restaurants r on r.id = a.restaurant_id
      where a.restaurant_id in (v_new.restaurant_id, v_old.restaurant_id)
        and a.account_type = 'restaurant'::public.account_type
        and a.status = 'active'::private.account_status
        and a.onboarding_step = 'none'::private.account_onboarding_step
        and p.deleted_at is null and p.deletion_pending_at is null
        and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status
      union all
      select private.admin_order_realtime_topic(a.profile_id, a.authz_version)
      from private.account_access a
      join public.profiles p on p.id = a.profile_id
      where a.account_type = 'admin'::public.account_type
        and a.status = 'active'::private.account_status
        and p.deleted_at is null and p.deletion_pending_at is null
    ) recipients
    where recipients.topic is not null
  loop
    perform private.send_order_realtime_invalidation(v_topic, jsonb_build_object(
      'order_id', v_order_id, 'operation', lower(tg_op), 'version', v_version
    ));
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
exception when others then
  raise warning 'Status-aware order invalidation skipped';
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

grant create on schema private, public to hungrie_api_owner;
alter function private.account_realtime_generation(bigint) owner to hungrie_api_owner;
alter function private.customer_order_realtime_topic(text,bigint) owner to hungrie_api_owner;
alter function private.restaurant_order_realtime_topic(text,text,bigint) owner to hungrie_api_owner;
alter function private.admin_order_realtime_topic(text,bigint) owner to hungrie_api_owner;
alter function private.can_subscribe_order_topic(text) owner to hungrie_api_owner;
alter function private.can_subscribe_restaurant_v2_topic(text) owner to hungrie_api_owner;
alter function private.can_subscribe_restaurant_v1_topic(text) owner to hungrie_api_owner;
alter function private.broadcast_order_invalidation() owner to hungrie_api_owner;
alter function public.my_customer_order_realtime_topics_v1() owner to hungrie_api_owner;
alter function public.my_order_realtime_topics() owner to hungrie_api_owner;
alter function public.restaurant_order_realtime_topic_v2() owner to hungrie_api_owner;
revoke create on schema private, public from hungrie_api_owner;

revoke all on function private.account_realtime_generation(bigint),
  private.customer_order_realtime_topic(text,bigint),
  private.restaurant_order_realtime_topic(text,text,bigint),
  private.admin_order_realtime_topic(text,bigint),
  private.can_subscribe_order_topic(text),
  private.can_subscribe_restaurant_v2_topic(text),
  private.can_subscribe_restaurant_v1_topic(text)
  from public, anon;
grant execute on function private.can_subscribe_order_topic(text),
  private.can_subscribe_restaurant_v2_topic(text),
  private.can_subscribe_restaurant_v1_topic(text)
  to authenticated;
revoke all on function public.restaurant_order_realtime_topic_v2() from public, anon;
grant execute on function public.restaurant_order_realtime_topic_v2() to authenticated;
