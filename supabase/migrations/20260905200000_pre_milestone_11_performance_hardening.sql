-- Pre-Milestone 11 performance hardening: batched order reads and curated
-- server-side catalog queries. These functions preserve the authorization and
-- contact-masking rules introduced in Milestone 3.

grant usage, create on schema public, private to hungrie_api_owner;

create or replace function private.encode_order_cursor(p_created_at timestamptz, p_id text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(convert_to(to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || chr(31) || p_id, 'UTF8'), 'base64')
$$;

create or replace function private.decode_order_cursor(p_cursor text)
returns table(created_at timestamptz, id text)
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_value text;
  v_parts text[];
begin
  begin
    v_value := convert_from(decode(p_cursor, 'base64'), 'UTF8');
    v_parts := string_to_array(v_value, chr(31));
    if cardinality(v_parts) <> 2 or btrim(v_parts[2]) = '' then
      raise exception 'invalid cursor';
    end if;
    created_at := (v_parts[1] || 'Z')::timestamptz;
    id := v_parts[2];
    return next;
  exception when others then
    raise exception 'Invalid order cursor' using errcode = '22023';
  end;
end
$$;

create or replace function private.order_items_json(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'menu_item_id', coalesce(i.menu_item_id, i.source_menu_item_id),
    'source_menu_item_id', i.source_menu_item_id,
    'name', i.name_snapshot,
    'image_url', i.image_url_snapshot,
    'unit_price_kurus', i.unit_price_kurus,
    'customization_total_kurus', i.customization_total_kurus,
    'quantity', i.quantity,
    'customizations', i.customizations_snapshot
  ) order by i.created_at, i.id), '[]'::jsonb)
  from public.order_items i
  where i.order_id = p_order_id
$$;

create or replace function private.order_api_json(p_order_id text, p_include_items boolean default true)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id,
    'restaurant_id', o.restaurant_id,
    'status', o.status,
    'payment_method', o.payment_method,
    'subtotal_kurus', o.subtotal_kurus,
    'delivery_fee_kurus', o.delivery_fee_kurus,
    'service_fee_kurus', o.service_fee_kurus,
    'discount_kurus', o.discount_kurus,
    'tip_kurus', o.tip_kurus,
    'total_kurus', o.total_kurus,
    'eta_minutes', o.eta_minutes,
    'approval_deadline_at', o.approval_deadline_at,
    'reminder_pending', o.reminder_pending,
    'reminder_requested_at', o.reminder_requested_at,
    'preparing_at', o.preparing_at,
    'ready_at', o.ready_at,
    'out_for_delivery_at', o.out_for_delivery_at,
    'delivered_at', o.delivered_at,
    'canceled_at', o.canceled_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'customer_name', private.authorized_order_contact(o.id) ->> 'customer_name',
    'customer_email', private.authorized_order_contact(o.id) ->> 'customer_email',
    'customer_whatsapp', private.authorized_order_contact(o.id) ->> 'customer_whatsapp',
    'delivery_address_snapshot', private.authorized_order_contact(o.id) -> 'delivery_address_snapshot',
    'items', case when p_include_items then private.order_items_json(o.id) else null end
  ))
  from public.orders o
  where o.id = p_order_id
$$;

create or replace function private.order_page_result(p_ids text[], p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select u.id, u.ordinality
    from unnest(coalesce(p_ids, array[]::text[])) with ordinality u(id, ordinality)
    where u.ordinality <= p_limit
  ), page_rows as (
    select s.ordinality, o.created_at, o.id, private.order_api_json(o.id, true) as value
    from selected s join public.orders o on o.id = s.id
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb),
    'has_more', cardinality(coalesce(p_ids, array[]::text[])) > p_limit,
    'next_cursor', case
      when cardinality(coalesce(p_ids, array[]::text[])) > p_limit
      then (select private.encode_order_cursor(created_at, id) from page_rows order by ordinality desc limit 1)
      else null
    end
  ) from page_rows
$$;

