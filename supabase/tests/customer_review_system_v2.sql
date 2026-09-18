begin;
select no_plan();

-- Contract/catalog and legacy reconciliation.
select is((select contract_version from public.order_reviews where id='fixture_order_review'),1::smallint,
  'legacy rows are backfilled as contract v1');
select is((select average_rating from public.order_reviews where id='fixture_order_review'),4.67::numeric,
  'legacy generated three-score average is unchanged');
select ok((select value_rating is not null and user_name_snapshot is not null
  from public.order_reviews where id='fixture_order_review'),'legacy Value and Customer snapshot remain intact');
select col_is_null('public','order_reviews','value_rating','Value is nullable at catalog level for v2');
select col_is_null('public','order_reviews','user_name_snapshot','Customer snapshot is nullable at catalog level for v2');
select ok(exists(select 1 from pg_constraint where conrelid='public.order_reviews'::regclass
  and conname='order_reviews_contract_version_fields_check' and contype='c'),
  'v1/v2 field shape has a database check');
select has_index('public','order_reviews','order_reviews_restaurant_status_created_id_idx','Restaurant status keyset index exists');
select has_index('public','order_reviews','order_reviews_published_feed_idx','published feed partial index exists');
select has_index('private','order_review_reports','order_review_reports_restaurant_status_created_id_idx','Restaurant report queue index exists');
select has_index('private','order_review_meal_reactions','order_review_reactions_restaurant_item_reaction_idx','reaction aggregate index exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname='order_review_meal_reactions'),'reaction relation has forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname='customer_review_operations'),'submission operation relation has forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname='order_review_reports'),'report relation has forced RLS');
select ok(not has_table_privilege('authenticated','private.order_review_meal_reactions','select'),'clients cannot select raw reactions');
select ok(not has_table_privilege('authenticated','private.order_review_reports','select'),'clients cannot select report notes');
select ok(not has_table_privilege('authenticated','public.order_reviews','insert'),'clients cannot insert reviews directly');
select ok(has_function_privilege('anon','public.get_restaurant_review_summary_v2(text)','execute'),'anonymous summary is callable');
select ok(has_function_privilege('anon','public.list_published_restaurant_reviews_v2(text,text,integer)','execute'),'anonymous feed is callable');
select ok(not has_function_privilege('anon','public.submit_my_customer_order_review_v2(text,smallint,smallint,text,jsonb,uuid)','execute'),'anonymous submission is denied');
select ok(has_function_privilege('authenticated','public.submit_my_customer_order_review_v2(text,smallint,smallint,text,jsonb,uuid)','execute'),'authenticated can reach guarded submission');
select is(enum_range(null::public.review_report_reason)::text,
  '{spam,abusive_content,personal_information,not_related_to_order,suspected_fraud,other}',
  'report reasons are exactly the six approved values');
select is(enum_range(null::public.review_report_status)::text,'{open,resolved,dismissed}',
  'report statuses are exactly open, resolved, and dismissed');

-- Local actors and orders.
insert into private.account_access(profile_id,account_type,status,activated_at) values
  ('fixture_customer','customer','active',transaction_timestamp()),
  ('fixture_outsider','customer','active',transaction_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at,onboarding_step,
  restaurant_id,restaurant_role) values
  ('fixture_owner','restaurant','active',transaction_timestamp(),'none','fixture_restaurant_a','owner');
insert into private.account_access(profile_id,account_type,status,activated_at,onboarding_step,
  admin_role,admin_mfa_enrolled_at) values
  ('fixture_admin','admin','active',transaction_timestamp(),'none','admin',transaction_timestamp());

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,created_at) values
  ('v2_order_main','fixture_customer','fixture_restaurant_a','delivered','cash',2500,2500,transaction_timestamp()-interval '1 day',transaction_timestamp()-interval '2 days'),
  ('v2_order_expired','fixture_customer','fixture_restaurant_a','delivered','cash',2500,2500,transaction_timestamp()-interval '30 days',transaction_timestamp()-interval '31 days'),
  ('v2_order_pending','fixture_customer','fixture_restaurant_a','pending','cash',2500,2500,null,transaction_timestamp()),
  ('v2_order_preparing','fixture_customer','fixture_restaurant_a','preparing','cash',2500,2500,null,transaction_timestamp()),
  ('v2_order_ready','fixture_customer','fixture_restaurant_a','ready','cash',2500,2500,null,transaction_timestamp()),
  ('v2_order_delivery','fixture_customer','fixture_restaurant_a','out_for_delivery','cash',2500,2500,null,transaction_timestamp()),
  ('v2_order_canceled','fixture_customer','fixture_restaurant_a','canceled','cash',2500,2500,null,transaction_timestamp()),
  ('v2_order_other','fixture_outsider','fixture_restaurant_a','delivered','cash',2500,2500,transaction_timestamp()-interval '1 day',transaction_timestamp()),
  ('v2_order_hundred','fixture_customer','fixture_restaurant_a','delivered','cash',2500,2500,transaction_timestamp()-interval '1 hour',transaction_timestamp());

