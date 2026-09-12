begin;

select plan(26);

select has_function('public', 'get_my_orders_page', array['text','integer'], 'customer order page RPC exists');
select has_function('public', 'get_restaurant_orders_page', array['text','order_status[]','text','integer'], 'restaurant order page RPC exists');
select has_function('public', 'get_admin_orders_page', array['text','order_status[]','text','integer'], 'admin order page RPC exists');
select has_function('public', 'get_authorized_order', array['text'], 'single authorized order RPC exists');
select has_function('public', 'get_my_active_order_summary', array[]::text[], 'active summary RPC exists');
select has_function('public', 'get_my_latest_order_summary', array[]::text[], 'latest summary RPC exists');
select has_function('public', 'get_featured_catalog_items', array['integer'], 'featured catalog RPC exists');
select has_function('public', 'search_active_catalog', array['text','text','integer','integer'], 'catalog search RPC exists');
select has_function('public', 'get_active_restaurant_bundle', array['text'], 'restaurant bundle RPC exists');
select is((select id from private.decode_order_cursor(private.encode_order_cursor('2026-01-01T00:00:00Z','order-id'))), 'order-id', 'opaque cursor preserves deterministic ID tie-breaker');
select is((select created_at from private.decode_order_cursor(private.encode_order_cursor('2026-01-01T00:00:00Z','order-id'))), '2026-01-01T00:00:00Z'::timestamptz, 'opaque cursor preserves timestamp');

set local role anon;
select is(jsonb_array_length(public.get_featured_catalog_items(6)), 2, 'anonymous featured query is server-limited and includes active restaurants');
select is(jsonb_array_length(public.search_active_catalog('Fixture', null, 0, 20)->'items'), 2, 'anonymous search covers every active restaurant');
select is(jsonb_array_length(public.search_active_catalog(null, 'Fixture Drinks', 0, 20)->'items'), 1, 'server-side category filtering works');
select is(jsonb_array_length(public.get_active_restaurant_bundle('fixture_restaurant_a')->'items'), 1, 'restaurant bundle embeds its menu');
select is(jsonb_array_length(public.get_active_restaurant_bundle('fixture_restaurant_a')->'categories'), 1, 'restaurant bundle embeds its categories');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select is(jsonb_array_length(public.get_my_orders_page(null,20)->'items'), 1, 'customer page contains own order');
select is(jsonb_array_length(public.get_my_orders_page(null,20)->'items'->0->'items'), 1, 'customer page embeds items without per-order requests');
select is(public.get_my_orders_page(null,20)->'items'->0->>'customer_email', 'customer@example.invalid', 'customer retains own contact snapshot');
select is(public.get_my_latest_order_summary()->>'id', 'fixture_order', 'latest summary returns only latest order');
select is(public.get_my_active_order_summary()::text, 'null', 'active summary returns null when no active order exists');
select is(public.get_authorized_order('fixture_order')->>'id', 'fixture_order', 'authorized detail returns order in one operation');
select throws_ok($$select public.get_my_orders_page('not-base64',20)$$, '22023', 'Invalid order cursor', 'malformed cursor is rejected');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select is(jsonb_array_length(public.get_restaurant_orders_page('fixture_restaurant_a',null,null,20)->'items'), 1, 'restaurant member reads its page');
select ok(not (public.get_restaurant_orders_page('fixture_restaurant_a',null,null,20)->'items'->0 ? 'customer_email'), 'terminal restaurant page masks customer contact');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select throws_ok($$select public.get_authorized_order('fixture_order')$$, '42501', null, 'other customer cannot read order detail');

select * from finish();
rollback;
