-- Milestone 4 repository support. These narrow RPCs expose only caller-scoped
-- records that cannot safely be selected from column-restricted base tables.

grant create on schema public to hungrie_api_owner;

create or replace function public.get_restaurant_management_details(p_restaurant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_result jsonb;
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', r.id, 'name', r.name, 'image_url', r.image_url,
    'address', r.address, 'cuisine', r.cuisine,
    'description', r.description, 'is_active', r.is_active,
    'preferred_language', r.preferred_language
  ) into v_result
  from public.restaurants r where r.id = p_restaurant_id;
  if v_result is null then
    raise exception 'Restaurant not found' using errcode = '22023';
  end if;
  return v_result;
end
$$;

create or replace function public.list_restaurant_couriers(p_restaurant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
begin
  if not private.is_restaurant_owner(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant owner access required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
    from private.restaurant_couriers rc
    join public.profiles p on p.id = rc.profile_id
    where rc.restaurant_id = p_restaurant_id
  ), '[]'::jsonb);
end
$$;

create or replace function public.list_my_product_reviews(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id, r.restaurant_id, r.menu_item_id, r.user_name_snapshot,
      r.menu_item_name_snapshot, r.rating, r.comment, r.status, r.reply,
      r.replied_at, r.created_at, r.updated_at
    from public.product_reviews r
    where r.profile_id = v_actor order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x), '[]'::jsonb);
end
$$;

create or replace function public.list_restaurant_product_reviews(p_restaurant_id text, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile();
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select * from public.product_reviews r
    where r.restaurant_id = p_restaurant_id order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x), '[]'::jsonb);
end
$$;

create or replace function public.get_my_product_review(p_review_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile(); v_result jsonb;
begin
  select to_jsonb(r) into v_result from public.product_reviews r
  where r.id = p_review_id and r.profile_id = v_actor;
  if v_result is null then raise exception 'Review not found' using errcode = '42501'; end if;
  return v_result;
end
$$;

create or replace function public.list_my_order_reviews(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id, r.restaurant_id, r.user_name_snapshot,
      r.restaurant_name_snapshot, r.speed_rating, r.taste_rating,
      r.value_rating, r.price_performance_rating, r.average_rating,
      r.comment, r.items_snapshot, r.status, r.created_at, r.updated_at
    from public.order_reviews r
    where r.profile_id = v_actor order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x), '[]'::jsonb);
end
$$;

create or replace function public.list_restaurant_order_reviews(p_restaurant_id text, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile();
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select * from public.order_reviews r
    where r.restaurant_id = p_restaurant_id order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x), '[]'::jsonb);
end
$$;

create or replace function public.get_my_order_review(p_review_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile(); v_result jsonb;
begin
  select to_jsonb(r) into v_result from public.order_reviews r
  where r.id = p_review_id and r.profile_id = v_actor;
  if v_result is null then raise exception 'Review not found' using errcode = '42501'; end if;
  return v_result;
end
$$;

create or replace function public.get_my_order_review_by_order(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile(); v_result jsonb;
begin
  select to_jsonb(r) into v_result from public.order_reviews r
  where r.order_id = p_order_id and r.profile_id = v_actor;
  return v_result;
end
$$;

revoke all on function public.get_restaurant_management_details(text),
  public.list_restaurant_couriers(text), public.list_my_product_reviews(integer),
  public.list_restaurant_product_reviews(text, integer), public.get_my_product_review(text),
  public.list_my_order_reviews(integer), public.list_restaurant_order_reviews(text, integer),
  public.get_my_order_review(text), public.get_my_order_review_by_order(text)
from public, anon;

grant execute on function public.get_restaurant_management_details(text),
  public.list_restaurant_couriers(text), public.list_my_product_reviews(integer),
  public.list_restaurant_product_reviews(text, integer), public.get_my_product_review(text),
  public.list_my_order_reviews(integer), public.list_restaurant_order_reviews(text, integer),
  public.get_my_order_review(text), public.get_my_order_review_by_order(text)
to authenticated;

alter function public.get_restaurant_management_details(text) owner to hungrie_api_owner;
alter function public.list_restaurant_couriers(text) owner to hungrie_api_owner;
alter function public.list_my_product_reviews(integer) owner to hungrie_api_owner;
alter function public.list_restaurant_product_reviews(text, integer) owner to hungrie_api_owner;
alter function public.get_my_product_review(text) owner to hungrie_api_owner;
alter function public.list_my_order_reviews(integer) owner to hungrie_api_owner;
alter function public.list_restaurant_order_reviews(text, integer) owner to hungrie_api_owner;
alter function public.get_my_order_review(text) owner to hungrie_api_owner;
alter function public.get_my_order_review_by_order(text) owner to hungrie_api_owner;

revoke create on schema public from hungrie_api_owner;
