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
select ok(not has_schema_privilege('authenticated','private','usage'),
  'Admin clients retain no private-schema usage');
set local role authenticated;
select is((public.admin_list_accounts_v1(null,null,null,25,0)->>'limit')::integer,25,
  'authenticated Admin can call public wrapper without private-schema usage');
reset role;

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

select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated',
    'iss','https://securetoken.google.com/hungrieapp-a2288',
    'aud','hungrieapp-a2288','sub','fixture_firebase_super_admin',
    'email_verified',true,'auth_time',extract(epoch from statement_timestamp())::bigint,
    'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,total_kurus)
values
  ('phase4_support_pending','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000),
  ('phase4_support_dispatched','fixture_customer','fixture_restaurant_a','out_for_delivery','cash',1000,1000);

select throws_ok($$select public.admin_resolve_order_v1(
  'phase4_support_pending','confirm_delivered','verified by support',
  '44444444-0000-4000-8000-000000000004')$$,'22023',null,
  'support cannot mark a pending order delivered');
select is((public.admin_resolve_order_v1(
  'phase4_support_pending','cancel','customer requested cancellation',
  '44444444-0000-4000-8000-000000000005')->>'status'),'canceled',
  'support can cancel a pending order');
select is((public.admin_resolve_order_v1(
  'phase4_support_dispatched','confirm_delivered','delivery verified by support',
  '44444444-0000-4000-8000-000000000006')->>'status'),'delivered',
  'support can confirm delivery only after dispatch');
select is((public.admin_resolve_order_v1(
  'phase4_support_dispatched','confirm_delivered','delivery verified by support',
  '44444444-0000-4000-8000-000000000006')->>'status'),'delivered',
  'support retry returns the original delivered result');
select is((select count(*)::integer from private.order_status_history
  where order_id in ('phase4_support_pending','phase4_support_dispatched')
    and source='admin_support'),2,
  'support creates one order transition per operation');
select is((select count(*)::integer from private.audit_log
  where action='order.support_resolved'
    and target_id in ('phase4_support_pending','phase4_support_dispatched')),2,
  'both support resolutions are audited once');

insert into private.restaurant_operational_incidents(id,restaurant_id,
  incident_type,window_started_at,window_ended_at,ignored_order_count,
  eligible_order_count,threshold_snapshot)
values('44444444-0000-4000-8000-000000000010','fixture_restaurant_a',
  'repeated_order_non_response',statement_timestamp()-interval '1 hour',
  statement_timestamp(),2,3,'{}'::jsonb);
select throws_ok($$select public.admin_set_incident_state_v1(
  '44444444-0000-4000-8000-000000000010','resolved',null,
  '44444444-0000-4000-8000-000000000011')$$,'22023',null,
  'incident resolution requires a note');
select is((public.admin_set_incident_state_v1(
  '44444444-0000-4000-8000-000000000010','acknowledged',null,
  '44444444-0000-4000-8000-000000000012')->>'state'),'acknowledged',
  'Admin acknowledges an open incident');
select is((public.admin_set_incident_state_v1(
  '44444444-0000-4000-8000-000000000010','resolved','restaurant contacted',
  '44444444-0000-4000-8000-000000000013')->>'state'),'resolved',
  'Admin resolves an acknowledged incident');
select is((public.admin_set_incident_state_v1(
  '44444444-0000-4000-8000-000000000010','resolved','restaurant contacted',
  '44444444-0000-4000-8000-000000000013')->>'state'),'resolved',
  'incident retry returns the original result');
select is((select count(*)::integer from private.audit_log
  where action in ('incident.acknowledged','incident.resolved')
    and target_id='44444444-0000-4000-8000-000000000010'),2,
  'acknowledgement and resolution are each audited once');

select * from finish();
rollback;
