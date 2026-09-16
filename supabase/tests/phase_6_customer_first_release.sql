begin;
select no_plan();

insert into private.account_access(profile_id,account_type,status,activated_at)
values ('fixture_customer','customer','active',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values ('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner');
insert into private.account_access(profile_id,account_type,status,activated_at,admin_role,admin_mfa_enrolled_at)
values ('fixture_admin','admin','active',statement_timestamp(),'admin',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,suspended_at)
values ('fixture_outsider','customer','suspended',statement_timestamp());

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=any(array[
    'get_my_customer_profile_v1','update_my_customer_profile_v1',
    'list_my_customer_addresses_v1','create_my_customer_address_v1','update_my_customer_address_v1',
    'delete_my_customer_address_v1','set_my_customer_default_address_v1',
    'list_my_customer_favorites_v1','replace_my_customer_favorites_v1',
    'get_my_customer_orders_page_v1','get_my_customer_order_v1',
    'get_my_customer_active_order_summary_v1','get_my_customer_latest_order_summary_v1',
    'request_my_customer_order_reminder_v1','my_customer_order_realtime_topics_v1',
    'list_my_customer_product_reviews_v1','list_my_customer_product_review_menu_items_v1','list_my_customer_order_reviews_v1',
    'get_my_customer_order_review_by_order_v1','get_my_customer_product_review_v1',
    'get_my_customer_order_review_v1','submit_my_customer_product_review_v1',
    'submit_my_customer_order_review_v1','get_my_customer_notification_preferences_v1',
    'update_my_customer_notification_preferences_v1','register_my_customer_push_token_v1',
    'unregister_my_customer_push_token_v1'])),27,'all guarded Customer RPCs exist');

select ok((select bool_and(position('require_active_customer' in p.prosrc)>0)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like '%customer%_v1'
    and p.proname not in ('bootstrap_my_customer_account_v1','get_my_access_context_v1')),
  'every Phase 6 Customer wrapper invokes the live Customer guard');
