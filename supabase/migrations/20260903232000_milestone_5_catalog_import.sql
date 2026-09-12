alter table public.restaurants
  add column sort_order integer not null default 0 check (sort_order >= 0);

grant select (sort_order) on public.restaurants to anon, authenticated;

create or replace view public.active_restaurants
with (security_invoker = true, security_barrier = true)
as
select
  id, name, description, cuisine, image_url,
  delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
  minimum_order_kurus, opening_hours, preferred_language,
  rating_average, rating_count, created_at, updated_at, sort_order
from public.restaurants
where is_active;

create table migration.catalog_restaurants_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  cuisine text not null default '',
  address text not null default '',
  phone text,
  image_url text,
  is_active boolean not null,
  delivery_eta_min_minutes integer check (delivery_eta_min_minutes is null or delivery_eta_min_minutes >= 0),
  delivery_eta_max_minutes integer check (delivery_eta_max_minutes is null or delivery_eta_max_minutes >= 0),
  delivery_fee_kurus bigint not null check (delivery_fee_kurus >= 0),
  minimum_order_kurus bigint not null check (minimum_order_kurus >= 0),
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  preferred_language text not null default 'tr' check (preferred_language in ('en', 'tr')),
  sort_order integer not null check (sort_order >= 0),
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  constraint catalog_restaurants_stage_eta_range check (
    delivery_eta_min_minutes is null
    or delivery_eta_max_minutes is null
    or delivery_eta_max_minutes >= delivery_eta_min_minutes
  )
);

create table migration.catalog_categories_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  icon text,
  is_active boolean not null,
  sort_order integer not null check (sort_order >= 0),
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  foreign key (run_id, restaurant_id)
    references migration.catalog_restaurants_stage(run_id, id)
    on delete restrict
);

create table migration.catalog_menu_items_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  category_id text not null check (btrim(category_id) <> ''),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  image_url text,
  price_kurus bigint not null check (price_kurus >= 0),
  is_active boolean not null,
  sort_order integer not null check (sort_order >= 0),
  eta_minutes integer check (eta_minutes is null or eta_minutes >= 0),
  calories integer check (calories is null or calories >= 0),
  protein_grams numeric(8, 2) check (protein_grams is null or protein_grams >= 0),
  customizations jsonb not null default '[]'::jsonb check (jsonb_typeof(customizations) = 'array'),
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  foreign key (run_id, restaurant_id)
    references migration.catalog_restaurants_stage(run_id, id)
    on delete restrict,
  foreign key (run_id, category_id)
    references migration.catalog_categories_stage(run_id, id)
    on delete restrict
);

create index catalog_categories_stage_run_restaurant_idx
  on migration.catalog_categories_stage(run_id, restaurant_id, sort_order, id);
create index catalog_menu_items_stage_run_restaurant_idx
  on migration.catalog_menu_items_stage(run_id, restaurant_id, category_id, sort_order, id);

revoke all on migration.catalog_restaurants_stage from public, anon, authenticated;
revoke all on migration.catalog_categories_stage from public, anon, authenticated;
revoke all on migration.catalog_menu_items_stage from public, anon, authenticated;

create or replace function migration.promote_catalog_import(p_run_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rejections bigint;
  v_restaurants bigint;
  v_categories bigint;
  v_menu_items bigint;
  v_result jsonb;
begin
  perform 1
  from migration.import_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'Unknown catalog import run';
  end if;

  select count(*) into v_rejections
  from migration.import_rejections
  where run_id = p_run_id;

  if v_rejections > 0 then
    raise exception 'Catalog promotion blocked by % rejected record(s)', v_rejections;
  end if;

  select count(*) into v_restaurants from migration.catalog_restaurants_stage where run_id = p_run_id;
  select count(*) into v_categories from migration.catalog_categories_stage where run_id = p_run_id;
  select count(*) into v_menu_items from migration.catalog_menu_items_stage where run_id = p_run_id;

  if v_restaurants = 0 or v_categories = 0 or v_menu_items = 0 then
    raise exception 'Catalog promotion requires non-empty restaurant, category, and menu stages';
  end if;

  update migration.import_runs
  set status = 'running',
      started_at = coalesce(started_at, statement_timestamp()),
      completed_at = null
  where id = p_run_id;

  insert into public.restaurants (
    id, name, description, cuisine, address, phone, image_url, is_active,
    delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
    minimum_order_kurus, opening_hours, preferred_language, sort_order
  )
  select
    id, name, description, cuisine, address, phone, image_url, is_active,
    delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
    minimum_order_kurus, opening_hours, preferred_language, sort_order
  from migration.catalog_restaurants_stage
  where run_id = p_run_id
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    cuisine = excluded.cuisine,
    address = excluded.address,
    phone = excluded.phone,
    image_url = excluded.image_url,
    is_active = excluded.is_active,
    delivery_eta_min_minutes = excluded.delivery_eta_min_minutes,
    delivery_eta_max_minutes = excluded.delivery_eta_max_minutes,
    delivery_fee_kurus = excluded.delivery_fee_kurus,
    minimum_order_kurus = excluded.minimum_order_kurus,
    opening_hours = excluded.opening_hours,
    preferred_language = excluded.preferred_language,
    sort_order = excluded.sort_order;

  insert into public.categories (
    id, restaurant_id, name, description, icon, is_active, sort_order
  )
  select id, restaurant_id, name, description, icon, is_active, sort_order
  from migration.catalog_categories_stage
  where run_id = p_run_id
  on conflict (id) do update set
    restaurant_id = excluded.restaurant_id,
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

  insert into public.menu_items (
    id, restaurant_id, category_id, name, description, image_url,
    price_kurus, is_active, sort_order, eta_minutes, calories,
    protein_grams, customizations
  )
  select
    id, restaurant_id, category_id, name, description, image_url,
    price_kurus, is_active, sort_order, eta_minutes, calories,
    protein_grams, customizations
  from migration.catalog_menu_items_stage
  where run_id = p_run_id
  on conflict (id) do update set
    restaurant_id = excluded.restaurant_id,
    category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    image_url = excluded.image_url,
    price_kurus = excluded.price_kurus,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    eta_minutes = excluded.eta_minutes,
    calories = excluded.calories,
    protein_grams = excluded.protein_grams,
    customizations = excluded.customizations;

  update public.menu_items
  set is_active = false
  where not exists (
    select 1 from migration.catalog_menu_items_stage staged
    where staged.run_id = p_run_id and staged.id = public.menu_items.id
  );

  update public.categories
  set is_active = false
  where not exists (
    select 1 from migration.catalog_categories_stage staged
    where staged.run_id = p_run_id and staged.id = public.categories.id
  );

  update public.restaurants
  set is_active = false
  where not exists (
    select 1 from migration.catalog_restaurants_stage staged
    where staged.run_id = p_run_id and staged.id = public.restaurants.id
  );

  v_result := jsonb_build_object(
    'restaurants', v_restaurants,
    'categories', v_categories,
    'menu_items', v_menu_items,
    'rejections', v_rejections
  );

  update migration.import_runs
  set status = 'completed',
      counts = counts || jsonb_build_object('catalog', v_result),
      completed_at = statement_timestamp()
  where id = p_run_id;

  return v_result;
exception
  when others then
    update migration.import_runs
    set status = 'failed', completed_at = statement_timestamp()
    where id = p_run_id;
    raise;
end;
$$;

revoke all on function migration.promote_catalog_import(uuid) from public, anon, authenticated;

comment on function migration.promote_catalog_import(uuid) is
  'Administrative Milestone 5 catalog promotion. It is not exposed to mobile roles.';
