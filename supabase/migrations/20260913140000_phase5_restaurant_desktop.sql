-- Phase 5: additive canonical Restaurant APIs and desktop/PWA support.
-- Legacy Restaurant contracts remain unchanged during the compatibility window.

create type public.menu_option_group_kind as enum ('size', 'modifier', 'extra');

alter table public.menu_items add column definition_revision bigint not null default 1
  check (definition_revision > 0);

create table public.menu_item_ingredients (
  id text primary key default gen_random_uuid()::text,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  menu_item_id text not null,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  removable boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, restaurant_id),
  foreign key (menu_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id) on delete cascade
);

create table public.menu_option_groups (
  id text primary key default gen_random_uuid()::text,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  menu_item_id text not null,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  kind public.menu_option_group_kind not null,
  minimum_selections integer not null default 0 check (minimum_selections >= 0),
  maximum_selections integer not null default 1 check (maximum_selections >= 1),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint menu_option_group_selection_range check (minimum_selections <= maximum_selections),
  unique (id, restaurant_id),
  foreign key (menu_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id) on delete cascade
);

create table public.menu_option_values (
  id text primary key default gen_random_uuid()::text,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  group_id text not null,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  price_delta_kurus bigint not null default 0 check (price_delta_kurus >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, restaurant_id),
  foreign key (group_id, restaurant_id)
    references public.menu_option_groups(id, restaurant_id) on delete cascade
);

create table private.restaurant_order_visibility (
  order_id text not null references public.orders(id) on delete restrict,
  profile_id text not null references public.profiles(id) on delete restrict,
  order_version timestamptz not null,
  first_seen_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  primary key (order_id, profile_id)
);

create table private.restaurant_operations (
  operation_id uuid primary key,
  profile_id text not null references public.profiles(id) on delete restrict,
  operation_kind text not null check (operation_kind in
    ('order_transition','order_seen','restaurant_update','accepting_orders',
     'review_moderation','category_save','category_reorder','menu_item_save',
     'menu_item_reorder','menu_bulk_availability','push_register','push_unregister')),
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default statement_timestamp()
);

alter table private.push_tokens
  add column if not exists registered_by_profile_id text references public.profiles(id) on delete cascade,
  add column if not exists device_id text,
  add column if not exists preferred_language text check (preferred_language in ('en','tr'));
create unique index push_tokens_restaurant_device_idx
  on private.push_tokens(restaurant_id,app,device_id)
  where device_id is not null and is_active and revoked_at is null;

create index menu_item_ingredients_item_idx on public.menu_item_ingredients(menu_item_id,sort_order);
create index menu_option_groups_item_idx on public.menu_option_groups(menu_item_id,sort_order);
create index menu_option_values_group_idx on public.menu_option_values(group_id,sort_order);

create trigger menu_item_ingredients_set_updated_at before update on public.menu_item_ingredients
for each row execute function private.set_updated_at();
create trigger menu_option_groups_set_updated_at before update on public.menu_option_groups
for each row execute function private.set_updated_at();
create trigger menu_option_values_set_updated_at before update on public.menu_option_values
for each row execute function private.set_updated_at();

alter table public.menu_item_ingredients enable row level security;
alter table public.menu_option_groups enable row level security;
alter table public.menu_option_values enable row level security;
alter table private.restaurant_order_visibility enable row level security;
alter table private.restaurant_operations enable row level security;
revoke all on public.menu_item_ingredients,public.menu_option_groups,public.menu_option_values,
  private.restaurant_order_visibility,private.restaurant_operations from public,anon,authenticated;
create policy phase5_ingredients_owner_all on public.menu_item_ingredients for all to hungrie_api_owner using (true) with check (true);
create policy phase5_groups_owner_all on public.menu_option_groups for all to hungrie_api_owner using (true) with check (true);
create policy phase5_values_owner_all on public.menu_option_values for all to hungrie_api_owner using (true) with check (true);
create policy phase5_visibility_owner_all on private.restaurant_order_visibility for all to hungrie_api_owner using (true) with check (true);
create policy phase5_operations_owner_all on private.restaurant_operations for all to hungrie_api_owner using (true) with check (true);

