begin;
select no_plan();

select has_function('private', 'can_subscribe_order_topic', array['text'], 'topic authorization helper exists');
select has_function('private', 'can_subscribe_restaurant_v2_topic', array['text'], 'Restaurant topic authorization helper exists');
select has_function('public', 'my_order_realtime_topics', array[]::text[], 'topic discovery RPC exists');
select has_function('public', 'restaurant_order_realtime_topic_v2', array[]::text[], 'Restaurant topic discovery RPC exists');
select has_trigger('public', 'orders', 'orders_private_realtime', 'order invalidation trigger is installed');
select ok((select relrowsecurity from pg_class where oid='realtime.messages'::regclass), 'Realtime messages RLS is enabled');
select ok(exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='order_private_broadcast_receive' and cmd='SELECT'), 'receive-only Realtime policy exists');
select ok(not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and cmd='INSERT' and ('authenticated'=any(roles) or 'public'=any(roles))), 'clients have no broadcast-send policy');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders'), 'raw orders are absent from Postgres Changes publication');

-- This suite is also a documented standalone Realtime check. Normalize only
-- its canonical fixture authority inside the surrounding transaction so a
-- prior local test run cannot make the setup fail; rollback restores whatever
-- local fixture state existed before the suite.
delete from private.account_access
where profile_id in ('fixture_customer','fixture_owner','fixture_manager','fixture_admin','fixture_outsider');

insert into private.account_access(profile_id,account_type,status,activated_at)
values('fixture_customer','customer','active',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values
 ('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner'),
 ('fixture_manager','restaurant','active',statement_timestamp(),'fixture_restaurant_a','manager');
insert into private.account_access(profile_id,account_type,status,activated_at,admin_role,admin_mfa_enrolled_at)
values('fixture_admin','admin','active',statement_timestamp(),'admin',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,revoked_at)
values('fixture_outsider','customer','revoked',statement_timestamp());

create temporary table m9_topics(label text primary key, topic text not null);
insert into m9_topics
select 'customer',private.customer_order_realtime_topic(profile_id,authz_version)
from private.account_access where profile_id='fixture_customer';
insert into m9_topics
select 'owner',private.restaurant_order_realtime_topic(restaurant_id,profile_id,authz_version)
from private.account_access where profile_id='fixture_owner';
insert into m9_topics
select 'manager',private.restaurant_order_realtime_topic(restaurant_id,profile_id,authz_version)
from private.account_access where profile_id='fixture_manager';
insert into m9_topics
select 'admin',private.admin_order_realtime_topic(profile_id,authz_version)
from private.account_access where profile_id='fixture_admin';

select set_config('request.jwt.claims', '{}', true);
select ok(not private.can_subscribe_order_topic((select topic from m9_topics where label='customer')), 'anonymous identity cannot authorize a protected topic');
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select ok(private.can_subscribe_order_topic((select topic from m9_topics where label='customer')), 'active Customer authorizes its generation-bound topic');
select ok(not private.can_subscribe_order_topic('orders:profile:v2:fixture_outsider:1'), 'Customer cannot authorize another Customer topic');
select ok(not private.can_subscribe_order_topic('orders:order:fixture_order'), 'knowing an order ID does not create topic authority');
select ok(not private.can_subscribe_order_topic('orders:profile:fixture_customer'), 'static legacy Customer topic fails closed');
select is((select topic from public.my_customer_order_realtime_topics_v1()),(select topic from m9_topics where label='customer'),'Customer discovery returns only the current authority generation');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select ok(private.can_subscribe_restaurant_v2_topic((select topic from m9_topics where label='owner')), 'active Restaurant owner authorizes its generation-bound tenant topic');
select ok(not private.can_subscribe_restaurant_v2_topic((select topic from m9_topics where label='manager')), 'Restaurant owner cannot use another profile generation topic');
select ok(not private.can_subscribe_restaurant_v2_topic('restaurant-orders:v2:fixture_restaurant_b:fixture_owner:1'), 'Restaurant owner cannot join another tenant topic');
select ok(not private.can_subscribe_restaurant_v1_topic('restaurant-orders:v1:fixture_restaurant_a'), 'static legacy Restaurant topic fails closed');
select is(public.restaurant_order_realtime_topic_v2(),(select topic from m9_topics where label='owner'),'Restaurant discovery derives tenant and generation server-side');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}', true);
select ok(private.can_subscribe_order_topic((select topic from m9_topics where label='admin')), 'active Admin authorizes its generation-bound topic');
update private.account_access set status='suspended',suspended_at=statement_timestamp()
where profile_id='fixture_admin';
select ok(not private.can_subscribe_order_topic((select topic from m9_topics where label='admin')), 'suspended Admin cannot freshly join its former topic');
update private.account_access set status='revoked',suspended_at=null,revoked_at=statement_timestamp()
where profile_id='fixture_admin';
select ok(not private.can_subscribe_order_topic((select topic from m9_topics where label='admin')), 'revoked Admin cannot freshly join its former topic');

