begin;

create function public.list_my_customer_product_review_menu_items_v1(p_order_id text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_active_customer();
begin
  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.profile_id = v_actor
  ) then
    raise exception 'Customer order access required' using errcode = '42501';
  end if;

  return coalesce((
    select array_agg(distinct r.menu_item_id order by r.menu_item_id)
    from public.product_reviews r
    where r.order_id = p_order_id
      and r.profile_id = v_actor
  ), array[]::text[]);
end
$$;

grant create on schema public to hungrie_api_owner;
alter function public.list_my_customer_product_review_menu_items_v1(text) owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;
revoke all on function public.list_my_customer_product_review_menu_items_v1(text) from public, anon;
grant execute on function public.list_my_customer_product_review_menu_items_v1(text) to authenticated;

commit;
