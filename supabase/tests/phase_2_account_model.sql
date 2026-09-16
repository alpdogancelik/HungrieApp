begin;
select no_plan();

select is((select count(*)::integer from private.account_access),0,
  'Phase 2 does not classify seeded legacy profiles');
select is((select count(*)::integer from private.account_invitations),0,
  'Phase 2 does not create invitations');
select is((select count(*)::integer from public.restaurants where lifecycle_status='active'),2,
  'legacy active fixture restaurants remain active');
select ok(not has_table_privilege('authenticated','private.account_access','select'),
  'authenticated clients cannot read account rows');
select ok(not has_table_privilege('service_role','private.account_invitations','select'),
  'service role has no direct invitation access');
select ok(has_function_privilege('authenticated',
  'public.bootstrap_my_customer_account_v1(uuid)','execute'),
  'Phase 6 enables the caller-bound Customer bootstrap');
select ok(has_function_privilege('authenticated',
  'public.admin_set_account_status_v1(text,text,text,uuid)','execute'),
  'Phase 4 exposes status mutation through its canonical guard');
select ok(has_function_privilege('authenticated',
  'public.get_my_access_context_v1()','execute'),
  'access-context RPC is callable');

select throws_ok($$insert into private.account_access
  (profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
  values ('fixture_customer','customer','active',now(),'fixture_restaurant_a','owner')$$,
  '23514',null,'Customer cannot carry Restaurant scope');
select throws_ok($$insert into private.account_access
  (profile_id,account_type,status,onboarding_step,admin_role)
  values ('fixture_admin','admin','pending','none','admin')$$,
  '23514',null,'pending Admin needs an onboarding step');

insert into private.account_access(profile_id,account_type,status,activated_at)
values ('fixture_customer','customer','active',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at,
  restaurant_id,restaurant_role)
values ('fixture_owner','restaurant','active',statement_timestamp(),
  'fixture_restaurant_a','owner');
insert into private.account_access(profile_id,account_type,status,activated_at,
  admin_role,admin_mfa_enrolled_at)
values ('fixture_super_admin','admin','active',statement_timestamp(),
  'super_admin',statement_timestamp());

select throws_ok($$update private.account_access set account_type='restaurant'
  where profile_id='fixture_customer'$$,'23514',null,'account type cannot change');
select is((select authz_version::integer from private.account_access
  where profile_id='fixture_customer'),1,'initial authz version is one');
update private.account_access set status='suspended',suspended_at=statement_timestamp()
  where profile_id='fixture_customer';
select is((select authz_version::integer from private.account_access
  where profile_id='fixture_customer'),2,'status change increments authz version');
update private.account_access set status='revoked',revoked_at=statement_timestamp()
  where profile_id='fixture_customer';
select throws_ok($$update private.account_access set status='active',activated_at=now()
  where profile_id='fixture_customer'$$,'23514',null,'revoked account is terminal');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/other",' ||
  '"aud":"other","sub":"fixture_firebase_owner"}',true);
select ok(not private.is_active_restaurant_account(),'wrong issuer cannot access Restaurant');
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"wrong","sub":"fixture_firebase_owner"}',true);
select ok(not private.is_active_restaurant_account(),'wrong audience cannot access Restaurant');
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_owner","platform_role":"admin"}',true);
select ok(private.can_access_restaurant('fixture_restaurant_a'),
  'database Restaurant access ignores stale business-role claim');
select ok(not private.can_access_restaurant('fixture_restaurant_b'),
  'Restaurant access cannot cross tenants');
select is((public.get_my_access_context_v1()->>'accountType'),'restaurant',
  'Restaurant context uses canonical row');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin",' ||
  '"email_verified":true,"platform_role":"customer"}',true);
select ok(not private.is_active_admin(),'Admin without current MFA is denied');
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin",' ||
  '"email_verified":false,"firebase":{"sign_in_second_factor":"totp"}}',true);
select ok(not private.is_active_admin(),'unverified Admin email is denied');
select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated',
    'iss','https://securetoken.google.com/hungrieapp-a2288',
    'aud','hungrieapp-a2288','sub','fixture_firebase_super_admin',
    'email_verified',true,'platform_role','customer',
    'auth_time',extract(epoch from statement_timestamp())::bigint,
    'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select ok(private.is_active_admin(),'current TOTP Admin session is accepted');
select ok(private.has_admin_role('admin'),'super-admin includes Admin capability');
select throws_ok($$select public.admin_set_account_status_v1(
  'fixture_super_admin','suspended','test',
  '00000000-0000-4000-8000-000000000001')$$,'23514',null,
  'last MFA-ready super-admin cannot be suspended');
select throws_ok($$select public.admin_set_account_status_v1(
  'fixture_owner','suspended','test',
  '00000000-0000-4000-8000-000000000011')$$,'23514',null,
  'last active Restaurant owner cannot be suspended');