create function private.phase5_restaurant_scope()
returns table(profile_id text,restaurant_id text,restaurant_role public.restaurant_role)
language sql stable security definer set search_path='' as $$
  select a.profile_id,a.restaurant_id,a.restaurant_role
  from private.account_access a join public.restaurants r on r.id=a.restaurant_id
  where a.profile_id=private.canonical_profile_id() and a.account_type='restaurant'
    and a.status='active' and a.onboarding_step='none' and r.lifecycle_status='active'
$$;

create function private.phase5_operation(
  p_id uuid,p_kind text,p_digest text,p_result jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_row private.restaurant_operations%rowtype;
begin
  select * into v_row from private.restaurant_operations where operation_id=p_id for update;
  if found then
    if v_row.profile_id<>v_actor or v_row.operation_kind<>p_kind or v_row.request_digest<>p_digest then
      raise exception 'Operation ID was already used for another request' using errcode='22023';
    end if;
    return v_row.result;
  end if;
  if p_result is null then return null; end if;
  insert into private.restaurant_operations(operation_id,profile_id,operation_kind,request_digest,result)
  values(p_id,v_actor,p_kind,p_digest,p_result);
  return p_result;
end $$;

create function public.restaurant_get_dashboard_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_scope record;
begin
  select * into v_scope from private.phase5_restaurant_scope();
  if not found then perform private.require_active_restaurant(); end if;
  return jsonb_build_object(
    'restaurantId',v_scope.restaurant_id,
    'role',v_scope.restaurant_role,
    'restaurant',(select jsonb_build_object('name',r.name,'lifecycleStatus',r.lifecycle_status,
      'acceptingOrders',r.accepting_orders,'preferredLanguage',r.preferred_language)
      from public.restaurants r where r.id=v_scope.restaurant_id),
    'counts',jsonb_build_object(
      'pending',(select count(*) from public.orders where restaurant_id=v_scope.restaurant_id and status='pending'),
      'active',(select count(*) from public.orders where restaurant_id=v_scope.restaurant_id and status in ('preparing','ready','out_for_delivery')),
      'unreadReviews',(select count(*) from public.product_reviews where restaurant_id=v_scope.restaurant_id and reply is null)
    ),'serverTime',statement_timestamp());
end $$;

create function public.restaurant_list_orders_v1(
  p_queue text default 'active',p_cursor text default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant text:=private.current_restaurant_id(); v_statuses public.order_status[];
  v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);v_created_at timestamptz;v_id text;v_ids text[];
begin
  perform private.require_active_restaurant();
  if p_queue='active' then v_statuses:=array['pending','preparing','ready','out_for_delivery']::public.order_status[];
  elsif p_queue='history' then v_statuses:=array['delivered','canceled']::public.order_status[];
  else raise exception 'Unsupported order queue' using errcode='22023'; end if;
  if p_cursor is not null then select d.created_at,d.id into v_created_at,v_id from private.decode_order_cursor(p_cursor)d;end if;
  select array_agg(x.id order by x.created_at desc,x.id desc) into v_ids from(
    select o.id,o.created_at from public.orders o where o.restaurant_id=v_restaurant and o.status=any(v_statuses)
      and(p_cursor is null or(o.created_at,o.id)<(v_created_at,v_id))
    order by o.created_at desc,o.id desc limit v_limit+1)x;
  return private.order_page_result(v_ids,v_limit);
end $$;

create function public.restaurant_get_order_v1(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant text:=private.current_restaurant_id();
begin
  perform private.require_active_restaurant();
  if not exists(select 1 from public.orders where id=p_order_id and restaurant_id=v_restaurant) then
    raise exception 'Order unavailable' using errcode='42501';
  end if;
  return private.order_api_json(p_order_id,true);
end $$;

create function public.restaurant_acknowledge_order_seen_v1(
  p_order_id text,p_order_version timestamptz,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_digest text; v_result jsonb;
begin
  v_digest:=encode(extensions.digest(p_order_id||':'||p_order_version::text,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'order_seen',v_digest); if v_result is not null then return v_result; end if;
  if not exists(select 1 from public.orders where id=p_order_id and restaurant_id=v_restaurant and updated_at=p_order_version) then
    raise exception 'Order version unavailable' using errcode='40001';
  end if;
  insert into private.restaurant_order_visibility(order_id,profile_id,order_version)
  values(p_order_id,v_actor,p_order_version) on conflict(order_id,profile_id) do update
    set order_version=excluded.order_version,last_seen_at=statement_timestamp();
  v_result:=jsonb_build_object('orderId',p_order_id,'seen',true);
  perform private.phase5_operation(p_operation_id,'order_seen',v_digest,v_result); return v_result;
end $$;

create function public.restaurant_transition_order_v1(
  p_order_id text,p_expected_version timestamptz,p_new_status text,
  p_reason_code text default null,p_note text default null,p_operation_id uuid default gen_random_uuid())
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_order public.orders%rowtype; v_target public.order_status; v_digest text; v_result jsonb;
begin
  if p_new_status not in ('preparing','ready','out_for_delivery','delivered','canceled') then
    raise exception 'Unsupported order status' using errcode='22023'; end if;
  v_target:=p_new_status::public.order_status;
  if length(coalesce(p_note,''))>500 then raise exception 'Note is too long' using errcode='22023'; end if;
  if v_target='canceled' and (p_reason_code is null or p_reason_code not in
    ('too_busy','item_unavailable','closing','equipment_issue','delivery_unavailable','other')) then
    raise exception 'Cancellation reason required' using errcode='22023'; end if;
  v_digest:=encode(extensions.digest(concat_ws(':',p_order_id,p_expected_version,p_new_status,p_reason_code,p_note),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'order_transition',v_digest); if v_result is not null then return v_result; end if;
  select * into v_order from public.orders where id=p_order_id and restaurant_id=v_restaurant for update;
  if not found then raise exception 'Order unavailable' using errcode='42501'; end if;
  if v_order.updated_at<>p_expected_version then raise exception 'Order changed; refresh and retry' using errcode='40001'; end if;
  if v_order.status='pending' and v_order.approval_deadline_at<=statement_timestamp() then
    update public.orders set status='canceled',canceled_at=statement_timestamp(),reminder_pending=false where id=p_order_id;
    insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source,reason)
      values(p_order_id,'pending','canceled',null,'system','approval_deadline_expired');
    v_result:=jsonb_build_object('orderId',p_order_id,'status','canceled','version',
      (select updated_at from public.orders where id=p_order_id),'reasonCode','approval_deadline_expired');
    perform private.phase5_operation(p_operation_id,'order_transition',v_digest,v_result);return v_result;
  end if;
  if not ((v_order.status='pending' and v_target in ('preparing','canceled'))
    or (v_order.status='preparing' and v_target in ('ready','out_for_delivery','canceled'))
    or (v_order.status='ready' and v_target in ('out_for_delivery','canceled'))
    or (v_order.status='out_for_delivery' and v_target in ('delivered','canceled'))) then
    raise exception 'Invalid order transition' using errcode='22023'; end if;
  update public.orders set status=v_target,reminder_pending=false,
    preparing_at=case when v_target='preparing' then coalesce(preparing_at,statement_timestamp()) else preparing_at end,
    ready_at=case when v_target='ready' then coalesce(ready_at,statement_timestamp()) else ready_at end,
    out_for_delivery_at=case when v_target='out_for_delivery' then coalesce(out_for_delivery_at,statement_timestamp()) else out_for_delivery_at end,
    delivered_at=case when v_target='delivered' then coalesce(delivered_at,statement_timestamp()) else delivered_at end,
    canceled_at=case when v_target='canceled' then coalesce(canceled_at,statement_timestamp()) else canceled_at end
    where id=p_order_id returning updated_at into p_expected_version;
  insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source,reason)
    values(p_order_id,v_order.status,v_target,v_actor,'restaurant',
      case when v_target='canceled' then p_reason_code||coalesce(':'||nullif(btrim(p_note),''),'') else null end);
  perform private.write_audit(v_actor,'restaurant.order_transitioned','order',p_order_id,
    jsonb_build_object('operation_id',p_operation_id,'from',v_order.status,'to',v_target,'reasonCode',p_reason_code));
  v_result:=jsonb_build_object('orderId',p_order_id,'status',v_target,'version',p_expected_version);
  perform private.phase5_operation(p_operation_id,'order_transition',v_digest,v_result); return v_result;
end $$;

create function public.restaurant_get_settings_v1()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'description',r.description,'cuisine',r.cuisine,
    'address',r.address,'phone',r.phone,'imageUrl',r.image_url,'deliveryEtaMinMinutes',r.delivery_eta_min_minutes,
    'deliveryEtaMaxMinutes',r.delivery_eta_max_minutes,'minimumOrderKurus',r.minimum_order_kurus,
    'openingHours',r.opening_hours,'preferredLanguage',r.preferred_language,
    'lifecycleStatus',r.lifecycle_status,'acceptingOrders',r.accepting_orders)
  from public.restaurants r where r.id=private.current_restaurant_id() and private.require_active_restaurant() is not null
$$;

create function public.restaurant_update_settings_v1(p_changes jsonb,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_digest text; v_result jsonb; v_unknown text[];
begin
  if jsonb_typeof(p_changes)<>'object' then raise exception 'Changes must be an object' using errcode='22023'; end if;
  select array_agg(key) into v_unknown from jsonb_object_keys(p_changes) key where key not in
    ('name','description','cuisine','address','phone','image_url','delivery_eta_min_minutes',
     'delivery_eta_max_minutes','minimum_order_kurus','opening_hours','preferred_language');
  if v_unknown is not null then raise exception 'Unsupported Restaurant setting' using errcode='22023'; end if;
  v_digest:=encode(extensions.digest(p_changes::text,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'restaurant_update',v_digest); if v_result is not null then return v_result; end if;
  update public.restaurants r set
    name=case when p_changes?'name' then btrim(p_changes->>'name') else r.name end,
    description=case when p_changes?'description' then btrim(p_changes->>'description') else r.description end,
    cuisine=case when p_changes?'cuisine' then btrim(p_changes->>'cuisine') else r.cuisine end,
    address=case when p_changes?'address' then btrim(p_changes->>'address') else r.address end,
    phone=case when p_changes?'phone' then btrim(p_changes->>'phone') else r.phone end,
    image_url=case when p_changes?'image_url' then nullif(btrim(p_changes->>'image_url'),'') else r.image_url end,
    delivery_eta_min_minutes=case when p_changes?'delivery_eta_min_minutes' then (p_changes->>'delivery_eta_min_minutes')::integer else r.delivery_eta_min_minutes end,
    delivery_eta_max_minutes=case when p_changes?'delivery_eta_max_minutes' then (p_changes->>'delivery_eta_max_minutes')::integer else r.delivery_eta_max_minutes end,
    minimum_order_kurus=case when p_changes?'minimum_order_kurus' then (p_changes->>'minimum_order_kurus')::bigint else r.minimum_order_kurus end,
    opening_hours=case when p_changes?'opening_hours' then p_changes->'opening_hours' else r.opening_hours end,
    preferred_language=case when p_changes?'preferred_language' then p_changes->>'preferred_language' else r.preferred_language end
  where r.id=v_restaurant;
  if btrim(coalesce((select name from public.restaurants where id=v_restaurant),''))='' then
    raise exception 'Restaurant name is required' using errcode='22023';end if;
  perform private.write_audit(v_actor,'restaurant.details_updated','restaurant',v_restaurant,
    jsonb_build_object('operation_id',p_operation_id,'fields',(select jsonb_agg(key) from jsonb_object_keys(p_changes)key)));
  v_result:=public.restaurant_get_settings_v1();
  perform private.phase5_operation(p_operation_id,'restaurant_update',v_digest,v_result); return v_result;
end $$;

create function public.restaurant_set_accepting_orders_v1(p_accepting boolean,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_digest text:=encode(extensions.digest(p_accepting::text,'sha256'),'hex'); v_result jsonb;
begin
  v_result:=private.phase5_operation(p_operation_id,'accepting_orders',v_digest); if v_result is not null then return v_result; end if;
  update public.restaurants set accepting_orders=p_accepting where id=v_restaurant and lifecycle_status='active';
  perform private.write_audit(v_actor,'restaurant.accepting_orders_changed','restaurant',v_restaurant,
    jsonb_build_object('operation_id',p_operation_id,'accepting',p_accepting));
  v_result:=jsonb_build_object('restaurantId',v_restaurant,'acceptingOrders',p_accepting);
  perform private.phase5_operation(p_operation_id,'accepting_orders',v_digest,v_result); return v_result;
end $$;

create function public.restaurant_get_menu_v2()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant text:=private.current_restaurant_id();
begin
  perform private.require_active_restaurant();
  return jsonb_build_object('restaurantId',v_restaurant,
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.id) from public.categories c where c.restaurant_id=v_restaurant),'[]'),
    'items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.id) from public.menu_items m where m.restaurant_id=v_restaurant),'[]'),
    'ingredients',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from public.menu_item_ingredients i where i.restaurant_id=v_restaurant),'[]'),
    'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order,g.id) from public.menu_option_groups g where g.restaurant_id=v_restaurant),'[]'),
    'options',coalesce((select jsonb_agg(to_jsonb(o) order by o.sort_order,o.id) from public.menu_option_values o where o.restaurant_id=v_restaurant),'[]'));
