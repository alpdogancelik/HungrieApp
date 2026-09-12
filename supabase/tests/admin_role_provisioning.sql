begin;

select plan(33);

select has_function(
  'private',
  'apply_platform_admin_role',
  array['text', 'platform_role', 'text', 'boolean', 'uuid', 'text'],
  'locked operator role function exists'
);
select ok(
  not has_function_privilege('authenticated', 'private.apply_platform_admin_role(text,public.platform_role,text,boolean,uuid,text)', 'execute'),
  'authenticated clients cannot execute operator provisioning'
);
select ok(
  not has_function_privilege('service_role', 'private.apply_platform_admin_role(text,public.platform_role,text,boolean,uuid,text)', 'execute'),
  'service role cannot execute operator provisioning'
);
select has_index(
  'private', 'user_roles', 'user_roles_one_admin_level_per_profile_idx',
  'database enforces one admin-level role per profile'
);
select throws_ok(
  $$insert into private.user_roles(profile_id, role) values ('fixture_admin', 'super_admin')$$,
  '23505', null, 'conflicting admin and super-admin rows are rejected'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","platform_role":"admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',
  true
);
select ok(not private.has_platform_role('admin'), 'Firebase admin claim without database role is denied');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}',
  true
);
select ok(not private.has_platform_role('admin'), 'database admin role without Firebase claim is denied');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","platform_role":"admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}',
  true
);
select ok(private.has_platform_role('admin'), 'matching admin signals are authorized');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","platform_role":"super_admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}',
  true
);
select ok(
  not private.has_platform_role('admin') and not private.has_platform_role('super_admin'),
  'mismatched admin role signals are denied'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","platform_role":"owner","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}',
  true
);
select ok(
  not private.has_platform_role('admin') and not private.has_platform_role('super_admin'),
  'unknown Firebase platform role is denied'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","platform_role":"super_admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin"}',
  true
);
select ok(private.has_platform_role('super_admin'), 'matching super-admin signals are authorized');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_courier"}',
  true
);
select ok(private.has_platform_role('courier'), 'courier remains database-authorized without an admin claim');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin"}',
  true
);
select throws_ok(
  $$select public.set_platform_role('fixture_outsider', 'admin', true)$$,
  '42501', null, 'database-only super-admin cannot invoke role management'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","platform_role":"super_admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin"}',
  true
);
select lives_ok(
  $$select public.set_platform_role('fixture_outsider', 'admin', true)$$,
  'matching super-admin can grant an admin role'
);
reset role;
select ok(
  exists(select 1 from private.user_roles where profile_id='fixture_outsider' and role='admin'),
  'authenticated role grant is stored'
);
select ok(
  exists(select 1 from private.audit_log where target_id='fixture_outsider' and action='platform.role_changed' and metadata->>'source'='authenticated_rpc'),
  'authenticated role grant is audited'
);

delete from private.user_roles
where role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);

select lives_ok(
  $$select private.apply_platform_admin_role(
    'fixture_outsider', 'super_admin', null, true,
    '00000000-0000-4000-8000-000000000001', 'admin_provisioning_cli'
  )$$,
  'first super-admin bootstrap succeeds when none exists'
);
select is(
  (select count(*)::integer from private.user_roles where role='super_admin'),
  1,
  'bootstrap creates exactly one super-admin'
);
select ok(
  exists(select 1 from private.audit_log where target_id='fixture_outsider'
    and action='platform.role_changed' and (metadata->>'bootstrap')::boolean),
  'bootstrap grant is audited'
);
select throws_ok(
  $$select private.apply_platform_admin_role(
    'fixture_admin', 'super_admin', null, true,
    '00000000-0000-4000-8000-000000000002', 'admin_provisioning_cli'
  )$$,
  '42501', null, 'second bootstrap is rejected'
);
select throws_ok(
  $$select private.apply_platform_admin_role(
    'fixture_outsider', 'admin', 'fixture_outsider', false,
    '00000000-0000-4000-8000-000000000003', 'admin_provisioning_cli'
  )$$,
  '22023', null, 'last super-admin cannot be downgraded'
);
select throws_ok(
  $$select private.apply_platform_admin_role(
    'fixture_outsider', null, 'fixture_outsider', false,
    '00000000-0000-4000-8000-000000000004', 'admin_provisioning_cli'
  )$$,
  '22023', null, 'last super-admin cannot be revoked'
);
select ok(
  not exists(select 1 from private.audit_log where metadata->>'operation_id'='00000000-0000-4000-8000-000000000003'),
  'rejected last-super-admin downgrade is not audit-recorded'
);
select ok(
  not exists(select 1 from private.audit_log where metadata->>'operation_id'='00000000-0000-4000-8000-000000000004'),
  'rejected last-super-admin revocation is not audit-recorded'
);

select lives_ok(
  $$select private.apply_platform_admin_role(
    'fixture_super_admin', 'super_admin', 'fixture_outsider', false,
    '00000000-0000-4000-8000-000000000005', 'admin_provisioning_cli'
  )$$,
  'existing super-admin can grant a second super-admin'
);
select is(
  (select count(*)::integer from private.user_roles where role='super_admin'),
  2,
  'second super-admin grant is stored'
);
select lives_ok(
  $$select private.apply_platform_admin_role(
    'fixture_outsider', 'admin', 'fixture_super_admin', false,
    '00000000-0000-4000-8000-000000000006', 'admin_provisioning_cli'
  )$$,
  'super-admin downgrade succeeds when another super-admin remains'
);
select ok(
  exists(select 1 from private.user_roles where profile_id='fixture_outsider' and role='admin')
  and not exists(select 1 from private.user_roles where profile_id='fixture_outsider' and role='super_admin'),
  'downgrade leaves exactly the requested admin role'
);
select ok(
  exists(select 1 from private.audit_log where target_id='fixture_outsider'
    and metadata->>'operation_id'='00000000-0000-4000-8000-000000000006'),
  'downgrade is audited with its operation ID'
);
select lives_ok(
  $$select private.apply_platform_admin_role(
    'fixture_outsider', null, 'fixture_super_admin', false,
    '00000000-0000-4000-8000-000000000007', 'admin_provisioning_cli'
  )$$,
  'admin revocation succeeds'
);
select is(
  (select count(*)::integer from private.user_roles where profile_id='fixture_outsider'
    and role in ('admin'::public.platform_role, 'super_admin'::public.platform_role)),
  0,
  'revocation removes all admin-level roles'
);
select ok(
  exists(select 1 from private.audit_log where target_id='fixture_outsider'
    and metadata->>'operation_id'='00000000-0000-4000-8000-000000000007'),
  'revocation is audited'
);
select throws_ok(
  $$select private.apply_platform_admin_role(
    'missing-profile', 'admin', 'fixture_super_admin', false,
    '00000000-0000-4000-8000-000000000008', 'admin_provisioning_cli'
  )$$,
  '22023', null, 'operator provisioning refuses a missing profile'
);

select * from finish();
rollback;
