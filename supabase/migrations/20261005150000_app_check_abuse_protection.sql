-- BLOCKER-07: durable abuse controls for direct Data API and Storage traffic.
-- Authorization remains in the existing RLS/RPC helpers; this layer only
-- limits how much work an already-authenticated identity can initiate.

create table private.api_abuse_limits (
  actor_hash text not null,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (actor_hash, operation)
);

create index api_abuse_limits_expires_at_idx
  on private.api_abuse_limits(expires_at);

alter table private.api_abuse_limits enable row level security;
alter table private.api_abuse_limits force row level security;
revoke all on private.api_abuse_limits from public, anon, authenticated, service_role;
create policy api_abuse_limits_internal_owner
on private.api_abuse_limits for all to hungrie_api_owner
using (true) with check (true);

create function private.consume_abuse_quota(
  p_actor text,
  p_operation text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_hash text;
  v_count integer;
begin
  if btrim(coalesce(p_actor, '')) = ''
     or btrim(coalesce(p_operation, '')) = ''
     or p_limit < 1
     or p_window_seconds < 1
     or p_window_seconds > 86400 then
    raise exception 'Invalid abuse-control policy' using errcode = '22023';
  end if;

  v_actor_hash := encode(extensions.digest(p_actor, 'sha256'), 'hex');
  insert into private.api_abuse_limits(
    actor_hash, operation, window_started_at, request_count, expires_at, updated_at
  ) values (
    v_actor_hash, p_operation, p_now, 1,
    p_now + make_interval(secs => p_window_seconds) + interval '24 hours', p_now
  )
  on conflict(actor_hash, operation) do update set
    window_started_at = case
      when private.api_abuse_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
        then p_now
      else private.api_abuse_limits.window_started_at
    end,
    request_count = case
      when private.api_abuse_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
        then 1
      else private.api_abuse_limits.request_count + 1
    end,
    expires_at = case
      when private.api_abuse_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
        then p_now + make_interval(secs => p_window_seconds) + interval '24 hours'
      else private.api_abuse_limits.expires_at
    end,
    updated_at = p_now
  returning request_count into v_count;

  return v_count <= p_limit;
end
$$;

create function private.cleanup_expired_abuse_limits()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_deleted bigint;
begin
  delete from private.api_abuse_limits where expires_at < statement_timestamp();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

-- PostgREST invokes this before Data API requests. Only selected write/high-cost
-- RPCs consume quota; public reads and stable low-cost reads remain unaffected.
create function public.hungrie_data_api_abuse_check()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_method text := upper(coalesce(nullif(current_setting('request.method', true), ''), ''));
  v_path text := lower(trim(both '/' from coalesce(nullif(current_setting('request.path', true), ''), '')));
  v_actor text := btrim(coalesce(v_claims ->> 'sub', ''));
  v_operation text;
  v_limit integer;
  v_window integer;
begin
  if coalesce(v_claims ->> 'role', '') <> 'authenticated'
     or v_actor = ''
     or v_method not in ('POST', 'PUT', 'PATCH', 'DELETE') then
    return;
  end if;

  if v_path = any(array['rpc/create_order', 'rpc/create_order_v2']) then
    v_operation := 'customer-order-create'; v_limit := 12; v_window := 600;
  elsif v_path = any(array['rpc/quote_order', 'rpc/quote_order_v2']) then
    v_operation := 'customer-order-quote'; v_limit := 120; v_window := 600;
  elsif v_path in ('rpc/request_order_reminder', 'rpc/request_my_customer_order_reminder_v1') then
    v_operation := 'customer-order-reminder'; v_limit := 4; v_window := 600;
  elsif v_path ~ '^rpc/(submit(_my_customer)?_(product|order)_review(_v[12])?|submit_my_customer_order_review_v2|restaurant_report_order_review_v2|moderate_review)$' then
    v_operation := 'review-mutation'; v_limit := 12; v_window := 3600;
  elsif v_path ~ '^rpc/(register_my_(customer_)?push_token(_v[12])?|unregister_my_(customer_)?push_token(_v1)?|restaurant_(register|unregister)_web_push_v1)$' then
    v_operation := 'push-registration'; v_limit := 30; v_window := 3600;
  elsif v_path ~ '^rpc/(restaurant_(acknowledge|transition|cancel|set|update|bulk)|upsert_|set_(menu|category)|update_restaurant_details|create_restaurant)' then
    v_operation := 'restaurant-mutation'; v_limit := 120; v_window := 600;
  elsif v_path ~ '^rpc/(admin_(create|set|change|invite|reassign|resolve|schedule|record|recover)|complete_my_admin)' then
    v_operation := 'admin-mutation'; v_limit := 60; v_window := 600;
  elsif v_path ~ '^rpc/(bootstrap_my_customer_account_v1|update_my_customer_profile_v1|create_my_customer_address_v1|update_my_customer_address_v1|delete_my_customer_address_v1|set_my_customer_default_address_v1|replace_my_customer_favorites_v1|accept_my_account_invitation_v1)$' then
    v_operation := 'account-mutation'; v_limit := 60; v_window := 600;
  else
    return;
  end if;

  if not private.consume_abuse_quota(v_actor, v_operation, v_limit, v_window) then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code', 'ABUSE_RATE_LIMITED',
        'message', 'Too many requests. Try again later.'
      )::text,
      detail = jsonb_build_object(
        'status', 429,
        'status_text', 'Too Many Requests',
        'headers', jsonb_build_object('Retry-After', '60')
      )::text;
  end if;
