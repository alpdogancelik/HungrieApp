begin;

select plan(34);

insert into public.orders (
  id, profile_id, restaurant_id, status, payment_method,
  subtotal_kurus, delivery_fee_kurus, total_kurus
) values
  ('m3_ready_order', 'fixture_customer', 'fixture_restaurant_a', 'ready', 'cash', 2500, 500, 3000),
  ('m3_other_order', 'fixture_outsider', 'fixture_restaurant_b', 'pending', 'cash', 700, 0, 700);
insert into private.order_contacts (order_id, customer_name, customer_email, delivery_address_snapshot)
values
  ('m3_ready_order', 'Ready Customer', 'ready@example.invalid', '{"line1":"Private ready address"}'),
  ('m3_other_order', 'Other Customer', 'other@example.invalid', '{"line1":"Private other address"}');
insert into public.order_items (id, order_id, menu_item_id, name_snapshot, unit_price_kurus, quantity)
values
  ('m3_ready_item', 'm3_ready_order', 'fixture_menu_a', 'Fixture Meal', 2500, 1),
  ('m3_other_item', 'm3_other_order', 'fixture_menu_b', 'Fixture Drink', 700, 1);

set local role anon;
select is((select count(*)::integer from public.active_restaurants), 2, 'anon sees active restaurants');
select is((select count(*)::integer from public.published_product_reviews), 1, 'anon sees published reviews');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://wrong.example","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select is((select count(*)::integer from public.profiles), 0, 'wrong Firebase issuer resolves no profile');
select is((select count(*)::integer from public.my_orders), 0, 'wrong Firebase issuer resolves no orders');
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"wrong-project","sub":"fixture_firebase_customer"}', true);
select is((select count(*)::integer from public.profiles), 0, 'wrong Firebase audience resolves no profile');
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"missing"}', true);
select is((select count(*)::integer from public.profiles), 0, 'unmapped Firebase subject resolves no profile');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select is((select id from public.profiles), 'fixture_customer', 'customer sees only own profile');
select is((select count(*)::integer from public.addresses), 1, 'customer sees only own addresses');
select is((select count(*)::integer from public.favorites), 1, 'customer sees only own favorites');
select is((select count(*)::integer from public.my_orders), 2, 'customer sees complete own order history');
select is((select count(*)::integer from public.orders), 2, 'base order RLS exposes only customer orders');
select is((select count(*)::integer from public.order_items), 2, 'child RLS follows customer order access');
select is((select count(*)::integer from public.profiles where id = 'fixture_outsider'), 0, 'customer cannot select another profile');
select throws_ok($$update public.profiles set name = 'Fixture Customer Updated' where id = 'fixture_customer'$$, '42501', null, 'Milestone 6 requires profile mutations through RPCs');
select throws_ok($$update public.profiles set email = 'changed@example.invalid' where id = 'fixture_customer'$$, '42501', null, 'customer cannot update protected email');
select throws_ok($$insert into public.addresses (id, profile_id, label, line1, city, country) values ('m3_address', 'fixture_customer', 'Other', 'Line', 'City', 'Country')$$, '42501', null, 'Milestone 6 requires address mutations through RPCs');
select throws_ok($$insert into public.addresses (id, profile_id, label, line1, city, country) values ('m3_bad_address', 'fixture_outsider', 'Other', 'Line', 'City', 'Country')$$, '42501', null, 'customer cannot create another profile address');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select is((select count(*)::integer from public.restaurant_orders), 0, 'unaffiliated customer sees no restaurant orders');
select is((select count(*)::integer from public.courier_available_orders), 0, 'ordinary customer sees no courier queue');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select is((select count(*)::integer from public.restaurant_orders), 2, 'owner sees only own restaurant orders');
select is((select customer_email from public.restaurant_orders where id = 'fixture_order'), null, 'terminal restaurant order email is masked');
select is((select customer_email from public.restaurant_orders where id = 'm3_ready_order'), 'ready@example.invalid', 'active restaurant order email remains available');
select is((select count(*)::integer from public.orders), 2, 'owner base order RLS is restaurant-scoped');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select is((select count(*)::integer from public.restaurant_orders), 2, 'manager sees own restaurant orders');
select is((select count(*)::integer from public.my_restaurant_memberships), 1, 'manager sees only own membership');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_courier"}', true);
select is((select count(*)::integer from public.courier_available_orders), 1, 'scoped courier sees privacy-safe ready queue');
select is((select count(*)::integer from public.orders), 2, 'courier base RLS exposes assigned and privacy-safe available orders');
select is((select customer_email from public.courier_assigned_orders where id = 'fixture_order'), null, 'terminal courier contact is masked');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_unscoped_courier"}', true);
select is((select count(*)::integer from public.courier_available_orders), 0, 'unscoped courier sees no ready queue');
select is((select count(*)::integer from public.orders), 0, 'unscoped courier sees no orders');

select set_config('request.jwt.claims', '{"role":"authenticated","platform_role":"admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}', true);
select is((select count(*)::integer from public.admin_orders), 3, 'admin sees all orders through support view');
select is((select customer_email from public.admin_orders where id = 'fixture_order'), 'customer@example.invalid', 'admin support view retains terminal contact');
select is((select count(*)::integer from public.profiles), 8, 'admin profile RLS is global');

reset role;
select * from finish();
rollback;
