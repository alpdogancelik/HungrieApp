begin;

select plan(16);

select ok(
  not has_function_privilege('anon', 'public.list_my_product_reviews(integer)', 'execute'),
  'anonymous clients cannot call private review support RPCs'
);
select ok(
  has_function_privilege('authenticated', 'public.list_my_product_reviews(integer)', 'execute'),
  'authenticated clients may call caller-scoped review support RPCs'
);
select ok(
  not has_function_privilege('anon', 'public.get_restaurant_management_details(text)', 'execute'),
  'anonymous clients cannot read restaurant management details'
);
select ok(
  not has_schema_privilege('hungrie_api_owner', 'public', 'create'),
  'function owner retains no public-schema create privilege'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}', true);

select is(jsonb_array_length(public.list_my_product_reviews(30)), 1, 'customer lists only own product reviews');
select is(jsonb_array_length(public.list_my_order_reviews(30)), 1, 'customer lists only own order reviews');
select is(public.get_my_product_review('fixture_product_review') ->> 'profile_id', 'fixture_customer', 'customer reads own product review');
select is(public.get_my_order_review_by_order('fixture_order') ->> 'id', 'fixture_order_review', 'customer resolves own order review by order');
select throws_ok(
  $$select public.get_restaurant_management_details('fixture_restaurant_a')$$,
  '42501', null, 'customer cannot read restaurant management details'
);
select throws_ok(
  $$select public.list_restaurant_product_reviews('fixture_restaurant_a', 30)$$,
  '42501', null, 'customer cannot list hidden restaurant reviews'
);
select throws_ok(
  $$select public.list_restaurant_couriers('fixture_restaurant_a')$$,
  '42501', null, 'customer cannot list restaurant couriers'
);

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}', true);
select is(public.get_restaurant_management_details('fixture_restaurant_a') ->> 'id', 'fixture_restaurant_a', 'manager reads own restaurant management details');
select is(jsonb_array_length(public.list_restaurant_product_reviews('fixture_restaurant_a', 30)), 1, 'manager lists own restaurant product reviews');
select is(jsonb_array_length(public.list_restaurant_order_reviews('fixture_restaurant_a', 30)), 1, 'manager lists own restaurant order reviews');
select throws_ok(
  $$select public.list_restaurant_couriers('fixture_restaurant_a')$$,
  '42501', null, 'manager cannot list owner-managed courier scopes'
);

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}', true);
select is(jsonb_array_length(public.list_restaurant_couriers('fixture_restaurant_a')), 1, 'owner lists scoped couriers for own restaurant');

select * from finish();
rollback;
