begin;
select no_plan();

select ok(has_function_privilege('authenticated','public.admin_get_dashboard_v1()','execute'),
  'authenticated callers can reach the guarded Admin summary');
select ok(not has_table_privilege('authenticated','private.account_access','select'),
  'Admin UI still has no direct canonical-table access');
select ok(not has_function_privilege('authenticated',
  'public.server_record_admin_mfa_enrollment_v1(text,uuid)','execute'),
  'browser callers cannot record trusted MFA enrollment');
select ok(has_function_privilege('service_role',
  'public.server_record_admin_mfa_enrollment_v1(text,uuid)','execute'),
  'trusted bridge can record verified MFA enrollment');

insert into private.account_access(profile_id,account_type,status,activated_at,
  admin_role,admin_mfa_enrolled_at)
values('fixture_super_admin','admin','active',statement_timestamp(),
  'super_admin',statement_timestamp());

select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated',
    'iss','https://securetoken.google.com/hungrieapp-a2288',
    'aud','hungrieapp-a2288','sub','fixture_firebase_outsider',
    'email_verified',true,'auth_time',extract(epoch from statement_timestamp())::bigint,
    'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select throws_ok($$select public.admin_get_dashboard_v1()$$,'42501',null,
  'non-Admin identity cannot read Admin summary');
select throws_ok($$select public.admin_list_accounts_v1(null,null,null,50,0)$$,
  '42501',null,'non-Admin identity cannot enumerate accounts');

select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated',
    'iss','https://securetoken.google.com/hungrieapp-a2288',
    'aud','hungrieapp-a2288','sub','fixture_firebase_super_admin',
    'email_verified',true,'auth_time',extract(epoch from statement_timestamp())::bigint,
    'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select ok((public.admin_get_dashboard_v1()->'accounts'->>'total')::integer>=1,
  'MFA Admin reads dashboard summary');
select is((public.admin_list_accounts_v1(null,null,null,500,-20)->>'limit')::integer,100,
  'page limit is bounded');
select is((public.admin_list_accounts_v1(null,null,null,500,-20)->>'offset')::integer,0,
  'negative offset is normalized');

select is((public.admin_create_restaurant_v1('Phase 4 Restaurant',
  '44444444-0000-4000-8000-000000000001')->>'status'),'pending',
  'Admin creates a pending Restaurant');
select is((select count(*)::integer from public.restaurants where name='Phase 4 Restaurant'),1,
  'restaurant creation writes once');
select is((public.admin_create_restaurant_v1('Phase 4 Restaurant',
  '44444444-0000-4000-8000-000000000001')->>'status'),'pending',
  'restaurant creation retry returns completed result');
select is((select count(*)::integer from public.restaurants where name='Phase 4 Restaurant'),1,
  'restaurant creation retry is a no-op');

select set_config('request.jwt.claims','{"role":"authenticated",' ||
  '"iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin",' ||
  '"email_verified":true,"firebase":{"sign_in_second_factor":"totp"}}',true);
select throws_ok($$select public.admin_create_restaurant_v1('Stale',
  '44444444-0000-4000-8000-000000000002')$$,'42501',null,
  'high-impact create requires recent authentication');

select set_config('request.jwt.claims','{"role":"authenticated",' ||
  '"iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_owner",' ||
  '"email_verified":true,"auth_time":9999999999,' ||
  '"firebase":{"sign_in_second_factor":"totp"}}',true);
select throws_ok($$select public.admin_list_orders_v1(null,null,25,0)$$,'42501',null,
  'Restaurant identity cannot use Admin order API');

select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.server_record_admin_mfa_enrollment_v1(
  'fixture_firebase_super_admin','44444444-0000-4000-8000-000000000003')$$,
  '42501',null,'spoofed browser call cannot record MFA enrollment');

select * from finish();
rollback;
