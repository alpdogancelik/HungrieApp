begin;

select plan(18);

select ok(not has_schema_privilege('public', 'private', 'usage'), 'PUBLIC cannot use the private schema');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use the private schema');
select ok(not has_schema_privilege('public', 'migration', 'usage'), 'PUBLIC cannot use the migration schema');
select ok(not has_schema_privilege('anon', 'migration', 'usage'), 'anon cannot use the migration schema');
select ok(not has_schema_privilege('authenticated', 'migration', 'usage'), 'authenticated cannot use the migration schema');

select ok(
  not exists (
    select 1
    from unnest(array[
      'profiles', 'restaurants', 'categories', 'menu_items', 'addresses',
      'orders', 'order_items', 'product_reviews', 'order_reviews'
    ]) as table_name
    where has_table_privilege('anon', format('public.%I', table_name), 'select,insert,update,delete')
  ),
  'anon has no application table privileges'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'restaurants', 'categories', 'menu_items', 'orders', 'order_items',
      'product_reviews', 'order_reviews'
    ]) as table_name
    where has_table_privilege('authenticated', format('public.%I', table_name), 'insert,update,delete')
  ),
  'authenticated cannot directly mutate protected application tables'
);
select ok(not has_table_privilege('anon', 'private.user_roles', 'select'), 'anon cannot read platform roles');
select ok(not has_table_privilege('authenticated', 'private.restaurant_members', 'select'), 'authenticated cannot read memberships');
select ok(not has_table_privilege('anon', 'private.push_tokens', 'select'), 'anon cannot read push tokens');
select ok(not has_table_privilege('authenticated', 'private.audit_log', 'select'), 'authenticated cannot read audit data');
select ok(not has_table_privilege('anon', 'migration.firestore_documents', 'select'), 'anon cannot read staged Firestore payloads');
select ok(not has_table_privilege('authenticated', 'migration.import_rejections', 'select'), 'authenticated cannot read import rejections');

select ok(
  (
    select count(*)::integer
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles', 'restaurants', 'categories', 'menu_items', 'addresses',
        'favorites', 'orders', 'order_items', 'product_reviews', 'order_reviews'
      )
  ) > 0,
  'Milestone 3 client RLS policies are installed'
);

select throws_ok(
  $$set local role anon; select * from public.restaurants$$,
  '42501', null, 'anon cannot query public application tables directly'
);
select lives_ok(
  $$set local role authenticated; select * from public.profiles$$,
  'authenticated profile reads are filtered by RLS'
);

select ok(
  to_regprocedure('public.migration_auth_probe()') is null,
  'the temporary Milestone 1 authentication probe is removed'
);

select * from finish();
rollback;
