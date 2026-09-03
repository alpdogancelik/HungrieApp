-- Milestone 3: identity bridge, protected order contacts, least-privilege grants,
-- RLS policies, and curated read interfaces.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hungrie_api_owner') then
    create role hungrie_api_owner nologin noinherit nobypassrls;
  end if;
end
$$;

-- Supabase migrations execute as a managed administrative role. Membership is
-- needed only so migrations can assign ownership to the non-login role.
grant hungrie_api_owner to postgres;

grant usage, create on schema public, private to hungrie_api_owner;

create table private.restaurant_couriers (
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  profile_id text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (restaurant_id, profile_id)
);

create index restaurant_couriers_profile_idx
  on private.restaurant_couriers(profile_id, restaurant_id);

create table private.order_contacts (
  order_id text primary key references public.orders(id) on delete restrict,
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_email text,
  customer_whatsapp text,
  delivery_address_snapshot jsonb not null
    check (jsonb_typeof(delivery_address_snapshot) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

insert into private.order_contacts (
  order_id, customer_name, customer_email, customer_whatsapp,
  delivery_address_snapshot, created_at, updated_at
)
select
  id, customer_name, customer_email, customer_whatsapp,
  delivery_address_snapshot, created_at, updated_at
from public.orders;

alter table public.orders
  drop column customer_name,
  drop column customer_email,
  drop column customer_whatsapp,
  drop column delivery_address_snapshot;

create trigger order_contacts_set_updated_at
before update on private.order_contacts
for each row execute function private.set_updated_at();

revoke all on table private.restaurant_couriers, private.order_contacts
  from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema migration
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema migration
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema migration
  revoke execute on functions from public, anon, authenticated;

create or replace function private.request_jwt()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function private.jwt_is_authenticated()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(private.request_jwt() ->> 'role', '') = 'authenticated'
$$;

create or replace function private.firebase_subject()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when private.jwt_is_authenticated()
      and private.request_jwt() ->> 'iss' = 'https://securetoken.google.com/hungrieapp-a2288'
      and private.request_jwt() ->> 'aud' = 'hungrieapp-a2288'
      and btrim(coalesce(private.request_jwt() ->> 'sub', '')) <> ''
    then private.request_jwt() ->> 'sub'
    else null
  end
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
begin
  if not private.jwt_is_authenticated() then
    return null;
  end if;

  subject := claims ->> 'sub';
  if btrim(coalesce(subject, '')) = '' then
    return null;
  end if;

  if claims ->> 'iss' = 'https://securetoken.google.com/hungrieapp-a2288' then
    if claims ->> 'aud' <> 'hungrieapp-a2288' then
      return null;
    end if;
    select p.id into result
      from public.profiles p
      where p.firebase_uid = subject;
    return result;
  end if;

  if subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select p.id into result
      from public.profiles p
      where p.supabase_user_id = subject::uuid;
  end if;
  return result;
end
$$;

create or replace function private.has_platform_role(required_role public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.user_roles ur
    where ur.profile_id = private.current_profile_id()
      and ur.role = required_role
  )
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_platform_role('admin'::public.platform_role)
      or private.has_platform_role('super_admin'::public.platform_role)
$$;

create or replace function private.is_restaurant_member(target_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.restaurant_members rm
    where rm.restaurant_id = target_restaurant_id
      and rm.profile_id = private.current_profile_id()
  )
$$;

create or replace function private.is_restaurant_owner(target_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.restaurant_members rm
    where rm.restaurant_id = target_restaurant_id
      and rm.profile_id = private.current_profile_id()
      and rm.role = 'owner'::public.restaurant_role
  )
$$;

create or replace function private.is_restaurant_courier(target_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_platform_role('courier'::public.platform_role)
     and exists (
       select 1 from private.restaurant_couriers rc
       where rc.restaurant_id = target_restaurant_id
         and rc.profile_id = private.current_profile_id()
     )
$$;

create or replace function private.can_access_order(target_order_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = target_order_id
      and (
        o.profile_id = private.current_profile_id()
        or private.is_restaurant_member(o.restaurant_id)
        or o.courier_profile_id = private.current_profile_id()
        or private.is_admin()
      )
  )
$$;

revoke all on function private.request_jwt() from public, anon;
revoke all on function private.jwt_is_authenticated() from public, anon;
revoke all on function private.firebase_subject() from public, anon;
revoke all on function private.current_profile_id() from public, anon;
revoke all on function private.has_platform_role(public.platform_role) from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_restaurant_member(text) from public, anon;
revoke all on function private.is_restaurant_owner(text) from public, anon;
revoke all on function private.is_restaurant_courier(text) from public, anon;
revoke all on function private.can_access_order(text) from public, anon;

grant execute on function private.request_jwt() to authenticated;
grant execute on function private.jwt_is_authenticated() to authenticated;
grant execute on function private.firebase_subject() to authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.has_platform_role(public.platform_role) to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_restaurant_member(text) to authenticated;
grant execute on function private.is_restaurant_owner(text) to authenticated;
grant execute on function private.is_restaurant_courier(text) to authenticated;
grant execute on function private.can_access_order(text) to authenticated;
grant execute on function private.request_jwt(), private.jwt_is_authenticated(), private.firebase_subject()
  to hungrie_api_owner;

grant select on public.profiles to hungrie_api_owner;
grant select on private.user_roles, private.restaurant_members, private.restaurant_couriers
  to hungrie_api_owner;

alter function private.current_profile_id() owner to hungrie_api_owner;
alter function private.has_platform_role(public.platform_role) owner to hungrie_api_owner;
alter function private.is_admin() owner to hungrie_api_owner;
alter function private.is_restaurant_member(text) owner to hungrie_api_owner;
alter function private.is_restaurant_owner(text) owner to hungrie_api_owner;
alter function private.is_restaurant_courier(text) owner to hungrie_api_owner;
alter function private.can_access_order(text) owner to hungrie_api_owner;

-- All public tables remain RLS protected. The function owner receives explicit
-- policies instead of BYPASSRLS so its reach is visible and testable.
alter table public.profiles force row level security;
alter table public.restaurants force row level security;
alter table public.categories force row level security;
alter table public.menu_items force row level security;
alter table public.addresses force row level security;
alter table public.favorites force row level security;
alter table public.orders force row level security;
alter table public.order_items force row level security;
alter table public.product_reviews force row level security;
alter table public.order_reviews force row level security;

create policy profiles_api_owner on public.profiles for all to hungrie_api_owner
  using (true) with check (true);
create policy restaurants_api_owner on public.restaurants for all to hungrie_api_owner
  using (true) with check (true);
create policy categories_api_owner on public.categories for all to hungrie_api_owner
  using (true) with check (true);
create policy menu_items_api_owner on public.menu_items for all to hungrie_api_owner
  using (true) with check (true);
create policy addresses_api_owner on public.addresses for all to hungrie_api_owner
  using (true) with check (true);
create policy favorites_api_owner on public.favorites for all to hungrie_api_owner
  using (true) with check (true);
create policy orders_api_owner on public.orders for all to hungrie_api_owner
  using (true) with check (true);
create policy order_items_api_owner on public.order_items for all to hungrie_api_owner
  using (true) with check (true);
create policy product_reviews_api_owner on public.product_reviews for all to hungrie_api_owner
  using (true) with check (true);
create policy order_reviews_api_owner on public.order_reviews for all to hungrie_api_owner
  using (true) with check (true);

create policy profiles_self_select on public.profiles for select to authenticated
  using (id = private.current_profile_id() or private.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = private.current_profile_id())
  with check (id = private.current_profile_id());

create policy restaurants_public_select on public.restaurants for select to anon, authenticated
  using (is_active);
create policy restaurants_member_select on public.restaurants for select to authenticated
  using (private.is_restaurant_member(id) or private.is_admin());

create policy categories_public_select on public.categories for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.restaurants r
      where r.id = categories.restaurant_id and r.is_active
    )
  );
create policy categories_member_select on public.categories for select to authenticated
  using (private.is_restaurant_member(restaurant_id) or private.is_admin());

create policy menu_items_public_select on public.menu_items for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.categories c
      join public.restaurants r on r.id = c.restaurant_id
      where c.id = menu_items.category_id
        and c.restaurant_id = menu_items.restaurant_id
        and c.is_active and r.is_active
    )
  );
