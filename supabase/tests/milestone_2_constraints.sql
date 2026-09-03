begin;

select plan(36);

select throws_ok(
  $$insert into public.categories (id, restaurant_id, name) values ('test_orphan_category', 'missing_restaurant', 'Invalid')$$,
  '23503', null, 'category rejects an unknown restaurant'
);
select throws_ok(
  $$insert into public.addresses (id, profile_id, label, line1, city, country) values ('test_orphan_address', 'missing_profile', 'Invalid', 'Line', 'City', 'Country')$$,
  '23503', null, 'address rejects an unknown profile'
);
select throws_ok(
  $$insert into public.favorites (profile_id, restaurant_id) values ('missing_profile', 'fixture_restaurant_a')$$,
  '23503', null, 'favorite rejects an unknown profile'
);
select throws_ok(
  $$update public.orders set profile_id = 'missing_profile' where id = 'fixture_order'$$,
  '23503', null, 'order rejects an unknown profile'
);
select throws_ok(
  $$insert into private.restaurant_members (restaurant_id, profile_id, role) values ('fixture_restaurant_a', 'missing_profile', 'manager')$$,
  '23503', null, 'restaurant membership rejects an unknown profile'
);
select throws_ok(
  $$update public.menu_items set category_id = 'fixture_category_b' where id = 'fixture_menu_a'$$,
  '23503', null, 'menu item rejects a category from another restaurant'
);
select throws_ok(
  $$update public.product_reviews set restaurant_id = 'fixture_restaurant_b' where id = 'fixture_product_review'$$,
  '23503', null, 'product review rejects mismatched order and catalog relationships'
);

select throws_ok(
  $$update public.orders set status = 'accepted' where id = 'fixture_order'$$,
  '22P02', null, 'legacy order statuses are not accepted by the canonical enum'
);
select throws_ok(
  $$insert into private.user_roles (profile_id, role) values ('fixture_customer', 'owner')$$,
  '22P02', null, 'restaurant roles cannot be used as platform roles'
);
select throws_ok(
  $$update public.orders set payment_method = 'card' where id = 'fixture_order'$$,
  '22P02', null, 'unsupported payment methods are rejected'
);

select throws_ok(
  $$update public.menu_items set price_kurus = -1 where id = 'fixture_menu_a'$$,
  '23514', null, 'negative menu prices are rejected'
);
select throws_ok(
  $$update public.orders set total_kurus = total_kurus + 1 where id = 'fixture_order'$$,
  '23514', null, 'incorrect order financial equations are rejected'
);
select throws_ok(
  $$update public.order_items set quantity = 0 where id = 'fixture_order_item'$$,
  '23514', null, 'non-positive order quantities are rejected'
);
select throws_ok(
  $$update public.product_reviews set rating = 6 where id = 'fixture_product_review'$$,
  '23514', null, 'product ratings outside one through five are rejected'
);
select throws_ok(
  $$update public.order_reviews set speed_rating = 0 where id = 'fixture_order_review'$$,
  '23514', null, 'order review ratings outside one through five are rejected'
);

select lives_ok(
  $$insert into public.orders (id, profile_id, restaurant_id, status, payment_method, subtotal_kurus, total_kurus) values ('test_pending_order', 'fixture_customer', 'fixture_restaurant_a', 'pending', 'cash', 100, 100)$$,
  'a pending order can be staged inside the rolled-back test'
);
select throws_ok(
  $$insert into public.product_reviews (id, review_key, order_id, restaurant_id, menu_item_id, profile_id, user_name_snapshot, menu_item_name_snapshot, rating) values ('test_pending_product_review', 'test_pending_product_key', 'test_pending_order', 'fixture_restaurant_a', 'fixture_menu_a', 'fixture_customer', 'Fixture Customer', 'Fixture Meal', 4)$$,
  '23514', null, 'product reviews reject non-delivered orders'
);
select throws_ok(
  $$insert into public.order_reviews (id, review_key, order_id, restaurant_id, profile_id, user_name_snapshot, restaurant_name_snapshot, speed_rating, taste_rating, value_rating) values ('test_pending_order_review', 'test_pending_order_key', 'test_pending_order', 'fixture_restaurant_a', 'fixture_customer', 'Fixture Customer', 'Fixture Kitchen A', 4, 4, 4)$$,
  '23514', null, 'order reviews reject non-delivered orders'
);

