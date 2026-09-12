begin;

select plan(50);

update public.menu_items set customizations =
  '[{"id":"extra","name":"Synthetic extra","price_kurus":200}]'::jsonb
where id = 'fixture_menu_a';

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer","email":"customer@example.invalid"}', true);

select is(
  (public.quote_order('fixture_restaurant_a', '[{"menu_item_id":"fixture_menu_a","quantity":2,"customization_ids":[]}]') ->> 'total_kurus')::bigint,
  5000::bigint,
  'quote uses catalog price with delivery temporarily free'
);
select is(
  (public.quote_order('fixture_restaurant_a', '[{"menu_item_id":"fixture_menu_a","quantity":1,"customization_ids":[]}]') ->> 'service_fee_kurus')::bigint,
  0::bigint,
  'service fee remains server-controlled zero'
);
select is(
  (public.quote_order('fixture_restaurant_a', '[{"menu_item_id":"fixture_menu_a","quantity":1,"customization_ids":["extra"]}]') ->> 'total_kurus')::bigint,
  2700::bigint,
  'quote validates customization IDs and uses server customization price'
);
select throws_ok(
  $$select public.quote_order('fixture_restaurant_a', '[{"menu_item_id":"fixture_menu_a","quantity":1,"customization_ids":["missing"]}]')$$,
  '22023', null, 'quote rejects unknown customization IDs'
);
select throws_ok(
  $$select public.quote_order('fixture_restaurant_a', '[{"menu_item_id":"fixture_menu_b","quantity":1,"customization_ids":[]}]')$$,
  '22023', null, 'quote rejects a menu item from another restaurant'
);
select throws_ok(
  $$select public.quote_order('fixture_restaurant_a', '[{"menu_item_id":"fixture_menu_a","quantity":0,"customization_ids":[]}]')$$,
  '22023', null, 'quote rejects non-positive quantity'
);

create temporary table m3_created_order(id text);
insert into m3_created_order
select public.create_order(
  'fixture_restaurant_a', 'fixture_address', 'cash',
  '[{"menu_item_id":"fixture_menu_a","quantity":1,"customization_ids":[]}]',
  'Synthetic order'
);
select ok((select id ~ '^[0-9a-f-]{36}$' from m3_created_order), 'create_order returns UUID text');
select is((select total_kurus from public.orders where id = (select id from m3_created_order)), 2500::bigint, 'created total is server calculated with free delivery');
reset role;
select is((select count(*)::integer from private.order_contacts where order_id = (select id from m3_created_order)), 1, 'order contact snapshot is created privately');
select is((select count(*)::integer from public.order_items where order_id = (select id from m3_created_order)), 1, 'order item snapshot is created atomically');
select is((select count(*)::integer from private.order_status_history where order_id = (select id from m3_created_order)), 1, 'initial status history is created atomically');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer","email":"customer@example.invalid"}', true);
select lives_ok($$select public.set_default_address('fixture_address')$$, 'customer can atomically select own default address');
select throws_ok($$select public.set_default_address('missing')$$, '42501', null, 'customer cannot set an unavailable address');
select lives_ok($$select public.request_order_reminder((select id from m3_created_order))$$, 'customer can request a pending-order reminder');
select throws_ok($$select public.request_order_reminder((select id from m3_created_order))$$, '22023', null, 'reminder requests are throttled');
select throws_ok($$select public.transition_order((select id from m3_created_order), 'preparing')$$, '42501', null, 'customer cannot prepare an order');
select lives_ok($$select public.transition_order((select id from m3_created_order), 'canceled')$$, 'customer can cancel a pending own order');
select is(public.ensure_my_profile('Fixture Customer', null, null, 'en'), 'fixture_customer', 'profile initialization safely reuses mapped Firebase profile');

reset role;
insert into public.orders (id, profile_id, restaurant_id, status, payment_method, subtotal_kurus, delivery_fee_kurus, total_kurus)
values
  ('m3_flow_order', 'fixture_customer', 'fixture_restaurant_a', 'pending', 'cash', 2500, 500, 3000),
  ('m3_claim_order', 'fixture_customer', 'fixture_restaurant_a', 'ready', 'cash', 2500, 500, 3000),
  ('m3_other_claim', 'fixture_outsider', 'fixture_restaurant_b', 'ready', 'cash', 700, 0, 700),
  ('m3_review_order', 'fixture_customer', 'fixture_restaurant_a', 'delivered', 'cash', 2500, 500, 3000),
  ('m3_admin_cancel', 'fixture_customer', 'fixture_restaurant_a', 'out_for_delivery', 'cash', 2500, 500, 3000);
update public.orders set courier_profile_id = 'fixture_courier' where id = 'm3_admin_cancel';
insert into private.order_contacts(order_id, customer_name, delivery_address_snapshot)
values
  ('m3_flow_order', 'Flow Customer', '{"line1":"Synthetic"}'),
  ('m3_claim_order', 'Claim Customer', '{"line1":"Synthetic"}'),
  ('m3_other_claim', 'Other Customer', '{"line1":"Synthetic"}'),
  ('m3_review_order', 'Review Customer', '{"line1":"Synthetic"}'),
  ('m3_admin_cancel', 'Cancel Customer', '{"line1":"Synthetic"}');
