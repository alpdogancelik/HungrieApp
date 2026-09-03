-- Synthetic local-only fixtures. These values do not represent Firebase users,
-- addresses, orders, notification tokens, or production activity.

insert into public.profiles (
  id, firebase_uid, name, email, preferred_language, created_at, updated_at
) values
  ('fixture_customer', 'fixture_firebase_customer', 'Fixture Customer', 'customer@example.invalid', 'en', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_owner', 'fixture_firebase_owner', 'Fixture Owner', 'owner@example.invalid', 'tr', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_manager', 'fixture_firebase_manager', 'Fixture Manager', 'manager@example.invalid', 'tr', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_outsider', 'fixture_firebase_outsider', 'Fixture Outsider', 'outsider@example.invalid', 'en', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_courier', 'fixture_firebase_courier', 'Fixture Courier', 'courier@example.invalid', 'tr', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_unscoped_courier', 'fixture_firebase_unscoped_courier', 'Fixture Unscoped Courier', 'courier2@example.invalid', 'tr', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_admin', 'fixture_firebase_admin', 'Fixture Admin', 'admin@example.invalid', 'en', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_super_admin', 'fixture_firebase_super_admin', 'Fixture Super Admin', 'superadmin@example.invalid', 'en', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.restaurants (
  id, name, description, cuisine, address, is_active,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  delivery_fee_kurus, minimum_order_kurus, opening_hours,
  created_at, updated_at
) values
  (
    'fixture_restaurant_a', 'Fixture Kitchen A', 'Synthetic restaurant fixture', 'Fixture cuisine',
    'Synthetic address A', true, 20, 35, 500, 1000,
    '{"monday":{"open":"09:00","close":"22:00"}}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'fixture_restaurant_b', 'Fixture Kitchen B', 'Synthetic isolation fixture', 'Fixture cuisine',
    'Synthetic address B', true, 25, 45, 0, 0, '{}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  );

insert into public.categories (
  id, restaurant_id, name, is_active, sort_order, created_at, updated_at
) values
  ('fixture_category_a', 'fixture_restaurant_a', 'Fixture Meals', true, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('fixture_category_b', 'fixture_restaurant_b', 'Fixture Drinks', true, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.menu_items (
  id, restaurant_id, category_id, name, description, price_kurus,
  is_active, sort_order, customizations, created_at, updated_at
) values
  (
    'fixture_menu_a', 'fixture_restaurant_a', 'fixture_category_a', 'Fixture Meal',
    'Synthetic menu item', 2500, true, 0, '[]'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'fixture_menu_b', 'fixture_restaurant_b', 'fixture_category_b', 'Fixture Drink',
    'Synthetic isolation item', 700, true, 0, '[]'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  );

insert into private.restaurant_members (
  restaurant_id, profile_id, role, created_at, updated_at
) values
(
  'fixture_restaurant_a', 'fixture_owner', 'owner',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
),
(
  'fixture_restaurant_a', 'fixture_manager', 'manager',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);

insert into private.user_roles (profile_id, role, created_at)
values
  ('fixture_courier', 'courier', '2026-01-01T00:00:00Z'),
  ('fixture_unscoped_courier', 'courier', '2026-01-01T00:00:00Z'),
  ('fixture_admin', 'admin', '2026-01-01T00:00:00Z'),
  ('fixture_super_admin', 'super_admin', '2026-01-01T00:00:00Z');

insert into private.restaurant_couriers (restaurant_id, profile_id, created_at)
values ('fixture_restaurant_a', 'fixture_courier', '2026-01-01T00:00:00Z');

insert into public.addresses (
  id, profile_id, label, line1, city, country, is_default, created_at, updated_at
) values (
  'fixture_address', 'fixture_customer', 'Fixture address', 'Synthetic line 1',
  'Fixture City', 'Fixture Country', true,
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);

insert into public.favorites (profile_id, restaurant_id, created_at)
values ('fixture_customer', 'fixture_restaurant_a', '2026-01-01T00:00:00Z');

insert into public.orders (
  id, profile_id, restaurant_id, courier_profile_id, status, payment_method,
  subtotal_kurus, delivery_fee_kurus, service_fee_kurus,
  discount_kurus, tip_kurus, total_kurus, eta_minutes,
  preparing_at, ready_at, out_for_delivery_at, delivered_at,
  created_at, updated_at
) values (
  'fixture_order', 'fixture_customer', 'fixture_restaurant_a', 'fixture_courier',
  'delivered', 'pos',
  2500, 500, 100, 0, 0, 3100, 30,
  '2026-01-01T00:05:00Z', '2026-01-01T00:15:00Z',
  '2026-01-01T00:20:00Z', '2026-01-01T00:30:00Z',
  '2026-01-01T00:00:00Z', '2026-01-01T00:30:00Z'
);

insert into private.order_contacts (
  order_id, customer_name, customer_email, customer_whatsapp,
  delivery_address_snapshot, created_at, updated_at
) values (
  'fixture_order', 'Fixture Customer', 'customer@example.invalid', null,
  '{"label":"Fixture address","line1":"Synthetic line 1","city":"Fixture City","country":"Fixture Country"}'::jsonb,
  '2026-01-01T00:00:00Z', '2026-01-01T00:30:00Z'
);

insert into public.order_items (
  id, order_id, menu_item_id, name_snapshot, unit_price_kurus,
  customization_total_kurus, quantity, customizations_snapshot, created_at
) values (
  'fixture_order_item', 'fixture_order', 'fixture_menu_a', 'Fixture Meal',
  2500, 0, 1, '[]'::jsonb, '2026-01-01T00:00:00Z'
);

insert into private.order_status_history (
  order_id, previous_status, new_status, changed_by_profile_id, source, created_at
) values
  ('fixture_order', null, 'pending', 'fixture_customer', 'fixture', '2026-01-01T00:00:00Z'),
  ('fixture_order', 'pending', 'preparing', 'fixture_owner', 'fixture', '2026-01-01T00:05:00Z'),
  ('fixture_order', 'preparing', 'ready', 'fixture_owner', 'fixture', '2026-01-01T00:15:00Z'),
  ('fixture_order', 'ready', 'out_for_delivery', 'fixture_courier', 'fixture', '2026-01-01T00:20:00Z'),
  ('fixture_order', 'out_for_delivery', 'delivered', 'fixture_courier', 'fixture', '2026-01-01T00:30:00Z');

insert into public.product_reviews (
  id, review_key, order_id, restaurant_id, menu_item_id, profile_id,
  user_name_snapshot, menu_item_name_snapshot, rating, comment, status,
  created_at, updated_at
) values (
  'fixture_product_review', 'fixture_order_fixture_menu_a', 'fixture_order',
  'fixture_restaurant_a', 'fixture_menu_a', 'fixture_customer',
  'Fixture Customer', 'Fixture Meal', 5, 'Synthetic review', 'published',
  '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'
);

insert into public.order_reviews (
  id, review_key, order_id, restaurant_id, profile_id,
  user_name_snapshot, restaurant_name_snapshot,
  speed_rating, taste_rating, value_rating, comment, items_snapshot, status,
  created_at, updated_at
) values (
  'fixture_order_review', 'fixture_order_overall', 'fixture_order',
  'fixture_restaurant_a', 'fixture_customer', 'Fixture Customer', 'Fixture Kitchen A',
  5, 4, 5, 'Synthetic overall review',
  '[{"menuItemId":"fixture_menu_a","name":"Fixture Meal","quantity":1,"priceKurus":2500}]'::jsonb,
  'published', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'
);

insert into private.audit_log (
  actor_profile_id, action, target_type, target_id, metadata, created_at
) values (
  'fixture_owner', 'fixture.order_reviewed', 'order', 'fixture_order',
  '{"synthetic":true}'::jsonb, '2026-01-02T00:00:00Z'
);