select ok((select bool_and(has_function_privilege('authenticated',p.oid,'execute'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like '%customer%_v1'
    and p.proname not in ('bootstrap_my_customer_account_v1','get_my_access_context_v1')),
  'authenticated callers can reach the guarded Customer surface');
select ok((select bool_and(not has_function_privilege('anon',p.oid,'execute'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like '%customer%_v1'
    and p.proname not in ('bootstrap_my_customer_account_v1','get_my_access_context_v1')),
  'anonymous callers cannot execute the private Customer surface');
select ok(has_function_privilege('anon','public.get_active_restaurant_bundle_v2(text)','execute'),
  'anonymous catalog browsing can use the public v2 projection');
select ok(has_function_privilege('authenticated','public.bootstrap_my_customer_account_v1(uuid)','execute'),
  'authenticated Customer client can invoke caller-bound bootstrap');
select ok(not has_function_privilege('anon','public.bootstrap_my_customer_account_v1(uuid)','execute'),
  'anonymous callers cannot invoke Customer bootstrap');

insert into public.menu_item_ingredients(id,restaurant_id,menu_item_id,name,removable,sort_order)
values ('phase6_onion','fixture_restaurant_a','fixture_menu_a','Onion',true,0);
insert into public.menu_option_groups(id,restaurant_id,menu_item_id,name,kind,minimum_selections,maximum_selections,sort_order)
values
  ('phase6_size','fixture_restaurant_a','fixture_menu_a','Size','size',1,1,0),
  ('phase6_extra','fixture_restaurant_a','fixture_menu_a','Extras','extra',0,1,1);
insert into public.menu_option_values(id,restaurant_id,group_id,name,price_delta_kurus,sort_order)
values
  ('phase6_large','fixture_restaurant_a','phase6_size','Large',300,0),
  ('phase6_meat','fixture_restaurant_a','phase6_extra','Extra meat',500,0);
select is((public.get_active_restaurant_bundle_v2('fixture_restaurant_a')#>>'{items,0,ingredients,0,id}'),
  'phase6_onion','public catalog v2 exposes active ingredient IDs');
select is((public.get_active_restaurant_bundle_v2('fixture_restaurant_a')#>>'{items,0,option_groups,0,options,0,id}'),
  'phase6_large','public catalog v2 exposes server-priced option IDs');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select is((public.get_my_customer_profile_v1()->>'id'),'fixture_customer','active Customer reads its guarded profile');
select is(jsonb_array_length(public.list_my_customer_addresses_v1()),1,'active Customer lists only its addresses');
select is(public.list_my_customer_favorites_v1(),array['fixture_restaurant_a']::text[],'active Customer lists its favorites');
select is((public.get_my_customer_order_v1('fixture_order')->>'id'),'fixture_order','active Customer reads its own order');
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at,canceled_at)
values('phase6_canceled_order','fixture_customer','fixture_restaurant_a','canceled','cash',1000,1000,
  statement_timestamp()-interval '1 minute',statement_timestamp());
insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source,reason)
values('phase6_canceled_order','pending','canceled','fixture_owner','restaurant','too_busy:internal staffing note');
select is((public.get_my_customer_order_v1('phase6_canceled_order')->>'cancellation_reason_code'),'too_busy',
  'Customer order detail exposes the safe Restaurant cancellation reason code');
select ok(position('internal staffing note' in public.get_my_customer_order_v1('phase6_canceled_order')::text)=0,
  'Customer order detail never exposes the Restaurant internal cancellation note');
select is(public.list_my_customer_product_review_menu_items_v1('fixture_order'),array['fixture_menu_a']::text[],
  'Customer receives exact reviewed menu-item IDs for this order');
select throws_ok($$select public.submit_my_customer_product_review_v1('fixture_order','fixture_menu_a',4::smallint,'Duplicate')$$,
  '23505',null,'Customer cannot review the same menu item twice in one order');
select is((select count(*)::integer from public.my_customer_order_realtime_topics_v1()),1,'Customer receives one caller-bound Realtime topic');
delete from private.notification_preferences where profile_id='fixture_customer';
select is((public.get_my_customer_notification_preferences_v1()->>'restaurantOrders')::boolean,false,
  'first Customer preference read creates defaults without enabling Restaurant delivery');
select is((select count(*)::integer from private.notification_preferences where profile_id='fixture_customer'),1,
  'first Customer preference read persists one default row');
select is((select p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_my_customer_notification_preferences_v1'),'v'::"char",
  'Customer preference read wrapper permits its first-use default-row write');
select is((public.quote_order_v2('fixture_restaurant_a',jsonb_build_array(jsonb_build_object(
  'menuItemId','fixture_menu_a','quantity',1,'optionValueIds',jsonb_build_array('phase6_large'),
  'removedIngredientIds',jsonb_build_array('phase6_onion'))))->>'subtotal_kurus')::bigint,2800::bigint,
  'server quote prices selected options and removable ingredients');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a',jsonb_build_array(jsonb_build_object(
  'menuItemId','fixture_menu_a','quantity',1,'optionValueIds','[]'::jsonb,'removedIngredientIds','[]'::jsonb)))$$,
  '22023',null,'server quote rejects an incomplete required group');
select is((public.quote_order_v2('fixture_restaurant_a',jsonb_build_array(
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large'),'removedIngredientIds','[]'::jsonb),
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large','phase6_meat'),'removedIngredientIds','[]'::jsonb),
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large'),'removedIngredientIds',jsonb_build_array('phase6_onion'))
))->>'subtotal_kurus')::bigint,8900::bigint,
  'server quote allows distinct extra and removed-ingredient variants of one menu item');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a',jsonb_build_array(
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large'),'removedIngredientIds','[]'::jsonb),
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large'),'removedIngredientIds','[]'::jsonb)
))$$,'22023',null,'server quote rejects duplicate identical configured lines');
select ok((public.create_order_v2('fixture_restaurant_a','fixture_address','cash',jsonb_build_array(
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large'),'removedIngredientIds','[]'::jsonb),
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large','phase6_meat'),'removedIngredientIds','[]'::jsonb),
  jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds',jsonb_build_array('phase6_large'),'removedIngredientIds',jsonb_build_array('phase6_onion'))
),'configured variants','66666666-0000-4000-8000-000000000002')->>'orderId') is not null,
  'v2 order creation accepts distinct configurations of one menu item');
select is((select count(*)::integer from public.order_items where order_id=(
  select order_id from private.customer_order_operations
  where operation_id='66666666-0000-4000-8000-000000000002')),3,
  'v2 order persists each configured variant as its own order line');

insert into public.addresses(id,profile_id,label,line1,city,country,is_default)
values ('phase6_other_address','fixture_owner','Other','Other line','Other city','Other country',false);
select throws_ok($$select public.update_my_customer_address_v1('phase6_other_address','Tamper','Line','','','City','Country',false)$$,
  '42501',null,'Customer address wrapper cannot alter another profile address');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select throws_ok($$select public.get_my_customer_profile_v1()$$,'42501',null,'Restaurant identity is denied by Customer RPCs');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a','[]'::jsonb)$$,'42501',null,'Restaurant identity is denied by Customer checkout');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_admin"}',true);
select throws_ok($$select public.get_my_customer_profile_v1()$$,'42501',null,'Admin identity is denied by Customer RPCs');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider"}',true);
select throws_ok($$select public.get_my_customer_profile_v1()$$,'42501',null,'suspended Customer is denied by Customer RPCs');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a','[]'::jsonb)$$,
  '42501',null,'suspended Customer cannot obtain a checkout quote');
select throws_ok($$select public.create_order_v2('fixture_restaurant_a','fixture_address','cash','[]'::jsonb,'',
  '66666666-0000-4000-8000-000000000001')$$,
  '42501',null,'suspended Customer cannot create an order with a saved address');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}',true);
select throws_ok($$select public.get_my_customer_profile_v1()$$,'42501',null,'unmapped identity is denied by Customer RPCs');

select * from finish();
rollback;