create policy menu_items_member_select on public.menu_items for select to authenticated
  using (private.is_restaurant_member(restaurant_id) or private.is_admin());

create policy addresses_self_all on public.addresses for all to authenticated
  using (profile_id = private.current_profile_id())
  with check (profile_id = private.current_profile_id());
create policy favorites_self_all on public.favorites for all to authenticated
  using (profile_id = private.current_profile_id())
  with check (profile_id = private.current_profile_id());

create policy orders_authorized_select on public.orders for select to authenticated
  using (
    profile_id = private.current_profile_id()
    or private.is_restaurant_member(restaurant_id)
    or courier_profile_id = private.current_profile_id()
    or private.is_admin()
  );

create policy order_items_authorized_select on public.order_items for select to authenticated
  using (private.can_access_order(order_id));

create policy product_reviews_published_select on public.product_reviews for select to anon, authenticated
  using (status = 'published'::public.review_status);
create policy product_reviews_authorized_select on public.product_reviews for select to authenticated
  using (
    profile_id = private.current_profile_id()
    or private.is_restaurant_member(restaurant_id)
    or private.is_admin()
  );
create policy order_reviews_published_select on public.order_reviews for select to anon, authenticated
  using (status = 'published'::public.review_status);
create policy order_reviews_authorized_select on public.order_reviews for select to authenticated
  using (
    profile_id = private.current_profile_id()
    or private.is_restaurant_member(restaurant_id)
    or private.is_admin()
  );

