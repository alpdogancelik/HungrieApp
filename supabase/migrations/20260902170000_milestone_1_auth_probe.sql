create or replace function public.migration_auth_probe()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
$$;

revoke all on function public.migration_auth_probe() from public;
revoke all on function public.migration_auth_probe() from anon;
grant execute on function public.migration_auth_probe() to authenticated;

comment on function public.migration_auth_probe() is
  'Temporary Milestone 1 Firebase third-party authentication probe; remove through a Milestone 3 migration.';
