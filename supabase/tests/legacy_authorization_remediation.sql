begin;

select plan(38);

-- Test-only schema visibility; production grants remain unchanged after rollback.
grant usage on schema private to authenticated;

insert into private.account_access(
  profile_id, account_type, status, activated_at, restaurant_id, restaurant_role
) values
  ('fixture_customer', 'customer', 'active', statement_timestamp(), null, null),
  ('fixture_owner', 'restaurant', 'active', statement_timestamp(), 'fixture_restaurant_a', 'owner'),
  ('fixture_manager', 'restaurant', 'active', statement_timestamp(), 'fixture_restaurant_a', 'manager');

insert into private.account_access(
  profile_id, account_type, status, activated_at, admin_role, admin_mfa_enrolled_at
) values
  ('fixture_admin', 'admin', 'active', statement_timestamp(), 'admin', statement_timestamp()),
  ('fixture_super_admin', 'admin', 'active', statement_timestamp(), 'super_admin', statement_timestamp());

-- Deliberately retain stale authority records throughout suspension tests.
insert into private.restaurant_members(restaurant_id, profile_id, role)
values ('fixture_restaurant_b', 'fixture_customer', 'manager');
insert into private.user_roles(profile_id, role)
values ('fixture_customer', 'admin');

insert into public.addresses(id, profile_id, label, line1, city, country, is_default)
values ('legacy-auth-other-address', 'fixture_outsider', 'Other', 'Other line', 'Other city', 'Other country', false);

insert into public.orders(
  id, profile_id, restaurant_id, status, payment_method, subtotal_kurus,
  delivery_fee_kurus, service_fee_kurus, discount_kurus, tip_kurus,
  total_kurus, eta_minutes
) values
  ('legacy-auth-active-cancel', 'fixture_customer', 'fixture_restaurant_a', 'pending', 'cash', 1000, 0, 0, 0, 0, 1000, 20),
  ('legacy-auth-suspended-cancel', 'fixture_customer', 'fixture_restaurant_a', 'pending', 'cash', 1000, 0, 0, 0, 0, 1000, 20),
  ('legacy-auth-stale-courier', 'fixture_outsider', 'fixture_restaurant_a', 'out_for_delivery', 'cash', 1000, 0, 0, 0, 0, 1000, 20);
update public.orders set courier_profile_id = 'fixture_customer'
where id = 'legacy-auth-stale-courier';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);

select is(private.current_profile_id(), 'fixture_customer', 'active Customer resolves through the compatibility identity helper');
select ok(private.is_order_customer('fixture_order'), 'active Customer retains own-order authorization');
select ok(private.can_subscribe_order_topic((select topic from public.my_customer_order_realtime_topics_v1())), 'active Customer retains own generation-bound Realtime topic');
select is((select count(*)::integer from public.addresses), 1, 'active Customer RLS exposes only the Customer own address');
select lives_ok($$select public.transition_order('legacy-auth-active-cancel', 'canceled')$$, 'active Customer retains supported legacy cancellation');
select ok(not private.is_restaurant_member('fixture_restaurant_b'), 'active Customer cannot gain Restaurant authority from stale membership');
select ok(not private.has_platform_role('admin'), 'active Customer cannot gain Admin authority from stale role');
select is((select count(*)::integer from public.orders where id = 'legacy-auth-stale-courier'), 0, 'stale courier assignment cannot grant direct order RLS access');

reset role;
update private.account_access set status = 'suspended', suspended_at = statement_timestamp()
where profile_id = 'fixture_customer';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);

select is(private.current_profile_id(), null, 'suspended Customer no longer resolves through legacy RLS identity');
select ok(not private.is_order_customer('fixture_order'), 'suspended Customer cannot read own order through legacy helper');
select is((select count(*)::integer from public.addresses), 0, 'suspended Customer loses direct RLS access');
select throws_ok($$select public.transition_order('legacy-auth-suspended-cancel', 'canceled')$$, '42501', null, 'suspended Customer cannot use legacy cancellation RPC');
select ok(not private.can_subscribe_order_topic('orders:profile:v2:fixture_customer:1'), 'suspended Customer loses its former protected Realtime topic');
select ok(not private.is_restaurant_member('fixture_restaurant_b'), 'suspended Customer stale Restaurant membership remains ineffective');
select ok(not private.has_platform_role('admin'), 'suspended Customer stale Admin role remains ineffective');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select ok(private.is_restaurant_member('fixture_restaurant_a'), 'active Restaurant manager retains own-tenant authority');
select ok(not private.is_restaurant_member('fixture_restaurant_b'), 'active Restaurant manager remains isolated from another tenant');
select ok(not private.is_restaurant_owner('fixture_restaurant_a'), 'active Restaurant manager does not gain owner authority');

