-- Customer catalog cards need the Restaurant panel's manual acceptance state.
-- The view continues to expose active Restaurants only; pausing order acceptance
-- changes presentation and order eligibility without hiding the Restaurant.

grant select (accepting_orders) on public.restaurants to anon, authenticated;

create or replace view public.active_restaurants
with (security_invoker = true, security_barrier = true)
as
select
  id, name, description, cuisine, image_url,
  delivery_eta_min_minutes, delivery_eta_max_minutes, delivery_fee_kurus,
  minimum_order_kurus, opening_hours, preferred_language,
  rating_average, rating_count, created_at, updated_at, sort_order,
  accepting_orders
from public.restaurants
where is_active;
