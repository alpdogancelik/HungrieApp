-- Milestone 10: protected Expo push delivery, database-owned jobs, and
-- complete restaurant/catalog management operations.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault;

alter type public.notification_provider add value if not exists 'expo';

alter table private.push_tokens
  add column if not exists is_active boolean not null default true,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_registered_at timestamptz not null default statement_timestamp();

create table private.notification_preferences (
  profile_id text primary key references public.profiles(id) on delete cascade,
  order_status_enabled boolean not null default true,
  restaurant_orders_enabled boolean not null default true,
  review_replies_enabled boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table private.notification_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (btrim(idempotency_key) <> ''),
  event_type text not null check (event_type in (
    'order_status', 'restaurant_new_order', 'restaurant_reminder', 'review_reply'
  )),
  order_id text references public.orders(id) on delete restrict,
  review_id text references public.product_reviews(id) on delete restrict,
  expected_status public.order_status,
  state text not null default 'pending' check (state in ('pending','processing','completed','obsolete')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_event_resource check (
    (event_type = 'review_reply' and review_id is not null and order_id is null and expected_status is null)
    or (event_type <> 'review_reply' and order_id is not null and review_id is null)
  )
);

create table private.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references private.notification_events(id) on delete restrict,
  token_id text not null references private.push_tokens(id) on delete restrict,
  state text not null default 'pending' check (state in (
    'pending','processing','ticketed','delivered','dead_letter','obsolete'
  )),
  attempts integer not null default 0 check (attempts between 0 and 6),
  next_attempt_at timestamptz not null default statement_timestamp(),
  claim_until timestamptz,
  expo_ticket_id text,
  ticketed_at timestamptz,
  receipt_checked_at timestamptz,
  error_code text,
  last_error text check (last_error is null or length(last_error) <= 300),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (event_id, token_id)
);

create index notification_events_state_idx
  on private.notification_events(state, created_at);
create index notification_deliveries_dispatch_idx
  on private.notification_deliveries(state, next_attempt_at, claim_until);
create index notification_deliveries_receipt_idx
  on private.notification_deliveries(state, ticketed_at)
  where state = 'ticketed';

create trigger notification_preferences_set_updated_at
before update on private.notification_preferences
for each row execute function private.set_updated_at();
create trigger notification_events_set_updated_at
before update on private.notification_events
for each row execute function private.set_updated_at();
create trigger notification_deliveries_set_updated_at
before update on private.notification_deliveries
for each row execute function private.set_updated_at();

revoke all on private.notification_preferences, private.notification_events,
  private.notification_deliveries from public, anon, authenticated;

