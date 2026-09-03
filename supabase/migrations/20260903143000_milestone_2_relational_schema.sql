create schema if not exists private;
create schema if not exists migration;

revoke all on schema private from public, anon, authenticated;
revoke all on schema migration from public, anon, authenticated;

create type public.order_status as enum (
  'pending',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'canceled'
);
create type public.payment_method as enum ('cash', 'pos');
create type public.review_status as enum ('published', 'hidden');
create type public.platform_role as enum ('admin', 'super_admin', 'courier');
create type public.restaurant_role as enum ('owner', 'manager');
create type public.notification_platform as enum ('ios', 'android', 'web', 'unknown');
create type public.notification_provider as enum ('apns', 'fcm', 'web', 'unknown');
create type migration.import_status as enum ('pending', 'running', 'completed', 'failed');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id text primary key check (btrim(id) <> ''),
  firebase_uid text unique check (firebase_uid is null or btrim(firebase_uid) <> ''),
  supabase_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (btrim(name) <> ''),
  email text not null check (btrim(email) <> ''),
  avatar_url text,
  whatsapp_number text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'tr')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.restaurants (
  id text primary key check (btrim(id) <> ''),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  cuisine text not null default '',
  address text not null default '',
  phone text,
  image_url text,
  is_active boolean not null default true,
  delivery_eta_min_minutes integer check (delivery_eta_min_minutes is null or delivery_eta_min_minutes >= 0),
  delivery_eta_max_minutes integer check (delivery_eta_max_minutes is null or delivery_eta_max_minutes >= 0),
  delivery_fee_kurus bigint not null default 0 check (delivery_fee_kurus >= 0),
  minimum_order_kurus bigint not null default 0 check (minimum_order_kurus >= 0),
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  preferred_language text not null default 'tr' check (preferred_language in ('en', 'tr')),
  rating_average numeric(3, 2) not null default 0 check (rating_average between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint restaurants_eta_range check (
    delivery_eta_min_minutes is null
    or delivery_eta_max_minutes is null
    or delivery_eta_max_minutes >= delivery_eta_min_minutes
  )
);

create table public.categories (
  id text primary key check (btrim(id) <> ''),
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  icon text,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, restaurant_id)
);

