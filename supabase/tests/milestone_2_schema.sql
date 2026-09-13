begin;

select plan(22);

select has_schema('private', 'private schema exists');
select has_schema('migration', 'migration schema exists');

select ok(
  (
    select count(*) = 10
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'profiles', 'restaurants', 'categories', 'menu_items', 'addresses',
        'favorites', 'orders', 'order_items', 'product_reviews', 'order_reviews'
      )
  ),
  'all ten public application tables exist'
);

select ok(
  (
    select count(*) = 5
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind = 'r'
      and c.relname in ('user_roles', 'restaurant_members', 'order_status_history', 'push_tokens', 'audit_log')
  ),
  'all five protected private tables exist'
);

select ok(
  (
    select count(*) = 3
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'migration'
      and c.relkind = 'r'
      and c.relname in ('import_runs', 'firestore_documents', 'import_rejections')
  ),
  'all three import staging tables exist'
);

select has_enum('public', 'order_status', 'order status enum exists');
select has_enum('public', 'payment_method', 'payment method enum exists');
select has_enum('public', 'review_status', 'review status enum exists');
select has_enum('public', 'platform_role', 'platform role enum exists');
select has_enum('public', 'restaurant_role', 'restaurant role enum exists');
select has_enum('public', 'notification_platform', 'notification platform enum exists');
select has_enum('public', 'notification_provider', 'notification provider enum exists');
select has_enum('migration', 'import_status', 'import status enum exists');

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'profiles', 'restaurants', 'categories', 'menu_items', 'addresses',
        'favorites', 'orders', 'order_items', 'product_reviews', 'order_reviews'
      )
  ),
  'RLS is enabled on every public application table'
);

select ok(
  (
    select count(*) = 18
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where not t.tgisinternal
      and n.nspname = 'private'
      and p.proname = 'set_updated_at'
  ),
  'all mutable tables use the shared updated_at trigger'
);

select ok(
  (
    select count(*) = 8
    from public.profiles
    where id like 'fixture_%' and email like '%@example.invalid'
  ),
  'eight non-personal authorization fixtures are present'
);

select is((select count(*)::integer from public.restaurants), 2, 'two restaurant fixtures are present');
select is((select count(*)::integer from public.categories), 2, 'two category fixtures are present');
select is((select count(*)::integer from public.menu_items), 2, 'two menu item fixtures are present');
select is((select total_kurus from public.orders where id = 'fixture_order'), 3100::bigint, 'fixture order total is integer kurus');
select is((select average_rating from public.order_reviews where id = 'fixture_order_review'), 4.67::numeric, 'order review average is generated');
select is((select count(*)::integer from private.order_status_history where order_id = 'fixture_order'), 5, 'fixture order has complete status history');

select * from finish();
rollback;
