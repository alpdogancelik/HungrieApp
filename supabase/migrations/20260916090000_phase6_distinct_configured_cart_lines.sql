-- Allow one menu item to appear in multiple cart lines when each line has a
-- distinct, server-validated option/removal configuration.

create or replace function private.build_order_quote_v2(p_restaurant_id text,p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant public.restaurants%rowtype;v_request jsonb;v_menu public.menu_items%rowtype;
  v_quantity integer;v_option_ids text[];v_removed_ids text[];v_unknown text[];v_group record;
  v_selected integer;v_delta bigint;v_subtotal bigint:=0;v_lines jsonb:='[]';v_snapshot jsonb;
  v_signature text;v_seen_signatures text[]:=array[]::text[];
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception 'One to 100 order items are required' using errcode='22023';end if;
  select * into v_restaurant from public.restaurants where id=p_restaurant_id and lifecycle_status='active' and accepting_orders;
  if not found then raise exception 'Restaurant is not accepting orders' using errcode='22023';end if;
  for v_request in select value from jsonb_array_elements(p_items)loop
    select array_agg(key)into v_unknown from jsonb_object_keys(v_request)key
      where key not in('menuItemId','quantity','optionValueIds','removedIngredientIds');
    if v_unknown is not null or jsonb_typeof(v_request)<>'object' or coalesce(v_request->>'quantity','')!~'^[1-9][0-9]*$'
      or jsonb_typeof(coalesce(v_request->'optionValueIds','[]'))<>'array'
      or jsonb_typeof(coalesce(v_request->'removedIngredientIds','[]'))<>'array' then
      raise exception 'Order items accept IDs and quantities only' using errcode='22023';end if;
    v_quantity:=(v_request->>'quantity')::integer;if v_quantity>99 then raise exception 'Invalid item quantity' using errcode='22023';end if;
    select * into v_menu from public.menu_items where id=v_request->>'menuItemId' and restaurant_id=p_restaurant_id and is_active;
    if not found then raise exception 'Menu item unavailable' using errcode='22023';end if;
    select coalesce(array_agg(value order by value),array[]::text[])into v_option_ids from jsonb_array_elements_text(coalesce(v_request->'optionValueIds','[]'));
    select coalesce(array_agg(value order by value),array[]::text[])into v_removed_ids from jsonb_array_elements_text(coalesce(v_request->'removedIngredientIds','[]'));
    if cardinality(v_option_ids)<>(select count(distinct x)from unnest(v_option_ids)x)
      or cardinality(v_removed_ids)<>(select count(distinct x)from unnest(v_removed_ids)x)then
      raise exception 'Duplicate selections are not allowed' using errcode='22023';end if;
    v_signature:=jsonb_build_object('menuItemId',v_menu.id,'optionValueIds',to_jsonb(v_option_ids),
      'removedIngredientIds',to_jsonb(v_removed_ids))::text;
    if v_signature=any(v_seen_signatures)then
      raise exception 'Duplicate configured menu lines are not allowed' using errcode='22023';end if;
    v_seen_signatures:=array_append(v_seen_signatures,v_signature);
    if exists(select 1 from unnest(v_option_ids)x left join public.menu_option_values o on o.id=x and o.restaurant_id=p_restaurant_id and o.is_active
      left join public.menu_option_groups g on g.id=o.group_id and g.menu_item_id=v_menu.id and g.is_active where g.id is null)then
      raise exception 'Invalid menu option selection' using errcode='22023';end if;
    if exists(select 1 from unnest(v_removed_ids)x left join public.menu_item_ingredients i on i.id=x and i.menu_item_id=v_menu.id and i.restaurant_id=p_restaurant_id and i.is_active and i.removable where i.id is null)then
      raise exception 'Ingredient cannot be removed' using errcode='22023';end if;
    for v_group in select id,name,kind,minimum_selections,maximum_selections from public.menu_option_groups
      where menu_item_id=v_menu.id and restaurant_id=p_restaurant_id and is_active loop
      select count(*)into v_selected from public.menu_option_values where group_id=v_group.id and id=any(v_option_ids)and is_active;
      if v_selected<v_group.minimum_selections or v_selected>v_group.maximum_selections then
        raise exception 'Menu option selection count is invalid' using errcode='22023';end if;
    end loop;
    select coalesce(sum(price_delta_kurus),0)into v_delta from public.menu_option_values where id=any(v_option_ids);
    v_snapshot:=jsonb_build_object('menuDefinitionRevision',v_menu.definition_revision,
      'ingredients',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'removed',i.id=any(v_removed_ids))order by i.sort_order,i.id)
        from public.menu_item_ingredients i where i.menu_item_id=v_menu.id and i.is_active),'[]'),
      'optionGroups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind,
        'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'priceDeltaKurus',o.price_delta_kurus)order by o.sort_order,o.id)
          from public.menu_option_values o where o.group_id=g.id and o.id=any(v_option_ids)),'[]'))order by g.sort_order,g.id)
        from public.menu_option_groups g where g.menu_item_id=v_menu.id and g.is_active),'[]'));
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('menu_item_id',v_menu.id,'name',v_menu.name,'image_url',v_menu.image_url,
      'unit_price_kurus',v_menu.price_kurus,'customization_total_kurus',v_delta,'quantity',v_quantity,'customizations',jsonb_build_array(v_snapshot)));
    v_subtotal:=v_subtotal+((v_menu.price_kurus+v_delta)*v_quantity);
  end loop;
  if v_subtotal<v_restaurant.minimum_order_kurus then raise exception 'Minimum order amount not reached' using errcode='22023';end if;
  return jsonb_build_object('restaurant_id',p_restaurant_id,'items',v_lines,'subtotal_kurus',v_subtotal,
    'delivery_fee_kurus',v_restaurant.delivery_fee_kurus,'service_fee_kurus',0,'discount_kurus',0,'tip_kurus',0,
    'total_kurus',v_subtotal+v_restaurant.delivery_fee_kurus);
end $$;