grant usage on schema public to anon, authenticated;
grant select (
  id, name, description, cuisine, image_url, is_active,
  delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
  minimum_order_kurus, opening_hours, preferred_language,
  rating_average, rating_count, created_at, updated_at
) on public.restaurants to anon, authenticated;
grant select (id, restaurant_id, name, description, icon, is_active, sort_order, created_at, updated_at)
  on public.categories to anon, authenticated;
grant select (
  id, restaurant_id, category_id, name, description, image_url, price_kurus,
  is_active, sort_order, eta_minutes, calories, protein_grams,
  rating_average, rating_count, customizations, created_at, updated_at
) on public.menu_items to anon, authenticated;

grant select (
  id, restaurant_id, menu_item_id, user_name_snapshot, menu_item_name_snapshot,
  rating, comment, status, reply, replied_at, created_at, updated_at
) on public.product_reviews to anon, authenticated;
grant select (
  id, restaurant_id, user_name_snapshot, restaurant_name_snapshot,
  speed_rating, taste_rating, value_rating, price_performance_rating,
  average_rating, comment, items_snapshot, status, created_at, updated_at
) on public.order_reviews to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (name, avatar_url, whatsapp_number, preferred_language)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select (
  id, restaurant_id, status, payment_method, subtotal_kurus,
  delivery_fee_kurus, service_fee_kurus, discount_kurus, tip_kurus,
  total_kurus, eta_minutes, approval_deadline_at, reminder_pending,
  reminder_requested_at, preparing_at, ready_at, out_for_delivery_at,
  delivered_at, canceled_at, created_at, updated_at
) on public.orders to authenticated;
grant select on public.order_items to authenticated;

create view public.active_restaurants
with (security_invoker = true, security_barrier = true)
as
select
  id, name, description, cuisine, image_url,
  delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
  minimum_order_kurus, opening_hours, preferred_language,
  rating_average, rating_count, created_at, updated_at
from public.restaurants
where is_active;

create view public.active_categories
with (security_invoker = true, security_barrier = true)
as
select c.id, c.restaurant_id, c.name, c.description, c.icon, c.sort_order,
       c.created_at, c.updated_at
from public.categories c
join public.restaurants r on r.id = c.restaurant_id
where c.is_active and r.is_active;

create view public.active_menu_items
with (security_invoker = true, security_barrier = true)
as
select
  m.id, m.restaurant_id, m.category_id, m.name, m.description, m.image_url,
  m.price_kurus, m.sort_order, m.eta_minutes, m.calories, m.protein_grams,
  m.rating_average, m.rating_count, m.customizations, m.created_at, m.updated_at
