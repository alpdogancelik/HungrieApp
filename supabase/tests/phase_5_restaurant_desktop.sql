begin;
select no_plan();

insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner');
select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);

select ok(has_function_privilege('authenticated','public.restaurant_get_dashboard_v1()','execute'),'guarded Restaurant dashboard is reachable');
select ok(has_function_privilege('authenticated','public.restaurant_can_manage_media_object_v1(text)','execute'),'Restaurant media predicate is callable by Storage RLS');
select ok(not has_function_privilege('authenticated','private.current_restaurant_id()','execute'),'canonical Restaurant helper remains private');
select ok(not has_table_privilege('authenticated','private.restaurant_operations','select'),'operation ledger is private');
select ok(not has_table_privilege('authenticated','public.menu_option_groups','select'),'menu definition tables are not directly exposed');
select is((public.restaurant_get_dashboard_v1()->>'restaurantId'),'fixture_restaurant_a','dashboard derives canonical scope');
select ok(private.can_subscribe_restaurant_v1_topic('restaurant-orders:v1:fixture_restaurant_a'),'canonical topic allows own Restaurant');
select ok(not private.can_subscribe_restaurant_v1_topic('restaurant-orders:v1:fixture_restaurant_b'),'canonical topic denies another Restaurant');
select ok(public.restaurant_can_manage_media_object_v1('fixture_restaurant_a/item.png'),'Restaurant media predicate allows its canonical folder');
select ok(not public.restaurant_can_manage_media_object_v1('fixture_restaurant_b/item.png'),'Restaurant media predicate denies another folder');
select ok(not public.restaurant_can_manage_media_object_v1('fixture_restaurant_a'),'Restaurant media predicate requires an object below the folder');

select is((public.restaurant_set_accepting_orders_v1(false,'55555555-0000-4000-8000-000000000001')->>'acceptingOrders')::boolean,false,'Restaurant can close order acceptance');
select is((public.restaurant_set_accepting_orders_v1(false,'55555555-0000-4000-8000-000000000001')->>'acceptingOrders')::boolean,false,'acceptance retry is idempotent');
select throws_ok($$select public.restaurant_set_accepting_orders_v1(true,'55555555-0000-4000-8000-000000000001')$$,'22023',null,'operation ID cannot be reused with changed request');

insert into public.categories(id,restaurant_id,name,sort_order) values('phase5_category','fixture_restaurant_a','Phase 5',20);
insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,sort_order) values
 ('phase5_item_a','fixture_restaurant_a','phase5_category','A',1000,0),
 ('phase5_item_b','fixture_restaurant_a','phase5_category','B',1100,1);
select is((public.restaurant_bulk_set_item_availability_v1(array['phase5_item_a','phase5_item_b'],false,'55555555-0000-4000-8000-000000000002')->>'updated')::integer,2,'bulk availability updates atomically');
select throws_ok($$select public.restaurant_bulk_set_item_availability_v1(array['phase5_item_a','fixture_item_b'],true,'55555555-0000-4000-8000-000000000003')$$,'42501',null,'bulk action rejects cross-tenant item');