-- Keep stale compatibility state while canonical authority is removed.
insert into private.restaurant_members(restaurant_id,profile_id,role)
values('fixture_restaurant_a','fixture_manager','manager') on conflict do nothing;
insert into private.user_roles(profile_id,role)
values('fixture_manager','admin') on conflict do nothing;
update private.account_access set status='suspended',suspended_at=statement_timestamp()
where profile_id='fixture_manager';
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select ok(not private.can_subscribe_restaurant_v2_topic((select topic from m9_topics where label='manager')), 'suspended manager cannot freshly join its former topic');
select throws_ok($$select public.restaurant_order_realtime_topic_v2()$$,'42501',null,'suspended manager cannot discover a topic despite stale membership and role');
update private.account_access set status='revoked',suspended_at=null,revoked_at=statement_timestamp()
where profile_id='fixture_manager';
select ok(not private.can_subscribe_restaurant_v2_topic((select topic from m9_topics where label='manager')), 'revoked manager cannot freshly join despite stale membership and role');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select ok(not private.can_subscribe_order_topic('orders:profile:v2:fixture_outsider:1'), 'revoked Customer cannot freshly join a protected topic');

-- Supabase caches private-channel authorization after join. Prove the server
-- fanout itself never targets an obsolete generation after authority loss.
create temporary table m9_broadcast_capture(topic text, payload jsonb);
create or replace function private.send_order_realtime_invalidation(target_topic text, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin insert into pg_temp.m9_broadcast_capture values (target_topic,payload); end
$$;
update public.orders set updated_at=statement_timestamp() where id='fixture_order';
select ok(exists(select 1 from m9_broadcast_capture where topic=(select topic from m9_topics where label='customer')), 'active Customer generation receives its invalidation');
select ok(exists(select 1 from m9_broadcast_capture where topic=(select topic from m9_topics where label='owner')), 'active Restaurant owner generation receives its tenant invalidation');
select ok(not exists(select 1 from m9_broadcast_capture where topic=(select topic from m9_topics where label='manager')), 'already-open suspended manager generation receives no future invalidation');
select ok(not exists(select 1 from m9_broadcast_capture where topic like 'orders:profile:%' and topic not like 'orders:profile:v2:%'), 'broadcaster emits no static legacy Customer topic');
select ok(not exists(select 1 from m9_broadcast_capture where topic like 'restaurant-orders:v1:%'), 'broadcaster emits no static legacy Restaurant topic');
select ok(not exists(select 1 from m9_broadcast_capture where (select array_agg(key order by key) from jsonb_object_keys(payload) key) <> array['operation','order_id','version']), 'payload contains only order ID, operation, and version');

truncate m9_broadcast_capture;
update private.account_access set status='suspended',suspended_at=statement_timestamp()
where profile_id='fixture_customer';
update public.orders set updated_at=statement_timestamp() where id='fixture_order';
select ok(not exists(select 1 from m9_broadcast_capture where topic=(select topic from m9_topics where label='customer')), 'already-open suspended Customer generation receives no future invalidation');

truncate m9_broadcast_capture;
update private.account_access set status='active',activated_at=statement_timestamp(),suspended_at=null
where profile_id='fixture_customer';
insert into m9_topics
select 'customer_deleted',private.customer_order_realtime_topic(profile_id,authz_version)
from private.account_access where profile_id='fixture_customer';
update public.profiles set deletion_pending_at=statement_timestamp(),deleted_at=statement_timestamp()
where id='fixture_customer';
update public.orders set updated_at=statement_timestamp() where id='fixture_order';
select ok(not exists(select 1 from m9_broadcast_capture where topic=(select topic from m9_topics where label='customer_deleted')), 'already-open deleted Customer generation receives no future invalidation');

truncate m9_broadcast_capture;
update private.account_access set restaurant_id='fixture_restaurant_b'
where profile_id='fixture_owner';
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select ok(not private.can_subscribe_restaurant_v2_topic((select topic from m9_topics where label='owner')), 'tenant-reassigned owner cannot freshly join the former tenant generation');
update public.orders set updated_at=statement_timestamp() where id='fixture_order';
select ok(not exists(select 1 from m9_broadcast_capture where topic=(select topic from m9_topics where label='owner')), 'already-open reassigned owner generation receives no former-tenant invalidation');

create or replace function private.send_order_realtime_invalidation(target_topic text, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$begin raise exception 'simulated broadcast outage'; end$$;
select lives_ok($$update public.orders set updated_at=statement_timestamp() where id='fixture_order'$$, 'broadcast failure does not roll back order mutation');

select * from finish();
rollback;