end $$;

create function public.restaurant_bulk_set_item_availability_v1(
  p_item_ids text[],p_active boolean,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_digest text; v_result jsonb; v_count integer;
begin
  if cardinality(p_item_ids)<1 or cardinality(p_item_ids)>200 or cardinality(p_item_ids)<>(select count(distinct x) from unnest(p_item_ids)x) then
    raise exception 'Unique item IDs required' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_item_ids)x left join public.menu_items m on m.id=x and m.restaurant_id=v_restaurant where m.id is null) then
    raise exception 'Menu item outside Restaurant scope' using errcode='42501'; end if;
  v_digest:=encode(extensions.digest(array_to_string(p_item_ids,',')||':'||p_active,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'menu_bulk_availability',v_digest); if v_result is not null then return v_result; end if;
  update public.menu_items set is_active=p_active,definition_revision=definition_revision+1 where id=any(p_item_ids) and restaurant_id=v_restaurant;
  get diagnostics v_count=row_count;
  perform private.write_audit(v_actor,'restaurant.menu_bulk_availability','restaurant',v_restaurant,
    jsonb_build_object('operation_id',p_operation_id,'count',v_count,'active',p_active));
  v_result:=jsonb_build_object('updated',v_count,'active',p_active);
  perform private.phase5_operation(p_operation_id,'menu_bulk_availability',v_digest,v_result); return v_result;
end $$;

create function public.restaurant_list_reviews_v1(p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant text:=private.current_restaurant_id();
begin
  perform private.require_active_restaurant();
  return jsonb_build_object(
    'productReviews',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)from(
      select r.id,r.menu_item_id,r.user_name_snapshot,r.menu_item_name_snapshot,r.rating,r.comment,r.status,r.reply,r.replied_at,r.created_at,r.updated_at
      from public.product_reviews r where r.restaurant_id=v_restaurant order by r.created_at desc limit least(greatest(coalesce(p_limit,30),1),100))x),'[]'),
    'orderReviews',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)from(
      select r.id,r.user_name_snapshot,r.restaurant_name_snapshot,r.speed_rating,r.taste_rating,r.value_rating,
        r.price_performance_rating,r.average_rating,r.comment,r.items_snapshot,r.status,r.created_at,r.updated_at
      from public.order_reviews r where r.restaurant_id=v_restaurant order by r.created_at desc limit least(greatest(coalesce(p_limit,30),1),100))x),'[]'));
