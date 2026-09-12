begin;

select plan(38);

select has_table('private','notification_preferences','notification preferences are protected');
select has_table('private','notification_events','notification events are protected');
select has_table('private','notification_deliveries','notification deliveries are protected');
select has_function('public','register_my_push_token',array['text','notification_platform'],'token registration RPC exists');
select has_function('public','claim_notification_deliveries',array['integer'],'service worker claim RPC exists');
select has_function('private','expire_pending_orders',array['integer'],'database expiry job exists');
select has_function('public','create_restaurant',array['jsonb'],'super-admin restaurant creation exists');
select has_function('public','get_restaurant_menu_management_data',array['text'],'protected catalog management read exists');
select ok(exists(select 1 from cron.job where jobname='hungrie-expire-pending-orders'),'expiry cron is scheduled');
select ok(not has_table_privilege('anon','private.push_tokens','select'),'anon cannot read push tokens');
select ok(not has_table_privilege('authenticated','private.notification_events','select'),'clients cannot read notification events');
select ok(not has_table_privilege('authenticated','private.notification_deliveries','insert'),'clients cannot enqueue deliveries');
select ok(not has_function_privilege('authenticated','public.claim_notification_deliveries(integer)','execute'),'clients cannot invoke worker claim');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select matches(public.register_my_push_token('ExpoPushToken[fixture_customer]','ios'),'^expo_','customer registers own Expo token');
select is(public.get_my_notification_preferences()->>'orderStatus','true','notification preferences default on');
select is(public.update_my_notification_preferences(false,true,true)->>'orderStatus','false','customer updates own preferences');
select throws_ok($$select public.register_my_push_token('native-token','ios')$$,'22023',null,'native tokens are rejected');
reset role;
select is((select profile_id from private.push_tokens where token='ExpoPushToken[fixture_customer]'),'fixture_customer','token is bound to current profile only');
select ok((select restaurant_id is null from private.push_tokens where token='ExpoPushToken[fixture_customer]'),'restaurant token duplication is not used');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select matches(public.register_my_push_token('ExpoPushToken[fixture_owner]','android'),'^expo_','restaurant owner registers a profile token');
reset role;

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,delivery_fee_kurus,total_kurus,approval_deadline_at)
values('m10_pending','fixture_customer','fixture_restaurant_a','pending','cash',1000,0,1000,statement_timestamp()+interval '5 minutes');
select lives_ok($$select private.write_audit('fixture_customer','order.created','order','m10_pending')$$,'new-order audit safely enqueues an event');
select is((select count(*)::integer from private.notification_events where order_id='m10_pending' and event_type='restaurant_new_order'),1,'new order has one idempotent event');
select is((select count(*)::integer from public.claim_notification_deliveries(100) where token='ExpoPushToken[fixture_owner]'),1,'only eligible restaurant member token is claimed');

update public.orders set status='preparing' where id='m10_pending';
select lives_ok($$select private.write_audit('fixture_owner','order.transitioned','order','m10_pending',jsonb_build_object('to','preparing'))$$,'status audit safely enqueues an event');
select is((select count(*)::integer from public.claim_notification_deliveries(100) where token='ExpoPushToken[fixture_customer]'),0,'disabled customer order preference suppresses delivery');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select is(public.update_my_notification_preferences(true,true,true)->>'orderStatus','true','customer re-enables order alerts');
reset role;
select lives_ok($$select private.write_audit('fixture_customer','order.transitioned','order','m10_pending',jsonb_build_object('to','preparing','probe','logout'))$$,'a fresh eligible status event is queued');
select lives_ok($$select private.materialize_notification_deliveries()$$,'eligible delivery materializes before logout');
select is((select d.state from private.notification_deliveries d join private.notification_events e on e.id=d.event_id where e.order_id='m10_pending' and e.event_type='order_status' order by d.created_at desc limit 1),'pending','delivery is pending before logout');
set local role authenticated;
select lives_ok($$select public.unregister_my_push_token('ExpoPushToken[fixture_customer]')$$,'logout token revocation succeeds while authenticated');
reset role;
select ok((select not is_active and revoked_at is not null from private.push_tokens where token='ExpoPushToken[fixture_customer]'),'revoked token becomes inactive');
select is((select d.state from private.notification_deliveries d join private.notification_events e on e.id=d.event_id where e.order_id='m10_pending' and e.event_type='order_status' order by d.created_at desc limit 1),'obsolete','logout obsoletes queued delivery before account sign-out');

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,delivery_fee_kurus,total_kurus,approval_deadline_at)
values('m10_expired','fixture_customer','fixture_restaurant_a','pending','cash',1000,0,1000,statement_timestamp()-interval '1 minute');
select is(private.expire_pending_orders(100),1,'expiry job cancels one expired order');
select is((select status::text from public.orders where id='m10_expired'),'canceled','expired order becomes canceled');
select is((select count(*)::integer from private.order_status_history where order_id='m10_expired' and source='system'),1,'expiry writes status history');

select set_config('request.jwt.claims','{"role":"authenticated","platform_role":"super_admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin"}',true);
set local role authenticated;
select ok(length(public.create_restaurant('{"name":"M10 Synthetic","is_active":false}'::jsonb))>0,'super-admin can create an inactive restaurant');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
set local role authenticated;
select is((public.get_restaurant_menu_management_data('fixture_restaurant_a')->>'restaurant_id'),'fixture_restaurant_a','owner reads protected management catalog');
select throws_ok($$select public.get_restaurant_menu_management_data('fixture_restaurant_b')$$,'42501',null,'owner cannot read another management catalog');
reset role;

select * from finish();
rollback;