insert into public.order_items(id,order_id,menu_item_id,source_menu_item_id,name_snapshot,unit_price_kurus,quantity,customizations_snapshot,created_at) values
  ('v2_main_1','v2_order_main','fixture_menu_a','fixture_menu_a','Server Meal',2500,1,'[]',transaction_timestamp()-interval '2 seconds'),
  ('v2_main_2','v2_order_main','fixture_menu_a','fixture_menu_a','Server Meal',2500,2,'[{"configured":"different"}]',transaction_timestamp()-interval '1 second');
insert into public.order_items(id,order_id,menu_item_id,source_menu_item_id,name_snapshot,unit_price_kurus,quantity)
select 'v2_item_'||o.id,o.id,'fixture_menu_a','fixture_menu_a','Server Meal',2500,1 from public.orders o
where o.id in ('v2_order_expired','v2_order_pending','v2_order_preparing','v2_order_ready',
  'v2_order_delivery','v2_order_canceled','v2_order_other');
insert into public.order_items(id,order_id,menu_item_id,source_menu_item_id,name_snapshot,unit_price_kurus,quantity)
select 'v2_hundred_'||lpad(g::text,3,'0'),'v2_order_hundred',null,'base_'||lpad(g::text,3,'0'),
  'Server Item '||g,25,1 from generate_series(1,100) g;

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_customer')::text,true);

update private.account_access set status='suspended',suspended_at=transaction_timestamp()
  where profile_id='fixture_customer';
select throws_ok($$select public.get_my_customer_review_prompt_v2()$$,'42501',null,'suspended Customer is denied');
update private.account_access set status='active',suspended_at=null where profile_id='fixture_customer';
insert into private.account_access(profile_id,account_type,status,revoked_at)
  values('fixture_courier','customer','revoked',transaction_timestamp());
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_courier')::text,true);
select throws_ok($$select public.get_my_customer_review_prompt_v2()$$,'42501',null,'revoked Customer is denied');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_super_admin')::text,true);
select throws_ok($$select public.get_my_customer_review_prompt_v2()$$,'42501',null,'unmapped identity is denied');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_customer')::text,true);

select is((public.get_my_customer_review_prompt_v2()->>'orderId'),'v2_order_hundred',
  'prompt selects at most the newest eligible unreviewed delivered order');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_pending',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000001')$$,'42501',null,'pending order cannot be reviewed');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_preparing',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000002')$$,'42501',null,'preparing order cannot be reviewed');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_ready',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000003')$$,'42501',null,'ready order cannot be reviewed');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_delivery',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000004')$$,'42501',null,'out-for-delivery order cannot be reviewed');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_canceled',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000005')$$,'42501',null,'canceled order cannot be reviewed');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_expired',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000006')$$,'22023',null,'exact 30-day UTC boundary is ineligible');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_other',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000007')$$,'42501',null,'cross-Customer order submission is denied');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_main',0::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000008')$$,'22023',null,'Taste below range is rejected');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_main',4::smallint,6::smallint,'','[]','11000000-0000-4000-8000-000000000009')$$,'22023',null,'Speed above range is rejected');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_main',4::smallint,4::smallint,repeat('x',501),'[]','11000000-0000-4000-8000-000000000010')$$,'22023',null,'501-character comment is rejected');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_main',4::smallint,4::smallint,'bad'||chr(1),'[]','11000000-0000-4000-8000-000000000011')$$,'22023',null,'forbidden comment control character is rejected');