create or replace function private.enqueue_notification_event(
  p_idempotency_key text,
  p_event_type text,
  p_order_id text default null,
  p_review_id text default null,
  p_expected_status public.order_status default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into private.notification_events(
    idempotency_key,event_type,order_id,review_id,expected_status
  ) values (
    p_idempotency_key,p_event_type,p_order_id,p_review_id,p_expected_status
  ) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into v_id;
  return v_id;
exception when others then
  raise warning 'Notification event enqueue skipped: %', sqlstate;
  return null;
end $$;

create or replace function private.notification_event_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_status public.order_status;
begin
  if new.action in ('order.created','order.reminder_requested','order.transitioned','delivery.claimed') then
    select status into v_status from public.orders where id=new.target_id;
    if new.action='order.created' then
      perform private.enqueue_notification_event('audit:'||new.id,'restaurant_new_order',new.target_id,null,v_status);
    elsif new.action='order.reminder_requested' then
      perform private.enqueue_notification_event('audit:'||new.id,'restaurant_reminder',new.target_id,null,v_status);
    else
      perform private.enqueue_notification_event('audit:'||new.id,'order_status',new.target_id,null,v_status);
    end if;
  elsif new.action='review.replied' then
    perform private.enqueue_notification_event('audit:'||new.id,'review_reply',null,new.target_id,null);
  end if;
  return new;
end $$;

create trigger audit_log_notification_event
after insert on private.audit_log
for each row execute function private.notification_event_from_audit();

create or replace function private.notification_event_is_current(p_event private.notification_events)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_event.event_type
    when 'order_status' then exists(
      select 1 from public.orders o where o.id=p_event.order_id and o.status=p_event.expected_status
    )
    when 'restaurant_new_order' then exists(
      select 1 from public.orders o where o.id=p_event.order_id and o.status='pending'
    )
    when 'restaurant_reminder' then exists(
      select 1 from public.orders o where o.id=p_event.order_id and o.status='pending' and o.reminder_pending
    )
    when 'review_reply' then exists(
      select 1 from public.product_reviews r
      where r.id=p_event.review_id and r.status='published' and nullif(btrim(coalesce(r.reply,'')),'') is not null
    )
    else false end
$$;

create or replace function private.materialize_notification_deliveries()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_event private.notification_events%rowtype;
begin
  for v_event in
    select * from private.notification_events where state='pending' order by created_at for update skip locked
  loop
    if not private.notification_event_is_current(v_event) then
      update private.notification_events set state='obsolete' where id=v_event.id;
      continue;
    end if;

    if v_event.event_type='order_status' then
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.orders o
      join public.profiles pr on pr.id=o.profile_id
        and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id=o.profile_id and t.is_active and t.revoked_at is null and t.provider='expo'
      left join private.notification_preferences p on p.profile_id=o.profile_id
      where o.id=v_event.order_id and coalesce(p.order_status_enabled,true)
      on conflict do nothing;
    elsif v_event.event_type in ('restaurant_new_order','restaurant_reminder') then
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.orders o
      join private.restaurant_members m on m.restaurant_id=o.restaurant_id
      join public.profiles pr on pr.id=m.profile_id and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id=m.profile_id and t.is_active and t.revoked_at is null and t.provider='expo'
      left join private.notification_preferences p on p.profile_id=m.profile_id
      where o.id=v_event.order_id and coalesce(p.restaurant_orders_enabled,true)
      on conflict do nothing;
    elsif v_event.event_type='review_reply' then
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.product_reviews r
      join public.profiles pr on pr.id=r.profile_id
        and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id=r.profile_id and t.is_active and t.revoked_at is null and t.provider='expo'
      left join private.notification_preferences p on p.profile_id=r.profile_id
      where r.id=v_event.review_id and coalesce(p.review_replies_enabled,true)
      on conflict do nothing;
    end if;

    update private.notification_events set state=case
      when exists(select 1 from private.notification_deliveries d where d.event_id=v_event.id) then 'processing'
      else 'completed' end
    where id=v_event.id;
  end loop;
end $$;

create or replace function public.register_my_push_token(
  p_token text,
  p_platform public.notification_platform
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_hash text;
  v_id text;
  v_existing_token_id text;
  v_previous_profile text;
begin
  if p_platform not in ('ios','android') or p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
     or length(p_token)>300 then
    raise exception 'Invalid Expo push token' using errcode='22023';
  end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  v_id:='expo_'||v_hash;
  select id,profile_id into v_existing_token_id,v_previous_profile
  from private.push_tokens where token_hash=v_hash for update;
  if v_previous_profile is distinct from v_actor then
    update private.notification_deliveries
    set state='obsolete',claim_until=null
    where token_id=v_existing_token_id and state in ('pending','processing');
    update private.notification_events e set state='completed'
    where e.state='processing'
      and not exists (
        select 1 from private.notification_deliveries d
        where d.event_id=e.id and d.state in ('pending','processing','ticketed')
      );
  end if;
  insert into private.push_tokens(
    id,profile_id,restaurant_id,token,token_hash,platform,provider,is_active,revoked_at,last_registered_at
  ) values (
    v_id,v_actor,null,p_token,v_hash,p_platform,'expo',true,null,statement_timestamp()
  ) on conflict(token_hash) do update set
    profile_id=v_actor,restaurant_id=null,token=excluded.token,platform=excluded.platform,
    provider='expo',is_active=true,revoked_at=null,last_registered_at=statement_timestamp()
  returning id into v_id;
  insert into private.notification_preferences(profile_id) values(v_actor) on conflict do nothing;
  return v_id;
end $$;

create or replace function public.unregister_my_push_token(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actor text:=private.require_profile(); v_hash text; v_token_id text;
begin
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select id into v_token_id from private.push_tokens
  where profile_id=v_actor and token_hash=v_hash for update;
  if found then
    update private.notification_deliveries set state='obsolete',claim_until=null
    where token_id=v_token_id and state in ('pending','processing');
    update private.push_tokens set is_active=false,revoked_at=statement_timestamp()
    where id=v_token_id;
    update private.notification_events e set state='completed'
    where e.state='processing'
      and not exists (
        select 1 from private.notification_deliveries d
        where d.event_id=e.id and d.state in ('pending','processing','ticketed')
      );
  end if;
end $$;

create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actor text:=private.require_profile(); v_result jsonb;
begin
  insert into private.notification_preferences(profile_id) values(v_actor) on conflict do nothing;
  select jsonb_build_object(
    'orderStatus',order_status_enabled,
    'restaurantOrders',restaurant_orders_enabled,
    'reviewReplies',review_replies_enabled
  ) into v_result from private.notification_preferences where profile_id=v_actor;
  return v_result;
end $$;

create or replace function public.update_my_notification_preferences(
  p_order_status boolean,
  p_restaurant_orders boolean,
  p_review_replies boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actor text:=private.require_profile();
begin
  insert into private.notification_preferences(
    profile_id,order_status_enabled,restaurant_orders_enabled,review_replies_enabled
  ) values(v_actor,p_order_status,p_restaurant_orders,p_review_replies)
  on conflict(profile_id) do update set
    order_status_enabled=excluded.order_status_enabled,
    restaurant_orders_enabled=excluded.restaurant_orders_enabled,
    review_replies_enabled=excluded.review_replies_enabled;
  perform private.write_audit(v_actor,'notification.preferences_updated','profile',v_actor);
  return public.get_my_notification_preferences();
end $$;

create or replace function public.claim_notification_deliveries(p_limit integer default 100)
returns table(
  delivery_id uuid,event_id uuid,event_type text,order_id text,review_id text,
  expected_status public.order_status,token text,platform public.notification_platform,
  preferred_language text,restaurant_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.materialize_notification_deliveries();
  return query
  with candidates as (
    select d.id from private.notification_deliveries d
    join private.notification_events e on e.id=d.event_id
    join private.push_tokens t on t.id=d.token_id
      and t.is_active and t.revoked_at is null and t.provider='expo'
    join public.profiles p on p.id=t.profile_id
      and p.deleted_at is null and p.deletion_pending_at is null
    where d.state in ('pending','processing') and d.next_attempt_at<=statement_timestamp()
      and (d.claim_until is null or d.claim_until<statement_timestamp())
      and private.notification_event_is_current(e)
    order by d.next_attempt_at,d.created_at
    for update of d skip locked limit least(greatest(p_limit,1),100)
  ), claimed as (
    update private.notification_deliveries d set state='processing',attempts=attempts+1,
      claim_until=statement_timestamp()+interval '90 seconds'
    from candidates c where d.id=c.id returning d.*
  )
  select d.id,e.id,e.event_type,e.order_id,e.review_id,e.expected_status,t.token,t.platform,
    coalesce(p.preferred_language,'en'),r.name
  from claimed d join private.notification_events e on e.id=d.event_id
  join private.push_tokens t on t.id=d.token_id and t.is_active and t.revoked_at is null
  left join public.orders o on o.id=e.order_id
  left join public.restaurants r on r.id=o.restaurant_id
  left join public.product_reviews pr on pr.id=e.review_id
  left join public.profiles p on p.id=t.profile_id;
end $$;

create or replace function public.record_notification_delivery_result(
  p_delivery_id uuid,p_outcome text,p_ticket_id text default null,
  p_error_code text default null,p_error_message text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_attempts integer; v_event uuid; v_token_id text; v_state text; v_delay interval;
begin
  select attempts,event_id,token_id,state into v_attempts,v_event,v_token_id,v_state from private.notification_deliveries
  where id=p_delivery_id for update;
  if not found then raise exception 'Unknown notification delivery'; end if;
  if v_state='obsolete' then return; end if;
  if p_outcome='ticketed' and nullif(btrim(coalesce(p_ticket_id,'')),'') is not null then
    update private.notification_deliveries set state='ticketed',expo_ticket_id=p_ticket_id,
      ticketed_at=statement_timestamp(),claim_until=null,error_code=null,last_error=null where id=p_delivery_id;
  elsif p_outcome='obsolete' then
    update private.notification_deliveries set state='obsolete',claim_until=null where id=p_delivery_id;
  elsif p_outcome='permanent' or v_attempts>=6 then
    update private.notification_deliveries set state='dead_letter',claim_until=null,
      error_code=left(p_error_code,80),last_error=left(p_error_message,300) where id=p_delivery_id;
    if p_error_code='DeviceNotRegistered' then
      update private.push_tokens set is_active=false,revoked_at=statement_timestamp() where id=v_token_id;
    end if;
  elsif p_outcome='retry' then
    v_delay:=case v_attempts when 1 then interval '1 minute' when 2 then interval '2 minutes'
      when 3 then interval '5 minutes' when 4 then interval '15 minutes' else interval '30 minutes' end;
    update private.notification_deliveries set state='pending',claim_until=null,
      next_attempt_at=statement_timestamp()+v_delay,error_code=left(p_error_code,80),
      last_error=left(p_error_message,300) where id=p_delivery_id;
  else raise exception 'Unknown notification outcome' using errcode='22023'; end if;

  if not exists(select 1 from private.notification_deliveries where event_id=v_event and state in ('pending','processing','ticketed')) then
    update private.notification_events set state='completed' where id=v_event;
  end if;
end $$;

create or replace function public.claim_notification_receipts(p_limit integer default 1000)
returns table(delivery_id uuid,ticket_id text,token_id text)
language sql
volatile
security definer
set search_path = ''
as $$
  update private.notification_deliveries d set receipt_checked_at=statement_timestamp()
  where d.id in (
    select x.id from private.notification_deliveries x
    where x.state='ticketed' and x.ticketed_at<=statement_timestamp()-interval '15 minutes'
      and (x.receipt_checked_at is null or x.receipt_checked_at<=statement_timestamp()-interval '5 minutes')
    order by x.ticketed_at for update skip locked limit least(greatest(p_limit,1),1000)
  ) returning d.id,d.expo_ticket_id,d.token_id
$$;

create or replace function public.record_notification_receipt(
  p_delivery_id uuid,p_outcome text,p_error_code text default null,p_error_message text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_token_id text; v_event uuid;
begin
  select token_id,event_id into v_token_id,v_event from private.notification_deliveries
  where id=p_delivery_id and state='ticketed' for update;
  if not found then raise exception 'Unknown notification delivery'; end if;
  if p_outcome='delivered' then
    update private.notification_deliveries set state='delivered',error_code=null,last_error=null where id=p_delivery_id;
  elsif p_outcome='missing' then
    return;
  else
    update private.notification_deliveries set state='dead_letter',error_code=left(p_error_code,80),
      last_error=left(p_error_message,300) where id=p_delivery_id;
    if p_error_code='DeviceNotRegistered' then
      update private.push_tokens set is_active=false,revoked_at=statement_timestamp() where id=v_token_id;
    end if;
  end if;
  if not exists(select 1 from private.notification_deliveries where event_id=v_event and state in ('pending','processing','ticketed')) then
    update private.notification_events set state='completed' where id=v_event;
  end if;
end $$;

create or replace function private.expire_pending_orders(p_limit integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_order record; v_count integer:=0;
begin
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
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

-- Emit a dedicated audit action only when a published product-review reply changes.
create or replace function private.product_review_reply_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and nullif(btrim(coalesce(new.reply,'')),'') is not null
     and new.reply is distinct from old.reply then
    perform private.write_audit(null,'review.replied','product_review',new.id,
      jsonb_build_object('restaurant_id',new.restaurant_id));
  end if;
  return new;
end $$;
create trigger product_review_reply_notification
after update of reply,status on public.product_reviews
for each row execute function private.product_review_reply_audit();

create or replace function private.wake_notification_worker(p_mode text default 'dispatch')
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_url text; v_secret text;
begin
  if p_mode not in ('dispatch','receipts') then return false; end if;
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
end $$;

create or replace function private.wake_notification_worker_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.wake_notification_worker('dispatch'); return new; end $$;
create trigger notification_event_worker_wakeup
after insert on private.notification_events
for each statement execute function private.wake_notification_worker_trigger();

create or replace function public.create_restaurant(p_payload jsonb)
returns text
language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_profile(); v_id text:=gen_random_uuid()::text; v_name text;
begin
  if not private.has_platform_role('super_admin') then
    raise exception 'Super-admin role required' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Restaurant payload must be an object' using errcode='22023'; end if;
  v_name:=btrim(coalesce(p_payload->>'name',''));
  if v_name='' or length(v_name)>160 then raise exception 'Invalid restaurant name' using errcode='22023'; end if;
  insert into public.restaurants(
    id,name,description,cuisine,address,phone,image_url,is_active,
    delivery_eta_min_minutes,delivery_eta_max_minutes,delivery_fee_kurus,minimum_order_kurus,
    opening_hours,preferred_language
  ) values(
    v_id,v_name,btrim(coalesce(p_payload->>'description','')),btrim(coalesce(p_payload->>'cuisine','')),
    btrim(coalesce(p_payload->>'address','')),nullif(btrim(coalesce(p_payload->>'phone','')),''),
    nullif(btrim(coalesce(p_payload->>'image_url','')),''),coalesce((p_payload->>'is_active')::boolean,false),
    nullif(p_payload->>'delivery_eta_min_minutes','')::integer,
    nullif(p_payload->>'delivery_eta_max_minutes','')::integer,
    coalesce(nullif(p_payload->>'delivery_fee_kurus','')::bigint,0),
    coalesce(nullif(p_payload->>'minimum_order_kurus','')::bigint,0),
    coalesce(p_payload->'opening_hours','{}'::jsonb),coalesce(nullif(p_payload->>'preferred_language',''),'tr')
  );
  perform private.write_audit(v_actor,'restaurant.created','restaurant',v_id);
  return v_id;
end $$;

create or replace function public.get_restaurant_menu_management_data(p_restaurant_id text)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_profile();
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'restaurant_id',p_restaurant_id,
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.id) from (
      select id,restaurant_id,name,description,icon,sort_order,is_active,created_at,updated_at
      from public.categories where restaurant_id=p_restaurant_id
    ) c),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.id) from (
      select id,restaurant_id,category_id,name,description,image_url,price_kurus,sort_order,
        eta_minutes,calories,protein_grams,rating_average,rating_count,customizations,is_active,created_at,updated_at
      from public.menu_items where restaurant_id=p_restaurant_id
    ) m),'[]'::jsonb)
  );
end $$;

revoke all on function public.register_my_push_token(text,public.notification_platform),
  public.unregister_my_push_token(text),public.get_my_notification_preferences(),
  public.update_my_notification_preferences(boolean,boolean,boolean),
  public.claim_notification_deliveries(integer),
  public.record_notification_delivery_result(uuid,text,text,text,text),
  public.claim_notification_receipts(integer),
  public.record_notification_receipt(uuid,text,text,text),
  public.create_restaurant(jsonb),public.get_restaurant_menu_management_data(text)
  from public,anon,authenticated;

grant execute on function public.register_my_push_token(text,public.notification_platform),
  public.unregister_my_push_token(text),public.get_my_notification_preferences(),
  public.update_my_notification_preferences(boolean,boolean,boolean),
  public.create_restaurant(jsonb),public.get_restaurant_menu_management_data(text)
  to authenticated;
grant execute on function public.claim_notification_deliveries(integer),
  public.record_notification_delivery_result(uuid,text,text,text,text),
  public.claim_notification_receipts(integer),public.record_notification_receipt(uuid,text,text,text)
  to service_role;

grant select,insert,update on private.push_tokens,private.notification_preferences,
  private.notification_events,private.notification_deliveries to hungrie_api_owner;
grant usage on schema extensions to hungrie_api_owner;
grant execute on function extensions.digest(text,text) to hungrie_api_owner;
grant execute on function private.enqueue_notification_event(text,text,text,text,public.order_status),
  private.notification_event_is_current(private.notification_events),
  private.materialize_notification_deliveries() to hungrie_api_owner;

grant create on schema public,private to hungrie_api_owner;
alter function public.register_my_push_token(text,public.notification_platform) owner to hungrie_api_owner;
alter function public.unregister_my_push_token(text) owner to hungrie_api_owner;
alter function public.get_my_notification_preferences() owner to hungrie_api_owner;
alter function public.update_my_notification_preferences(boolean,boolean,boolean) owner to hungrie_api_owner;
alter function public.create_restaurant(jsonb) owner to hungrie_api_owner;
alter function public.get_restaurant_menu_management_data(text) owner to hungrie_api_owner;
revoke create on schema public,private from hungrie_api_owner;

-- The expiry job is data-local. Worker invocation is configured separately after
-- deployment because its URL and shared secret belong in Vault, not migrations.
do $jobs$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname in (
    'hungrie-expire-pending-orders','hungrie-notification-dispatch','hungrie-notification-receipts'
  ) loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule('hungrie-expire-pending-orders','* * * * *',
    'select private.expire_pending_orders(100)');
  perform cron.schedule('hungrie-notification-dispatch','* * * * *',
    $cron$select private.wake_notification_worker('dispatch')$cron$);
  perform cron.schedule('hungrie-notification-receipts','*/5 * * * *',
    $cron$select private.wake_notification_worker('receipts')$cron$);
end $jobs$;