select is((public.restaurant_save_menu_item_v2(jsonb_build_object('id','phase5_item_a','categoryId','phase5_category','name','Configured','priceKurus',1200,'active',true,'ingredients',jsonb_build_array(jsonb_build_object('id','ingredient_a','name','Onion','removable',true)),'groups',jsonb_build_array(jsonb_build_object('id','size_group','name','Size','kind','size','minimumSelections',1,'maximumSelections',1,'options',jsonb_build_array(jsonb_build_object('id','large','name','Large','priceDeltaKurus',300))))),'55555555-0000-4000-8000-000000000004')->>'menuItemId'),'phase5_item_a','v2 item definition saves transactionally');
select is((select count(*)::integer from public.menu_option_groups where menu_item_id='phase5_item_a'),1,'option group saved');
select is((select count(*)::integer from public.menu_option_values where group_id='size_group'),1,'option value saved');
select is((select count(*)::integer from public.menu_item_ingredients where menu_item_id='phase5_item_a'),1,'ingredient saved');

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at)
values('phase5_pending','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval'5 minutes');
insert into private.push_tokens(id,profile_id,token,token_hash,platform,provider)
values('phase5_customer_push','fixture_customer','ExpoPushToken[phase5_customer]',repeat('6',64),'ios','expo');
select is((public.restaurant_transition_order_v1('phase5_pending',(select updated_at from public.orders where id='phase5_pending'),'preparing',null,null,'55555555-0000-4000-8000-000000000005')->>'status'),'preparing','Restaurant accepts current pending order');
select is((select count(*)::integer from private.order_status_history where order_id='phase5_pending' and source='restaurant'),1,'transition writes one history event');
select is((select count(*)::integer from private.notification_events where order_id='phase5_pending'
  and event_type='order_status' and expected_status='preparing'),1,
  'Restaurant transition creates a Customer order-status notification event');
select lives_ok($$select private.materialize_notification_deliveries()$$,
  'Customer notification event materializes for active Expo token');
select is((select count(*)::integer from private.notification_deliveries d
  join private.notification_events e on e.id=d.event_id
  where e.order_id='phase5_pending' and d.token_id='phase5_customer_push'),1,
  'Restaurant transition creates one Customer push delivery');
select throws_ok($$select public.restaurant_transition_order_v1('phase5_pending',(select updated_at from public.orders where id='phase5_pending'),'canceled',null,null,'55555555-0000-4000-8000-000000000006')$$,'22023',null,'cancellation requires supported reason');

select is((public.restaurant_set_accepting_orders_v1(true,'55555555-0000-4000-8000-000000000007')->>'acceptingOrders')::boolean,true,'Restaurant can reopen after readiness');
insert into private.account_access(profile_id,account_type,status,activated_at)
values('fixture_customer','customer','active',statement_timestamp());
select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select is((public.quote_order_v2('fixture_restaurant_a',jsonb_build_array(jsonb_build_object(
  'menuItemId','phase5_item_a','quantity',2,'optionValueIds',jsonb_build_array('large'),
  'removedIngredientIds',jsonb_build_array('ingredient_a'))))->>'subtotal_kurus')::bigint,3000::bigint,'v2 quote computes selected options server-side');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a',jsonb_build_array(jsonb_build_object(
  'menuItemId','phase5_item_a','quantity',1,'optionValueIds','[]'::jsonb,'removedIngredientIds','[]'::jsonb)))$$,
  '22023',null,'v2 quote enforces required group selections');
select ok((public.create_order_v2('fixture_restaurant_a','fixture_address','cash',jsonb_build_array(jsonb_build_object(
  'menuItemId','phase5_item_a','quantity',1,'optionValueIds',jsonb_build_array('large'),'removedIngredientIds',jsonb_build_array('ingredient_a'))),
  'phase 5 snapshot','55555555-0000-4000-8000-000000000008')->>'orderId') is not null,'v2 order creates from IDs and quantities');
select is((select count(*)::integer from private.notification_events e
  join private.customer_order_operations op on op.order_id=e.order_id
  where op.operation_id='55555555-0000-4000-8000-000000000008'
    and e.event_type='restaurant_new_order'),1,
  'v2 order creation produces the Restaurant new-order notification event');
select is((select customizations_snapshot->0->>'menuDefinitionRevision' from public.order_items where order_id=(select order_id from private.customer_order_operations where operation_id='55555555-0000-4000-8000-000000000008')),
  (select definition_revision::text from public.menu_items where id='phase5_item_a'),'v2 order preserves menu revision snapshot');
select is((public.create_order_v2('fixture_restaurant_a','fixture_address','cash',jsonb_build_array(jsonb_build_object(
  'menuItemId','phase5_item_a','quantity',1,'optionValueIds',jsonb_build_array('large'),'removedIngredientIds',jsonb_build_array('ingredient_a'))),
  'phase 5 snapshot','55555555-0000-4000-8000-000000000008')->>'replayed')::boolean,true,'v2 order retry is idempotent');

update private.account_access set status='suspended',suspended_at=statement_timestamp() where profile_id='fixture_owner';
select throws_ok($$select public.restaurant_get_dashboard_v1()$$,'42501',null,'suspended Restaurant account is denied');

select * from finish();
rollback;