select lives_ok($$select public.submit_my_customer_order_review_v2('v2_order_main',4::smallint,5::smallint,U&'  cafe\0301'||E'\tline\n  ','[{"reaction":"liked","menuItemId":"fixture_menu_a"}]','11000000-0000-4000-8000-000000000012')$$,'valid v2 review accepts tab/newline and reaction');
select is((select comment from public.order_reviews where order_id='v2_order_main'),'café'||E'\tline\n','comment is trimmed and NFC-normalized without collapsing internal whitespace');
select is((select contract_version from public.order_reviews where order_id='v2_order_main'),2::smallint,'new review is contract v2');
select ok((select value_rating is null and price_performance_rating is null and user_name_snapshot is null
  and average_rating is null from public.order_reviews where order_id='v2_order_main'),'v2 does not fabricate legacy Value/F/P/name or average');
select is((select items_snapshot->0->>'quantity' from public.order_reviews where order_id='v2_order_main'),'3','configured lines are grouped by base menu item');
select is((select items_snapshot->0->>'name' from public.order_reviews where order_id='v2_order_main'),'Server Meal','item name comes from server order items');
select is((public.get_restaurant_review_summary_v2('fixture_restaurant_a')->>'overallRating')::numeric,4.50::numeric,'summary uses Taste/Speed formula');
select is((public.get_restaurant_review_summary_v2('fixture_restaurant_a')->>'reviewCount')::integer,2,'summary counts published order reviews once each');
select is((select count(*)::integer from private.order_review_meal_reactions where order_id='v2_order_main'),1,'one reaction is stored');
select is((select metadata ? 'comment' or metadata ? 'internal_note' from private.audit_log where action='order_review.submitted_v2' order by created_at desc limit 1),false,'submission audit excludes review text and notes');

select is((public.submit_my_customer_order_review_v2('v2_order_main',4::smallint,5::smallint,'café'||E'\tline\n',
  '[{"menuItemId":"fixture_menu_a","reaction":"liked"}]','11000000-0000-4000-8000-000000000012')->>'replayed')::boolean,true,
  'canonical exact replay succeeds');
select is((select count(*)::integer from public.order_reviews where order_id='v2_order_main'),1,'replay creates no duplicate review');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_main',4::smallint,5::smallint,'changed','[{"menuItemId":"fixture_menu_a","reaction":"liked"}]','11000000-0000-4000-8000-000000000012')$$,'22023',null,'changed operation reuse is rejected');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,5::smallint,'','[{"menuItemId":"base_001","reaction":"liked"},{"menuItemId":"base_001","reaction":"disliked"}]','11000000-0000-4000-8000-000000000013')$$,'22023',null,'duplicate reaction IDs are rejected');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,5::smallint,'','[{"menuItemId":"not_ordered","reaction":"liked"}]','11000000-0000-4000-8000-000000000014')$$,'22023',null,'reaction membership is enforced');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,5::smallint,'','[{"menuItemId":"base_001","reaction":"love"}]','11000000-0000-4000-8000-000000000015')$$,'22023',null,'reaction enum is enforced');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,5::smallint,'','[{"menuItemId":"base_001","reaction":"liked","label":"client"}]','11000000-0000-4000-8000-000000000016')$$,'22023',null,'reaction object exact keys are enforced');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,5::smallint,'','["not-an-object"]','11000000-0000-4000-8000-000000000020')$$,'22023',null,'non-object reaction entries are rejected safely');
select lives_ok($$select public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,4::smallint,'',(select jsonb_agg(jsonb_build_object('menuItemId','base_'||lpad(g::text,3,'0'),'reaction',case when g%2=0 then 'liked' else 'disliked' end) order by g desc) from generate_series(1,100)g),'11000000-0000-4000-8000-000000000017')$$,'100 distinct reactions are accepted');
select is((select count(*)::integer from private.order_review_meal_reactions where order_id='v2_order_hundred'),100,'all 100 reactions are stored once');
select is((public.submit_my_customer_order_review_v2('v2_order_hundred',4::smallint,4::smallint,'',
  (select jsonb_agg(jsonb_build_object('reaction',case when g%2=0 then 'liked' else 'disliked' end,
    'menuItemId','base_'||lpad(g::text,3,'0')) order by g) from generate_series(1,100)g),
  '11000000-0000-4000-8000-000000000017')->>'replayed')::boolean,true,
  'reaction ordering and object key ordering do not change the canonical replay hash');
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_other',4::smallint,4::smallint,'',(select jsonb_agg(jsonb_build_object('menuItemId','x'||g,'reaction','liked')) from generate_series(1,101)g),'11000000-0000-4000-8000-000000000018')$$,'22023',null,'101 reactions are rejected before ownership/membership');

