begin;

select plan(20);

select has_table('migration', 'catalog_restaurants_stage', 'restaurant staging table exists');
select has_table('migration', 'catalog_categories_stage', 'category staging table exists');
select has_table('migration', 'catalog_menu_items_stage', 'menu-item staging table exists');
select has_function('migration', 'promote_catalog_import', array['uuid'], 'catalog promotion function exists');

select ok(not has_table_privilege('anon', 'migration.catalog_restaurants_stage', 'select'), 'anon cannot read restaurant staging');
select ok(not has_table_privilege('authenticated', 'migration.catalog_categories_stage', 'select'), 'authenticated cannot read category staging');
select ok(not has_table_privilege('anon', 'migration.catalog_menu_items_stage', 'select'), 'anon cannot read menu staging');
select ok(not has_function_privilege('anon', 'migration.promote_catalog_import(uuid)', 'execute'), 'anon cannot execute promotion');
select ok(not has_function_privilege('authenticated', 'migration.promote_catalog_import(uuid)', 'execute'), 'authenticated cannot execute promotion');

insert into migration.import_runs (id, source_project, source_checksum)
values ('50000000-0000-5000-a000-000000000001', 'hungrieapp-a2288', repeat('5', 64));

insert into migration.catalog_restaurants_stage (
  run_id, id, name, description, cuisine, address, image_url, is_active,
  delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
  minimum_order_kurus, sort_order, document_checksum
) values (
  '50000000-0000-5000-a000-000000000001', 'm5_restaurant', 'Migration Restaurant',
  '', 'Test', 'Protected address', 'https://example.invalid/restaurant.png', true,
  20, 30, 100, 500, 0, repeat('a', 64)
);

insert into migration.catalog_categories_stage (
  run_id, id, restaurant_id, name, is_active, sort_order, document_checksum
) values (
  '50000000-0000-5000-a000-000000000001', 'm5_category', 'm5_restaurant',
  'Migration Category', true, 0, repeat('b', 64)
);

insert into migration.catalog_menu_items_stage (
  run_id, id, restaurant_id, category_id, name, image_url, price_kurus,
  is_active, sort_order, document_checksum
) values (
  '50000000-0000-5000-a000-000000000001', 'm5_item', 'm5_restaurant',
  'm5_category', 'Migration Item', 'https://example.invalid/item.png', 1250,
  true, 0, repeat('c', 64)
);

select lives_ok(
  $$select migration.promote_catalog_import('50000000-0000-5000-a000-000000000001')$$,
  'a valid complete catalog promotes atomically'
);
select is((select status::text from migration.import_runs where id = '50000000-0000-5000-a000-000000000001'), 'completed', 'run is completed');
select is((select count(*)::integer from public.restaurants where id = 'm5_restaurant' and is_active), 1, 'restaurant is promoted active');
select is((select count(*)::integer from public.categories where id = 'm5_category' and restaurant_id = 'm5_restaurant' and is_active), 1, 'category relationship is promoted');
select is((select count(*)::integer from public.menu_items where id = 'm5_item' and category_id = 'm5_category' and price_kurus = 1250 and is_active), 1, 'menu relationship and kurus are promoted');
select is((select count(*)::integer from public.restaurants where id like 'fixture_%' and is_active), 0, 'absent fixture restaurants are deactivated');
select is((select count(*)::integer from public.categories where id like 'fixture_%' and is_active), 0, 'absent fixture categories are deactivated');
select is((select count(*)::integer from public.menu_items where id like 'fixture_%' and is_active), 0, 'absent fixture menu items are deactivated');
select lives_ok(
  $$select migration.promote_catalog_import('50000000-0000-5000-a000-000000000001')$$,
  'replaying the same staged run is idempotent'
);
select is((select count(*)::integer from public.menu_items where id = 'm5_item'), 1, 'idempotent replay does not duplicate rows');

insert into migration.import_runs (id, source_project, source_checksum)
values ('50000000-0000-5000-a000-000000000002', 'hungrieapp-a2288', repeat('6', 64));
insert into migration.import_rejections (run_id, collection_path, document_id, reason_code)
values ('50000000-0000-5000-a000-000000000002', 'menus', 'bad-item', 'MONEY_NEGATIVE');
select throws_ok(
  $$select migration.promote_catalog_import('50000000-0000-5000-a000-000000000002')$$,
  'P0001',
  'Catalog promotion blocked by 1 rejected record(s)',
  'a rejected run cannot promote'
);

select * from finish();
rollback;