select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated',
    'iss','https://securetoken.google.com/hungrieapp-a2288',
    'aud','hungrieapp-a2288','sub','fixture_firebase_super_admin',
    'email_verified',true,'auth_time',
    extract(epoch from statement_timestamp()-interval '10 minutes')::bigint,
    'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select throws_ok($$select private.require_recent_admin_auth(interval '5 minutes')$$,
  '42501',null,'stale Admin authentication cannot approve high-impact action');
select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated',
    'iss','https://securetoken.google.com/hungrieapp-a2288',
    'aud','hungrieapp-a2288','sub','fixture_firebase_super_admin',
    'email_verified',true,'platform_role','customer',
    'auth_time',extract(epoch from statement_timestamp())::bigint,
    'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);

select is((public.admin_invite_restaurant_account_v1(
  'new.staff@example.invalid','fixture_restaurant_a','manager',
  encode(extensions.digest(repeat('a',40),'sha256'),'hex'),
  '00000000-0000-4000-8000-000000000002')->>'invitationId') is not null,
  true,'Admin may create manager invitation under canonical authorization');
select is((select count(*)::integer from private.account_invitations
  where normalized_email='new.staff@example.invalid' and state='pending'),1,
  'one pending invitation exists');
select is((public.admin_invite_restaurant_account_v1(
  'new.staff@example.invalid','fixture_restaurant_a','manager',
  encode(extensions.digest(repeat('a',40),'sha256'),'hex'),
  '00000000-0000-4000-8000-000000000002')->>'invitationId')::uuid,
  (select id from private.account_invitations where state='pending'),
  'retry returns the same invitation');
select is((select count(*)::integer from private.account_invitations),1,
  'retry creates no duplicate invitation');
select throws_ok($$select public.admin_invite_restaurant_account_v1(
  'new.staff@example.invalid','fixture_restaurant_a','owner',
  encode(extensions.digest(repeat('a',40),'sha256'),'hex'),
  '00000000-0000-4000-8000-000000000002')$$,'23505',null,
  'operation ID cannot be reused for another scope');

select is((public.admin_invite_restaurant_account_v1(
  'new.staff@example.invalid','fixture_restaurant_a','manager',
  encode(extensions.digest(repeat('b',40),'sha256'),'hex'),
  '00000000-0000-4000-8000-000000000003')->>'invitationId') is not null,
  true,'reissue succeeds');
select is((select count(*)::integer from private.account_invitations
  where normalized_email='new.staff@example.invalid' and state='revoked'),1,
  'reissue revokes prior pending token');
select is((select count(*)::integer from private.account_invitations
  where normalized_email='new.staff@example.invalid' and state='pending'),1,
  'reissue leaves one pending token');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"new_staff_uid",' ||
  '"email":"new.staff@example.invalid","email_verified":true}',true);
select is((public.accept_my_account_invitation_v1(repeat('b',40),
  '00000000-0000-4000-8000-000000000004')->>'accountType'),'restaurant',
  'verified invitee creates a pending Restaurant account');
select is((select status::text from private.account_access where profile_id='new_staff_uid'),
  'pending','accepted account is not active');
select is((public.accept_my_account_invitation_v1(repeat('b',40),
  '00000000-0000-4000-8000-000000000004')->>'profileId'),
  'new_staff_uid','acceptance retry is idempotent');
select is((select count(*)::integer from private.account_access),4,
  'invitation retry creates no duplicate access row');

insert into private.restaurant_operational_incidents(restaurant_id,incident_type,
  state,window_started_at,window_ended_at,ignored_order_count,eligible_order_count,
  threshold_snapshot,resolved_at)
values('fixture_restaurant_a','repeated_order_non_response','resolved',
  now()-interval '3 years',now()-interval '3 years',2,5,'{}',
  now()-interval '3 years');
update private.account_invitations set state_changed_at=now()-interval '2 years'
  where normalized_email='new.staff@example.invalid' and state='revoked';
select is((private.phase2_cleanup_retained_records(now())->>'invitations')::integer,1,
  'retention cleanup removes one old terminal invitation');
select is((select count(*)::integer from private.restaurant_operational_incidents),0,
  'retention cleanup removes old resolved incidents');
select is((select count(*)::integer from private.account_invitations
  where normalized_email='new.staff@example.invalid'),1,
  'retention cleanup preserves recent accepted invitation');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider",' ||
  '"email":"new.staff@example.invalid"}',true);
select throws_ok($$select public.bootstrap_my_customer_account_v1(
  '00000000-0000-4000-8000-000000000005')$$,'42501',null,
  'Customer bootstrap cannot claim reserved staff email');

-- Legacy authorization still uses its original role and membership tables.
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288",' ||
  '"aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select ok(private.is_restaurant_member('fixture_restaurant_a'),
  'legacy Restaurant membership remains functional');

select * from finish();
rollback;
