-- Temporarily disable delivery charges for newly quoted and created orders.
-- Restaurant delivery-fee configuration is retained for a future controlled
-- reactivation, and historical order totals remain immutable.

create or replace function private.build_order_quote(
  p_restaurant_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_line jsonb;
  v_menu public.menu_items%rowtype;
  v_custom_ids jsonb;
  v_custom_id text;
  v_custom jsonb;
  v_custom_total bigint;
  v_quantity integer;
  v_subtotal bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Order items must be an array containing 1 to 50 lines'
      using errcode = '22023';
  end if;

  select * into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id and r.is_active;
  if not found then
    raise exception 'Restaurant is unavailable' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_line) <> 'object'
       or btrim(coalesce(v_line ->> 'menu_item_id', '')) = ''
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Each order line requires a menu_item_id and integer quantity'
        using errcode = '22023';
    end if;
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Order item quantity must be between 1 and 99'
        using errcode = '22023';
    end if;

    v_custom_ids := coalesce(v_line -> 'customization_ids', '[]'::jsonb);
    if jsonb_typeof(v_custom_ids) <> 'array'
       or exists (
         select 1 from jsonb_array_elements(v_custom_ids) x
         where jsonb_typeof(x) <> 'string'
       )
       or (select count(*) <> count(distinct value #>> '{}') from jsonb_array_elements(v_custom_ids)) then
      raise exception 'customization_ids must be an array of unique strings'
        using errcode = '22023';
    end if;

    select m.* into v_menu
    from public.menu_items m
    join public.categories c
      on c.id = m.category_id and c.restaurant_id = m.restaurant_id
    where m.id = v_line ->> 'menu_item_id'
      and m.restaurant_id = p_restaurant_id
      and m.is_active and c.is_active;
    if not found then
      raise exception 'Menu item is unavailable for this restaurant'
        using errcode = '22023';
    end if;
    if not private.valid_customizations(v_menu.customizations) then
      raise exception 'Menu item has an invalid customization definition'
        using errcode = '22023';
    end if;

    v_custom_total := 0;
    v_custom := '[]'::jsonb;
    for v_custom_id in
      select value #>> '{}' from jsonb_array_elements(v_custom_ids)
    loop
      select option into v_line
      from jsonb_array_elements(v_menu.customizations) option
      where option ->> 'id' = v_custom_id;
      if not found then
        raise exception 'Unknown customization for menu item'
          using errcode = '22023';
      end if;
      v_custom_total := v_custom_total + (v_line ->> 'price_kurus')::bigint;
      v_custom := v_custom || jsonb_build_array(v_line);
    end loop;

    v_subtotal := v_subtotal + ((v_menu.price_kurus + v_custom_total) * v_quantity);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_menu.id,
      'name', v_menu.name,
      'image_url', v_menu.image_url,
      'unit_price_kurus', v_menu.price_kurus,
      'customization_total_kurus', v_custom_total,
      'quantity', v_quantity,
      'customizations', v_custom
    ));
  end loop;

  if v_subtotal < v_restaurant.minimum_order_kurus then
    raise exception 'Order does not meet the restaurant minimum'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'restaurant_id', v_restaurant.id,
    'items', v_items,
    'subtotal_kurus', v_subtotal,
    'delivery_fee_kurus', 0,
    'service_fee_kurus', 0,
    'discount_kurus', 0,
    'tip_kurus', 0,
    'total_kurus', v_subtotal
  );
end
$$;

alter function private.build_order_quote(text, jsonb) owner to hungrie_api_owner;
