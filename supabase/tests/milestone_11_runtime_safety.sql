begin;
select plan(18);

select has_table('private', 'runtime_settings', 'runtime settings table exists');
select has_function('public', 'get_runtime_status', array[]::text[], 'runtime status RPC exists');
select has_function('public', 'system_health', array[]::text[], 'sanitized health RPC exists');
select ok(not has_table_privilege('anon', 'private.runtime_settings', 'select'), 'anon cannot read private runtime settings');
select ok(not has_table_privilege('authenticated', 'private.runtime_settings', 'select'), 'authenticated cannot read private runtime settings');
select ok(has_function_privilege('anon', 'public.get_runtime_status()', 'execute'), 'anon may read safe runtime status');
select ok(has_function_privilege('anon', 'public.system_health()', 'execute'), 'anon may call safe health check');

update private.runtime_settings set mode='maintenance', changed_at=now(), changed_by='pgtap' where singleton;
select throws_ok(
  $$insert into public.profiles(id, name, email, preferred_language) values ('fixture_m11_blocked', 'Blocked', 'blocked@example.invalid', 'en')$$,
  'P0001', 'APP_MAINTENANCE', 'maintenance blocks public table writes'
);
select throws_ok(
  $$insert into private.audit_log(actor_profile_id, action, target_type, target_id) values (null, 'blocked', 'test', 'fixture')$$,
  'P0001', 'APP_MAINTENANCE', 'maintenance blocks private table writes'
);
select is((select writes_enabled from public.get_runtime_status()), false, 'maintenance status reports writes disabled');
select is((select mode from public.get_runtime_status()), 'maintenance', 'maintenance status is exposed safely');
select is(private.expire_pending_orders(1), 0, 'maintenance prevents the expiry job from doing work');
select is(private.wake_notification_worker('dispatch'), false, 'maintenance prevents worker invocation');

update private.runtime_settings set mode='testing', changed_at=now(), changed_by='pgtap' where singleton;
select lives_ok(
  $$insert into public.profiles(id, name, email, preferred_language) values ('fixture_m11_allowed', 'Allowed', 'allowed@example.invalid', 'en')$$,
  'testing permits application writes'
);
select is((select writes_enabled from public.get_runtime_status()), true, 'testing status reports writes enabled');
select is((select healthy from public.system_health()), true, 'health check reports healthy');
select is((select schema_version from public.system_health()), '20260906120000', 'health check reports expected schema version');

select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='private' and routine_name='assert_runtime_write_allowed' and grantee in ('anon','authenticated')
  ),
  'clients cannot execute the private write guard'
);

select * from finish();
rollback;