-- Anonymous projection privacy and keyset tie-breaking.
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at) values
  ('v2_feed_a','fixture_outsider','fixture_restaurant_a','delivered','cash',10,10,transaction_timestamp()-interval '1 day'),
  ('v2_feed_b','fixture_outsider','fixture_restaurant_a','delivered','cash',10,10,transaction_timestamp()-interval '1 day');
insert into public.order_reviews(id,review_key,order_id,restaurant_id,profile_id,user_name_snapshot,
  restaurant_name_snapshot,speed_rating,taste_rating,value_rating,comment,items_snapshot,status,created_at,contract_version)
values('v2_feed_a','v2_feed_a','v2_feed_a','fixture_restaurant_a','fixture_outsider',null,'Fixture Kitchen A',3,4,null,'A','[]','published','2026-09-17T12:00:00Z',2),
  ('v2_feed_b','v2_feed_b','v2_feed_b','fixture_restaurant_a','fixture_outsider',null,'Fixture Kitchen A',3,4,null,'B','[]','published','2026-09-17T12:00:00Z',2);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select ok((public.list_published_restaurant_reviews_v2('fixture_restaurant_a',null,1)->>'nextCursor') is not null,'public first page returns opaque continuation');
select isnt((public.list_published_restaurant_reviews_v2('fixture_restaurant_a',
  public.list_published_restaurant_reviews_v2('fixture_restaurant_a',null,1)->>'nextCursor',1)->'items'->0->>'reviewId'),
  (public.list_published_restaurant_reviews_v2('fixture_restaurant_a',null,1)->'items'->0->>'reviewId'),'equal timestamps paginate by ID without duplication');
select ok(not ((public.list_published_restaurant_reviews_v2('fixture_restaurant_a',null,10)->'items'->0)
  ?| array['profile_id','profileId','order_id','orderId','user_name_snapshot','userName','reactions','operationId']),
  'public review card has no identity, order, reaction, or operation fields');
select ok(not ((public.list_published_restaurant_reviews_v2('fixture_restaurant_a',null,50)->'items')::text like '%priceKurus%'),
  'public feed sanitizes legacy item prices');
select is((public.list_published_restaurant_reviews_v2('fixture_restaurant_a',null,500)->>'limit')::integer,50,'public page limit is capped at 50');

-- Wrong-role denial, Restaurant report-only contract, and aggregate privacy.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_owner')::text,true);
select throws_ok($$select public.submit_my_customer_order_review_v2('v2_order_other',4::smallint,4::smallint,'','[]','11000000-0000-4000-8000-000000000019')$$,'42501',null,'Restaurant identity cannot submit Customer review');
select is((public.restaurant_report_order_review_v2((select id from public.order_reviews where order_id='v2_order_main'),
  'spam',E'  internal only  ','12000000-0000-4000-8000-000000000001')->>'status'),'open','Restaurant reports its scoped review');
select is((public.restaurant_report_order_review_v2((select id from public.order_reviews where order_id='v2_order_main'),
  'spam','internal only','12000000-0000-4000-8000-000000000001')->>'replayed')::boolean,true,'exact report replay succeeds');
select throws_ok($$select public.restaurant_report_order_review_v2('missing','spam',null,'12000000-0000-4000-8000-000000000002')$$,'42501',null,'Restaurant cannot report outside its scope');
select throws_ok($$select public.restaurant_report_order_review_v2('v2_feed_a','other',repeat('n',501),'12000000-0000-4000-8000-000000000004')$$,'22023',null,'Restaurant report note is capped at 500 characters');
select lives_ok($$select public.restaurant_report_order_review_v2('v2_feed_a','other',repeat('n',500),'12000000-0000-4000-8000-000000000005')$$,'Restaurant report accepts a 500-character note');
select is((public.restaurant_report_order_review_v2('fixture_order_review','other','legacy contract evidence',
  '12000000-0000-4000-8000-000000000006')->>'status'),'open','Restaurant can report a preserved contract-v1 review');