end
$$;

-- quote_order functions were stable/read-only. Marking them volatile gives the
-- pre-request hook a read-write transaction in which to atomically count quotes.
alter function public.quote_order(text, jsonb) volatile;
alter function public.quote_order_v2(text, jsonb) volatile;

create function public.restaurant_media_upload_allowed_v1(p_object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.firebase_subject();
  v_restaurant text := private.current_restaurant_id();
  v_count bigint;
begin
  if v_actor is null or v_restaurant is null
     or split_part(p_object_name, '/', 1) <> v_restaurant
     or strpos(p_object_name, '/') <= 1 then
    return false;
  end if;

  -- Serialize quota checks for one tenant so concurrent uploads cannot all pass.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('restaurant-media:' || v_restaurant, 0));
  select count(*) into v_count
  from storage.objects
  where bucket_id = 'restaurant-media'
    and split_part(name, '/', 1) = v_restaurant;

  return v_count < 500
    and private.consume_abuse_quota(v_actor, 'restaurant-media-upload', 30, 3600);
end
$$;

drop policy restaurant_media_canonical_insert on storage.objects;
create policy restaurant_media_canonical_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'restaurant-media'
  and public.restaurant_media_upload_allowed_v1(name)
);

grant create on schema public, private to hungrie_api_owner;
alter table private.api_abuse_limits owner to hungrie_api_owner;
alter function private.consume_abuse_quota(text, text, integer, integer, timestamptz) owner to hungrie_api_owner;
alter function private.cleanup_expired_abuse_limits() owner to hungrie_api_owner;
alter function public.hungrie_data_api_abuse_check() owner to hungrie_api_owner;
alter function public.restaurant_media_upload_allowed_v1(text) owner to hungrie_api_owner;
revoke create on schema public, private from hungrie_api_owner;

grant usage on schema storage to hungrie_api_owner;
grant select on storage.objects to hungrie_api_owner;
revoke all on function private.consume_abuse_quota(text, text, integer, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.cleanup_expired_abuse_limits() from public, anon, authenticated, service_role;
revoke all on function public.hungrie_data_api_abuse_check() from public, anon, authenticated, service_role;
grant execute on function public.hungrie_data_api_abuse_check() to anon, authenticated, service_role;
revoke all on function public.restaurant_media_upload_allowed_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.restaurant_media_upload_allowed_v1(text) to authenticated;

alter role authenticator set pgrst.db_pre_request = 'public.hungrie_data_api_abuse_check';
notify pgrst, 'reload config';

do $jobs$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname = 'hungrie-abuse-limit-cleanup' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule(
    'hungrie-abuse-limit-cleanup',
    '17 * * * *',
    'select private.cleanup_expired_abuse_limits()'
  );
end
$jobs$;

comment on table private.api_abuse_limits is
  'Pseudonymous, fixed-window request counters for BLOCKER-07; one row per actor and operation, hourly TTL cleanup.';
comment on function public.hungrie_data_api_abuse_check() is
  'PostgREST pre-request abuse boundary. Authorization remains independently enforced by canonical RPC/RLS helpers.';