create or replace function public.get_my_orders_page(
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_created_at timestamptz;
  v_id text;
  v_ids text[];
begin
  if p_cursor is not null then
    select d.created_at, d.id into v_created_at, v_id from private.decode_order_cursor(p_cursor) d;
  end if;
  select array_agg(x.id order by x.created_at desc, x.id desc) into v_ids
  from (
    select o.id, o.created_at
    from public.orders o
    where o.profile_id = v_actor
      and (p_cursor is null or (o.created_at, o.id) < (v_created_at, v_id))
    order by o.created_at desc, o.id desc
    limit v_limit + 1
  ) x;
  return private.order_page_result(v_ids, v_limit);
end
$$;

create or replace function public.get_restaurant_orders_page(
  p_restaurant_id text,
  p_statuses public.order_status[] default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_created_at timestamptz;
  v_id text;
  v_ids text[];
begin
  perform private.require_profile();
  if not (private.is_restaurant_member(p_restaurant_id) or private.is_admin()) then
    raise exception 'Restaurant membership required' using errcode = '42501';
  end if;
  if p_cursor is not null then
    select d.created_at, d.id into v_created_at, v_id from private.decode_order_cursor(p_cursor) d;
  end if;
  select array_agg(x.id order by x.created_at desc, x.id desc) into v_ids
  from (
    select o.id, o.created_at
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and (p_statuses is null or o.status = any(p_statuses))
      and (p_cursor is null or (o.created_at, o.id) < (v_created_at, v_id))
    order by o.created_at desc, o.id desc
    limit v_limit + 1
  ) x;
  return private.order_page_result(v_ids, v_limit);
end
$$;

create or replace function public.get_admin_orders_page(
  p_restaurant_id text default null,
  p_statuses public.order_status[] default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_created_at timestamptz;
  v_id text;
  v_ids text[];
begin
  perform private.require_profile();
  if not private.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  if p_cursor is not null then
    select d.created_at, d.id into v_created_at, v_id from private.decode_order_cursor(p_cursor) d;
  end if;
  select array_agg(x.id order by x.created_at desc, x.id desc) into v_ids
  from (
    select o.id, o.created_at
    from public.orders o
    where (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
      and (p_statuses is null or o.status = any(p_statuses))
      and (p_cursor is null or (o.created_at, o.id) < (v_created_at, v_id))
    order by o.created_at desc, o.id desc
    limit v_limit + 1
  ) x;
  return private.order_page_result(v_ids, v_limit);
end
$$;

create or replace function public.get_authorized_order(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_profile();
  if not (private.can_access_order(p_order_id) or private.is_order_available_to_courier(p_order_id)) then
    raise exception 'Order access required' using errcode = '42501';
  end if;
  return private.order_api_json(p_order_id, not private.is_order_available_to_courier(p_order_id));
end
$$;

create or replace function public.get_my_active_order_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.order_api_json(o.id, false)
    from public.orders o
    where o.profile_id = private.require_profile()
      and o.status in ('pending', 'preparing', 'ready', 'out_for_delivery')
    order by o.created_at desc, o.id desc limit 1
  ), 'null'::jsonb)
$$;

create or replace function public.get_my_latest_order_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.order_api_json(o.id, true)
    from public.orders o
    where o.profile_id = private.require_profile()
    order by o.created_at desc, o.id desc limit 1
  ), 'null'::jsonb)
$$;

create or replace function public.get_featured_catalog_items(p_limit integer default 6)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.restaurant_sort, x.item_sort, x.id), '[]'::jsonb)
  from (
    select m.id, m.restaurant_id, m.category_id, m.name, m.description, m.image_url,
      m.price_kurus, m.sort_order as item_sort, m.eta_minutes, m.calories, m.protein_grams,
      m.rating_average, m.rating_count, m.customizations, r.sort_order as restaurant_sort
    from public.active_menu_items m
    join public.active_restaurants r on r.id = m.restaurant_id
    order by r.sort_order, m.sort_order, m.id
    limit least(greatest(coalesce(p_limit, 6), 1), 24)
  ) x
$$;

