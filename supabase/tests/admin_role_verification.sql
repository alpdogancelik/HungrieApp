begin;

select plan(14);

select has_function(
  'public',
  'get_my_admin_authorization',
  array[]::text[],
  'caller-bound admin authorization RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_admin_authorization()', 'execute'),
  'anonymous users cannot execute admin authorization RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_admin_authorization()', 'execute'),
  'authenticated users can execute admin authorization RPC'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',
  true
);
select is(public.get_my_admin_authorization() ->> 'profile_id', 'fixture_customer', 'customer receives own profile ID');
select is(public.get_my_admin_authorization() ->> 'platform_role', null, 'customer has no platform admin role');
select is((public.get_my_admin_authorization() ->> 'is_admin')::boolean, false, 'customer is not an admin');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}',
  true
);
select is(public.get_my_admin_authorization() ->> 'profile_id', 'fixture_admin', 'admin receives own profile ID');
select is(public.get_my_admin_authorization() ->> 'platform_role', 'admin', 'admin receives admin role');
select is((public.get_my_admin_authorization() ->> 'is_admin')::boolean, true, 'admin authorization is true');
select is((public.get_my_admin_authorization() ->> 'is_super_admin')::boolean, false, 'admin is not a super-admin');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin"}',
  true
);
select is(public.get_my_admin_authorization() ->> 'profile_id', 'fixture_super_admin', 'super-admin receives own profile ID');
select is(public.get_my_admin_authorization() ->> 'platform_role', 'super_admin', 'super-admin role takes precedence');
select is((public.get_my_admin_authorization() ->> 'is_admin')::boolean, true, 'super-admin has admin authorization');
select is((public.get_my_admin_authorization() ->> 'is_super_admin')::boolean, true, 'super-admin authorization is true');

select * from finish();
rollback;
