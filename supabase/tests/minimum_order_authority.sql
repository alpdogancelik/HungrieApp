begin;
select no_plan();

insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner');
insert into private.account_access(profile_id,account_type,status,activated_at)
values('fixture_customer','customer','active',statement_timestamp());

insert into public.restaurants(id,name,is_active,lifecycle_status,accepting_orders,delivery_fee_kurus,minimum_order_kurus)
values('minimum_restaurant_c','Minimum C',true,'active',true,0,40000);
insert into public.categories(id,restaurant_id,name) values('minimum_category_c','minimum_restaurant_c','Minimum');
insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus)
values('minimum_item_c','minimum_restaurant_c','minimum_category_c','C item',40000);

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);

update public.restaurants set minimum_order_kurus=10000 where id='fixture_restaurant_a';
update public.menu_items set price_kurus=10000 where id='fixture_menu_a';
select is((public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'minimum_order_kurus')::bigint,10000::bigint,
  'Restaurant A quote returns A minimum');

update public.restaurants set minimum_order_kurus=25000 where id='fixture_restaurant_b';
update public.menu_items set price_kurus=25000 where id='fixture_menu_b';
select is((public.quote_order_v2('fixture_restaurant_b','[{"menuItemId":"fixture_menu_b","quantity":1}]')->>'minimum_order_kurus')::bigint,25000::bigint,
  'Restaurant B quote returns B minimum');
select is((public.quote_order_v2('minimum_restaurant_c','[{"menuItemId":"minimum_item_c","quantity":1}]')->>'minimum_order_kurus')::bigint,40000::bigint,
  'Restaurant C quote returns C minimum independently');

create function pg_temp.minimum_failure(p_restaurant text,p_items jsonb)
returns jsonb language plpgsql as $$
declare v_detail text;
begin
  perform public.quote_order_v2(p_restaurant,p_items);
  return null;
exception when others then
  get stacked diagnostics v_detail=pg_exception_detail;
  return v_detail::jsonb;
end $$;

update public.restaurants set minimum_order_kurus=30000,delivery_fee_kurus=6000 where id='fixture_restaurant_a';
update public.menu_items set price_kurus=29999 where id='fixture_menu_a';
select is(pg_temp.minimum_failure('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'reason','MINIMUM_ORDER_NOT_MET',
  'below-minimum quote returns a structured reason');
select is((pg_temp.minimum_failure('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'minimum_order_kurus')::bigint,30000::bigint,
  'below-minimum quote returns the authoritative minimum');
select is((pg_temp.minimum_failure('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'qualifying_subtotal_kurus')::bigint,29999::bigint,
  'below-minimum quote returns the server-priced qualifying subtotal');

update public.menu_items set price_kurus=30000 where id='fixture_menu_a';
select is((public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'subtotal_kurus')::bigint,30000::bigint,
  'subtotal exactly equal to minimum passes');
update public.menu_items set price_kurus=30001 where id='fixture_menu_a';
select is((public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'subtotal_kurus')::bigint,30001::bigint,
  'subtotal above minimum passes');

update public.restaurants set minimum_order_kurus=0 where id='fixture_restaurant_b';
update public.menu_items set price_kurus=700 where id='fixture_menu_b';
select lives_ok($$select public.quote_order_v2('fixture_restaurant_b','[{"menuItemId":"fixture_menu_b","quantity":1}]')$$,
  'zero minimum means no minimum and permits a positive valid cart');

update public.restaurants set minimum_order_kurus=25000,delivery_fee_kurus=6000 where id='fixture_restaurant_a';
update public.menu_items set price_kurus=24000 where id='fixture_menu_a';
select is((pg_temp.minimum_failure('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')->>'qualifying_subtotal_kurus')::bigint,24000::bigint,
  'delivery fee does not contribute to the qualifying subtotal');

insert into public.menu_option_groups(id,restaurant_id,menu_item_id,name,kind,minimum_selections,maximum_selections)
values('minimum_group','fixture_restaurant_a','fixture_menu_a','Extra','extra',0,1);
insert into public.menu_option_values(id,restaurant_id,group_id,name,price_delta_kurus)
values('minimum_option','fixture_restaurant_a','minimum_group','Extra',1000);
select is((public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1,"optionValueIds":["minimum_option"]}]')->>'subtotal_kurus')::bigint,25000::bigint,
  'server-priced option deltas contribute to the qualifying subtotal');

select throws_ok($$select public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1,"minimum_order_kurus":0}]')$$,
  '22023','Order items accept IDs and quantities only','client cannot submit a lower minimum');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1,"priceKurus":999999}]')$$,
  '22023','Order items accept IDs and quantities only','client cannot submit a menu price');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1,"optionPriceKurus":999999}]')$$,
  '22023','Order items accept IDs and quantities only','client cannot submit an option price');
select throws_ok($$select public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_b","quantity":1}]')$$,
  '22023','Menu item unavailable','cross-Restaurant menu identity is rejected');

select throws_ok($$update public.restaurants set minimum_order_kurus=-1 where id='fixture_restaurant_a'$$,
  '23514',null,'negative minimum configuration is rejected');
select throws_ok($$update public.restaurants set minimum_order_kurus=null where id='fixture_restaurant_a'$$,
  '23502',null,'null minimum configuration is rejected');

update public.restaurants set minimum_order_kurus=25000 where id='fixture_restaurant_a';
update public.menu_items set price_kurus=27000 where id='fixture_menu_a';
select lives_ok($$select public.quote_order_v2('fixture_restaurant_a','[{"menuItemId":"fixture_menu_a","quantity":1}]')$$,
  'quote succeeds against the earlier minimum');
update public.restaurants set minimum_order_kurus=30000 where id='fixture_restaurant_a';
select throws_ok($$select public.create_order_v2('fixture_restaurant_a','fixture_address','cash','[{"menuItemId":"fixture_menu_a","quantity":1}]','stale minimum','55555555-0000-4000-8000-000000000099')$$,
  '22023','Minimum order amount not reached','order creation revalidates a minimum changed after quote');
select is((select count(*)::integer from private.customer_order_operations where operation_id='55555555-0000-4000-8000-000000000099'),0,
  'stale client eligibility creates neither order nor operation record');

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select is((public.restaurant_update_settings_v1('{"minimum_order_kurus":12345}','55555555-0000-4000-8000-000000000100')->>'minimumOrderKurus')::bigint,12345::bigint,
  'Restaurant owner can update its own authoritative minimum');
select is((select minimum_order_kurus from public.restaurants where id='fixture_restaurant_b'),0::bigint,
  'Restaurant A settings update cannot change Restaurant B minimum');

select * from finish();
rollback;