select is((public.restaurant_report_order_review_v2((select id from public.order_reviews where order_id='v2_order_hundred'),
  'suspected_fraud','aggregate moderation evidence','12000000-0000-4000-8000-000000000007')->>'status'),'open',
  'Restaurant can report a scoped v2 review used for aggregate moderation evidence');
select throws_ok($$select public.restaurant_moderate_review_v1('order',(select id from public.order_reviews where order_id='v2_order_main'),'hidden',null,'12000000-0000-4000-8000-000000000003')$$,'42501',null,'legacy Restaurant moderation cannot change v2 visibility');
select throws_ok($$select public.moderate_review('order',(select id from public.order_reviews where order_id='v2_order_main'),'hidden',null)$$,'42501',null,'generic legacy moderation cannot change v2 visibility');
select is((select status from public.order_reviews where order_id='v2_order_main'),'published'::public.review_status,'Restaurant report and legacy attempts do not change visibility');
select ok(not ((public.restaurant_list_order_reviews_v2(null,null,null,20)->'items'->0)
  ?| array['profileId','profile_id','orderId','order_id','userName','user_name_snapshot']),
  'Restaurant queue contains no Customer identity or order ID');
select ok(not ((public.restaurant_list_menu_item_reaction_aggregates_v2(null,50)->'items'->0)
  ?| array['profileId','orderId','reviewId','reaction']),
  'Restaurant reaction contract is aggregate-only');

-- Admin moderation, transition state machine, live aggregate exclusion/restoration, and audit hygiene.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp())::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select is((public.admin_set_order_review_report_status_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_main')),'resolved','valid report',
  '13000000-0000-4000-8000-000000000001')->>'status'),'resolved','Admin resolves an open report');
select throws_ok($$select public.admin_set_order_review_report_status_v2((select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_main')),'dismissed','swap','13000000-0000-4000-8000-000000000002')$$,'22023',null,'terminal-to-terminal report transition is denied');
select is((public.admin_set_order_review_report_status_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_main')),'open',null,
  '13000000-0000-4000-8000-000000000003')->>'status'),'open','Admin may reopen a terminal report');
select ok(not ((public.admin_list_order_review_reports_v2(null,null,null,20)->'items'->0)
  ?| array['profileId','profile_id','orderId','order_id','userName','user_name_snapshot']),
  'Admin inspection excludes Customer identity and order PII');
select is((select (x->'review'->>'contractVersion')::integer
  from jsonb_array_elements(public.admin_list_order_review_reports_v2(null,'fixture_restaurant_a',null,50)->'items') x
  where x->>'reviewId'='fixture_order_review'),1,'Admin inspection returns the stored v1 contract version');
select is((select (x->'review'->>'contractVersion')::integer
  from jsonb_array_elements(public.admin_list_order_review_reports_v2(null,'fixture_restaurant_a',null,50)->'items') x
  where x->>'reviewId'=(select id from public.order_reviews where order_id='v2_order_main')),2,
  'Admin inspection returns the stored v2 contract version');
select ok(has_function_privilege('authenticated','public.admin_list_order_review_audit_v2(uuid,text,integer)','execute'),
  'authenticated callers can reach the guarded Admin audit RPC');
select ok(not has_function_privilege('anon','public.admin_list_order_review_audit_v2(uuid,text,integer)','execute'),
  'anonymous callers cannot execute the Admin audit RPC');
select is((public.admin_set_order_review_visibility_v2(
  (select id from public.order_reviews where order_id='v2_order_hundred'),'hidden','policy violation',
  '13000000-0000-4000-8000-000000000004')->>'status'),'hidden','recently authenticated Admin hides review');
select is((public.get_restaurant_review_summary_v2('fixture_restaurant_a')->>'reviewCount')::integer,4,'hidden review is excluded from live summary');
select is((select count(*)::integer from private.review_v2_reaction_aggregates('fixture_restaurant_a',null,200)
  where menu_item_id like 'base_%'),0,'hidden review reactions are excluded from aggregates');
select is((public.admin_set_order_review_visibility_v2(
  (select id from public.order_reviews where order_id='v2_order_hundred'),'published','appeal accepted',
  '13000000-0000-4000-8000-000000000005')->>'status'),'published','Admin restores review');
select is((select sum(liked_count+disliked_count)::integer from private.review_v2_reaction_aggregates('fixture_restaurant_a',null,200)
  where menu_item_id like 'base_%'),100,'restoration returns reaction contributions exactly once');
select ok((select count(*) >= 3 from jsonb_array_elements(public.admin_list_order_review_audit_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
  null,50)->'items')),'Admin review audit includes report and visibility actions');
select ok(not exists(select 1 from jsonb_array_elements(public.admin_list_order_review_audit_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
  null,50)->'items') x where x->>'action'='order_review.submitted_v2'),
  'Admin review audit excludes Customer submission events');
