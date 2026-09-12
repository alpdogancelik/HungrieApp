-- Keep restaurant review management useful without exposing customer profile or
-- order identifiers that are unnecessary for moderation.

grant create on schema public to hungrie_api_owner;

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
    select r.id, r.restaurant_id, r.menu_item_id, r.user_name_snapshot,
      r.menu_item_name_snapshot, r.rating, r.comment, r.status, r.reply,
      r.replied_at, r.created_at, r.updated_at
    from public.product_reviews r
    where r.restaurant_id = p_restaurant_id order by r.created_at desc
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
    select r.id, r.restaurant_id, r.user_name_snapshot,
      r.restaurant_name_snapshot, r.speed_rating, r.taste_rating,
      r.value_rating, r.price_performance_rating, r.average_rating,
      r.comment, r.items_snapshot, r.status, r.created_at, r.updated_at
    from public.order_reviews r
    where r.restaurant_id = p_restaurant_id order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x), '[]'::jsonb);
end
$$;

alter function public.list_restaurant_product_reviews(text, integer) owner to hungrie_api_owner;
alter function public.list_restaurant_order_reviews(text, integer) owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

revoke all on function public.list_restaurant_product_reviews(text, integer),
  public.list_restaurant_order_reviews(text, integer) from public, anon;
grant execute on function public.list_restaurant_product_reviews(text, integer),
  public.list_restaurant_order_reviews(text, integer) to authenticated;
