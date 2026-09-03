begin;

select plan(35);

select ok(exists (
  select 1 from pg_roles where rolname = 'hungrie_api_owner'
    and not rolcanlogin and not rolbypassrls
), 'RPC owner is non-login and cannot bypass RLS');
select has_table('private', 'restaurant_couriers', 'restaurant courier scopes are protected');
select has_table('private', 'order_contacts', 'order contacts are protected');
select hasnt_column('public', 'orders', 'customer_email', 'order email is absent from public orders');
select hasnt_column('public', 'orders', 'delivery_address_snapshot', 'order address is absent from public orders');
select has_column('private', 'order_contacts', 'delivery_address_snapshot', 'address snapshot moved to private storage');

select ok((
  select count(*) = 11 from information_schema.views
  where table_schema = 'public' and table_name in (
    'active_restaurants', 'active_categories', 'active_menu_items',
    'published_product_reviews', 'published_order_reviews', 'my_orders',
    'restaurant_orders', 'courier_available_orders', 'courier_assigned_orders',
    'admin_orders', 'my_restaurant_memberships'
  )
), 'all curated read views exist');

select ok((
  select count(*) = 10 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity
    and c.relname in ('profiles','restaurants','categories','menu_items','addresses','favorites','orders','order_items','product_reviews','order_reviews')
), 'RLS is enabled and forced on every public application table');

select ok((
  select count(*) >= 26 from pg_policy p join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
), 'explicit client and function-owner RLS policies exist');

select ok(to_regprocedure('public.migration_auth_probe()') is null, 'temporary auth probe is removed');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use private schema');
select ok(not has_schema_privilege('authenticated', 'migration', 'usage'), 'authenticated cannot use migration schema');
select ok(not has_table_privilege('authenticated', 'private.order_contacts', 'select'), 'authenticated cannot read protected contacts');
select ok(not has_table_privilege('authenticated', 'private.user_roles', 'select'), 'authenticated cannot read platform roles');
select ok(not has_table_privilege('authenticated', 'private.audit_log', 'insert'), 'authenticated cannot forge audit rows');

select ok(not has_column_privilege('anon', 'public.restaurants', 'phone', 'select'), 'anonymous users cannot read restaurant phone');
select ok(not has_column_privilege('anon', 'public.restaurants', 'address', 'select'), 'anonymous users cannot read restaurant address');
select ok(not has_column_privilege('authenticated', 'public.menu_items', 'cost_kurus', 'select'), 'clients cannot read menu cost');
select ok(not has_column_privilege('authenticated', 'public.product_reviews', 'profile_id', 'select'), 'review author profile IDs are not exposed');
select ok(not has_column_privilege('authenticated', 'public.order_reviews', 'order_id', 'select'), 'review order IDs are not exposed');

select ok(not has_table_privilege('authenticated', 'public.orders', 'insert'), 'clients cannot insert orders directly');
select ok(not has_table_privilege('authenticated', 'public.orders', 'update'), 'clients cannot update orders directly');
select ok(not has_table_privilege('authenticated', 'public.product_reviews', 'insert'), 'clients cannot insert reviews directly');
select ok(not has_table_privilege('authenticated', 'public.categories', 'update'), 'clients cannot directly mutate categories');
select ok(not has_table_privilege('authenticated', 'public.menu_items', 'delete'), 'clients cannot hard-delete menu items');

select ok(not has_function_privilege('anon', 'public.create_order(text,text,public.payment_method,jsonb,text)', 'execute'), 'anonymous cannot create orders');
select ok(has_function_privilege('authenticated', 'public.create_order(text,text,public.payment_method,jsonb,text)', 'execute'), 'authenticated may invoke secured order creation');
select ok(has_function_privilege('authenticated', 'public.claim_delivery(text)', 'execute'), 'authenticated may invoke secured courier claim');
select ok(not has_function_privilege('anon', 'public.set_platform_role(text,public.platform_role,boolean)', 'execute'), 'anonymous cannot invoke role management');

select throws_ok(
  $$set local role authenticated; select * from private.order_contacts$$,
  '42501', null, 'private contact reads are denied at execution'
);
select throws_ok(
  $$set local role authenticated; update public.orders set status = 'delivered' where id = 'fixture_order'$$,
  '42501', null, 'direct order status updates are denied at execution'
);
select throws_ok(
  $$set local role authenticated; select cost_kurus from public.menu_items$$,
  '42501', null, 'menu costs are denied at execution'
);

select is((select count(*)::integer from public.active_restaurants), 2, 'active catalog view contains fixture restaurants');
select is((select count(*)::integer from public.published_product_reviews), 1, 'published product review view contains its fixture');
select is((select count(*)::integer from public.published_order_reviews), 1, 'published order review view contains its fixture');

select * from finish();
rollback;
