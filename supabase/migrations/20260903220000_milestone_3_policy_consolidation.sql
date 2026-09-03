-- Consolidate authenticated SELECT policies so each table evaluates one
-- permissive policy per API role/action.

drop policy restaurants_public_select on public.restaurants;
drop policy restaurants_member_select on public.restaurants;
create policy restaurants_anon_select on public.restaurants for select to anon
  using (is_active);
create policy restaurants_authenticated_select on public.restaurants for select to authenticated
  using (is_active or private.is_restaurant_member(id) or private.is_admin());

drop policy categories_public_select on public.categories;
drop policy categories_member_select on public.categories;
create policy categories_anon_select on public.categories for select to anon
  using (
    is_active and exists (
      select 1 from public.restaurants r where r.id = categories.restaurant_id and r.is_active
    )
  );
create policy categories_authenticated_select on public.categories for select to authenticated
  using (
    (
      is_active and exists (
        select 1 from public.restaurants r where r.id = categories.restaurant_id and r.is_active
      )
    )
    or private.is_restaurant_member(restaurant_id)
    or private.is_admin()
  );

drop policy menu_items_public_select on public.menu_items;
drop policy menu_items_member_select on public.menu_items;
create policy menu_items_anon_select on public.menu_items for select to anon
  using (
    is_active and exists (
      select 1 from public.categories c
      join public.restaurants r on r.id = c.restaurant_id
      where c.id = menu_items.category_id and c.restaurant_id = menu_items.restaurant_id
        and c.is_active and r.is_active
    )
  );
create policy menu_items_authenticated_select on public.menu_items for select to authenticated
  using (
    (
      is_active and exists (
        select 1 from public.categories c
        join public.restaurants r on r.id = c.restaurant_id
        where c.id = menu_items.category_id and c.restaurant_id = menu_items.restaurant_id
          and c.is_active and r.is_active
      )
    )
    or private.is_restaurant_member(restaurant_id)
    or private.is_admin()
  );

drop policy product_reviews_published_select on public.product_reviews;
drop policy product_reviews_authorized_select on public.product_reviews;
create policy product_reviews_anon_select on public.product_reviews for select to anon
  using (status = 'published'::public.review_status);
create policy product_reviews_authenticated_select on public.product_reviews for select to authenticated
  using (
    status = 'published'::public.review_status
    or profile_id = private.current_profile_id()
    or private.is_restaurant_member(restaurant_id)
    or private.is_admin()
  );

drop policy order_reviews_published_select on public.order_reviews;
drop policy order_reviews_authorized_select on public.order_reviews;
create policy order_reviews_anon_select on public.order_reviews for select to anon
  using (status = 'published'::public.review_status);
create policy order_reviews_authenticated_select on public.order_reviews for select to authenticated
  using (
    status = 'published'::public.review_status
    or profile_id = private.current_profile_id()
    or private.is_restaurant_member(restaurant_id)
    or private.is_admin()
  );

drop policy orders_authorized_select on public.orders;
drop policy orders_courier_available_select on public.orders;
create policy orders_authenticated_select on public.orders for select to authenticated
  using (
    profile_id = private.current_profile_id()
    or private.is_restaurant_member(restaurant_id)
    or courier_profile_id = private.current_profile_id()
    or private.is_admin()
    or (
      status = 'ready'::public.order_status and courier_profile_id is null
      and private.is_restaurant_courier(restaurant_id)
    )
  );
