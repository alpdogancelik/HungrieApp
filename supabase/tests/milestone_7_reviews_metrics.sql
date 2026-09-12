begin;

select plan(30);

select has_table('migration', 'product_reviews_stage', 'product review staging exists');
select has_table('migration', 'order_reviews_stage', 'order review staging exists');
select has_table('migration', 'review_quarantine', 'review quarantine exists');
select has_view('public', 'menu_item_review_metrics', 'menu metrics view exists');
select has_view('public', 'restaurant_product_review_metrics', 'restaurant product metrics view exists');
select has_view('public', 'restaurant_order_review_metrics', 'restaurant order metrics view exists');
select has_function('migration', 'revalidate_review_import', array['uuid'], 'quarantine revalidation exists');
select has_function('migration', 'promote_review_import', array['uuid'], 'review promotion exists');

select ok(not has_table_privilege('anon', 'migration.product_reviews_stage', 'select'), 'anon cannot read review staging');
select ok(not has_table_privilege('authenticated', 'migration.product_reviews_stage', 'select'), 'authenticated cannot read review staging');
select ok(not has_table_privilege('anon', 'migration.review_quarantine', 'select'), 'anon cannot read quarantine');
select ok(not has_table_privilege('authenticated', 'migration.review_quarantine', 'select'), 'authenticated cannot read quarantine');

select is((select rating_count from public.menu_items where id='fixture_menu_a'), 1, 'seed product metric count is database-owned');
select is((select rating_average from public.menu_items where id='fixture_menu_a'), 5.00::numeric, 'seed product metric average is database-owned');
select is((public.get_restaurant_product_review_summary('fixture_restaurant_a')->>'rating_count')::integer, 1, 'product summary RPC reports published count');
select is((public.get_restaurant_order_review_summary('fixture_restaurant_a')->>'review_count')::integer, 1, 'order summary RPC reports published count');

set local role anon;
select is((select count(*)::integer from public.published_product_reviews where restaurant_id='fixture_restaurant_a'), 1, 'anonymous sees published product reviews');
select throws_ok($$select * from migration.review_quarantine$$, '42501', null, 'anonymous query of quarantine is denied');
select is((public.get_menu_item_review_summary('fixture_menu_a')->>'rating_count')::integer, 1, 'anonymous can read curated metric RPC');
reset role;

create temporary table m7_audit_before(value bigint);
insert into m7_audit_before select count(*) from private.audit_log;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select lives_ok($$select public.moderate_review('product','fixture_product_review','hidden','Reviewed reply')$$, 'manager can hide and reply to own restaurant product review');
select is((public.get_menu_item_review_summary('fixture_menu_a')->>'rating_count')::integer, 0, 'hiding product review recomputes metrics');
select throws_ok($$select public.moderate_review('order','fixture_order_review','hidden','reply forbidden')$$, '22023', null, 'order reviews reject replies');
select lives_ok($$select public.moderate_review('product','fixture_product_review','published','Reviewed reply')$$, 'manager can restore product review');
select is((public.get_menu_item_review_summary('fixture_menu_a')->>'rating_count')::integer, 1, 'restoring product review recomputes metrics');
reset role;
select ok((select count(*) from private.audit_log) >= (select value+2 from m7_audit_before), 'review moderation writes transactional audits');

insert into migration.import_runs(id,source_project,source_checksum,status,counts)
values ('77777777-7777-7777-a777-777777777777','hungrieapp-a2288',repeat('7',64),'pending','{}');
insert into migration.product_reviews_stage(run_id,id,review_key,order_id,restaurant_id,menu_item_id,source_user_id,user_name_snapshot,menu_item_name_snapshot,rating,status,created_at,updated_at,document_checksum)
values ('77777777-7777-7777-a777-777777777777','m7_quarantined','m7_key','firebase_order_missing','fixture_restaurant_a','fixture_menu_a','fixture_firebase_customer','Fixture Customer','Fixture Meal',4,'published',statement_timestamp(),statement_timestamp(),repeat('a',64));
select is((migration.promote_review_import('77777777-7777-7777-a777-777777777777')->>'quarantined')::integer, 1, 'known unresolved review is quarantined without blocking run');
select is((select count(*)::integer from public.product_reviews where id='m7_quarantined'), 0, 'quarantined review is not promoted');
select ok(exists(select 1 from migration.review_quarantine where document_id='m7_quarantined' and reason_code='ORDER_NOT_IMPORTED'), 'quarantine records deterministic missing-order reason');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}', true);
select throws_ok($$select public.moderate_review('product','fixture_product_review','hidden')$$, '42501', null, 'unaffiliated customer cannot moderate review');
select throws_ok($$insert into public.product_reviews(id,review_key,order_id,restaurant_id,menu_item_id,profile_id,user_name_snapshot,menu_item_name_snapshot,rating,created_at,updated_at) values ('bad','bad','fixture_order','fixture_restaurant_a','fixture_menu_a','fixture_outsider','Bad','Bad',5,now(),now())$$, '42501', null, 'direct review writes remain denied');

select * from finish();
rollback;