create table public.menu_items (
  id text primary key check (btrim(id) <> ''),
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  category_id text not null,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  image_url text,
  price_kurus bigint not null check (price_kurus >= 0),
  cost_kurus bigint check (cost_kurus is null or cost_kurus >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  eta_minutes integer check (eta_minutes is null or eta_minutes >= 0),
  calories integer check (calories is null or calories >= 0),
  protein_grams numeric(8, 2) check (protein_grams is null or protein_grams >= 0),
  rating_average numeric(3, 2) not null default 0 check (rating_average between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  customizations jsonb not null default '[]'::jsonb check (jsonb_typeof(customizations) = 'array'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, restaurant_id),
  foreign key (category_id, restaurant_id)
    references public.categories(id, restaurant_id)
    on delete restrict
);

create table public.addresses (
  id text primary key check (btrim(id) <> ''),
  profile_id text not null references public.profiles(id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  line1 text not null check (btrim(line1) <> ''),
  block text,
  room text,
  city text not null check (btrim(city) <> ''),
  country text not null check (btrim(country) <> ''),
  is_default boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create unique index addresses_one_default_per_profile_idx
  on public.addresses(profile_id)
  where is_default;

create table public.favorites (
  profile_id text not null references public.profiles(id) on delete cascade,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (profile_id, restaurant_id)
);

create table public.orders (
  id text primary key check (btrim(id) <> ''),
  profile_id text not null references public.profiles(id) on delete restrict,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  courier_profile_id text references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending',
  payment_method public.payment_method not null,
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_email text,
  customer_whatsapp text,
  delivery_address_snapshot jsonb not null check (jsonb_typeof(delivery_address_snapshot) = 'object'),
  notes text not null default '',
  subtotal_kurus bigint not null check (subtotal_kurus >= 0),
  delivery_fee_kurus bigint not null default 0 check (delivery_fee_kurus >= 0),
  service_fee_kurus bigint not null default 0 check (service_fee_kurus >= 0),
  discount_kurus bigint not null default 0 check (discount_kurus >= 0),
  tip_kurus bigint not null default 0 check (tip_kurus >= 0),
  total_kurus bigint not null check (total_kurus >= 0),
  eta_minutes integer check (eta_minutes is null or eta_minutes >= 0),
  approval_deadline_at timestamptz,
  reminder_pending boolean not null default false,
  reminder_requested_at timestamptz,
  reminder_requested_by text references public.profiles(id) on delete set null,
  reminder_source text,
  preparing_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, restaurant_id, profile_id),
  constraint orders_total_equation check (
    subtotal_kurus + delivery_fee_kurus + service_fee_kurus + tip_kurus - discount_kurus = total_kurus
  )
);

create table public.order_items (
  id text primary key check (btrim(id) <> ''),
  order_id text not null references public.orders(id) on delete restrict,
  menu_item_id text references public.menu_items(id) on delete set null,
  name_snapshot text not null check (btrim(name_snapshot) <> ''),
  image_url_snapshot text,
  unit_price_kurus bigint not null check (unit_price_kurus >= 0),
  customization_total_kurus bigint not null default 0 check (customization_total_kurus >= 0),
  quantity integer not null check (quantity > 0),
  customizations_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(customizations_snapshot) = 'array'),
  created_at timestamptz not null default statement_timestamp()
);

create table public.product_reviews (
  id text primary key check (btrim(id) <> ''),
  review_key text not null unique check (btrim(review_key) <> ''),
  order_id text not null,
  restaurant_id text not null,
  menu_item_id text not null,
  profile_id text not null,
  user_name_snapshot text not null check (btrim(user_name_snapshot) <> ''),
  menu_item_name_snapshot text not null check (btrim(menu_item_name_snapshot) <> ''),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  status public.review_status not null default 'published',
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (order_id, menu_item_id, profile_id),
  foreign key (order_id, restaurant_id, profile_id)
    references public.orders(id, restaurant_id, profile_id)
    on delete restrict,
  foreign key (menu_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id)
    on delete restrict
);

create table public.order_reviews (
  id text primary key check (btrim(id) <> ''),
  review_key text not null unique check (btrim(review_key) <> ''),
  order_id text not null,
  restaurant_id text not null,
  profile_id text not null,
  user_name_snapshot text not null check (btrim(user_name_snapshot) <> ''),
  restaurant_name_snapshot text not null check (btrim(restaurant_name_snapshot) <> ''),
  speed_rating smallint not null check (speed_rating between 1 and 5),
  taste_rating smallint not null check (taste_rating between 1 and 5),
  value_rating smallint not null check (value_rating between 1 and 5),
  price_performance_rating smallint check (price_performance_rating is null or price_performance_rating between 1 and 5),
  average_rating numeric(3, 2) generated always as (
    round((speed_rating + taste_rating + value_rating)::numeric / 3, 2)
  ) stored,
  comment text not null default '',
  items_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(items_snapshot) = 'array'),
  status public.review_status not null default 'published',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (order_id, profile_id),
  foreign key (order_id, restaurant_id, profile_id)
    references public.orders(id, restaurant_id, profile_id)
    on delete restrict
);

create table private.user_roles (
  profile_id text not null references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (profile_id, role)
);

create table private.restaurant_members (
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  profile_id text not null references public.profiles(id) on delete restrict,
  role public.restaurant_role not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (restaurant_id, profile_id)
);

create table private.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete restrict,
  previous_status public.order_status,
  new_status public.order_status not null,
  changed_by_profile_id text references public.profiles(id) on delete set null,
  source text not null default 'system' check (btrim(source) <> ''),
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  constraint order_status_history_actual_change check (
    previous_status is null or previous_status <> new_status
  )
);

create table private.push_tokens (
  id text primary key check (btrim(id) <> ''),
  profile_id text references public.profiles(id) on delete cascade,
  restaurant_id text references public.restaurants(id) on delete cascade,
  token text not null check (btrim(token) <> ''),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  platform public.notification_platform not null,
  provider public.notification_provider not null,
  app text not null default 'hungrie' check (btrim(app) <> ''),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint push_tokens_exactly_one_owner check (
    num_nonnulls(profile_id, restaurant_id) = 1
  )
);