insert into public.order_items(id, order_id, menu_item_id, name_snapshot, unit_price_kurus, quantity)
values ('m3_review_item', 'm3_review_order', 'fixture_menu_a', 'Fixture Meal', 2500, 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select lives_ok($$select public.transition_order('m3_flow_order', 'preparing')$$, 'manager can accept a restaurant order');
select lives_ok($$select public.transition_order('m3_flow_order', 'out_for_delivery')$$, 'manager hands an accepted order to the restaurant courier');
select lives_ok($$select public.transition_order('m3_flow_order', 'delivered')$$, 'manager completes the restaurant-managed delivery');
select throws_ok($$select public.set_restaurant_member('fixture_restaurant_a', 'fixture_outsider', 'manager')$$, '42501', null, 'manager cannot manage memberships');
select lives_ok($$select public.update_restaurant_details('fixture_restaurant_a', '{"description":"Updated synthetic description"}')$$, 'manager can update safe restaurant details');
select throws_ok($$select public.update_restaurant_details('fixture_restaurant_a', '{"rating_average":5}')$$, '22023', null, 'restaurant details reject protected computed fields');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_unscoped_courier"}', true);
select throws_ok($$select public.claim_delivery('m3_claim_order')$$, '42501', null, 'unscoped courier cannot claim delivery');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_courier"}', true);
select is(public.claim_delivery('m3_claim_order'), 'm3_claim_order', 'scoped courier claims ready order');
select throws_ok($$select public.claim_delivery('m3_claim_order')$$, '42501', null, 'an order cannot be claimed twice');
select lives_ok($$select public.transition_order('m3_claim_order', 'delivered')$$, 'assigned courier can deliver claimed order');
select throws_ok($$select public.claim_delivery('m3_other_claim')$$, '42501', null, 'courier cannot claim another restaurant order');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
create temporary table m3_reviews(product_id text, order_id text);
insert into m3_reviews(product_id)
select public.submit_product_review('m3_review_order', 'fixture_menu_a', 5::smallint, 'Synthetic product review');
update m3_reviews set order_id = public.submit_order_review('m3_review_order', 5::smallint, 4::smallint, 5::smallint, 4::smallint, 'Synthetic order review');
select ok((select product_id is not null and order_id is not null from m3_reviews), 'customer submits both delivered-order review types');
select throws_ok($$select public.submit_product_review('m3_review_order', 'fixture_menu_a', 4::smallint, '')$$, '23505', null, 'logical duplicate product review is rejected');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select throws_ok($$select public.moderate_review('product', (select product_id from m3_reviews), 'hidden')$$, '42501', null, 'unaffiliated customer cannot moderate review');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select lives_ok($$select public.moderate_review('product', (select product_id from m3_reviews), 'hidden', 'Synthetic reply')$$, 'restaurant manager moderates own review');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select lives_ok($$select public.set_restaurant_member('fixture_restaurant_a', 'fixture_outsider', 'manager')$$, 'owner can add another manager');
select throws_ok($$select public.set_restaurant_member('fixture_restaurant_a', 'fixture_outsider', 'owner')$$, '42501', null, 'owner cannot grant ownership');
select lives_ok($$select public.set_restaurant_courier('fixture_restaurant_a', 'fixture_unscoped_courier', true)$$, 'owner can scope an existing platform courier');
select throws_ok($$select public.set_restaurant_courier('fixture_restaurant_a', 'fixture_outsider', true)$$, '22023', null, 'owner cannot scope a non-courier');

select set_config('request.jwt.claims', '{"role":"authenticated","platform_role":"super_admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_super_admin"}', true);
select lives_ok($$select public.set_platform_role('fixture_outsider', 'admin', true)$$, 'super-admin can grant platform role');
select lives_ok($$select public.set_restaurant_member('fixture_restaurant_a', 'fixture_outsider', null)$$, 'super-admin clears the prior membership before ownership transfer');
select lives_ok($$select public.set_restaurant_member('fixture_restaurant_b', 'fixture_outsider', 'owner')$$, 'super-admin can grant restaurant ownership');
select throws_ok($$select public.set_platform_role('fixture_super_admin', 'super_admin', false)$$, '22023', null, 'last super-admin cannot remove itself');

select set_config('request.jwt.claims', '{"role":"authenticated","platform_role":"admin","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}', true);
select lives_ok($$select public.transition_order('m3_admin_cancel', 'canceled', 'Synthetic support cancellation')$$, 'admin can cancel after courier pickup');
select throws_ok($$select public.set_platform_role('fixture_outsider', 'admin', false)$$, '42501', null, 'admin cannot manage platform roles');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select lives_ok($$select public.upsert_category('fixture_restaurant_a', 'm3_category', 'New Category')$$, 'manager can create category in own restaurant');
select lives_ok($$select public.set_category_active('m3_category', false)$$, 'category delete maps to deactivation');
select lives_ok($$select public.upsert_menu_item('fixture_restaurant_a', 'm3_menu', 'fixture_category_a', 'New Item', 1200)$$, 'manager can create menu item in own restaurant');
select lives_ok($$select public.set_menu_item_active('m3_menu', false)$$, 'menu delete maps to deactivation');
select throws_ok($$select public.upsert_category('fixture_restaurant_b', 'bad_category', 'Bad')$$, '42501', null, 'manager cannot mutate another restaurant catalog');

reset role;
select ok((select count(*) >= 12 from private.audit_log where created_at >= current_date), 'privileged operations append audit records');
select ok((select count(*) >= 4 from private.order_status_history where order_id in ('m3_flow_order','m3_claim_order')), 'workflow operations append status history');

select * from finish();
rollback;