reset role;
update private.account_access set status = 'suspended', suspended_at = statement_timestamp()
where profile_id = 'fixture_manager';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select ok(not private.is_restaurant_member('fixture_restaurant_a'), 'suspended manager loses own-tenant authority with stale membership retained');
select ok(not private.can_subscribe_order_topic('orders:restaurant:fixture_restaurant_a'), 'suspended manager loses Restaurant Realtime authority');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select ok(private.is_restaurant_owner('fixture_restaurant_a'), 'active Restaurant owner retains owner authority');
select ok(not private.is_restaurant_member('fixture_restaurant_b'), 'active Restaurant owner remains cross-tenant isolated');

reset role;
update private.account_access set status = 'suspended', suspended_at = statement_timestamp()
where profile_id = 'fixture_owner';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select ok(not private.is_restaurant_owner('fixture_restaurant_a'), 'suspended owner loses owner authority with stale membership retained');
select ok(not private.is_restaurant_member('fixture_restaurant_a'), 'suspended owner loses all Restaurant authority');

reset role;
insert into private.push_tokens(
  id, profile_id, token, token_hash, platform, provider, app
) values (
  'legacy-auth-suspended-owner-token', 'fixture_owner', 'ExpoPushToken[legacy-auth-suspended-owner]',
  repeat('a', 64), 'ios', 'expo', 'hungrie'
);
insert into private.notification_events(
  idempotency_key, event_type, order_id
) values (
  'legacy-auth-suspended-owner-event', 'restaurant_new_order', 'legacy-auth-suspended-cancel'
);
select private.materialize_notification_deliveries();
select is((
  select count(*)::integer
  from private.notification_deliveries d
  join private.push_tokens t on t.id = d.token_id
  where t.id = 'legacy-auth-suspended-owner-token'
), 0, 'suspended Restaurant owner receives no private notification through stale membership');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'iss', 'https://securetoken.google.com/hungrieapp-a2288',
    'aud', 'hungrieapp-a2288', 'sub', 'fixture_firebase_admin', 'email_verified', true,
    'firebase', jsonb_build_object('sign_in_second_factor', 'totp'))::text, true);
select ok(private.is_admin(), 'active Admin retains canonical Admin authority');
select is((public.get_my_admin_authorization()->>'platform_role'), 'admin', 'Admin authorization response uses canonical role');

reset role;
update private.account_access set status = 'suspended', suspended_at = statement_timestamp()
where profile_id = 'fixture_admin';
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'iss', 'https://securetoken.google.com/hungrieapp-a2288',
    'aud', 'hungrieapp-a2288', 'sub', 'fixture_firebase_admin', 'email_verified', true,
    'firebase', jsonb_build_object('sign_in_second_factor', 'totp'))::text, true);
select ok(not private.is_admin(), 'suspended Admin loses Admin authority while stale role remains');
select throws_ok($$select public.get_my_admin_authorization()$$, '42501', null, 'suspended Admin cannot use legacy Admin authorization RPC');
select ok(not private.can_subscribe_order_topic('orders:admin'), 'suspended Admin loses Admin Realtime authority');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'iss', 'https://securetoken.google.com/hungrieapp-a2288',
    'aud', 'hungrieapp-a2288', 'sub', 'fixture_firebase_super_admin', 'email_verified', true,
    'firebase', jsonb_build_object('sign_in_second_factor', 'totp'))::text, true);
select ok(private.has_platform_role('super_admin'), 'active Super Admin retains canonical privileged authority');
select lives_ok($$select public.set_platform_role('fixture_outsider', 'courier', true)$$, 'active Super Admin can reach compatibility role-management RPC');

reset role;
update private.account_access set status = 'suspended', suspended_at = statement_timestamp()
where profile_id = 'fixture_super_admin';
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'iss', 'https://securetoken.google.com/hungrieapp-a2288',
    'aud', 'hungrieapp-a2288', 'sub', 'fixture_firebase_super_admin', 'email_verified', true,
    'firebase', jsonb_build_object('sign_in_second_factor', 'totp'))::text, true);
select ok(not private.has_platform_role('super_admin'), 'suspended Super Admin loses privilege while stale role remains');
select throws_ok($$select public.set_platform_role('fixture_outsider', 'admin', true)$$, '42501', null, 'suspended Super Admin cannot use legacy role-management RPC');
select ok(not private.can_subscribe_order_topic('orders:admin'), 'suspended Super Admin loses Admin Realtime authority');

select ok(not private.is_restaurant_courier('fixture_restaurant_a'), 'obsolete courier membership cannot independently grant authority');
select ok(not private.can_subscribe_order_topic('orders:courier:fixture_courier'), 'obsolete courier Realtime topic fails closed');

select set_config('request.jwt.claims', '{}', true);
select is(private.current_profile_id(), null, 'anonymous identity has no protected authority');

select * from finish();
rollback;