end $$;

create function public.restaurant_register_web_push_v1(
  p_token text,p_device_id text,p_language text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_hash text; v_id text; v_digest text; v_result jsonb;
begin
  if btrim(coalesce(p_token,''))='' or length(p_token)>4096 or btrim(coalesce(p_device_id,''))=''
    or length(p_device_id)>200 or p_language not in ('en','tr') then raise exception 'Invalid web push registration' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex'); v_id:=gen_random_uuid()::text;
  v_digest:=encode(extensions.digest(v_hash||':'||p_device_id||':'||p_language,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'push_register',v_digest); if v_result is not null then return v_result; end if;
  update private.push_tokens set is_active=false,revoked_at=statement_timestamp()
    where restaurant_id=v_restaurant and app='restaurant' and device_id=p_device_id and token_hash<>v_hash;
  insert into private.push_tokens(id,restaurant_id,registered_by_profile_id,token,token_hash,platform,provider,app,is_active,revoked_at,last_registered_at,device_id,preferred_language)
    values(v_id,v_restaurant,v_actor,p_token,v_hash,'web','fcm','restaurant',true,null,statement_timestamp(),p_device_id,p_language)
  on conflict(token_hash) do update set restaurant_id=excluded.restaurant_id,registered_by_profile_id=excluded.registered_by_profile_id,
    token=excluded.token,is_active=true,revoked_at=null,last_registered_at=statement_timestamp(),device_id=excluded.device_id,preferred_language=excluded.preferred_language
  returning id into v_id;
  v_result:=jsonb_build_object('subscriptionId',v_id,'registered',true);
  perform private.phase5_operation(p_operation_id,'push_register',v_digest,v_result); return v_result;
end $$;

-- Import legacy flat customizations into one optional v2 modifier group per item.
with source as (
  select m.id menu_item_id,m.restaurant_id,jsonb_array_length(m.customizations) option_count
  from public.menu_items m where jsonb_array_length(m.customizations)>0
), groups as (
  insert into public.menu_option_groups(id,restaurant_id,menu_item_id,name,kind,minimum_selections,maximum_selections)
  select 'legacy-'||menu_item_id,restaurant_id,menu_item_id,'Options','modifier',0,option_count from source
  on conflict(id) do nothing returning id,restaurant_id,menu_item_id
)
insert into public.menu_option_values(id,restaurant_id,group_id,name,price_delta_kurus,sort_order)
select 'legacy-'||m.id||'-'||(o.value->>'id'),m.restaurant_id,'legacy-'||m.id,
  o.value->>'name',(o.value->>'price_kurus')::bigint,o.ordinality-1
from public.menu_items m cross join lateral jsonb_array_elements(m.customizations) with ordinality o(value,ordinality)
where jsonb_array_length(m.customizations)>0 on conflict(id) do nothing;

-- Canonical topic authorization; legacy topics/policies remain available to old clients.
create function private.can_subscribe_restaurant_v1_topic(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_topic='restaurant-orders:v1:'||a.restaurant_id
  from private.account_access a join public.restaurants r on r.id=a.restaurant_id
  where a.profile_id=private.canonical_profile_id() and a.account_type='restaurant'
    and a.status='active' and a.onboarding_step='none' and r.lifecycle_status='active'
$$;

create or replace function private.broadcast_order_invalidation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_new public.orders%rowtype; v_old public.orders%rowtype; v_topic text;
  v_topics text[]:=array['orders:admin']; v_order_id text; v_version timestamptz;
begin
  if tg_op<>'DELETE' then v_new:=new; end if; if tg_op<>'INSERT' then v_old:=old; end if;
  v_order_id:=coalesce(v_new.id,v_old.id); v_version:=coalesce(v_new.updated_at,v_old.updated_at,statement_timestamp());
  if v_new.profile_id is not null then v_topics:=array_append(v_topics,'orders:profile:'||v_new.profile_id); end if;
  if v_old.profile_id is not null then v_topics:=array_append(v_topics,'orders:profile:'||v_old.profile_id); end if;
  if v_new.restaurant_id is not null then
    v_topics:=array_append(v_topics,'orders:restaurant:'||v_new.restaurant_id);
    v_topics:=array_append(v_topics,'restaurant-orders:v1:'||v_new.restaurant_id);
  end if;
  if v_old.restaurant_id is not null then
    v_topics:=array_append(v_topics,'orders:restaurant:'||v_old.restaurant_id);
    v_topics:=array_append(v_topics,'restaurant-orders:v1:'||v_old.restaurant_id);
  end if;
  if v_new.courier_profile_id is not null then v_topics:=array_append(v_topics,'orders:courier:'||v_new.courier_profile_id);end if;
  if v_old.courier_profile_id is not null then v_topics:=array_append(v_topics,'orders:courier:'||v_old.courier_profile_id);end if;
  if v_new.status='ready'::public.order_status and v_new.courier_profile_id is null then
    v_topics:=array_append(v_topics,'orders:courier-queue:'||v_new.restaurant_id);end if;
  if v_old.status='ready'::public.order_status and v_old.courier_profile_id is null then
    v_topics:=array_append(v_topics,'orders:courier-queue:'||v_old.restaurant_id);end if;
  for v_topic in select distinct value from unnest(v_topics)value where value is not null loop
    perform private.send_order_realtime_invalidation(v_topic,jsonb_build_object('order_id',v_order_id,
      'operation',lower(tg_op),'version',to_char(v_version at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
exception when others then
  raise warning 'Phase 5 order invalidation skipped';
  if tg_op='DELETE' then return old; end if; return new;
end $$;

grant create on schema private,public to hungrie_api_owner;
alter function private.phase5_restaurant_scope() owner to hungrie_api_owner;
alter function private.phase5_operation(uuid,text,text,jsonb) owner to hungrie_api_owner;
alter function private.can_subscribe_restaurant_v1_topic(text) owner to hungrie_api_owner;
alter function private.broadcast_order_invalidation() owner to hungrie_api_owner;
alter function public.restaurant_get_dashboard_v1() owner to hungrie_api_owner;
alter function public.restaurant_list_orders_v1(text,text,integer) owner to hungrie_api_owner;
alter function public.restaurant_get_order_v1(text) owner to hungrie_api_owner;
alter function public.restaurant_acknowledge_order_seen_v1(text,timestamptz,uuid) owner to hungrie_api_owner;
alter function public.restaurant_transition_order_v1(text,timestamptz,text,text,text,uuid) owner to hungrie_api_owner;
alter function public.restaurant_get_settings_v1() owner to hungrie_api_owner;
alter function public.restaurant_update_settings_v1(jsonb,uuid) owner to hungrie_api_owner;
alter function public.restaurant_set_accepting_orders_v1(boolean,uuid) owner to hungrie_api_owner;
alter function public.restaurant_get_menu_v2() owner to hungrie_api_owner;
alter function public.restaurant_bulk_set_item_availability_v1(text[],boolean,uuid) owner to hungrie_api_owner;
alter function public.restaurant_list_reviews_v1(integer) owner to hungrie_api_owner;
alter function public.restaurant_register_web_push_v1(text,text,text,uuid) owner to hungrie_api_owner;
revoke create on schema private,public from hungrie_api_owner;

revoke all on function private.phase5_restaurant_scope(),private.phase5_operation(uuid,text,text,jsonb),
  private.can_subscribe_restaurant_v1_topic(text) from public,anon,authenticated,service_role;
grant execute on function private.phase5_restaurant_scope(),private.phase5_operation(uuid,text,text,jsonb),
  private.can_subscribe_restaurant_v1_topic(text) to hungrie_api_owner;
grant execute on function private.send_order_realtime_invalidation(text,jsonb) to hungrie_api_owner;
grant execute on function private.can_subscribe_restaurant_v1_topic(text) to authenticated;
grant execute on function public.restaurant_get_dashboard_v1(),public.restaurant_list_orders_v1(text,text,integer),
  public.restaurant_get_order_v1(text),public.restaurant_acknowledge_order_seen_v1(text,timestamptz,uuid),
  public.restaurant_transition_order_v1(text,timestamptz,text,text,text,uuid),public.restaurant_get_settings_v1(),
  public.restaurant_update_settings_v1(jsonb,uuid),public.restaurant_set_accepting_orders_v1(boolean,uuid),
  public.restaurant_get_menu_v2(),public.restaurant_bulk_set_item_availability_v1(text[],boolean,uuid),
  public.restaurant_list_reviews_v1(integer),public.restaurant_register_web_push_v1(text,text,text,uuid)
  to authenticated;

grant select,insert,update,delete on public.menu_item_ingredients,public.menu_option_groups,public.menu_option_values,
  private.restaurant_order_visibility,private.restaurant_operations to hungrie_api_owner;
grant select,update,insert on private.push_tokens to hungrie_api_owner;
