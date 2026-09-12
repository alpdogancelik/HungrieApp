-- Milestone 11: environment runtime modes, write fencing, and sanitized health checks.

do $$ begin
  create type private.runtime_mode as enum ('maintenance', 'testing', 'active');
exception when duplicate_object then null;
end $$;

create table if not exists private.runtime_settings (
  singleton boolean primary key default true check (singleton),
  environment text not null default 'local' check (environment in ('local', 'development', 'staging', 'production')),
  mode private.runtime_mode not null default 'testing',
  firebase_project_id text not null default 'hungrieapp-a2288' check (btrim(firebase_project_id) <> ''),
  changed_at timestamptz not null default now(),
  changed_by text not null default 'migration'
);

insert into private.runtime_settings(singleton, environment, mode, changed_by)
values (true, 'local', 'testing', 'milestone_11_migration')
on conflict (singleton) do nothing;

revoke all on private.runtime_settings from public, anon, authenticated;
grant select on private.runtime_settings to hungrie_api_owner;

-- Identity validation is environment-owned. Staging may use the archived test
-- Firebase project, while production activation requires its isolated project.
create or replace function private.firebase_subject()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.jwt_is_authenticated()
      and private.request_jwt() ->> 'iss' = 'https://securetoken.google.com/' || settings.firebase_project_id
      and private.request_jwt() ->> 'aud' = settings.firebase_project_id
      and btrim(coalesce(private.request_jwt() ->> 'sub', '')) <> ''
    then private.request_jwt() ->> 'sub'
    else null
  end
  from private.runtime_settings settings
  where settings.singleton
$$;

create or replace function private.current_profile_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := private.request_jwt();
  subject text;
  result text;
  firebase_project text;
begin
  if not private.jwt_is_authenticated() then return null; end if;
  subject := claims ->> 'sub';
  if btrim(coalesce(subject, '')) = '' then return null; end if;
  select firebase_project_id into firebase_project from private.runtime_settings where singleton;

  if claims ->> 'iss' = 'https://securetoken.google.com/' || firebase_project then
    if claims ->> 'aud' <> firebase_project then return null; end if;
    select p.id into result from public.profiles p
      where p.firebase_uid = subject and p.deletion_pending_at is null and p.deleted_at is null;
    return result;
  end if;

  if subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select p.id into result from public.profiles p
      where p.supabase_user_id = subject::uuid and p.deletion_pending_at is null and p.deleted_at is null;
  end if;
  return result;
end
$$;

revoke all on function private.firebase_subject() from public, anon;
revoke all on function private.current_profile_id() from public, anon;
grant execute on function private.firebase_subject(), private.current_profile_id() to authenticated;

create or replace function private.assert_runtime_write_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_mode private.runtime_mode;
begin
  if current_setting('hungrie.runtime_write_bypass', true) = 'on' then
    return null;
  end if;
  select mode into v_mode from private.runtime_settings where singleton;
  if coalesce(v_mode, 'maintenance'::private.runtime_mode) = 'maintenance' then
    raise exception using errcode = 'P0001', message = 'APP_MAINTENANCE';
  end if;
  return null;
end $$;

revoke all on function private.assert_runtime_write_allowed() from public, anon, authenticated;

create or replace function private.expire_pending_orders(p_limit integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_order record; v_count integer := 0;
begin
  if (select mode = 'maintenance'::private.runtime_mode from private.runtime_settings where singleton) then
    return 0;
  end if;
  for v_order in
    select id,status from public.orders where status='pending'
      and approval_deadline_at<=statement_timestamp()
    order by approval_deadline_at for update skip locked limit least(greatest(p_limit,1),500)
  loop
    update public.orders set status='canceled',reminder_pending=false,
      canceled_at=coalesce(canceled_at,statement_timestamp()) where id=v_order.id;
    insert into private.order_status_history(order_id,previous_status,new_status,source,reason)
      values(v_order.id,'pending','canceled','system','approval_deadline_expired');
    perform private.write_audit(null,'order.transitioned','order',v_order.id,
      jsonb_build_object('from','pending','to','canceled','source','system'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

create or replace function private.wake_notification_worker(p_mode text default 'dispatch')
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  if p_mode not in ('dispatch','receipts') then return false; end if;
  if (select mode = 'maintenance'::private.runtime_mode from private.runtime_settings where singleton) then return false; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='notification_worker_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='notification_worker_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then return false; end if;
  perform net.http_post(
    url=>v_url,
    headers=>jsonb_build_object('content-type','application/json','x-worker-secret',v_secret),
    body=>jsonb_build_object('mode',p_mode),
    timeout_milliseconds=>5000
  );
  return true;
exception when others then
  raise warning 'Notification worker wake-up skipped: %',sqlstate;
  return false;
end
$$;

do $runtime_fence$
declare row record;
begin
  for row in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname in ('public', 'private')
      and not (n.nspname = 'private' and c.relname = 'runtime_settings')
  loop
    execute format('drop trigger if exists runtime_write_fence on %I.%I', row.schema_name, row.table_name);
    execute format(
      'create trigger runtime_write_fence before insert or update or delete on %I.%I for each statement execute function private.assert_runtime_write_allowed()',
      row.schema_name,
      row.table_name
    );
  end loop;
end $runtime_fence$;

create or replace function public.get_runtime_status()
returns table(environment text, mode text, writes_enabled boolean, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select settings.environment,
         settings.mode::text,
         settings.mode <> 'maintenance'::private.runtime_mode,
         now()
  from private.runtime_settings settings
  where settings.singleton
$$;

create or replace function public.system_health()
returns table(healthy boolean, environment text, mode text, schema_version text, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select true,
         settings.environment,
         settings.mode::text,
         '20260906120000',
         now()
  from private.runtime_settings settings
  where settings.singleton
$$;

revoke all on function public.get_runtime_status() from public;
revoke all on function public.system_health() from public;
grant execute on function public.get_runtime_status() to anon, authenticated;
grant execute on function public.system_health() to anon, authenticated;

comment on function public.get_runtime_status() is 'Returns only the current environment runtime mode for maintenance UI behavior.';
comment on function public.system_health() is 'Returns a sanitized liveness/schema response without data, identifiers, or secrets.';
