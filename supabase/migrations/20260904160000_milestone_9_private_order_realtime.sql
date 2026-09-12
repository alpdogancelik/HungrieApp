-- Milestone 9: privacy-safe order invalidations over authorized private Broadcast.
-- Runtime order traffic remains Firebase-backed until the Milestone 10 cutover.

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
    return coalesce(private.is_admin(), false);
  end if;
  if target_topic like 'orders:profile:%' then
    v_resource := substr(target_topic, length('orders:profile:') + 1);
    return coalesce(v_resource <> '' and v_resource = private.current_profile_id(), false);
  end if;
  if target_topic like 'orders:restaurant:%' then
    v_resource := substr(target_topic, length('orders:restaurant:') + 1);
    return coalesce(v_resource <> '' and private.is_restaurant_member(v_resource), false);
  end if;
  if target_topic like 'orders:courier-queue:%' then
    v_resource := substr(target_topic, length('orders:courier-queue:') + 1);
    return coalesce(v_resource <> '' and private.is_restaurant_courier(v_resource), false);
  end if;
  if target_topic like 'orders:courier:%' then
    v_resource := substr(target_topic, length('orders:courier:') + 1);
    return coalesce(v_resource <> ''
      and v_resource = private.current_profile_id()
      and private.has_platform_role('courier'::public.platform_role), false);
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
    select 'orders:profile:' || actor.profile_id, 'profile', actor.profile_id from actor
    union all
    select 'orders:restaurant:' || rm.restaurant_id, 'restaurant', rm.restaurant_id
      from actor join private.restaurant_members rm on rm.profile_id = actor.profile_id
    union all
    select 'orders:courier-queue:' || rc.restaurant_id, 'courier_queue', rc.restaurant_id
      from actor join private.restaurant_couriers rc on rc.profile_id = actor.profile_id
      where private.has_platform_role('courier'::public.platform_role)
    union all
    select 'orders:courier:' || actor.profile_id, 'courier', actor.profile_id
      from actor where private.has_platform_role('courier'::public.platform_role)
    union all
    select 'orders:admin', 'admin', actor.profile_id
      from actor where private.is_admin()
  )
  select topics.topic::text, topics.topic_kind::text, topics.resource_id::text
  from topics
  order by topics.topic_kind, topics.topic
$$;

revoke all on function private.can_subscribe_order_topic(text) from public, anon;
grant execute on function private.can_subscribe_order_topic(text) to authenticated;
revoke all on function public.my_order_realtime_topics() from public, anon;
grant execute on function public.my_order_realtime_topics() to authenticated;

-- `realtime.messages` is a Supabase-managed table. Its receive-only policy is
-- applied by scripts/apply-supabase-realtime-policy.mjs after migrations replay.
-- Supabase CLI 2.116 cannot create the policy through db reset/db push because
-- those commands run without the managed table owner's privileges. RLS is
-- already enabled by Supabase and the absence of an INSERT policy denies sends.

create or replace function private.send_order_realtime_invalidation(target_topic text, payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send(payload, 'order_changed', target_topic, true)
$$;

revoke all on function private.send_order_realtime_invalidation(text, jsonb) from public, anon, authenticated;

create or replace function private.broadcast_order_invalidation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new public.orders%rowtype;
  v_old public.orders%rowtype;
  v_topic text;
  v_topics text[] := array['orders:admin'];
  v_order_id text;
  v_version timestamptz;
begin
  if tg_op <> 'DELETE' then v_new := new; end if;
  if tg_op <> 'INSERT' then v_old := old; end if;
  v_order_id := coalesce(v_new.id, v_old.id);
  v_version := coalesce(v_new.updated_at, v_old.updated_at, statement_timestamp());

  if v_new.profile_id is not null then v_topics := array_append(v_topics, 'orders:profile:' || v_new.profile_id); end if;
  if v_old.profile_id is not null then v_topics := array_append(v_topics, 'orders:profile:' || v_old.profile_id); end if;
  if v_new.restaurant_id is not null then v_topics := array_append(v_topics, 'orders:restaurant:' || v_new.restaurant_id); end if;
  if v_old.restaurant_id is not null then v_topics := array_append(v_topics, 'orders:restaurant:' || v_old.restaurant_id); end if;
  if v_new.courier_profile_id is not null then v_topics := array_append(v_topics, 'orders:courier:' || v_new.courier_profile_id); end if;
  if v_old.courier_profile_id is not null then v_topics := array_append(v_topics, 'orders:courier:' || v_old.courier_profile_id); end if;
  if v_new.status = 'ready'::public.order_status and v_new.courier_profile_id is null then
    v_topics := array_append(v_topics, 'orders:courier-queue:' || v_new.restaurant_id);
  end if;
  if v_old.status = 'ready'::public.order_status and v_old.courier_profile_id is null then
    v_topics := array_append(v_topics, 'orders:courier-queue:' || v_old.restaurant_id);
  end if;

  for v_topic in select distinct value from unnest(v_topics) as value where value is not null
  loop
    perform private.send_order_realtime_invalidation(
      v_topic,
      jsonb_build_object(
        'order_id', v_order_id,
        'operation', lower(tg_op),
        'version', to_char(v_version at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      )
    );
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
exception when others then
  raise warning 'Order realtime invalidation skipped';
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function private.broadcast_order_invalidation() from public, anon, authenticated;
drop trigger if exists orders_private_realtime on public.orders;
create trigger orders_private_realtime
after insert or update or delete on public.orders
for each row execute function private.broadcast_order_invalidation();

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime drop table public.orders';
  end if;
end
$$;
