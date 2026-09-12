begin;

select plan(29);

select has_table('migration', 'orders_stage', 'order staging exists');
select has_table('migration', 'order_contacts_stage', 'protected contact staging exists');
select has_table('migration', 'order_items_stage', 'order item staging exists');
select has_table('migration', 'order_quarantine', 'order quarantine exists');
select has_table('private', 'order_import_metadata', 'protected import metadata exists');
select has_column('public', 'order_items', 'source_menu_item_id', 'legacy menu item identity is preserved');
select has_column('migration', 'order_quarantine', 'approved_exception', 'approved exception marker exists');
select has_function('migration', 'revalidate_order_import', array['uuid'], 'order revalidation function exists');
select has_function('migration', 'promote_order_import', array['uuid'], 'order promotion function exists');
select has_function('public', 'get_order_items', array['text'], 'authorized item snapshot interface exists');

select ok(not has_table_privilege('anon', 'migration.orders_stage', 'select'), 'anon cannot read order staging');
select ok(not has_table_privilege('authenticated', 'migration.orders_stage', 'select'), 'authenticated cannot read order staging');
select ok(not has_table_privilege('anon', 'migration.order_quarantine', 'select'), 'anon cannot read order quarantine');
select ok(not has_table_privilege('authenticated', 'private.order_import_metadata', 'select'), 'authenticated cannot read import metadata');

insert into migration.import_runs(id, source_project, source_checksum, status, counts)
values ('88888888-8888-8888-a888-888888888888', 'hungrieapp-a2288', repeat('8',64), 'pending', '{}');

insert into migration.orders_stage(
  run_id,id,source_user_id,restaurant_id,source_status,status,payment_method,notes,
  subtotal_kurus,delivery_fee_kurus,service_fee_kurus,discount_kurus,tip_kurus,total_kurus,
  delivered_at,history_at,created_at,updated_at,document_checksum
) values
  ('88888888-8888-8888-a888-888888888888','m8_valid','fixture_firebase_customer','fixture_restaurant_a','completed','delivered','pos','',
   2800,500,0,0,0,3300,'2026-09-01T11:00:00Z','2026-09-01T11:00:00Z','2026-09-01T10:00:00Z','2026-09-01T11:00:00Z',repeat('a',64)),
  ('88888888-8888-8888-a888-888888888888','m8_orphan','missing_firebase_profile','missing_restaurant','cancelled','canceled','cash','',
   1000,0,0,0,0,1000,null,'2026-09-01T10:30:00Z','2026-09-01T10:00:00Z','2026-09-01T10:30:00Z',repeat('b',64));

insert into migration.order_contacts_stage(run_id,order_id,customer_name,customer_email,delivery_address_snapshot)
values
  ('88888888-8888-8888-a888-888888888888','m8_valid','Fixture Customer','customer@example.invalid','{"label":"Fixture","line1":"Synthetic","city":"Fixture City","country":"Fixture Country"}'),
  ('88888888-8888-8888-a888-888888888888','m8_orphan','Unknown',null,'{"label":"Fixture","line1":"Synthetic","city":"Fixture City","country":"Fixture Country"}');

insert into migration.order_items_stage(
  run_id,id,order_id,source_ordinal,source_menu_item_id,name_snapshot,unit_price_kurus,
  customization_total_kurus,quantity,customizations_snapshot,created_at
) values
  ('88888888-8888-8888-a888-888888888888','m8_item','m8_valid',0,'legacy_missing_menu','Legacy Meal',2500,300,1,
   '[{"id":"extra","name":"Cheese","price_kurus":300}]','2026-09-01T10:00:00Z'),
  ('88888888-8888-8888-a888-888888888888','m8_orphan_item','m8_orphan',0,null,'Orphan Meal',1000,0,1,'[]','2026-09-01T10:00:00Z');

select is((migration.revalidate_order_import('88888888-8888-8888-a888-888888888888')->>'valid_orders')::integer, 1, 'one valid order reconciles');
select is((select count(distinct document_id)::integer from migration.order_quarantine where run_id='88888888-8888-8888-a888-888888888888'), 1, 'one distinct orphan order is quarantined');
select ok(exists(select 1 from migration.order_quarantine where document_id='m8_orphan' and reason_code='PROFILE_NOT_IMPORTED'), 'missing profile has deterministic reason');
select ok(exists(select 1 from migration.order_quarantine where document_id='m8_orphan' and reason_code='RESTAURANT_NOT_IMPORTED'), 'missing restaurant has deterministic reason');

insert into migration.order_quarantine(run_id,document_id,reason_code,approved_exception)
values ('88888888-8888-8888-a888-888888888888','m8_missing_address','DELIVERY_ADDRESS_SNAPSHOT_MISSING',true);
select is((migration.revalidate_order_import('88888888-8888-8888-a888-888888888888')->>'quarantined_orders')::integer, 2, 'approved missing-address quarantine survives relationship revalidation');

select is((migration.promote_order_import('88888888-8888-8888-a888-888888888888')->>'orders_promoted')::integer, 1, 'valid historical order is promoted');
select is((select count(*)::integer from private.order_contacts where order_id='m8_valid'), 1, 'contact snapshot is promoted privately');
select is((select count(*)::integer from public.order_items where order_id='m8_valid' and menu_item_id is null and source_menu_item_id='legacy_missing_menu'), 1, 'missing catalog item stays nullable with source identity');
select is((select count(*)::integer from private.order_status_history where order_id='m8_valid' and source='firebase_import'), 1, 'only observed imported status is recorded');
select is((select count(*)::integer from private.audit_log where target_id='m8_valid' and action='order.imported'), 1, 'promotion writes a sanitized audit');
select is((migration.promote_order_import('88888888-8888-8888-a888-888888888888')->>'orders_promoted')::integer, 0, 'same run is idempotent');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);
select is(jsonb_array_length(public.get_order_items('m8_valid')), 1, 'customer can read immutable order item snapshots');
select is(public.get_order_items('m8_valid')->0->>'menu_item_id', 'legacy_missing_menu', 'item interface falls back to preserved legacy identity');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select throws_ok($$select public.get_order_items('m8_valid')$$, '42501', null, 'another customer cannot read order items');
select throws_ok($$select * from migration.order_quarantine$$, '42501', null, 'authenticated client cannot query quarantine');

select * from finish();
rollback;
