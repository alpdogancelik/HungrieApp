begin;
select no_plan();

insert into public.profiles(id,firebase_uid,name,email,preferred_language)
values ('logout_customer_b','logout_firebase_b','Logout Customer B','logout-b@example.invalid','en');
insert into private.account_access(profile_id,account_type,status,activated_at)
values
  ('fixture_customer','customer','active',statement_timestamp()),
  ('logout_customer_b','customer','active',statement_timestamp());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select lives_ok($$select public.register_my_customer_push_token_v2('ExpoPushToken[logout_shared]','ios','en')$$,
  'Customer A registers the installation token');
select lives_ok($$select public.register_my_customer_push_token_v2('ExpoPushToken[logout_device_two]','android','en')$$,
  'Customer A registers an unrelated second-device token');
reset role;

insert into private.notification_events(idempotency_key,event_type,order_id,expected_status)
values ('logout-token-before-transfer','order_status','fixture_order',
  (select status from public.orders where id='fixture_order'));
select lives_ok($$select private.materialize_notification_deliveries()$$,
  'A deliveries materialize before account transfer');
select is((select d.state from private.notification_deliveries d
  join private.push_tokens t on t.id=d.token_id
  join private.notification_events e on e.id=d.event_id
  where e.idempotency_key='logout-token-before-transfer' and t.token='ExpoPushToken[logout_shared]'),
  'pending','shared token initially has a pending A delivery');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"logout_firebase_b"}',true);
select lives_ok($$select public.register_my_customer_push_token_v2('ExpoPushToken[logout_shared]','ios','tr')$$,
  'Customer B atomically reconciles the same installation token');
reset role;

select is((select count(*)::integer from private.push_tokens where token='ExpoPushToken[logout_shared]'),1,
  'the same token cannot have duplicate A and B rows');
select is((select profile_id from private.push_tokens where token='ExpoPushToken[logout_shared]'),
  'logout_customer_b','the token effective owner is Customer B');
select is((select d.state from private.notification_deliveries d
  join private.push_tokens t on t.id=d.token_id
  join private.notification_events e on e.id=d.event_id
  where e.idempotency_key='logout-token-before-transfer' and t.token='ExpoPushToken[logout_shared]'),
  'obsolete','ownership transfer obsoletes A pending delivery for the shared token');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select lives_ok($$select public.unregister_my_customer_push_token_v1('ExpoPushToken[logout_shared]')$$,
  'late Customer A unregister has no cross-account effect');
reset role;
select ok((select is_active and revoked_at is null from private.push_tokens
  where token='ExpoPushToken[logout_shared]' and profile_id='logout_customer_b'),
  'late A cleanup cannot revoke B ownership');

insert into private.notification_events(idempotency_key,event_type,order_id,expected_status)
values ('logout-token-after-transfer','order_status','fixture_order',
  (select status from public.orders where id='fixture_order'));
select lives_ok($$select private.materialize_notification_deliveries()$$,
  'A notification materializes after B takes the shared installation');
select is((select count(*)::integer from private.notification_deliveries d
  join private.notification_events e on e.id=d.event_id
  join private.push_tokens t on t.id=d.token_id
  where e.idempotency_key='logout-token-after-transfer' and t.token='ExpoPushToken[logout_shared]'),0,
  'A private notification does not select B-owned shared installation');
select is((select count(*)::integer from private.notification_deliveries d
  join private.notification_events e on e.id=d.event_id
  join private.push_tokens t on t.id=d.token_id
  where e.idempotency_key='logout-token-after-transfer' and t.token='ExpoPushToken[logout_device_two]'),1,
  'A unrelated second-device registration remains active');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"logout_firebase_b"}',true);
select lives_ok($$select public.unregister_my_customer_push_token_v1('ExpoPushToken[logout_shared]')$$,
  'Customer B can revoke only its current installation token');
reset role;
select ok((select is_active and revoked_at is null from private.push_tokens
  where token='ExpoPushToken[logout_device_two]' and profile_id='fixture_customer'),
  'logging out one installation preserves A other device');

select * from finish();
rollback;