select ok(not exists(select 1 from jsonb_array_elements(public.admin_list_order_review_audit_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
  null,50)->'items') x where x ?| array['comment','internalNote','resolutionNote','orderId','reactions']),
  'Admin review audit excludes comments, notes, order IDs, and reactions');
select ok((select (x->>'contractVersion')::integer=2 and x->>'restaurantId'='fixture_restaurant_a'
  and x->>'operationId' is not null from jsonb_array_elements(public.admin_list_order_review_audit_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
  null,50)->'items') x where x->>'action'='order_review.visibility_changed_v2' limit 1),
  'Admin review audit returns contract, Restaurant scope, and operation context');
select throws_ok($$select public.admin_list_order_review_audit_v2('00000000-0000-4000-8000-000000000000',null,20)$$,
  '22023',null,'Admin review audit rejects an unavailable report');
select is((public.admin_list_order_review_audit_v2(
  (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
  null,500)->>'limit')::integer,50,'Admin review audit page limit is capped at 50');

insert into private.audit_log(actor_profile_id,action,target_type,target_id,metadata,created_at)
select 'fixture_admin','order_review.visibility_changed_v2','order_review',r.id,
  jsonb_build_object('contract_version',2,'restaurant_id','fixture_restaurant_a','operation_id',gen_random_uuid(),
    'prior_state','published','new_state','hidden','moderation_reason','cursor tie'),
  transaction_timestamp()+interval '1 day'
from public.order_reviews r where r.order_id='v2_order_hundred'
union all
select 'fixture_admin','order_review.visibility_changed_v2','order_review',r.id,
  jsonb_build_object('contract_version',2,'restaurant_id','fixture_restaurant_a','operation_id',gen_random_uuid(),
    'prior_state','hidden','new_state','published','moderation_reason','cursor tie'),
  transaction_timestamp()+interval '1 day'
from public.order_reviews r where r.order_id='v2_order_hundred';
select isnt(
  public.admin_list_order_review_audit_v2(
    (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
    public.admin_list_order_review_audit_v2(
      (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
      null,1)->>'nextCursor',1)->'items'->0->>'auditId',
  public.admin_list_order_review_audit_v2(
    (select id from private.order_review_reports where review_id=(select id from public.order_reviews where order_id='v2_order_hundred')),
    null,1)->'items'->0->>'auditId',
  'Admin audit equal timestamps paginate by ID without duplication');
select ok(not exists(select 1 from private.audit_log where action like 'order_review.%_v2'
  and (metadata ? 'comment' or metadata ? 'internal_note' or metadata ? 'resolution_note')),
  'v2 audit metadata never copies comments or internal notes');
select ok((select metadata ?& array['contract_version','restaurant_id','operation_id','prior_state','new_state']
  from private.audit_log where action='order_review.visibility_changed_v2' order by created_at desc limit 1),
  'visibility audit captures actor-linked contract/scope/operation/prior/new state');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_admin','email_verified',true,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select throws_ok($$select public.admin_set_order_review_visibility_v2('v2_feed_a','hidden','no recent auth','13000000-0000-4000-8000-000000000006')$$,'42501',null,'visibility mutation requires recent Admin authentication');

-- Existing v1 functions remain callable and retain explicit projections.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_customer')::text,true);
select ok((public.list_my_order_reviews(100)->0) ? 'value_rating','v1 owned-order review projection retains Value');
select ok(not ((public.list_my_order_reviews(100)->0) ? 'profile_id'),'v1 owned-order review projection remains explicit and privacy-scoped');
select ok(not ((public.list_my_product_reviews(100)->0) ? 'profile_id'),'v1 owned-product review projection remains explicit and privacy-scoped');

select * from finish();
rollback;