create or replace function public.search_active_catalog(
  p_query text default null,
  p_category text default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matching as (
    select m.id, m.restaurant_id, m.category_id, m.name, m.description, m.image_url,
      m.price_kurus, m.sort_order, m.eta_minutes, m.calories, m.protein_grams,
      m.rating_average, m.rating_count, m.customizations,
      r.name as restaurant_name, r.image_url as restaurant_image,
      r.rating_average as restaurant_rating, r.rating_count as restaurant_rating_count,
      c.name as category_name
    from public.active_menu_items m
    join public.active_restaurants r on r.id = m.restaurant_id
    join public.active_categories c on c.id = m.category_id and c.restaurant_id = m.restaurant_id
    where (nullif(btrim(coalesce(p_query, '')), '') is null
      or m.name ilike '%' || btrim(p_query) || '%'
      or m.description ilike '%' || btrim(p_query) || '%'
      or r.name ilike '%' || btrim(p_query) || '%')
      and (nullif(btrim(coalesce(p_category, '')), '') is null
        or lower(c.id) = lower(btrim(p_category))
        or lower(c.name) = lower(btrim(p_category)))
  ), page_rows as (
    select * from matching order by restaurant_name, sort_order, name, id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 20), 1), 100) + 1
  ), visible as (
    select * from page_rows limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(v) order by v.restaurant_name, v.sort_order, v.name, v.id) from visible v), '[]'::jsonb),
    'has_more', (select count(*) from page_rows) > least(greatest(coalesce(p_limit, 20), 1), 100),
    'next_offset', case when (select count(*) from page_rows) > least(greatest(coalesce(p_limit, 20), 1), 100)
      then greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 20), 1), 100) else null end
  )
$$;

create or replace function public.get_active_restaurant_bundle(p_restaurant_id text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when r.id is null then null else jsonb_build_object(
    'restaurant', to_jsonb(r),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order, c.id)
      from public.active_categories c where c.restaurant_id = r.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order, m.id)
      from public.active_menu_items m where m.restaurant_id = r.id), '[]'::jsonb)
  ) end
  from public.active_restaurants r where r.id = p_restaurant_id
$$;

create index if not exists orders_profile_created_cursor_idx
  on public.orders(profile_id, created_at desc, id desc);
create index if not exists orders_restaurant_status_created_cursor_idx
  on public.orders(restaurant_id, status, created_at desc, id desc);

revoke all on function private.encode_order_cursor(timestamptz, text), private.decode_order_cursor(text),
  private.order_items_json(text), private.order_api_json(text, boolean), private.order_page_result(text[], integer)
  from public, anon, authenticated;
grant execute on function private.encode_order_cursor(timestamptz, text), private.decode_order_cursor(text),
  private.order_items_json(text), private.order_api_json(text, boolean), private.order_page_result(text[], integer)
  to hungrie_api_owner;

revoke all on function public.get_my_orders_page(text, integer),
  public.get_restaurant_orders_page(text, public.order_status[], text, integer),
  public.get_admin_orders_page(text, public.order_status[], text, integer),
  public.get_authorized_order(text), public.get_my_active_order_summary(), public.get_my_latest_order_summary()
  from public, anon;
grant execute on function public.get_my_orders_page(text, integer),
  public.get_restaurant_orders_page(text, public.order_status[], text, integer),
  public.get_admin_orders_page(text, public.order_status[], text, integer),
  public.get_authorized_order(text), public.get_my_active_order_summary(), public.get_my_latest_order_summary()
  to authenticated;

revoke all on function public.get_featured_catalog_items(integer),
  public.search_active_catalog(text, text, integer, integer), public.get_active_restaurant_bundle(text) from public;
grant execute on function public.get_featured_catalog_items(integer),
  public.search_active_catalog(text, text, integer, integer), public.get_active_restaurant_bundle(text) to anon, authenticated;

alter function private.encode_order_cursor(timestamptz, text) owner to hungrie_api_owner;
alter function private.decode_order_cursor(text) owner to hungrie_api_owner;
alter function private.order_items_json(text) owner to hungrie_api_owner;
alter function private.order_api_json(text, boolean) owner to hungrie_api_owner;
alter function private.order_page_result(text[], integer) owner to hungrie_api_owner;
alter function public.get_my_orders_page(text, integer) owner to hungrie_api_owner;
alter function public.get_restaurant_orders_page(text, public.order_status[], text, integer) owner to hungrie_api_owner;
alter function public.get_admin_orders_page(text, public.order_status[], text, integer) owner to hungrie_api_owner;
alter function public.get_authorized_order(text) owner to hungrie_api_owner;
alter function public.get_my_active_order_summary() owner to hungrie_api_owner;
alter function public.get_my_latest_order_summary() owner to hungrie_api_owner;

revoke create on schema public, private from hungrie_api_owner;
