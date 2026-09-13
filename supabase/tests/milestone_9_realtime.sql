begin;

select plan(32);

select has_function('private', 'can_subscribe_order_topic', array['text'], 'topic authorization helper exists');
select has_function('public', 'my_order_realtime_topics', array[]::text[], 'topic discovery RPC exists');
select has_function('private', 'broadcast_order_invalidation', array[]::text[], 'order invalidation trigger exists');
select has_trigger('public', 'orders', 'orders_private_realtime', 'order invalidation trigger is installed');
select ok((select relrowsecurity from pg_class where oid='realtime.messages'::regclass), 'Realtime messages RLS is enabled');
select ok(exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='order_private_broadcast_receive' and cmd='SELECT'), 'receive-only Realtime policy exists');
select ok(not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and cmd='INSERT' and ('authenticated'=any(roles) or 'public'=any(roles))), 'clients have no broadcast-send policy');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders'), 'raw orders are absent from Postgres Changes publication');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://wrong.example","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select ok(not private.can_subscribe_order_topic('orders:profile:fixture_customer'), 'wrong issuer cannot authorize a topic');
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"wrong-project","sub":"fixture_firebase_customer"}', true);
select ok(not private.can_subscribe_order_topic('orders:profile:fixture_customer'), 'wrong audience cannot authorize a topic');
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"missing"}', true);
select ok(not private.can_subscribe_order_topic('orders:admin'), 'unmapped identity cannot authorize a topic');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select ok(private.can_subscribe_order_topic('orders:profile:fixture_customer'), 'customer authorizes own topic');
select ok(not private.can_subscribe_order_topic('orders:profile:fixture_outsider'), 'customer cannot authorize another profile topic');
select is((select count(*)::integer from public.my_order_realtime_topics()), 1, 'ordinary customer discovers only own profile topic');
set local role authenticated;
select throws_ok(
  $$insert into realtime.messages(topic,extension,payload,event,private) values ('orders:profile:fixture_customer','broadcast','{}','order_changed',true)$$,
  '42501', null, 'authenticated clients cannot send broadcasts'
);
select set_config('realtime.topic', 'orders:profile:fixture_customer', true);
select ok((select count(*) from realtime.messages) > 0, 'receive policy exposes own private topic invalidations');
select set_config('realtime.topic', 'orders:profile:fixture_outsider', true);
select is((select count(*)::integer from realtime.messages), 0, 'receive policy hides another customer topic');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select ok(private.can_subscribe_order_topic('orders:restaurant:fixture_restaurant_a'), 'owner authorizes own restaurant topic');
select ok(not private.can_subscribe_order_topic('orders:restaurant:fixture_restaurant_b'), 'owner cannot authorize another restaurant topic');
select is((select count(*)::integer from public.my_order_realtime_topics()), 2, 'owner discovers profile and restaurant topics');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_courier"}', true);
select ok(private.can_subscribe_order_topic('orders:courier-queue:fixture_restaurant_a'), 'scoped courier authorizes restaurant queue');
select ok(private.can_subscribe_order_topic('orders:courier:fixture_courier'), 'courier authorizes own assigned topic');
select ok(not private.can_subscribe_order_topic('orders:courier-queue:fixture_restaurant_b'), 'courier cannot authorize an unscoped queue');
select is((select count(*)::integer from public.my_order_realtime_topics()), 3, 'scoped courier discovers profile, queue, and assigned topics');
delete from private.restaurant_couriers where restaurant_id='fixture_restaurant_a' and profile_id='fixture_courier';
select ok(not private.can_subscribe_order_topic('orders:courier-queue:fixture_restaurant_a'), 'removed courier scope no longer authorizes its topic');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_unscoped_courier"}', true);
select is((select count(*)::integer from public.my_order_realtime_topics()), 2, 'unscoped courier discovers no queue topic');

select set_config('request.jwt.claims', '{"role":"authenticated","platform_role":"admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}', true);
select ok(private.can_subscribe_order_topic('orders:admin'), 'admin authorizes global topic');
select is((select count(*)::integer from public.my_order_realtime_topics()), 2, 'admin discovers profile and global topics');

update public.profiles set deletion_pending_at=statement_timestamp(), deleted_at=statement_timestamp() where id='fixture_outsider';
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select ok(not private.can_subscribe_order_topic('orders:profile:fixture_outsider'), 'deleted profile cannot authorize topics');

create temporary table m9_broadcast_capture(topic text, payload jsonb);
create or replace function private.send_order_realtime_invalidation(target_topic text, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin insert into pg_temp.m9_broadcast_capture values (target_topic,payload); end
$$;
update public.orders set updated_at=statement_timestamp() where id='fixture_order';
select is((select count(*)::integer from m9_broadcast_capture), 5, 'assigned order broadcasts legacy topics plus one canonical Restaurant topic');
select ok(not exists(select 1 from m9_broadcast_capture where (select array_agg(key order by key) from jsonb_object_keys(payload) key) <> array['operation','order_id','version']), 'payload contains only order ID, operation, and version');

create or replace function private.send_order_realtime_invalidation(target_topic text, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$begin raise exception 'simulated broadcast outage'; end$$;
select lives_ok($$update public.orders set updated_at=statement_timestamp() where id='fixture_order'$$, 'broadcast failure does not roll back order mutation');

select * from finish();
rollback;
