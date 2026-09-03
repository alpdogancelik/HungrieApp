begin;

select plan(13);

insert into public.profiles(id, firebase_uid, name, email) values
  ('fixture_hosted_customer', 'fixture_hosted_firebase_customer', 'Hosted Customer', 'customer@hosted.example.invalid'),
  ('fixture_hosted_owner', 'fixture_hosted_firebase_owner', 'Hosted Owner', 'owner@hosted.example.invalid'),
  ('fixture_hosted_courier', 'fixture_hosted_firebase_courier', 'Hosted Courier', 'courier@hosted.example.invalid'),
  ('fixture_hosted_unscoped', 'fixture_hosted_firebase_unscoped', 'Hosted Unscoped', 'unscoped@hosted.example.invalid'),
  ('fixture_hosted_admin', 'fixture_hosted_firebase_admin', 'Hosted Admin', 'admin@hosted.example.invalid');
insert into public.restaurants(id, name, delivery_fee_kurus, minimum_order_kurus)
values ('fixture_hosted_restaurant', 'Hosted Fixture Kitchen', 500, 1000);
insert into public.categories(id, restaurant_id, name)
values ('fixture_hosted_category', 'fixture_hosted_restaurant', 'Hosted Fixture Category');
insert into public.menu_items(id, restaurant_id, category_id, name, price_kurus)
values ('fixture_hosted_menu', 'fixture_hosted_restaurant', 'fixture_hosted_category', 'Hosted Fixture Item', 2500);
insert into public.addresses(id, profile_id, label, line1, city, country, is_default)
values ('fixture_hosted_address', 'fixture_hosted_customer', 'Hosted fixture', 'Synthetic line', 'Synthetic city', 'Synthetic country', true);
insert into private.restaurant_members(restaurant_id, profile_id, role)
values ('fixture_hosted_restaurant', 'fixture_hosted_owner', 'owner');
insert into private.user_roles(profile_id, role) values
  ('fixture_hosted_courier', 'courier'),
  ('fixture_hosted_unscoped', 'courier'),
  ('fixture_hosted_admin', 'admin');
insert into private.restaurant_couriers(restaurant_id, profile_id)
values ('fixture_hosted_restaurant', 'fixture_hosted_courier');
insert into public.orders(
  id, profile_id, restaurant_id, status, payment_method,
  subtotal_kurus, delivery_fee_kurus, total_kurus
) values ('fixture_hosted_ready', 'fixture_hosted_customer', 'fixture_hosted_restaurant', 'ready', 'cash', 2500, 500, 3000);
insert into private.order_contacts(order_id, customer_name, customer_email, delivery_address_snapshot)
values ('fixture_hosted_ready', 'Hosted Customer', 'customer@hosted.example.invalid', '{"line1":"Synthetic line"}');

select ok(to_regprocedure('public.migration_auth_probe()') is null, 'temporary probe is absent on hosted development');
select ok(to_regprocedure('public.create_order(text,text,public.payment_method,jsonb,text)') is not null, 'secured order RPC exists on hosted development');

set local role anon;
select is((select count(*)::integer from public.active_restaurants where id = 'fixture_hosted_restaurant'), 1, 'hosted anon may read active catalog');
select throws_ok($$select phone from public.restaurants$$, '42501', null, 'hosted anon cannot read protected restaurant phone');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_hosted_firebase_customer"}', true);
select is((select id from public.profiles), 'fixture_hosted_customer', 'hosted customer identity is isolated');
select is((public.quote_order('fixture_hosted_restaurant', '[{"menu_item_id":"fixture_hosted_menu","quantity":1,"customization_ids":[]}]')->>'total_kurus')::bigint, 3000::bigint, 'hosted quote is server calculated');
select ok(public.create_order('fixture_hosted_restaurant', 'fixture_hosted_address', 'cash', '[{"menu_item_id":"fixture_hosted_menu","quantity":1,"customization_ids":[]}]', '') is not null, 'hosted customer creates order through RPC');
select throws_ok($$update public.orders set status = 'delivered' where id = 'fixture_hosted_ready'$$, '42501', null, 'hosted direct order mutation is denied');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_hosted_firebase_owner"}', true);
select is((select customer_email from public.restaurant_orders where id = 'fixture_hosted_ready'), 'customer@hosted.example.invalid', 'hosted owner sees active order contact');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_hosted_firebase_unscoped"}', true);
select is((select count(*)::integer from public.courier_available_orders), 0, 'hosted unscoped courier sees no queue');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_hosted_firebase_courier"}', true);
select is((select count(*)::integer from public.courier_available_orders where id = 'fixture_hosted_ready'), 1, 'hosted scoped courier sees ready queue');
select is(public.claim_delivery('fixture_hosted_ready'), 'fixture_hosted_ready', 'hosted scoped courier claims atomically');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_hosted_firebase_admin"}', true);
select ok((select count(*) >= 2 from public.admin_orders where restaurant_id = 'fixture_hosted_restaurant'), 'hosted admin support view is global');

reset role;
select * from finish();
rollback;