create table private.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id text references public.profiles(id) on delete set null,
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp()
);

create table migration.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_project text not null check (btrim(source_project) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  status migration.import_status not null default 'pending',
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint import_run_completion_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table migration.firestore_documents (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  collection_path text not null check (btrim(collection_path) <> ''),
  document_id text not null check (btrim(document_id) <> ''),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source_updated_at timestamptz,
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (run_id, collection_path, document_id)
);

create table migration.import_rejections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  collection_path text not null check (btrim(collection_path) <> ''),
  document_id text not null check (btrim(document_id) <> ''),
  reason_code text not null check (btrim(reason_code) <> ''),
  reason_details jsonb not null default '{}'::jsonb check (jsonb_typeof(reason_details) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (run_id, collection_path, document_id, reason_code)
);

create index categories_restaurant_active_sort_idx
  on public.categories(restaurant_id, is_active, sort_order);
create index menu_items_restaurant_category_active_sort_idx
  on public.menu_items(restaurant_id, category_id, is_active, sort_order);
create index addresses_profile_created_idx
  on public.addresses(profile_id, created_at desc);
create index favorites_restaurant_idx
  on public.favorites(restaurant_id, created_at desc);
create index orders_profile_created_idx
  on public.orders(profile_id, created_at desc);
create index orders_restaurant_status_created_idx
  on public.orders(restaurant_id, status, created_at desc);
create index orders_courier_status_created_idx
  on public.orders(courier_profile_id, status, created_at desc)
  where courier_profile_id is not null;
create index order_items_order_idx on public.order_items(order_id);
create index order_items_menu_item_idx on public.order_items(menu_item_id)
  where menu_item_id is not null;
create index product_reviews_menu_status_created_idx
  on public.product_reviews(menu_item_id, status, created_at desc);
create index product_reviews_restaurant_status_created_idx
  on public.product_reviews(restaurant_id, status, created_at desc);
create index product_reviews_profile_created_idx
  on public.product_reviews(profile_id, created_at desc);
create index order_reviews_restaurant_status_created_idx
  on public.order_reviews(restaurant_id, status, created_at desc);
create index order_reviews_profile_created_idx
  on public.order_reviews(profile_id, created_at desc);
create index user_roles_role_idx on private.user_roles(role, profile_id);
create index restaurant_members_profile_idx on private.restaurant_members(profile_id, restaurant_id);
create index order_status_history_order_created_idx
  on private.order_status_history(order_id, created_at desc);
create index push_tokens_profile_idx on private.push_tokens(profile_id)
  where profile_id is not null;
create index push_tokens_restaurant_idx on private.push_tokens(restaurant_id)
  where restaurant_id is not null;
create index audit_log_actor_created_idx on private.audit_log(actor_profile_id, created_at desc);
create index audit_log_target_created_idx on private.audit_log(target_type, target_id, created_at desc);
create index firestore_documents_collection_idx
  on migration.firestore_documents(run_id, collection_path);
create index import_rejections_run_idx
  on migration.import_rejections(run_id, collection_path);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger restaurants_set_updated_at before update on public.restaurants
  for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger menu_items_set_updated_at before update on public.menu_items
  for each row execute function private.set_updated_at();
create trigger addresses_set_updated_at before update on public.addresses
  for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger product_reviews_set_updated_at before update on public.product_reviews
  for each row execute function private.set_updated_at();
create trigger order_reviews_set_updated_at before update on public.order_reviews
  for each row execute function private.set_updated_at();
create trigger restaurant_members_set_updated_at before update on private.restaurant_members
  for each row execute function private.set_updated_at();
create trigger push_tokens_set_updated_at before update on private.push_tokens
  for each row execute function private.set_updated_at();
create trigger import_runs_set_updated_at before update on migration.import_runs
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.addresses enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.product_reviews enable row level security;
alter table public.order_reviews enable row level security;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke all on all tables in schema migration from public, anon, authenticated;
revoke all on all sequences in schema migration from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema migration revoke all on tables from public, anon, authenticated;
alter default privileges in schema migration revoke all on sequences from public, anon, authenticated;