from public.menu_items m
join public.categories c on c.id = m.category_id and c.restaurant_id = m.restaurant_id
join public.restaurants r on r.id = m.restaurant_id
where m.is_active and c.is_active and r.is_active;

create view public.published_product_reviews
with (security_invoker = true, security_barrier = true)
as
select
  id, restaurant_id, menu_item_id, user_name_snapshot, menu_item_name_snapshot,
  rating, comment, reply, replied_at, created_at, updated_at
from public.product_reviews
where status = 'published'::public.review_status;

create view public.published_order_reviews
with (security_invoker = true, security_barrier = true)
as
select
  id, restaurant_id, user_name_snapshot, restaurant_name_snapshot,
  speed_rating, taste_rating, value_rating, price_performance_rating,
  average_rating, comment, items_snapshot, created_at, updated_at
from public.order_reviews
where status = 'published'::public.review_status;

grant select on public.active_restaurants, public.active_categories,
  public.active_menu_items, public.published_product_reviews,
  public.published_order_reviews to anon, authenticated;

-- Definer views expose protected order contacts only after applying their own
-- caller predicate. No client role receives access to private.order_contacts.
create view public.my_orders
with (security_barrier = true)
as
select o.*, c.customer_name, c.customer_email, c.customer_whatsapp,
       c.delivery_address_snapshot
from public.orders o
join private.order_contacts c on c.order_id = o.id
where o.profile_id = private.current_profile_id();

create view public.restaurant_orders
with (security_barrier = true)
as
select o.*,
  case when o.status in ('delivered', 'canceled') then null else c.customer_name end as customer_name,
  case when o.status in ('delivered', 'canceled') then null else c.customer_email end as customer_email,
  case when o.status in ('delivered', 'canceled') then null else c.customer_whatsapp end as customer_whatsapp,
  case when o.status in ('delivered', 'canceled') then null else c.delivery_address_snapshot end as delivery_address_snapshot
from public.orders o
join private.order_contacts c on c.order_id = o.id
where private.is_restaurant_member(o.restaurant_id);

create view public.courier_available_orders
with (security_barrier = true)
as
select o.id, o.restaurant_id, o.status, o.eta_minutes, o.created_at, o.updated_at
from public.orders o
where o.status = 'ready'::public.order_status
  and o.courier_profile_id is null
  and private.is_restaurant_courier(o.restaurant_id);

create view public.courier_assigned_orders
with (security_barrier = true)
as
select o.*,
  case when o.status in ('delivered', 'canceled') then null else c.customer_name end as customer_name,
  case when o.status in ('delivered', 'canceled') then null else c.customer_email end as customer_email,
  case when o.status in ('delivered', 'canceled') then null else c.customer_whatsapp end as customer_whatsapp,
  case when o.status in ('delivered', 'canceled') then null else c.delivery_address_snapshot end as delivery_address_snapshot
from public.orders o
join private.order_contacts c on c.order_id = o.id
where o.courier_profile_id = private.current_profile_id();

create view public.admin_orders
with (security_barrier = true)
as
select o.*, c.customer_name, c.customer_email, c.customer_whatsapp,
       c.delivery_address_snapshot
from public.orders o
join private.order_contacts c on c.order_id = o.id
where private.is_admin();

create view public.my_restaurant_memberships
with (security_barrier = true)
as
select rm.restaurant_id, rm.role, rm.created_at, rm.updated_at
from private.restaurant_members rm
where rm.profile_id = private.current_profile_id();

alter view public.my_orders owner to hungrie_api_owner;
alter view public.restaurant_orders owner to hungrie_api_owner;
alter view public.courier_available_orders owner to hungrie_api_owner;
alter view public.courier_assigned_orders owner to hungrie_api_owner;
alter view public.admin_orders owner to hungrie_api_owner;
alter view public.my_restaurant_memberships owner to hungrie_api_owner;

grant select on public.orders, private.order_contacts, private.restaurant_members
  to hungrie_api_owner;
grant select on public.my_orders, public.restaurant_orders,
  public.courier_available_orders, public.courier_assigned_orders,
  public.admin_orders, public.my_restaurant_memberships to authenticated;

drop function public.migration_auth_probe();

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all tables in schema migration from public, anon, authenticated;
