begin;
select no_plan();

insert into private.account_access(profile_id,account_type,status,activated_at)
values ('fixture_customer','customer','active',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values ('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner');

select ok(has_function_privilege('authenticated',
  'public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute'),
  'authenticated callers can reach the guarded Customer token RPC');
select ok(not has_function_privilege('anon',
  'public.register_my_customer_push_token_v2(text,public.notification_platform,text)','execute'),
  'anonymous callers cannot register a Customer token');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select lives_ok($$select public.register_my_customer_push_token_v2('ExpoPushToken[phase7language]','ios','tr')$$,
  'active Customer registers its token with Turkish language');
select is((select preferred_language from private.push_tokens where token='ExpoPushToken[phase7language]'),
  'tr','token stores the app language');

insert into private.notification_events(idempotency_key,event_type,order_id,expected_status)
values ('customer_push_language_test','order_status','fixture_order',
  (select status from public.orders where id='fixture_order'));
select is((select preferred_language from public.claim_notification_deliveries(100)
  where token='ExpoPushToken[phase7language]' limit 1),
  'tr','delivery uses token language instead of profile language');

select is(public.register_my_customer_push_token_v2('ExpoPushToken[phase7language]','ios','en'),
  (select id from private.push_tokens where token='ExpoPushToken[phase7language]'),
  'changing language reuses the same token');
select is((select preferred_language from private.push_tokens where token='ExpoPushToken[phase7language]'),
  'en','token language changes without a new device registration');
select throws_ok($$select public.register_my_customer_push_token_v2('ExpoPushToken[phase7language]','ios','fr')$$,
  '22023','Invalid push language','unsupported language is rejected');
select is((select preferred_language from private.push_tokens where token='ExpoPushToken[phase7language]'),
  'en','invalid language does not alter existing preference');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select throws_ok($$select public.register_my_customer_push_token_v2('ExpoPushToken[phase7owner]','ios','tr')$$,
  '42501','Active Customer account required','Restaurant identity cannot register a Customer token');

select * from finish();
rollback;