select throws_ok(
  $$insert into public.addresses (id, profile_id, label, line1, city, country, is_default) values ('test_second_default', 'fixture_customer', 'Second', 'Line', 'City', 'Country', true)$$,
  '23505', null, 'a profile cannot have two default addresses'
);
select throws_ok(
  $$insert into public.favorites (profile_id, restaurant_id) values ('fixture_customer', 'fixture_restaurant_a')$$,
  '23505', null, 'duplicate favorites are rejected'
);
select throws_ok(
  $$insert into private.restaurant_members (restaurant_id, profile_id, role) values ('fixture_restaurant_a', 'fixture_owner', 'manager')$$,
  '23505', null, 'duplicate restaurant memberships are rejected'
);
select throws_ok(
  $$insert into public.product_reviews (id, review_key, order_id, restaurant_id, menu_item_id, profile_id, user_name_snapshot, menu_item_name_snapshot, rating) values ('test_duplicate_product_review', 'test_distinct_review_key', 'fixture_order', 'fixture_restaurant_a', 'fixture_menu_a', 'fixture_customer', 'Fixture Customer', 'Fixture Meal', 4)$$,
  '23505', null, 'duplicate logical product reviews are rejected'
);
select throws_ok(
  $$insert into public.profiles (id, firebase_uid, name, email) values ('test_duplicate_firebase', 'fixture_firebase_customer', 'Duplicate', 'duplicate@example.invalid')$$,
  '23505', null, 'Firebase UID mappings are unique'
);

select throws_ok(
  $$update private.order_contacts set delivery_address_snapshot = '[]'::jsonb where order_id = 'fixture_order'$$,
  '23514', null, 'delivery address snapshots must be JSON objects'
);
select throws_ok(
  $$insert into private.order_status_history (order_id, previous_status, new_status) values ('fixture_order', 'ready', 'ready')$$,
  '23514', null, 'status history rejects no-op transitions'
);
select throws_ok(
  $$insert into private.push_tokens (id, profile_id, restaurant_id, token, token_hash, platform, provider) values ('test_two_owners', 'fixture_customer', 'fixture_restaurant_a', 'synthetic', repeat('a', 64), 'ios', 'apns')$$,
  '23514', null, 'push tokens reject two owners'
);
select throws_ok(
  $$insert into private.push_tokens (id, token, token_hash, platform, provider) values ('test_no_owner', 'synthetic', repeat('b', 64), 'ios', 'apns')$$,
  '23514', null, 'push tokens require one owner'
);
select lives_ok(
  $$insert into private.push_tokens (id, profile_id, token, token_hash, platform, provider) values ('test_token', 'fixture_customer', 'non-usable-synthetic-token', repeat('c', 64), 'ios', 'apns')$$,
  'a protected synthetic push token can be staged inside the rolled-back test'
);
select throws_ok(
  $$insert into private.push_tokens (id, restaurant_id, token, token_hash, platform, provider) values ('test_duplicate_token', 'fixture_restaurant_a', 'another-synthetic-token', repeat('c', 64), 'ios', 'apns')$$,
  '23505', null, 'push token hashes are globally unique'
);

select throws_ok(
  $$delete from public.orders where id = 'fixture_order'$$,
  '23503', null, 'retained order children prevent order deletion'
);
select throws_ok(
  $$delete from public.restaurants where id = 'fixture_restaurant_a'$$,
  '23503', null, 'retained relationships prevent restaurant deletion'
);

select lives_ok(
  $$update public.profiles set name = 'Updated Fixture Customer' where id = 'fixture_customer'$$,
  'profile updates execute through the timestamp trigger'
);
select ok(
  (select updated_at > '2026-01-01T00:00:00Z'::timestamptz from public.profiles where id = 'fixture_customer'),
  'the shared trigger advances updated_at'
);

select lives_ok(
  $$insert into migration.import_runs (id, source_project, source_checksum) values ('00000000-0000-0000-0000-000000000001', 'synthetic-project', repeat('d', 64))$$,
  'a valid synthetic import run can be staged inside the rolled-back test'
);
select throws_ok(
  $$insert into migration.import_runs (source_project, source_checksum) values ('synthetic-project', 'not-a-checksum')$$,
  '23514', null, 'import runs require a SHA-256 source checksum'
);
select throws_ok(
  $$insert into migration.firestore_documents (run_id, collection_path, document_id, payload, document_checksum) values ('00000000-0000-0000-0000-000000000001', 'users', 'fixture', '[]'::jsonb, repeat('e', 64))$$,
  '23514', null, 'raw Firestore staging payloads must be JSON objects'
);

select * from finish();
rollback;
